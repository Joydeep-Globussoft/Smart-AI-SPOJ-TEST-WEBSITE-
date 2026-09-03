// Shortlist Service — Module 8
// Generates and regenerates the Shortlist document (FR-10.1)
// Triggered by: test end, passingCriteria change, malpracticeDisqualifyThreshold change
const Shortlist = require('../models/Shortlist');
const EvaluationResult = require('../models/EvaluationResult');
const MalpracticeLog = require('../models/MalpracticeLog');
const Candidate = require('../models/Candidate');
const Test = require('../models/Test');

/**
 * Regenerate the shortlist for a given test.
 * FR-10.1: Shortlist.generatedAt updates on every change;
 * candidates re-filtered (by passingCriteria + malpracticeThreshold) and re-ranked
 * (rank 1 = highest score = ascending rank / descending score).
 *
 * @param {string} testId
 * @returns {Shortlist} The updated shortlist document
 */
const regenerate = async (testId) => {
  const test = await Test.findById(testId);
  if (!test) throw new Error(`Test not found: ${testId}`);

  // Get all evaluation results for this test, grouped by candidate
  const allResults = await EvaluationResult.find({ testId }).populate(
    'candidateId',
    'name email isDisqualified'
  );

  // Group by candidateId — sum questionsCompletedCount and average scores
  const byCandidate = {};
  for (const r of allResults) {
    const cid = r.candidateId?._id?.toString();
    if (!cid) continue;
    if (!byCandidate[cid]) {
      byCandidate[cid] = {
        candidateId: r.candidateId._id,
        name: r.candidateId.name,
        email: r.candidateId.email,
        isDisqualified: r.candidateId.isDisqualified,
        totalScore: 0,
        questionsCompleted: 0,
        resultCount: 0,
      };
    }
    const qScore = Math.min(10, Math.max(0, Number(r.finalScorePerQuestion) || 0));
    byCandidate[cid].totalScore += qScore;
    byCandidate[cid].questionsCompleted += r.questionsCompletedCount || 0;
    byCandidate[cid].resultCount += 1;
  }

  // Get malpractice counts for each candidate in this test
  const malpracticeCounts = await MalpracticeLog.aggregate([
    { $match: { testId: test._id } },
    { $group: { _id: '$candidateId', count: { $sum: 1 } } },
  ]);
  const malpracticeMap = {};
  malpracticeCounts.forEach((m) => {
    malpracticeMap[m._id.toString()] = m.count;
  });

  // Filter candidates by passingCriteria and malpracticeDisqualifyThreshold
  const passingCriteria = test.passingCriteria;
  const malpracticeThreshold = test.malpracticeDisqualifyThreshold;

  const shortlistCandidates = [];
  for (const [cid, data] of Object.entries(byCandidate)) {
    const malpracticeCount = malpracticeMap[cid] || 0;

    // Skip if candidate is manually disqualified
    if (data.isDisqualified) continue;

    // FR-7.5: Exclude candidates exceeding malpractice threshold (if set)
    if (malpracticeThreshold !== null && malpracticeCount > malpracticeThreshold) continue;

    // Exclude candidates who didn't meet passing criteria
    if (data.questionsCompleted < passingCriteria) continue;

    // Normalized overall candidate score on 0-10 scale
    const rawAverageScore = data.resultCount > 0 ? data.totalScore / data.resultCount : 0;
    const normalizedScore = Number(Math.min(10, Math.max(0, rawAverageScore)).toFixed(2));

    shortlistCandidates.push({
      candidateId: data.candidateId,
      name: data.name,
      email: data.email,
      score: normalizedScore,
      questionsCompleted: data.questionsCompleted,
      malpracticeCount,
      rank: 0, // will be assigned below
    });
  }

  // FR-10.1: rank ascending = score descending (rank 1 = highest score)
  shortlistCandidates.sort((a, b) => b.score - a.score);
  shortlistCandidates.forEach((c, i) => {
    c.rank = i + 1;
  });

  // Upsert the Shortlist document (unique per testId)
  const shortlist = await Shortlist.findOneAndUpdate(
    { testId },
    {
      testId,
      passingCriteriaUsed: passingCriteria,
      malpracticeThresholdUsed: malpracticeThreshold,
      candidates: shortlistCandidates,
      generatedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  console.log(
    `[Shortlist] Regenerated for test ${testId}: ${shortlistCandidates.length} candidates`
  );
  return shortlist;
};

module.exports = { regenerate };
