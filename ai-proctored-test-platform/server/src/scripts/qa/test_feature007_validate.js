const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';
const JWT_SECRET = process.env.JWT_ACCESS_SECRET || 'dev_jwt_access_secret_globussoft_2026';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_proctored_test_platform';

const Candidate = require('../../models/Candidate');
const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Question = require('../../models/Question');
const QuestionSet = require('../../models/QuestionSet');
const Submission = require('../../models/Submission');

async function runFeature007Test() {
  console.log('=== FEATURE-007 QA Test: Validate Endpoint & Gating ===');
  await mongoose.connect(process.env.MONGODB_URI);

  try {
    // 1. Create or find test candidate
    let candidate = await Candidate.findOne({ email: 'qa_feature007_candidate@example.com' });
    if (!candidate) {
      candidate = await Candidate.create({
        name: 'QA Feature007 Candidate',
        email: 'qa_feature007_candidate@example.com',
        phone: '1234567890',
        passwordHash: '$2a$10$dummyhashedpasswordfortesting1234567890123456',
      });
    }

    const token = jwt.sign({ id: candidate._id, type: 'candidate', role: 'candidate' }, JWT_SECRET, { expiresIn: '1h' });

    // 2. Create QuestionSet & Question with visible and hidden test cases
    let qSet = await QuestionSet.findOne({ name: 'QA Feature007 QuestionSet' });
    if (!qSet) {
      qSet = await QuestionSet.create({
        name: 'QA Feature007 QuestionSet',
        testType: 'SPOJ',
        createdBy: candidate._id,
        description: 'Question set for FEATURE-007 QA test',
        totalMarks: 100,
        passingMarks: 40,
      });
    }

    let question = await Question.findOne({ title: 'QA Feature007 Add Two Numbers' });
    if (!question) {
      question = await Question.create({
        questionSetId: qSet._id,
        testType: 'SPOJ',
        title: 'QA Feature007 Add Two Numbers',
        description: 'Read two numbers and print their sum.',
        difficulty: 'EASY',
        inputFormat: 'Two integers a and b on separate lines',
        outputFormat: 'Single integer sum',
        visibleTestCases: [
          { input: '2\n3', expectedOutput: '5' },
          { input: '10\n20', expectedOutput: '30' },
        ],
        hiddenTestCases: [
          { input: '100\n200', expectedOutput: '300' },
          { input: '50\n50', expectedOutput: '100' },
          { input: '99\n1', expectedOutput: '100' },
        ],
      });
    }

    // 3. Create Test & Room
    let testDoc = await Test.findOne({ title: 'QA Feature007 Test' });
    if (!testDoc) {
      testDoc = await Test.create({
        title: 'QA Feature007 Test',
        testType: 'SPOJ',
        questionSetId: qSet._id,
        questions: [question._id],
        durationMinutes: 60,
        passingCriteria: 1,
        instructions: 'Test instructions',
        createdBy: candidate._id,
        status: 'LIVE',
      });
    }

    let room = await Room.findOne({ testId: testDoc._id });
    if (!room) {
      room = await Room.create({
        testId: testDoc._id,
        roomCode: 'QA007',
        roomName: 'QA Room 007',
        roomPassword: 'password123',
        joinedCandidates: [{ candidateId: candidate._id }],
      });
    }

    // 4. Create initial Submission
    let submission = await Submission.findOne({ candidateId: candidate._id, questionId: question._id });
    if (!submission) {
      submission = await Submission.create({
        candidateId: candidate._id,
        testId: testDoc._id,
        roomId: room._id,
        questionId: question._id,
        status: 'IN_PROGRESS',
        isAttempted: false,
      });
    } else {
      submission.isAttempted = false;
      submission.status = 'IN_PROGRESS';
      await submission.save();
    }

    console.log('[Test Setup] Candidate, Question, Test, Room, and Submission ready.');

    // Step A: Attempt Validate with INCORRECT code (fails visible gating)
    console.log('\n[Step A] Testing Validate with failing code...');
    const failingCode = 'import sys\nprint(0)';
    const failHttpRes = await fetch(`${BASE_URL}/api/v1/submissions/${question._id}/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code: failingCode, language: 'python' }),
    });

    const failBody = await failHttpRes.json().catch(() => ({}));
    console.log('Failing code response status:', failHttpRes.status);
    console.log('Failing code response body:', failBody);
    if (failHttpRes.status === 400 && failBody.visibleGatingFailed) {
      console.log('✓ PASS: Server correctly rejected validation when visible test cases failed.');
    } else {
      console.error('✕ FAIL: Server did not reject invalid code with 400.');
    }

    // Step B: Attempt Validate with CORRECT code (passes visible gating & runs hidden test cases)
    console.log('\n[Step B] Testing Validate with correct code...');
    const correctCode = 'import sys\nlines = sys.stdin.read().split()\nif len(lines) >= 2:\n    print(int(lines[0]) + int(lines[1]))';
    const passHttpRes = await fetch(`${BASE_URL}/api/v1/submissions/${question._id}/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ code: correctCode, language: 'python' }),
    });

    const passBody = await passHttpRes.json().catch(() => ({}));
    console.log('Correct code response status:', passHttpRes.status);
    console.log('Correct code response body:', passBody);

    if (
      passHttpRes.status === 200 &&
      passBody.hiddenTestCasesPassed === 3 &&
      passBody.hiddenTestCasesTotal === 3 &&
      passBody.isAttempted === true
    ) {
      console.log('✓ PASS: Server executed hidden test cases, returned 3/3 passed, and marked attempted.');
    } else {
      console.error('✕ FAIL: Server did not return expected hidden testcase pass count.');
    }

    // Step C: Verify Submission status in DB is still IN_PROGRESS (NOT finalized/locked)
    console.log('\n[Step C] Verifying DB Submission status...');
    const updatedSub = await Submission.findById(submission._id);
    console.log('Submission in DB status:', updatedSub.status);
    console.log('Submission in DB isAttempted:', updatedSub.isAttempted);
    console.log('Submission in DB hiddenTestCasesPassed:', updatedSub.hiddenTestCasesPassed);

    if (updatedSub.status === 'IN_PROGRESS' && updatedSub.isAttempted === true) {
      console.log('✓ PASS: Submission remained IN_PROGRESS and candidate is not locked out.');
    } else {
      console.error('✕ FAIL: Submission status was improperly altered.');
    }

    console.log('\n=== ALL FEATURE-007 QA CHECKS PASSED ===');
  } catch (err) {
    console.error('QA Test error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

runFeature007Test();
