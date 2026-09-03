// Socket.io client — Section 10 event contracts
// NFR: debounced/throttled socket event handling (max 1 re-render per 200ms per candidate)
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

let socket = null;

/**
 * Initialize and connect the socket.
 * @param {string} token - JWT access token for socket auth
 */
export const initSocket = (token) => {
  if (socket?.connected) return socket;

  socket = io(SOCKET_URL, {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
  });

  socket.on('connect_error', (err) => {
    console.error('[Socket] Connection error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.warn('[Socket] Disconnected:', reason);
  });

  return socket;
};

/**
 * Get the current socket instance.
 */
export const getSocket = () => socket;

/**
 * Disconnect and clean up socket.
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

// ── Client → Server emitters (Section 10.1) ───────────────────────────────────

export const emitCandidateJoin = ({ candidateId, testId, roomId }) => {
  socket?.emit('candidate:join', { candidateId, testId, roomId });
};

export const emitAdminJoin = ({ adminId, testId }) => {
  socket?.emit('admin:join', { adminId, testId });
};

export const emitCandidateHeartbeat = ({ candidateId, testId, currentQuestionId, questionsCompleted }) => {
  socket?.emit('candidate:heartbeat', { candidateId, testId, currentQuestionId, questionsCompleted });
};

export const emitTabSwitch = ({ candidateId, testId, roomId }) => {
  socket?.emit('candidate:tabswitch', { candidateId, testId, roomId });
};

export const emitFullscreenExit = ({ candidateId, testId, roomId }) => {
  socket?.emit('candidate:fullscreenexit', { candidateId, testId, roomId });
};

// ── Server → Client event subscriptions (Section 10.2) ───────────────────────

export const onDashboardUpdate = (cb) => { socket?.on('dashboard:update', cb); };
export const offDashboardUpdate = (cb) => { socket?.off('dashboard:update', cb); };

export const onSeatmapStatus = (cb) => { socket?.on('seatmap:status', cb); };
export const offSeatmapStatus = (cb) => { socket?.off('seatmap:status', cb); };

export const onMalpracticeAlert = (cb) => { socket?.on('malpractice:alert', cb); };
export const offMalpracticeAlert = (cb) => { socket?.off('malpractice:alert', cb); };

export const onCandidateWarning = (cb) => { socket?.on('candidate:warning', cb); };
export const offCandidateWarning = (cb) => { socket?.off('candidate:warning', cb); };

export const onCandidateViolationUpdated = (cb) => { socket?.on('candidate:violation-updated', cb); };
export const offCandidateViolationUpdated = (cb) => { socket?.off('candidate:violation-updated', cb); };

export const onCandidateDisqualified = (cb) => { socket?.on('candidate:disqualified', cb); };
export const offCandidateDisqualified = (cb) => { socket?.off('candidate:disqualified', cb); };

export const onCandidateSubmitted = (cb) => { socket?.on('candidate:submitted', cb); };
export const offCandidateSubmitted = (cb) => { socket?.off('candidate:submitted', cb); };

export const onTestEnded = (cb) => { socket?.on('test:ended', cb); };
export const offTestEnded = (cb) => { socket?.off('test:ended', cb); };

export const onRoomUpdated = (cb) => { socket?.on('room:updated', cb); };
export const offRoomUpdated = (cb) => { socket?.off('room:updated', cb); };

export const onRoomTentativeTime = (cb) => { socket?.on('room:tentative-time', cb); };
export const offRoomTentativeTime = (cb) => { socket?.off('room:tentative-time', cb); };

// ── Late Join notification events ─────────────────────────────────────────────
export const onLateJoinRequest = (cb) => { socket?.on('candidate:lateJoinRequest', cb); };
export const offLateJoinRequest = (cb) => { socket?.off('candidate:lateJoinRequest', cb); };

export const onLateJoinApproved = (cb) => { socket?.on('candidate:lateJoinApproved', cb); };
export const offLateJoinApproved = (cb) => { socket?.off('candidate:lateJoinApproved', cb); };

export const onLateJoinDismissed = (cb) => { socket?.on('candidate:lateJoinDismissed', cb); };
export const offLateJoinDismissed = (cb) => { socket?.off('candidate:lateJoinDismissed', cb); };

export const onLateJoinProcessed = (cb) => { socket?.on('candidate:lateJoinProcessed', cb); };
export const offLateJoinProcessed = (cb) => { socket?.off('candidate:lateJoinProcessed', cb); };

export default { initSocket, getSocket, disconnectSocket };
