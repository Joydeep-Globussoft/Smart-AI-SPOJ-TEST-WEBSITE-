// Cooldown Helper — FEATURE-032: 12-hour cooldown between tests
const Candidate = require('../models/Candidate');
const Submission = require('../models/Submission');

const COOLDOWN_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Checks whether a candidate is currently in a 12-hour cooldown period since their last finished test.
 * @param {string|mongoose.Types.ObjectId} candidateId
 * @returns {Promise<{ inCooldown: boolean, remainingMs?: number, hours?: number, minutes?: number, message?: string, lastTestFinishedAt?: Date, eligibleAt?: Date }>}
 */
async function getCandidateCooldownStatus(candidateId) {
  if (!candidateId) return { inCooldown: false };

  try {
    const candidate = await Candidate.findById(candidateId);
    if (!candidate) return { inCooldown: false };

    let lastFinished = candidate.lastTestFinishedAt;

    // Fallback/backwards compatibility check for historical submissions before FEATURE-032
    if (!lastFinished) {
      const latestSub = await Submission.findOne({
        candidateId: candidate._id,
        status: { $in: ['SUBMITTED', 'AUTO_SUBMITTED_TIME_UP', 'AUTO_SUBMITTED_DISQUALIFIED'] },
        submittedAt: { $exists: true, $ne: null },
      }).sort({ submittedAt: -1 });

      if (latestSub && latestSub.submittedAt) {
        lastFinished = latestSub.submittedAt;
        await Candidate.findByIdAndUpdate(candidate._id, { lastTestFinishedAt: lastFinished });
      }
    }

    if (!lastFinished) {
      return { inCooldown: false };
    }

    const now = Date.now();
    const finishTimestamp = new Date(lastFinished).getTime();
    const elapsed = now - finishTimestamp;

    if (elapsed >= 0 && elapsed < COOLDOWN_DURATION_MS) {
      const remainingMs = COOLDOWN_DURATION_MS - elapsed;
      const totalMinutes = Math.max(1, Math.ceil(remainingMs / (1000 * 60)));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;

      let timeStr = '';
      if (hours > 0 && minutes > 0) {
        timeStr = `${hours}h ${minutes}m`;
      } else if (hours > 0) {
        timeStr = `${hours}h`;
      } else {
        timeStr = `${minutes}m`;
      }

      const eligibleAt = new Date(finishTimestamp + COOLDOWN_DURATION_MS);

      return {
        inCooldown: true,
        remainingMs,
        hours,
        minutes,
        timeStr,
        message: `You cannot take another test yet. You can take your next test in ${timeStr}.`,
        lastTestFinishedAt: lastFinished,
        eligibleAt,
      };
    }

    return { inCooldown: false };
  } catch (err) {
    console.error('[CooldownHelper] Error checking cooldown status:', err);
    return { inCooldown: false };
  }
}

/**
 * Records that a candidate has finished a test (manual submit, timeout, or disqualification).
 * @param {string|mongoose.Types.ObjectId} candidateId
 * @param {Date} [timestamp]
 */
async function recordCandidateTestFinish(candidateId, timestamp = new Date()) {
  if (!candidateId) return;
  try {
    const finishedAt = timestamp instanceof Date ? timestamp : new Date(timestamp);
    await Candidate.findByIdAndUpdate(candidateId, { lastTestFinishedAt: finishedAt });
    console.log(`[CooldownHelper] Candidate ${candidateId} finished test at ${finishedAt.toISOString()}`);
  } catch (err) {
    console.error('[CooldownHelper] Error recording candidate test finish:', err);
  }
}

module.exports = {
  COOLDOWN_DURATION_MS,
  getCandidateCooldownStatus,
  recordCandidateTestFinish,
};
