# MailCleaner AI 🛡️ - Gmail Spam Shield Chrome Extension

[![React](https://img.shields.io/badge/React-18.3-61dafb?logo=react&style=flat-square)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5.3-646cff?logo=vite&style=flat-square)](https://vitejs.dev/)
[![Manifest V3](https://img.shields.io/badge/Chrome--Extension-Manifest%20V3-4285F4?logo=google-chrome&style=flat-square)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![OAuth 2.0](https://img.shields.io/badge/OAuth-2.0-DB4437?logo=google&style=flat-square)](https://developers.google.com/identity)
[![Gmail API](https://img.shields.io/badge/API-Gmail%20REST-0F9D58?logo=gmail&style=flat-square)](https://developers.google.com/gmail/api)

**MailCleaner AI** is a premium, high-performance Chrome extension that connects securely to your Gmail inbox to scan, classify, and automatically trash spam and malicious emails using machine learning analysis. 

Featuring a stunning glassmorphic dashboard interface, live scanning feedback, and real-time metrics, it serves as a robust example of a secure, production-grade Chrome extension built on **Manifest V3**.

<div align="center">
  <video src="finlal_chrome_extension_demo.mp4" width="100%" controls>
    Your browser does not support the video tag.
  </video>
</div>

---

## 🛠️ System Architecture & Data Flow

Below is the request life cycle showing how the React frontend, Manifest V3 Service Worker, Gmail REST API, and Machine Learning backend communicate:

```
[ User Interaction ] ──> [ React Frontend (App.jsx) ]
                               │      ▲
              chrome.runtime   │      │   sendResponse
               sendMessage()   ▼      │   (Status / Emails)
                        [ Service Worker (service_worker.js) ]
                               │      ▲
              HTTPS REST       │      │   JSON Data
              API Requests     ▼      │   (Access Token / Messages)
              ┌───────────────────────┴───────────────────────┐
              │                                               │
              ▼                                               ▼
     [ Google OAuth 2.0 & ]                          [ Spam Prediction ]
     [  Gmail REST API    ]                          [   Model API     ]
      - messages.list                                 - Flask/FastAPI Backend
      - messages.get                                  - Heuristic Fallback
      - messages.trash
```

---

## 🧠 Key Engineering Challenges Solved

### 1. Concurrency Request Storm Prevention (Inbox Scan Bottleneck)
*   **The Challenge**: Scanning an inbox of 50 emails requires making 1 API call to list message IDs, followed by 50 parallel detail-fetch calls. If the OAuth2 token is expired, all 50 parallel requests receive a `401 Unauthorized` simultaneously, causing 50 background token-refresh requests in parallel. This overwhelms the Chrome Identity API, locking the extension.
*   **The Solution**: Implemented a **Sequential Gatekeeper pattern**. The initial message-list API call acts as the token validator. If it detects a `401`, it refreshes the token in isolation. All subsequent 50 detail requests automatically inherit the fresh token, avoiding parallel OAuth calls.

### 2. Multi-Profile Sync Account Mismatch (Classic Chrome API Gotcha)
*   **The Challenge**: When a user's browser profile syncs to `primary@gmail.com` but they sign in to the extension using a test account `okayaarti4me@gmail.com`, calling `chrome.identity.getAuthToken({ interactive: false })` defaults to querying the primary sync account. This mismatch continuously triggers `"OAuth2 not granted or revoked"` errors and breaks the session.
*   **The Solution**: Cached the valid token returned by the interactive prompt in `chrome.storage.local`. Background scripts pull the token directly from local storage instead of letting the identity API guess, preserving the user's login session.

### 3. Silent Session Life Cycle & Logout Revocation
*   **The Challenge**: Logging out or checking the background session must not annoy the user with sudden Google sign-in prompts.
*   **The Solution**: Structured a fully silent token validation check (`interactive: false`). Upon logout, the extension revokes the Google token silently via Google's OAuth2 revoke endpoint, invalidates the local storage cache, and wipes Chrome's identity cache without launching any popup windows.

---

## ✨ Highlights for Recruiters (Clean Code Practices)
- **Manifest V3 Compliant**: Uses modern event-driven Service Workers, completely eliminating the deprecated Manifest V2 persistent background pages.
- **Strict Security Principles**: Never persists credentials or client secrets. Utilizes Google's native authorization framework and short-lived access tokens inside secure storage.
- **Offline / Fallback Resiliency**: Features a heuristic local classifier fallback so the extension continues to scan and function successfully even when the ML backend server is offline.
- **Dry & Modular Javascript**: Network calls, authorization routines, and classification modules are cleanly isolated in the service worker, keeping the React UI focused only on presentation and state.

---

## 🚀 How to Run & Test

### 1. Build the Extension
Ensure you have Node.js installed, then build the production assets:
```bash
# Install dependencies
npm install

# Compile React frontend and assets into dist/
npm run build
```

### 2. Load the Extension in Google Chrome
1. Navigate to `chrome://extensions/` in Chrome.
2. Toggle on **"Developer mode"** (top-right corner).
3. Click **"Load unpacked"** (top-left corner).
4. Select the **`dist`** directory in this project folder.
5. Pin the extension to your Chrome toolbar.

### 3. Usage & Interactive Testing
- **Sign In**: Click "Continue with Google" to trigger the secure interactive account chooser popup.
- **Sandbox Mode**: Click "Try Sandbox Mode (Demo)" to run a mock scan using preloaded mock emails and visual simulations.
- **Scan**: Click "Scan & Clean Inbox" to fetch real messages via Gmail API. Flagged spam will automatically be moved to your Gmail Trash folder and logged.

---

## 📂 Codebase Structure

- [public/manifest.json](file:///home/aarti/seminar_chrome_extension/demo_chrome/spam_chrome_extension/public/manifest.json): Extension configuration, permissions, background script registration, and Google OAuth credentials.
- [public/service_worker.js](file:///home/aarti/seminar_chrome_extension/demo_chrome/spam_chrome_extension/public/service_worker.js): Background worker handling OAuth token storage, fetching messages from Gmail API, spam API communication, and trashing messages.
- [src/App.jsx](file:///home/aarti/seminar_chrome_extension/demo_chrome/spam_chrome_extension/src/App.jsx): Main dashboard application, scanning controller, and stats tracker.
- [src/App.css](file:///home/aarti/seminar_chrome_extension/demo_chrome/spam_chrome_extension/src/App.css): Premium UI stylesheet with custom neon variables, floating animations, and grid designs.
