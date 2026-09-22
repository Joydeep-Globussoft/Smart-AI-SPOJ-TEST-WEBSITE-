const mongoose = require('mongoose');
const Shortlist = require('../models/Shortlist');
const EvaluationResult = require('../models/EvaluationResult');
const MalpracticeLog = require('../models/MalpracticeLog');
const Candidate = require('../models/Candidate');
const Test = require('../models/Test');
const Room = require('../models/Room');
const Submission = require('../models/Submission');

/**
 * Fetch all valid, enrolled candidates belonging strictly to this test.
 * Reads from Room.joinedCandidates and Submissions, then queries Candidate collection.
 * Pruned or non-existent candidate accounts are strictly rejected.
 *
 * @param {string} testId
 * @returns {Promise<{ validCandidateIds: string[], validCandidateMap: Map<string, object>, totalCandidates: number }>}
 */
const getEnrolledTestCandidates = async (testId) => {
  const [rooms, submissions] = await Promise.all([
    Room.find({ testId }).lean(),
    Submission.find({ testId }).lean(),
  ]);

  const candidateIdSet = new Set();
  for (const r of rooms) {
    for (const j of r.joinedCandidates || []) {
      const cid = (j.candidateId?._id || j.candidateId)?.toString();
      if (cid) candidateIdSet.add(cid);
    }
  }
  for (const s of submissions) {
    const cid = (s.candidateId?._id || s.candidateId)?.toString();
    if (cid) candidateIdSet.add(cid);
  }

  const rawCandidateIds = Array.from(candidateIdSet);
  if (rawCandidateIds.length === 0) {
    return {
      validCandidateIds: [],
      validCandidateMap: new Map(),
      totalCandidates: 0,
    };
  }

  // Strictly query Candidate collection to verify existence (purged/deleted candidates are excluded)
  const candidateDocs = await Candidate.find({ _id: { $in: rawCandidateIds } }).lean();
  const validCandidateMap = new Map();
  for (const doc of candidateDocs) {
    validCandidateMap.set(doc._id.toString(), doc);
  }

  const validCandidateIds = Array.from(validCandidateMap.keys());
  return {
    validCandidateIds,
    validCandidateMap,
    totalCandidates: validCandidateIds.length,
  };
};

/**
 * Regenerate the shortlist for a given test.
 * FR-10.1: Shortlist.generatedAt updates on every change;
 * candidates re-filtered (by passingCriteria + malpracticeThreshold) and re-ranked
 * (rank 1 = highest score = ascending rank / descending score).
 *
 * Enforces the 3-step sequence:
 * Step 1: Delete existing shortlist records belonging ONLY to the current test.
 * Step 2: Recalculate rankings from current test candidates only.
 * Step 3: Create fresh shortlist records with testId, totalCandidates, and rankings.
 *
 * @param {string} testId
 * @returns {Shortlist} The updated shortlist document
 */
const regenerate = async (testId) => {
  const test = await Test.findById(testId);
  if (!test) throw new Error(`Test not found: ${testId}`);

  // Step 1: Delete existing shortlist records belonging ONLY to the current test (clean rebuild)
  await Shortlist.deleteOne({ testId });

  // Step 2: Recalculate rankings from current test candidates only
  const { validCandidateIds, validCandidateMap, totalCandidates } = await getEnrolledTestCandidates(testId);

  const passingCriteria = Number(test.passingCriteria ?? 0);
  const rawThreshold = test.malpracticeDisqualifyThreshold;
  const malpracticeThreshold =
    rawThreshold !== null &&
    rawThreshold !== undefined &&
    rawThreshold !== '' &&
    !isNaN(Number(rawThreshold))
      ? Number(rawThreshold)
      : null;

  // If no valid candidates enrolled in this test, create empty shortlist and return
  if (validCandidateIds.length === 0) {
    const shortlist = await Shortlist.create({
      testId,
      passingCriteriaUsed: passingCriteria,
      malpracticeThresholdUsed: malpracticeThreshold,
      candidates: [],
      totalCandidates: 0,
      generatedAt: new Date(),
    });
    return shortlist;
  }

  // Fetch raw evaluation results strictly for this test and enrolled valid candidates
  const allResults = await EvaluationResult.find({
    testId,
    candidateId: { $in: validCandidateIds },
  }).lean();

  // Group by candidateId — sum questionsCompletedCount and average scores
  const byCandidate = {};
  for (const r of allResults) {
    const cid = (r.candidateId?._id || r.candidateId)?.toString();
    if (!cid || !validCandidateMap.has(cid)) continue;

    const candDoc = validCandidateMap.get(cid);

    if (!byCandidate[cid]) {
      byCandidate[cid] = {
        candidateId: candDoc._id,
        name: candDoc.name,
        email: candDoc.email,
        isDisqualified: Boolean(candDoc.isDisqualified),
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

  // Get malpractice counts strictly for this test and valid candidates
  const malpracticeCounts = await MalpracticeLog.aggregate([
    {
      $match: {
        testId: test._id,
        candidateId: { $in: validCandidateIds.map((id) => new mongoose.Types.ObjectId(id)) },
      },
    },
    { $group: { _id: '$candidateId', count: { $sum: 1 } } },
  ]);
  const malpracticeMap = {};
  malpracticeCounts.forEach((m) => {
    malpracticeMap[m._id.toString()] = m.count;
  });

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

  // Backend safeguard check (Requirement 8): shortlistedCandidates <= totalCandidates
  if (shortlistCandidates.length > totalCandidates) {
    console.error(
      `[Shortlist][Integrity Guard] shortlistedCandidates (${shortlistCandidates.length}) > totalCandidates (${totalCandidates}) for test ${testId}`
    );
  }

  // Step 3: Create fresh shortlist records. Do not append to existing data.
  const shortlist = await Shortlist.create({
    testId,
    passingCriteriaUsed: passingCriteria,
    malpracticeThresholdUsed: malpracticeThreshold,
    candidates: shortlistCandidates,
    totalCandidates,
    generatedAt: new Date(),
  });

  console.log(
    `[Shortlist] Regenerated for test ${testId}: ${shortlistCandidates.length} shortlisted out of ${totalCandidates} candidates`
  );
  return shortlist;
};

module.exports = { regenerate, getEnrolledTestCandidates };

