const mongoose = require('mongoose');
require('dotenv').config();

const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Candidate = require('../../models/Candidate');
const Question = require('../../models/Question');
const QuestionSet = require('../../models/QuestionSet');
const Submission = require('../../models/Submission');
const { startAttempt } = require('../../controllers/submissionController');

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: BUG-53 (Single-Session Enforcement & Timer Continuation)');
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

  const emittedEvents = [];
  const mockIo = {
    to: (room) => ({
      emit: (event, payload) => {
        emittedEvents.push({ room, event, payload });
      },
    }),
  };

  // Setup test fixtures
  const testCandidate = await Candidate.create({
    name: 'Single Session Candidate',
    email: `single_session_${Date.now()}@example.com`,
    passwordHash: 'dummy_hash_123',
    role: 'candidate',
  });

  const questionSetId = new mongoose.Types.ObjectId();
  const testQuestion = await Question.create({
    questionSetId,
    testType: 'JAVASCRIPT',
    title: 'Single Session Question',
    description: 'Test Question for BUG-53',
    difficulty: 'EASY',
    sampleInput: '1',
    sampleOutput: '1',
  });

  const testQuestionSet = await QuestionSet.create({
    _id: questionSetId,
    name: 'Single Session QSet',
    testType: 'JAVASCRIPT',
    createdBy: new mongoose.Types.ObjectId(),
    questionIds: [testQuestion._id],
  });

  const durationMinutes = 60;
  const testTest = await Test.create({
    title: `Single Session Test ${Date.now()}`,
    testType: 'JAVASCRIPT',
    questionSetId: testQuestionSet._id,
    durationMinutes,
    totalQuestions: 1,
    passingCriteria: 1,
    instructions: 'Test instructions',
    startTestWindowMinutes: 10,
    supportedLanguages: ['javascript'],
    status: 'LIVE',
    createdBy: new mongoose.Types.ObjectId(),
  });

  const testRoom = await Room.create({
    roomCode: `SS${Math.floor(1000 + Math.random() * 9000)}`,
    roomName: 'Single Session Room',
    roomPassword: 'roompassword123',
    testId: testTest._id,
    status: 'ACTIVE',
    passwordValidUntil: new Date(Date.now() + 3600000),
  });

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // TEST 1: First Attempt Start sets candidateStartTime, candidateEndTime, submissionSessionId
    // ──────────────────────────────────────────────────────────────────────────
    console.log('--- TEST 1: Initial Attempt Start (Tab 1) ---');
    let resData1 = null;
    const req1 = {
      params: { testId: testTest._id.toString() },
      body: { roomId: testRoom._id.toString() },
      user: { id: testCandidate._id.toString() },
      app: { get: (key) => (key === 'io' ? mockIo : null) },
    };
    const res1 = {
      status: (code) => ({
        json: (data) => {
          resData1 = { code, data };
        },
      }),
      json: (data) => {
        resData1 = { code: 200, data };
      },
    };

    const next = (err) => {
      if (err) throw err;
    };

    await startAttempt(req1, res1, next);

    assert(resData1 !== null, 'startAttempt returned response for Tab 1');
    assert(resData1.data?.candidateStartTime, 'Initial candidateStartTime is populated');
    assert(resData1.data?.candidateEndTime, 'Initial candidateEndTime is populated');
    assert(resData1.data?.submissionSessionId, 'Tab 1 received a unique submissionSessionId');

    const tab1StartTime = new Date(resData1.data.candidateStartTime).getTime();
    const tab1EndTime = new Date(resData1.data.candidateEndTime).getTime();
    const tab1SessionId = resData1.data.submissionSessionId;

    // Simulate candidate writing code and saving in Tab 1
    const sub1 = await Submission.findOne({ candidateId: testCandidate._id, testId: testTest._id });
    assert(sub1 !== null, 'Submission record created in DB');
    sub1.code = 'console.log("Progress from Tab 1");';
    sub1.savedCodeByLanguage = { javascript: 'console.log("Progress from Tab 1");' };
    await sub1.save();

    // Wait a brief period to simulate time elapsed during exam
    await new Promise((r) => setTimeout(r, 1200));

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 2: Second Attempt Start (Tab 2 / Re-login) preserves timer and carries over progress
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 2: Re-login / Resume Attempt Start (Tab 2) ---');
    let resData2 = null;
    const req2 = {
      params: { testId: testTest._id.toString() },
      body: { roomId: testRoom._id.toString() },
      user: { id: testCandidate._id.toString() },
      app: { get: (key) => (key === 'io' ? mockIo : null) },
    };
    const res2 = {
      status: (code) => ({
        json: (data) => {
          resData2 = { code, data };
        },
      }),
      json: (data) => {
        resData2 = { code: 200, data };
      },
    };

    await startAttempt(req2, res2, next);

    assert(resData2 !== null, 'startAttempt returned response for Tab 2');
    const tab2StartTime = new Date(resData2.data.candidateStartTime).getTime();
    const tab2EndTime = new Date(resData2.data.candidateEndTime).getTime();
    const tab2SessionId = resData2.data.submissionSessionId;

    assert(
      tab2StartTime === tab1StartTime,
      `Timer candidateStartTime preserved across re-login (${tab2StartTime} === ${tab1StartTime})`
    );
    assert(
      tab2EndTime === tab1EndTime,
      `Timer candidateEndTime preserved across re-login (${tab2EndTime} === ${tab1EndTime})`
    );
    assert(
      tab2SessionId !== tab1SessionId,
      `Tab 2 allocated new distinct submissionSessionId (${tab2SessionId} !== ${tab1SessionId})`
    );

    // Verify Tab 1 saved progress carried over
    const tab2Submissions = resData2.data.submissions || [];
    const resumedSub = tab2Submissions.find((s) => s.questionId.toString() === testQuestion._id.toString());
    assert(
      resumedSub && resumedSub.code === 'console.log("Progress from Tab 1");',
      'Candidate unsubmitted code/draft safely carried over into resumed session'
    );

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 3: session:superseded Socket Event Invalidation
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 3: Verify session:superseded socket event broadcast ---');
    const supersededEvents = emittedEvents.filter((e) => e.event === 'session:superseded');
    assert(
      supersededEvents.length > 0,
      `Emitted ${supersededEvents.length} session:superseded socket event(s)`
    );

    const supersededEvent = supersededEvents[supersededEvents.length - 1];
    assert(
      supersededEvent?.room === `candidate:${testCandidate._id.toString()}`,
      `session:superseded broadcast to correct candidate room ("candidate:${testCandidate._id.toString()}")`
    );
    assert(
      supersededEvent?.payload?.testId === testTest._id.toString(),
      'session:superseded event contains matching testId'
    );
    assert(
      supersededEvent?.payload?.newSessionId === tab2SessionId,
      'session:superseded event contains newSessionId matching Tab 2'
    );
    assert(
      typeof supersededEvent?.payload?.message === 'string' && supersededEvent.payload.message.length > 0,
      'session:superseded event provides descriptive message for user overlay'
    );

    // ──────────────────────────────────────────────────────────────────────────
    // TEST 4: Live Tentative Time calculation continuity
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 4: Tentative time countdown continuous without jumping ---');
    const now = Date.now();
    const remainingMsTab1 = Math.max(0, tab1EndTime - now);
    const remainingMsTab2 = Math.max(0, tab2EndTime - now);

    assert(
      Math.abs(remainingMsTab1 - remainingMsTab2) === 0,
      `Remaining tentative time is mathematically consistent and continuous (${remainingMsTab1}ms === ${remainingMsTab2}ms)`
    );
    assert(
      remainingMsTab2 < durationMinutes * 60 * 1000,
      'Remaining tentative time reflects elapsed time and did NOT reset to full test duration'
    );

  } finally {
    // Cleanup
    await Submission.deleteMany({ candidateId: testCandidate._id });
    await Room.findByIdAndDelete(testRoom._id);
    await Test.findByIdAndDelete(testTest._id);
    await QuestionSet.findByIdAndDelete(testQuestionSet._id);
    await Question.findByIdAndDelete(testQuestion._id);
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
