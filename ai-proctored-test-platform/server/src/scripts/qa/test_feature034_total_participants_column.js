/**
 * QA Test Suite for FEATURE-034:
 * Add "Total Participants" column to Test Management table
 */
const mongoose = require('mongoose');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Candidate = require('../../models/Candidate');
const Submission = require('../../models/Submission');
const Admin = require('../../models/Admin');
const Folder = require('../../models/Folder');
const QuestionSet = require('../../models/QuestionSet');
const { getTests } = require('../../controllers/testController');

async function runFeature034Tests() {
  console.log('====================================================');
  console.log('🧪 QA TEST SUITE: FEATURE-034 TOTAL PARTICIPANTS COLUMN');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function check(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Audit Frontend Files: AdminTests.jsx
  const adminTestsPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTests.jsx');
  const adminTestsSrc = fs.readFileSync(adminTestsPath, 'utf8');

  check(adminTestsSrc.includes("{ id: 'participants', label: 'Total Participants' }"), 'SORT_FIELDS includes Total Participants');
  check(adminTestsSrc.includes("if (s === 'participants_asc' || s === 'participants_desc') return 'participants';"), 'activeSortField handles participants sorting');
  check(adminTestsSrc.includes("if (activeSortField === 'participants')"), 'currentSortSummaryLabel handles participants label');
  check(adminTestsSrc.includes("case 'participants':"), 'filteredTests sort switch implements participants sorting');
  check(adminTestsSrc.includes("<th style={{ width: 120, minWidth: 110 }}>Total Participants</th>"), 'Table header includes Total Participants column');
  check(adminTestsSrc.includes("test.totalParticipants ?? test.candidateCount ?? 0"), 'Table row renders test.totalParticipants accurately');
  check(adminTestsSrc.includes("colSpan={10}") || adminTestsSrc.includes("colSpan={11}"), 'Empty state updated with colSpan=10/11 for new column');

  // Verify column ordering: Passing Criteria -> Total Participants -> Question Set
  const passingIndex = adminTestsSrc.indexOf('Passing Criteria</th>');
  const participantsIndex = adminTestsSrc.indexOf('Total Participants</th>');
  const questionSetIndex = adminTestsSrc.indexOf('Question Set</th>');

  check(passingIndex !== -1 && participantsIndex !== -1 && questionSetIndex !== -1, 'All three adjacent headers exist in source');
  check(passingIndex < participantsIndex && participantsIndex < questionSetIndex, 'Total Participants is positioned strictly after Passing Criteria and before Question Set');

  // 2. Test Backend Logic against MongoDB
  await mongoose.connect(process.env.MONGODB_URI);

  const cleanupIds = {
    testIds: [],
    candidateIds: [],
    roomIds: [],
    submissionIds: [],
  };

  try {
    const adminId = new mongoose.Types.ObjectId();

    // Create Test 1: Draft Test with 0 rooms/candidates
    const draftTest = await Test.create({
      title: 'QA Draft Test 034 ' + Date.now(),
      testType: 'JAVASCRIPT',
      durationMinutes: 30,
      passingCriteria: 1,
      status: 'DRAFT',
      instructions: 'QA Instructions',
      createdBy: adminId,
    });
    cleanupIds.testIds.push(draftTest._id);

    // Create Test 2: Active Test with 2 rooms, 3 distinct real candidates, 1 duplicate join across rooms, and 1 dropped-out candidate
    const activeTest = await Test.create({
      title: 'QA Active Multi-Room Test 034 ' + Date.now(),
      testType: 'JAVASCRIPT',
      durationMinutes: 45,
      passingCriteria: 2,
      status: 'LIVE',
      instructions: 'QA Instructions',
      createdBy: adminId,
    });
    cleanupIds.testIds.push(activeTest._id);

    // Create 3 Real Candidates
    const cand1 = await Candidate.create({
      name: 'QA Cand 1',
      email: `qacand1_${Date.now()}@globussoft.com`,
    });
    const cand2 = await Candidate.create({
      name: 'QA Cand 2',
      email: `qacand2_${Date.now()}@globussoft.com`,
    });
    const cand3 = await Candidate.create({
      name: 'QA Cand 3 (Dropped Out)',
      email: `qacand3_${Date.now()}@globussoft.com`,
    });
    cleanupIds.candidateIds.push(cand1._id, cand2._id, cand3._id);

    // Create a fake non-existent / purged candidate ObjectId
    const purgedFakeId = new mongoose.Types.ObjectId();

    // Room A has cand1, cand2, and the fake purged ID
    const roomA = await Room.create({
      testId: activeTest._id,
      roomName: 'Room A',
      roomCode: 'RMA_' + Date.now().toString().slice(-4),
      roomPassword: 'pwd',
      status: 'ACTIVE',
      joinedCandidates: [
        { candidateId: cand1._id, joinedAt: new Date() },
        { candidateId: cand2._id, joinedAt: new Date() },
        { candidateId: purgedFakeId, joinedAt: new Date() }, // Orphaned ID should be rejected
      ],
    });
    cleanupIds.roomIds.push(roomA._id);

    // Room B has cand2 (reconnect / cross-room) and cand3 (joined but never submitted)
    const roomB = await Room.create({
      testId: activeTest._id,
      roomName: 'Room B',
      roomCode: 'RMB_' + Date.now().toString().slice(-4),
      roomPassword: 'pwd',
      status: 'ACTIVE',
      joinedCandidates: [
        { candidateId: cand2._id, joinedAt: new Date() }, // Duplicate join of cand2
        { candidateId: cand3._id, joinedAt: new Date() }, // Cand 3 dropped out
      ],
    });
    cleanupIds.roomIds.push(roomB._id);

    // Create Submission for cand1 (disqualified or submitted)
    const fakeQId = new mongoose.Types.ObjectId();
    const sub1 = await Submission.create({
      candidateId: cand1._id,
      testId: activeTest._id,
      roomId: roomA._id,
      questionId: fakeQId,
      status: 'AUTO_SUBMITTED_DISQUALIFIED',
    });
    cleanupIds.submissionIds.push(sub1._id);

    // Execute getTests controller
    const req = { app: { get: () => null } };
    let responseData = null;
    const res = {
      json: (data) => {
        responseData = data;
      },
    };

    await getTests(req, res, (err) => {
      if (err) throw err;
    });

    check(Boolean(responseData && Array.isArray(responseData.tests)), 'getTests returned array of tests');

    const draftTestResult = responseData.tests.find((t) => t._id.toString() === draftTest._id.toString());
    const activeTestResult = responseData.tests.find((t) => t._id.toString() === activeTest._id.toString());

    check(Boolean(draftTestResult), 'Draft test found in getTests response');
    check(draftTestResult?.totalParticipants === 0, `Draft test totalParticipants is 0 (actual: ${draftTestResult?.totalParticipants})`);
    check(draftTestResult?.candidateCount === 0, `Draft test candidateCount is 0 (actual: ${draftTestResult?.candidateCount})`);
    check(draftTestResult?.hasCandidates === false, 'Draft test hasCandidates is false');

    check(Boolean(activeTestResult), 'Active multi-room test found in getTests response');
    check(
      activeTestResult?.totalParticipants === 3,
      `Active test totalParticipants correctly equals 3 distinct real candidates, ignoring duplicates & purged IDs (actual: ${activeTestResult?.totalParticipants})`
    );
    check(
      activeTestResult?.candidateCount === 3,
      `Active test candidateCount matches totalParticipants (actual: ${activeTestResult?.candidateCount})`
    );
    check(activeTestResult?.hasCandidates === true, 'Active test hasCandidates is true');

  } finally {
    // Clean up test data
    if (cleanupIds.testIds.length > 0) await Test.deleteMany({ _id: { $in: cleanupIds.testIds } });
    if (cleanupIds.roomIds.length > 0) await Room.deleteMany({ _id: { $in: cleanupIds.roomIds } });
    if (cleanupIds.candidateIds.length > 0) await Candidate.deleteMany({ _id: { $in: cleanupIds.candidateIds } });
    if (cleanupIds.submissionIds.length > 0) await Submission.deleteMany({ _id: { $in: cleanupIds.submissionIds } });
    await mongoose.disconnect();
  }

  console.log(`\n====================================================`);
  console.log(`📊 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runFeature034Tests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
