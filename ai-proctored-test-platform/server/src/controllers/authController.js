// Auth Controller — Module 1
// Implements all endpoints from Section 9.1 exactly
// Security: bcrypt cost factor >= 10 (Section 13), JWT access+refresh tokens
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Candidate = require('../models/Candidate');

const BCRYPT_SALT_ROUNDS = 12; // >= 10 as required by Section 13

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'supersecretjwtkeyglobussoft2026';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.REFRESH_TOKEN_SECRET || 'supersecretrefreshkeyglobussoft2026';

/**
 * Generate JWT access token
 */
const generateAccessToken = (payload) =>
  jwt.sign(payload, JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
  });

/**
 * Generate JWT refresh token
 */
const generateRefreshToken = (payload) =>
  jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d',
  });

// ── POST /auth/admin/login ────────────────────────────────────────────────────
// Response: { token, refreshToken, admin: { id, name, role } }
const adminLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account has been deactivated (BUG-01)
    if (admin.isActive === false) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    const payload = { id: admin._id.toString(), role: admin.role, type: 'admin' };
    const token = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    res.json({
      token,
      refreshToken,
      admin: { id: admin._id, name: admin.name, role: admin.role },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /auth/admin/create ───────────────────────────────────────────────────
// Super Admin only (enforced by roleMiddleware in route)
// Body: { name, email, password, role }
// Response: { admin }
// AC: Attempting as non-Super-Admin returns 403 (enforced by requireSuperAdmin middleware)
const adminCreate = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'name, email, password, and role are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) {
      return res.status(400).json({ error: 'role must be SUPER_ADMIN or ADMIN' });
    }

    const existing = await Admin.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'An admin with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const admin = await Admin.create({
      name,
      email,
      passwordHash,
      role,
      createdBy: req.user.id, // Super Admin who created this account
    });

    res.status(201).json({
      admin: { id: admin._id, name: admin.name, email: admin.email, role: admin.role },
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /auth/candidate/register ────────────────────────────────────────────
// Body: { name, email, password, phone }
// Response: { candidate, token }
// AC: Record created with expiresAt = createdAt + 3 days (FR-1.2)
const candidateRegister = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await Candidate.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'A candidate with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const now = new Date();
    const expiryDays = parseInt(process.env.CANDIDATE_ACCOUNT_EXPIRY_DAYS || '3', 10);
    const expiresAt = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000); // createdAt + N days

    const candidate = await Candidate.create({
      name,
      email,
      phone: phone || undefined,
      passwordHash,
      createdAt: now,
      expiresAt, // TTL index will auto-delete document at this time (Section 8.2 note)
    });

    const payload = { id: candidate._id.toString(), type: 'candidate' };
    const token = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    res.status(201).json({
      candidate: {
        id: candidate._id,
        name: candidate.name,
        email: candidate.email,
        phone: candidate.phone,
        expiresAt: candidate.expiresAt,
      },
      token,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /auth/candidate/login ────────────────────────────────────────────────
// Body: { email, password }
// Response: { candidate, token, refreshToken }
// AC: 401 if account expired/deleted (FR-1.2)
const candidateLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const candidate = await Candidate.findOne({ email: email.toLowerCase() });
    if (!candidate) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // AC: login attempts after expiresAt return 401 "Account expired, please register again" (FR-1.2)
    // Note: MongoDB TTL may not delete exactly at expiresAt moment, so we check explicitly
    if (candidate.expiresAt && new Date() > candidate.expiresAt) {
      return res.status(401).json({ error: 'Account expired, please register again' });
    }

    if (candidate.isDisqualified) {
      return res.status(403).json({ error: 'Account has been disqualified' });
    }

    const isMatch = await bcrypt.compare(password, candidate.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const payload = { id: candidate._id.toString(), type: 'candidate' };
    const token = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    res.json({
      candidate: {
        id: candidate._id,
        name: candidate.name,
        email: candidate.email,
        phone: candidate.phone,
        expiresAt: candidate.expiresAt,
      },
      token,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /auth/refresh ────────────────────────────────────────────────────────
// Body: { refreshToken }
// Response: { token }
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    // Generate new access token with same payload
    const newToken = generateAccessToken({
      id: decoded.id,
      role: decoded.role,
      type: decoded.type,
    });

    res.json({ token: newToken });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Refresh token expired, please log in again' });
    }
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
};

// ── POST /auth/logout ─────────────────────────────────────────────────────────
// Response: { success: true }
// Note: stateless JWT — client discards tokens; no server-side blacklist in v1
const logout = async (req, res) => {
  res.json({ success: true });
};

module.exports = {
  adminLogin,
  adminCreate,
  candidateRegister,
  candidateLogin,
  refreshToken,
  logout,
};
