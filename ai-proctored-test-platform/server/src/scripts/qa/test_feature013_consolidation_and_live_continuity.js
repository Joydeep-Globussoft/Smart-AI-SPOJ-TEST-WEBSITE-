// test_feature013_consolidation_and_live_continuity.js
// Automated QA Suite for FEATURE-012/013 Consolidation & Live Active Exam Session Continuity

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_proctored_test_platform';

const Admin = require('../../models/Admin');
const Candidate = require('../../models/Candidate');
const Folder = require('../../models/Folder');
const QuestionSet = require('../../models/QuestionSet');
const Question = require('../../models/Question');
const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Submission = require('../../models/Submission');

const { createTest, updateTest, getTest, getTests } = require('../../controllers/testController');
const { getQuestionPools } = require('../../controllers/questionController');
const { joinRoom, startAttempt, saveCode, submitCode, submitAll, getQuestion } = require('../../controllers/submissionController');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runQA() {
  console.log('========================================================================');
  console.log('QA SUITE: FEATURE-012/013 CONSOLIDATION & LIVE ACTIVE EXAM CONTINUITY');
  console.log('========================================================================\n');

  // ── PART 1: Static Architecture & File Verification ──
  console.log('--- Part 1: Static Code Audits ---');
  const createTestModalPath = path.resolve(__dirname, '../../../../client/src/shared/CreateTestModal.jsx');
  const adminTestDetailPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx');
  const createModalCode = fs.readFileSync(createTestModalPath, 'utf8');
  const testDetailCode = fs.readFileSync(adminTestDetailPath, 'utf8');

  assert(!createModalCode.includes("setQuestionMode"), 'CreateTestModal removes setQuestionMode state');
  assert(!createModalCode.includes("Single Set"), 'CreateTestModal removes "Single Set" mode button');
  assert(createModalCode.includes("Question Folder"), 'CreateTestModal features "Question Folder" selection');
  assert(!testDetailCode.includes("setQuestionMode"), 'AdminTestDetail removes setQuestionMode state');
  assert(!testDetailCode.includes("Single Set"), 'AdminTestDetail removes "Single Set" mode button');

  // ── PART 2: Database Setup & Fixtures ──
  console.log('\n--- Part 2: Database Initialization & User Setup ---');
  await mongoose.connect(MONGODB_URI);

  let admin = await Admin.findOne({ email: 'qa_consolidation_admin@test.com' });
  if (!admin) {
    admin = await Admin.create({
      name: 'QA Consolidation Admin',
      email: 'qa_consolidation_admin@test.com',
      passwordHash: 'hashedpassword123',
      role: 'SUPER_ADMIN',
    });
  }

  // ── PART 3: 1-Set Folder Creation & Universal Round-Robin ──
  console.log('\n--- Part 3: 1-Set Folder Creation & Universal Assignment ---');
  const folderSingle = await Folder.create({
    name: `QA Single Set Folder ${Date.now()}`,
    testType: 'SPOJ',
    createdBy: admin._id,
  });

  const setSingle = await QuestionSet.create({
    name: `QA Only Set in Folder ${Date.now()}`,
    testType: 'SPOJ',
    folderId: folderSingle._id,
    createdBy: admin._id,
  });

  const q1 = await Question.create({
    questionSetId: setSingle._id,
    testType: 'SPOJ',
    title: 'Q1 Single Set Test',
    description: 'Solve problem 1',
    visibleTestCases: [{ input: '1', output: '1' }],
  });
  const q2 = await Question.create({
    questionSetId: setSingle._id,
    testType: 'SPOJ',
    title: 'Q2 Single Set Test',
    description: 'Solve problem 2',
    visibleTestCases: [{ input: '2', output: '2' }],
  });
  await QuestionSet.findByIdAndUpdate(setSingle._id, {
    $set: { questionIds: [q1._id, q2._id] },
  });

  // Test getQuestionPools
  let poolResData = null;
  await getQuestionPools(
    { user: { id: admin._id.toString(), role: 'SUPER_ADMIN' }, query: {} },
    { json: (d) => { poolResData = d; } },
    (e) => { if (e) throw e; }
  );

  const foundPool = poolResData.pools.find((p) => p.poolId === folderSingle._id.toString());
  assert(Boolean(foundPool), 'getQuestionPools returns newly created 1-set Folder');
  assert(foundPool.setCount === 1, '1-set folder reports setCount === 1');
  assert(foundPool.questionCount === 2, '1-set folder reports questionCount === 2');
  assert(foundPool.isValid === true, '1-set folder is marked isValid === true');
  assert(foundPool.validationError === null, '1-set folder has validationError === null');

  // Create test via Folder selection
  let createdTest = null;
  await createTest(
    {
      user: { id: admin._id.toString(), role: 'SUPER_ADMIN' },
      body: {
        title: 'QA 1-Set Test',
        testType: 'SPOJ',
        folderId: folderSingle._id.toString(),
        durationMinutes: 60,
        passingCriteria: 1,
        instructions: 'Test instructions',
      },
    },
    {
      status: () => ({
        json: (d) => { createdTest = d.test; },
      }),
    },
    (e) => { if (e) throw e; }
  );

  assert(Boolean(createdTest), 'createTest successfully creates test using folderId');
  assert(createdTest.totalQuestions === 2, 'createTest locks totalQuestions to folder question count (2)');
  assert(createdTest.folderId.toString() === folderSingle._id.toString(), 'test.folderId correctly stored');

  // Start test & create Room
  await Test.findByIdAndUpdate(createdTest._id, { status: 'LIVE', liveStartedAt: new Date() });
  const room1 = await Room.create({
    testId: createdTest._id,
    roomName: 'Lab 101',
    roomCode: `R1_${Date.now()}`,
    roomPassword: 'pwd',
    passwordValidUntil: new Date(Date.now() + 60 * 60 * 1000),
    status: 'ACTIVE',
  });

  // Candidate 1 and Candidate 2 join room
  const candA = await Candidate.create({ name: 'Cand A', email: `candA_${Date.now()}@test.com`, passwordHash: 'hashedpwd' });
  const candB = await Candidate.create({ name: 'Cand B', email: `candB_${Date.now()}@test.com`, passwordHash: 'hashedpwd' });

  await joinRoom(
    { user: { id: candA._id.toString() }, body: { roomCode: room1.roomCode, roomPassword: 'pwd' } },
    { json: () => {} },
    (e) => { if (e) throw e; }
  );
  await joinRoom(
    { user: { id: candB._id.toString() }, body: { roomCode: room1.roomCode, roomPassword: 'pwd' } },
    { json: () => {} },
    (e) => { if (e) throw e; }
  );

  const updatedRoom1 = await Room.findById(room1._id);
  const entryA = updatedRoom1.joinedCandidates.find((j) => j.candidateId.toString() === candA._id.toString());
  const entryB = updatedRoom1.joinedCandidates.find((j) => j.candidateId.toString() === candB._id.toString());

  assert(entryA.assignedQuestionSetId.toString() === setSingle._id.toString(), 'Candidate A assigned single set from 1-set folder');
  assert(entryB.assignedQuestionSetId.toString() === setSingle._id.toString(), 'Candidate B also assigned single set from 1-set folder');

  // Candidate A startAttempt
  let startAttemptResA = null;
  await startAttempt(
    { user: { id: candA._id.toString() }, params: { testId: createdTest._id.toString() }, body: { roomId: room1._id.toString() } },
    { json: (d) => { startAttemptResA = d; } },
    (e) => { if (e) throw e; }
  );

  assert(startAttemptResA.questions.length === 2, 'Candidate A receives exactly 2 questions');
  assert(startAttemptResA.questions[0]._id.toString() === q1._id.toString(), 'Candidate A receives Q1 from the single set');

  // ── PART 4: Multi-Set Folder Round-Robin ──
  console.log('\n--- Part 4: Multi-Set Folder Round-Robin Verification ---');
  const folderMulti = await Folder.create({
    name: `QA Multi-Set Folder ${Date.now()}`,
    testType: 'SPOJ',
    createdBy: admin._id,
  });

  const setMulti1 = await QuestionSet.create({ name: 'Set Alpha', testType: 'SPOJ', folderId: folderMulti._id, createdBy: admin._id });
  const setMulti2 = await QuestionSet.create({ name: 'Set Beta', testType: 'SPOJ', folderId: folderMulti._id, createdBy: admin._id });

  const qM1A = await Question.create({ questionSetId: setMulti1._id, testType: 'SPOJ', title: 'Q Set1 A', description: 'Desc', visibleTestCases: [{ input: '1', output: '1' }] });
  const qM2A = await Question.create({ questionSetId: setMulti2._id, testType: 'SPOJ', title: 'Q Set2 A', description: 'Desc', visibleTestCases: [{ input: '2', output: '2' }] });
  await QuestionSet.findByIdAndUpdate(setMulti1._id, { $set: { questionIds: [qM1A._id] } });
  await QuestionSet.findByIdAndUpdate(setMulti2._id, { $set: { questionIds: [qM2A._id] } });

  let multiTest = null;
  await createTest(
    {
      user: { id: admin._id.toString(), role: 'SUPER_ADMIN' },
      body: {
        title: 'QA Multi-Set Test',
        testType: 'SPOJ',
        folderId: folderMulti._id.toString(),
        durationMinutes: 60,
        passingCriteria: 1,
        instructions: 'Test instructions',
      },
    },
    {
      status: () => ({
        json: (d) => { multiTest = d.test; },
      }),
    },
    (e) => { if (e) throw e; }
  );

  await Test.findByIdAndUpdate(multiTest._id, { status: 'LIVE', liveStartedAt: new Date() });
  const roomMulti = await Room.create({
    testId: multiTest._id,
    roomName: 'Lab 202',
    roomCode: `RM_${Date.now()}`,
    roomPassword: 'pwd',
    passwordValidUntil: new Date(Date.now() + 60 * 60 * 1000),
    status: 'ACTIVE',
  });

  const candM1 = await Candidate.create({ name: 'Cand M1', email: `candM1_${Date.now()}@test.com`, passwordHash: 'hashedpwd' });
  const candM2 = await Candidate.create({ name: 'Cand M2', email: `candM2_${Date.now()}@test.com`, passwordHash: 'hashedpwd' });
  const candM3 = await Candidate.create({ name: 'Cand M3', email: `candM3_${Date.now()}@test.com`, passwordHash: 'hashedpwd' });

  await joinRoom({ user: { id: candM1._id.toString() }, body: { roomCode: roomMulti.roomCode, roomPassword: 'pwd' } }, { json: () => {} }, (e) => { if (e) throw e; });
  await joinRoom({ user: { id: candM2._id.toString() }, body: { roomCode: roomMulti.roomCode, roomPassword: 'pwd' } }, { json: () => {} }, (e) => { if (e) throw e; });
  await joinRoom({ user: { id: candM3._id.toString() }, body: { roomCode: roomMulti.roomCode, roomPassword: 'pwd' } }, { json: () => {} }, (e) => { if (e) throw e; });

  const reloadedRoomMulti = await Room.findById(roomMulti._id);
  const entryM1 = reloadedRoomMulti.joinedCandidates.find((j) => j.candidateId.toString() === candM1._id.toString());
  const entryM2 = reloadedRoomMulti.joinedCandidates.find((j) => j.candidateId.toString() === candM2._id.toString());
  const entryM3 = reloadedRoomMulti.joinedCandidates.find((j) => j.candidateId.toString() === candM3._id.toString());

  assert(entryM1.assignedQuestionSetId.toString() === setMulti1._id.toString(), 'Candidate 1 assigned Set Alpha (Index 0)');
  assert(entryM2.assignedQuestionSetId.toString() === setMulti2._id.toString(), 'Candidate 2 assigned Set Beta (Index 1)');
  assert(entryM3.assignedQuestionSetId.toString() === setMulti1._id.toString(), 'Candidate 3 wraps around to Set Alpha (Index 0)');

  // ── PART 5: CRITICAL QA TEST — Active In-Progress Live Exam Session Continuity ──
  console.log('\n--- Part 5: Active In-Progress Live Exam Session Continuity Test ---');

  // Step 5.1: Create a Legacy Test with direct questionSetId only (no folderId / no questionSetPoolId)
  const legacySet = await QuestionSet.create({
    name: `QA Legacy Pre-Consolidation Set ${Date.now()}`,
    testType: 'SPOJ',
    createdBy: admin._id,
    folderId: folderSingle._id,
  });
  const qLeg1 = await Question.create({
    questionSetId: legacySet._id,
    testType: 'SPOJ',
    title: 'Legacy Problem 1',
    description: 'Solve legacy 1',
    visibleTestCases: [{ input: '10', output: '10' }],
  });
  const qLeg2 = await Question.create({
    questionSetId: legacySet._id,
    testType: 'SPOJ',
    title: 'Legacy Problem 2',
    description: 'Solve legacy 2',
    visibleTestCases: [{ input: '20', output: '20' }],
  });
  await QuestionSet.findByIdAndUpdate(legacySet._id, { $set: { questionIds: [qLeg1._id, qLeg2._id] } });

  const legacyLiveTest = await Test.create({
    title: 'Legacy Active Live Test',
    testType: 'SPOJ',
    questionSetId: legacySet._id,
    folderId: null, // Legacy state: null folder
    questionSetPoolId: null, // Legacy state: null pool
    durationMinutes: 90,
    totalQuestions: 2,
    passingCriteria: 1,
    instructions: 'Active legacy exam in progress',
    status: 'LIVE',
    liveStartedAt: new Date(Date.now() - 15 * 60 * 1000), // Started 15 mins ago
    createdBy: admin._id,
  });

  const legacyRoom = await Room.create({
    testId: legacyLiveTest._id,
    roomName: 'Legacy Room Alpha',
    roomCode: `RLEG_${Date.now()}`,
    roomPassword: 'pwd',
    passwordValidUntil: new Date(Date.now() + 45 * 60 * 1000),
    status: 'ACTIVE',
  });

  const activeCandidate = await Candidate.create({
    name: 'Active Mid-Exam Candidate',
    email: `active_cand_${Date.now()}@test.com`,
    passwordHash: 'hashedpwd',
  });

  // Candidate joined prior to deployment
  await joinRoom(
    { user: { id: activeCandidate._id.toString() }, body: { roomCode: legacyRoom.roomCode, roomPassword: 'pwd' } },
    { json: () => {} },
    (e) => { if (e) throw e; }
  );

  // Candidate started attempt before consolidation deployment
  let initialAttemptRes = null;
  await startAttempt(
    { user: { id: activeCandidate._id.toString() }, params: { testId: legacyLiveTest._id.toString() }, body: { roomId: legacyRoom._id.toString() } },
    { json: (d) => { initialAttemptRes = d; } },
    (e) => { if (e) throw e; }
  );

  assert(initialAttemptRes.questions.length === 2, 'Pre-deployment: Active candidate received 2 questions');
  const initialStartTime = new Date(initialAttemptRes.candidateStartTime).getTime();
  const initialEndTime = new Date(initialAttemptRes.candidateEndTime).getTime();

  // Candidate actively saved code for Q1 mid-exam
  await saveCode(
    {
      user: { id: activeCandidate._id.toString() },
      params: { questionId: qLeg1._id.toString() },
      body: {
        testId: legacyLiveTest._id.toString(),
        code: 'print("solution 1")',
        language: 'python',
      },
    },
    { json: () => {} },
    (e) => { if (e) throw e; }
  );

  // ── SIMULATE POST-DEPLOYMENT CANDIDATE ACTIONS ──
  console.log('  -> Simulating post-deployment candidate actions while mid-exam...');

  // 1. Candidate fetches question details (getQuestion)
  let qDetailsRes = null;
  await getQuestion(
    { user: { id: activeCandidate._id.toString() }, params: { testId: legacyLiveTest._id.toString(), questionId: qLeg2._id.toString() } },
    { json: (d) => { qDetailsRes = d; } },
    (e) => { if (e) throw e; }
  );
  assert(qDetailsRes.question._id.toString() === qLeg2._id.toString(), 'Post-deployment: Candidate can fetch Q2 details seamlessly');

  // 2. Candidate saves code for Q2
  let save2Res = null;
  await saveCode(
    {
      user: { id: activeCandidate._id.toString() },
      params: { questionId: qLeg2._id.toString() },
      body: {
        testId: legacyLiveTest._id.toString(),
        code: 'print("solution 2")',
        language: 'python',
      },
    },
    { json: (d) => { save2Res = d; } },
    (e) => { if (e) throw e; }
  );
  assert(Boolean(save2Res.success), 'Post-deployment: Candidate can save code for Q2 without error');

  // 3. Candidate simulates page refresh / browser tab reconnect mid-exam (calls startAttempt again)
  let resumeAttemptRes = null;
  await startAttempt(
    { user: { id: activeCandidate._id.toString() }, params: { testId: legacyLiveTest._id.toString() }, body: { roomId: legacyRoom._id.toString() } },
    { json: (d) => { resumeAttemptRes = d; } },
    (e) => { if (e) throw e; }
  );

  assert(resumeAttemptRes.questions.length === 2, 'Post-deployment reconnect: Candidate still gets exact same 2 questions');
  assert(new Date(resumeAttemptRes.candidateStartTime).getTime() === initialStartTime, 'Post-deployment reconnect: candidateStartTime was NOT reset');
  assert(new Date(resumeAttemptRes.candidateEndTime).getTime() === initialEndTime, 'Post-deployment reconnect: candidateEndTime was NOT reset');

  // Verify saved code was preserved across refresh
  const activeSubs = await Submission.find({ candidateId: activeCandidate._id, testId: legacyLiveTest._id });
  const subQ1 = activeSubs.find((s) => s.questionId.toString() === qLeg1._id.toString());
  const subQ2 = activeSubs.find((s) => s.questionId.toString() === qLeg2._id.toString());
  assert(subQ1.code === 'print("solution 1")', 'Post-deployment reconnect: Q1 submitted code strictly preserved');
  assert(subQ2.code === 'print("solution 2")', 'Post-deployment reconnect: Q2 submitted code strictly preserved');

  // 4. Candidate completes test (submitAll)
  let submitAllRes = null;
  await submitAll(
    { user: { id: activeCandidate._id.toString() }, params: { testId: legacyLiveTest._id.toString() } },
    { json: (d) => { submitAllRes = d; } },
    (e) => { if (e) throw e; }
  );
  assert(submitAllRes.success === true, 'Post-deployment: Active candidate successfully submits exam');

  // 5. Admin retrieves test details via getTest & getTests
  let adminTestRes = null;
  await getTest(
    { params: { testId: legacyLiveTest._id.toString() } },
    { json: (d) => { adminTestRes = d; } },
    (e) => { if (e) throw e; }
  );
  assert(adminTestRes.test.title === 'Legacy Active Live Test', 'Admin can fetch legacy live test details');
  assert(adminTestRes.test.questionSetId.name.includes('Legacy Pre-Consolidation'), 'Legacy questionSetId successfully populated');

  // ── Cleanup Test Fixtures ──
  await Submission.deleteMany({ testId: { $in: [createdTest._id, multiTest._id, legacyLiveTest._id] } });
  await Room.deleteMany({ testId: { $in: [createdTest._id, multiTest._id, legacyLiveTest._id] } });
  await Test.deleteMany({ _id: { $in: [createdTest._id, multiTest._id, legacyLiveTest._id] } });
  await Question.deleteMany({ questionSetId: { $in: [setSingle._id, setMulti1._id, setMulti2._id, legacySet._id] } });
  await QuestionSet.deleteMany({ _id: { $in: [setSingle._id, setMulti1._id, setMulti2._id, legacySet._id] } });
  await Folder.deleteMany({ _id: { $in: [folderSingle._id, folderMulti._id] } });
  await Candidate.deleteMany({ _id: { $in: [candA._id, candB._id, candM1._id, candM2._id, candM3._id, activeCandidate._id] } });

  console.log('\n========================================================================');
  console.log(`QA VERIFICATION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('========================================================================');
}

runQA()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('QA Suite Failed:', err);
    process.exit(1);
  });
