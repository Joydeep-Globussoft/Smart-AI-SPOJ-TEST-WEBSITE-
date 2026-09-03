// Proctoring routes — Section 9.8 (exact endpoint paths)
const express = require('express');
const router = express.Router();
const {
  submitFrame,
  reportViolation,
  reportCameraDisconnected,
  reportCameraReconnected,
  getViolationCount,
} = require('../controllers/proctoringController');
const { verifyToken, requireCandidate } = require('../middleware/authMiddleware');

router.use(verifyToken, requireCandidate);

// GET /proctoring/:testId/violation-count — live malpractice count for candidate
router.get('/:testId/violation-count', getViolationCount);

// POST /proctoring/:testId/frame — multipart/form-data upload
router.post('/:testId/frame', submitFrame);

// POST /proctoring/violation — client-detected violations
router.post('/violation', reportViolation);

// POST /proctoring/camera-disconnected
router.post('/camera-disconnected', reportCameraDisconnected);

// POST /proctoring/camera-reconnected
router.post('/camera-reconnected', reportCameraReconnected);

module.exports = router;
