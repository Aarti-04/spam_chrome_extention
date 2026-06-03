let user_signed_in = false;
//API URL
const SPAM_PREDICTION_API_URL = 'http://127.0.0.1:8000/model/predict/';
const ManageHistoryURL = 'http://127.0.0.1:8000/chromehistorystore/'; 

chrome.identity.onSignInChanged.addListener(function (account_id, signedIn) {
    user_signed_in = signedIn;
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.message === 'get_auth_token') {
        const interactive = request.interactive !== false;
        chrome.identity.getAuthToken({ interactive: interactive }, function (token) {
            if (chrome.runtime.lastError) {
                sendResponse({ error: chrome.runtime.lastError.message });
            } else {
                console.log("Token retrieved successfully");
                chrome.storage.local.set({ authToken: token, isAuthenticated: true }, () => {
                    sendResponse({ token });
                });
            }
        });
        return true;
    } else if (request.message === 'logout') {
        chrome.storage.local.get(['authToken'], function(result) {
            const token = result.authToken;
            // Clear local storage fields first
            chrome.storage.local.remove(['authToken', 'isAuthenticated', 'isSandbox'], () => {
                if (token) {
                    chrome.identity.removeCachedAuthToken({ token: token }, () => {
                        console.log("Token removed from Chrome identity cache.");
                        const revokeUrl = `https://accounts.google.com/o/oauth2/revoke?token=${token}`;
                        fetch(revokeUrl, { method: 'POST' })
                            .then(() => sendResponse({ success: true }))
                            .catch((error) => {
                                console.error('Error revoking token:', error);
                                sendResponse({ success: true });
                            });
                    });
                } else {
                    chrome.identity.getAuthToken({ interactive: false }, function(cachedToken) {
                        if (cachedToken) {
                            chrome.identity.removeCachedAuthToken({ token: cachedToken }, () => {
                                sendResponse({ success: true });
                            });
                        } else {
                            sendResponse({ success: true });
                        }
                    });
                }
            });
        });
        return true;
    } else if (request.message === 'get_emails') {
        getValidToken(function(token, err) {
            if (err) {
                sendResponse({ error: err });
                return;
            }
            fetchEmails(token, function(response) {
                if (response && response.error && (response.error.includes('401') || response.error.includes('unauthorized') || response.error.includes('status 401'))) {
                    handle401(token, function(newToken, refreshErr) {
                        if (newToken) {
                            fetchEmails(newToken, sendResponse);
                        } else {
                            sendResponse({ error: refreshErr || "Session expired. Please sign in again." });
                        }
                    });
                } else {
                    sendResponse(response);
                }
            });
        });
        return true;
    } else if (request.message === 'predict_spam') {
        predictSpam(request.emailContent, sendResponse);
        return true;
    } else if (request.message === "delete_email") {
        const email = request.email;
        const messageId = email.id; 
        
        getValidToken(function(token, err) {
            if (err) {
                sendResponse({ success: false, error: err });
                return;
            }
            trashEmail(messageId, token, function(response) {
                if (response && response.error && (response.error.includes('401') || response.error.includes('unauthorized') || response.error.includes('status 401'))) {
                    handle401(token, function(newToken, refreshErr) {
                        if (newToken) {
                            trashEmail(messageId, newToken, sendResponse);
                        } else {
                            sendResponse({ success: false, error: refreshErr || "Session expired. Please sign in again." });
                        }
                    });
                } else {
                    sendResponse(response);
                }
            });
        });
        return true;
    }
});

function getValidToken(callback) {
    chrome.storage.local.get(['authToken'], function (result) {
        let token = result.authToken;
        if (token) {
            callback(token, null);
        } else {
            chrome.identity.getAuthToken({ interactive: false }, function (newToken) {
                if (chrome.runtime.lastError || !newToken) {
                    callback(null, chrome.runtime.lastError ? chrome.runtime.lastError.message : "No token found");
                } else {
                    chrome.storage.local.set({ authToken: newToken }, () => {
                        callback(newToken, null);
                    });
                }
            });
        }
    });
}

function handle401(token, callback) {
    console.log("Got 401. Silently removing cached token and refreshing...");
    chrome.identity.removeCachedAuthToken({ token: token }, () => {
        chrome.storage.local.remove(['authToken'], () => {
            chrome.identity.getAuthToken({ interactive: false }, function (newToken) {
                if (chrome.runtime.lastError || !newToken) {
                    callback(null, chrome.runtime.lastError ? chrome.runtime.lastError.message : "Failed to silently refresh token");
                } else {
                    chrome.storage.local.set({ authToken: newToken }, () => {
                        callback(newToken, null);
                    });
                }
            });
        });
    });
}

function fetchEmails(token, callback) {
    const fetch_url = 'https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=50';
    const fetch_options = {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    };
    
    fetch(fetch_url, fetch_options)
        .then(response => {
            if (!response.ok) {
                return response.text().then(errText => {
                    throw new Error(`HTTP error ${response.status}: ${errText}`);
                });
            }
            return response.json();
        })
        .then(data => {
            if (data.messages && data.messages.length > 0) {
                const messagePromises = data.messages.map(async message => {
                    const detailResponse = await fetch(`https://www.googleapis.com/gmail/v1/users/me/messages/${message.id}`, fetch_options);
                    if (!detailResponse.ok) {
                        throw new Error(`HTTP error ${detailResponse.status} on details`);
                    }
                    return await detailResponse.json();
                });
                Promise.all(messagePromises)
                    .then(messages => {
                        callback({ messages });
                    })
                    .catch(err => {
                        callback({ error: err.message });
                    });
            } else {
                callback({ messages: [] });
            }
        })
        .catch(error => {
            console.error('Fetch emails error:', error);
            callback({ error: error.message || error });
        });
}

function trashEmail(messageId, token, callback) {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/trash`;
    fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(errText => {
                throw new Error(`HTTP error ${response.status}: ${errText}`);
            });
        }
        console.log("mail deleted.......");
        saveDeletedEmail(messageId);
        callback({ success: true });
    })
    .catch(error => {
        callback({ success: false, error: error.message || error });
    });
}

function predictSpam(emailContent, sendResponse) {
  console.log("predictSpam called..");
    const requestBody = {
        body: emailContent
    };

    fetch(SPAM_PREDICTION_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
    })
    .then(response => response.json())
    .then(data => {
        console.log("predict success:", data);
        sendResponse({ isSpam: data.is_spam, isFallback: false });
    })
    .catch(error => {
        console.warn("Backend offline or error occurred. Using local heuristic spam classifier fallback.", error);
        // Simple heuristic rules to detect spam for portfolio demo
        const snippet = (emailContent || '').toLowerCase();
        const spamKeywords = [
            'winner', 'winning', 'free', 'offer', 'lottery', 'cash', 'prize', 
            'viagra', 'casino', 'bitcoin', 'crypto', 'verify', 'urgent', 
            'congratulat', 'reward', 'gift card', 'act now'
        ];
        
        const isSpam = spamKeywords.some(keyword => snippet.includes(keyword));
        console.log(`Local classification: ${isSpam ? 'SPAM' : 'HAM'} (based on keywords)`);
        sendResponse({ isSpam: isSpam, isFallback: true });
    });
}
function saveDeletedEmail(emailId) {
  fetch(ManageHistoryURL, {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email_id: emailId })
  })
  .then(response => response.json())
  .then(data => {
      console.log('Email ID saved:', data);
  })
  .catch(error => {
      console.error('Error saving email ID:', error);
  });
}

  