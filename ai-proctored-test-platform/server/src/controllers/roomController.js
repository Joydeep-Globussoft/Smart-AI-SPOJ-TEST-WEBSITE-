// Room Controller — Module 2
// Implements all endpoints from Section 9.3 exactly
const crypto = require('crypto');
const Room = require('../models/Room');
const Test = require('../models/Test');
const Candidate = require('../models/Candidate');
const Submission = require('../models/Submission');

/**
 * Generate a cryptographically random room code (Section 13: not guessable, not sequential)
 * Example format: 6 uppercase alphanumeric chars, e.g., "A3K9MQ"
 */
const generateRoomCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ambiguous chars removed
  let code = '';
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
};

/**
 * Generate a cryptographically random room password (Section 13)
 * Example format: 8 chars alphanumeric
 */
const generateRoomPassword = () => crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 hex chars

// ── POST /tests/:testId/rooms ─────────────────────────────────────────────────
// Auto-generates roomCode, roomPassword, passwordValidUntil (FR-3.1)
const createRoom = async (req, res, next) => {
  try {
    const { testId } = req.params;
    const { roomName, capacity } = req.body;

    if (!roomName) {
      return res.status(400).json({ error: 'roomName is required' });
    }

    const test = await Test.findById(testId);
    if (!test) return res.status(404).json({ error: 'Test not found' });

    // Generate unique room code (retry on collision)
    let roomCode;
    let attempts = 0;
    do {
      roomCode = generateRoomCode();
      attempts++;
      if (attempts > 10) return res.status(500).json({ error: 'Failed to generate unique room code' });
    } while (await Room.findOne({ roomCode }));

    const roomPassword = generateRoomPassword();
    const now = new Date();
    // Only start the password countdown if test is already LIVE!
    // For DRAFT / SCHEDULED tests, leave passwordValidUntil as null until the test goes LIVE
    const passwordValidUntil = test.status === 'LIVE'
      ? new Date(now.getTime() + (test.startTestWindowMinutes || 10) * 60 * 1000)
      : null;

    const room = await Room.create({
      testId,
      roomName,
      roomCode,
      roomPassword,
      passwordValidUntil,
      capacity: capacity || undefined,
      status: 'ACTIVE',
      createdAt: now,
    });

    // Broadcast to admins if test is LIVE (Section 10.2: room:updated event)
    const io = req.app.get('io');
    io.to(`test:${testId}:admin`).emit('room:updated', {
      roomId: room._id,
      action: 'ADDED',
    });

    res.status(201).json({ room });
  } catch (err) {
    next(err);
  }
};

// ── GET /tests/:testId/rooms ──────────────────────────────────────────────────
const getRooms = async (req, res, next) => {
  try {
    const test = await Test.findById(req.params.testId, 'status');
    if (test && test.status === 'ENDED') {
      // BUG-22: Self-healing synchronization: if test is ENDED, all rooms must be CLOSED
      await Room.updateMany({ testId: req.params.testId, status: 'ACTIVE' }, { status: 'CLOSED' });
    }

    const rooms = await Room.find({ testId: req.params.testId });
    const now = Date.now();
    const activeSubmissions = await Submission.find({
      testId: req.params.testId,
      status: 'IN_PROGRESS',
      candidateEndTime: { $gt: new Date(now) },
    }, { roomId: 1, candidateEndTime: 1 });

    const maxRemByRoom = {};
    for (const s of activeSubmissions) {
      if (s.roomId && s.candidateEndTime) {
        const rid = s.roomId.toString();
        const rem = Math.max(0, new Date(s.candidateEndTime).getTime() - now);
        if (!maxRemByRoom[rid] || rem > maxRemByRoom[rid]) {
          maxRemByRoom[rid] = rem;
        }
      }
    }

    const enrichedRooms = rooms.map((r) => {
      const rObj = r.toObject();
      // BUG-21: Tentative Time = MAX remaining time among candidates currently IN_PROGRESS
      // ASSUMPTION: If no in-progress candidate in room, tentativeTime is null ("—" or "Not started" placeholder)
      rObj.tentativeTime = maxRemByRoom[r._id.toString()] || null;
      return rObj;
    });

    res.json({ rooms: enrichedRooms });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /rooms/:roomId ─────────────────────────────────────────────────────
// AC: Candidates already in that room are NOT kicked out mid-test (FR-3.2)
// Only new joins to that room code are blocked (status = CLOSED)
const deleteRoom = async (req, res, next) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // FR-3.2: Do not kick active candidates — just set status to CLOSED to block new joins
    // Candidates with active sessions persist (their timer/submissions are unaffected)
    await Room.findByIdAndUpdate(req.params.roomId, { status: 'CLOSED' });

    // Broadcast room removal to admins
    const io = req.app.get('io');
    io.to(`test:${room.testId}:admin`).emit('room:updated', {
      roomId: room._id,
      action: 'REMOVED',
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── GET /rooms/:roomId/candidates ─────────────────────────────────────────────
const getRoomCandidates = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findById(roomId).populate('joinedCandidates.candidateId', 'name email phone isDisqualified');
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // 1. Fetch all submissions for this room, sorted newest first
    const submissions = await Submission.find({ roomId })
      .populate('candidateId', 'name email phone isDisqualified')
      .sort({ createdAt: -1 });

    // 2. Fetch malpractice incident logs for this room
    const MalpracticeLog = require('../models/MalpracticeLog');
    const malpracticeLogs = await MalpracticeLog.find({ roomId }).populate('candidateId', 'name email phone isDisqualified');
    const malpracticeCounts = {};
    const malpracticeCandidates = [];
    malpracticeLogs.forEach((log) => {
      const cid = log.candidateId?._id?.toString() || log.candidateId?.toString();
      if (cid) {
        malpracticeCounts[cid] = (malpracticeCounts[cid] || 0) + 1;
        if (log.candidateId && typeof log.candidateId === 'object' && log.candidateId.name) {
          malpracticeCandidates.push({ candidate: log.candidateId, detectedAt: log.detectedAt, action: log.adminAction });
        }
      }
    });

    // 3. Deduplicate by candidateId, preserving real-time status & progress
    const candidateMap = {};

    // First, process active submissions
    for (const sub of submissions) {
      const candidate = sub.candidateId;
      if (!candidate) continue;
      const cid = candidate._id ? candidate._id.toString() : sub.candidateId.toString();

      if (!candidateMap[cid]) {
        const isDisqualified = candidate.isDisqualified || sub.status === 'AUTO_SUBMITTED_DISQUALIFIED';
        let status = sub.status || 'IN_PROGRESS';
        if (isDisqualified) {
          status = 'DISQUALIFIED';
        }

        candidateMap[cid] = {
          _id: cid,
          candidateId: cid,
          name: candidate.name || 'Candidate',
          email: candidate.email || '—',
          phone: candidate.phone || '—',
          isDisqualified,
          status, // 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED_TIME_UP' | 'DISQUALIFIED'
          questionsCompleted: sub.questionsCompleted || (sub.status === 'SUBMITTED' ? 1 : 0),
          submittedAt: sub.submittedAt || null,
          startedAt: sub.candidateStartTime || sub.createdAt,
          candidateEndTime: sub.candidateEndTime,
          malpracticeCount: malpracticeCounts[cid] || 0,
        };
      }
    }

    // Second, process any candidates recorded in room.joinedCandidates who may not have submitted code yet
    if (room.joinedCandidates && room.joinedCandidates.length > 0) {
      for (const entry of room.joinedCandidates) {
        const candidate = entry.candidateId;
        if (!candidate) continue;
        const cid = candidate._id ? candidate._id.toString() : entry.candidateId.toString();

        if (!candidateMap[cid]) {
          const isDisqualified = candidate.isDisqualified || false;
          candidateMap[cid] = {
            _id: cid,
            candidateId: cid,
            name: candidate.name || 'Candidate',
            email: candidate.email || '—',
            phone: candidate.phone || '—',
            isDisqualified,
            status: isDisqualified ? 'DISQUALIFIED' : 'IN_PROGRESS',
            questionsCompleted: 0,
            submittedAt: null,
            startedAt: entry.joinedAt || room.createdAt,
            candidateEndTime: null,
            malpracticeCount: malpracticeCounts[cid] || 0,
          };
        }
      }
    }

    // Third, process any candidates recorded in malpractice events for this room
    for (const item of malpracticeCandidates) {
      const candidate = item.candidate;
      const cid = candidate._id.toString();
      if (!candidateMap[cid]) {
        const isDisqualified = candidate.isDisqualified || item.action === 'DISQUALIFIED';
        candidateMap[cid] = {
          _id: cid,
          candidateId: cid,
          name: candidate.name || 'Candidate',
          email: candidate.email || '—',
          phone: candidate.phone || '—',
          isDisqualified,
          status: isDisqualified ? 'DISQUALIFIED' : 'IN_PROGRESS',
          questionsCompleted: 0,
          submittedAt: null,
          startedAt: item.detectedAt || room.createdAt,
          candidateEndTime: null,
          malpracticeCount: malpracticeCounts[cid] || 0,
        };
      }
    }

    res.json({ candidates: Object.values(candidateMap), room });
  } catch (err) {
    next(err);
  }
};

// ── GET /tests/:testId/live-candidates ───────────────────────────────────────
// Fetches all active candidates currently in progress for the live dashboard
const getLiveCandidates = async (req, res, next) => {
  try {
    const { testId } = req.params;

    // BUG-30 Part A: Check if test has completed its run and should auto-transition to ENDED
    const { checkAndAutoEndTest } = require('../services/testLifecycleService');
    await checkAndAutoEndTest(testId, req.app.get('io'));

    const test = await Test.findById(testId);
    if (!test) return res.status(404).json({ error: 'Test not found' });

    // Fetch all submissions for this test
    const submissions = await Submission.find({ testId })
      .populate('candidateId', 'name email isDisqualified')
      .populate('roomId', 'roomName roomCode');

    // Fetch all rooms for this test to also capture candidates who joined a room but haven't started yet
    const rooms = await Room.find({ testId }).populate('joinedCandidates.candidateId', 'name email isDisqualified');

    // Fetch all malpractice logs for this test
    const MalpracticeLog = require('../models/MalpracticeLog');
    const malpracticeLogs = await MalpracticeLog.find({ testId });
    const malpracticeCounts = {};
    malpracticeLogs.forEach((log) => {
      const cid = log.candidateId?.toString();
      if (cid) malpracticeCounts[cid] = (malpracticeCounts[cid] || 0) + 1;
    });

    const candidateMap = {};
    const now = Date.now();

    // 1. Seed candidates from rooms (joined candidates who may not have started test yet)
    for (const r of rooms) {
      for (const j of r.joinedCandidates || []) {
        const candidate = j.candidateId;
        if (!candidate || !candidate._id) continue;
        const cid = candidate._id.toString();
        candidateMap[cid] = {
          candidateId: cid,
          name: candidate.name,
          email: candidate.email,
          roomId: r._id.toString(),
          roomName: r.roomName || 'Assigned Room',
          status: candidate.isDisqualified ? 'DISQUALIFIED' : 'NOT_STARTED',
          timeRemaining: 0,
          candidateStartTime: null,
          candidateEndTime: null,
          questionsCompleted: 0,
          malpracticeCount: malpracticeCounts[cid] || 0,
          colorStatus: candidate.isDisqualified ? 'RED' : 'WHITE',
        };
      }
    }

    // 2. Overlay / update with active or finished submissions
    for (const sub of submissions) {
      const candidate = sub.candidateId;
      if (!candidate) continue;
      const cid = candidate._id.toString();

      const timeRemaining = sub.candidateEndTime
        ? Math.max(0, new Date(sub.candidateEndTime).getTime() - now)
        : 0;

      let colorStatus = 'YELLOW';
      if (candidate.isDisqualified) {
        colorStatus = 'RED';
      } else if (sub.status === 'SUBMITTED' || sub.status === 'AUTO_SUBMITTED_TIME_UP') {
        colorStatus = 'GREEN';
      }

      const existing = candidateMap[cid];
      if (!existing || existing.status === 'NOT_STARTED') {
        candidateMap[cid] = {
          candidateId: cid,
          name: candidate.name || existing?.name,
          email: candidate.email || existing?.email,
          roomId: sub.roomId?._id ? sub.roomId._id.toString() : (sub.roomId?.toString() || existing?.roomId),
          roomName: sub.roomId?.roomName || existing?.roomName || 'Assigned Room',
          status: candidate.isDisqualified ? 'DISQUALIFIED' : sub.status,
          timeRemaining,
          candidateStartTime: sub.candidateStartTime,
          candidateEndTime: sub.candidateEndTime,
          questionsCompleted: sub.visibleTestCasesPassed > 0 ? 1 : 0,
          malpracticeCount: malpracticeCounts[cid] || 0,
          colorStatus,
        };
      } else {
        if (sub.visibleTestCasesPassed > 0) {
          candidateMap[cid].questionsCompleted += 1;
        }
      }
    }

    // BUG-21: Tentative Time = MAX remaining time (candidateEndTime - now) among candidates currently IN_PROGRESS
    const tentativeTimeByRoom = {};
    let overallTentativeTime = 0;
    let hasAnyInProgress = false;

    for (const c of Object.values(candidateMap)) {
      if (c.status === 'IN_PROGRESS' && c.candidateEndTime) {
        const rem = Math.max(0, new Date(c.candidateEndTime).getTime() - now);
        if (rem > 0) {
          hasAnyInProgress = true;
          if (rem > overallTentativeTime) {
            overallTentativeTime = rem;
          }
          const rid = c.roomId ? c.roomId.toString() : 'UNASSIGNED';
          if (!tentativeTimeByRoom[rid] || rem > tentativeTimeByRoom[rid]) {
            tentativeTimeByRoom[rid] = rem;
          }
        }
      }
    }

    // ASSUMPTION: If no candidates are currently in progress, tentativeTime is null ("—" or "Not started" placeholder)
    res.json({
      candidates: candidateMap,
      tentativeTime: hasAnyInProgress ? overallTentativeTime : null,
      tentativeTimeByRoom,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /rooms/:roomId/candidates/:candidateId/late-join-request ─────────────
// Candidate notifies admin that they want to join after the room code expired
// Rate-limited to ONE request per candidate per room
const lateJoinRequest = async (req, res, next) => {
  try {
    const { roomId, candidateId } = req.params;

    const candidate = await Candidate.findById(candidateId);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Requirement 3: Server-side enforcement (rate-limit to ONE request)
    // If candidate.lateJoinRequestedAt is already set → return 409 Conflict, do NOT re-emit socket event
    if (candidate.lateJoinRequestedAt) {
      return res.status(409).json({
        error: 'Late join request already pending',
        lateJoinRequestedAt: candidate.lateJoinRequestedAt,
      });
    }

    // Set lateJoinRequestedAt = now
    candidate.lateJoinRequestedAt = new Date();
    candidate.lateJoinRoomId = room._id;
    await candidate.save();

    // Requirement 3: Emit candidate:lateJoinRequest to the admin room
    const io = req.app.get('io');
    if (io) {
      io.to(`test:${room.testId}:admin`).emit('candidate:lateJoinRequest', {
        candidateId: candidate._id.toString(),
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        candidatePhone: candidate.phone,
        roomId: room._id.toString(),
        roomName: room.roomName,
        roomCode: room.roomCode,
        testId: room.testId.toString(),
        requestedAt: candidate.lateJoinRequestedAt,
      });
    }

    res.json({
      message: 'Admin notified of late join request',
      lateJoinRequestedAt: candidate.lateJoinRequestedAt,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /rooms/:roomId/candidates/:candidateId/allow-late-entry ───────────────
// Admin grants manualJoinOverride to allow candidate entry past the deadline
const allowLateJoin = async (req, res, next) => {
  try {
    const { roomId, candidateId } = req.params;

    const candidate = await Candidate.findById(candidateId);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    candidate.manualJoinOverride = true;
    candidate.lateJoinRequestedAt = null;
    candidate.lateJoinRoomId = room._id;
    await candidate.save();

    // Broadcast approval to candidate personal channel and admin channel
    const io = req.app.get('io');
    if (io) {
      io.to(`candidate:${candidateId}`).emit('candidate:lateJoinApproved', {
        candidateId,
        roomId: room._id.toString(),
        roomCode: room.roomCode,
        message: 'Admin has granted you permission to enter the test room.',
      });
      io.to(`test:${room.testId}:admin`).emit('candidate:lateJoinProcessed', {
        candidateId,
        roomId: room._id.toString(),
        action: 'APPROVED',
      });
    }

    res.json({
      message: 'Late join approved successfully',
      candidateId,
      manualJoinOverride: true,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /rooms/:roomId/candidates/:candidateId/dismiss-late-join ─────────────
// Admin dismisses/denies the late join request, resetting lateJoinRequestedAt
const dismissLateJoin = async (req, res, next) => {
  try {
    const { roomId, candidateId } = req.params;

    const candidate = await Candidate.findById(candidateId);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    const room = await Room.findById(roomId);

    candidate.lateJoinRequestedAt = null;
    candidate.lateJoinRoomId = null;
    candidate.manualJoinOverride = false;
    await candidate.save();

    const io = req.app.get('io');
    if (io) {
      io.to(`candidate:${candidateId}`).emit('candidate:lateJoinDismissed', {
        candidateId,
        roomId: room?._id?.toString() || roomId,
        message: 'Admin has dismissed the late join request.',
      });
      if (room) {
        io.to(`test:${room.testId}:admin`).emit('candidate:lateJoinProcessed', {
          candidateId,
          roomId: room._id.toString(),
          action: 'DISMISSED',
        });
      }
    }

    res.json({
      message: 'Late join request dismissed and reset',
      candidateId,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /candidates/:candidateId/late-join-status ─────────────────────────────
// Returns candidate's current late-join status for persistent button state
const getLateJoinStatus = async (req, res, next) => {
  try {
    const { candidateId } = req.params;
    const candidate = await Candidate.findById(candidateId, 'lateJoinRequestedAt lateJoinRoomId manualJoinOverride name email');
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    res.json({
      candidateId: candidate._id,
      lateJoinRequestedAt: candidate.lateJoinRequestedAt,
      lateJoinRoomId: candidate.lateJoinRoomId,
      manualJoinOverride: candidate.manualJoinOverride,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /tests/:testId/pending-late-joins ─────────────────────────────────────
// Fetches any candidates with active lateJoinRequestedAt for this test
const getPendingLateJoinRequests = async (req, res, next) => {
  try {
    const { testId } = req.params;
    const rooms = await Room.find({ testId });
    const roomIds = rooms.map(r => r._id);

    const candidates = await Candidate.find({
      lateJoinRoomId: { $in: roomIds },
      lateJoinRequestedAt: { $ne: null },
      manualJoinOverride: false,
    });

    const roomMap = {};
    rooms.forEach(r => { roomMap[r._id.toString()] = r; });

    const requests = candidates.map(c => ({
      candidateId: c._id.toString(),
      candidateName: c.name,
      candidateEmail: c.email,
      candidatePhone: c.phone,
      roomId: c.lateJoinRoomId ? c.lateJoinRoomId.toString() : null,
      roomName: roomMap[c.lateJoinRoomId?.toString()]?.roomName || 'Test Room',
      roomCode: roomMap[c.lateJoinRoomId?.toString()]?.roomCode || '',
      testId,
      requestedAt: c.lateJoinRequestedAt,
    }));

    res.json({ requests });
  } catch (err) {
    next(err);
  }
};

module.exports = {
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
};
