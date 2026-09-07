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
        const sub = await Submission.findOne(
          { candidateId, testId },
          { status: 1, candidateEndTime: 1, candidateStartTime: 1, roomId: 1 }
        );
        const timeRemaining = sub?.candidateEndTime
          ? Math.max(0, sub.candidateEndTime.getTime() - Date.now())
          : 0;

        // Determine seat map color (FR-8.1, BUG-44: GREEN = SUBMITTED)
        let colorStatus = 'YELLOW'; // in progress
        if (candidate?.isDisqualified) {
          colorStatus = 'RED';
        } else if (sub?.status === 'SUBMITTED' || sub?.status === 'AUTO_SUBMITTED_TIME_UP') {
          colorStatus = 'GREEN';
        } else if (!sub || sub?.status === 'NOT_STARTED') {
          colorStatus = 'WHITE'; // only white if test attempt has not started
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
          status: candidate?.isDisqualified ? 'DISQUALIFIED' : (sub ? 'IN_PROGRESS' : 'NOT_STARTED'),
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

    // ── Client → Server: candidate:tabswitch ─────────────────────────────────
    // Payload: { candidateId, testId, roomId }
    // Fired on visibilitychange/blur (FR-5.3, Section 10.1)
    socket.on('candidate:tabswitch', ({ candidateId, testId, roomId }) => {
      const isSelfCandidate =
        socket.user?.type === 'candidate' &&
        (String(socket.user?.id) === String(candidateId) || String(socket.user?._id) === String(candidateId));
      if (!isSelfCandidate) {
        return;
      }
      console.log(`[Proctoring] Tab switch: candidate=${candidateId} test=${testId}`);
      if (testId) {
        io.to(`test:${testId}:admin`).emit('seatmap:status', {
          candidateId: candidateId.toString(),
          roomId: roomId ? roomId.toString() : null,
          colorStatus: 'YELLOW',
        });
        io.to(`test:${testId}:admin`).emit('dashboard:update', {
          candidateId: candidateId.toString(),
          roomId: roomId ? roomId.toString() : null,
          colorStatus: 'YELLOW',
        });
      }
    });

    // ── Client → Server: candidate:fullscreenexit ─────────────────────────────
    // Payload: { candidateId, testId, roomId }
    // Fired on fullscreen API exit event (FR-5.2, Section 10.1)
    socket.on('candidate:fullscreenexit', ({ candidateId, testId, roomId }) => {
      const isSelfCandidate =
        socket.user?.type === 'candidate' &&
        (String(socket.user?.id) === String(candidateId) || String(socket.user?._id) === String(candidateId));
      if (!isSelfCandidate) {
        return;
      }
      console.log(`[Proctoring] Fullscreen exit: candidate=${candidateId} test=${testId}`);
      if (testId) {
        io.to(`test:${testId}:admin`).emit('seatmap:status', {
          candidateId: candidateId.toString(),
          roomId: roomId ? roomId.toString() : null,
          colorStatus: 'YELLOW',
        });
        io.to(`test:${testId}:admin`).emit('dashboard:update', {
          candidateId: candidateId.toString(),
          roomId: roomId ? roomId.toString() : null,
          colorStatus: 'YELLOW',
        });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      // NFR: Server-persisted timer (candidateStartTime/candidateEndTime) ensures
      // timer resumes correctly on reconnect — no action needed here
    });
  });
};

module.exports = { registerSocketHandlers };
