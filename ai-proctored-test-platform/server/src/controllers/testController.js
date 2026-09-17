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
      questionSetPoolId,
      durationMinutes,
      passingCriteria,
      instructions,
      startTestWindowMinutes,
      supportedLanguages,
    } = req.body;

    if (!title || !testType || (!questionSetId && !questionSetPoolId) || !durationMinutes || passingCriteria === undefined || passingCriteria === null || !instructions) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const Question = require('../models/Question');
    const QuestionSet = require('../models/QuestionSet');
    const pdfStorageService = require('../services/pdfStorageService');

    let actualQuestionCount = 0;
    let finalQuestionSetId = null;
    let finalQuestionSetPoolId = null;

    if (questionSetPoolId) {
      // FEATURE-012: Pool-based Test creation
      const poolSets = await QuestionSet.find({ uploadBatchId: questionSetPoolId });
      if (!poolSets || poolSets.length === 0) {
        return res.status(400).json({ error: 'Selected Question Set Pool not found or contains no question sets.' });
      }

      // Query question counts for each set in the pool
      const setIds = poolSets.map((s) => s._id);
      const poolQuestions = await Question.find({ questionSetId: { $in: setIds } });
      const countMap = {};
      for (const q of poolQuestions) {
        const sId = q.questionSetId.toString();
        countMap[sId] = (countMap[sId] || 0) + 1;
      }

      const countDetails = poolSets.map((s) => ({
        setId: s._id,
        name: s.name,
        count: countMap[s._id.toString()] || 0,
      }));

      // Validation 1: No set in pool can have 0 questions
      const emptySets = countDetails.filter((d) => d.count === 0);
      if (emptySets.length > 0) {
        return res.status(400).json({
          error: `Selected Question Set Pool contains set(s) with 0 questions: ${emptySets.map((e) => `"${e.name}"`).join(', ')}. Please add questions before creating a test.`,
        });
      }

      // Validation 2: Every set in the pool must have identical question count
      const firstCount = countDetails[0].count;
      const isIdentical = countDetails.every((d) => d.count === firstCount);
      if (!isIdentical) {
        const mismatchList = countDetails.map((d) => `"${d.name}" (${d.count} Qs)`).join(', ');
        return res.status(400).json({
          error: `Question Set Pool validation failed: Question Sets in this pool have mismatched question counts: ${mismatchList}. All Question Sets in a pool must contain the exact same question count.`,
        });
      }

      // BUG-005: Validate PDF assets for all questions across all pool sets
      for (let i = 0; i < poolQuestions.length; i++) {
        const q = poolQuestions[i];
        if (q.isPdfImported) {
          const exists = await pdfStorageService.validateQuestionPdfExists(q.pdfFileName);
          if (!exists) {
            return res.status(400).json({
              error: `Cannot create test: Question in set (${q.pdfOriginalName || q.pdfFileName || 'PDF Question'}) is missing its PDF statement asset.`,
            });
          }
        }
      }

      actualQuestionCount = firstCount;
      finalQuestionSetPoolId = questionSetPoolId;
    } else {
      // Single Question Set mode
      const questionSet = await QuestionSet.findById(questionSetId);
      if (!questionSet) {
        return res.status(404).json({ error: 'Selected Question Set not found' });
      }

      // Authoritative question count from Question collection (BUG-60)
      const questionsInSet = await Question.find({ questionSetId });
      actualQuestionCount = questionsInSet.length;
      if (actualQuestionCount <= 0) {
        return res.status(400).json({
          error: 'Selected Question Set contains 0 questions. Please add questions to the set before creating a test.',
        });
      }

      // BUG-005: Validate that all assigned questions have accessible PDF statements
      for (let i = 0; i < questionsInSet.length; i++) {
        const q = questionsInSet[i];
        if (q.isPdfImported) {
          const exists = await pdfStorageService.validateQuestionPdfExists(q.pdfFileName);
          if (!exists) {
            return res.status(400).json({
              error: `Cannot create test: Question Q${i + 1} (${q.pdfOriginalName || q.pdfFileName || 'PDF Question'}) is missing its PDF statement asset.`,
            });
          }
        }
      }

      finalQuestionSetId = questionSetId;
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
      questionSetId: finalQuestionSetId,
      questionSetPoolId: finalQuestionSetPoolId,
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
    const io = req.app?.get ? req.app.get('io') : null;
    await checkAndAutoEndAllLiveTests(io);

    const tests = await Test.find()
      .populate('createdBy', 'name email')
      .populate('questionSetId', 'name testType')
      .sort({ createdAt: -1 })
      .lean();

    // Hydrate pool information for pool-based tests (FEATURE-012)
    const QuestionSet = require('../models/QuestionSet');
    const poolBatchIds = tests.filter((t) => t.questionSetPoolId).map((t) => t.questionSetPoolId);
    let poolSetsByBatch = {};
    if (poolBatchIds.length > 0) {
      const poolSets = await QuestionSet.find({ uploadBatchId: { $in: poolBatchIds } }, 'name uploadBatchId uploadBatchName testType').lean();
      for (const ps of poolSets) {
        if (!poolSetsByBatch[ps.uploadBatchId]) {
          poolSetsByBatch[ps.uploadBatchId] = [];
        }
        poolSetsByBatch[ps.uploadBatchId].push(ps);
      }
    }

    const enrichedTests = tests.map((t) => {
      if (t.questionSetPoolId) {
        const sets = poolSetsByBatch[t.questionSetPoolId] || [];
        const batchName = sets[0]?.uploadBatchName || `PDF Pool (${sets.length} Sets)`;
        return {
          ...t,
          isPool: true,
          poolSetCount: sets.length,
          questionSetPoolName: batchName,
          poolSets: sets.map((s) => ({ _id: s._id, name: s.name })),
        };
      }
      return t;
    });

    res.json({ tests: enrichedTests });
  } catch (err) {
    next(err);
  }
};

// ── GET /tests/:testId ────────────────────────────────────────────────────────
const getTest = async (req, res, next) => {
  try {
    // BUG-30 Part A: Opportunistically check and auto-end if this test has completed
    const { checkAndAutoEndTest } = require('../services/testLifecycleService');
    const io = req.app?.get ? req.app.get('io') : null;
    await checkAndAutoEndTest(req.params.testId, io);

    let test = await Test.findById(req.params.testId)
      .populate('createdBy', 'name email')
      .populate('questionSetId', 'name testType questionIds');
    if (!test) return res.status(404).json({ error: 'Test not found' });

    // Backfill lifecycle timestamps for older tests that transitioned before these fields were added
    let needsSave = false;
    if ((test.status === 'LIVE' || test.status === 'ENDED') && !test.liveStartedAt) {
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
      test.endedAt = test.updatedAt || new Date();
      needsSave = true;
    }

    if (needsSave) {
      await test.save();
    }

    const testObj = test.toObject();

    // Hydrate pool information if pool-based (FEATURE-012)
    if (test.questionSetPoolId) {
      const QuestionSet = require('../models/QuestionSet');
      const poolSets = await QuestionSet.find({ uploadBatchId: test.questionSetPoolId }, 'name uploadBatchId uploadBatchName testType').lean();
      testObj.isPool = true;
      testObj.poolSetCount = poolSets.length;
      testObj.questionSetPoolName = poolSets[0]?.uploadBatchName || `PDF Pool (${poolSets.length} Sets)`;
      testObj.poolSets = poolSets.map((s) => ({ _id: s._id, name: s.name }));
    }

    res.json({ test: testObj });
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

    const Question = require('../models/Question');
    const QuestionSet = require('../models/QuestionSet');
    const pdfStorageService = require('../services/pdfStorageService');

    // If Question Set Pool is changed (FEATURE-012)
    if (req.body.questionSetPoolId) {
      const poolSets = await QuestionSet.find({ uploadBatchId: req.body.questionSetPoolId });
      if (!poolSets || poolSets.length === 0) {
        return res.status(400).json({ error: 'Selected Question Set Pool not found or contains no question sets.' });
      }

      const setIds = poolSets.map((s) => s._id);
      const poolQuestions = await Question.find({ questionSetId: { $in: setIds } });
      const countMap = {};
      for (const q of poolQuestions) {
        const sId = q.questionSetId.toString();
        countMap[sId] = (countMap[sId] || 0) + 1;
      }

      const countDetails = poolSets.map((s) => ({
        setId: s._id,
        name: s.name,
        count: countMap[s._id.toString()] || 0,
      }));

      const emptySets = countDetails.filter((d) => d.count === 0);
      if (emptySets.length > 0) {
        return res.status(400).json({
          error: `Selected Question Set Pool contains set(s) with 0 questions: ${emptySets.map((e) => `"${e.name}"`).join(', ')}.`,
        });
      }

      const firstCount = countDetails[0].count;
      const isIdentical = countDetails.every((d) => d.count === firstCount);
      if (!isIdentical) {
        const mismatchList = countDetails.map((d) => `"${d.name}" (${d.count} Qs)`).join(', ');
        return res.status(400).json({
          error: `Question Set Pool validation failed: Question Sets in this pool have mismatched question counts: ${mismatchList}. All Question Sets in a pool must contain the exact same question count.`,
        });
      }

      // BUG-005: Validate PDF assets across all questions in pool
      for (let i = 0; i < poolQuestions.length; i++) {
        const q = poolQuestions[i];
        if (q.isPdfImported) {
          const exists = await pdfStorageService.validateQuestionPdfExists(q.pdfFileName);
          if (!exists) {
            return res.status(400).json({
              error: `Cannot update test: Question in pool is missing its PDF statement asset.`,
            });
          }
        }
      }

      req.body.questionSetId = null;
      req.body.totalQuestions = firstCount;
      if (existing.passingCriteria > firstCount) {
        req.body.passingCriteria = firstCount;
      }
    } else if (req.body.questionSetId) {
      // Single questionSetId is updated
      const questionsInSet = await Question.find({ questionSetId: req.body.questionSetId });
      const questionCount = questionsInSet.length;
      if (questionCount <= 0) {
        return res.status(400).json({
          error: 'Selected Question Set contains 0 questions. Please add questions to the set before assigning.',
        });
      }

      // BUG-005: Validate that all assigned questions have accessible PDF statements
      for (let i = 0; i < questionsInSet.length; i++) {
        const q = questionsInSet[i];
        if (q.isPdfImported) {
          const exists = await pdfStorageService.validateQuestionPdfExists(q.pdfFileName);
          if (!exists) {
            return res.status(400).json({
              error: `Cannot update test: Question Q${i + 1} (${q.pdfOriginalName || q.pdfFileName || 'PDF Question'}) is missing its PDF statement asset.`,
            });
          }
        }
      }

      req.body.questionSetPoolId = null;
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

    // BUG-73: Validate that at least one Physical Room exists before transitioning test to LIVE
    const roomCount = await Room.countDocuments({ testId: existing._id });
    if (roomCount === 0) {
      return res.status(400).json({
        error: 'Cannot start test: Add at least one Physical Room before making the test LIVE.',
      });
    }

    // BUG-005: Validate that all assigned questions have accessible PDF statements before going LIVE
    const Question = require('../models/Question');
    const QuestionSet = require('../models/QuestionSet');
    const pdfStorageService = require('../services/pdfStorageService');

    if (existing.questionSetPoolId) {
      const poolSets = await QuestionSet.find({ uploadBatchId: existing.questionSetPoolId });
      const poolSetIds = poolSets.map((s) => s._id);
      const poolQuestions = await Question.find({ questionSetId: { $in: poolSetIds } });
      for (let i = 0; i < poolQuestions.length; i++) {
        const q = poolQuestions[i];
        if (q.isPdfImported) {
          const exists = await pdfStorageService.validateQuestionPdfExists(q.pdfFileName);
          if (!exists) {
            return res.status(400).json({
              error: `Cannot start test: Question in pool set (${q.pdfOriginalName || q.pdfFileName || 'PDF Question'}) is missing its PDF statement asset.`,
            });
          }
        }
      }
    } else if (existing.questionSetId) {
      const questionsInSet = await Question.find({ questionSetId: existing.questionSetId });
      for (let i = 0; i < questionsInSet.length; i++) {
        const q = questionsInSet[i];
        if (q.isPdfImported) {
          const exists = await pdfStorageService.validateQuestionPdfExists(q.pdfFileName);
          if (!exists) {
            return res.status(400).json({
              error: `Cannot start test: Question Q${i + 1} (${q.pdfOriginalName || q.pdfFileName || 'PDF Question'}) is missing its PDF statement asset.`,
            });
          }
        }
      }
    }

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
