// Auth middleware — JWT verification + RBAC
// Security requirements: JWT-based auth, Role-based access control (Section 13)
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Candidate = require('../models/Candidate');

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'supersecretjwtkeyglobussoft2026';

/**
 * Verifies the JWT from Authorization: Bearer <token> header.
 * Attaches req.user = { id, role, type: 'admin' | 'candidate' }
 */
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
    req.user = decoded; // { id, role, type }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * RBAC: Ensures the requester is an Admin (ADMIN or SUPER_ADMIN).
 * Must be used after verifyToken.
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.type !== 'admin') {
    return res.status(403).json({ error: 'Access denied — Admin only' });
  }
  next();
};

/**
 * RBAC: Ensures the requester is specifically a SUPER_ADMIN.
 * Must be used after verifyToken.
 * AC for FR-1.1: Non-Super-Admin attempting /auth/admin/create returns 403.
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.user || req.user.type !== 'admin' || req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Access denied — Super Admin only' });
  }
  next();
};

/**
 * RBAC: Ensures the requester is a Candidate.
 * Must be used after verifyToken.
 */
const requireCandidate = (req, res, next) => {
  if (!req.user || req.user.type !== 'candidate') {
    return res.status(403).json({ error: 'Access denied — Candidate only' });
  }
  next();
};

/**
 * Either Admin or Candidate can access (used for shared endpoints if any).
 */
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

module.exports = {
  verifyToken,
  requireAdmin,
  requireSuperAdmin,
  requireCandidate,
  requireAuth,
};
