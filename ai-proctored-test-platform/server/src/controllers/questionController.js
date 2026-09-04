// Question Bank Controller — Module 2
// Implements all endpoints from Section 9.4 exactly
const QuestionSet = require('../models/QuestionSet');
const Question = require('../models/Question');
const Test = require('../models/Test');

// ── POST /question-sets ───────────────────────────────────────────────────────
const createQuestionSet = async (req, res, next) => {
  try {
    const { testType, name } = req.body;
    if (!testType || !name) {
      return res.status(400).json({ error: 'testType and name are required' });
    }

    const questionSet = await QuestionSet.create({
      testType,
      name,
      createdBy: req.user.id,
    });

    res.status(201).json({ questionSet });
  } catch (err) {
    next(err);
  }
};

// ── GET /question-sets ────────────────────────────────────────────────────────
const getQuestionSets = async (req, res, next) => {
  try {
    const questionSets = await QuestionSet.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Query question counts and questionIds for each question set to guarantee accurate, real-time counts (BUG-59)
    const setIds = questionSets.map((s) => s._id);
    const questionsBySet = await Question.find(
      { questionSetId: { $in: setIds } },
      { _id: 1, questionSetId: 1 }
    ).lean();

    const countMap = {};
    const idsMap = {};
    for (const q of questionsBySet) {
      const sId = q.questionSetId.toString();
      countMap[sId] = (countMap[sId] || 0) + 1;
      if (!idsMap[sId]) idsMap[sId] = [];
      idsMap[sId].push(q._id);
    }

    const hydratedSets = questionSets.map((s) => {
      const sId = s._id.toString();
      const actualIds = idsMap[sId] || [];
      const questionCount = countMap[sId] || 0;
      return {
        ...s,
        questionIds: actualIds,
        questionCount,
      };
    });

    res.json({ questionSets: hydratedSets });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /question-sets/:setId ───────────────────────────────────────────────
const updateQuestionSet = async (req, res, next) => {
  try {
    const { setId } = req.params;
    const { name, testType } = req.body;

    const questionSet = await QuestionSet.findById(setId);
    if (!questionSet) {
      return res.status(404).json({ error: 'QuestionSet not found' });
    }

    // 1. Validate and update name if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Question Set name cannot be empty' });
      }
      questionSet.name = name.trim();
    }

    // 2. Validate and update testType if changed
    if (testType !== undefined && testType !== questionSet.testType) {
      const validTypes = ['SPOJ', 'REACT', 'JAVASCRIPT', 'AI_TEST'];
      if (!validTypes.includes(testType)) {
        return res.status(400).json({ error: `Invalid testType. Must be one of: ${validTypes.join(', ')}` });
      }

      // Check if this Question Set is already assigned to any existing Test
      const assignedTest = await Test.findOne({ questionSetId: setId });
      if (assignedTest) {
        return res.status(400).json({
          error: `Cannot change test type: This Question Set is assigned to test "${assignedTest.title}" (${assignedTest.testType}).`,
        });
      }

      // Check if this Question Set already contains questions
      const questionCount = await Question.countDocuments({ questionSetId: setId });
      if (questionCount > 0) {
        return res.status(400).json({
          error: `Cannot change test type: This Question Set contains ${questionCount} existing question(s).`,
        });
      }

      questionSet.testType = testType;
    }

    await questionSet.save();
    await questionSet.populate('createdBy', 'name email');

    res.json({ questionSet });
  } catch (err) {
    next(err);
  }
};

// ── POST /question-sets/:setId/questions ─────────────────────────────────────
// AC: Reject with 400 if visibleTestCases or hiddenTestCases is empty (FR-4.1)
const createQuestion = async (req, res, next) => {
  try {
    const { setId } = req.params;
    const {
      title,
      description,
      difficulty,
      inputFormat,
      outputFormat,
      constraints,
      visibleTestCases,
      hiddenTestCases,
      aiTestBriefFiles,
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'title and description are required' });
    }

    // FR-4.1: Must have at least 1 visible AND 1 hidden test case
    if (!visibleTestCases || visibleTestCases.length === 0) {
      return res.status(400).json({ error: 'At least 1 visible test case is required (FR-4.1)' });
    }
    if (!hiddenTestCases || hiddenTestCases.length === 0) {
      return res.status(400).json({ error: 'At least 1 hidden test case is required (FR-4.1)' });
    }

    const questionSet = await QuestionSet.findById(setId);
    if (!questionSet) return res.status(404).json({ error: 'QuestionSet not found' });

    const question = await Question.create({
      questionSetId: setId,
      testType: questionSet.testType,
      title,
      description,
      difficulty: difficulty || undefined,
      inputFormat: inputFormat || undefined,
      outputFormat: outputFormat || undefined,
      constraints: constraints || undefined,
      visibleTestCases: visibleTestCases || [],
      hiddenTestCases: hiddenTestCases || [],
      aiTestBriefFiles: aiTestBriefFiles || [],
    });

    // Add question to set's questionIds array
    await QuestionSet.findByIdAndUpdate(setId, { $addToSet: { questionIds: question._id } });

    res.status(201).json({ question });
  } catch (err) {
    next(err);
  }
};

// ── GET /question-sets/:setId/questions ───────────────────────────────────────
// AC: hiddenTestCases excluded from response for candidate-authenticated requests (FR-4.2)
const getQuestions = async (req, res, next) => {
  try {
    const { setId } = req.params;
    const isAdmin = req.user && req.user.type === 'admin';

    // FR-4.2: Never return hiddenTestCases to candidates
    const projection = isAdmin ? {} : { hiddenTestCases: 0 };
    const questions = await Question.find({ questionSetId: setId }, projection);
    res.json({ questions });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /questions/:questionId ──────────────────────────────────────────────
const updateQuestion = async (req, res, next) => {
  try {
    const disallowed = ['_id', 'questionSetId', 'testType', 'createdAt'];
    disallowed.forEach((k) => delete req.body[k]);

    // Validate test cases if being updated
    if (req.body.visibleTestCases !== undefined && req.body.visibleTestCases.length === 0) {
      return res.status(400).json({ error: 'At least 1 visible test case is required (FR-4.1)' });
    }
    if (req.body.hiddenTestCases !== undefined && req.body.hiddenTestCases.length === 0) {
      return res.status(400).json({ error: 'At least 1 hidden test case is required (FR-4.1)' });
    }

    const question = await Question.findByIdAndUpdate(req.params.questionId, req.body, {
      new: true,
      runValidators: true,
    });
    if (!question) return res.status(404).json({ error: 'Question not found' });
    res.json({ question });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /questions/:questionId ─────────────────────────────────────────────
const deleteQuestion = async (req, res, next) => {
  try {
    const question = await Question.findByIdAndDelete(req.params.questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    // Remove from QuestionSet's questionIds array
    await QuestionSet.findByIdAndUpdate(question.questionSetId, {
      $pull: { questionIds: question._id },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /question-sets/:setId ─────────────────────────────────────────────
const deleteQuestionSet = async (req, res, next) => {
  try {
    const { setId } = req.params;
    const questionSet = await QuestionSet.findById(setId);
    if (!questionSet) {
      return res.status(404).json({ error: 'Question Set not found' });
    }

    // Check if this Question Set is assigned to any existing Test
    const assignedTest = await Test.findOne({ questionSetId: setId });
    if (assignedTest) {
      return res.status(400).json({
        error: `Cannot delete Question Set: It is assigned to test "${assignedTest.title}".`,
      });
    }

    // Delete associated questions from Question collection
    await Question.deleteMany({ questionSetId: setId });

    // Delete the Question Set
    await QuestionSet.findByIdAndDelete(setId);

    res.json({ success: true, message: 'Question set deleted successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createQuestionSet,
  getQuestionSets,
  updateQuestionSet,
  deleteQuestionSet,
  createQuestion,
  getQuestions,
  updateQuestion,
  deleteQuestion,
};
