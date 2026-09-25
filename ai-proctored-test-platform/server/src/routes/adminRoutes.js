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
  disqualifyCandidate,
  warnCandidate,
} = require('../controllers/adminController');
const { verifyToken, requireAdmin, requireSuperAdmin } = require('../middleware/authMiddleware');

// ── Candidate Actions (FEATURE-008 & BUG-64: Admin / Super Admin) ───────────────
// POST /api/v1/candidates/:candidateId/disqualify
router.post('/candidates/:candidateId/disqualify', verifyToken, requireAdmin, disqualifyCandidate);

// POST /api/v1/candidates/:candidateId/warn
router.post('/candidates/:candidateId/warn', verifyToken, requireAdmin, warnCandidate);

// ── System & Proctoring Status ───────────────────────────────────────────────
// GET /api/v1/admin/yolo-status
router.get('/admin/yolo-status', verifyToken, requireAdmin, (req, res) => {
  const { getYoloHealthStatus } = require('../services/malpracticeService');
  res.json({ yolo: getYoloHealthStatus() });
});

// POST /api/v1/admin/yolo-restart (Manual admin intervention / circuit-breaker reset)
router.post('/admin/yolo-restart', verifyToken, requireAdmin, (req, res) => {
  const { manualResetYoloService } = require('../services/malpracticeService');
  const yolo = manualResetYoloService();
  res.json({ message: 'YOLO daemon reset triggered successfully', yolo });
});

// POST /api/v1/admin/yolo-detect (Direct frame detection diagnostic endpoint)
const multer = require('multer');
const uploadYolo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.post('/admin/yolo-detect', verifyToken, requireAdmin, uploadYolo.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'image file is required' });
    const { detectPhone } = require('../services/malpracticeService');
    const result = await detectPhone(req.file.buffer);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
