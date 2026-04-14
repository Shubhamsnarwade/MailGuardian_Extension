// MailGuardian - Main Server
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");
const rateLimit = require("express-rate-limit");
const { User, Score, Admin, Settings } = require("./models");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "mailguardian_secret";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// ── MIDDLEWARE ───────────────────────────────────────────────
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());
app.use(express.static('public'));

// Rate limiting for analysis endpoint
const analysisLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: "Too many requests. Please wait a moment." }
});

// ── CONNECT MONGODB ──────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/mailguardian")
  .then(async () => {
    console.log("✅ MongoDB connected");
    await seedSuperAdmin();
  })
  .catch(err => console.error("❌ MongoDB error:", err));

// Seed super admin on first run
async function seedSuperAdmin() {
  const existing = await Admin.findOne({ role: "superadmin" });
  if (!existing) {
    const hashed = await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD || "super@123", 10);
    await Admin.create({
      name: "Super Admin",
      email: process.env.SUPER_ADMIN_EMAIL || "superadmin@mailguardian.com",
      password: hashed,
      role: "superadmin"
    });
    console.log("✅ Super admin created");
  }

  // Default system setting
  const sys = await Settings.findOne({ key: "system_active" });
  if (!sys) await Settings.create({ key: "system_active", value: true });
}

// ── AUTH MIDDLEWARE ──────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function superAdminOnly(req, res, next) {
  if (req.admin.role !== "superadmin") return res.status(403).json({ error: "Super admin only" });
  next();
}

// ══════════════════════════════════════════════════════════════
// PUBLIC ROUTES (no auth needed)
// ══════════════════════════════════════════════════════════════

// Health check
app.get("/", (req, res) => res.json({ status: "MailGuardian server running ✅", version: "1.0.0" }));

// ── USER REGISTRATION ────────────────────────────────────────
app.post("/api/register", async (req, res) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: "Name and email are required" });
    if (!email.includes("@")) return res.status(400).json({ error: "Invalid email address" });

    // Check if already registered
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const user = await User.create({ name, email });
    res.json({ success: true, message: "Registration successful!", user: { name: user.name, email: user.email, domain: user.domain } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── VERIFY USER (extension calls this to check if user is active) ──
app.post("/api/verify-user", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    // Check system status
    const sysSetting = await Settings.findOne({ key: "system_active" });
    if (sysSetting && !sysSetting.value) {
      return res.json({ allowed: false, reason: "System is currently stopped by administrator" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ allowed: false, reason: "Email not registered. Please register at the MailGuardian website." });
    if (user.status === "stopped") {
      const pauseSetting = await Settings.findOne({ key: 'autopause_' + email.toLowerCase() });
      const reason = pauseSetting ? pauseSetting.value : 'Your access has been paused by an administrator. Contact mailguardiansupport@gmail.com.';
      return res.json({ allowed: false, reason });
    }

    res.json({ allowed: true, user: { name: user.name, email: user.email, domain: user.domain } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ANALYZE EMAIL (main extension endpoint) ──────────────────
app.post("/api/analyze", analysisLimiter, async (req, res) => {
  try {
    const { email, text } = req.body;
    if (!email || !text) return res.status(400).json({ error: "Email and text are required" });
    if (!GEMINI_API_KEY) return res.status(500).json({ error: "API key not configured on server" });

    // Check user is allowed
    const sysSetting = await Settings.findOne({ key: "system_active" });
    if (sysSetting && !sysSetting.value) {
      return res.status(403).json({ error: "System is currently stopped by administrator" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(403).json({ error: "Email not registered" });
    if (user.status === "stopped") return res.status(403).json({ error: "Your access has been paused by an administrator" });

    // Call Gemini API
    const prompt = `You are an AI email tone analyzer. Analyze the following email text from the RECEIVER'S perspective.

Email text:
"""
${text}
"""

Respond ONLY with a valid JSON object (no markdown, no extra text):
{
  "score": <number between 0 and 100>,
  "tier": "<Poor|Fair|Great>",
  "summary": "<one sentence summary of tone, max 10 words>",
  "flagged": [
    { "phrase": "<exact phrase>", "reason": "<why problematic>", "suggestion": "<better alternative>" }
  ],
  "rephrased": "<full professionally rephrased version>"
}

Rules:
- 0-50 Poor: unprofessional, offensive, aggressive, or very informal
- 50-80 Fair: mostly okay but some phrases could be improved
- 80-100 Great: professional, clear, respectful
- Keep flagged array empty [] if score >= 80
- Include 1-3 flagged items if score 50-80
- Include 3-5 flagged items if score < 50`;

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return res.status(500).json({ error: "Groq API key not configured" });

    const geminiRes = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + groqKey },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 1024
      })
    });

    if (!geminiRes.ok) {
      const errData = await geminiRes.json();
      return res.status(500).json({ error: errData?.error?.message || "Groq API error" });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.choices?.[0]?.message?.content || "";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleaned);

    // Save score to database
    const tier = result.tier || (result.score >= 80 ? "Great" : result.score >= 50 ? "Fair" : "Poor");
    await Score.create({ userEmail: email.toLowerCase(), score: result.score, tier, platform: req.body.platform || "gmail" });

    // Update user stats
    const scores = await Score.find({ userEmail: email.toLowerCase() }).sort({ analyzedAt: -1 });
    const avg = Math.round(scores.reduce((a, b) => a + b.score, 0) / scores.length);

    // AUTO-PAUSE: if 10 out of last 20 emails score 0-40
    let autoPaused = false;
    if (scores.length >= 10) {
      const last20 = scores.slice(0, 20);
      const poorCount = last20.filter(s => s.score <= 40).length;
      if (poorCount >= 10) {
        const reason = 'Your account was automatically paused because ' + poorCount + ' out of your last ' + last20.length + ' emails were rated Poor (score 0-40). Please review your communication style and contact support to reactivate.';
        await User.findOneAndUpdate({ email: email.toLowerCase() }, { status: 'stopped', lastUsed: new Date(), totalAnalyzed: scores.length, averageScore: avg });
        await Settings.findOneAndUpdate({ key: 'autopause_' + email.toLowerCase() }, { value: reason }, { upsert: true });
        autoPaused = true;
      }
    }
    if (!autoPaused) {
      await User.findOneAndUpdate({ email: email.toLowerCase() }, { lastUsed: new Date(), totalAnalyzed: scores.length, averageScore: avg });
    }
    res.json({ success: true, data: result, autoPaused });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// ADMIN ROUTES (require auth)
// ══════════════════════════════════════════════════════════════

// ── ADMIN LOGIN ──────────────────────────────────────────────
app.post("/api/admin/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: admin._id, email: admin.email, role: admin.role, name: admin.name }, JWT_SECRET, { expiresIn: "8h" });
    res.json({ success: true, token, admin: { name: admin.name, email: admin.email, role: admin.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET ALL USERS ────────────────────────────────────────────
app.get("/api/admin/users", authMiddleware, async (req, res) => {
  try {
    const users = await User.find().sort({ registeredAt: -1 });
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET USER SCORE HISTORY ───────────────────────────────────
app.get("/api/admin/users/:email/scores", authMiddleware, async (req, res) => {
  try {
    const scores = await Score.find({ userEmail: req.params.email.toLowerCase() }).sort({ analyzedAt: -1 }).limit(50);
    res.json({ success: true, scores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── STOP / RESUME USER ───────────────────────────────────────
app.put("/api/admin/users/:email/status", authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!["active", "stopped"].includes(status)) return res.status(400).json({ error: "Invalid status" });
    const user = await User.findOneAndUpdate({ email: req.params.email.toLowerCase() }, { status }, { new: true });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE USER ──────────────────────────────────────────────
app.delete("/api/admin/users/:email", authMiddleware, async (req, res) => {
  try {
    await User.findOneAndDelete({ email: req.params.email.toLowerCase() });
    await Score.deleteMany({ userEmail: req.params.email.toLowerCase() });
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SYSTEM STOP / RESUME ─────────────────────────────────────
app.put("/api/admin/system", authMiddleware, async (req, res) => {
  try {
    const { active } = req.body;
    await Settings.findOneAndUpdate({ key: "system_active" }, { value: active }, { upsert: true });
    res.json({ success: true, active });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET SYSTEM STATUS ────────────────────────────────────────
app.get("/api/admin/system", authMiddleware, async (req, res) => {
  try {
    const setting = await Settings.findOne({ key: "system_active" });
    res.json({ success: true, active: setting ? setting.value : true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DASHBOARD STATS ──────────────────────────────────────────
app.get("/api/admin/stats", authMiddleware, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: "active" });
    const stoppedUsers = await User.countDocuments({ status: "stopped" });
    const totalScores = await Score.countDocuments();
    const scores = await Score.find();
    const avgScore = totalScores > 0 ? Math.round(scores.reduce((a, b) => a + b.score, 0) / totalScores) : 0;
    const recentUsers = await User.find().sort({ lastUsed: -1 }).limit(5);
    const sysSetting = await Settings.findOne({ key: "system_active" });

    res.json({
      success: true,
      stats: { totalUsers, activeUsers, stoppedUsers, totalScores, avgScore, systemActive: sysSetting?.value ?? true },
      recentUsers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── AUTO DELETE USERS INACTIVE FOR 12 WEEKS ─────────────────
app.delete("/api/admin/auto-cleanup", authMiddleware, async (req, res) => {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 84); // 12 weeks
    const result = await User.deleteMany({ lastUsed: { $lt: cutoff }, lastUsed: { $ne: null } });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════
// SUPER ADMIN ONLY ROUTES
// ══════════════════════════════════════════════════════════════

// ── GET ALL ADMINS ───────────────────────────────────────────
app.get("/api/admin/admins", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const admins = await Admin.find().select("-password").sort({ createdAt: -1 });
    res.json({ success: true, admins });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ADD ADMIN ────────────────────────────────────────────────
app.post("/api/admin/admins", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "All fields required" });
    const existing = await Admin.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(409).json({ error: "Admin already exists" });
    const hashed = await bcrypt.hash(password, 10);
    const admin = await Admin.create({ name, email, password: hashed, role: "admin" });
    res.json({ success: true, admin: { name: admin.name, email: admin.email, role: admin.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE ADMIN ─────────────────────────────────────────────
app.delete("/api/admin/admins/:email", authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const admin = await Admin.findOne({ email: req.params.email.toLowerCase() });
    if (!admin) return res.status(404).json({ error: "Admin not found" });
    if (admin.role === "superadmin") return res.status(403).json({ error: "Cannot delete super admin" });
    await Admin.findOneAndDelete({ email: req.params.email.toLowerCase() });
    res.json({ success: true, message: "Admin deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── START SERVER ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🛡️  MailGuardian Server running on http://localhost:${PORT}`);
  console.log(`📦  MongoDB: ${process.env.MONGODB_URI || "mongodb://localhost:27017/mailguardian"}`);
  console.log(`🔑  Gemini API: ${GEMINI_API_KEY ? "✅ Configured" : "❌ Missing - add to .env"}\n`);
});

// ── OTP STORE (in memory) ────────────────────────────────────
const otpStore = {};

// ── SEND OTP ─────────────────────────────────────────────────
app.post("/api/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: "Email not registered. Please register first." });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email.toLowerCase()] = { otp, expires: Date.now() + 10 * 60 * 1000 };

    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
      tls: { rejectUnauthorized: false }
    });

    await transporter.sendMail({
      from: `"MailGuardian" <${process.env.GMAIL_USER}>`,
      to: email,
      subject: "Your MailGuardian Login OTP",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#060910;color:#f0f4f8;padding:2rem;border-radius:12px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:1.5rem;">
            <span style="font-size:1.5rem;">🛡️</span>
            <span style="font-size:1.2rem;font-weight:800;">Mail<span style="color:#00e5a0;">Guardian</span></span>
          </div>
          <p style="color:#8896a7;margin-bottom:1rem;">Your one-time login code is:</p>
          <div style="background:#111827;border:1px solid rgba(0,229,160,0.3);border-radius:10px;padding:1.5rem;text-align:center;margin-bottom:1.5rem;">
            <span style="font-size:2.5rem;font-weight:800;letter-spacing:8px;color:#00e5a0;">${otp}</span>
          </div>
          <p style="color:#8896a7;font-size:0.85rem;">This code expires in <strong style="color:#f0f4f8;">10 minutes</strong>. Do not share it with anyone.</p>
          <hr style="border-color:rgba(255,255,255,0.07);margin:1.5rem 0;"/>
          <p style="color:#8896a7;font-size:0.75rem;">If you didn't request this, ignore this email.</p>
        </div>
      `
    });

    res.json({ success: true, message: "OTP sent to your email" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── VERIFY OTP ────────────────────────────────────────────────
app.post("/api/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });
    const record = otpStore[email.toLowerCase()];
    if (!record) return res.status(400).json({ error: "No OTP found. Please request a new one." });
    if (Date.now() > record.expires) { delete otpStore[email.toLowerCase()]; return res.status(400).json({ error: "OTP expired. Please request a new one." }); }
    if (record.otp !== otp) return res.status(400).json({ error: "Invalid OTP. Please try again." });
    delete otpStore[email.toLowerCase()];
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ error: "User not found." });
    const token = jwt.sign({ email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { name: user.name, email: user.email, domain: user.domain, status: user.status } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET USER DASHBOARD DATA ───────────────────────────────────
app.get("/api/user/dashboard", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findOne({ email: decoded.email });
    if (!user) return res.status(404).json({ error: "User not found" });
    const scores = await Score.find({ userEmail: decoded.email }).sort({ analyzedAt: -1 }).limit(50);
    res.json({ success: true, user, scores });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
