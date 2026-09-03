// Socket.io Event Handler — Module 6
// Implements Section 10 (Socket.io Event Contracts) exactly
// Namespace: default /
// Candidate rooms: test:{testId}:room:{roomId}
// Admin room: test:{testId}:admin
// Candidate personal room: candidate:{candidateId}
// Test-level broadcast room: test:{testId}

const jwt = require('jsonwebtoken');

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
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
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
      if (socket.user?.type !== 'candidate' || socket.user?.id !== candidateId) {
        return; // Security: candidates can only join as themselves
      }
      // Join room-level channel
      socket.join(`test:${testId}:room:${roomId}`);
      // Join test-level channel (for test:ended broadcasts)
      socket.join(`test:${testId}`);
      // Join personal channel (for candidate:warning, candidate:disqualified)
      socket.join(`candidate:${candidateId}`);

      console.log(`[Socket] Candidate ${candidateId} joined test:${testId}:room:${roomId}`);
    });

    // ── Client → Server: admin:join ───────────────────────────────────────────
    // Payload: { adminId, testId }
    // Admin joins full-test monitoring channel (Section 10.1)
    socket.on('admin:join', ({ adminId, testId }) => {
      if (socket.user?.type !== 'admin') {
        return; // Security: only admins can join admin channel
      }
      socket.join(`test:${testId}:admin`);
      console.log(`[Socket] Admin ${adminId} joined test:${testId}:admin`);
    });

    // ── Client → Server: candidate:heartbeat ─────────────────────────────────
    // Payload: { candidateId, testId, currentQuestionId, questionsCompleted }
    // Sent every ~5s to update live dashboard/seat map (Section 10.1)
    // NFR: debounce/throttle max 1 re-render per 200ms per candidate (Section 13)
    // Server-side: we emit once per heartbeat — client-side debouncing is in React
    socket.on('candidate:heartbeat', async ({ candidateId, testId, currentQuestionId, questionsCompleted }) => {
      if (socket.user?.type !== 'candidate' || (socket.user?.id !== candidateId && socket.user?._id !== candidateId)) {
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

        // Section 10.2: dashboard:update — broadcast to admins
        io.to(`test:${testId}:admin`).emit('dashboard:update', {
          candidateId: candidateId.toString(),
          name: candidate?.name,
          email: candidate?.email,
          roomId: sub?.roomId ? sub.roomId.toString() : null,
          roomName: roomDoc?.roomName || 'Assigned Room',
          status: candidate?.isDisqualified ? 'DISQUALIFIED' : (sub ? 'IN_PROGRESS' : 'NOT_STARTED'),
          questionsCompleted: questionsCompleted || 0,
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
      if (socket.user?.type !== 'candidate' || socket.user?.id !== candidateId) {
        return;
      }
      // Tab switch violation is reported via REST /proctoring/violation by the client
      // Socket event here is for immediate notification — REST call handles DB logging
      console.log(`[Proctoring] Tab switch: candidate=${candidateId} test=${testId}`);
    });

    // ── Client → Server: candidate:fullscreenexit ─────────────────────────────
    // Payload: { candidateId, testId, roomId }
    // Fired on fullscreen API exit event (FR-5.2, Section 10.1)
    socket.on('candidate:fullscreenexit', ({ candidateId, testId, roomId }) => {
      if (socket.user?.type !== 'candidate' || socket.user?.id !== candidateId) {
        return;
      }
      // Fullscreen exit violation is reported via REST /proctoring/violation by the client
      console.log(`[Proctoring] Fullscreen exit: candidate=${candidateId} test=${testId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      // NFR: Server-persisted timer (candidateStartTime/candidateEndTime) ensures
      // timer resumes correctly on reconnect — no action needed here
    });
  });
};

module.exports = { registerSocketHandlers };
