// Submission Controller — Module 3 (Standard Coding) + Module 4 (AI Test)
// Implements all endpoints from Section 9.5 exactly
const Test = require('../models/Test');
const Room = require('../models/Room');
const Question = require('../models/Question');
const QuestionSet = require('../models/QuestionSet');
const Submission = require('../models/Submission');
const Candidate = require('../models/Candidate');
const judge0Service = require('../services/judge0Service');
const { getCandidateCooldownStatus, recordCandidateTestFinish } = require('../utils/cooldownHelper');

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
// Body: { roomCode, roomPassword } OR { inviteToken } (FEATURE-015)
// Response: { test, room, instructions }
// AC: 403 if now > passwordValidUntil (FR-3.3)
const joinRoom = async (req, res, next) => {
  try {
    const { roomCode, roomPassword, inviteToken, roomId } = req.body;

    // FEATURE-032: Enforce 12-hour cooldown check before joining
    const cooldownStatus = await getCandidateCooldownStatus(req.user.id);
    if (cooldownStatus.inCooldown) {
      return res.status(403).json({
        error: cooldownStatus.message,
        cooldownRemainingMs: cooldownStatus.remainingMs,
        cooldownHours: cooldownStatus.hours,
        cooldownMinutes: cooldownStatus.minutes,
        eligibleAt: cooldownStatus.eligibleAt,
      });
    }

    let room;

    if (inviteToken) {
      room = await Room.findOne({ inviteToken });
      if (!room) return res.status(404).json({ error: 'Invite link is invalid or room not found' });
    } else if (roomId) {
      room = await Room.findById(roomId);
      if (!room) return res.status(404).json({ error: 'Room not found' });
      const candidateCheck = await Candidate.findById(req.user.id);
      const isCandidateOverridden = candidateCheck && candidateCheck.manualJoinOverride === true && (!candidateCheck.lateJoinRoomId || candidateCheck.lateJoinRoomId.toString() === room._id.toString());
      if (!isCandidateOverridden) {
        if (!roomPassword || room.roomPassword !== roomPassword) {
          return res.status(403).json({ error: 'Invalid room password' });
        }
      }
    } else {
      if (!roomCode || !roomPassword) {
        return res.status(400).json({ error: 'roomCode and roomPassword are required' });
      }
      room = await Room.findOne({ roomCode });
      if (!room) return res.status(404).json({ error: 'Room not found' });

      // Verify password
      if (room.roomPassword !== roomPassword) {
        return res.status(403).json({ error: 'Invalid room password' });
      }
    }

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
      return res.status(403).json({
        error: 'This test is no longer active',
        code: 'TEST_ENDED',
        roomId: room._id,
        roomName: room.roomName,
        testId: test._id,
        testTitle: test.title,
      });
    }
    if (test.status !== 'LIVE') {
      return res.status(403).json({
        error: 'This test has not started yet',
        code: 'TEST_NOT_STARTED',
        roomId: room._id,
        roomName: room.roomName,
        testId: test._id,
        testTitle: test.title,
      });
    }

    const candidateId = req.user.id;
    const isAlreadyJoined = Boolean(
      room.joinedCandidates?.some(
        (j) => j.candidateId && j.candidateId.toString() === candidateId.toString()
      )
    );

    const candidate = await Candidate.findById(candidateId);
    const hasManualOverride = candidate && candidate.manualJoinOverride === true && (!candidate.lateJoinRoomId || candidate.lateJoinRoomId.toString() === room._id.toString());

    // Condition (b): now <= room.passwordValidUntil (bypassed if admin granted manualJoinOverride or candidate already joined)
    if ((!room.passwordValidUntil || new Date() > room.passwordValidUntil) && !hasManualOverride && !isAlreadyJoined) {
      return res.status(403).json({
        error: 'Room code expired',
        roomId: room._id,
        roomName: room.roomName,
        lateJoinRequestedAt: candidate?.lateJoinRequestedAt || null,
        manualJoinOverride: candidate?.manualJoinOverride || false,
      });
    }

    // BUG-101: Enforce Room Capacity limit (if configured)
    if (!isAlreadyJoined && room.capacity && room.joinedCandidates) {
      if (room.joinedCandidates.length >= room.capacity) {
        return res.status(403).json({
          error: `This room is full (Capacity: ${room.capacity}). Please contact your administrator.`,
          code: 'ROOM_CAPACITY_FULL',
          roomId: room._id,
          roomName: room.roomName,
          testId: test._id,
          testTitle: test.title,
          capacity: room.capacity,
        });
      }
    }

    // Associate candidate with the room in DB and assign Question Set (FEATURE-012)
    let assignedQuestionSetId = null;
    let joinIndex = null;

    // Check if candidate already has an entry in this room (BUG-53 resume/reconnect)
    const existingJoinedEntry = room.joinedCandidates?.find(
      (j) => j.candidateId && j.candidateId.toString() === candidateId.toString()
    );

    if (existingJoinedEntry?.assignedQuestionSetId) {
      assignedQuestionSetId = existingJoinedEntry.assignedQuestionSetId;
      joinIndex = existingJoinedEntry.joinIndex;
    } else {
      const candidateJoinTime = candidate?.roomJoinedAt || candidate?.lastLoginAt || (candidate?.createdAt && new Date(candidate.createdAt) <= new Date() ? candidate.createdAt : new Date());
      const poolContainerId = test.folderId || test.questionSetPoolId;
      if (poolContainerId) {
        // Pool mode: deterministic round-robin per room
        const QuestionSet = require('../models/QuestionSet');
        const poolSets = await QuestionSet.find({
          $or: [
            { folderId: poolContainerId },
            { uploadBatchId: poolContainerId },
          ],
        }).sort({ createdAt: 1, _id: 1 });
        if (!poolSets || poolSets.length === 0) {
          return res.status(500).json({ error: 'Assigned Question Set Pool is invalid or empty.' });
        }

        const capacityCondition = room.capacity
          ? { $expr: { $lt: [{ $size: { $ifNull: ['$joinedCandidates', []] } }, room.capacity] } }
          : {};

        // Atomically increment candidateJoinCounter and push candidate in ONE single atomic operation (BUG-101)
        const nextCounter = (room.candidateJoinCounter || 0) + 1;
        const setIndex = (nextCounter - 1) % poolSets.length;
        assignedQuestionSetId = poolSets[setIndex]._id;
        joinIndex = nextCounter;

        const updatedRoom = await Room.findOneAndUpdate(
          {
            _id: room._id,
            'joinedCandidates.candidateId': { $ne: candidateId },
            ...capacityCondition,
          },
          {
            $inc: { candidateJoinCounter: 1 },
            $push: {
              joinedCandidates: {
                candidateId,
                joinedAt: candidateJoinTime,
                assignedQuestionSetId,
                joinIndex,
              },
            },
          },
          { new: true }
        );

        if (!updatedRoom) {
          const reloadedRoom = await Room.findById(room._id);
          const found = reloadedRoom?.joinedCandidates?.find(
            (j) => j.candidateId && j.candidateId.toString() === candidateId.toString()
          );
          if (found) {
            assignedQuestionSetId = found.assignedQuestionSetId || poolSets[0]._id;
            joinIndex = found.joinIndex || 1;
          } else {
            return res.status(403).json({
              error: `This room is full (Capacity: ${reloadedRoom?.capacity || room.capacity}). Please contact your administrator.`,
              code: 'ROOM_CAPACITY_FULL',
              roomId: room._id,
              roomName: room.roomName,
              testId: test._id,
              testTitle: test.title,
              capacity: reloadedRoom?.capacity || room.capacity,
            });
          }
        }
      } else {
        // Single set mode (BUG-101: bounded by room capacity in single atomic operation)
        const capacityCondition = room.capacity
          ? { $expr: { $lt: [{ $size: { $ifNull: ['$joinedCandidates', []] } }, room.capacity] } }
          : {};

        assignedQuestionSetId = test.questionSetId?._id || test.questionSetId;

        const updatedRoom = await Room.findOneAndUpdate(
          {
            _id: room._id,
            'joinedCandidates.candidateId': { $ne: candidateId },
            ...capacityCondition,
          },
          {
            $push: {
              joinedCandidates: {
                candidateId,
                joinedAt: candidateJoinTime,
                assignedQuestionSetId,
                joinIndex: 1,
              },
            },
          },
          { new: true }
        );

        if (!updatedRoom) {
          const reloadedRoom = await Room.findById(room._id);
          const found = reloadedRoom?.joinedCandidates?.find(
            (j) => j.candidateId && j.candidateId.toString() === candidateId.toString()
          );
          if (found) {
            assignedQuestionSetId = found.assignedQuestionSetId || test.questionSetId?._id || test.questionSetId;
            joinIndex = found.joinIndex || 1;
          } else {
            return res.status(403).json({
              error: `This room is full (Capacity: ${reloadedRoom?.capacity || room.capacity}). Please contact your administrator.`,
              code: 'ROOM_CAPACITY_FULL',
              roomId: room._id,
              roomName: room.roomName,
              testId: test._id,
              testTitle: test.title,
              capacity: reloadedRoom?.capacity || room.capacity,
            });
          }
        }
      }
    }

    // If manualJoinOverride was active, clear it now that candidate joined
    if (candidate && (candidate.manualJoinOverride || candidate.lateJoinRequestedAt)) {
      candidate.manualJoinOverride = false;
      candidate.lateJoinRequestedAt = null;
      candidate.lateJoinRoomId = null;
      await candidate.save();
    }

    // Broadcast real-time candidate join to admin monitoring channels
    const io = req.app?.get ? req.app.get('io') : null;
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
        passingCriteria: test.passingCriteria !== undefined && test.passingCriteria !== null ? test.passingCriteria : 1,
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
    const candidate = await Candidate.findById(candidateId);

    // Check if candidate already has active attempt for this test (BUG-53 Single-Session Enforcement)
    const existingSubmissions = await Submission.find({ candidateId, testId });
    const hasActiveAttempt = existingSubmissions.some((s) => s.status === 'IN_PROGRESS' && Boolean(s.candidateStartTime));
    const hasStartedAttempt = existingSubmissions.some((s) => Boolean(s.candidateStartTime));

    // FEATURE-032: If candidate does not have an active in-progress attempt for this test, enforce cooldown
    if (!hasActiveAttempt) {
      const cooldownStatus = await getCandidateCooldownStatus(candidateId);
      if (cooldownStatus.inCooldown) {
        return res.status(403).json({
          error: cooldownStatus.message,
          cooldownRemainingMs: cooldownStatus.remainingMs,
          cooldownHours: cooldownStatus.hours,
          cooldownMinutes: cooldownStatus.minutes,
          eligibleAt: cooldownStatus.eligibleAt,
        });
      }
    }

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

    // Find the room for this candidate (from req.body or fallback to room where candidate joined or test room)
    let targetRoomId = req.body?.roomId;
    let candidateRoom = null;
    if (targetRoomId) {
      candidateRoom = await Room.findById(targetRoomId);
    }
    if (!candidateRoom) {
      candidateRoom = await Room.findOne({
        testId,
        'joinedCandidates.candidateId': candidateId,
      }) || await Room.findOne({ testId });
      if (candidateRoom) targetRoomId = candidateRoom._id;
    }
    if (!candidateRoom) {
      candidateRoom = await Room.create({
        testId,
        roomCode: 'ROOM-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        status: 'ACTIVE',
        joinedCandidates: [{ candidateId, joinedAt: now }],
      });
      targetRoomId = candidateRoom._id;
    }

    // Resolve assignedQuestionSetId for this candidate (FEATURE-012)
    let assignedQuestionSetId = existingSubmissions[0]?.assignedQuestionSetId || null;
    if (!assignedQuestionSetId && candidateRoom) {
      const entry = candidateRoom.joinedCandidates?.find(
        (j) => j.candidateId && j.candidateId.toString() === candidateId.toString()
      );
      assignedQuestionSetId = entry?.assignedQuestionSetId || null;
    }

    // Fallback if not yet recorded
    if (!assignedQuestionSetId) {
      const poolContainerId = test.folderId || test.questionSetPoolId;
      if (poolContainerId) {
        const QuestionSet = require('../models/QuestionSet');
        const poolSets = await QuestionSet.find({
          $or: [
            { folderId: poolContainerId },
            { uploadBatchId: poolContainerId },
          ],
        }).sort({ createdAt: 1, _id: 1 });
        if (poolSets.length > 0) {
          assignedQuestionSetId = poolSets[0]._id;
        }
      } else {
        assignedQuestionSetId = test.questionSetId?._id || test.questionSetId;
      }
    }

    // Get questions from candidate's specific assigned question set (FR-4.2, BUG-59, FEATURE-009, FEATURE-012)
    let allQuestions = [];
    if (assignedQuestionSetId) {
      allQuestions = await Question.find({ questionSetId: assignedQuestionSetId });
    } else if (test.questionSetId) {
      const qSetId = test.questionSetId._id || test.questionSetId;
      allQuestions = await Question.find({ questionSetId: qSetId });
    }

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
      isPdfImported: Boolean(q.isPdfImported),
      pdfFileName: q.pdfFileName,
      pdfOriginalName: q.pdfOriginalName,
      pdfPageRange: q.pdfPageRange,
      isIncomplete: Boolean(q.isIncomplete),
    }));

    if (targetRoomId) {
      // BUG-019: Prevent duplicate joinedCandidates entries on test attempt starts/reconnects
      const candidateJoinTime = candidate?.roomJoinedAt || candidate?.lastLoginAt || (candidate?.createdAt && new Date(candidate.createdAt) <= new Date(now) ? candidate.createdAt : now);
      await Room.findOneAndUpdate(
        {
          _id: targetRoomId,
          'joinedCandidates.candidateId': { $ne: candidateId },
        },
        {
          $push: {
            joinedCandidates: {
              candidateId,
              joinedAt: candidateJoinTime,
              assignedQuestionSetId,
              joinIndex: 1,
            },
          },
        }
      );
    }

    // Single-Session Invalidation: If existing session is superseded by new tab, notify previous tab (BUG-53)
    const io = req.app?.get ? req.app.get('io') : null;
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
              assignedQuestionSetId,
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
      const placeholderQId = assignedQuestionSetId || test.questionSetId?._id || test._id;
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
              assignedQuestionSetId,
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

          // FEATURE-032: Record candidate test finish timestamp for 12-hour cooldown
          await recordCandidateTestFinish(candidateId, autoNow);

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
              submittedAt: autoNow,
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
      const query = {
        candidateId: req.user.id,
        questionId: req.params.questionId,
      };
      if (req.params.testId) {
        query.testId = req.params.testId;
      }
      submission = await Submission.findOne(
        query,
        { code: 1, language: 1, savedCodeByLanguage: 1, status: 1, isAttempted: 1, visibleTestCasesPassed: 1, visibleTestCasesTotal: 1 }
      );
    }

    res.json({ question, submission });
  } catch (err) {
    next(err);
  }
};

// ── POST /submissions/:questionId/run ─────────────────────────────────────────
// Runs code against visible test cases (or custom cases) via Judge0 (FEATURE-010)
const runCode = async (req, res, next) => {
  try {
    const { code, language, customInput, customTestCases, testId } = req.body;
    const { questionId } = req.params;
    const candidateId = req.user?.id;

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
      const passed = isCustom ? true : (!r.error && !r.stderr && expected !== undefined && expected !== '' && actual === expected);
      return {
        input: testCases[i]?.input,
        expectedOutput: testCases[i]?.expectedOutput,
        actualOutput: actual,
        passed,
        error: r.stderr || r.compile_output,
        status: r.status?.description,
        timeMs,
        isCustom,
      };
    });

    let allPassed = false;
    let passedCount = 0;
    const totalCount = question.visibleTestCases?.length || 0;

    // When running against standard visible test cases, update Submission record (FEATURE-010)
    let isAttempted = false;
    let questionsAttemptedCount = 0;

    if (!isCustom && candidateId) {
      passedCount = visibleTestResults.filter((r) => r && r.passed).length;
      allPassed = totalCount > 0 && passedCount === totalCount;

      let targetTestId = testId || req.query?.testId;
      if (!targetTestId) {
        const activeSub = await Submission.findOne({
          candidateId,
          status: 'IN_PROGRESS',
        }).sort({ candidateStartTime: -1 });
        targetTestId = activeSub?.testId;
      }
      if (!targetTestId) {
        const anySub = await Submission.findOne({
          candidateId,
        }).sort({ candidateStartTime: -1 });
        targetTestId = anySub?.testId;
      }

      if (targetTestId) {
        let submission = await Submission.findOne({ candidateId, testId: targetTestId, questionId });
        if (!submission) {
          const Room = require('../models/Room');
          let roomDoc = await Room.findOne({
            testId: targetTestId,
            'joinedCandidates.candidateId': candidateId,
          }) || await Room.findOne({ testId: targetTestId });

          if (!roomDoc) {
            roomDoc = await Room.create({
              testId: targetTestId,
              roomCode: 'ROOM-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
              status: 'ACTIVE',
              joinedCandidates: [{ candidateId, joinedAt: new Date() }],
            });
          }

          submission = new Submission({
            candidateId,
            testId: targetTestId,
            roomId: roomDoc._id,
            questionId,
            assignedQuestionSetId: question.questionSetId || null,
            status: 'IN_PROGRESS',
            visibleTestCasesTotal: totalCount,
          });
        } else if (!submission.roomId) {
          const Room = require('../models/Room');
          let roomDoc = await Room.findOne({
            testId: targetTestId,
            'joinedCandidates.candidateId': candidateId,
          }) || await Room.findOne({ testId: targetTestId });

          if (!roomDoc) {
            roomDoc = await Room.create({
              testId: targetTestId,
              roomCode: 'ROOM-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
              status: 'ACTIVE',
              joinedCandidates: [{ candidateId, joinedAt: new Date() }],
            });
          }
          submission.roomId = roomDoc._id;
        }
        submission.code = code;
        submission.language = language;
        if (!submission.savedCodeByLanguage) {
          submission.savedCodeByLanguage = new Map();
        }
        submission.savedCodeByLanguage.set(language, code);
        submission.visibleTestCasesPassed = passedCount;
        submission.visibleTestCasesTotal = totalCount;

        // First time all visible test cases pass for this question -> mark isAttempted = true (FEATURE-010)
        const becameAttempted = allPassed && !submission.isAttempted;
        if (becameAttempted) {
          submission.isAttempted = true;
          submission.attemptedAt = new Date();
        }

        await submission.save();
        isAttempted = Boolean(submission.isAttempted);

          if (becameAttempted) {
            // Count distinct attempted questions for this candidate
            questionsAttemptedCount = await Submission.countDocuments({
              candidateId,
              testId: submission.testId,
              isAttempted: true,
            });

            const Test = require('../models/Test');
            const testDoc = await Test.findById(submission.testId, 'totalQuestions questions');
            const totalQCount = testDoc?.totalQuestions || testDoc?.questions?.length || 1;

            const io = req.app?.get ? req.app.get('io') : null;
            if (io) {
              io.to(`test:${submission.testId}:admin`).emit('dashboard:update', {
                candidateId: candidateId.toString(),
                roomId: submission.roomId ? submission.roomId.toString() : null,
                status: 'IN_PROGRESS',
                questionsAttempted: questionsAttemptedCount,
                totalQuestions: totalQCount,
                candidateStartTime: submission.candidateStartTime,
                candidateEndTime: submission.candidateEndTime,
                timeRemaining: submission.candidateEndTime ? Math.max(0, new Date(submission.candidateEndTime).getTime() - Date.now()) : 0,
              });
            }
          }
        }
      }

    res.json({
      output,
      visibleTestResults,
      runtimeMs: maxTimeMs,
      isCustom,
      allPassed,
      isAttempted,
      visibleTestCasesPassed: passedCount,
      visibleTestCasesTotal: totalCount,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /submissions/:questionId/save ────────────────────────────────────────
// Autosave — no evaluation (Section 9.5, NFR: autosave every 30s)
const saveCode = async (req, res, next) => {
  try {
    const { code, language, testId } = req.body;
    const { questionId } = req.params;
    const candidateId = req.user.id;

    let targetTestId = testId || req.query.testId;
    if (!targetTestId) {
      const activeSub = await Submission.findOne({
        candidateId,
        status: 'IN_PROGRESS',
      }).sort({ candidateStartTime: -1 });
      targetTestId = activeSub?.testId;
    }
    if (!targetTestId) {
      const anySub = await Submission.findOne({
        candidateId,
      }).sort({ candidateStartTime: -1 });
      targetTestId = anySub?.testId;
    }

    if (!targetTestId) {
      return res.status(400).json({ error: 'testId is required to save code' });
    }

    const savedAt = new Date();
    const lang = language || 'python';
    const existingSub = await Submission.findOne({
      candidateId,
      testId: targetTestId,
      candidateStartTime: { $exists: true, $ne: null },
    });

    // Resolve roomId: use existing submission's roomId, or look up from Room collection
    let resolvedRoomId = existingSub?.roomId || null;
    if (!resolvedRoomId) {
      const Room = require('../models/Room');
      let roomDoc = await Room.findOne({
        testId: targetTestId,
        'joinedCandidates.candidateId': candidateId,
      }) || await Room.findOne({ testId: targetTestId });

      if (!roomDoc) {
        roomDoc = await Room.create({
          testId: targetTestId,
          roomCode: 'ROOM-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
          status: 'ACTIVE',
          joinedCandidates: [{ candidateId, joinedAt: new Date() }],
        });
      }
      resolvedRoomId = roomDoc._id;
    }

    const update = {
      code: code ?? '',
      language: lang,
      [`savedCodeByLanguage.${lang}`]: code ?? '',
      roomId: resolvedRoomId,
    };

    const submission = await Submission.findOneAndUpdate(
      { candidateId, testId: targetTestId, questionId },
      {
        $set: update,
        $setOnInsert: {
          status: 'IN_PROGRESS',
          candidateStartTime: existingSub?.candidateStartTime || null,
          candidateEndTime: existingSub?.candidateEndTime || null,
          roomId: resolvedRoomId,
          assignedQuestionSetId: existingSub?.assignedQuestionSetId || null,
        },
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
    const { code, language, testId } = req.body;
    const { questionId } = req.params;
    const candidateId = req.user.id;

    if (!code || !language) {
      return res.status(400).json({ error: 'code and language are required' });
    }

    let targetTestId = testId || req.query.testId;
    if (!targetTestId) {
      const activeSub = await Submission.findOne({
        candidateId,
        status: 'IN_PROGRESS',
      }).sort({ candidateStartTime: -1 });
      targetTestId = activeSub?.testId;
    }
    if (!targetTestId) {
      const anySub = await Submission.findOne({
        candidateId,
      }).sort({ candidateStartTime: -1 });
      targetTestId = anySub?.testId;
    }

    if (!targetTestId) {
      return res.status(400).json({ error: 'testId is required to submit code' });
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
      { candidateId, testId: targetTestId, questionId },
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
    const io = req.app?.get ? req.app.get('io') : null;
    if (io) {
      io.to(`test:${submission.testId}:admin`).emit('dashboard:update', {
        candidateId,
        roomId: submission.roomId,
        questionsCompleted: visiblePassed / Math.max(question.visibleTestCases.length, 1),
      });
    }

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

    // FEATURE-032: Record candidate test finish timestamp for 12-hour cooldown
    await recordCandidateTestFinish(candidateId, now);

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
    const io = req.app?.get ? req.app.get('io') : null;
    if (io) {
      // Get candidate name for announcement
      const Candidate = require('../models/Candidate');
      const candidate = await Candidate.findById(candidateId, 'name');
      io.to(`test:${testId}:admin`).emit('candidate:submitted', {
        candidateId,
        candidateName: candidate?.name || 'Unknown',
        submittedAt: now,
      });
    }

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
