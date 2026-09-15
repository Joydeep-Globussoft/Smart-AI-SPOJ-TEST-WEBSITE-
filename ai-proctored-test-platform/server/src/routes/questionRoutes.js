const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
  createQuestionSet, getQuestionSets, updateQuestionSet, deleteQuestionSet,
  createQuestion, getQuestions,
  updateQuestion, deleteQuestion,
  uploadPdfBatch, servePdfAsset,
} = require('../controllers/questionController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: 150 },
});

// GET /question-sets/:setId/questions is accessible to candidates (with hidden test cases filtered)
// All other question bank management is admin-only
router.post('/question-sets', verifyToken, requireAdmin, createQuestionSet);
router.get('/question-sets', verifyToken, requireAdmin, getQuestionSets);
router.patch('/question-sets/:setId', verifyToken, requireAdmin, updateQuestionSet);
router.delete('/question-sets/:setId', verifyToken, requireAdmin, deleteQuestionSet);
router.post('/question-sets/upload-pdf-batch', verifyToken, requireAdmin, upload.array('files', 150), uploadPdfBatch);

router.post('/question-sets/:setId/questions', verifyToken, requireAdmin, createQuestion);
// GET questions — accessible to candidates (filtered) and admins (full)
router.get('/question-sets/:setId/questions', verifyToken, getQuestions);
router.patch('/questions/:questionId', verifyToken, requireAdmin, updateQuestion);
router.delete('/questions/:questionId', verifyToken, requireAdmin, deleteQuestion);

// PDF asset serving for candidate & admin embedded viewers
router.get('/questions/pdf-asset/:filename', servePdfAsset);

module.exports = router;
