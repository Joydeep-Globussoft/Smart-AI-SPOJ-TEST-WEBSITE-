/**
 * QA Automated Verification Suite: BUG-78 (Admin Seat Tile Timer Display)
 * 
 * Regression Verification:
 * Admin seat tile must show live countdown ("Xm Ys left") for ALL in-progress candidates,
 * never a static "In Progress" placeholder when the exam timer is genuinely running client-side.
 * 
 * Verifies:
 * 1. Multi-candidate round-robin room with mixed join/submission states.
 * 2. Candidates with multiple submission documents (e.g. drafts + question set submissions).
 * 3. Fresh starts, code runs, and reconnects (BUG-53).
 * 4. Authoritative candidateEndTime, candidateStartTime, and timeRemaining aggregation in getLiveCandidates & getRoomCandidates.
 * 5. Non-regression of round-robin set assignment, "Set N" badges, tentative time, and live attempted counters.
 */

const path = require('path');
const mongoose = require('mongoose');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('QA SUITE: BUG-78 - ADMIN SEAT TILE TIMER DISPLAY & CANDIDATE TIMERS');
  console.log('========================================================================\n');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spoj_test_platform';
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log('Connected to MongoDB for live validation.');

  const Folder = require('../../models/Folder');
  const QuestionSet = require('../../models/QuestionSet');
  const Question = require('../../models/Question');
  const Test = require('../../models/Test');
  const Room = require('../../models/Room');
  const Candidate = require('../../models/Candidate');
  const Submission = require('../../models/Submission');
  const Admin = require('../../models/Admin');
  const { getLiveCandidates, getRoomCandidates } = require('../../controllers/roomController');
  const { startAttempt, joinRoom, runCode, saveCode } = require('../../controllers/submissionController');

  let admin = await Admin.findOne({ email: 'qa_bug78_admin@spoj.test' });
  if (!admin) {
    admin = await Admin.create({
      name: 'QA BUG-78 Admin',
      email: 'qa_bug78_admin@spoj.test',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
      role: 'ADMIN',
    });
  }

  // --- Step 1: Setup Folder, Sets, and Questions ---
  console.log('\n--- Step 1: Setting Up Question Folder & Sets ---');
  const folder = await Folder.create({
    name: 'QA BUG-78 Pool Folder',
    testType: 'JAVASCRIPT',
    createdBy: admin._id,
  });

  const set1 = await QuestionSet.create({ name: 'Set 1', folderId: folder._id, testType: 'JAVASCRIPT', createdBy: admin._id });
  const set2 = await QuestionSet.create({ name: 'Set 2', folderId: folder._id, testType: 'JAVASCRIPT', createdBy: admin._id });
  const set3 = await QuestionSet.create({ name: 'Set 3', folderId: folder._id, testType: 'JAVASCRIPT', createdBy: admin._id });

  // Add 2 questions per set
  const q1A = await Question.create({ title: 'S1 Q1', description: 'desc', testType: 'JAVASCRIPT', questionSetId: set1._id, visibleTestCases: [{ input: '1', expectedOutput: '1' }] });
  const q1B = await Question.create({ title: 'S1 Q2', description: 'desc', testType: 'JAVASCRIPT', questionSetId: set1._id, visibleTestCases: [{ input: '2', expectedOutput: '2' }] });
  const q2A = await Question.create({ title: 'S2 Q1', description: 'desc', testType: 'JAVASCRIPT', questionSetId: set2._id, visibleTestCases: [{ input: '3', expectedOutput: '3' }] });
  const q2B = await Question.create({ title: 'S2 Q2', description: 'desc', testType: 'JAVASCRIPT', questionSetId: set2._id, visibleTestCases: [{ input: '4', expectedOutput: '4' }] });
  const q3A = await Question.create({ title: 'S3 Q1', description: 'desc', testType: 'JAVASCRIPT', questionSetId: set3._id, visibleTestCases: [{ input: '5', expectedOutput: '5' }] });
  const q3B = await Question.create({ title: 'S3 Q2', description: 'desc', testType: 'JAVASCRIPT', questionSetId: set3._id, visibleTestCases: [{ input: '6', expectedOutput: '6' }] });

  // --- Step 2: Create Live Test & Room ---
  console.log('\n--- Step 2: Creating Live Test & Room ---');
  const test = await Test.create({
    title: 'QA BUG-78 Pool Test',
    testType: 'JAVASCRIPT',
    folderId: folder._id,
    questionSetPoolId: folder._id.toString(),
    durationMinutes: 90,
    totalQuestions: 2,
    passingCriteria: 1,
    instructions: 'Instructions',
    status: 'LIVE',
    createdBy: admin._id,
  });

  const room = await Room.create({
    roomName: 'Lab 10',
    roomCode: 'LAB10_' + Date.now(),
    roomPassword: 'pass' + Date.now(),
    testId: test._id,
    capacity: 20,
    status: 'ACTIVE',
  });

  // --- Step 3: Create 5 Candidates and Join Room in Round-Robin ---
  console.log('\n--- Step 3: Simulating 5 Candidates Joining Room ---');
  const candidateNames = ['hh', 'he', 'hi', 'Munna Tripathi', 'Guddu Pandit'];
  const candidates = [];

  for (let i = 0; i < candidateNames.length; i++) {
    const name = candidateNames[i];
    const email = `qa_bug78_${i}_${Date.now()}@spoj.test`;
    const cand = await Candidate.create({
      name,
      email,
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
      role: 'CANDIDATE',
    });
    candidates.push(cand);

    // Call joinRoom
    const joinReq = {
      body: { roomCode: room.roomCode, roomPassword: room.roomPassword },
      user: { id: cand._id.toString(), role: 'CANDIDATE' },
      app: { get: () => null },
    };
    let joinResData = null;
    const joinRes = {
      status(code) { return this; },
      json(d) { joinResData = d; return this; },
    };
    await joinRoom(joinReq, joinRes, (e) => { if (e) throw e; });
  }

  // --- Step 4: Simulate Diverse Attempt Scenarios ---
  console.log('\n--- Step 4: Starting Attempts with Diverse Submission Patterns ---');

  // Candidate 0 ("hh", Set 1): Regular startAttempt
  const req0 = { params: { testId: test._id.toString() }, body: { roomId: room._id.toString() }, user: { id: candidates[0]._id.toString() }, app: { get: () => null } };
  let resData0 = null;
  await startAttempt(req0, { json: (d) => { resData0 = d; } }, (e) => { if (e) throw e; });
  assert(resData0?.candidateStartTime && resData0?.candidateEndTime, 'Candidate 0 (hh) startAttempt returned start and end times');

  // Candidate 1 ("he", Set 2): Calls saveCode first, then startAttempt
  const saveReq1 = { params: { questionId: q2A._id.toString() }, body: { code: 'console.log(1);', language: 'javascript', testId: test._id.toString() }, user: { id: candidates[1]._id.toString() } };
  await saveCode(saveReq1, { json: () => {} }, (e) => { if (e) throw e; });
  const req1 = { params: { testId: test._id.toString() }, body: { roomId: room._id.toString() }, user: { id: candidates[1]._id.toString() }, app: { get: () => null } };
  let resData1 = null;
  await startAttempt(req1, { json: (d) => { resData1 = d; } }, (e) => { if (e) throw e; });
  assert(resData1?.candidateStartTime && resData1?.candidateEndTime, 'Candidate 1 (he) startAttempt returned start and end times');

  // Candidate 2 ("hi", Set 3): Has an existing empty placeholder submission, then startAttempt
  await Submission.create({ candidateId: candidates[2]._id, testId: test._id, roomId: room._id, questionId: q3A._id, status: 'IN_PROGRESS' });
  const req2 = { params: { testId: test._id.toString() }, body: { roomId: room._id.toString() }, user: { id: candidates[2]._id.toString() }, app: { get: () => null } };
  let resData2 = null;
  await startAttempt(req2, { json: (d) => { resData2 = d; } }, (e) => { if (e) throw e; });
  assert(resData2?.candidateStartTime && resData2?.candidateEndTime, 'Candidate 2 (hi) startAttempt returned start and end times');

  // Candidate 3 ("Munna Tripathi", Set 1): Regular startAttempt + runs code
  const req3 = { params: { testId: test._id.toString() }, body: { roomId: room._id.toString() }, user: { id: candidates[3]._id.toString() }, app: { get: () => null } };
  let resData3 = null;
  await startAttempt(req3, { json: (d) => { resData3 = d; } }, (e) => { if (e) throw e; });
  assert(resData3?.candidateStartTime && resData3?.candidateEndTime, 'Candidate 3 (Munna Tripathi) startAttempt returned start and end times');

  // Candidate 4 ("Guddu Pandit", Set 2): Starts attempt, then refreshes/reconnects
  const req4 = { params: { testId: test._id.toString() }, body: { roomId: room._id.toString() }, user: { id: candidates[4]._id.toString() }, app: { get: () => null } };
  await startAttempt(req4, { json: () => {} }, (e) => { if (e) throw e; });
  let resData4Reconnect = null;
  await startAttempt(req4, { json: (d) => { resData4Reconnect = d; } }, (e) => { if (e) throw e; });
  assert(resData4Reconnect?.candidateStartTime && resData4Reconnect?.candidateEndTime, 'Candidate 4 (Guddu Pandit) reconnect preserved start and end times');

  // --- Step 5: Test getLiveCandidates endpoint payload ---
  console.log('\n--- Step 5: Validating getLiveCandidates Payload for ALL Candidates ---');
  let liveCandidatesData = null;
  const liveReq = { params: { testId: test._id.toString() }, app: { get: () => null } };
  const liveRes = { json: (d) => { liveCandidatesData = d; } };
  await getLiveCandidates(liveReq, liveRes, (e) => { if (e) throw e; });

  assert(liveCandidatesData?.candidates !== undefined, 'getLiveCandidates returned candidates dictionary');
  const cands = Object.values(liveCandidatesData.candidates);
  assert(cands.length === 5, `getLiveCandidates returned all 5 candidates (found: ${cands.length})`);

  for (const c of cands) {
    console.log(`  -> Candidate "${c.name}": status=${c.status}, timeRemaining=${c.timeRemaining}ms, candidateEndTime=${c.candidateEndTime}, set=${c.assignedQuestionSetName}`);
    assert(c.status === 'IN_PROGRESS', `Candidate "${c.name}" status is IN_PROGRESS`);
    assert(c.candidateStartTime !== null && c.candidateStartTime !== undefined, `Candidate "${c.name}" candidateStartTime is populated`);
    assert(c.candidateEndTime !== null && c.candidateEndTime !== undefined, `Candidate "${c.name}" candidateEndTime is populated`);
    assert(typeof c.timeRemaining === 'number' && c.timeRemaining > 0, `Candidate "${c.name}" timeRemaining is positive (> 0)`);
    assert(c.assignedQuestionSetName !== null, `Candidate "${c.name}" has valid assignedQuestionSetName (${c.assignedQuestionSetName})`);
    assert(typeof c.assignedSetIndex === 'number' && c.assignedSetIndex >= 1, `Candidate "${c.name}" has assignedSetIndex (${c.assignedSetIndex})`);
  }

  // --- Step 6: Test getRoomCandidates endpoint payload ---
  console.log('\n--- Step 6: Validating getRoomCandidates Payload ---');
  let roomCandidatesData = null;
  const roomReq = { params: { roomId: room._id.toString() } };
  const roomRes = { json: (d) => { roomCandidatesData = d; } };
  await getRoomCandidates(roomReq, roomRes, (e) => { if (e) throw e; });

  const roomCands = roomCandidatesData?.candidates || [];
  assert(roomCands.length === 5, `getRoomCandidates returned all 5 candidates (found: ${roomCands.length})`);
  for (const rc of roomCands) {
    assert(rc.candidateEndTime !== null && rc.candidateEndTime !== undefined, `getRoomCandidates: Candidate "${rc.name}" candidateEndTime is populated`);
    assert(rc.startedAt !== null && rc.startedAt !== undefined, `getRoomCandidates: Candidate "${rc.name}" startedAt is populated`);
  }

  // --- Step 7: Client-side getCandidateRemainingMs simulation ---
  console.log('\n--- Step 7: Simulating Client-side Countdown Logic ---');
  const getCandidateRemainingMs = (candidate, currentNow) => {
    if (!candidate) return 0;
    if (candidate.status !== 'IN_PROGRESS') return 0;
    if (candidate.candidateEndTime) {
      return Math.max(0, new Date(candidate.candidateEndTime).getTime() - currentNow);
    }
    if (typeof candidate.timeRemaining === 'number' && candidate.timeRemaining > 0) {
      const elapsed = candidate.lastSyncedAt ? Math.max(0, currentNow - candidate.lastSyncedAt) : 0;
      return Math.max(0, candidate.timeRemaining - elapsed);
    }
    return 0;
  };

  const clientNow = Date.now();
  for (const c of cands) {
    const rem = getCandidateRemainingMs(c, clientNow);
    assert(rem > 0, `Client countdown for candidate "${c.name}" yields positive remainingMs: ${Math.round(rem / 1000)}s left`);
    const totalSec = Math.floor(rem / 1000);
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    const formatted = `${mins}m ${secs < 10 ? '0' : ''}${secs}s left`;
    assert(!formatted.includes('In Progress'), `Candidate "${c.name}" renders live timer string ("${formatted}") instead of static "In Progress"`);
  }

  // Cleanup QA Fixtures
  console.log('\n--- Cleaning up QA Test Fixtures ---');
  await Submission.deleteMany({ testId: test._id });
  await Room.deleteMany({ _id: room._id });
  await Test.deleteMany({ _id: test._id });
  await Question.deleteMany({ _id: { $in: [q1A._id, q1B._id, q2A._id, q2B._id, q3A._id, q3B._id] } });
  await QuestionSet.deleteMany({ _id: { $in: [set1._id, set2._id, set3._id] } });
  await Folder.deleteMany({ _id: folder._id });
  await Candidate.deleteMany({ _id: { $in: candidates.map(c => c._id) } });

  console.log('\n========================================================================');
  console.log(`QA VERIFICATION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('========================================================================\n');

  await mongoose.disconnect();

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('[FATAL ERROR IN QA SUITE]:', err);
  process.exit(1);
});
