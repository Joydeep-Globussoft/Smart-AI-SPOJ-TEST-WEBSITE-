// Admin Routes — Section 3 (Roles & Permissions), BUG-01, BUG-04
const express = require('express');
const router = express.Router();
const {
  getAdmins,
  getAdminById,
  updateAdmin,
  deactivateAdmin,
  activateAdmin,
  deleteAdmin,
  getMe,
  updateMe,
  updateMyPassword,
} = require('../controllers/adminController');
const { verifyToken, requireAdmin, requireSuperAdmin } = require('../middleware/authMiddleware');

// ── Profile routes for logged-in Admin (accessible to both ADMIN and SUPER_ADMIN) ──
// GET /api/v1/admins/me & /api/v1/me
router.get('/admins/me', verifyToken, requireAdmin, getMe);
router.get('/me', verifyToken, requireAdmin, getMe);

// PATCH /api/v1/admins/me & /api/v1/me
router.patch('/admins/me', verifyToken, requireAdmin, updateMe);
router.patch('/me', verifyToken, requireAdmin, updateMe);

// PATCH /api/v1/admins/me/password & /api/v1/me/password
router.patch('/admins/me/password', verifyToken, requireAdmin, updateMyPassword);
router.patch('/me/password', verifyToken, requireAdmin, updateMyPassword);

// ── Super-Admin-only routes (Managing other Admin accounts) ────────────────────────
router.use('/admins', verifyToken, requireSuperAdmin);

// GET /api/v1/admins (supports optional ?isActive=true/false)
router.get('/admins', getAdmins);

// GET /api/v1/admins/:adminId
router.get('/admins/:adminId', getAdminById);

// PATCH /api/v1/admins/:adminId
router.patch('/admins/:adminId', updateAdmin);

// PATCH /api/v1/admins/:adminId/deactivate
router.patch('/admins/:adminId/deactivate', deactivateAdmin);

// PATCH /api/v1/admins/:adminId/activate
router.patch('/admins/:adminId/activate', activateAdmin);

// DELETE /api/v1/admins/:adminId
router.delete('/admins/:adminId', deleteAdmin);

module.exports = router;
