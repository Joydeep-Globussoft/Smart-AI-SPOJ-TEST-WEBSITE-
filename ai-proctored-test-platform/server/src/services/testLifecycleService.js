const mongoose = require('mongoose');
const Test = require('../models/Test');
const Room = require('../models/Room');
const Submission = require('../models/Submission');
const evaluationService = require('./evaluationService');

/**
 * Perform all actions required to end a test:
 * - Update test.status to ENDED
 * - Close all active rooms for this test
 * - Broadcast test:ended and room:updated via Socket.io
 * - Trigger final evaluation pass
 *
 * @param {string|mongoose.Types.ObjectId} testId
 * @param {object} io - Socket.io server instance
 * @param {string} reason - 'MANUAL' | 'AUTO_EXPIRED_NO_ACTIVE_CANDIDATES'
 */
const performEndTest = async (testId, io, reason = 'MANUAL') => {
  try {
    const now = new Date();
    const existing = await Test.findById(testId);
    if (!existing) return null;

    const updates = { status: 'ENDED' };
    if (!existing.endedAt) {
      updates.endedAt = now;
    }
    // If liveStartedAt was not previously recorded, derive from earliest room or creation
    if (!existing.liveStartedAt) {
      // ASSUMPTION: If liveStartedAt was not recorded when test went LIVE, derive from the earliest room's start window or createdAt
      const earliestRoom = await Room.findOne({ testId: existing._id }).sort({ createdAt: 1 });
      if (earliestRoom) {
        if (earliestRoom.passwordValidUntil) {
          updates.liveStartedAt = new Date(
            new Date(earliestRoom.passwordValidUntil).getTime() - (existing.startTestWindowMinutes || 10) * 60 * 1000
          );
        } else {
          updates.liveStartedAt = earliestRoom.createdAt;
        }
      } else {
        updates.liveStartedAt = existing.createdAt;
      }
    }

    const test = await Test.findByIdAndUpdate(testId, updates, { new: true });
    if (!test) return null;

    // Transition all active rooms for this test to CLOSED
    await Room.updateMany(
      { testId: test._id, status: 'ACTIVE' },
      { status: 'CLOSED' }
    );

    // FEATURE-008: Transition any remaining IN_PROGRESS submissions to AUTO_SUBMITTED_TIME_UP
    await Submission.updateMany(
      { testId: test._id, status: 'IN_PROGRESS' },
      { status: 'AUTO_SUBMITTED_TIME_UP', submittedAt: now }
    );

    // Section 10.2: broadcast test:ended to admins and candidates
    if (io) {
      io.to(`test:${test._id}:admin`).emit('test:ended', { testId: test._id, reason });
      io.to(`test:${test._id}:admin`).emit('room:updated', { testId: test._id, action: 'ROOMS_CLOSED' });
      io.to(`test:${test._id}`).emit('test:ended', { testId: test._id, reason });
    }

    // Trigger final evaluation pass (scoring, shortlisting, malpractice checks)
    evaluationService.runFinalEvaluationPass(test._id.toString()).catch((err) => {
      console.error(`[Evaluation] Final pass error for test ${testId}:`, err);
    });

    console.log(`[TestLifecycle] Test "${test.title}" (${test._id}) transitioned to ENDED (reason: ${reason})`);
    return test;
  } catch (err) {
    console.error(`[TestLifecycle] Error ending test ${testId}:`, err);
    throw err;
  }
};

/**
 * ASSUMPTION (BUG-30 Part A): Test Auto-Ending Lifecycle Rule.
 * A LIVE test automatically transitions to ENDED when:
 * 1. Zero rooms are still accepting new joins (all rooms CLOSED or passwordValidUntil expired).
 * 2. AND zero candidates are currently IN_PROGRESS (all who joined have reached terminal states:
 *    SUBMITTED, AUTO_SUBMITTED_TIME_UP, DISQUALIFIED, or timer has expired).
 * 3. Candidates who joined a room but never started are considered abandoned if the room password
 *    expired more than startTestWindowMinutes ago.
 * 4. If a test has zero rooms, it auto-ends only after (durationMinutes + startTestWindowMinutes).
 *
 * @param {string|mongoose.Types.ObjectId} testId
 * @param {object} io - Socket.io server instance
 * @returns {Promise<boolean>} true if test was auto-ended, false otherwise
 */
const checkAndAutoEndTest = async (testId, io) => {
  try {
    const test = await Test.findById(testId);
    if (!test || test.status !== 'LIVE') return false;

    const rooms = await Room.find({ testId: test._id });
    const now = new Date();

    // 1. Check if any room is actively accepting new candidate joins
    const anyRoomAcceptingJoins = rooms.some(
      (r) => r.status === 'ACTIVE' && r.passwordValidUntil && new Date(r.passwordValidUntil) > now
    );
    if (anyRoomAcceptingJoins) {
      return false;
    }

    // 2. Check if any candidate has an active IN_PROGRESS submission whose timer has not expired
    const activeSubmissions = await Submission.find({
      testId: test._id,
      status: 'IN_PROGRESS',
      candidateEndTime: { $gt: now },
    });
    if (activeSubmissions.length > 0) {
      return false;
    }

    // 3. Check if any joined candidate who hasn't started yet is still within their start window
    const windowMinutes = test.startTestWindowMinutes || 10;
    let anyPendingCandidateCanStart = false;

    for (const r of rooms) {
      if (r.passwordValidUntil) {
        const windowExpiresAt = new Date(new Date(r.passwordValidUntil).getTime() + windowMinutes * 60 * 1000);
        if (now <= windowExpiresAt) {
          // Check if any candidate in this room hasn't started yet
          const startedCandidateIds = (
            await Submission.find({ testId: test._id, roomId: r._id }, { candidateId: 1 })
          ).map((s) => s.candidateId?.toString());

          const unstarted = (r.joinedCandidates || []).some(
            (j) => j.candidateId && !startedCandidateIds.includes(j.candidateId.toString())
          );
          if (unstarted) {
            anyPendingCandidateCanStart = true;
            break;
          }
        }
      }
    }
    if (anyPendingCandidateCanStart) {
      return false;
    }

    // 4. Special case: if test has 0 rooms, auto-end only if it has been LIVE longer than duration + window
    if (rooms.length === 0) {
      const liveDurationMs = ((test.durationMinutes || 60) + windowMinutes) * 60 * 1000;
      const testAgeMs = now - new Date(test.updatedAt || test.createdAt);
      if (testAgeMs < liveDurationMs) {
        return false;
      }
    }

    // All conditions satisfied: zero rooms accepting joins and zero candidates in progress.
    await performEndTest(test._id, io, 'AUTO_EXPIRED_NO_ACTIVE_CANDIDATES');
    return true;
  } catch (err) {
    console.error(`[TestLifecycle] Error checking auto-end for test ${testId}:`, err);
    return false;
  }
};

/**
 * Scan all LIVE tests in database and auto-end any that meet the completion condition.
 *
 * @param {object} io - Socket.io server instance
 * @returns {Promise<string[]>} array of test IDs that were ended
 */
const checkAndAutoEndAllLiveTests = async (io) => {
  try {
    const liveTests = await Test.find({ status: 'LIVE' }, { _id: 1, title: 1 });
    const endedIds = [];

    for (const t of liveTests) {
      const didEnd = await checkAndAutoEndTest(t._id, io);
      if (didEnd) {
        endedIds.push(t._id.toString());
      }
    }

    if (endedIds.length > 0) {
      console.log(`[TestLifecycle] Auto-ended ${endedIds.length} test(s):`, endedIds);
    }
    return endedIds;
  } catch (err) {
    console.error('[TestLifecycle] Error checking all live tests:', err);
    return [];
  }
};

/**
 * Start recurring background scheduler to automatically check and end completed LIVE tests.
 *
 * @param {object} io - Socket.io server instance
 * @param {number} intervalMs - Poll interval in milliseconds (default: 30s)
 */
const startLifecycleScheduler = (io, intervalMs = 30000) => {
  console.log(`[TestLifecycle] Starting background lifecycle scheduler (interval: ${intervalMs / 1000}s)`);
  // Run an initial sweep right away
  checkAndAutoEndAllLiveTests(io).catch((err) => {
    console.error('[TestLifecycle] Initial sweep error:', err);
  });

  const timer = setInterval(() => {
    checkAndAutoEndAllLiveTests(io).catch((err) => {
      console.error('[TestLifecycle] Periodic check error:', err);
    });
  }, intervalMs);

  return timer;
};

module.exports = {
  performEndTest,
  checkAndAutoEndTest,
  checkAndAutoEndAllLiveTests,
  startLifecycleScheduler,
};
