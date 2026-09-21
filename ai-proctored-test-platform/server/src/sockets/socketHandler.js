// Socket.io Event Handler — Module 6
// Implements Section 10 (Socket.io Event Contracts) exactly
// Namespace: default /
// Candidate rooms: test:{testId}:room:{roomId}
// Admin room: test:{testId}:admin
// Candidate personal room: candidate:{candidateId}
// Test-level broadcast room: test:{testId}

const jwt = require('jsonwebtoken');

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'supersecretjwtkeyglobussoft2026';

/**
 * Register all Socket.io event handlers
 * @param {import('socket.io').Server} io
 */
const registerSocketHandlers = (io) => {
  // Socket authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = jwt.verify(token, JWT_ACCESS_SECRET);
      socket.user = decoded; // { id, role, type }
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id} | User: ${socket.user?.id}`);

    // Automatically join personal room for notifications (e.g. late join approval)
    if (socket.user?.type === 'candidate' && socket.user?.id) {
      socket.join(`candidate:${socket.user.id}`);
    }

    // ── Client → Server: candidate:join ──────────────────────────────────────
    // Payload: { candidateId, testId, roomId }
    // Candidate socket joins test/room channel (Section 10.1)
    socket.on('candidate:join', ({ candidateId, testId, roomId }) => {
      const isSelfCandidate =
        socket.user?.type === 'candidate' &&
        (String(socket.user?.id) === String(candidateId) || String(socket.user?._id) === String(candidateId));
      if (!isSelfCandidate) {
        return; // Security: candidates can only join as themselves
      }
      // Join room-level channel
      if (roomId) socket.join(`test:${testId}:room:${roomId}`);
      // Join test-level channel (for test:ended broadcasts)
      if (testId) socket.join(`test:${testId}`);
      // Join personal channel (for candidate:warning, candidate:disqualified)
      if (candidateId) socket.join(`candidate:${candidateId}`);

      console.log(`[Socket] Candidate ${candidateId} joined test:${testId}:room:${roomId}`);
    });

    // ── Client → Server: admin:join ───────────────────────────────────────────
    // Payload: { adminId, testId }
    // Admin joins full-test monitoring channel (Section 10.1)
    socket.on('admin:join', ({ adminId, testId }) => {
      const isAdmin =
        socket.user?.type === 'admin' ||
        ['SUPER_ADMIN', 'ADMIN'].includes(socket.user?.role);
      if (!isAdmin) {
        return; // Security: only admins can join admin channel
      }
      if (testId) {
        socket.join(`test:${testId}:admin`);
        console.log(`[Socket] Admin ${adminId || socket.user?.id} joined test:${testId}:admin`);
      }
    });

    // ── Client → Server: candidate:heartbeat ─────────────────────────────────
    // Payload: { candidateId, testId, currentQuestionId, questionsCompleted }
    // Sent every ~5s to update live dashboard/seat map (Section 10.1)
    // NFR: debounce/throttle max 1 re-render per 200ms per candidate (Section 13)
    // Server-side: we emit once per heartbeat — client-side debouncing is in React
    socket.on('candidate:heartbeat', async ({ candidateId, testId, currentQuestionId, questionsCompleted }) => {
      const isSelfCandidate =
        socket.user?.type === 'candidate' &&
        (String(socket.user?.id) === String(candidateId) || String(socket.user?._id) === String(candidateId));
      if (!isSelfCandidate) {
        return;
      }

      try {
        const Candidate = require('../models/Candidate');
        const candidate = await Candidate.findById(candidateId, 'name email isDisqualified');

        // Calculate time remaining from server-persisted candidateEndTime (NFR: resilience)
        const Submission = require('../models/Submission');
        const sub = (await Submission.findOne(
          { candidateId, testId, candidateStartTime: { $exists: true, $ne: null } },
          { status: 1, candidateEndTime: 1, candidateStartTime: 1, roomId: 1 }
        ).sort({ candidateStartTime: -1 })) || (await Submission.findOne(
          { candidateId, testId },
          { status: 1, candidateEndTime: 1, candidateStartTime: 1, roomId: 1 }
        ));
        const timeRemaining = sub?.candidateEndTime
          ? Math.max(0, sub.candidateEndTime.getTime() - Date.now())
          : 0;

        // Determine seat map color (FR-8.1, BUG-44: GREEN = SUBMITTED, BUG-83: WHITE = NOT_STARTED)
        let colorStatus = 'WHITE';
        let candidateStatus = 'NOT_STARTED';

        if (candidate?.isDisqualified) {
          colorStatus = 'RED';
          candidateStatus = 'DISQUALIFIED';
        } else if (sub?.status === 'SUBMITTED' || sub?.status === 'AUTO_SUBMITTED_TIME_UP') {
          colorStatus = 'GREEN';
          candidateStatus = 'SUBMITTED';
        } else if (sub?.candidateStartTime) {
          colorStatus = 'YELLOW';
          candidateStatus = 'IN_PROGRESS';
        }

        const Room = require('../models/Room');
        const roomDoc = sub?.roomId ? await Room.findById(sub.roomId, 'roomName') : null;

        const attemptedCount = await Submission.countDocuments({
          candidateId,
          testId,
          isAttempted: true,
        });

        const Test = require('../models/Test');
        const testDoc = await Test.findById(testId, 'totalQuestions questions');
        const totalQCount = testDoc?.totalQuestions || testDoc?.questions?.length || 5;

        // Section 10.2: dashboard:update — broadcast to admins
        io.to(`test:${testId}:admin`).emit('dashboard:update', {
          candidateId: candidateId.toString(),
          name: candidate?.name,
          email: candidate?.email,
          roomId: sub?.roomId ? sub.roomId.toString() : null,
          roomName: roomDoc?.roomName || 'Assigned Room',
          status: candidateStatus,
          questionsCompleted: questionsCompleted || 0,
          questionsAttempted: attemptedCount,
          totalQuestions: totalQCount,
          timeRemaining,
          candidateEndTime: sub?.candidateEndTime,
          candidateStartTime: sub?.candidateStartTime,
          colorStatus,
        });

        // Section 10.2: seatmap:status — broadcast to admins
        io.to(`test:${testId}:admin`).emit('seatmap:status', {
          candidateId: candidateId.toString(),
          roomId: sub?.roomId ? sub.roomId.toString() : null,
          colorStatus,
        });
      } catch (err) {
        console.error('[Socket] Heartbeat error:', err);
      }
    });

    // ── Helper: Process and broadcast candidate-side malpractice violations ────
    const handleCandidateViolation = async ({ candidateId, testId, roomId, violationType }) => {
      if (!testId || !candidateId) return;
      try {
        const Candidate = require('../models/Candidate');
        const Submission = require('../models/Submission');
        const Room = require('../models/Room');
        const MalpracticeLog = require('../models/MalpracticeLog');

        // Resolve roomId if missing
        let resolvedRoomId = roomId;
        if (!resolvedRoomId) {
          const activeSub = await Submission.findOne({ candidateId, testId });
          resolvedRoomId = activeSub?.roomId;
          if (!resolvedRoomId) {
            const candidateRoom = await Room.findOne({ testId, 'joinedCandidates.candidateId': candidateId });
            resolvedRoomId = candidateRoom?._id;
          }
        }

        // Suppress if test already concluded (BUG-65 Part B guard)
        const isConcluded = await Submission.exists({
          candidateId,
          testId,
          status: { $in: ['SUBMITTED', 'AUTO_SUBMITTED_TIME_UP', 'AUTO_SUBMITTED_DISQUALIFIED'] },
        });
        if (isConcluded) {
          console.log(`[Socket Proctoring] Suppressing ${violationType} for candidate ${candidateId} (test already concluded)`);
          return;
        }

        // Check if recent log exists in last 3.5s to prevent redundant duplicate inserts
        const recentCutoff = new Date(Date.now() - 3500);
        let log = await MalpracticeLog.findOne({
          candidateId,
          testId,
          violationType,
          detectedAt: { $gte: recentCutoff },
        }).sort({ detectedAt: -1 });

        if (!log) {
          log = await MalpracticeLog.create({
            candidateId,
            testId,
            roomId: resolvedRoomId || undefined,
            violationType,
            detectedAt: new Date(),
          });
        }

        const candidate = await Candidate.findById(candidateId, 'name email');
        const roomDoc = resolvedRoomId ? await Room.findById(resolvedRoomId, 'roomName') : null;
        const malpracticeCount = await MalpracticeLog.countDocuments({ candidateId, testId });

        // Update active submission malpracticeCount if present
        await Submission.updateMany(
          { candidateId, testId, status: 'IN_PROGRESS' },
          { $set: { malpracticeCount } }
        ).catch(() => {});

        // Emit malpractice:alert to admin channel (FR-7.3)
        io.to(`test:${testId}:admin`).emit('malpractice:alert', {
          malpracticeLogId: log._id,
          candidateId: candidateId.toString(),
          candidateName: candidate?.name || 'Candidate',
          candidateEmail: candidate?.email || '',
          roomId: resolvedRoomId ? resolvedRoomId.toString() : null,
          roomName: roomDoc?.roomName || 'Assigned Room',
          violationType,
          proofScreenshotUrl: log.proofScreenshotUrl || null,
          hasPendingProof: violationType === 'FULLSCREEN_EXIT' || violationType === 'TAB_SWITCH',
          currentCount: malpracticeCount,
          detectedAt: log.detectedAt,
        });

        // Update admin seat map and dashboard counters in real time
        io.to(`test:${testId}:admin`).emit('dashboard:update', {
          candidateId: candidateId.toString(),
          roomId: resolvedRoomId ? resolvedRoomId.toString() : null,
          malpracticeCount,
          colorStatus: 'YELLOW',
        });

        io.to(`test:${testId}:admin`).emit('seatmap:status', {
          candidateId: candidateId.toString(),
          roomId: resolvedRoomId ? resolvedRoomId.toString() : null,
          colorStatus: 'YELLOW',
        });

        // Emit warning to candidate personal channel
        io.to(`candidate:${candidateId}`).emit('candidate:warning', {
          violationType,
          message: `Violation detected: ${violationType.replace(/_/g, ' ')}. This has been flagged.`,
          violationCount: malpracticeCount,
        });

        io.to(`candidate:${candidateId}`).emit('candidate:violation-updated', {
          candidateId: candidateId.toString(),
          testId: testId.toString(),
          violationCount: malpracticeCount,
          violationType,
        });
      } catch (err) {
        console.error(`[Socket Proctoring] Error handling ${violationType}:`, err);
      }
    };

    // ── Client → Server: candidate:tabswitch ─────────────────────────────────
    // Payload: { candidateId, testId, roomId }
    // Fired on visibilitychange/blur (FR-5.3, Section 10.1)
    socket.on('candidate:tabswitch', async ({ candidateId, testId, roomId }) => {
      const isSelfCandidate =
        socket.user?.type === 'candidate' &&
        (String(socket.user?.id) === String(candidateId) || String(socket.user?._id) === String(candidateId));
      if (!isSelfCandidate) {
        return;
      }
      console.log(`[Proctoring] Tab switch: candidate=${candidateId} test=${testId}`);
      await handleCandidateViolation({ candidateId, testId, roomId, violationType: 'TAB_SWITCH' });
    });

    // ── Client → Server: candidate:fullscreenexit ─────────────────────────────
    // Payload: { candidateId, testId, roomId }
    // Fired on fullscreen API exit event (FR-5.2, Section 10.1)
    socket.on('candidate:fullscreenexit', async ({ candidateId, testId, roomId }) => {
      const isSelfCandidate =
        socket.user?.type === 'candidate' &&
        (String(socket.user?.id) === String(candidateId) || String(socket.user?._id) === String(candidateId));
      if (!isSelfCandidate) {
        return;
      }
      console.log(`[Proctoring] Fullscreen exit: candidate=${candidateId} test=${testId}`);
      await handleCandidateViolation({ candidateId, testId, roomId, violationType: 'FULLSCREEN_EXIT' });
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      // NFR: Server-persisted timer (candidateStartTime/candidateEndTime) ensures
      // timer resumes correctly on reconnect — no action needed here
    });
  });
};

module.exports = { registerSocketHandlers };
