# MailCleaner AI - Gmail Spam Shield Chrome Extension

MailCleaner AI is a Chrome Extension (Manifest V3) that integrates with the Gmail REST API using OAuth 2.0 to scan, classify, and automatically trash spam and phishing emails. The UI is built with React and Vite, communicating asynchronously with an event-driven background service worker.

![MailCleaner AI Demo](MailcleanerAI_demo.mp4)


---

## Technical Architecture

The extension is designed around Chrome's Manifest V3 specification, utilizing an event-driven service worker for background tasks and a React-based single-page application for the popup interface.

```
┌────────────────────────────────┐
│     React Popup (Frontend)     │
│  - Persistent authentication   │
│  - Scan dashboard UI           │
└───────────────┬────────────────┘
                │
    chrome.runtime.sendMessage()
                │
                ▼
┌────────────────────────────────┐
│ Service Worker (Background)    │
│  - Handles OAuth token lifecycle│
│  - Google API queries          │
│  - Predicts spam / fallback    │
└───────────────┬────────────────┘
                │
                ├───────────────────────────────┐
                ▼                               ▼
    ┌──────────────────────┐         ┌──────────────────────┐
    │    Gmail REST API    │         │  Spam Predictor API  │
    │  - messages.list     │         │  - Local heuristics  │
    │  - messages.trash    │         │    fallback          │
    └──────────────────────┘         └──────────────────────┘
```

### Build-Time Environment Injection (Vite Plugin)
Chrome extension manifests are static JSON files. To prevent committing public or development credentials (`client_id`) directly to git, we implemented a custom build-time injection step in `vite.config.js`. 
During `npm run build`, a custom plugin hooks into the `closeBundle` compilation stage, loads `VITE_GOOGLE_CLIENT_ID` from a gitignored `.env` file, and injects it into the output `dist/manifest.json`.

### Multi-Profile Session Management
Using `chrome.identity.getAuthToken` inside extensions can cause session failures if the user's active Chrome profile sync account is different from the Google account they used to authorize the extension.
To resolve this mismatch, we retrieve the authenticated token once using the interactive flow, persist it in `chrome.storage.local`, and pass it explicitly in subsequent background requests instead of relying on Chrome's automated profile account matching.

### Concurrency & Rate Limiting
To scan a mailbox, the extension fetches the last 50 emails. Spawning 50 concurrent detail-fetch requests when a token is expired would cause a parallel storm of `401 Unauthorized` responses and concurrent refresh calls to Google.
We resolved this by using the mailbox listing query as a sequential gatekeeper. Token validation is handled on the initial request; subsequent parallel child requests reuse the validated token, preventing API locking.

---

## Setup & Installation

### 1. Set Up Environment Variables
Create a `.env` file in the root directory (a `.env.example` template is provided):
```env
VITE_GOOGLE_CLIENT_ID=your_oauth_client_id.apps.googleusercontent.com
```

### 2. Install and Build
Compile the React popup and build the Manifest V3 package:
```bash
# Install dependencies
npm install

# Build the extension into dist/
npm run build
```

### 3. Load into Google Chrome
1. Open Google Chrome and go to `chrome://extensions/`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** (top-left button).
4. Select the **`dist`** directory in this repository.
5. Pin the extension to your toolbar.