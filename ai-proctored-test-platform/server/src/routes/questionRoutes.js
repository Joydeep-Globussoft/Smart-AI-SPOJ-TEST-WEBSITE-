// Question Bank routes — Section 9.4 (exact endpoint paths)
const express = require('express');
const router = express.Router();
const {
  createQuestionSet, getQuestionSets, updateQuestionSet,
  createQuestion, getQuestions,
  updateQuestion, deleteQuestion,
} = require('../controllers/questionController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

// GET /question-sets/:setId/questions is accessible to candidates (with hidden test cases filtered)
// All other question bank management is admin-only
router.post('/question-sets', verifyToken, requireAdmin, createQuestionSet);
router.get('/question-sets', verifyToken, requireAdmin, getQuestionSets);
router.patch('/question-sets/:setId', verifyToken, requireAdmin, updateQuestionSet);
router.post('/question-sets/:setId/questions', verifyToken, requireAdmin, createQuestion);
// GET questions — accessible to candidates (filtered) and admins (full)
router.get('/question-sets/:setId/questions', verifyToken, getQuestions);
router.patch('/questions/:questionId', verifyToken, requireAdmin, updateQuestion);
router.delete('/questions/:questionId', verifyToken, requireAdmin, deleteQuestion);

module.exports = router;
