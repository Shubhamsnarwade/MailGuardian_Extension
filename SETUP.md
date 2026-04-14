# 🛡️ MailGuardian - Complete Setup Guide

---

## STEP 1 — Setup the Server

### 1.1 Install dependencies
Open terminal inside the `mailguardian-server` folder and run:
```
npm install
```

### 1.2 Create your .env file
- Rename `.env.example` to `.env`
- Open `.env` and fill in:
```
MONGODB_URI=mongodb://localhost:27017/mailguardian
GEMINI_API_KEY=your_gemini_api_key_here
JWT_SECRET=any_long_random_string_here
PORT=5000
SUPER_ADMIN_EMAIL=superadmin@mailguardian.com
SUPER_ADMIN_PASSWORD=super@123
```

### 1.3 Get your FREE Gemini API Key
1. Go to: https://aistudio.google.com/app/apikey
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy and paste it into `.env` as GEMINI_API_KEY

### 1.4 Start the server
```
npm start
```
You should see:
```
✅ MongoDB connected
🛡️  MailGuardian Server running on http://localhost:5000
```

---

## STEP 2 — Install the Chrome Extension

1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer Mode** (top right toggle)
3. Click **"Load unpacked"**
4. Select the `mailguardian-extension` folder
5. Pin the 🛡️ icon to your toolbar

---

## STEP 3 — Register a User

1. Open the MailGuardian website
2. Enter your name and email → click Register
   OR: the server auto-registers via the website form

---

## STEP 4 — Use the Extension

1. Click the 🛡️ icon in Chrome toolbar
2. Enter your registered email → click Activate
3. Open Gmail → compose an email → click Send
4. MailGuardian will intercept and analyze! ✅

---

## Admin Portal Login
- Super Admin: superadmin@mailguardian.com / super@123
- Connect admin portal to: http://localhost:5000/api/admin/...

---

## API Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/register | Register new user |
| POST | /api/verify-user | Check if user is active |
| POST | /api/analyze | Analyze email sentiment |
| POST | /api/admin/login | Admin login |
| GET  | /api/admin/users | Get all users |
| PUT  | /api/admin/users/:email/status | Stop/Resume user |
| DELETE | /api/admin/users/:email | Delete user |
| PUT  | /api/admin/system | Stop/Resume system |
| GET  | /api/admin/stats | Dashboard stats |
| GET  | /api/admin/admins | Get all admins (super admin) |
| POST | /api/admin/admins | Add admin (super admin) |
| DELETE | /api/admin/admins/:email | Delete admin (super admin) |

---

## Support
Email: mailguardiansupport@gmail.com
