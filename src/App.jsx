import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [emails, setEmails] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [scannedCount, setScannedCount] = useState(0);
  const [isFallbackUsed, setIsFallbackUsed] = useState(false);
  const [isSandbox, setIsSandbox] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // 1. Check local storage for persistent login status
    chrome.storage.local.get(['isAuthenticated', 'isSandbox'], (result) => {
      if (result && result.isAuthenticated) {
        setIsAuthenticated(true);
        if (result.isSandbox) {
          setIsSandbox(true);
        }
      } else {
        // 2. Fallback to silent identity token check if storage is empty
        chrome.runtime.sendMessage({ message: 'get_auth_token', interactive: false }, (response) => {
          if (response && response.token) {
            setIsAuthenticated(true);
            chrome.storage.local.set({ isAuthenticated: true, isSandbox: false });
          } else {
            setIsAuthenticated(false);
          }
        });
      }
    });
  }, []);

  const handleLogin = () => {
    setErrorMsg('');
    setStatusMessage('Signing in...');
    chrome.runtime.sendMessage({ message: 'get_auth_token', interactive: true }, (response) => {
      if (response && response.token) {
        setIsAuthenticated(true);
        setIsSandbox(false);
        chrome.storage.local.set({ isAuthenticated: true, isSandbox: false });
      } else {
        const errorDetail = response?.error?.message || response?.error || 'Authentication rejected';
        setErrorMsg(errorDetail);
        setStatusMessage('');
        console.error('Error logging in:', response?.error);
      }
    });
  };

  const handleSandboxLogin = () => {
    setErrorMsg('');
    setIsSandbox(true);
    setIsAuthenticated(true);
    setEmails([]);
    setNotifications([]);
    setScannedCount(0);
    setIsFallbackUsed(true);
    setStatusMessage('Ready in Sandbox Mode');
    chrome.storage.local.set({ isAuthenticated: true, isSandbox: true });
  };

  const handleLogout = () => {
    chrome.storage.local.set({ isAuthenticated: false, isSandbox: false });
    if (isSandbox) {
      setIsAuthenticated(false);
      setIsSandbox(false);
      setEmails([]);
      setNotifications([]);
      setScannedCount(0);
      setIsFallbackUsed(false);
      setStatusMessage('');
      setErrorMsg('');
      return;
    }

    chrome.runtime.sendMessage({ message: 'logout' }, (response) => {
      setIsAuthenticated(false);
      setEmails([]);
      setNotifications([]);
      setScannedCount(0);
      setIsFallbackUsed(false);
      setStatusMessage('');
      setErrorMsg('');
    });
  };

  const handleFetchEmails = () => {
    setIsLoading(true);
    setNotifications([]);
    setScannedCount(0);
    setIsFallbackUsed(isSandbox);
    setErrorMsg('');

    if (isSandbox) {
      setStatusMessage('Connecting to Gmail (Sandbox)...');
      
      const mockEmails = [
        { id: 'm1', snippet: 'Meeting rescheduled for 3:30 PM today in Conference Room B. Please review the updated slides.' },
        { id: 'm2', snippet: 'CONGRATULATIONS! You have been selected as the winner of our $1,000 Cash Prize voucher! Claim it now!' },
        { id: 'm3', snippet: 'Here is the weekly update regarding the product roadmap and upcoming features.' },
        { id: 'm4', snippet: 'URGENT: Verify your security details for your online banking account to avoid service lock.' },
        { id: 'm5', snippet: 'Claim free bitcoin reward! Get 50% guaranteed returns on your crypto wallet inside 24 hours.' }
      ];

      setTimeout(() => {
        const total = mockEmails.length;
        setEmails(mockEmails);
        setStatusMessage(`Scanning ${total} mock emails...`);

        let processedCount = 0;
        let spamCount = 0;

        mockEmails.forEach((email, index) => {
          setTimeout(() => {
            processedCount++;
            setScannedCount(processedCount);

            const snippet = email.snippet.toLowerCase();
            const spamKeywords = [
              'congratulations', 'winner', 'cash prize', 'reward', 'urgent', 
              'verify', 'free bitcoin', 'crypto', 'guaranteed'
            ];
            const isSpam = spamKeywords.some(keyword => snippet.includes(keyword));

            if (isSpam) {
              spamCount++;
              setNotifications((prev) => {
                if (prev.some(item => item.id === email.id)) return prev;
                return [...prev, { ...email, isFallback: true }];
              });
            }

            if (processedCount === total) {
              setIsLoading(false);
              setStatusMessage(`Finished. Scanned ${total} mock emails, trashed ${spamCount} spam.`);
            }
          }, (index + 1) * 600); // realistic delay for scanning experience
        });
      }, 800);

      return;
    }

    setStatusMessage('Connecting to Gmail...');
    chrome.runtime.sendMessage({ message: 'get_emails' }, (response) => {
      if (response && response.messages) {
        const total = response.messages.length;
        setEmails(response.messages);

        if (total === 0) {
          setIsLoading(false);
          setStatusMessage('No recent emails found in your inbox.');
          return;
        }

        setStatusMessage(`Scanning ${total} recent emails...`);
        let processedCount = 0;
        let spamCount = 0;

        response.messages.forEach((email) => {
          chrome.runtime.sendMessage({
            message: 'predict_spam',
            emailContent: email.snippet
          }, (predictResponse) => {
            processedCount++;
            setScannedCount(processedCount);

            if (predictResponse && predictResponse.isSpam) {
              spamCount++;
              if (predictResponse.isFallback) {
                setIsFallbackUsed(true);
              }
              
              // Add to spam notifications
              setNotifications((prev) => {
                if (prev.some(item => item.id === email.id)) return prev;
                return [...prev, { ...email, isFallback: predictResponse.isFallback }];
              });

              // Automatically move to trash
              chrome.runtime.sendMessage({
                message: 'delete_email',
                email: email
              }, (deleteResponse) => {
                if (deleteResponse && deleteResponse.success) {
                  console.log(`Successfully trashed spam email: ${email.id}`);
                } else {
                  console.warn(`Failed to trash email ${email.id}:`, deleteResponse?.error);
                }
              });
            }

            if (processedCount === total) {
              setIsLoading(false);
              setStatusMessage(`Finished. Scanned ${total} emails, trashed ${spamCount} spam.`);
            }
          });
        });
      } else {
        setIsLoading(false);
        const errorDetail = response?.error?.message || response?.error || 'Gmail fetch failed. Check permissions.';
        setErrorMsg(errorDetail);
        setStatusMessage('');
        console.error('Error loading emails:', response?.error);

        // If it's an authorization/token error, reset auth status
        const isAuthError = errorDetail.includes('credential') || 
                            errorDetail.includes('Auth') || 
                            errorDetail.includes('unauthorized') || 
                            errorDetail.includes('401') || 
                            errorDetail.includes('403') ||
                            errorDetail.includes('signed in') ||
                            errorDetail.includes('sign in') ||
                            errorDetail.includes('OAuth') ||
                            errorDetail.includes('token');
        if (isAuthError) {
          chrome.storage.local.set({ isAuthenticated: false, isSandbox: false });
          chrome.storage.local.remove(['authToken']);
          setIsAuthenticated(false);
        }
      }
    });
  };

  const handleShowEmail = (email) => {
    if (isSandbox) {
      alert(`[Demo Mode] In a production environment, this will open the deleted email (${email.id}) in your Gmail Trash folder.`);
      return;
    }
    const mailUrl = `https://mail.google.com/mail/u/0/#trash/${email.id}`;
    chrome.tabs.create({ url: mailUrl });
  };

  return (
    <div className="app-container">
      <div className="glow-accent"></div>
      <div className="glow-accent-bottom"></div>

      {isAuthenticated ? (
        <div className="dashboard-screen">
          {/* Header */}
          <header className="dashboard-header">
            <div className="brand-section">
              <svg className="app-icon-small" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="24" height="24" rx="6" fill="url(#gradient-small)" />
                <path d="M12 5.5L6 8V12C6 15.5 8.5 18.5 12 19.5C15.5 18.5 18 15.5 18 12V8L12 5.5Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9.5 11.5L11 13L14.5 9.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <defs>
                  <linearGradient id="gradient-small" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#6366f1" />
                    <stop offset="1" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="app-name-small">MailCleaner AI</span>
              {isSandbox ? (
                <span className="badge-demo" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', borderColor: 'rgba(99, 102, 241, 0.3)' }}>Sandbox</span>
              ) : (
                isFallbackUsed && <span className="badge-demo">Demo Mode</span>
              )}
            </div>
            
            <button className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </header>

          {/* Error Message if Any */}
          {errorMsg && <div className="alert-error">{errorMsg}</div>}

          {/* Stats Bar */}
          <section className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Scanned</div>
              <div className="stat-value highlight">{emails.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Spam Trashed</div>
              <div className="stat-value alert">{notifications.length}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Inbox Shield</div>
              <div className="stat-value success">
                {emails.length > 0 
                  ? `${Math.max(0, Math.round(((emails.length - notifications.length) / emails.length) * 100))}%`
                  : '100%'
                }
              </div>
            </div>
          </section>

          {/* Scanner Button Container */}
          <section className="scanner-container">
            <button 
              className="scan-main-btn" 
              onClick={handleFetchEmails} 
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <div className="spinner"></div>
                  <span>Scanning Inbox ({scannedCount}/{emails.length || '...'})</span>
                </>
              ) : (
                <>
                  <div className="pulse-icon"></div>
                  <span>Scan & Clean Inbox</span>
                </>
              )}
            </button>
            <div className="scan-status-text">
              {statusMessage || 'Ready to protect your inbox'}
            </div>
          </section>

          {/* Results List */}
          <section className="results-section">
            <h3 className="section-title">
              <span>Spam Log</span>
              <span style={{ fontSize: '0.75rem', textTransform: 'none', color: '#6b7280' }}>
                {notifications.length} items detected
              </span>
            </h3>

            {notifications.length > 0 ? (
              <div className="spam-list">
                {notifications.map((email) => (
                  <div className="spam-item" key={email.id}>
                    <div className="spam-item-header">
                      <span className="spam-badge">Spam Trashed</span>
                      {email.isFallback && <span className="fallback-badge">Heuristic</span>}
                    </div>
                    <p className="spam-snippet">{email.snippet || '[No content preview]'}</p>
                    <button 
                      className="view-trash-btn" 
                      onClick={() => handleShowEmail(email)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/>
                      </svg>
                      {isSandbox ? 'Inspect Email' : 'View in Gmail Trash'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-spam-card">
                <div className="no-spam-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                </div>
                <h4 className="no-spam-title">Inbox is Secure</h4>
                <p className="no-spam-desc">
                  No active spam detected in your recent emails. Keep up the clean inbox!
                </p>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="login-screen">
          <div className="logo-wrapper">
            <div className="shield-glow"></div>
            <svg className="app-logo-large" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="100" height="100" rx="24" fill="url(#gradient-large)" />
              <path d="M50 25L30 33.3V50C30 63.3 38.3 75.3 50 79C61.7 75.3 70 63.3 70 50V33.3L50 25Z" stroke="white" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M41 50L47 56L59 44" stroke="white" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="gradient-large" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366f1" />
                  <stop offset="0.5" stopColor="#a855f7" />
                  <stop offset="1" stopColor="#ec4899" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <h1 className="app-title-gradient">MailCleaner AI</h1>
          <p className="app-subtitle">
            Securely protect your Gmail from unwanted spam and malicious links using machine learning analysis.
          </p>

          {errorMsg && <div className="alert-error" style={{ width: '100%', boxSizing: 'border-box' }}>{errorMsg}</div>}

          <button className="google-login-btn" onClick={handleLogin}>
            <svg className="google-icon-img" viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
            </svg>
            <span>Continue with Google</span>
          </button>

          <button className="sandbox-login-btn" onClick={handleSandboxLogin}>
            <span>Try Sandbox Mode (Demo)</span>
          </button>

          <div className="login-footer-text">
            OAuth 2.0 Secure Sandbox
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
