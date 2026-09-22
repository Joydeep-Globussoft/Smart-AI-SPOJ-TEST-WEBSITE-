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

  // 1. Fetch raw evaluation results (lean) so candidateId is NEVER lost even if populate returns null
  const allResults = await EvaluationResult.find({ testId }).lean();

  // 2. Fetch existing shortlist so we have cached candidate names/emails as a resilient fallback
  const existingShortlist = await Shortlist.findOne({ testId }).lean();
  const existingCandidateMap = {};
  if (existingShortlist?.candidates) {
    for (const c of existingShortlist.candidates) {
      if (c.candidateId) {
        existingCandidateMap[c.candidateId.toString()] = c;
      }
    }
  }

  // 3. Extract unique candidate IDs and query Candidate collection for fresh metadata
  const candidateIds = [
    ...new Set(
      allResults
        .map((r) => (r.candidateId?._id || r.candidateId)?.toString())
        .filter(Boolean)
    ),
  ];
  const candidateDocs = await Candidate.find({ _id: { $in: candidateIds } }).lean();
  const candidateDocMap = {};
  for (const doc of candidateDocs) {
    candidateDocMap[doc._id.toString()] = doc;
  }

  // Group by candidateId — sum questionsCompletedCount and average scores
  const byCandidate = {};
  for (const r of allResults) {
    const cid = (r.candidateId?._id || r.candidateId)?.toString();
    if (!cid) continue;

    const candDoc = candidateDocMap[cid];
    const prevCand = existingCandidateMap[cid];

    if (!byCandidate[cid]) {
      byCandidate[cid] = {
        candidateId: r.candidateId?._id || r.candidateId,
        name: candDoc?.name || prevCand?.name || 'Candidate',
        email: candDoc?.email || prevCand?.email || '—',
        isDisqualified: Boolean(candDoc?.isDisqualified ?? prevCand?.isDisqualified ?? false),
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
  const passingCriteria = Number(test.passingCriteria ?? 0);
  const rawThreshold = test.malpracticeDisqualifyThreshold;
  const malpracticeThreshold =
    rawThreshold !== null &&
    rawThreshold !== undefined &&
    rawThreshold !== '' &&
    !isNaN(Number(rawThreshold))
      ? Number(rawThreshold)
      : null;

  const shortlistCandidates = [];
  for (const [cid, data] of Object.entries(byCandidate)) {
    const malpracticeCount = malpracticeMap[cid] || 0;

    // Skip if candidate is manually disqualified
    if (data.isDisqualified) continue;

    // FR-7.5: Exclude candidates exceeding malpractice threshold (if set)
    // When malpracticeThreshold is null ("None"), no limit is applied
    if (malpracticeThreshold !== null && malpracticeCount > malpracticeThreshold) continue;

    // Exclude candidates who didn't meet passing criteria
    // If passingCriteria is 0, (0 < 0) is false so 0 questions completed meets the criteria
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
