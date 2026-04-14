// MailGuardian - MongoDB Models
const mongoose = require("mongoose");

// ── USER MODEL ──────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  domain: {
    type: String,
    default: "other"
  },
  status: {
    type: String,
    enum: ["active", "stopped"],
    default: "active"
  },
  registeredAt: {
    type: Date,
    default: Date.now
  },
  lastUsed: {
    type: Date,
    default: null
  },
  totalAnalyzed: {
    type: Number,
    default: 0
  },
  averageScore: {
    type: Number,
    default: 0
  }
});

// Auto-extract domain from email
userSchema.pre("save", function (next) {
  if (this.email) {
    const parts = this.email.split("@");
    const domainFull = parts[1] || "";
    if (domainFull.includes("gmail")) this.domain = "gmail";
    else if (domainFull.includes("outlook") || domainFull.includes("hotmail")) this.domain = "outlook";
    else if (domainFull.includes("yahoo")) this.domain = "yahoo";
    else this.domain = "other";
  }
  next();
});

// ── SCORE HISTORY MODEL ─────────────────────────────────────
const scoreSchema = new mongoose.Schema({
  userEmail: {
    type: String,
    required: true,
    lowercase: true
  },
  score: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  tier: {
    type: String,
    enum: ["Poor", "Fair", "Great"]
  },
  platform: {
    type: String,
    default: "gmail"
  },
  analyzedAt: {
    type: Date,
    default: Date.now
  }
});

// ── ADMIN MODEL ─────────────────────────────────────────────
const adminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ["admin", "superadmin"],
    default: "admin"
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// ── SYSTEM SETTINGS MODEL ───────────────────────────────────
const settingsSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed
});

const User = mongoose.model("User", userSchema);
const Score = mongoose.model("Score", scoreSchema);
const Admin = mongoose.model("Admin", adminSchema);
const Settings = mongoose.model("Settings", settingsSchema);

module.exports = { User, Score, Admin, Settings };
