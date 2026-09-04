const mongoose = require('mongoose');
require('dotenv').config();

const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Candidate = require('../../models/Candidate');
const Question = require('../../models/Question');
const QuestionSet = require('../../models/QuestionSet');
const Submission = require('../../models/Submission');
const { joinRoom, startAttempt, submitAll } = require('../../controllers/submissionController');

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: BUG-54 (Block Concurrent Active Sessions Across Tests)');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  const mockIo = {
    to: () => ({
      emit: () => {},
    }),
  };

  const next = (err) => {
    if (err) throw err;
  };

  // Setup test fixtures
  const testCandidate = await Candidate.create({
    name: 'Concurrent Test Candidate',
    email: `concurrent_cand_${Date.now()}@example.com`,
    passwordHash: 'dummy_hash_123',
    role: 'candidate',
  });

  // 1. Create Test A (SPOJ)
  const qSetA = await QuestionSet.create({
    name: 'Question Set A',
    testType: 'SPOJ',
    createdBy: new mongoose.Types.ObjectId(),
  });
  const qA = await Question.create({
    questionSetId: qSetA._id,
    testType: 'SPOJ',
    title: 'Question A',
    description: 'Problem A',
    difficulty: 'EASY',
    visibleTestCases: [{ input: '1', expectedOutput: '1' }],
  });
  qSetA.questionIds = [qA._id];
  await qSetA.save();

  const testA = await Test.create({
    title: 'Algorithm Test Alpha',
    testType: 'SPOJ',
    questionSetId: qSetA._id,
    durationMinutes: 60,
    totalQuestions: 1,
    passingCriteria: 1,
    instructions: 'Test A Instructions',
    startTestWindowMinutes: 10,
    supportedLanguages: ['python'],
    status: 'LIVE',
    createdBy: new mongoose.Types.ObjectId(),
  });

  const roomA = await Room.create({
    roomCode: `RA${Math.floor(1000 + Math.random() * 9000)}`,
    roomName: 'Room Alpha',
    roomPassword: 'passA',
    testId: testA._id,
    status: 'ACTIVE',
    passwordValidUntil: new Date(Date.now() + 3600000),
  });

  // 2. Create Test B (AI Test)
  const qSetB = await QuestionSet.create({
    name: 'Question Set B',
    testType: 'AI_TEST',
    createdBy: new mongoose.Types.ObjectId(),
  });
  const qB = await Question.create({
    questionSetId: qSetB._id,
    testType: 'AI_TEST',
    title: 'AI Question B',
    description: 'Project B Brief',
    difficulty: 'MEDIUM',
    aiTestBriefFiles: [{ fileName: 'index.html' }],
  });
  qSetB.questionIds = [qB._id];
  await qSetB.save();

  const testB = await Test.create({
    title: 'AI Fullstack Test Beta',
    testType: 'AI_TEST',
    questionSetId: qSetB._id,
    durationMinutes: 90,
    totalQuestions: 1,
    passingCriteria: 1,
    instructions: 'Test B Instructions',
    startTestWindowMinutes: 10,
    supportedLanguages: ['javascript'],
    status: 'LIVE',
    createdBy: new mongoose.Types.ObjectId(),
  });

  const roomB = await Room.create({
    roomCode: `RB${Math.floor(1000 + Math.random() * 9000)}`,
    roomName: 'Room Beta',
    roomPassword: 'passB',
    testId: testB._id,
    status: 'ACTIVE',
    passwordValidUntil: new Date(Date.now() + 3600000),
  });

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // STEP 1: Candidate joins and starts Test A
    // ──────────────────────────────────────────────────────────────────────────
    console.log('--- STEP 1: Start Attempt on Test A ---');
    let resDataA = null;
    const reqStartA = {
      params: { testId: testA._id.toString() },
      body: { roomId: roomA._id.toString() },
      user: { id: testCandidate._id.toString() },
      app: { get: () => mockIo },
    };
    const resStartA = {
      status: (code) => ({
        json: (data) => {
          resDataA = { code, data };
        },
      }),
      json: (data) => {
        resDataA = { code: 200, data };
      },
    };

    await startAttempt(reqStartA, resStartA, next);
    assert(resDataA?.code === 200, 'Candidate successfully started Test A');
    assert(Boolean(resDataA?.data?.candidateStartTime), 'Test A has active candidateStartTime');

    const testAStartTime = new Date(resDataA.data.candidateStartTime).getTime();
    const testAEndTime = new Date(resDataA.data.candidateEndTime).getTime();

    // Candidate saves code on Test A
    const subA = await Submission.findOne({ candidateId: testCandidate._id, testId: testA._id });
    assert(subA !== null, 'Submission record created for Test A');
    subA.code = 'def solve(): return 42';
    await subA.save();

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 2: Candidate attempts to join Room for Test B while Test A is active
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- STEP 2: Candidate attempts joinRoom for Test B while Test A is active ---');
    let resJoinB = null;
    const reqJoinB = {
      body: { roomCode: roomB.roomCode, roomPassword: 'passB' },
      user: { id: testCandidate._id.toString() },
      app: { get: () => mockIo },
    };
    const resJoinBHandler = {
      status: (code) => ({
        json: (data) => {
          resJoinB = { code, data };
        },
      }),
      json: (data) => {
        resJoinB = { code: 200, data };
      },
    };

    await joinRoom(reqJoinB, resJoinBHandler, next);
    assert(resJoinB?.code === 409, `joinRoom for Test B rejected with HTTP 409 Conflict (${resJoinB?.code})`);
    assert(
      resJoinB?.data?.code === 'ACTIVE_SESSION_EXISTS_OTHER_TEST',
      'joinRoom returned code "ACTIVE_SESSION_EXISTS_OTHER_TEST"'
    );
    assert(
      resJoinB?.data?.error?.includes('Algorithm Test Alpha'),
      `joinRoom error identifies active Test A name: "${resJoinB?.data?.error}"`
    );

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 3: Candidate attempts startAttempt for Test B directly while Test A is active
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- STEP 3: Candidate attempts startAttempt for Test B while Test A is active ---');
    let resStartB = null;
    const reqStartB = {
      params: { testId: testB._id.toString() },
      body: { roomId: roomB._id.toString() },
      user: { id: testCandidate._id.toString() },
      app: { get: () => mockIo },
    };
    const resStartBHandler = {
      status: (code) => ({
        json: (data) => {
          resStartB = { code, data };
        },
      }),
      json: (data) => {
        resStartB = { code: 200, data };
      },
    };

    await startAttempt(reqStartB, resStartBHandler, next);
    assert(resStartB?.code === 409, `startAttempt for Test B rejected with HTTP 409 Conflict (${resStartB?.code})`);
    assert(
      resStartB?.data?.code === 'ACTIVE_SESSION_EXISTS_OTHER_TEST',
      'startAttempt returned code "ACTIVE_SESSION_EXISTS_OTHER_TEST"'
    );
    assert(
      resStartB?.data?.error?.includes('Algorithm Test Alpha'),
      `startAttempt error identifies active Test A name: "${resStartB?.data?.error}"`
    );

    // Verify no submission records were created for Test B
    const subBCount = await Submission.countDocuments({ candidateId: testCandidate._id, testId: testB._id });
    assert(subBCount === 0, 'Zero submission records created for blocked Test B');

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 4: Verify Test A's state is completely intact (untouched)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- STEP 4: Verify Test A remains completely untouched ---');
    const subACheck = await Submission.findOne({ candidateId: testCandidate._id, testId: testA._id });
    assert(
      subACheck && subACheck.status === 'IN_PROGRESS',
      'Test A submission status remains IN_PROGRESS'
    );
    assert(
      subACheck && subACheck.code === 'def solve(): return 42',
      'Test A candidate code remains unchanged'
    );
    assert(
      new Date(subACheck.candidateStartTime).getTime() === testAStartTime,
      'Test A candidateStartTime is completely untouched'
    );
    assert(
      new Date(subACheck.candidateEndTime).getTime() === testAEndTime,
      'Test A candidateEndTime is completely untouched'
    );

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 5: Verify same-test resume on Test A still works (BUG-53 integration)
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- STEP 5: Verify same-test resume on Test A is allowed (BUG-53) ---');
    let resResumeA = null;
    const reqResumeA = {
      params: { testId: testA._id.toString() },
      body: { roomId: roomA._id.toString() },
      user: { id: testCandidate._id.toString() },
      app: { get: () => mockIo },
    };
    const resResumeAHandler = {
      status: (code) => ({
        json: (data) => {
          resResumeA = { code, data };
        },
      }),
      json: (data) => {
        resResumeA = { code: 200, data };
      },
    };

    await startAttempt(reqResumeA, resResumeAHandler, next);
    assert(resResumeA?.code === 200, 'Same-test resume on Test A succeeded (not blocked by BUG-54 cross-test guard)');
    assert(
      new Date(resResumeA.data.candidateStartTime).getTime() === testAStartTime,
      'Same-test resume preserved original startTime'
    );

    // ──────────────────────────────────────────────────────────────────────────
    // STEP 6: Candidate submits Test A -> Test B entry now allowed
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- STEP 6: Submit Test A -> Verify Test B is now unblocked ---');
    const reqSubmitA = {
      params: { testId: testA._id.toString() },
      user: { id: testCandidate._id.toString() },
      app: { get: () => mockIo },
    };
    const resSubmitA = {
      status: () => ({ json: () => {} }),
      json: () => {},
    };
    await submitAll(reqSubmitA, resSubmitA, next);

    const subASubmitted = await Submission.findOne({ candidateId: testCandidate._id, testId: testA._id });
    assert(subASubmitted.status === 'SUBMITTED', 'Test A successfully transitioned to SUBMITTED');

    // Attempt joinRoom for Test B now
    let resJoinBAfter = null;
    await joinRoom(reqJoinB, {
      status: (code) => ({
        json: (data) => {
          resJoinBAfter = { code, data };
        },
      }),
      json: (data) => {
        resJoinBAfter = { code: 200, data };
      },
    }, next);

    assert(resJoinBAfter?.code === 200, 'joinRoom for Test B succeeded now that Test A is submitted');

    // Attempt startAttempt for Test B now
    let resStartBAfter = null;
    await startAttempt(reqStartB, {
      status: (code) => ({
        json: (data) => {
          resStartBAfter = { code, data };
        },
      }),
      json: (data) => {
        resStartBAfter = { code: 200, data };
      },
    }, next);

    assert(resStartBAfter?.code === 200, 'startAttempt for Test B succeeded now that Test A is submitted');
    assert(Boolean(resStartBAfter?.data?.candidateStartTime), 'Test B allocated new candidateStartTime');

  } finally {
    // Cleanup
    await Submission.deleteMany({ candidateId: testCandidate._id });
    await Room.deleteMany({ _id: { $in: [roomA._id, roomB._id] } });
    await Test.deleteMany({ _id: { $in: [testA._id, testB._id] } });
    await QuestionSet.deleteMany({ _id: { $in: [qSetA._id, qSetB._id] } });
    await Question.deleteMany({ _id: { $in: [qA._id, qB._id] } });
    await Candidate.findByIdAndDelete(testCandidate._id);
    await mongoose.disconnect();
  }

  console.log('\n========================================================================');
  console.log(`RESULTS: ${passedTests}/${totalTests} tests passed.`);
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal error running QA suite:', err);
  process.exit(1);
});
