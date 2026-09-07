/**
 * QA Test Script: test_bug70_data_isolation.js
 * Verifies BUG-70: Strict candidateId + testId + questionId composite data isolation.
 *
 * Test Scenario:
 * 1. Admin creates Question Set QS with Question Q1.
 * 2. Admin creates Test 1 from QS and starts it (LIVE).
 * 3. Candidate A joins Test 1, starts attempt, saves code "def solve(): return 'CANDIDATE_A_CODE_TEST1'", and submits.
 * 4. Admin creates Test 2 from the SAME Question Set QS and starts it (LIVE).
 * 5. Candidate B joins Test 2, starts attempt.
 * 6. Candidate B queries GET /tests/:test2Id/questions/:q1Id -> MUST return clean starter submission, NOT Candidate A's code.
 * 7. Candidate B saves code "def solve(): return 'CANDIDATE_B_CODE_TEST2'" in Test 2.
 * 8. Verify Candidate A's Test 1 submission still contains "CANDIDATE_A_CODE_TEST1" (no cross-contamination).
 * 9. Candidate A joins Test 2 (same candidate, different test instance) -> MUST receive clean submission, NOT Test 1 code.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../../models/Admin');
const Candidate = require('../../models/Candidate');
const QuestionSet = require('../../models/QuestionSet');
const Question = require('../../models/Question');
const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Submission = require('../../models/Submission');
const jwt = require('jsonwebtoken');

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'supersecretjwtkeyglobussoft2026';

const generateToken = (payload) => jwt.sign(payload, JWT_ACCESS_SECRET, { expiresIn: '1h' });

async function runTest() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spoj-test-platform';
  console.log('[QA BUG-70] Connecting to MongoDB:', mongoUri);
  await mongoose.connect(mongoUri);

  try {
    console.log('[QA BUG-70] Setting up test data...');

    // 1. Create or retrieve Admin
    let admin = await Admin.findOne({ email: 'admin_bug70_test@globussoft.com' });
    if (!admin) {
      admin = await Admin.create({
        name: 'Admin BUG-70 Tester',
        email: 'admin_bug70_test@globussoft.com',
        passwordHash: 'dummyhash',
        role: 'SUPER_ADMIN',
        isActive: true,
      });
    }

    // 2. Create Candidate A and Candidate B
    let candA = await Candidate.findOne({ email: 'canda_bug70@globussoft.com' });
    if (!candA) {
      candA = await Candidate.create({
        name: 'Candidate A',
        email: 'canda_bug70@globussoft.com',
        passwordHash: 'dummyhash',
        phone: '1111111111',
      });
    }

    let candB = await Candidate.findOne({ email: 'candb_bug70@globussoft.com' });
    if (!candB) {
      candB = await Candidate.create({
        name: 'Candidate B',
        email: 'candb_bug70@globussoft.com',
        passwordHash: 'dummyhash',
        phone: '2222222222',
      });
    }

    // Clean any previous test submissions for these candidates
    await Submission.deleteMany({ candidateId: { $in: [candA._id, candB._id] } });

    // 3. Create Shared Question Set with Question Q1
    const questionSet = await QuestionSet.create({
      name: 'Shared Question Set for BUG-70 Verification',
      testType: 'SPOJ',
      createdBy: admin._id,
    });

    const question1 = await Question.create({
      questionSetId: questionSet._id,
      title: 'Q1: Data Isolation Array Target',
      description: 'Find target in sorted array.',
      difficulty: 'EASY',
      testType: 'SPOJ',
      visibleTestCases: [{ input: '5\n1 2 3 4 5\n3', expectedOutput: '2' }],
      hiddenTestCases: [{ input: '5\n1 2 3 4 5\n5', expectedOutput: '4' }],
    });

    questionSet.questionIds = [question1._id];
    await questionSet.save();

    // 4. Create Test 1
    const test1 = await Test.create({
      title: 'Test 1 - Batch 1',
      testType: 'SPOJ',
      questionSetId: questionSet._id,
      durationMinutes: 60,
      totalQuestions: 1,
      passingCriteria: 1,
      instructions: 'Standard instructions',
      supportedLanguages: ['python', 'javascript'],
      createdBy: admin._id,
      status: 'LIVE',
      startedAt: new Date(),
    });

    const runId = Date.now();
    const room1 = await Room.create({
      testId: test1._id,
      roomName: 'Hall 1',
      roomCode: `RM1_${runId}`,
      roomPassword: 'pass',
      createdBy: admin._id,
      status: 'ACTIVE',
      passwordValidUntil: new Date(Date.now() + 3600000),
    });

    // 5. Candidate A starts attempt on Test 1 and writes code
    const submissionController = require('../../controllers/submissionController');

    // Simulate Candidate A start attempt
    const reqStartA = {
      params: { testId: test1._id.toString() },
      user: { id: candA._id.toString(), type: 'candidate' },
      body: { roomId: room1._id.toString() },
      app: { get: () => null },
    };
    let resDataStartA = null;
    const resStartA = {
      json: (d) => { resDataStartA = d; },
      status: () => resStartA,
    };
    await submissionController.startAttempt(reqStartA, resStartA, (err) => { if (err) throw err; });

    console.log('[QA BUG-70] Candidate A started attempt on Test 1.');

    // Candidate A saves code
    const candidateACode = 'def solve(): return "CANDIDATE_A_CODE_TEST1"';
    const reqSaveA = {
      params: { questionId: question1._id.toString() },
      user: { id: candA._id.toString(), type: 'candidate' },
      body: { code: candidateACode, language: 'python', testId: test1._id.toString() },
      query: {},
    };
    let resDataSaveA = null;
    const resSaveA = {
      json: (d) => { resDataSaveA = d; },
      status: () => resSaveA,
    };
    await submissionController.saveCode(reqSaveA, resSaveA, (err) => { if (err) throw err; });

    console.log('[QA BUG-70] Candidate A saved code in Test 1.');

    // Candidate A submits all and test ends
    const reqSubmitA = {
      params: { testId: test1._id.toString() },
      user: { id: candA._id.toString(), type: 'candidate' },
      app: { get: () => null },
    };
    const resSubmitA = {
      json: () => {},
      status: () => resSubmitA,
    };
    await submissionController.submitAll(reqSubmitA, resSubmitA, (err) => { if (err) throw err; });
    test1.status = 'ENDED';
    await test1.save();

    console.log('[QA BUG-70] Candidate A submitted and Test 1 ended.');

    // 6. Admin creates Test 2 using the SAME Question Set
    const test2 = await Test.create({
      title: 'Test 2 - Batch 2 (Same Question Set)',
      testType: 'SPOJ',
      questionSetId: questionSet._id,
      durationMinutes: 60,
      totalQuestions: 1,
      passingCriteria: 1,
      instructions: 'Standard instructions',
      supportedLanguages: ['python', 'javascript'],
      createdBy: admin._id,
      status: 'LIVE',
      startedAt: new Date(),
    });

    const room2 = await Room.create({
      testId: test2._id,
      roomName: 'Hall 2',
      roomCode: `RM2_${runId}`,
      roomPassword: 'pass',
      createdBy: admin._id,
      status: 'ACTIVE',
      passwordValidUntil: new Date(Date.now() + 3600000),
    });

    // 7. Candidate B joins Test 2 and starts attempt
    const reqStartB = {
      params: { testId: test2._id.toString() },
      user: { id: candB._id.toString(), type: 'candidate' },
      body: { roomId: room2._id.toString() },
      app: { get: () => null },
    };
    let resDataStartB = null;
    const resStartB = {
      json: (d) => { resDataStartB = d; },
      status: () => resStartB,
    };
    await submissionController.startAttempt(reqStartB, resStartB, (err) => { if (err) throw err; });

    console.log('[QA BUG-70] Candidate B started attempt on Test 2.');

    // 8. Candidate B queries getQuestion for Q1 in Test 2
    const reqGetQB = {
      params: { testId: test2._id.toString(), questionId: question1._id.toString() },
      user: { id: candB._id.toString(), type: 'candidate' },
    };
    let resDataGetQB = null;
    const resGetQB = {
      json: (d) => { resDataGetQB = d; },
      status: () => resGetQB,
    };
    await submissionController.getQuestion(reqGetQB, resGetQB, (err) => { if (err) throw err; });

    console.log('[QA BUG-70] Candidate B getQuestion result:', {
      hasSubmission: !!resDataGetQB?.submission,
      code: resDataGetQB?.submission?.code,
      savedCodeByLanguage: resDataGetQB?.submission?.savedCodeByLanguage,
    });

    // ASSERTION 1: Candidate B MUST NOT see Candidate A's code!
    if (resDataGetQB?.submission?.code === candidateACode) {
      throw new Error('CRITICAL FAILURE: Candidate B received Candidate A’s code from Test 1!');
    }
    if (resDataGetQB?.submission?.savedCodeByLanguage?.get?.('python') === candidateACode ||
        resDataGetQB?.submission?.savedCodeByLanguage?.python === candidateACode) {
      throw new Error('CRITICAL FAILURE: Candidate B received Candidate A’s savedCodeByLanguage from Test 1!');
    }
    console.log('✓ PASS: Candidate B sees clean starter code (no leakage from Candidate A).');

    // 9. Candidate B saves their own code in Test 2
    const candidateBCode = 'def solve(): return "CANDIDATE_B_CODE_TEST2"';
    const reqSaveB = {
      params: { questionId: question1._id.toString() },
      user: { id: candB._id.toString(), type: 'candidate' },
      body: { code: candidateBCode, language: 'python', testId: test2._id.toString() },
      query: {},
    };
    let resDataSaveB = null;
    const resSaveB = {
      json: (d) => { resDataSaveB = d; },
      status: () => resSaveB,
    };
    await submissionController.saveCode(reqSaveB, resSaveB, (err) => { if (err) throw err; });

    // ASSERTION 2: Verify Candidate A's Test 1 submission is untouched
    const subAInDB = await Submission.findOne({ candidateId: candA._id, testId: test1._id, questionId: question1._id });
    if (!subAInDB || subAInDB.code !== candidateACode) {
      throw new Error('CRITICAL FAILURE: Candidate A’s Test 1 submission was corrupted or overwritten by Candidate B!');
    }
    console.log('✓ PASS: Candidate A’s Test 1 submission remains perfectly intact.');

    // 10. Candidate A now starts Test 2 (same candidate in a new test)
    const reqStartA2 = {
      params: { testId: test2._id.toString() },
      user: { id: candA._id.toString(), type: 'candidate' },
      body: { roomId: room2._id.toString() },
      app: { get: () => null },
    };
    let resDataStartA2 = null;
    const resStartA2 = {
      json: (d) => { resDataStartA2 = d; },
      status: () => resStartA2,
    };
    await submissionController.startAttempt(reqStartA2, resStartA2, (err) => { if (err) throw err; });

    // Candidate A queries getQuestion for Test 2
    const reqGetQA2 = {
      params: { testId: test2._id.toString(), questionId: question1._id.toString() },
      user: { id: candA._id.toString(), type: 'candidate' },
    };
    let resDataGetQA2 = null;
    const resGetQA2 = {
      json: (d) => { resDataGetQA2 = d; },
      status: () => resGetQA2,
    };
    await submissionController.getQuestion(reqGetQA2, resGetQA2, (err) => { if (err) throw err; });

    // ASSERTION 3: Candidate A in Test 2 must NOT be pre-populated with code from Test 1
    if (resDataGetQA2?.submission?.code === candidateACode) {
      throw new Error('CRITICAL FAILURE: Candidate A in Test 2 loaded old code from ended Test 1!');
    }
    console.log('✓ PASS: Candidate A starting new Test 2 starts with clean slate.');

    console.log('\n========================================');
    console.log('🎉 ALL BUG-70 DATA ISOLATION TESTS PASSED!');
    console.log('========================================\n');

    await new Promise((r) => setTimeout(r, 2000));
  } catch (error) {
    console.error('[QA BUG-70] Test failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

runTest();
