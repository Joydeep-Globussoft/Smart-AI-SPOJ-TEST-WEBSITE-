// Room routes — Section 9.3 (exact endpoint paths)
const express = require('express');
const router = express.Router();
const {
  createRoom,
  getRooms,
  deleteRoom,
  getRoomCandidates,
  getLiveCandidates,
  lateJoinRequest,
  allowLateJoin,
  dismissLateJoin,
  getLateJoinStatus,
  getPendingLateJoinRequests,
  resolveInviteToken,
} = require('../controllers/roomController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

const adminAuth = [verifyToken, requireAdmin];

// Public invite token resolution (FEATURE-015)
router.get('/rooms/invite/:inviteToken', resolveInviteToken);

router.post('/tests/:testId/rooms', adminAuth, createRoom);
router.get('/tests/:testId/rooms', adminAuth, getRooms);
router.get('/tests/:testId/live-candidates', adminAuth, getLiveCandidates);
router.get('/tests/:testId/pending-late-joins', adminAuth, getPendingLateJoinRequests);
router.delete('/rooms/:roomId', adminAuth, deleteRoom);
router.get('/rooms/:roomId/candidates', adminAuth, getRoomCandidates);

// Late-join notify and resolution flow
router.post('/rooms/:roomId/candidates/:candidateId/late-join-request', verifyToken, lateJoinRequest);
router.post('/rooms/:roomId/candidates/:candidateId/allow-late-entry', adminAuth, allowLateJoin);
router.post('/rooms/:roomId/candidates/:candidateId/dismiss-late-join', adminAuth, dismissLateJoin);
router.get('/candidates/:candidateId/late-join-status', verifyToken, getLateJoinStatus);

module.exports = router;
