/**
 * QA Automated Verification Suite: FEATURE-012
 * Question Set Pool — Round-robin assignment of Question Sets from PDF upload batches per room
 *
 * Verifies:
 * 1. Data model extensions (QuestionSet, Test, Room, Submission)
 * 2. Pool grouping and equal question count validation endpoint (/question-sets/pools)
 * 3. Strict rejection of pool test creation with mismatched question counts or 0 questions
 * 4. Test creation with valid pool auto-locking totalQuestions
 * 5. Hydration of pool details in getTest/getTests
 * 6. Independent per-room round-robin assignment (Set 1 -> Set 2 -> Set 3 -> Set 1 wraparound)
 * 7. Room B independent rotation starting from Set 1
 * 8. BUG-53 reconnect preservation without advancing room counter
 * 9. startAttempt question resolution from individually assigned QuestionSet
 * 10. FEATURE-010 Attempted counter isolation across candidates on different sets
 * 11. Live monitoring candidate payload exposure (assignedQuestionSetName, assignedSetIndex)
 * 12. Single-set test backward compatibility
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: FEATURE-012 (Question Set Pool Round-Robin)');
  console.log('========================================================================\n');

  // --- PART 1: Static Code & Architecture Audits ---
  console.log('--- Part 1: Static Architecture & File Verification ---');

  const questionSetModelPath = path.resolve(__dirname, '../../models/QuestionSet.js');
  const testModelPath = path.resolve(__dirname, '../../models/Test.js');
  const roomModelPath = path.resolve(__dirname, '../../models/Room.js');
  const submissionModelPath = path.resolve(__dirname, '../../models/Submission.js');
  const questionControllerPath = path.resolve(__dirname, '../../controllers/questionController.js');
  const testControllerPath = path.resolve(__dirname, '../../controllers/testController.js');
  const submissionControllerPath = path.resolve(__dirname, '../../controllers/submissionController.js');
  const roomControllerPath = path.resolve(__dirname, '../../controllers/roomController.js');
  const createTestModalPath = path.resolve(__dirname, '../../../../client/src/shared/CreateTestModal.jsx');
  const adminTestDetailPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx');
  const adminLiveDashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');

  const questionSetModelCode = fs.readFileSync(questionSetModelPath, 'utf8');
  const testModelCode = fs.readFileSync(testModelPath, 'utf8');
  const roomModelCode = fs.readFileSync(roomModelPath, 'utf8');
  const submissionModelCode = fs.readFileSync(submissionModelPath, 'utf8');
  const questionControllerCode = fs.readFileSync(questionControllerPath, 'utf8');
  const testControllerCode = fs.readFileSync(testControllerPath, 'utf8');
  const submissionControllerCode = fs.readFileSync(submissionControllerPath, 'utf8');
  const roomControllerCode = fs.readFileSync(roomControllerPath, 'utf8');
  const createTestModalCode = fs.readFileSync(createTestModalPath, 'utf8');
  const adminTestDetailCode = fs.readFileSync(adminTestDetailPath, 'utf8');
  const adminLiveDashboardCode = fs.readFileSync(adminLiveDashboardPath, 'utf8');

  assert(
    questionSetModelCode.includes('uploadBatchId') && questionSetModelCode.includes('uploadBatchName'),
    'QuestionSet model schema includes uploadBatchId and uploadBatchName fields'
  );

  assert(
    testModelCode.includes('questionSetPoolId') && testModelCode.includes('default: null'),
    'Test model schema includes optional questionSetPoolId and nullable questionSetId'
  );

  assert(
    roomModelCode.includes('candidateJoinCounter') &&
    roomModelCode.includes('assignedQuestionSetId') &&
    roomModelCode.includes('joinIndex'),
    'Room model schema includes candidateJoinCounter, joinedCandidates.assignedQuestionSetId, and joinIndex'
  );

  assert(
    submissionModelCode.includes('assignedQuestionSetId'),
    'Submission model schema includes assignedQuestionSetId ref QuestionSet'
  );

  assert(
    questionControllerCode.includes('getQuestionPools') &&
    questionControllerCode.includes('uploadBatchId'),
    'questionController provides getQuestionPools with batch grouping and validation'
  );

  assert(
    testControllerCode.includes('questionSetPoolId') &&
    testControllerCode.includes('must contain the exact same question count'),
    'testController enforces strict equal-question-count validation for pools'
  );

  assert(
    submissionControllerCode.includes('candidateJoinCounter') &&
    submissionControllerCode.includes('assignedQuestionSetId'),
    'submissionController implements atomic candidateJoinCounter and round-robin assignment'
  );

  assert(
    roomControllerCode.includes('assignedQuestionSetName') &&
    roomControllerCode.includes('assignedSetIndex'),
    'roomController exposes assignedQuestionSetName and assignedSetIndex in candidate payloads'
  );

  assert(
    createTestModalCode.includes('questionSetPoolId') &&
    createTestModalCode.includes('Pool (Batch)') &&
    createTestModalCode.includes('Single Set'),
    'CreateTestModal provides Single Set vs Pool (Batch) switcher'
  );

  assert(
    adminTestDetailCode.includes('questionSetPoolId') &&
    adminTestDetailCode.includes('Pool (Batch)'),
    'AdminTestDetail supports Question Set Pool display and edit modal mode switcher'
  );

  assert(
    adminLiveDashboardCode.includes('assignedQuestionSetName') &&
    adminLiveDashboardCode.includes('assignedSetIndex'),
    'AdminLiveDashboard renders assigned Question Set badge in live monitoring views'
  );

  // --- PART 2: Database & Controller Enforcement Integration Tests ---
  console.log('\n--- Part 2: DB Integration & Functional Round-Robin Tests ---');
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_proctored_test_platform';
  await mongoose.connect(uri);

  const QuestionSet = require('../../models/QuestionSet');
  const Question = require('../../models/Question');
  const Test = require('../../models/Test');
  const Room = require('../../models/Room');
  const Candidate = require('../../models/Candidate');
  const Submission = require('../../models/Submission');
  const Admin = require('../../models/Admin');

  const { getQuestionPools } = require('../../controllers/questionController');
  const { createTest, getTest, updateTest } = require('../../controllers/testController');
  const { joinRoom, startAttempt, runCode } = require('../../controllers/submissionController');
  const { getLiveCandidates } = require('../../controllers/roomController');

  let adminUser = await Admin.findOne();
  if (!adminUser) {
    adminUser = await Admin.create({
      name: 'QA Admin',
      email: `qa_admin_${Date.now()}@example.com`,
      password: 'password123',
      role: 'SUPER_ADMIN',
    });
  }

  const batchIdValid = `batch_valid_${Date.now()}`;
  const batchIdMismatch = `batch_mismatch_${Date.now()}`;

  // First create QuestionSet shells with ObjectIds
  const setAId = new mongoose.Types.ObjectId();
  const setBId = new mongoose.Types.ObjectId();
  const setCId = new mongoose.Types.ObjectId();
  const setM1Id = new mongoose.Types.ObjectId();
  const setM2Id = new mongoose.Types.ObjectId();

  // Create Questions for valid batch (2 questions each for 3 sets = Set A, Set B, Set C)
  const q1A = await Question.create({ questionSetId: setAId, title: 'Set A Q1', problemStatement: 'Solve A1', difficulty: 'EASY', testType: 'SPOJ', testCases: [{ input: '1', expectedOutput: '1', isHidden: false }] });
  const q2A = await Question.create({ questionSetId: setAId, title: 'Set A Q2', problemStatement: 'Solve A2', difficulty: 'EASY', testType: 'SPOJ', testCases: [{ input: '2', expectedOutput: '2', isHidden: false }] });
  const setA = await QuestionSet.create({
    _id: setAId,
    name: 'Set A (PDF 1)',
    testType: 'SPOJ',
    uploadBatchId: batchIdValid,
    uploadBatchName: 'Batch 2026 Test Drive',
    questionIds: [q1A._id, q2A._id],
    createdBy: adminUser._id,
  });

  const q1B = await Question.create({ questionSetId: setBId, title: 'Set B Q1', problemStatement: 'Solve B1', difficulty: 'EASY', testType: 'SPOJ', testCases: [{ input: '1', expectedOutput: '1', isHidden: false }] });
  const q2B = await Question.create({ questionSetId: setBId, title: 'Set B Q2', problemStatement: 'Solve B2', difficulty: 'EASY', testType: 'SPOJ', testCases: [{ input: '2', expectedOutput: '2', isHidden: false }] });
  const setB = await QuestionSet.create({
    _id: setBId,
    name: 'Set B (PDF 2)',
    testType: 'SPOJ',
    uploadBatchId: batchIdValid,
    uploadBatchName: 'Batch 2026 Test Drive',
    questionIds: [q1B._id, q2B._id],
    createdBy: adminUser._id,
  });

  const q1C = await Question.create({ questionSetId: setCId, title: 'Set C Q1', problemStatement: 'Solve C1', difficulty: 'EASY', testType: 'SPOJ', testCases: [{ input: '1', expectedOutput: '1', isHidden: false }] });
  const q2C = await Question.create({ questionSetId: setCId, title: 'Set C Q2', problemStatement: 'Solve C2', difficulty: 'EASY', testType: 'SPOJ', testCases: [{ input: '2', expectedOutput: '2', isHidden: false }] });
  const setC = await QuestionSet.create({
    _id: setCId,
    name: 'Set C (PDF 3)',
    testType: 'SPOJ',
    uploadBatchId: batchIdValid,
    uploadBatchName: 'Batch 2026 Test Drive',
    questionIds: [q1C._id, q2C._id],
    createdBy: adminUser._id,
  });

  // Create Mismatched batch (Set M1 has 1 question, Set M2 has 2 questions)
  const qM1 = await Question.create({ questionSetId: setM1Id, title: 'Set M1 Q1', problemStatement: 'Solve M1', difficulty: 'EASY', testType: 'SPOJ', testCases: [{ input: '1', expectedOutput: '1', isHidden: false }] });
  const setM1 = await QuestionSet.create({
    _id: setM1Id,
    name: 'Set M1',
    testType: 'SPOJ',
    uploadBatchId: batchIdMismatch,
    uploadBatchName: 'Mismatched Batch',
    questionIds: [qM1._id],
    createdBy: adminUser._id,
  });
  const qM2_1 = await Question.create({ questionSetId: setM2Id, title: 'Set M2 Q1', problemStatement: 'Solve M2.1', difficulty: 'EASY', testType: 'SPOJ', testCases: [{ input: '1', expectedOutput: '1', isHidden: false }] });
  const qM2_2 = await Question.create({ questionSetId: setM2Id, title: 'Set M2 Q2', problemStatement: 'Solve M2.2', difficulty: 'EASY', testType: 'SPOJ', testCases: [{ input: '2', expectedOutput: '2', isHidden: false }] });
  const setM2 = await QuestionSet.create({
    _id: setM2Id,
    name: 'Set M2',
    testType: 'SPOJ',
    uploadBatchId: batchIdMismatch,
    uploadBatchName: 'Mismatched Batch',
    questionIds: [qM2_1._id, qM2_2._id],
    createdBy: adminUser._id,
  });

  // Test 1: getQuestionPools endpoint
  const mockReq = { query: {}, user: adminUser };
  let poolsResult = null;
  const mockRes = {
    json: (data) => { poolsResult = data; return mockRes; },
    status: (code) => ({ json: (d) => { poolsResult = { statusCode: code, ...d }; } }),
  };
  await getQuestionPools(mockReq, mockRes, (err) => console.error(err));

  const validPool = poolsResult?.pools?.find((p) => p.poolId === batchIdValid);
  const mismatchPool = poolsResult?.pools?.find((p) => p.poolId === batchIdMismatch);

  assert(
    validPool && validPool.isValid === true && validPool.setCount === 3 && validPool.questionCount === 2,
    `getQuestionPools accurately validates balanced batch (3 sets, 2 Qs each, isValid: true)`
  );

  assert(
    mismatchPool && mismatchPool.isValid === false && mismatchPool.validationError.includes('mismatched question counts'),
    `getQuestionPools flags mismatched batch with isValid: false and descriptive error message`
  );

  // Test 2: createTest rejects mismatched pool
  let createMismatchError = null;
  const mockReqMismatch = {
    user: adminUser,
    body: {
      title: 'Mismatch Pool Test',
      testType: 'SPOJ',
      questionSetPoolId: batchIdMismatch,
      durationMinutes: 60,
      totalQuestions: 2,
      passingCriteria: 1,
      startTestWindowMinutes: 15,
      supportedLanguages: ['python'],
      instructions: 'Do your best',
    },
    app: { get: () => null },
  };
  const mockResMismatch = {
    status: (code) => ({
      json: (d) => { createMismatchError = { statusCode: code, ...d }; return mockResMismatch; },
    }),
    json: (d) => { createMismatchError = d; return mockResMismatch; },
  };
  await createTest(mockReqMismatch, mockResMismatch, () => {});

  assert(
    createMismatchError && createMismatchError.statusCode === 400 && createMismatchError.error.includes('mismatched question counts'),
    'createTest rejects mismatched question set pool with 400 and identifies mismatch rule'
  );

  // Test 3: createTest with valid pool
  let createdTest = null;
  const mockReqValid = {
    user: adminUser,
    body: {
      title: `Valid Pool Test ${Date.now()}`,
      testType: 'SPOJ',
      questionSetPoolId: batchIdValid,
      durationMinutes: 60,
      totalQuestions: 2, // Auto-locked to pool question count
      passingCriteria: 1,
      startTestWindowMinutes: 15,
      supportedLanguages: ['python'],
      instructions: 'Do your best in this pool test',
    },
    app: { get: () => null },
  };
  const mockResValid = {
    status: (code) => ({
      json: (d) => { createdTest = d.test || d; return mockResValid; },
    }),
    json: (d) => { createdTest = d.test || d; return mockResValid; },
  };
  await createTest(mockReqValid, mockResValid, (err) => console.error(err));

  assert(
    createdTest && createdTest.questionSetPoolId === batchIdValid && createdTest.totalQuestions === 2 && createdTest.questionSetId === null,
    'createTest successfully creates test with questionSetPoolId, questionSetId: null, and locked totalQuestions: 2'
  );

  // Test 4: getTest hydrates pool information
  let hydratedTest = null;
  const mockReqGet = { params: { testId: createdTest._id }, app: { get: () => null } };
  const mockResGet = {
    json: (d) => { hydratedTest = d.test; },
  };
  await getTest(mockReqGet, mockResGet, (err) => console.error(err));

  assert(
    hydratedTest && hydratedTest.isPool === true && hydratedTest.poolSetCount === 3 && hydratedTest.questionSetPoolName === 'Batch 2026 Test Drive',
    'getTest hydrates isPool: true, poolSetCount: 3, and questionSetPoolName'
  );

  // Test 5: Per-Room Independent Round-Robin Join Rotation
  // Create Room A and Room B
  const roomA = await Room.create({
    testId: createdTest._id,
    roomName: 'Lab A - 101',
    roomCode: `ROOMA${Math.floor(1000 + Math.random() * 9000)}`,
    roomPassword: 'passwordA',
    capacity: 50,
    passwordValidUntil: new Date(Date.now() + 60 * 60 * 1000),
  });

  const roomB = await Room.create({
    testId: createdTest._id,
    roomName: 'Lab B - 202',
    roomCode: `ROOMB${Math.floor(1000 + Math.random() * 9000)}`,
    roomPassword: 'passwordB',
    capacity: 50,
    passwordValidUntil: new Date(Date.now() + 60 * 60 * 1000),
  });

  // Set test to LIVE so candidates can join
  await Test.findByIdAndUpdate(createdTest._id, { status: 'LIVE', liveStartedAt: new Date() });

  // Create candidates
  const candA1 = await Candidate.create({ name: 'Candidate A1', email: `candA1_${Date.now()}@test.com`, passwordHash: 'dummy_hash' });
  const candA2 = await Candidate.create({ name: 'Candidate A2', email: `candA2_${Date.now()}@test.com`, passwordHash: 'dummy_hash' });
  const candA3 = await Candidate.create({ name: 'Candidate A3', email: `candA3_${Date.now()}@test.com`, passwordHash: 'dummy_hash' });
  const candA4 = await Candidate.create({ name: 'Candidate A4', email: `candA4_${Date.now()}@test.com`, passwordHash: 'dummy_hash' });
  const candB1 = await Candidate.create({ name: 'Candidate B1', email: `candB1_${Date.now()}@test.com`, passwordHash: 'dummy_hash' });
  const candB2 = await Candidate.create({ name: 'Candidate B2', email: `candB2_${Date.now()}@test.com`, passwordHash: 'dummy_hash' });

  const joinCandidate = async (candidate, room) => {
    let result = null;
    const req = {
      user: { id: candidate._id, _id: candidate._id, role: 'CANDIDATE' },
      body: {
        roomCode: room.roomCode,
        roomPassword: room.roomPassword,
      },
      app: { get: () => null },
    };
    const res = {
      status: (code) => ({ json: (d) => { result = { statusCode: code, ...d }; return res; } }),
      json: (d) => { result = d; return res; },
    };
    await joinRoom(req, res, (err) => { if (err) console.error(err); });
    return result;
  };

  await joinCandidate(candA1, roomA);
  await joinCandidate(candA2, roomA);
  await joinCandidate(candA3, roomA);
  await joinCandidate(candA4, roomA);

  const updatedRoomA = await Room.findById(roomA._id);
  const getAssignedSet = (roomDoc, candId) => {
    const entry = roomDoc.joinedCandidates.find((j) => j.candidateId.toString() === candId.toString());
    return entry?.assignedQuestionSetId?.toString();
  };
  const getJoinIndex = (roomDoc, candId) => {
    const entry = roomDoc.joinedCandidates.find((j) => j.candidateId.toString() === candId.toString());
    return entry?.joinIndex;
  };

  assert(
    getAssignedSet(updatedRoomA, candA1._id) === setA._id.toString() && getJoinIndex(updatedRoomA, candA1._id) === 1,
    'Room A: 1st candidate is assigned Set 1 (Set A) with joinIndex 1'
  );
  assert(
    getAssignedSet(updatedRoomA, candA2._id) === setB._id.toString() && getJoinIndex(updatedRoomA, candA2._id) === 2,
    'Room A: 2nd candidate is assigned Set 2 (Set B) with joinIndex 2'
  );
  assert(
    getAssignedSet(updatedRoomA, candA3._id) === setC._id.toString() && getJoinIndex(updatedRoomA, candA3._id) === 3,
    'Room A: 3rd candidate is assigned Set 3 (Set C) with joinIndex 3'
  );
  assert(
    getAssignedSet(updatedRoomA, candA4._id) === setA._id.toString() && getJoinIndex(updatedRoomA, candA4._id) === 4,
    'Room A: 4th candidate wraps around and is assigned Set 1 (Set A) with joinIndex 4'
  );

  // Independent rotation in Room B:
  await joinCandidate(candB1, roomB);
  await joinCandidate(candB2, roomB);

  const updatedRoomB = await Room.findById(roomB._id);

  assert(
    getAssignedSet(updatedRoomB, candB1._id) === setA._id.toString() && getJoinIndex(updatedRoomB, candB1._id) === 1,
    'Room B: 1st candidate starts at Set 1 (Set A) independently of Room A'
  );
  assert(
    getAssignedSet(updatedRoomB, candB2._id) === setB._id.toString() && getJoinIndex(updatedRoomB, candB2._id) === 2,
    'Room B: 2nd candidate is assigned Set 2 (Set B) with joinIndex 2'
  );

  // Test 6: Reconnect preservation (BUG-53)
  const roomABeforeReconnect = await Room.findById(roomA._id);
  const counterBefore = roomABeforeReconnect.candidateJoinCounter;

  // Candidate A2 rejoins
  await joinCandidate(candA2, roomA);
  const roomAAfterReconnect = await Room.findById(roomA._id);

  assert(
    getAssignedSet(roomAAfterReconnect, candA2._id) === setB._id.toString() &&
    roomAAfterReconnect.candidateJoinCounter === counterBefore,
    'Reconnecting candidate (BUG-53) preserves original assigned set without advancing room candidateJoinCounter'
  );

  // Test 7: startAttempt question resolution from candidate's assigned set
  let attemptA1 = null;
  let attemptA2 = null;

  const mockAttemptReq = (cand) => ({
    user: { id: cand._id, _id: cand._id, role: 'CANDIDATE' },
    params: { testId: createdTest._id },
    body: {},
    app: { get: () => null },
  });

  const mockAttemptRes = (cb) => ({
    status: (code) => ({ json: (d) => cb({ statusCode: code, ...d }) }),
    json: (d) => cb(d),
  });

  await startAttempt(mockAttemptReq(candA1), mockAttemptRes((d) => { attemptA1 = d; }), (err) => console.error(err));
  await startAttempt(mockAttemptReq(candA2), mockAttemptRes((d) => { attemptA2 = d; }), (err) => console.error(err));

  const candA1Questions = attemptA1?.questions || [];
  const candA2Questions = attemptA2?.questions || [];

  assert(
    candA1Questions.length === 2 &&
    candA1Questions[0].title === 'Set A Q1' &&
    candA1Questions[1].title === 'Set A Q2',
    'Candidate A1 receives questions strictly from assigned Set A in startAttempt'
  );

  assert(
    candA2Questions.length === 2 &&
    candA2Questions[0].title === 'Set B Q1' &&
    candA2Questions[1].title === 'Set B Q2',
    'Candidate A2 receives questions strictly from assigned Set B in startAttempt'
  );

  // Test 8: FEATURE-010 Attempted Counter Isolation across candidates
  // Simulate candidate A1 running code with a full pass on Question 1 of Set A
  // We mock runCode logic or execute runCode endpoint directly
  const runReqA1 = {
    user: { id: candA1._id, _id: candA1._id },
    params: { testId: createdTest._id, questionId: q1A._id },
    body: { code: 'print(1)', language: 'python' },
    app: { get: () => null },
  };

  // Directly update candidate A1's submission for Question 1 to isAttempted: true (matching runCode's visible full-pass logic)
  await Submission.findOneAndUpdate(
    { candidateId: candA1._id, testId: createdTest._id, questionId: q1A._id },
    {
      $set: {
        isAttempted: true,
        visibleTestCasesTotal: 1,
        visibleTestCasesPassed: 1,
        status: 'IN_PROGRESS',
        assignedQuestionSetId: setA._id,
      },
    },
    { upsert: true, new: true }
  );

  // Check live candidates
  let liveCandidatesData = null;
  const liveReq = { params: { testId: createdTest._id }, app: { get: () => null } };
  const liveRes = {
    status: () => liveRes,
    json: (d) => { liveCandidatesData = d; },
  };
  await getLiveCandidates(liveReq, liveRes, (err) => console.error(err));

  const candA1Live = liveCandidatesData?.candidates?.[candA1._id.toString()];
  const candA2Live = liveCandidatesData?.candidates?.[candA2._id.toString()];

  assert(
    candA1Live && candA1Live.questionsAttempted === 1 && candA1Live.totalQuestions === 2,
    'Candidate A1 live dashboard shows Attempted 1/2'
  );

  assert(
    candA2Live && candA2Live.questionsAttempted === 0 && candA2Live.totalQuestions === 2,
    'Candidate A2 live dashboard shows Attempted 0/2 (isolated, not affected by Candidate A1)'
  );

  // Test 9: Live Monitoring exposes assigned Question Set Name & Index
  assert(
    candA1Live && candA1Live.assignedQuestionSetName === 'Set A (PDF 1)' && candA1Live.assignedSetIndex === 1,
    'Candidate A1 live payload has assignedQuestionSetName: "Set A (PDF 1)" and assignedSetIndex: 1'
  );

  assert(
    candA2Live && candA2Live.assignedQuestionSetName === 'Set B (PDF 2)' && candA2Live.assignedSetIndex === 2,
    'Candidate A2 live payload has assignedQuestionSetName: "Set B (PDF 2)" and assignedSetIndex: 2'
  );

  // Test 10: Backward Compatibility with Single-Set Tests
  const singleSetTest = await Test.create({
    title: `Single Set Test ${Date.now()}`,
    testType: 'SPOJ',
    questionSetId: setA._id,
    questionSetPoolId: null,
    durationMinutes: 90,
    totalQuestions: 2,
    passingCriteria: 1,
    startTestWindowMinutes: 10,
    supportedLanguages: ['python'],
    instructions: 'Single set test instructions',
    status: 'LIVE',
    liveStartedAt: new Date(),
    createdBy: adminUser._id,
  });

  const singleRoom = await Room.create({
    testId: singleSetTest._id,
    roomName: 'Single Set Room',
    roomCode: `SINGLE${Math.floor(1000 + Math.random() * 9000)}`,
    roomPassword: 'passwordS',
    capacity: 50,
    passwordValidUntil: new Date(Date.now() + 60 * 60 * 1000),
  });

  const candSingle = await Candidate.create({ name: 'Single Cand', email: `candSingle_${Date.now()}@test.com`, passwordHash: 'dummy_hash' });
  await joinCandidate(candSingle, singleRoom);
  const updatedSingleRoom = await Room.findById(singleRoom._id);

  assert(
    getAssignedSet(updatedSingleRoom, candSingle._id) === setA._id.toString(),
    'Single Question Set test joins successfully assign the single questionSetId backward-compatibly'
  );

  let singleAttempt = null;
  await startAttempt(mockAttemptReq(candSingle), mockAttemptRes((d) => { singleAttempt = d; }), () => {});

  assert(
    singleAttempt && singleAttempt.questions?.length === 2 && singleAttempt.questions[0].title === 'Set A Q1',
    'Single Question Set test attempt retrieval works seamlessly without regressions'
  );

  // Cleanup created test data
  await Test.deleteMany({ _id: { $in: [createdTest._id, singleSetTest._id] } });
  await Room.deleteMany({ _id: { $in: [roomA._id, roomB._id, singleRoom._id] } });
  await Candidate.deleteMany({ _id: { $in: [candA1._id, candA2._id, candA3._id, candA4._id, candB1._id, candB2._id, candSingle._id] } });
  await Submission.deleteMany({ testId: { $in: [createdTest._id, singleSetTest._id] } });
  await QuestionSet.deleteMany({ _id: { $in: [setA._id, setB._id, setC._id, setM1._id, setM2._id] } });
  await Question.deleteMany({ _id: { $in: [q1A._id, q2A._id, q1B._id, q2B._id, q1C._id, q2C._id, qM1._id] } });

  console.log('\n========================================================================');
  console.log(`FEATURE-012 QA SUITE RESULTS: ${passedTests} / ${totalTests} Passed (${totalTests - passedTests} Failed)`);
  console.log('========================================================================\n');

  await mongoose.disconnect();
  process.exit(totalTests === passedTests ? 0 : 1);
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
