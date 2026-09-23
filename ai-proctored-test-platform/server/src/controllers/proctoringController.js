// Proctoring Controller — Module 5
// Implements all endpoints from Section 9.8 exactly
// Implements malpractice review endpoint
const MalpracticeLog = require('../models/MalpracticeLog');
const Candidate = require('../models/Candidate');
const Room = require('../models/Room');
const Submission = require('../models/Submission');
const cloudinaryService = require('../services/cloudinaryService');
const malpracticeService = require('../services/malpracticeService');
const multer = require('multer');

// Multer config for frame upload (multipart/form-data)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── POST /proctoring/:testId/frame ────────────────────────────────────────────
// multipart/form-data: image
// Response: { phoneDetected: Boolean }
// AC: If phoneDetected, server auto-creates MalpracticeLog (FR-7.2)
const submitFrame = [
  upload.single('image'),
  async (req, res, next) => {
    try {
      const { testId } = req.params;
      const candidateId = req.user.id;

      if (!req.file) {
        return res.status(400).json({ error: 'image file is required' });
      }

      // Call YOLO service for phone detection
      const { phoneDetected } = await malpracticeService.detectPhone(req.file.buffer);

      if (phoneDetected) {
        // FR-7.2: Server auto-creates MalpracticeLog — client does NOT need to call /violation separately
        // Get roomId from active submission or joined room
        const activeSub = await Submission.findOne({ candidateId, testId, status: 'IN_PROGRESS' });
        let resolvedRoomId = activeSub?.roomId;
        if (!resolvedRoomId) {
          const candidateRoom = await Room.findOne({ testId, 'joinedCandidates.candidateId': candidateId });
          resolvedRoomId = candidateRoom?._id;
        }

        const candidate = await Candidate.findById(candidateId, 'name email');
        const roomDoc = resolvedRoomId ? await Room.findById(resolvedRoomId, 'roomName') : null;
        const screenshotUrl = await cloudinaryService.uploadScreenshot(
          req.file.buffer,
          testId,
          candidateId
        );

        const log = await MalpracticeLog.create({
          candidateId,
          testId,
          roomId: resolvedRoomId,
          violationType: 'PHONE_DETECTED',
          proofScreenshotUrl: screenshotUrl,
          detectedAt: new Date(),
        });

        // Emit malpractice:alert to admins + candidate:warning to candidate (FR-7.3)
        const io = req.app.get('io');
        const malpracticeCount = await MalpracticeLog.countDocuments({ candidateId, testId });

        // Update active submission malpracticeCount
        await Submission.updateMany(
          { candidateId, testId, status: 'IN_PROGRESS' },
          { $set: { malpracticeCount } }
        ).catch(() => {});

        if (io) {
          io.to(`test:${testId}:admin`).emit('malpractice:alert', {
            malpracticeLogId: log._id,
            candidateId: candidateId.toString(),
            candidateName: candidate?.name || 'Candidate',
            candidateEmail: candidate?.email || '',
            roomId: resolvedRoomId ? resolvedRoomId.toString() : null,
            roomName: roomDoc?.roomName || 'Assigned Room',
            violationType: 'PHONE_DETECTED',
            proofScreenshotUrl: screenshotUrl,
            currentCount: malpracticeCount,
            detectedAt: log.detectedAt,
          });

          // Update seat map and dashboard counters in real time
          io.to(`test:${testId}:admin`).emit('dashboard:update', {
            candidateId: candidateId.toString(),
            roomId: resolvedRoomId ? resolvedRoomId.toString() : null,
            malpracticeCount,
          });

          io.to(`test:${testId}:admin`).emit('seatmap:status', {
            candidateId: candidateId.toString(),
            roomId: resolvedRoomId ? resolvedRoomId.toString() : null,
            colorStatus: 'YELLOW',
          });

          // Emit to candidate's socket
          io.to(`candidate:${candidateId}`).emit('candidate:warning', {
            violationType: 'PHONE_DETECTED',
            message: 'Phone detected in your camera view. This has been flagged.',
            violationCount: malpracticeCount,
          });

          io.to(`candidate:${candidateId}`).emit('candidate:violation-updated', {
            candidateId: candidateId.toString(),
            testId: testId.toString(),
            violationCount: malpracticeCount,
            violationType: 'PHONE_DETECTED',
          });
        }
      }

      res.json({ phoneDetected });
    } catch (err) {
      next(err);
    }
  },
];

// ── POST /proctoring/violation ────────────────────────────────────────────────
// Body: { candidateId, testId, roomId, violationType, screenshotBase64 }
// Response: { malpracticeLog }
// Used for client-detected violations: MULTIPLE_FACES, NO_FACE_15MIN, TAB_SWITCH, FULLSCREEN_EXIT
const reportViolation = async (req, res, next) => {
  try {
    let { candidateId, testId, roomId, violationType, screenshotBase64, detectedAt } = req.body;

    if (!candidateId && req.user) {
      candidateId = req.user.id || req.user._id;
    }

    // Validate — candidate can only report their own violations
    if (req.user && req.user.type === 'candidate' && String(req.user.id || req.user._id) !== String(candidateId)) {
      return res.status(403).json({ error: 'Cannot report violation for another candidate' });
    }

    if (!violationType || !candidateId || !testId) {
      return res.status(400).json({ error: 'candidateId, testId, violationType are required' });
    }

    const Submission = require('../models/Submission');
    const Room = require('../models/Room');

    // Automatically resolve roomId if omitted by client
    if (!roomId) {
      const activeSub = await Submission.findOne({ candidateId, testId });
      roomId = activeSub?.roomId;
      if (!roomId) {
        const candidateRoom = await Room.findOne({ testId, 'joinedCandidates.candidateId': candidateId });
        roomId = candidateRoom?._id;
      }
    }

    // BUG-65 Part B: If candidate has already concluded test, suppress spurious post-submission violation reports
    const isConcluded = await Submission.exists({
      candidateId,
      testId,
      status: { $in: ['SUBMITTED', 'AUTO_SUBMITTED_TIME_UP', 'AUTO_SUBMITTED_DISQUALIFIED'] },
    });
    if (isConcluded) {
      console.log(`[Proctoring] Suppressing violation ${violationType} for candidate ${candidateId} (test already concluded)`);
      return res.json({ success: true, message: 'Test already concluded; violation suppressed.' });
    }

    // Upload screenshot to Cloudinary (with automatic base64 fallback)
    let proofScreenshotUrl = null;
    if (screenshotBase64 && typeof screenshotBase64 === 'string') {
      try {
        if (screenshotBase64.startsWith('data:image')) {
          const buffer = Buffer.from(
            screenshotBase64.replace(/^data:image\/\w+;base64,/, ''),
            'base64'
          );
          proofScreenshotUrl = await cloudinaryService.uploadScreenshot(buffer, testId, candidateId);
        } else if (screenshotBase64.startsWith('http://') || screenshotBase64.startsWith('https://')) {
          proofScreenshotUrl = screenshotBase64;
        }
      } catch (uploadErr) {
        console.warn('[Proctoring] Proof upload error, fallback to data URL:', uploadErr.message);
        proofScreenshotUrl = screenshotBase64;
      }
    }

    // Check if an existing recent log (last 4.5s) was created via socket without proofScreenshotUrl
    const recentCutoff = new Date(Date.now() - 4500);
    let log = await MalpracticeLog.findOne({
      candidateId,
      testId,
      violationType,
      detectedAt: { $gte: recentCutoff },
      $or: [{ proofScreenshotUrl: null }, { proofScreenshotUrl: { $exists: false } }],
    }).sort({ detectedAt: -1 });

    const isExistingLogUpdate = Boolean(log);

    if (log && proofScreenshotUrl) {
      log.proofScreenshotUrl = proofScreenshotUrl;
      await log.save();
    } else if (!log) {
      const logData = {
        candidateId,
        testId,
        roomId: roomId || undefined,
        violationType,
        proofScreenshotUrl,
      };
      if (detectedAt) {
        logData.detectedAt = new Date(detectedAt);
      }
      log = await MalpracticeLog.create(logData);
    }

    const candidate = await Candidate.findById(candidateId, 'name email');
    const roomDoc = roomId ? await Room.findById(roomId, 'roomName') : null;
    const malpracticeCount = await MalpracticeLog.countDocuments({ candidateId, testId });

    // Update active submission malpracticeCount if present
    await Submission.updateMany(
      { candidateId, testId, status: 'IN_PROGRESS' },
      { $set: { malpracticeCount } }
    ).catch(() => {});

    // FR-7.3: (a) candidate:warning, (b) malpractice:alert to admin — within 2 seconds
    const io = req.app.get('io');
    if (io) {
      io.to(`test:${testId}:admin`).emit('malpractice:alert', {
        malpracticeLogId: log._id,
        candidateId: candidateId.toString(),
        candidateName: candidate?.name || 'Candidate',
        candidateEmail: candidate?.email || '',
        roomId: roomId ? roomId.toString() : null,
        roomName: roomDoc?.roomName || 'Assigned Room',
        violationType,
        proofScreenshotUrl: log.proofScreenshotUrl || proofScreenshotUrl,
        currentCount: malpracticeCount,
        detectedAt: log.detectedAt,
        isEvidenceUpdate: isExistingLogUpdate,
      });

      if (isExistingLogUpdate) {
        io.to(`test:${testId}:admin`).emit('malpractice:evidence-updated', {
          malpracticeLogId: log._id.toString(),
          candidateId: candidateId.toString(),
          testId: testId.toString(),
          violationType,
          proofScreenshotUrl: log.proofScreenshotUrl || proofScreenshotUrl,
          detectedAt: log.detectedAt,
        });
      }

      // Update seat map and dashboard counters in real time
      io.to(`test:${testId}:admin`).emit('dashboard:update', {
        candidateId: candidateId.toString(),
        roomId: roomId ? roomId.toString() : null,
        malpracticeCount,
      });

      io.to(`test:${testId}:admin`).emit('seatmap:status', {
        candidateId: candidateId.toString(),
        roomId: roomId ? roomId.toString() : null,
        colorStatus: 'YELLOW', // warning state; disqualified = RED handled below
      });

      if (!isExistingLogUpdate) {
        io.to(`candidate:${candidateId}`).emit('candidate:warning', {
          violationType,
          message: `Violation detected: ${violationType.replace(/_/g, ' ')}. This has been flagged.`,
          violationCount: malpracticeCount,
        });
      }

      io.to(`candidate:${candidateId}`).emit('candidate:violation-updated', {
        candidateId: candidateId.toString(),
        testId: testId.toString(),
        violationCount: malpracticeCount,
        violationType,
      });
    }

    res.status(201).json({ malpracticeLog: log, violationCount: malpracticeCount });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /malpractice-logs/:logId/review ────────────────────────────────────
// Body: { adminAction: "WARNED" | "DISQUALIFIED" }
// Response: { malpracticeLog }
// FR-7.4: Only admin manual action disqualifies a candidate mid-test
const reviewMalpractice = async (req, res, next) => {
  try {
    const { logId } = req.params;
    const { adminAction } = req.body;

    if (!['WARNED', 'DISQUALIFIED'].includes(adminAction)) {
      return res.status(400).json({ error: 'adminAction must be WARNED or DISQUALIFIED' });
    }

    const log = await MalpracticeLog.findByIdAndUpdate(
      logId,
      {
        adminAction,
        adminReviewed: true,
        reviewedBy: req.user.id,
        reviewedAt: new Date(),
      },
      { new: true }
    );
    if (!log) return res.status(404).json({ error: 'MalpracticeLog not found' });

    const io = req.app.get('io');

    if (adminAction === 'DISQUALIFIED') {
      // FR-7.4: Admin manual disqualification
      await Candidate.findByIdAndUpdate(log.candidateId, { isDisqualified: true });

      // Auto-submit / update disqualified candidate's submissions
      const Submission = require('../models/Submission');
      await Submission.updateMany(
        { candidateId: log.candidateId, testId: log.testId },
        { status: 'AUTO_SUBMITTED_DISQUALIFIED', submittedAt: new Date() }
      );

      // Trigger re-evaluation for Results & Shortlist
      const evaluationService = require('../services/evaluationService');
      evaluationService.runFinalEvaluationPass(log.testId.toString()).catch(() => {});

      // candidate:disqualified event forces client to lock/close test window (Section 10.2)
      io.to(`candidate:${log.candidateId}`).emit('candidate:disqualified', {
        reason: 'MANUAL',
      });

      // Update seat map to RED
      io.to(`test:${log.testId}:admin`).emit('seatmap:status', {
        candidateId: log.candidateId,
        roomId: log.roomId,
        colorStatus: 'RED',
      });

      // Update candidate status on admin live dashboard
      io.to(`test:${log.testId}:admin`).emit('dashboard:update', {
        candidateId: log.candidateId.toString(),
        roomId: log.roomId ? log.roomId.toString() : null,
        status: 'DISQUALIFIED',
        colorStatus: 'RED',
        timeRemaining: 0,
      });

      // BUG-21: Recompute and broadcast Tentative Time if disqualified candidate was the leader
      const { broadcastTentativeTime } = require('./submissionController');
      broadcastTentativeTime(io, log.testId, log.roomId);

      // BUG-30 Part A: Check if test should auto-transition to ENDED if all candidates have concluded
      const { checkAndAutoEndTest } = require('../services/testLifecycleService');
      checkAndAutoEndTest(log.testId, io).catch(console.error);
    }

    if (adminAction === 'WARNED') {
      // BUG-64: Emit official proctor warning event to candidate
      if (io) {
        io.to(`candidate:${log.candidateId}`).emit('candidate:warning-issued', {
          warningId: log._id.toString(),
          violationType: log.violationType,
          issuedAt: new Date().toISOString(),
          adminName: req.user?.name || 'Proctor',
        });
      }
    }

    res.json({ malpracticeLog: log });
  } catch (err) {
    next(err);
  }
};

// ── GET /tests/:testId/candidates/:candidateId/malpractice-logs ───────────────
// BUG-91: Paginated & lean query optimization to reduce 3MB+ multi-second payload transfers down to fast sub-second loads
const getCandidateMalpracticeLogs = async (req, res, next) => {
  try {
    const { testId, candidateId } = req.params;
    const filter = { testId, candidateId };

    // Support pagination: page (default 1), limit (default 10, or 'all' to fetch all)
    const isAll = req.query.limit === 'all';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = isAll ? 0 : Math.max(1, parseInt(req.query.limit, 10) || 10);
    const skip = isAll ? 0 : (page - 1) * limit;

    let query = MalpracticeLog.find(filter)
      .populate('reviewedBy', 'name email')
      .sort({ detectedAt: -1 })
      .lean();

    if (!isAll) {
      query = query.skip(skip).limit(limit);
    }

    const [totalCount, logs, subDoc, candDoc] = await Promise.all([
      MalpracticeLog.countDocuments(filter),
      query,
      Submission.findOne({ testId, candidateId }, { candidateStartTime: 1, candidateEndTime: 1, submittedAt: 1, status: 1 }).sort({ submittedAt: -1, candidateStartTime: 1 }),
      Candidate.findById(candidateId, 'isDisqualified createdAt'),
    ]);

    const hasMore = !isAll && (skip + logs.length < totalCount);

    res.json({
      malpracticeLogs: logs,
      totalCount,
      page: isAll ? 1 : page,
      limit: isAll ? totalCount : limit,
      totalPages: isAll ? 1 : (limit > 0 ? Math.ceil(totalCount / limit) : 1),
      hasMore,
      sessionTimestamps: {
        candidateStartTime: subDoc?.candidateStartTime || candDoc?.createdAt || null,
        candidateEndTime: subDoc?.candidateEndTime || null,
        submittedAt: subDoc?.submittedAt || null,
        status: subDoc?.status || (candDoc?.isDisqualified ? 'DISQUALIFIED' : null),
        isDisqualified: Boolean(candDoc?.isDisqualified),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /tests/:testId/malpractice-logs ───────────────────────────────────────
const getTestMalpracticeLogs = async (req, res, next) => {
  try {
    const { testId } = req.params;
    const { candidateId } = req.query;
    const filter = { testId };
    if (candidateId) filter.candidateId = candidateId;

    const logs = await MalpracticeLog.find(filter)
      .populate('candidateId', 'name email isDisqualified')
      .populate('roomId', 'roomName roomCode')
      .populate('reviewedBy', 'name email')
      .sort({ detectedAt: -1 });
    res.json({ malpracticeLogs: logs });
  } catch (err) {
    next(err);
  }
};

// ── POST /proctoring/camera-disconnected ────────────────────────────────────
const reportCameraDisconnected = async (req, res, next) => {
  try {
    let { candidateId, testId, roomId, disconnectAt, screenshotBase64 } = req.body;

    if (!candidateId && req.user) {
      candidateId = req.user.id;
    }

    if (req.user.type === 'candidate' && String(req.user.id) !== String(candidateId)) {
      return res.status(403).json({ error: 'Cannot report violation for another candidate' });
    }

    const Submission = require('../models/Submission');
    const Room = require('../models/Room');

    if (!roomId && candidateId) {
      const activeSub = await Submission.findOne({ candidateId, testId });
      roomId = activeSub?.roomId;
      if (!roomId) {
        const candidateRoom = await Room.findOne({ testId, 'joinedCandidates.candidateId': candidateId });
        roomId = candidateRoom?._id;
      }
    }

    if (!candidateId || !testId) {
      return res.status(400).json({ error: 'candidateId and testId are required' });
    }

    // BUG-65 Part B: If candidate has already completed test, suppress spurious camera disconnect
    const isConcluded = await Submission.exists({
      candidateId,
      testId,
      status: { $in: ['SUBMITTED', 'AUTO_SUBMITTED_TIME_UP', 'AUTO_SUBMITTED_DISQUALIFIED'] },
    });
    if (isConcluded) {
      console.log(`[Proctoring] Suppressing camera disconnect for candidate ${candidateId} (test already concluded)`);
      return res.json({ success: true, message: 'Test already concluded; camera disconnect suppressed.' });
    }

    // Check if there is already an open CAMERA_DISCONNECTED log for this candidate & test
    let log = await MalpracticeLog.findOne({
      candidateId,
      testId,
      violationType: 'CAMERA_DISCONNECTED',
      reconnectAt: null,
    });

    if (!log) {
      let proofScreenshotUrl = null;
      if (screenshotBase64) {
        try {
          const buffer = Buffer.from(
            screenshotBase64.replace(/^data:image\/\w+;base64,/, ''),
            'base64'
          );
          proofScreenshotUrl = await cloudinaryService.uploadScreenshot(buffer, testId, candidateId);
        } catch (uploadErr) {
          console.warn('[Proctoring] Camera disconnect proof upload error, fallback to data URL:', uploadErr.message);
          proofScreenshotUrl = screenshotBase64;
        }
      }

      log = await MalpracticeLog.create({
        candidateId,
        testId,
        roomId: roomId || undefined,
        violationType: 'CAMERA_DISCONNECTED',
        disconnectAt: disconnectAt ? new Date(disconnectAt) : new Date(),
        detectedAt: disconnectAt ? new Date(disconnectAt) : new Date(),
        proofScreenshotUrl,
        resolved: false,
      });
    }

    const candidate = await Candidate.findById(candidateId, 'name email');
    const roomDoc = roomId ? await Room.findById(roomId, 'roomName') : null;
    const malpracticeCount = await MalpracticeLog.countDocuments({ candidateId, testId });

    const io = req.app.get('io');
    if (io) {
      io.to(`test:${testId}:admin`).emit('malpractice:alert', {
        malpracticeLogId: log._id,
        candidateId: candidateId.toString(),
        candidateName: candidate?.name || 'Candidate',
        candidateEmail: candidate?.email || '',
        roomId: roomId ? roomId.toString() : null,
        roomName: roomDoc?.roomName || 'Assigned Room',
        violationType: 'CAMERA_DISCONNECTED',
        disconnectAt: log.disconnectAt,
        reconnectAt: null,
        durationSeconds: null,
        isCameraDisconnected: true,
        resolved: false,
        currentCount: malpracticeCount,
        detectedAt: log.detectedAt,
        proofScreenshotUrl: log.proofScreenshotUrl,
      });

      io.to(`test:${testId}:admin`).emit('dashboard:update', {
        candidateId: candidateId.toString(),
        roomId: roomId ? roomId.toString() : null,
        malpracticeCount,
      });

      // BUG-40: Candidate UI is governed strictly by the full-screen blocking CameraDisconnectedOverlay.
      // Do NOT emit candidate:warning here to avoid weak/dismissible banners or toasts.
      io.to(`test:${testId}:admin`).emit('seatmap:status', {
        candidateId: candidateId.toString(),
        roomId: roomId ? roomId.toString() : null,
        colorStatus: 'YELLOW',
      });
    }

    res.json({ malpracticeLog: log, violationCount: malpracticeCount });
  } catch (err) {
    next(err);
  }
};

// ── POST /proctoring/camera-reconnected ──────────────────────────────────────
const reportCameraReconnected = async (req, res, next) => {
  try {
    let { candidateId, testId, roomId, reconnectAt } = req.body;

    if (!candidateId && req.user) {
      candidateId = req.user.id || req.user._id;
    }

    if (req.user && req.user.type === 'candidate' && String(req.user.id || req.user._id) !== String(candidateId)) {
      return res.status(403).json({ error: 'Cannot report violation for another candidate' });
    }

    const Submission = require('../models/Submission');
    const Room = require('../models/Room');

    if (!roomId && candidateId) {
      const activeSub = await Submission.findOne({ candidateId, testId });
      roomId = activeSub?.roomId;
      if (!roomId) {
        const candidateRoom = await Room.findOne({ testId, 'joinedCandidates.candidateId': candidateId });
        roomId = candidateRoom?._id;
      }
    }

    if (!candidateId || !testId) {
      return res.status(400).json({ error: 'candidateId and testId are required' });
    }

    const recDate = reconnectAt ? new Date(reconnectAt) : new Date();

    const log = await MalpracticeLog.findOne({
      candidateId,
      testId,
      violationType: 'CAMERA_DISCONNECTED',
      reconnectAt: null,
    }).sort({ disconnectAt: -1 });

    if (log) {
      const start = new Date(log.disconnectAt || log.detectedAt);
      const durationSec = Math.max(1, Math.round((recDate.getTime() - start.getTime()) / 1000));
      log.reconnectAt = recDate;
      log.durationSeconds = durationSec;
      log.resolved = true;
      await log.save();

      const candidate = await Candidate.findById(candidateId, 'name email');
      const roomDoc = roomId ? await Room.findById(roomId, 'roomName') : null;
      const malpracticeCount = await MalpracticeLog.countDocuments({ candidateId, testId });

      const io = req.app.get('io');
      if (io) {
        io.to(`test:${testId}:admin`).emit('malpractice:alert', {
          malpracticeLogId: log._id,
          candidateId: candidateId.toString(),
          candidateName: candidate?.name || 'Candidate',
          candidateEmail: candidate?.email || '',
          roomId: roomId ? roomId.toString() : null,
          roomName: roomDoc?.roomName || 'Assigned Room',
          violationType: 'CAMERA_DISCONNECTED',
          disconnectAt: log.disconnectAt,
          reconnectAt: log.reconnectAt,
          durationSeconds: log.durationSeconds,
          isCameraDisconnected: false,
          resolved: true,
          currentCount: malpracticeCount,
          detectedAt: log.detectedAt,
          proofScreenshotUrl: log.proofScreenshotUrl,
        });

        io.to(`test:${testId}:admin`).emit('dashboard:update', {
          candidateId: candidateId.toString(),
          roomId: roomId ? roomId.toString() : null,
          malpracticeCount,
        });

        io.to(`test:${testId}:admin`).emit('seatmap:status', {
          candidateId: candidateId.toString(),
          roomId: roomId ? roomId.toString() : null,
          colorStatus: 'GREEN',
        });
      }

      return res.json({ malpracticeLog: log, resolved: true });
    }

    res.json({ message: 'No open camera disconnection found', resolved: true });
  } catch (err) {
    next(err);
  }
};

// ── GET /proctoring/:testId/violation-count ────────────────────────────────────
// Candidate or Admin queries the total live violation count for the active test session
const getViolationCount = async (req, res, next) => {
  try {
    const { testId } = req.params;
    let candidateId = req.query.candidateId || req.user.id;

    if (req.user.type === 'candidate') {
      candidateId = req.user.id;
    }

    const violationCount = await MalpracticeLog.countDocuments({ candidateId, testId });
    res.json({ violationCount });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  submitFrame,
  reportViolation,
  reviewMalpractice,
  getCandidateMalpracticeLogs,
  getTestMalpracticeLogs,
  reportCameraDisconnected,
  reportCameraReconnected,
  getViolationCount,
};
