// Evaluation and Reports routes — Section 9.7 (exact endpoint paths)
const express = require('express');
const router = express.Router();
const {
  getResults, getShortlist, regenerateShortlist,
  exportShortlistPdf, getCopyPasteLog,
  getCandidateEvaluationDetail,
} = require('../controllers/evaluationController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

const adminAuth = [verifyToken, requireAdmin];

router.get('/tests/:testId/results', adminAuth, getResults);
router.get('/tests/:testId/shortlist', adminAuth, getShortlist);
router.post('/tests/:testId/shortlist/regenerate', adminAuth, regenerateShortlist);
router.get('/tests/:testId/shortlist/export-pdf', adminAuth, exportShortlistPdf);
router.get('/tests/:testId/candidates/:candidateId/evaluations', adminAuth, getCandidateEvaluationDetail);
router.get('/submissions/:submissionId/copy-paste-log', adminAuth, getCopyPasteLog);

module.exports = router;
