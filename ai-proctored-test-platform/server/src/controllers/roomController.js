// Room Controller — Module 2
// Implements all endpoints from Section 9.3 exactly
const crypto = require('crypto');
const mongoose = require('mongoose');
const Room = require('../models/Room');
const Test = require('../models/Test');
const Candidate = require('../models/Candidate');
const Submission = require('../models/Submission');
const QuestionSet = require('../models/QuestionSet');
const MalpracticeLog = require('../models/MalpracticeLog');

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

/**
 * Generate a cryptographically random, opaque invite token (FEATURE-015)
 * 32 hex chars, non-reversible, zero raw credentials
 */
const generateInviteToken = () => crypto.randomBytes(16).toString('hex');

// ── POST /tests/:testId/rooms ─────────────────────────────────────────────────
// Auto-generates roomCode, roomPassword, passwordValidUntil (FR-3.1), inviteToken (FEATURE-015)
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
    const inviteToken = generateInviteToken();
    const now = new Date();
    // Only start the password countdown if test is already LIVE!
    // For DRAFT / SCHEDULED tests, leave passwordValidUntil as null until the test goes LIVE
    const passwordValidUntil = test.status === 'LIVE'
      ? new Date(now.getTime() + (test.startTestWindowMinutes || 10) * 60 * 1000)
      : null;

    let validatedCapacity = undefined;
    if (capacity !== undefined && capacity !== null && String(capacity).trim() !== '') {
      const parsedCapacity = Number(capacity);
      if (!Number.isInteger(parsedCapacity) || parsedCapacity < 1 || parsedCapacity > 150) {
        return res.status(400).json({ error: 'Room capacity must be an integer between 1 and 150' });
      }
      validatedCapacity = parsedCapacity;
    }

    const room = await Room.create({
      testId,
      roomName,
      roomCode,
      roomPassword,
      inviteToken,
      passwordValidUntil,
      capacity: validatedCapacity,
      status: 'ACTIVE',
      createdAt: now,
    });

    // Broadcast to admins if test is LIVE (Section 10.2: room:updated event)
    const io = req.app.get('io');
    if (io) {
      io.to(`test:${testId}:admin`).emit('room:updated', {
        roomId: room._id,
        action: 'ADDED',
      });
    }

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

    // FEATURE-015: Lazily ensure all rooms have an opaque inviteToken
    for (const r of rooms) {
      if (!r.inviteToken) {
        r.inviteToken = generateInviteToken();
        await r.save();
      }
    }

    const now = Date.now();
    const testId = req.params.testId;
    const testIdObj = mongoose.Types.ObjectId.isValid(testId) ? new mongoose.Types.ObjectId(testId) : testId;
    const roomIds = rooms.map((r) => r._id);

    // BUG-019: Establish single source of truth for room metrics
    // Multi-stage aggregate: Group by candidate per room, then group by room to extract distinct candidates & distinct submitted candidates
    const [activeSubmissions, subStats, violStats] = await Promise.all([
      Submission.find({
        testId: testIdObj,
        status: 'IN_PROGRESS',
        candidateEndTime: { $gt: new Date(now) },
      }, { roomId: 1, candidateEndTime: 1 }),
      Submission.aggregate([
        {
          $match: {
            roomId: { $in: roomIds },
            testId: testIdObj,
          },
        },
        {
          // Group by candidate per room to evaluate overall completion status
          $group: {
            _id: { roomId: '$roomId', candidateId: '$candidateId' },
            statuses: { $addToSet: '$status' },
          },
        },
        {
          // Group by room to get distinct candidate IDs and distinct submitted candidate IDs
          $group: {
            _id: '$_id.roomId',
            candidateIds: { $addToSet: '$_id.candidateId' },
            submittedCandidateIds: {
              $addToSet: {
                $cond: [
                  {
                    $or: [
                      { $in: ['SUBMITTED', '$statuses'] },
                      { $in: ['AUTO_SUBMITTED_TIME_UP', '$statuses'] },
                      { $in: ['AUTO_SUBMITTED_DISQUALIFIED', '$statuses'] },
                    ],
                  },
                  '$_id.candidateId',
                  '$$REMOVE',
                ],
              },
            },
          },
        },
      ]),
      MalpracticeLog.aggregate([
        {
          $match: {
            roomId: { $in: roomIds },
            testId: testIdObj,
          },
        },
        {
          $group: {
            _id: '$roomId',
            totalViolations: { $sum: 1 },
            violatorIds: { $addToSet: '$candidateId' },
          },
        },
      ]),
    ]);

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

    const subMap = {};
    for (const s of subStats) {
      if (s._id) subMap[s._id.toString()] = s;
    }
    const violMap = {};
    for (const v of violStats) {
      if (v._id) violMap[v._id.toString()] = v;
    }

    const enrichedRooms = rooms.map((r) => {
      const rObj = r.toObject();
      const rid = r._id.toString();
      const sStat = subMap[rid];
      const vStat = violMap[rid];

      // BUG-019: Distinct candidate count combining joinedCandidates, submissions, and malpractice logs
      const distinctCandidateSet = new Set();
      for (const entry of (r.joinedCandidates || [])) {
        const cid = entry?.candidateId?._id
          ? entry.candidateId._id.toString()
          : entry?.candidateId?.toString();
        if (cid) distinctCandidateSet.add(cid);
      }
      if (sStat?.candidateIds) {
        for (const cid of sStat.candidateIds) {
          if (cid) distinctCandidateSet.add(cid.toString());
        }
      }
      if (vStat?.violatorIds) {
        for (const cid of vStat.violatorIds) {
          if (cid) distinctCandidateSet.add(cid.toString());
        }
      }

      // BUG-019: Distinct count of submitted candidates (fixing multi-question document sum inflation)
      const distinctSubmittedSet = new Set();
      if (sStat?.submittedCandidateIds) {
        for (const cid of sStat.submittedCandidateIds) {
          if (cid) distinctSubmittedSet.add(cid.toString());
        }
      }

      const candidateCount = distinctCandidateSet.size;
      const submittedCount = distinctSubmittedSet.size;
      const violationCount = vStat ? vStat.totalViolations : 0;

      // Diagnostic logging for room summaries
      console.log(`[BUG-019 Diagnostics] Room "${r.roomName}" (${rid}) | Test ${testId} -> Distinct Candidates: ${candidateCount}, Distinct Submitted: ${submittedCount}, Total Violations: ${violationCount}`);

      // BUG-21: Tentative Time = MAX remaining time among candidates currently IN_PROGRESS
      rObj.tentativeTime = maxRemByRoom[rid] || null;
      // BUG-019: Single source of truth metrics
      rObj.candidateCount = candidateCount;
      rObj.submittedCount = submittedCount;
      rObj.violationCount = violationCount;
      return rObj;
    });

    res.json({ rooms: enrichedRooms });
  } catch (err) {
    next(err);
  }
};

// ── GET /rooms/invite/:inviteToken ──────────────────────────────────────────
// Public endpoint for candidates opening an invite link (safe public metadata, zero credentials)
const resolveInviteToken = async (req, res, next) => {
  try {
    const { inviteToken } = req.params;
    if (!inviteToken) {
      return res.status(400).json({ error: 'inviteToken is required' });
    }

    const room = await Room.findOne({ inviteToken });
    if (!room) {
      return res.status(404).json({ error: 'Invite link is invalid or room not found' });
    }

    const test = await Test.findById(room.testId, 'title testType status durationMinutes startTestWindowMinutes');
    if (!test) {
      return res.status(404).json({ error: 'Associated test not found' });
    }

    const isExpired = Boolean(room.passwordValidUntil && new Date() > room.passwordValidUntil);
    const isLive = test.status === 'LIVE';
    const isFull = Boolean(room.capacity && room.joinedCandidates && room.joinedCandidates.length >= room.capacity);

    res.json({
      valid: true,
      roomId: room._id,
      testId: test._id,
      roomName: room.roomName,
      testTitle: test.title,
      testType: test.testType,
      testStatus: test.status,
      durationMinutes: test.durationMinutes,
      capacity: room.capacity || null,
      isFull,
      isLive,
      isExpired,
      roomStatus: room.status,
    });
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
    if (io) {
      io.to(`test:${room.testId}:admin`).emit('room:updated', {
        roomId: room._id,
        action: 'REMOVED',
      });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── GET /rooms/:roomId/candidates ─────────────────────────────────────────────
const getRoomCandidates = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const room = await Room.findById(roomId)
      .populate('joinedCandidates.candidateId', 'name email phone isDisqualified createdAt lastLoginAt roomJoinedAt')
      .populate('joinedCandidates.assignedQuestionSetId', 'name testType');
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // 1. Fetch all submissions for this room & test, sorted newest first
    const submissions = await Submission.find({ roomId, testId: room.testId })
      .populate('candidateId', 'name email phone isDisqualified createdAt lastLoginAt roomJoinedAt')
      .populate('assignedQuestionSetId', 'name testType')
      .sort({ createdAt: -1 });

    // 2. Fetch malpractice incident logs for this room & test
    const MalpracticeLog = require('../models/MalpracticeLog');
    const malpracticeLogs = await MalpracticeLog.find({ roomId, testId: room.testId }).populate('candidateId', 'name email phone isDisqualified createdAt lastLoginAt roomJoinedAt');
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

    // 3. Map room join entries for fast lookup of assigned Question Set & index (preserving earliest join time)
    const roomJoinedMap = {};
    if (room.joinedCandidates && room.joinedCandidates.length > 0) {
      for (const entry of room.joinedCandidates) {
        const candidate = entry.candidateId;
        if (!candidate) continue;
        const cid = candidate._id ? candidate._id.toString() : entry.candidateId.toString();
        if (!roomJoinedMap[cid]) {
          roomJoinedMap[cid] = entry;
        } else {
          const existingTime = new Date(roomJoinedMap[cid].joinedAt).getTime();
          const entryTime = new Date(entry.joinedAt).getTime();
          if (!isNaN(entryTime) && (isNaN(existingTime) || entryTime < existingTime)) {
            roomJoinedMap[cid] = entry;
          }
        }
      }
    }

    // 4. Deduplicate by candidateId, preserving real-time status & progress
    const candidateMap = {};

    // First, process active submissions
    for (const sub of submissions) {
      const candidate = sub.candidateId;
      if (!candidate) continue;
      const cid = candidate._id ? candidate._id.toString() : sub.candidateId.toString();

      const joinedEntry = roomJoinedMap[cid];
      const assignedSetObj = sub.assignedQuestionSetId || joinedEntry?.assignedQuestionSetId;
      const assignedQuestionSetName = assignedSetObj?.name || (typeof assignedSetObj === 'string' ? assignedSetObj : null);
      const assignedQuestionSetId = assignedSetObj?._id || (typeof assignedSetObj === 'string' ? assignedSetObj : null);
      const assignedSetIndex = joinedEntry?.joinIndex || null;

      const roomJoinedAt = joinedEntry?.joinedAt || candidate.roomJoinedAt || candidate.lastLoginAt || candidate.createdAt || null;

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
          testEndedAt: sub.submittedAt || null,
          startedAt: sub.candidateStartTime || null,
          candidateStartTime: sub.candidateStartTime || null,
          testStartedAt: sub.candidateStartTime || null,
          candidateEndTime: sub.candidateEndTime,
          roomJoinedAt,
          joinedAt: roomJoinedAt,
          createdAt: candidate.createdAt || null,
          lastLoginAt: candidate.lastLoginAt || null,
          malpracticeCount: malpracticeCounts[cid] || 0,
          assignedQuestionSetId,
          assignedQuestionSetName,
          assignedSetIndex,
        };
        if (sub.status === 'AUTO_SUBMITTED_DISQUALIFIED' || candidate.isDisqualified) {
          candidateMap[cid].status = 'DISQUALIFIED';
          candidateMap[cid].isDisqualified = true;
        } else if (sub.status === 'AUTO_SUBMITTED_TIME_UP') {
          if (candidateMap[cid].status !== 'DISQUALIFIED') {
            candidateMap[cid].status = 'AUTO_SUBMITTED_TIME_UP';
          }
        } else if (sub.status === 'SUBMITTED') {
          if (candidateMap[cid].status !== 'DISQUALIFIED' && candidateMap[cid].status !== 'AUTO_SUBMITTED_TIME_UP') {
            candidateMap[cid].status = 'SUBMITTED';
          }
        }
        if (sub.candidateEndTime && (!candidateMap[cid].candidateEndTime || new Date(sub.candidateEndTime) > new Date(candidateMap[cid].candidateEndTime))) {
          candidateMap[cid].candidateEndTime = sub.candidateEndTime;
        }
        if (sub.candidateStartTime && (!candidateMap[cid].startedAt || new Date(sub.candidateStartTime) < new Date(candidateMap[cid].startedAt))) {
          candidateMap[cid].startedAt = sub.candidateStartTime;
          candidateMap[cid].candidateStartTime = sub.candidateStartTime;
          candidateMap[cid].testStartedAt = sub.candidateStartTime;
        }
        if (sub.submittedAt && (!candidateMap[cid].submittedAt || new Date(sub.submittedAt) > new Date(candidateMap[cid].submittedAt))) {
          candidateMap[cid].submittedAt = sub.submittedAt;
          candidateMap[cid].testEndedAt = sub.submittedAt;
        }
        if (roomJoinedAt && !candidateMap[cid].roomJoinedAt) {
          candidateMap[cid].roomJoinedAt = roomJoinedAt;
          candidateMap[cid].joinedAt = roomJoinedAt;
        }
        if (candidate.createdAt && !candidateMap[cid].createdAt) {
          candidateMap[cid].createdAt = candidate.createdAt;
        }
        if (candidate.lastLoginAt && !candidateMap[cid].lastLoginAt) {
          candidateMap[cid].lastLoginAt = candidate.lastLoginAt;
        }
        if (assignedQuestionSetName && !candidateMap[cid].assignedQuestionSetName) {
          candidateMap[cid].assignedQuestionSetName = assignedQuestionSetName;
        }
        if (assignedQuestionSetId && !candidateMap[cid].assignedQuestionSetId) {
          candidateMap[cid].assignedQuestionSetId = assignedQuestionSetId;
        }
        if (assignedSetIndex && !candidateMap[cid].assignedSetIndex) {
          candidateMap[cid].assignedSetIndex = assignedSetIndex;
        }
      }
    }

    // Second, process any candidates recorded in room.joinedCandidates who may not have submitted code yet
    if (room.joinedCandidates && room.joinedCandidates.length > 0) {
      for (const entry of room.joinedCandidates) {
        const candidate = entry.candidateId;
        if (!candidate) continue;
        const cid = candidate._id ? candidate._id.toString() : entry.candidateId.toString();
        const roomJoinedAt = entry.joinedAt || candidate.roomJoinedAt || candidate.lastLoginAt || candidate.createdAt || null;

        if (!candidateMap[cid]) {
          const isDisqualified = candidate.isDisqualified || false;
          const assignedSetObj = entry.assignedQuestionSetId;
          const assignedQuestionSetName = assignedSetObj?.name || (typeof assignedSetObj === 'string' ? assignedSetObj : null);
          const assignedQuestionSetId = assignedSetObj?._id || (typeof assignedSetObj === 'string' ? assignedSetObj : null);
          const assignedSetIndex = entry.joinIndex || null;

          candidateMap[cid] = {
            _id: cid,
            candidateId: cid,
            name: candidate.name || 'Candidate',
            email: candidate.email || '—',
            phone: candidate.phone || '—',
            isDisqualified,
            status: isDisqualified ? 'DISQUALIFIED' : 'NOT_STARTED',
            questionsCompleted: 0,
            submittedAt: null,
            testEndedAt: null,
            startedAt: null,
            candidateStartTime: null,
            testStartedAt: null,
            candidateEndTime: null,
            roomJoinedAt,
            joinedAt: roomJoinedAt,
            createdAt: candidate.createdAt || null,
            lastLoginAt: candidate.lastLoginAt || null,
            malpracticeCount: malpracticeCounts[cid] || 0,
            assignedQuestionSetId,
            assignedQuestionSetName,
            assignedSetIndex,
          };
        } else if (roomJoinedAt && !candidateMap[cid].roomJoinedAt) {
          candidateMap[cid].roomJoinedAt = roomJoinedAt;
          candidateMap[cid].joinedAt = roomJoinedAt;
        }
      }
    }

    // Third, process any candidates recorded in malpractice events for this room
    for (const item of malpracticeCandidates) {
      const candidate = item.candidate;
      const cid = candidate._id.toString();
      const roomJoinedAt = item.detectedAt || candidate.roomJoinedAt || candidate.lastLoginAt || candidate.createdAt || null;
      if (!candidateMap[cid]) {
        const isDisqualified = candidate.isDisqualified || item.action === 'DISQUALIFIED';
        candidateMap[cid] = {
          _id: cid,
          candidateId: cid,
          name: candidate.name || 'Candidate',
          email: candidate.email || '—',
          phone: candidate.phone || '—',
          isDisqualified,
          status: isDisqualified ? 'DISQUALIFIED' : 'NOT_STARTED',
          questionsCompleted: 0,
          submittedAt: null,
          testEndedAt: null,
          startedAt: null,
          candidateStartTime: null,
          testStartedAt: null,
          candidateEndTime: null,
          roomJoinedAt,
          joinedAt: roomJoinedAt,
          createdAt: candidate.createdAt || null,
          lastLoginAt: candidate.lastLoginAt || null,
          malpracticeCount: malpracticeCounts[cid] || 0,
          assignedQuestionSetId: null,
          assignedQuestionSetName: null,
          assignedSetIndex: null,
        };
      }
    }

    console.log(`[BUG-019 Diagnostics] getRoomCandidates for Room "${room.roomName}" (${roomId}) | Test ${room.testId} -> Total candidates: ${Object.keys(candidateMap).length} (IDs: ${Object.keys(candidateMap).join(', ')})`);

    // BUG-022: Canonicalize and chronologically validate candidate timelines across all rooms
    const { resolveCandidateTimelines } = require('../utils/timelineHelper');
    const finalCandidates = Object.values(candidateMap).map((c) => {
      const cid = c.candidateId || c._id;
      const joinedEntry = roomJoinedMap[cid];
      const candObj = (typeof joinedEntry?.candidateId === 'object' ? joinedEntry?.candidateId : null) || (typeof c.candidateId === 'object' ? c.candidateId : null);
      const candidateCreationTime = c.createdAt || candObj?.createdAt || null;
      const candidateLastLogin = c.lastLoginAt || candObj?.lastLoginAt || null;
      const candidateRoomJoin = c.roomJoinedAt || candObj?.roomJoinedAt || null;

      const timelines = resolveCandidateTimelines({
        roomJoinedAtRaw: c.roomJoinedAt || joinedEntry?.joinedAt,
        candidateCreatedAt: candidateCreationTime,
        candidateLastLoginAt: candidateLastLogin,
        candidateRoomJoinedAt: candidateRoomJoin,
        testStartedAtRaw: c.testStartedAt || c.candidateStartTime || c.startedAt,
        testEndedAtRaw: c.testEndedAt || c.submittedAt,
        candidateId: cid,
        testId: room.testId,
        roomId: room._id,
      });

      return {
        ...c,
        roomJoinedAt: timelines.roomJoinedAt,
        joinedAt: timelines.roomJoinedAt,
        testStartedAt: timelines.testStartedAt,
        candidateStartTime: timelines.testStartedAt,
        startedAt: timelines.testStartedAt,
        testEndedAt: timelines.testEndedAt,
        submittedAt: timelines.testEndedAt,
      };
    });

    res.json({ candidates: finalCandidates, room });
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
      .populate('candidateId', 'name email isDisqualified createdAt lastLoginAt roomJoinedAt')
      .populate('roomId', 'roomName roomCode')
      .populate('assignedQuestionSetId', 'name testType');

    // Fetch all rooms for this test to also capture candidates who joined a room but haven't started yet
    const rooms = await Room.find({ testId })
      .populate('joinedCandidates.candidateId', 'name email isDisqualified createdAt lastLoginAt roomJoinedAt')
      .populate('joinedCandidates.assignedQuestionSetId', 'name testType');

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

    const totalQuestions = test.totalQuestions || (test.questions ? test.questions.length : 5);

    // Pre-aggregate attempted, completed counts, earliest startTime, and latest/authoritative endTime per candidate
    const attemptedCounts = {};
    const completedCounts = {};
    const candidateTimers = {};
    const candidateRooms = {};
    const candidateAssignedSets = {};
    const candidateSubmissionStatuses = {};

    for (const sub of submissions) {
      const cid = sub.candidateId?._id ? sub.candidateId._id.toString() : sub.candidateId?.toString();
      if (!cid) continue;

      if (sub.isAttempted) {
        attemptedCounts[cid] = (attemptedCounts[cid] || 0) + 1;
      }
      if (sub.visibleTestCasesTotal > 0 && sub.visibleTestCasesPassed === sub.visibleTestCasesTotal) {
        completedCounts[cid] = (completedCounts[cid] || 0) + 1;
      }

      if (!candidateTimers[cid]) {
        candidateTimers[cid] = { startTime: null, endTime: null, submittedAt: null };
      }
      if (sub.candidateStartTime && (!candidateTimers[cid].startTime || new Date(sub.candidateStartTime) < new Date(candidateTimers[cid].startTime))) {
        candidateTimers[cid].startTime = sub.candidateStartTime;
      }
      if (sub.candidateEndTime && (!candidateTimers[cid].endTime || new Date(sub.candidateEndTime) > new Date(candidateTimers[cid].endTime))) {
        candidateTimers[cid].endTime = sub.candidateEndTime;
      }
      if (sub.submittedAt && (!candidateTimers[cid].submittedAt || new Date(sub.submittedAt) > new Date(candidateTimers[cid].submittedAt))) {
        candidateTimers[cid].submittedAt = sub.submittedAt;
      }

      if (sub.roomId && !candidateRooms[cid]) {
        candidateRooms[cid] = sub.roomId;
      }
      if (sub.assignedQuestionSetId && !candidateAssignedSets[cid]) {
        candidateAssignedSets[cid] = sub.assignedQuestionSetId;
      }

      if (!candidateSubmissionStatuses[cid]) {
        candidateSubmissionStatuses[cid] = [];
      }
      candidateSubmissionStatuses[cid].push(sub.status);
    }

    // If test is pool-based, pre-fetch pool sets to accurately resolve set indices and names
    let poolSets = [];
    const poolContainerId = test.folderId || test.questionSetPoolId;
    if (poolContainerId) {
      poolSets = await QuestionSet.find({
        $or: [
          { folderId: poolContainerId },
          { uploadBatchId: poolContainerId },
        ],
      }).sort({ createdAt: 1, _id: 1 });
    }

    const resolveSetDetails = (assignedSetObj, joinIndex) => {
      let assignedQuestionSetName = assignedSetObj?.name || (typeof assignedSetObj === 'string' ? assignedSetObj : null);
      let assignedQuestionSetId = assignedSetObj?._id || (typeof assignedSetObj === 'string' ? assignedSetObj : null);
      let assignedSetIndex = joinIndex || null;

      if (poolSets.length > 0 && assignedQuestionSetId) {
        const foundIdx = poolSets.findIndex((s) => s._id.toString() === assignedQuestionSetId.toString());
        if (foundIdx !== -1) {
          assignedSetIndex = foundIdx + 1;
          if (!assignedQuestionSetName) {
            assignedQuestionSetName = poolSets[foundIdx].name;
          }
        }
      } else if (poolSets.length > 0 && typeof joinIndex === 'number' && joinIndex > 0) {
        assignedSetIndex = ((joinIndex - 1) % poolSets.length) + 1;
        if (!assignedQuestionSetName && poolSets[assignedSetIndex - 1]) {
          assignedQuestionSetName = poolSets[assignedSetIndex - 1].name;
        }
      }

      return { assignedQuestionSetId, assignedQuestionSetName, assignedSetIndex };
    };

    // 1. Seed candidates from rooms (joined candidates who may not have started test yet)
    for (const r of rooms) {
      for (const j of r.joinedCandidates || []) {
        const candidate = j.candidateId;
        if (!candidate || !candidate._id) continue;
        const cid = candidate._id.toString();

        const setObj = candidateAssignedSets[cid] || j.assignedQuestionSetId;
        const { assignedQuestionSetId, assignedQuestionSetName, assignedSetIndex } = resolveSetDetails(setObj, j.joinIndex);

        const timers = candidateTimers[cid] || { startTime: null, endTime: null, submittedAt: null };
        const timeRemaining = timers.endTime ? Math.max(0, new Date(timers.endTime).getTime() - now) : 0;

        const subStatuses = candidateSubmissionStatuses[cid] || [];
        let status = 'NOT_STARTED';
        let colorStatus = 'WHITE';

        if (candidate?.isDisqualified) {
          status = 'DISQUALIFIED';
          colorStatus = 'RED';
        } else if (subStatuses.length > 0 && subStatuses.every((st) => st === 'SUBMITTED' || st === 'AUTO_SUBMITTED_TIME_UP')) {
          status = 'SUBMITTED';
          colorStatus = 'GREEN';
        } else if (timers.startTime) {
          status = 'IN_PROGRESS';
          colorStatus = 'YELLOW';
        }

        const roomJoinedAt = j.joinedAt || candidate?.roomJoinedAt || candidate?.lastLoginAt || candidate?.createdAt || null;
        candidateMap[cid] = {
          candidateId: cid,
          name: candidate?.name || 'Candidate',
          email: candidate?.email || '—',
          roomId: r._id.toString(),
          roomName: r.roomName || 'Assigned Room',
          status,
          timeRemaining,
          candidateStartTime: timers.startTime || null,
          testStartedAt: timers.startTime || null,
          candidateEndTime: timers.endTime || null,
          submittedAt: timers.submittedAt || null,
          testEndedAt: timers.submittedAt || null,
          roomJoinedAt,
          joinedAt: roomJoinedAt,
          createdAt: candidate?.createdAt || null,
          lastLoginAt: candidate?.lastLoginAt || null,
          questionsAttempted: attemptedCounts[cid] || 0,
          totalQuestions,
          questionsCompleted: completedCounts[cid] || 0,
          malpracticeCount: malpracticeCounts[cid] || 0,
          colorStatus,
          assignedQuestionSetId,
          assignedQuestionSetName,
          assignedSetIndex,
        };
      }
    }

    // 2. Overlay / update with active or finished submissions
    for (const sub of submissions) {
      const candidate = sub.candidateId;
      if (!candidate || !candidate._id) continue;
      const cid = candidate._id.toString();

      const timers = candidateTimers[cid] || { startTime: sub.candidateStartTime, endTime: sub.candidateEndTime, submittedAt: sub.submittedAt };
      const timeRemaining = timers.endTime ? Math.max(0, new Date(timers.endTime).getTime() - now) : 0;

      const subStatuses = candidateSubmissionStatuses[cid] || [sub.status];
      let status = 'NOT_STARTED';
      let colorStatus = 'WHITE';

      if (candidate.isDisqualified || subStatuses.some((st) => st === 'AUTO_SUBMITTED_DISQUALIFIED' || st === 'DISQUALIFIED')) {
        status = 'DISQUALIFIED';
        colorStatus = 'RED';
      } else if (subStatuses.length > 0 && subStatuses.some((st) => st === 'AUTO_SUBMITTED_TIME_UP')) {
        status = 'AUTO_SUBMITTED_TIME_UP';
        colorStatus = 'GREEN';
      } else if (subStatuses.length > 0 && subStatuses.every((st) => st === 'SUBMITTED')) {
        status = 'SUBMITTED';
        colorStatus = 'GREEN';
      } else if (timers.startTime) {
        status = 'IN_PROGRESS';
        colorStatus = 'YELLOW';
      }

      const existing = candidateMap[cid];
      const setObj = sub.assignedQuestionSetId || candidateAssignedSets[cid] || existing?.assignedQuestionSetId;
      const { assignedQuestionSetId, assignedQuestionSetName, assignedSetIndex } = resolveSetDetails(
        setObj,
        existing?.assignedSetIndex
      );

      const rDoc = sub.roomId || candidateRooms[cid];
      const rId = rDoc?._id ? rDoc._id.toString() : (rDoc?.toString() || existing?.roomId);
      const rName = rDoc?.roomName || existing?.roomName || 'Assigned Room';

      if (!existing) {
        const roomJoinedAt = candidate.roomJoinedAt || candidate.lastLoginAt || candidate.createdAt || null;
        candidateMap[cid] = {
          candidateId: cid,
          name: candidate.name || 'Candidate',
          email: candidate.email || '—',
          roomId: rId,
          roomName: rName,
          status,
          timeRemaining,
          candidateStartTime: timers.startTime || sub.candidateStartTime || null,
          testStartedAt: timers.startTime || sub.candidateStartTime || null,
          candidateEndTime: timers.endTime || sub.candidateEndTime || null,
          submittedAt: timers.submittedAt || sub.submittedAt || null,
          testEndedAt: timers.submittedAt || sub.submittedAt || null,
          roomJoinedAt,
          joinedAt: roomJoinedAt,
          createdAt: candidate.createdAt || null,
          lastLoginAt: candidate.lastLoginAt || null,
          questionsAttempted: attemptedCounts[cid] || 0,
          totalQuestions,
          questionsCompleted: completedCounts[cid] || 0,
          malpracticeCount: malpracticeCounts[cid] || 0,
          colorStatus,
          assignedQuestionSetId: assignedQuestionSetId || null,
          assignedQuestionSetName: assignedQuestionSetName || null,
          assignedSetIndex: assignedSetIndex || null,
        };
      } else {
        // Guarantee timers and status are strictly updated with authoritative submission data
        if (timers.startTime) {
          candidateMap[cid].candidateStartTime = timers.startTime;
          candidateMap[cid].testStartedAt = timers.startTime;
        }
        if (timers.endTime) {
          candidateMap[cid].candidateEndTime = timers.endTime;
          candidateMap[cid].timeRemaining = timeRemaining;
        }
        if (timers.submittedAt || sub.submittedAt) {
          candidateMap[cid].submittedAt = timers.submittedAt || sub.submittedAt;
          candidateMap[cid].testEndedAt = timers.submittedAt || sub.submittedAt;
        }
        if (candidate.createdAt && !candidateMap[cid].createdAt) {
          candidateMap[cid].createdAt = candidate.createdAt;
        }
        if (candidate.lastLoginAt && !candidateMap[cid].lastLoginAt) {
          candidateMap[cid].lastLoginAt = candidate.lastLoginAt;
        }
        if (candidate.roomJoinedAt && !candidateMap[cid].roomJoinedAt) {
          candidateMap[cid].roomJoinedAt = candidate.roomJoinedAt;
          candidateMap[cid].joinedAt = candidate.roomJoinedAt;
        }
        if (candidate.isDisqualified || subStatuses.some((st) => st === 'AUTO_SUBMITTED_DISQUALIFIED' || st === 'DISQUALIFIED')) {
          candidateMap[cid].status = 'DISQUALIFIED';
          candidateMap[cid].colorStatus = 'RED';
        } else if (subStatuses.length > 0 && subStatuses.some((st) => st === 'AUTO_SUBMITTED_TIME_UP')) {
          candidateMap[cid].status = 'AUTO_SUBMITTED_TIME_UP';
          candidateMap[cid].colorStatus = 'GREEN';
        } else if (subStatuses.length > 0 && subStatuses.every((st) => st === 'SUBMITTED')) {
          candidateMap[cid].status = 'SUBMITTED';
          candidateMap[cid].colorStatus = 'GREEN';
        } else if (timers.startTime) {
          candidateMap[cid].status = 'IN_PROGRESS';
          candidateMap[cid].colorStatus = 'YELLOW';
        } else {
          candidateMap[cid].status = 'NOT_STARTED';
          candidateMap[cid].colorStatus = 'WHITE';
        }
        candidateMap[cid].questionsAttempted = attemptedCounts[cid] || 0;
        candidateMap[cid].questionsCompleted = completedCounts[cid] || 0;
        candidateMap[cid].totalQuestions = totalQuestions;
        if (assignedQuestionSetName) candidateMap[cid].assignedQuestionSetName = assignedQuestionSetName;
        if (assignedQuestionSetId) candidateMap[cid].assignedQuestionSetId = assignedQuestionSetId;
        if (assignedSetIndex) candidateMap[cid].assignedSetIndex = assignedSetIndex;
        if (rId && (!candidateMap[cid].roomId || candidateMap[cid].roomId === 'UNASSIGNED')) candidateMap[cid].roomId = rId;
        if (rName && (!candidateMap[cid].roomName || candidateMap[cid].roomName === 'Assigned Room')) candidateMap[cid].roomName = rName;
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

    // BUG-022: Canonicalize and chronologically validate timelines for all live candidate records
    const { resolveCandidateTimelines } = require('../utils/timelineHelper');
    for (const [cid, c] of Object.entries(candidateMap)) {
      const timelines = resolveCandidateTimelines({
        roomJoinedAtRaw: c.roomJoinedAt || c.joinedAt,
        candidateCreatedAt: c.createdAt,
        candidateLastLoginAt: c.lastLoginAt,
        candidateRoomJoinedAt: c.roomJoinedAt,
        testStartedAtRaw: c.testStartedAt || c.candidateStartTime || c.startedAt,
        testEndedAtRaw: c.testEndedAt || c.submittedAt,
        candidateId: cid,
        testId,
        roomId: c.roomId,
      });

      candidateMap[cid] = {
        ...c,
        roomJoinedAt: timelines.roomJoinedAt,
        joinedAt: timelines.roomJoinedAt,
        testStartedAt: timelines.testStartedAt,
        candidateStartTime: timelines.testStartedAt,
        startedAt: timelines.testStartedAt,
        testEndedAt: timelines.testEndedAt,
        submittedAt: timelines.testEndedAt,
      };
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
        inviteToken: room.inviteToken,
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
  resolveInviteToken,
};
