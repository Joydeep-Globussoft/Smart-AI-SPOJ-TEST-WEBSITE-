const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

let ioClient;
try {
  ioClient = require('socket.io-client').io || require('socket.io-client');
} catch (e) {
  ioClient = require(path.resolve(__dirname, '../../../../client/node_modules/socket.io-client')).io || require(path.resolve(__dirname, '../../../../client/node_modules/socket.io-client'));
}

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'dev_jwt_access_secret_globussoft_2026';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_proctored_test_platform';

const Admin = require('../../models/Admin');
const Candidate = require('../../models/Candidate');
const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Question = require('../../models/Question');
const QuestionSet = require('../../models/QuestionSet');
const Submission = require('../../models/Submission');
const EvaluationResult = require('../../models/EvaluationResult');
const { evaluateSubmission } = require('../../services/evaluationService');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runFeature010Tests() {
  console.log('========================================================================');
  console.log('FEATURE-010 QA SUITE: Remove Hidden Test Cases & Run-Driven Attempted/Solved');
  console.log('========================================================================\n');

  await mongoose.connect(MONGODB_URI);

  let adminSocket = null;

  try {
    // ---------------------------------------------------------
    // SETUP: Admin, Candidate, QuestionSet, Question, Test, Room
    // ---------------------------------------------------------
    console.log('[Setup] Creating test entities...');

    let admin = await Admin.findOne({ email: 'qa_feature010_admin@example.com' });
    if (!admin) {
      admin = await Admin.create({
        name: 'QA Feature010 Admin',
        email: 'qa_feature010_admin@example.com',
        role: 'SUPER_ADMIN',
        passwordHash: '$2a$10$dummyhashedpasswordfortesting1234567890123456',
      });
    }
    const adminToken = jwt.sign({ id: admin._id, type: 'admin', role: admin.role }, JWT_SECRET, { expiresIn: '2h' });

    let candidate = await Candidate.findOne({ email: 'qa_feature010_candidate@example.com' });
    if (!candidate) {
      candidate = await Candidate.create({
        name: 'QA Feature010 Candidate',
        email: 'qa_feature010_candidate@example.com',
        phone: '9876543210',
        passwordHash: '$2a$10$dummyhashedpasswordfortesting1234567890123456',
      });
    }
    const candidateToken = jwt.sign({ id: candidate._id, type: 'candidate', role: 'candidate' }, JWT_SECRET, { expiresIn: '2h' });

    // Clean up any previous test sessions for this candidate (BUG-54 single active session guard)
    await Submission.deleteMany({ candidateId: candidate._id });

    // Create QuestionSet
    const qSet = await QuestionSet.create({
      name: `QA Feature010 Set ${Date.now()}`,
      testType: 'SPOJ',
      createdBy: admin._id,
      description: 'Question set for FEATURE-010 QA testing',
    });

    // Create Question with ONLY visible test cases (hiddenTestCases empty)
    const question1 = await Question.create({
      questionSetId: qSet._id,
      testType: 'SPOJ',
      title: 'QA F10 Add Two Numbers',
      description: 'Given two integers on separate lines, output their sum.',
      difficulty: 'EASY',
      inputFormat: 'Two integers a and b',
      outputFormat: 'Single integer sum',
      visibleTestCases: [
        { input: '2\n3', expectedOutput: '5' },
        { input: '10\n20', expectedOutput: '30' },
      ],
      hiddenTestCases: [],
      isIncomplete: false,
    });

    const question2 = await Question.create({
      questionSetId: qSet._id,
      testType: 'SPOJ',
      title: 'QA F10 Multiply Two Numbers',
      description: 'Given two integers on separate lines, output their product.',
      difficulty: 'EASY',
      inputFormat: 'Two integers a and b',
      outputFormat: 'Single integer product',
      visibleTestCases: [
        { input: '3\n4', expectedOutput: '12' },
        { input: '5\n6', expectedOutput: '30' },
      ],
      hiddenTestCases: [],
      isIncomplete: false,
    });

    qSet.questionIds = [question1._id, question2._id];
    await qSet.save();

    // Create Test & Room
    const testDoc = await Test.create({
      title: `QA Feature010 Test ${Date.now()}`,
      testType: 'SPOJ',
      questionSetId: qSet._id,
      questions: [question1._id, question2._id],
      durationMinutes: 60,
      totalQuestions: 2,
      passingCriteria: 1,
      instructions: 'Standard proctored test.',
      createdBy: admin._id,
      status: 'LIVE',
    });

    const room = await Room.create({
      testId: testDoc._id,
      roomCode: `F10-${Math.floor(1000 + Math.random() * 9000)}`,
      roomName: 'QA Room F10',
      roomPassword: 'password123',
      joinedCandidates: [{ candidateId: candidate._id }],
    });

    console.log('[Setup Complete] Test ID:', testDoc._id.toString());

    // ---------------------------------------------------------
    // TEST 1: Validate Route Deletion (returns 404)
    // ---------------------------------------------------------
    console.log('\n--- TEST 1: Validate Endpoint Removal ---');
    const validateRes = await fetch(`${BASE_URL}/api/v1/submissions/${question1._id}/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${candidateToken}`,
      },
      body: JSON.stringify({ code: 'print("test")', language: 'python' }),
    });

    assert(validateRes.status === 404, 'POST /submissions/:questionId/validate returns HTTP 404 Not Found');

    // Candidate starts attempt (FR-5.1)
    const startAttemptRes = await fetch(`${BASE_URL}/api/v1/tests/${testDoc._id}/start-attempt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${candidateToken}`,
      },
    });
    assert(startAttemptRes.status === 200, 'Candidate start-attempt initializes exam session');

    // ---------------------------------------------------------
    // TEST 2: Admin Live Dashboard Socket Setup
    // ---------------------------------------------------------
    console.log('\n--- TEST 2: Admin Dashboard Socket Connection ---');
    adminSocket = ioClient(BASE_URL, {
      auth: { token: adminToken },
      transports: ['websocket'],
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket connect timeout')), 5000);
      adminSocket.on('connect', () => {
        clearTimeout(timer);
        adminSocket.emit('admin:join', { adminId: admin._id, testId: testDoc._id });
        console.log('  ✓ Admin socket connected and joined test admin room');
        resolve();
      });
      adminSocket.on('connect_error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    let socketUpdatesReceived = [];
    adminSocket.on('dashboard:update', (data) => {
      socketUpdatesReceived.push(data);
    });

    // ---------------------------------------------------------
    // TEST 3: Candidate Partial / Failing Run (Does NOT mark Attempted)
    // ---------------------------------------------------------
    console.log('\n--- TEST 3: Partial Run Does Not Set Attempted ---');
    const failingCode = 'import sys\nprint("wrong output")';
    const failRunRes = await fetch(`${BASE_URL}/api/v1/submissions/${question1._id}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${candidateToken}`,
      },
      body: JSON.stringify({
        code: failingCode,
        language: 'python',
        testId: testDoc._id,
      }),
    });

    const failRunData = await failRunRes.json().catch(() => ({}));
    console.log('Run response status:', failRunRes.status, 'Body:', failRunData);
    assert(failRunRes.status === 200, 'POST /submissions/:questionId/run returns 200 for code execution');
    assert(failRunData.isAttempted === false, 'Run response reports isAttempted: false for failing code');
    assert(failRunData.visibleTestCasesPassed === 0, 'Run response reports 0 visible test cases passed');
    assert(failRunData.visibleTestCasesTotal === 2, 'Run response reports 2 visible test cases total');

    // Verify DB submission
    const sub1AfterFail = await Submission.findOne({ candidateId: candidate._id, questionId: question1._id });
    assert(sub1AfterFail && sub1AfterFail.isAttempted === false, 'DB Submission isAttempted is false');

    // Give 500ms to ensure no spurious socket update was sent
    await new Promise((r) => setTimeout(r, 500));
    assert(
      socketUpdatesReceived.filter((u) => u.type === 'attempt' || u.questionsAttempted !== undefined).length === 0,
      'No questionsAttempted socket update emitted on failing Run'
    );

    // ---------------------------------------------------------
    // TEST 4: Candidate Passing Run (Marks Attempted & Emits Socket Update)
    // ---------------------------------------------------------
    console.log('\n--- TEST 4: Full Passing Run Marks Attempted & Emits Live Socket ---');
    const correctCode1 = 'import sys\nlines = sys.stdin.read().split()\nif len(lines) >= 2:\n    print(int(lines[0]) + int(lines[1]))';
    
    socketUpdatesReceived = []; // reset accumulator

    const passRunRes = await fetch(`${BASE_URL}/api/v1/submissions/${question1._id}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${candidateToken}`,
      },
      body: JSON.stringify({
        code: correctCode1,
        language: 'python',
        testId: testDoc._id,
      }),
    });

    const passRunData = await passRunRes.json();
    assert(passRunRes.status === 200, 'POST /submissions/:questionId/run returns 200 for passing code');
    assert(passRunData.isAttempted === true, 'Run response reports isAttempted: true when all visible cases pass');
    assert(passRunData.visibleTestCasesPassed === 2, 'Run reports 2 visible test cases passed');
    assert(passRunData.visibleTestCasesTotal === 2, 'Run reports 2 visible test cases total');

    // Verify DB Submission
    const sub1AfterPass = await Submission.findOne({ candidateId: candidate._id, questionId: question1._id });
    assert(sub1AfterPass && sub1AfterPass.isAttempted === true, 'DB Submission isAttempted is now true');
    assert(sub1AfterPass.attemptedAt instanceof Date, 'DB Submission attemptedAt timestamp is recorded');
    const originalAttemptedAt = sub1AfterPass.attemptedAt.getTime();

    // Verify Socket update received by Admin client
    await new Promise((r) => setTimeout(r, 600));
    const attemptSocketEvent = socketUpdatesReceived.find(
      (u) => u.candidateId?.toString() === candidate._id.toString() && u.questionsAttempted !== undefined
    );
    assert(attemptSocketEvent !== undefined, 'Admin socket received dashboard:update on successful Run');
    assert(attemptSocketEvent.questionsAttempted === 1, 'Socket dashboard:update reports questionsAttempted: 1');

    // ---------------------------------------------------------
    // TEST 5: Idempotency of Attempt Timestamp on Subsequent Runs
    // ---------------------------------------------------------
    console.log('\n--- TEST 5: Subsequent Runs Preserve Original attemptedAt ---');
    await new Promise((r) => setTimeout(r, 100)); // slight delay to check timestamp invariance
    await fetch(`${BASE_URL}/api/v1/submissions/${question1._id}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${candidateToken}`,
      },
      body: JSON.stringify({
        code: correctCode1,
        language: 'python',
        testId: testDoc._id,
      }),
    });

    const sub1ReRun = await Submission.findOne({ candidateId: candidate._id, questionId: question1._id });
    assert(sub1ReRun.attemptedAt.getTime() === originalAttemptedAt, 'Original attemptedAt timestamp is preserved');

    // ---------------------------------------------------------
    // TEST 6: Test Submission & Evaluation (Solved Evaluation from Last Run)
    // ---------------------------------------------------------
    console.log('\n--- TEST 6: Solved Evaluation Driven by Visible Test Cases ---');
    
    // For Question 2, candidate runs code that fails (produces a partial or zero pass)
    await fetch(`${BASE_URL}/api/v1/submissions/${question2._id}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${candidateToken}`,
      },
      body: JSON.stringify({
        code: 'print("fails question 2")',
        language: 'python',
        testId: testDoc._id,
      }),
    });

    // Candidate submits test via submit-all endpoint
    const submitAllRes = await fetch(`${BASE_URL}/api/v1/tests/${testDoc._id}/submit-all`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${candidateToken}`,
      },
    });
    assert(submitAllRes.status === 200, 'POST /tests/:testId/submit-all succeeds');

    // Run evaluateCandidateSubmissions and aggregateCandidateScores to ensure synchronous test completion
    const { evaluateCandidateSubmissions } = require('../../services/evaluationService');
    await evaluateCandidateSubmissions(candidate._id, testDoc._id);

    // Fetch EvaluationResult records for this candidate and test
    const evalResults = await EvaluationResult.find({ candidateId: candidate._id, testId: testDoc._id }).populate('submissionId');
    assert(evalResults.length === 2, `Evaluation created 2 result records (found: ${evalResults.length})`);

    const q1Eval = evalResults.find((r) => r.submissionId?.questionId?.toString() === question1._id.toString());
    assert(q1Eval && q1Eval.questionsCompletedCount === 1.0, 'Question 1 is Solved (questionsCompletedCount: 1.0) because last Run passed');
    assert(q1Eval && q1Eval.finalScorePerQuestion > 0, 'Question 1 awarded positive score');

    const q2Eval = evalResults.find((r) => r.submissionId?.questionId?.toString() === question2._id.toString());
    assert(q2Eval && q2Eval.questionsCompletedCount === 0.0, 'Question 2 is Unsolved (questionsCompletedCount: 0.0) because last Run failed');

    const totalSolved = evalResults.reduce((sum, r) => sum + (r.questionsCompletedCount || 0), 0);
    assert(totalSolved === 1.0, 'Total questions Solved is 1.0');
    assert(evalResults[0].isPassed === true, 'Candidate passed test (passingCriteria: 1, completed: 1)');

    console.log('\n========================================================================');
    console.log('🎉 ALL FEATURE-010 QA TESTS PASSED SUCCESSFULLY!');
    console.log('========================================================================\n');
  } catch (err) {
    console.error('\n❌ QA TEST SUITE FAILED WITH ERROR:', err);
    process.exit(1);
  } finally {
    if (adminSocket) {
      adminSocket.disconnect();
    }
    await mongoose.disconnect();
  }
}

runFeature010Tests();
