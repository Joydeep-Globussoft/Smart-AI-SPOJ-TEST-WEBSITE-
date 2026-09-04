// Submission Controller — Module 3 (Standard Coding) + Module 4 (AI Test)
// Implements all endpoints from Section 9.5 exactly
const Test = require('../models/Test');
const Room = require('../models/Room');
const Question = require('../models/Question');
const QuestionSet = require('../models/QuestionSet');
const Submission = require('../models/Submission');
const Candidate = require('../models/Candidate');
const judge0Service = require('../services/judge0Service');

// BUG-21: Tentative Time = MAX remaining time (candidateEndTime - now) among candidates currently IN_PROGRESS
const broadcastTentativeTime = async (io, testId, targetRoomId = null) => {
  if (!io) return;
  try {
    const now = Date.now();
    const activeSubmissions = await Submission.find({
      testId,
      status: 'IN_PROGRESS',
      candidateEndTime: { $gt: new Date(now) },
    }, { roomId: 1, candidateEndTime: 1 });

    let overallMaxMs = 0;
    let roomMaxMs = 0;

    for (const sub of activeSubmissions) {
      if (sub.candidateEndTime) {
        const rem = Math.max(0, new Date(sub.candidateEndTime).getTime() - now);
        if (rem > overallMaxMs) overallMaxMs = rem;
        if (targetRoomId && sub.roomId?.toString() === targetRoomId.toString() && rem > roomMaxMs) {
          roomMaxMs = rem;
        }
      }
    }

    // ASSUMPTION: If no candidates in progress, remaining time is 0 / null ("—" or "Not started" placeholder)
    io.to(`test:${testId}:admin`).emit('room:tentative-time', {
      testId: testId.toString(),
      roomId: targetRoomId ? targetRoomId.toString() : null,
      roomTentativeTimeRemainingMs: roomMaxMs,
      overallTentativeTimeRemainingMs: overallMaxMs,
    });
  } catch (err) {
    console.error('[TentativeTime] broadcast error:', err);
  }
};

// BUG-54: Helper to find any active, unsubmitted, unexpired exam session for a candidate on another test
const getActiveExamSessionForCandidate = async (candidateId, excludeTestId = null) => {
  if (!candidateId) return null;
  const now = new Date();

  const query = {
    candidateId,
    candidateStartTime: { $ne: null },
    status: 'IN_PROGRESS',
    candidateEndTime: { $gt: now },
  };
  if (excludeTestId) {
    query.testId = { $ne: excludeTestId };
  }

  const activeSubmissions = await Submission.find(query)
    .populate('testId', 'title testType status durationMinutes')
    .lean();

  if (!activeSubmissions || activeSubmissions.length === 0) {
    return null;
  }

  for (const sub of activeSubmissions) {
    const parentTest = sub.testId;
    if (!parentTest || parentTest.status === 'ENDED') {
      continue;
    }
    return {
      testId: parentTest._id,
      title: parentTest.title || 'Ongoing Test',
      testType: parentTest.testType,
      candidateStartTime: sub.candidateStartTime,
      candidateEndTime: sub.candidateEndTime,
    };
  }

  return null;
};

// ── POST /rooms/join ──────────────────────────────────────────────────────────
// Body: { roomCode, roomPassword }
// Response: { test, room, instructions }
// AC: 403 if now > passwordValidUntil (FR-3.3)
const joinRoom = async (req, res, next) => {
  try {
    const { roomCode, roomPassword } = req.body;
    if (!roomCode || !roomPassword) {
      return res.status(400).json({ error: 'roomCode and roomPassword are required' });
    }

    const room = await Room.findOne({ roomCode });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // BUG-54: Prevent candidate from joining a new room/test if they already have an active session on another test
    const activeOtherSession = await getActiveExamSessionForCandidate(req.user.id, room.testId);
    if (activeOtherSession) {
      return res.status(409).json({
        error: `You have an active exam in progress ("${activeOtherSession.title}"). Please finish or exit it before starting another test.`,
        code: 'ACTIVE_SESSION_EXISTS_OTHER_TEST',
        activeTest: {
          _id: activeOtherSession.testId,
          title: activeOtherSession.title,
          testType: activeOtherSession.testType,
        },
      });
    }

    // BUG-22: Check parent test status first — block joins if test is not LIVE regardless of room status or timer
    const test = await Test.findById(room.testId).populate('questionSetId');
    if (!test) return res.status(404).json({ error: 'Test not found' });

    if (test.status === 'ENDED') {
      return res.status(403).json({ error: 'This test is no longer active' });
    }
    if (test.status !== 'LIVE') {
      return res.status(403).json({ error: 'This test has not started yet' });
    }

    if (room.status === 'CLOSED') {
      return res.status(403).json({ error: 'Room is closed' });
    }

    // Verify password
    if (room.roomPassword !== roomPassword) {
      return res.status(403).json({ error: 'Invalid room password' });
    }

    const candidate = await Candidate.findById(req.user.id);
    const hasManualOverride = candidate && candidate.manualJoinOverride === true;

    // Condition (b): now <= room.passwordValidUntil (bypassed if admin granted manualJoinOverride)
    if ((!room.passwordValidUntil || new Date() > room.passwordValidUntil) && !hasManualOverride) {
      return res.status(403).json({
        error: 'Room code expired',
        roomId: room._id,
        roomName: room.roomName,
        lateJoinRequestedAt: candidate?.lateJoinRequestedAt || null,
        manualJoinOverride: candidate?.manualJoinOverride || false,
      });
    }

    // Associate candidate with the room in DB
    const candidateId = req.user.id;
    await Room.findByIdAndUpdate(
      room._id,
      {
        $addToSet: { joinedCandidates: { candidateId, joinedAt: new Date() } },
      }
    );

    // If manualJoinOverride was active, clear it now that candidate joined
    if (candidate && (candidate.manualJoinOverride || candidate.lateJoinRequestedAt)) {
      candidate.manualJoinOverride = false;
      candidate.lateJoinRequestedAt = null;
      candidate.lateJoinRoomId = null;
      await candidate.save();
    }

    // Broadcast real-time candidate join to admin monitoring channels
    const io = req.app.get('io');
    if (io) {
      io.to(`test:${room.testId}:admin`).emit('room:updated', {
        roomId: room._id,
        candidateId,
        action: 'CANDIDATE_JOINED',
      });
      io.to(`test:${room.testId}:admin`).emit('dashboard:update', {
        testId: room.testId,
        candidateId: candidateId.toString(),
        name: candidate?.name,
        email: candidate?.email,
        roomId: room._id.toString(),
        roomName: room.roomName || 'Assigned Room',
        status: 'NOT_STARTED',
        colorStatus: 'WHITE',
        questionsCompleted: 0,
        timeRemaining: 0,
        candidateStartTime: null,
        candidateEndTime: null,
      });
      io.to(`test:${room.testId}:admin`).emit('seatmap:status', {
        candidateId: candidateId.toString(),
        roomId: room._id.toString(),
        colorStatus: 'WHITE',
      });
    }

    res.json({
      test: {
        _id: test._id,
        title: test.title,
        testType: test.testType,
        durationMinutes: test.durationMinutes,
        totalQuestions: test.totalQuestions,
        supportedLanguages: test.supportedLanguages,
      },
      room: {
        _id: room._id,
        roomName: room.roomName,
        roomCode: room.roomCode,
      },
      instructions: test.instructions,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /tests/:testId/start-attempt ─────────────────────────────────────────
// AC: candidateStartTime = now, candidateEndTime = now + durationMinutes (FR-5.1)
// Response: { submissionSessionId, candidateStartTime, candidateEndTime, questions[] }
const startAttempt = async (req, res, next) => {
  try {
    const { testId } = req.params;
    const candidateId = req.user.id;

    const test = await Test.findById(testId).populate({
      path: 'questionSetId',
      populate: { path: 'questionIds' },
    });
    if (!test) return res.status(404).json({ error: 'Test not found' });
    if (test.status !== 'LIVE') {
      return res.status(403).json({ error: 'Test is not currently live' });
    }

    // BUG-54: Prevent candidate from starting a test if they already have an active session on another test
    const activeOtherSession = await getActiveExamSessionForCandidate(candidateId, testId);
    if (activeOtherSession) {
      return res.status(409).json({
        error: `You have an active exam in progress ("${activeOtherSession.title}"). Please finish or exit it before starting another test.`,
        code: 'ACTIVE_SESSION_EXISTS_OTHER_TEST',
        activeTest: {
          _id: activeOtherSession.testId,
          title: activeOtherSession.title,
          testType: activeOtherSession.testType,
        },
      });
    }

    const now = new Date();
    const crypto = require('crypto');
    const submissionSessionId = crypto.randomUUID();

    // Check if candidate already has active attempt for this test (BUG-53 Single-Session Enforcement)
    const existingSubmissions = await Submission.find({ candidateId, testId });
    const hasStartedAttempt = existingSubmissions.some((s) => Boolean(s.candidateStartTime));

    let candidateStartTime = null;
    let candidateEndTime = null;

    if (hasStartedAttempt) {
      // Preserve existing start and end times — do NOT reset timers (BUG-53)
      for (const s of existingSubmissions) {
        if (s.candidateStartTime && (!candidateStartTime || new Date(s.candidateStartTime) < candidateStartTime)) {
          candidateStartTime = new Date(s.candidateStartTime);
        }
        if (s.candidateEndTime && (!candidateEndTime || new Date(s.candidateEndTime) < candidateEndTime)) {
          candidateEndTime = new Date(s.candidateEndTime);
        }
      }
    }

    if (!candidateStartTime) {
      candidateStartTime = now;
    }
    if (!candidateEndTime) {
      candidateEndTime = new Date(now.getTime() + test.durationMinutes * 60 * 1000);
    }

    // Get questions from question set (visible test cases only — FR-4.2)
    const questionSet = test.questionSetId;
    const allQuestions = questionSet?.questionIds || [];
    // Limit to totalQuestions
    const questions = allQuestions.slice(0, test.totalQuestions).map((q) => ({
      _id: q._id,
      title: q.title,
      description: q.description,
      difficulty: q.difficulty,
      inputFormat: q.inputFormat,
      outputFormat: q.outputFormat,
      constraints: q.constraints,
      visibleTestCases: q.visibleTestCases, // visible only — hiddenTestCases excluded
      aiTestBriefFiles: q.aiTestBriefFiles,
      testType: q.testType,
    }));

    // Find the room for this candidate (from req.body or fallback to room where candidate joined)
    let targetRoomId = req.body?.roomId;
    if (!targetRoomId) {
      const candidateRoom = await Room.findOne({
        testId,
        'joinedCandidates.candidateId': candidateId,
      });
      if (candidateRoom) targetRoomId = candidateRoom._id;
    }

    if (targetRoomId) {
      await Room.findByIdAndUpdate(
        targetRoomId,
        {
          $addToSet: { joinedCandidates: { candidateId, joinedAt: now } },
        }
      );
    }

    // Single-Session Invalidation: If existing session is superseded by new tab, notify previous tab (BUG-53)
    const io = req.app.get('io');
    if (io && hasStartedAttempt) {
      console.log(`[Session] Candidate ${candidateId} resumed test ${testId} with new session ${submissionSessionId}. Superseding previous tabs.`);
      io.to(`candidate:${candidateId}`).emit('session:superseded', {
        candidateId: candidateId.toString(),
        testId: testId.toString(),
        newSessionId: submissionSessionId,
        message: 'Your exam session was opened in another tab or window. This session has been terminated.',
      });
    }

    // Create / ensure submissions for each question without overwriting existing code/progress
    let finalSubmissions = [];
    if (questions.length > 0) {
      const submissionPromises = questions.map(async (q) => {
        const existing = existingSubmissions.find(
          (s) => s.questionId?.toString() === q._id?.toString()
        );
        if (existing) {
          // If already existing, keep original code, files, status, and times intact
          return existing;
        }
        return await Submission.findOneAndUpdate(
          { candidateId, testId, questionId: q._id },
          {
            $set: {
              candidateId,
              testId,
              roomId: targetRoomId,
              questionId: q._id,
              candidateStartTime,
              candidateEndTime,
              status: 'IN_PROGRESS',
              visibleTestCasesTotal: q.visibleTestCases?.length || 0,
            },
          },
          { upsert: true, new: true }
        );
      });
      finalSubmissions = await Promise.all(submissionPromises);
    } else {
      // Fallback for tests without questions defined yet
      const placeholderQId = test.questionSetId?._id || test._id;
      const existing = existingSubmissions.find(
        (s) => s.questionId?.toString() === placeholderQId.toString()
      );
      if (existing) {
        finalSubmissions = [existing];
      } else {
        const sub = await Submission.findOneAndUpdate(
          { candidateId, testId, questionId: placeholderQId },
          {
            $set: {
              candidateId,
              testId,
              roomId: targetRoomId,
              questionId: placeholderQId,
              candidateStartTime,
              candidateEndTime,
              status: 'IN_PROGRESS',
            },
          },
          { upsert: true, new: true }
        );
        finalSubmissions = [sub];
      }
    }

    const msUntilEnd = Math.max(0, candidateEndTime.getTime() - now.getTime());

    // Server-side auto-submit timer (FR-5.6) — only schedule if not already past endTime
    if (!hasStartedAttempt && msUntilEnd > 0) {
      setTimeout(async () => {
        try {
          // Auto-submit all IN_PROGRESS submissions for this candidate/test
          const autoNow = new Date();
          await Submission.updateMany(
            { candidateId, testId, status: 'IN_PROGRESS' },
            { status: 'AUTO_SUBMITTED_TIME_UP', submittedAt: autoNow }
          );

          // Finalize any open CAMERA_DISCONNECTED malpractice logs
          const MalpracticeLog = require('../models/MalpracticeLog');
          const openLogs = await MalpracticeLog.find({
            candidateId,
            testId,
            violationType: 'CAMERA_DISCONNECTED',
            reconnectAt: null,
          });
          for (const openLog of openLogs) {
            const start = new Date(openLog.disconnectAt || openLog.detectedAt);
            openLog.reconnectAt = autoNow;
            openLog.durationSeconds = Math.max(1, Math.round((autoNow.getTime() - start.getTime()) / 1000));
            openLog.resolved = false;
            await openLog.save();
          }

          console.log(`[AutoSubmit] Candidate ${candidateId} test ${testId} auto-submitted at time-up`);

          if (io) {
            const Candidate = require('../models/Candidate');
            const cand = await Candidate.findById(candidateId, 'name');
            io.to(`test:${testId}:admin`).emit('candidate:submitted', {
              candidateId,
              candidateName: cand?.name || 'Unknown',
            });
            io.to(`test:${testId}:admin`).emit('seatmap:status', {
              candidateId: candidateId.toString(),
              roomId: targetRoomId ? targetRoomId.toString() : null,
              colorStatus: 'GREEN',
            });
            broadcastTentativeTime(io, testId, targetRoomId);
          }

          // Trigger evaluation
          const evaluationService = require('../services/evaluationService');
          evaluationService.evaluateCandidateSubmissions(candidateId, testId).catch(console.error);
        } catch (err) {
          console.error('[AutoSubmit] Error:', err);
        }
      }, msUntilEnd);
    }

    // Broadcast candidate status to admins with authoritative candidateStartTime/candidateEndTime
    if (io) {
      const Candidate = require('../models/Candidate');
      const Room = require('../models/Room');
      Promise.all([
        Candidate.findById(candidateId, 'name email'),
        targetRoomId ? Room.findById(targetRoomId, 'roomName') : null,
      ]).then(([cand, roomDoc]) => {
        const isSubmitted = finalSubmissions.every((s) => s.status === 'SUBMITTED' || s.status === 'AUTO_SUBMITTED_TIME_UP');
        const colorStatus = isSubmitted ? 'GREEN' : 'YELLOW';
        const payload = {
          candidateId: candidateId.toString(),
          name: cand?.name,
          email: cand?.email,
          roomId: targetRoomId ? targetRoomId.toString() : null,
          roomName: roomDoc?.roomName || 'Assigned Room',
          status: isSubmitted ? 'SUBMITTED' : 'IN_PROGRESS',
          colorStatus,
          questionsCompleted: finalSubmissions.filter((s) => s.status === 'SUBMITTED').length,
          timeRemaining: msUntilEnd,
          candidateStartTime,
          candidateEndTime,
        };
        io.to(`test:${testId}:admin`).emit('dashboard:update', payload);
        io.to(`test:${testId}:admin`).emit('seatmap:status', {
          candidateId: candidateId.toString(),
          roomId: targetRoomId ? targetRoomId.toString() : null,
          colorStatus,
        });
        // BUG-21 & BUG-53: Broadcast continuous Tentative Time based on authoritative endTime
        broadcastTentativeTime(io, testId, targetRoomId);
      }).catch(() => {});
    }

    res.json({
      submissionSessionId,
      candidateStartTime,
      candidateEndTime,
      questions,
      submissions: finalSubmissions.map((s) => ({
        questionId: s.questionId,
        code: s.code,
        language: s.language,
        savedCodeByLanguage: s.savedCodeByLanguage || {},
        filesJson: s.filesJson || {},
        promptLog: s.promptLog || [],
        status: s.status,
      })),
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /tests/:testId/questions/:questionId ──────────────────────────────────
// visibleTestCases only (FR-4.2)
const getQuestion = async (req, res, next) => {
  try {
    // FR-4.2: Never return hiddenTestCases to candidates
    const projection = req.user.type === 'admin' ? {} : { hiddenTestCases: 0 };
    const question = await Question.findById(req.params.questionId, projection);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    let submission = null;
    if (req.user?.id) {
      submission = await Submission.findOne(
        { candidateId: req.user.id, questionId: req.params.questionId },
        { code: 1, language: 1, savedCodeByLanguage: 1, status: 1 }
      );
    }

    res.json({ question, submission });
  } catch (err) {
    next(err);
  }
};

// ── POST /submissions/:questionId/run ─────────────────────────────────────────
// Proxy to Judge0, does NOT persist (Section 9.5)
const runCode = async (req, res, next) => {
  try {
    const { code, language, customInput, customTestCases } = req.body;
    const { questionId } = req.params;

    if (!code || !language) {
      return res.status(400).json({ error: 'code and language are required' });
    }

    const question = await Question.findById(questionId, { hiddenTestCases: 0 });
    if (!question) return res.status(404).json({ error: 'Question not found' });

    // Run against custom test cases, custom input, or admin visible test cases
    let testCases;
    let isCustom = false;
    if (Array.isArray(customTestCases) && customTestCases.length > 0) {
      testCases = customTestCases.map((tc) => ({
        input: typeof tc === 'string' ? tc : (tc.input || ''),
        expectedOutput: tc.expectedOutput || '',
      }));
      isCustom = true;
    } else if (customInput !== undefined && customInput !== null && customInput !== '') {
      testCases = [{ input: customInput, expectedOutput: '' }];
      isCustom = true;
    } else {
      testCases = question.visibleTestCases || [];
    }

    const results = await judge0Service.runAgainstTestCases(code, language, testCases);

    const output = results[0]?.stdout || results[0]?.stderr || results[0]?.compile_output || '';
    let maxTimeMs = 0;
    const visibleTestResults = results.map((r, i) => {
      const timeMs = r.time ? Math.round(parseFloat(r.time) * 1000) : 0;
      if (timeMs > maxTimeMs) maxTimeMs = timeMs;
      const expected = testCases[i]?.expectedOutput?.trim();
      const actual = r.stdout?.trim();
      return {
        input: testCases[i]?.input,
        expectedOutput: testCases[i]?.expectedOutput,
        actualOutput: actual,
        passed: isCustom ? true : (expected !== undefined && expected !== '' && actual === expected),
        error: r.stderr || r.compile_output,
        status: r.status?.description,
        timeMs,
        isCustom,
      };
    });

    res.json({ output, visibleTestResults, runtimeMs: maxTimeMs, isCustom });
  } catch (err) {
    next(err);
  }
};

// ── POST /submissions/:questionId/save ────────────────────────────────────────
// Autosave — no evaluation (Section 9.5, NFR: autosave every 30s)
const saveCode = async (req, res, next) => {
  try {
    const { code, language } = req.body;
    const { questionId } = req.params;
    const candidateId = req.user.id;

    const savedAt = new Date();
    const lang = language || 'python';
    // ASSUMPTION: Update both active code/language and per-language savedCodeByLanguage map
    const update = {
      code: code ?? '',
      language: lang,
      [`savedCodeByLanguage.${lang}`]: code ?? '',
    };

    const submission = await Submission.findOneAndUpdate(
      { candidateId, questionId },
      {
        $set: update,
        $setOnInsert: { status: 'IN_PROGRESS' },
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      savedAt,
      code: code ?? '',
      language: lang,
      savedCodeByLanguage: submission?.savedCodeByLanguage || {},
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /submissions/:questionId/submit ──────────────────────────────────────
// Final submit — triggers evaluation worker
const submitCode = async (req, res, next) => {
  try {
    const { code, language } = req.body;
    const { questionId } = req.params;
    const candidateId = req.user.id;

    if (!code || !language) {
      return res.status(400).json({ error: 'code and language are required' });
    }

    const question = await Question.findById(questionId, { hiddenTestCases: 0 });
    if (!question) return res.status(404).json({ error: 'Question not found' });

    // Run visible test cases for immediate feedback
    const visibleResults = await judge0Service.runAgainstTestCases(
      code,
      language,
      question.visibleTestCases
    );
    const visiblePassed = visibleResults.filter(
      (r) => r.stdout?.trim() === question.visibleTestCases[visibleResults.indexOf(r)]?.expectedOutput?.trim()
    ).length;

    // Update submission
    const submission = await Submission.findOneAndUpdate(
      { candidateId, questionId },
      {
        code,
        language,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        visibleTestCasesPassed: visiblePassed,
        visibleTestCasesTotal: question.visibleTestCases.length,
      },
      { new: true, upsert: false }
    );

    if (!submission) {
      return res.status(404).json({ error: 'Submission session not found. Call start-attempt first.' });
    }

    // Enqueue evaluation worker (async — don't block response)
    const evaluationService = require('../services/evaluationService');
    evaluationService.evaluateSingleSubmission(submission._id.toString()).catch(console.error);

    // Broadcast progress update via Socket.io
    const io = req.app.get('io');
    io.to(`test:${submission.testId}:admin`).emit('dashboard:update', {
      candidateId,
      roomId: submission.roomId,
      questionsCompleted: visiblePassed / Math.max(question.visibleTestCases.length, 1),
    });

    res.json({ submission });
  } catch (err) {
    next(err);
  }
};

// ── POST /tests/:testId/submit-all ────────────────────────────────────────────
// Final full-test submit (or auto-triggered at time-up)
const submitAll = async (req, res, next) => {
  try {
    const { testId } = req.params;
    const candidateId = req.user.id;

    // Mark all IN_PROGRESS submissions as submitted
    const now = new Date();
    await Submission.updateMany(
      { candidateId, testId, status: 'IN_PROGRESS' },
      { status: 'SUBMITTED', submittedAt: now }
    );

    // Finalize any open CAMERA_DISCONNECTED malpractice logs (camera never reconnected before test submission)
    const MalpracticeLog = require('../models/MalpracticeLog');
    const openLogs = await MalpracticeLog.find({
      candidateId,
      testId,
      violationType: 'CAMERA_DISCONNECTED',
      reconnectAt: null,
    });
    for (const openLog of openLogs) {
      const start = new Date(openLog.disconnectAt || openLog.detectedAt);
      openLog.reconnectAt = now;
      openLog.durationSeconds = Math.max(1, Math.round((now.getTime() - start.getTime()) / 1000));
      openLog.resolved = false;
      await openLog.save();
    }

    // Emit candidate:submitted to admin room (Section 10.2)
    const io = req.app.get('io');
    // Get candidate name for announcement
    const Candidate = require('../models/Candidate');
    const candidate = await Candidate.findById(candidateId, 'name');
    io.to(`test:${testId}:admin`).emit('candidate:submitted', {
      candidateId,
      candidateName: candidate?.name || 'Unknown',
    });

    // BUG-21: Broadcast updated Tentative Time and seatmap status immediately on candidate submit
    Submission.findOne({ candidateId, testId }, { roomId: 1 }).then((s) => {
      broadcastTentativeTime(io, testId, s?.roomId);
      if (io && s?.roomId) {
        io.to(`test:${testId}:admin`).emit('seatmap:status', {
          candidateId: candidateId.toString(),
          roomId: s.roomId.toString(),
          colorStatus: 'GREEN',
        });
      }
    }).catch(() => {});

    // Trigger evaluation for all submissions
    const evaluationService = require('../services/evaluationService');
    evaluationService.evaluateCandidateSubmissions(candidateId, testId).catch(console.error);

    // BUG-30 Part A: Check if test should auto-transition to ENDED now that this candidate submitted
    const { checkAndAutoEndTest } = require('../services/testLifecycleService');
    checkAndAutoEndTest(testId, io).catch(console.error);

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  joinRoom,
  startAttempt,
  getQuestion,
  runCode,
  saveCode,
  submitCode,
  submitAll,
  broadcastTentativeTime,
};
