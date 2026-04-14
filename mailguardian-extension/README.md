# 🛡️ MailGuardian Chrome Extension

AI-powered email sentiment analysis. Analyzes your tone before you hit Send.

---

## 📁 Files Included

```
mailguardian-extension/
├── manifest.json       ← Extension config
├── background.js       ← Gemini API calls & score storage
├── content.js          ← Send button interceptor (Gmail, Outlook, Yahoo)
├── content.css         ← Overlay popup styles
├── popup.html          ← Extension popup UI
├── popup.js            ← Popup logic
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 🚀 How to Install (Chrome)

1. Open Chrome and go to: `chrome://extensions`
2. Enable **Developer Mode** (toggle in top-right corner)
3. Click **"Load unpacked"**
4. Select the `mailguardian-extension` folder
5. The MailGuardian icon will appear in your Chrome toolbar ✅

---

## ⚙️ First-Time Setup

1. Click the **MailGuardian icon** in your Chrome toolbar
2. Enter your **registered email** (the one you used on the MailGuardian website)
3. Enter your **Gemini API Key** (free from [aistudio.google.com](https://aistudio.google.com/app/apikey))
4. Click **Save & Activate**

---

## 🔑 Getting Your FREE Gemini API Key

1. Go to: https://aistudio.google.com/app/apikey
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy the key and paste it in the extension popup
5. That's it — completely free! ✅

---

## 📧 Supported Platforms

| Platform | Status |
|----------|--------|
| Gmail (mail.google.com) | ✅ Supported |
| Outlook Live (outlook.live.com) | ✅ Supported |
| Outlook Office (outlook.office.com) | ✅ Supported |
| Yahoo Mail (mail.yahoo.com) | ✅ Supported |

---

## 🎯 How It Works

1. You compose an email on any supported platform
2. You click the **Send** button
3. MailGuardian **intercepts** the send action
4. A popup appears with a **progress bar** while AI analyzes your email
5. You see a **sentiment score (0–100)** with one of three tiers:
   - 🔴 **0–50 (Poor)** — Unprofessional or offensive phrases detected
   - 🟡 **50–80 (Fair)** — Some phrases could be improved
   - 🟢 **80–100 (Great)** — Professional and respectful tone
6. You can:
   - ✅ **Accept** — Use the AI-rephrased version and send
   - ✏️ **Edit Manually** — Apply the AI rewrite and edit yourself
   - 🚀 **Send Original** — Dismiss and send your original message

---

## 🔒 Privacy

- Your **email content is never stored**
- Only the **sentiment score** is saved locally
- API calls go directly to Google's Gemini API using your own key
- No data is sent to any MailGuardian server

---

## 🛠️ Troubleshooting

**Extension not intercepting send button?**
- Make sure you're on a supported email platform
- Try refreshing the page after installing

**"No API key found" error?**
- Click the extension icon and enter your Gemini API key

**Analysis failing?**
- Check your Gemini API key is correct
- Make sure you have internet connection
- Free tier has rate limits — wait a moment and retry

---

## 📬 Support

Email: mailguardiansupport@gmail.com
