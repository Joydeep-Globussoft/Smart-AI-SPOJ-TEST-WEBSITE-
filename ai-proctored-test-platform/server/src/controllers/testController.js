// Test Controller — Module 2
// Implements all endpoints from Section 9.2 exactly
const Test = require('../models/Test');
const Room = require('../models/Room');
const shortlistService = require('../services/shortlistService');

// ── POST /tests ───────────────────────────────────────────────────────────────
// AC: Test is created in DRAFT status until explicitly started (FR-2.1)
const createTest = async (req, res, next) => {
  try {
    const {
      title,
      testType,
      questionSetId,
      durationMinutes,
      passingCriteria,
      instructions,
      startTestWindowMinutes,
      supportedLanguages,
    } = req.body;

    if (!title || !testType || !questionSetId || !durationMinutes || passingCriteria === undefined || passingCriteria === null || !instructions) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const Question = require('../models/Question');
    const QuestionSet = require('../models/QuestionSet');

    const questionSet = await QuestionSet.findById(questionSetId);
    if (!questionSet) {
      return res.status(404).json({ error: 'Selected Question Set not found' });
    }

    // Authoritative question count from Question collection (BUG-60)
    const actualQuestionCount = await Question.countDocuments({ questionSetId });
    if (actualQuestionCount <= 0) {
      return res.status(400).json({
        error: 'Selected Question Set contains 0 questions. Please add questions to the set before creating a test.',
      });
    }

    const parsedPassingCriteria = Number(passingCriteria);
    if (isNaN(parsedPassingCriteria) || parsedPassingCriteria < 0) {
      return res.status(400).json({ error: 'Passing criteria must be a non-negative number' });
    }
    if (parsedPassingCriteria > actualQuestionCount) {
      return res.status(400).json({
        error: `Passing criteria (${parsedPassingCriteria}) cannot exceed total questions in the set (${actualQuestionCount}).`,
      });
    }

    const test = await Test.create({
      title,
      testType,
      questionSetId,
      durationMinutes,
      totalQuestions: actualQuestionCount, // Strictly locked to question set's real count (BUG-60)
      passingCriteria: parsedPassingCriteria,
      instructions,
      startTestWindowMinutes: startTestWindowMinutes || 10,
      supportedLanguages: supportedLanguages || [],
      createdBy: req.user.id,
      status: 'DRAFT', // FR-2.1: always DRAFT on creation
    });

    res.status(201).json({ test });
  } catch (err) {
    next(err);
  }
};

// ── GET /tests ────────────────────────────────────────────────────────────────
const getTests = async (req, res, next) => {
  try {
    // BUG-30 Part A: Opportunistically check and auto-end any completed LIVE tests
    const { checkAndAutoEndAllLiveTests } = require('../services/testLifecycleService');
    await checkAndAutoEndAllLiveTests(req.app.get('io'));

    const tests = await Test.find()
      .populate('createdBy', 'name email')
      .populate('questionSetId', 'name testType')
      .sort({ createdAt: -1 });
    res.json({ tests });
  } catch (err) {
    next(err);
  }
};

// ── GET /tests/:testId ────────────────────────────────────────────────────────
const getTest = async (req, res, next) => {
  try {
    // BUG-30 Part A: Opportunistically check and auto-end if this test has completed
    const { checkAndAutoEndTest } = require('../services/testLifecycleService');
    await checkAndAutoEndTest(req.params.testId, req.app.get('io'));

    let test = await Test.findById(req.params.testId)
      .populate('createdBy', 'name email')
      .populate('questionSetId', 'name testType questionIds');
    if (!test) return res.status(404).json({ error: 'Test not found' });

    // Backfill lifecycle timestamps for older tests that transitioned before these fields were added
    let needsSave = false;
    if ((test.status === 'LIVE' || test.status === 'ENDED') && !test.liveStartedAt) {
      // ASSUMPTION: If liveStartedAt is missing on a LIVE/ENDED test, derive from earliest room or createdAt
      const earliestRoom = await Room.findOne({ testId: test._id }).sort({ createdAt: 1 });
      if (earliestRoom) {
        if (earliestRoom.passwordValidUntil) {
          test.liveStartedAt = new Date(
            new Date(earliestRoom.passwordValidUntil).getTime() - (test.startTestWindowMinutes || 10) * 60 * 1000
          );
        } else {
          test.liveStartedAt = earliestRoom.createdAt;
        }
      } else {
        test.liveStartedAt = test.createdAt;
      }
      needsSave = true;
    }

    if (test.status === 'ENDED' && !test.endedAt) {
      // ASSUMPTION: If endedAt is missing on an ENDED test, derive from updatedAt
      test.endedAt = test.updatedAt || new Date();
      needsSave = true;
    }

    if (needsSave) {
      await test.save();
    }

    res.json({ test });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /tests/:testId ──────────────────────────────────────────────────────
const updateTest = async (req, res, next) => {
  try {
    const existing = await Test.findById(req.params.testId);
    if (!existing) return res.status(404).json({ error: 'Test not found' });

    // BUG-39: Editing is strictly DRAFT-only. Disallow updates once LIVE or ENDED.
    if (existing.status !== 'DRAFT') {
      return res.status(403).json({
        error: `Test configuration can only be edited while in DRAFT status. Current status: ${existing.status}.`,
      });
    }

    // Disallow direct status/system field manipulation via this generic PATCH
    const disallowed = ['status', 'createdBy', '_id', 'liveStartedAt', 'endedAt'];
    disallowed.forEach((k) => delete req.body[k]);

    // Input validations
    if (req.body.title !== undefined && !req.body.title.trim()) {
      return res.status(400).json({ error: 'Test title cannot be empty' });
    }
    if (req.body.durationMinutes !== undefined && req.body.durationMinutes <= 0) {
      return res.status(400).json({ error: 'Duration must be greater than 0' });
    }
    if (req.body.totalQuestions !== undefined && req.body.totalQuestions <= 0) {
      return res.status(400).json({ error: 'Total questions must be greater than 0' });
    }
    if (req.body.startTestWindowMinutes !== undefined && req.body.startTestWindowMinutes <= 0) {
      return res.status(400).json({ error: 'Start window must be greater than 0' });
    }
    if (
      req.body.supportedLanguages !== undefined &&
      (!Array.isArray(req.body.supportedLanguages) || req.body.supportedLanguages.length === 0)
    ) {
      return res.status(400).json({ error: 'At least one supported language must be selected' });
    }
    if (req.body.instructions !== undefined && !req.body.instructions.trim()) {
      return res.status(400).json({ error: 'Instructions cannot be empty' });
    }

    // If questionSetId is updated, derive totalQuestions from the new set (BUG-60)
    if (req.body.questionSetId) {
      const Question = require('../models/Question');
      const questionCount = await Question.countDocuments({ questionSetId: req.body.questionSetId });
      if (questionCount <= 0) {
        return res.status(400).json({
          error: 'Selected Question Set contains 0 questions. Please add questions to the set before assigning.',
        });
      }
      req.body.totalQuestions = questionCount;
      if (existing.passingCriteria > questionCount) {
        req.body.passingCriteria = questionCount;
      }
    }

    const test = await Test.findByIdAndUpdate(req.params.testId, req.body, {
      new: true,
      runValidators: true,
    })
      .populate('createdBy', 'name email')
      .populate('questionSetId', 'name testType questionIds');

    if (!test) return res.status(404).json({ error: 'Test not found' });
    res.json({ test });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /tests/:testId/passing-criteria ─────────────────────────────────────
// AC: On change, shortlist is recalculated immediately and automatically (FR-2.2)
const updatePassingCriteria = async (req, res, next) => {
  try {
    const { passingCriteria } = req.body;
    if (passingCriteria === undefined || passingCriteria === null) {
      return res.status(400).json({ error: 'passingCriteria is required' });
    }

    const numericCriteria = Number(passingCriteria);
    if (isNaN(numericCriteria) || numericCriteria < 0) {
      return res.status(400).json({ error: 'Passing criteria must be a non-negative number' });
    }

    const existingTest = await Test.findById(req.params.testId);
    if (!existingTest) return res.status(404).json({ error: 'Test not found' });

    // Validate passingCriteria does not exceed totalQuestions (BUG-60)
    if (numericCriteria > existingTest.totalQuestions) {
      return res.status(400).json({
        error: `Passing criteria (${numericCriteria}) cannot exceed total questions (${existingTest.totalQuestions}).`,
      });
    }

    existingTest.passingCriteria = numericCriteria;
    await existingTest.save();

    // FR-2.2: Auto-trigger shortlist regeneration if test has ended
    if (existingTest.status === 'ENDED') {
      await shortlistService.regenerate(existingTest._id.toString());
    }

    res.json({ test: existingTest });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /tests/:testId/malpractice-threshold ────────────────────────────────
// AC: Only settable after test is ENDED; immediately re-evaluates shortlist (FR-2.3)
const updateMalpracticeThreshold = async (req, res, next) => {
  try {
    const { malpracticeDisqualifyThreshold } = req.body;
    if (malpracticeDisqualifyThreshold === undefined) {
      return res.status(400).json({ error: 'malpracticeDisqualifyThreshold is required' });
    }

    const existingTest = await Test.findById(req.params.testId);
    if (!existingTest) return res.status(404).json({ error: 'Test not found' });

    // AC: Only allowed after test has ENDED (FR-2.3)
    if (existingTest.status !== 'ENDED') {
      return res.status(400).json({ error: 'malpracticeDisqualifyThreshold can only be set after test has ENDED' });
    }

    const test = await Test.findByIdAndUpdate(
      req.params.testId,
      { malpracticeDisqualifyThreshold },
      { new: true, runValidators: true }
    );

    // FR-7.5: Re-evaluate all candidates' malpractice counts, update shortlist
    const updatedShortlist = await shortlistService.regenerate(test._id.toString());

    res.json({ test, updatedShortlist });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /tests/:testId ─────────────────────────────────────────────────────
const deleteTest = async (req, res, next) => {
  try {
    const test = await Test.findByIdAndDelete(req.params.testId);
    if (!test) return res.status(404).json({ error: 'Test not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── POST /tests/:testId/start ─────────────────────────────────────────────────
// Sets status to LIVE (Section 9.2, §12.1 flow)
const startTest = async (req, res, next) => {
  try {
    const now = new Date();
    const existing = await Test.findById(req.params.testId);
    if (!existing) return res.status(404).json({ error: 'Test not found' });

    const updates = { status: 'LIVE' };
    if (!existing.liveStartedAt) {
      updates.liveStartedAt = now;
    }
    const test = await Test.findByIdAndUpdate(req.params.testId, updates, { new: true });

    // Set / refresh passwordValidUntil = now + Test.startTestWindowMinutes for all rooms under this test
    const passwordValidUntil = new Date(
      now.getTime() + (test.startTestWindowMinutes || 10) * 60 * 1000
    );
    await Room.updateMany(
      { testId: test._id },
      { $set: { passwordValidUntil, status: 'ACTIVE' } }
    );

    // Broadcast to all admins watching this test
    const io = req.app.get('io');
    if (io) {
      io.to(`test:${test._id}:admin`).emit('test:started', { testId: test._id, status: 'LIVE' });
      io.to(`test:${test._id}:admin`).emit('room:updated', { testId: test._id, action: 'PASSWORD_WINDOW_STARTED' });
    }

    res.json({ test });
  } catch (err) {
    next(err);
  }
};

// ── POST /tests/:testId/end ───────────────────────────────────────────────────
// Sets status to ENDED; triggers final evaluation pass; broadcasts test:ended to candidates
const endTest = async (req, res, next) => {
  try {
    const { performEndTest } = require('../services/testLifecycleService');
    const test = await performEndTest(req.params.testId, req.app.get('io'), 'MANUAL');
    if (!test) return res.status(404).json({ error: 'Test not found' });
    res.json({ test });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createTest,
  getTests,
  getTest,
  updateTest,
  updatePassingCriteria,
  updateMalpracticeThreshold,
  deleteTest,
  startTest,
  endTest,
};
