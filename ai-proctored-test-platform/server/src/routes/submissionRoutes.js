// Submission routes — Section 9.5 (exact endpoint paths)
const express = require('express');
const router = express.Router();
const {
  joinRoom, startAttempt, getQuestion,
  runCode, saveCode, submitCode, submitAll,
} = require('../controllers/submissionController');
const { verifyToken, requireCandidate } = require('../middleware/authMiddleware');

const candidateAuth = [verifyToken, requireCandidate];

router.post('/rooms/join', candidateAuth, joinRoom);
router.post('/tests/:testId/start-attempt', candidateAuth, startAttempt);
router.get('/tests/:testId/questions/:questionId', candidateAuth, getQuestion);
router.post('/submissions/:questionId/run', candidateAuth, runCode);
router.post('/submissions/:questionId/save', candidateAuth, saveCode);
router.post('/submissions/:questionId/submit', candidateAuth, submitCode);
router.post('/tests/:testId/submit-all', candidateAuth, submitAll);

module.exports = router;
