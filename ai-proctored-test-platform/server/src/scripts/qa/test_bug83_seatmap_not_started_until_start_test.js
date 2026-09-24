/**
 * QA Automated Verification Suite: BUG-83
 * Admin Seat Tile Shows Candidate as "Not Started" (White, No Timer) Before Clicking Start Test
 *
 * Verifies:
 * 1. Static code & contract audits (roomController, socketHandler, AdminLiveDashboard)
 * 2. Normal invite-link join: Candidate in room.joinedCandidates before startAttempt has status 'NOT_STARTED', colorStatus 'WHITE', candidateStartTime null, timeRemaining 0
 * 3. Manual credentials join: Candidate before startAttempt has status 'NOT_STARTED', colorStatus 'WHITE'
 * 4. Late-join notify-admin join: Candidate before startAttempt has status 'NOT_STARTED', colorStatus 'WHITE'
 * 5. Start Test click (startAttempt): Candidate immediately transitions to status 'IN_PROGRESS', colorStatus 'YELLOW', valid candidateStartTime, active countdown timeRemaining
 * 6. Multi-candidate isolation: Candidate A on instructions (NOT_STARTED/WHITE) alongside Candidate B mid-test (IN_PROGRESS/YELLOW)
 * 7. Reconnection preservation: Candidate B reconnecting preserves IN_PROGRESS status and original start/end times (BUG-53)
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
    process.exitCode = 1;
  }
}

process.env.NODE_ENV = 'test';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/spoj_test_platform_test';

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: BUG-83 (Seat Tile Not Started Until Start Test)');
  console.log('========================================================================\n');

  // --- PART 1: Static Architecture & File Verification ---
  console.log('--- Part 1: Static Architecture & Source Audits ---');

  const roomControllerPath = path.resolve(__dirname, '../../controllers/roomController.js');
  const socketHandlerPath = path.resolve(__dirname, '../../sockets/socketHandler.js');
  const adminLiveDashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');

  const roomControllerSrc = fs.readFileSync(roomControllerPath, 'utf8');
  const socketHandlerSrc = fs.readFileSync(socketHandlerPath, 'utf8');
  const adminLiveDashboardSrc = fs.readFileSync(adminLiveDashboardPath, 'utf8');

  // 1. roomController audits
  assert(
    roomControllerSrc.includes("status: isDisqualified ? 'DISQUALIFIED' : 'NOT_STARTED'") &&
    roomControllerSrc.includes("startedAt: null"),
    'roomController: getRoomCandidates assigns NOT_STARTED to joined candidates without submissions'
  );

  assert(
    roomControllerSrc.includes("} else if (timers.startTime) {") &&
    roomControllerSrc.includes(".status = 'IN_PROGRESS';") &&
    roomControllerSrc.includes(".colorStatus = 'YELLOW';"),
    'roomController: getLiveCandidates strictly gates IN_PROGRESS on timers.startTime'
  );

  // 2. socketHandler audits
  assert(
    socketHandlerSrc.includes("let colorStatus = 'WHITE';") &&
    socketHandlerSrc.includes("let candidateStatus = 'NOT_STARTED';") &&
    socketHandlerSrc.includes("else if (sub?.candidateStartTime) {"),
    'socketHandler: heartbeat handler defaults to NOT_STARTED/WHITE unless candidateStartTime is set'
  );

  // 3. AdminLiveDashboard audits
  assert(
    adminLiveDashboardSrc.includes("((candidate.status === 'IN_PROGRESS' || candidate.colorStatus === 'YELLOW') && candidate.candidateStartTime)") &&
    adminLiveDashboardSrc.includes("return 'YELLOW';"),
    'AdminLiveDashboard: getCandidateColorStatus requires candidateStartTime for YELLOW status'
  );

  assert(
    adminLiveDashboardSrc.includes("if (candidate.status !== 'IN_PROGRESS' || !candidate.candidateStartTime) {") &&
    adminLiveDashboardSrc.includes("return 0;"),
    'AdminLiveDashboard: getCandidateRemainingMs yields 0 when candidateStartTime is absent'
  );

  assert(
    adminLiveDashboardSrc.includes("const isCandidateInProgress = !isTestEnded && candidate.status === 'IN_PROGRESS' && Boolean(candidate.candidateStartTime);"),
    'AdminLiveDashboard: SeatTile and CandidateRowItem gate isCandidateInProgress on candidateStartTime'
  );

  // --- PART 2: Database & Controller Integration Tests ---
  console.log('\n--- Part 2: Dynamic Controller & Model Integration Tests ---');

  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB test database.');

    const Admin = require('../../models/Admin');
    const Test = require('../../models/Test');
    const Room = require('../../models/Room');
    const Candidate = require('../../models/Candidate');
    const Folder = require('../../models/Folder');
    const QuestionSet = require('../../models/QuestionSet');
    const Question = require('../../models/Question');
    const Submission = require('../../models/Submission');
    const { getLiveCandidates, getRoomCandidates, lateJoinRequest, allowLateJoin } = require('../../controllers/roomController');
    const { joinRoom, startAttempt } = require('../../controllers/submissionController');

    // Clean test fixtures
    await Admin.deleteMany({ email: { $regex: /@bug83test\.com$/ } });
    await Candidate.deleteMany({ email: { $regex: /@bug83test\.com$/ } });
    await Folder.deleteMany({ name: { $regex: /BUG-83/ } });
    await Test.deleteMany({ title: { $regex: /BUG-83/ } });
    await Room.deleteMany({ roomName: { $regex: /BUG-83/ } });

    // Setup Test Admin
    const admin = await Admin.create({
      name: 'BUG83 Admin',
      email: 'admin@bug83test.com',
      passwordHash: 'hashed_password_123',
      role: 'SUPER_ADMIN',
    });

    // Setup Folder & Question Sets
    const testFolder = await Folder.create({
      name: 'BUG-83 Question Folder',
      testType: 'SPOJ',
      createdBy: admin._id,
    });

    const qSet1 = await QuestionSet.create({
      name: 'BUG-83 Set 1',
      folderId: testFolder._id,
      testType: 'SPOJ',
      createdBy: admin._id,
    });

    const q1 = await Question.create({
      title: 'BUG-83 Problem 1',
      description: 'Solve problem 1',
      questionSetId: qSet1._id,
      difficulty: 'MEDIUM',
      testType: 'SPOJ',
      visibleTestCases: [{ input: '1', output: '1' }],
    });

    const q2 = await Question.create({
      title: 'BUG-83 Problem 2',
      description: 'Solve problem 2',
      questionSetId: qSet1._id,
      difficulty: 'MEDIUM',
      testType: 'SPOJ',
      visibleTestCases: [{ input: '2', output: '2' }],
    });

    // Create LIVE Test with 90 minute duration
    const test = await Test.create({
      title: 'BUG-83 Live Test',
      testType: 'SPOJ',
      folderId: testFolder._id,
      durationMinutes: 90,
      totalQuestions: 2,
      passingCriteria: 1,
      status: 'LIVE',
      instructions: 'Mandatory test instructions',
      startTestWindowMinutes: 15,
      createdBy: admin._id,
    });

    const crypto = require('crypto');

    // Create Room valid for 15 minutes
    const room = await Room.create({
      roomName: 'BUG-83 Test Room',
      testId: test._id,
      roomCode: 'B83RM1',
      roomPassword: 'PASSWORD83',
      inviteToken: crypto.randomBytes(16).toString('hex'),
      passwordValidUntil: new Date(Date.now() + 15 * 60 * 1000),
      status: 'ACTIVE',
      createdBy: admin._id,
      joinedCandidates: [],
    });

    // Setup 3 Candidates:
    // Candidate 1: Joins via invite link (stays on instructions page, has not clicked Start Test)
    // Candidate 2: Joins via manual room code/password (clicks Start Test, active in progress)
    // Candidate 3: Joins via late-join notify-admin (stays on instructions page)
    const cand1 = await Candidate.create({
      name: 'Cand 1 (Invite - Instructions)',
      email: 'cand1@bug83test.com',
      passwordHash: 'password123',
    });

    const cand2 = await Candidate.create({
      name: 'Cand 2 (Manual - Mid Test)',
      email: 'cand2@bug83test.com',
      passwordHash: 'password123',
    });

    const cand3 = await Candidate.create({
      name: 'Cand 3 (LateJoin - Instructions)',
      email: 'cand3@bug83test.com',
      passwordHash: 'password123',
    });

    const runController = (fn, req) =>
      new Promise((resolve) => {
        const res = {
          status(code) {
            this._status = code;
            return this;
          },
          json(data) {
            resolve({ status: this._status || 200, data });
          },
        };
        const next = (err) => resolve({ status: 500, error: err });
        fn(req, res, next);
      });

    // --- STEP 1: Candidate 1 joins via invite link ---
    console.log('\n--- Step 1: Candidate 1 joins via Invite Link (pre-test instructions) ---');
    const joinRes1 = await runController(joinRoom, {
      user: { id: cand1._id },
      body: { inviteToken: room.inviteToken },
      app: { get: () => null },
    });
    assert(joinRes1.status === 200, 'Step 1: Cand 1 joinRoom via inviteToken returns 200');

    // Query getLiveCandidates
    const liveResStep1 = await runController(getLiveCandidates, {
      params: { testId: test._id.toString() },
      app: { get: () => null },
    });
    assert(liveResStep1.status === 200, 'Step 1: getLiveCandidates returns 200');

    const cand1Live = liveResStep1.data.candidates[cand1._id.toString()];
    assert(Boolean(cand1Live), 'Step 1: Cand 1 is present in getLiveCandidates map');
    assert(cand1Live.status === 'NOT_STARTED', `Step 1: Cand 1 status is "NOT_STARTED" (found: "${cand1Live.status}")`);
    assert(cand1Live.colorStatus === 'WHITE', `Step 1: Cand 1 colorStatus is "WHITE" (found: "${cand1Live.colorStatus}")`);
    assert(cand1Live.candidateStartTime === null, 'Step 1: Cand 1 candidateStartTime is null');
    assert(cand1Live.candidateEndTime === null, 'Step 1: Cand 1 candidateEndTime is null');
    assert(cand1Live.timeRemaining === 0, `Step 1: Cand 1 timeRemaining is 0 (found: ${cand1Live.timeRemaining})`);

    // --- STEP 2: Candidate 2 joins via manual room credentials ---
    console.log('\n--- Step 2: Candidate 2 joins via Manual Room Code & Password ---');
    const joinRes2 = await runController(joinRoom, {
      user: { id: cand2._id },
      body: { roomCode: room.roomCode, roomPassword: room.roomPassword },
      app: { get: () => null },
    });
    assert(joinRes2.status === 200, 'Step 2: Cand 2 joinRoom via credentials returns 200');

    const liveResStep2 = await runController(getLiveCandidates, {
      params: { testId: test._id.toString() },
      app: { get: () => null },
    });
    const cand2LiveBeforeStart = liveResStep2.data.candidates[cand2._id.toString()];
    assert(cand2LiveBeforeStart.status === 'NOT_STARTED', 'Step 2: Cand 2 status is "NOT_STARTED" before startAttempt');
    assert(cand2LiveBeforeStart.colorStatus === 'WHITE', 'Step 2: Cand 2 colorStatus is "WHITE" before startAttempt');
    assert(cand2LiveBeforeStart.timeRemaining === 0, 'Step 2: Cand 2 timeRemaining is 0 before startAttempt');

    // --- STEP 3: Candidate 3 joins via Late-Join Notify Admin approval ---
    console.log('\n--- Step 3: Candidate 3 joins via Late-Join Notify Admin Flow ---');
    // Simulate expired room for late join
    const expiredRoom = await Room.create({
      roomName: 'BUG-83 Expired Room',
      testId: test._id,
      roomCode: 'B83EXP',
      roomPassword: 'EXPPASSWORD',
      passwordValidUntil: new Date(Date.now() - 60 * 1000), // expired 1 minute ago
      status: 'ACTIVE',
      createdBy: admin._id,
      joinedCandidates: [],
    });

    // Cand 3 requests late join
    await runController(lateJoinRequest, {
      params: { roomId: expiredRoom._id.toString() },
      body: { candidateId: cand3._id.toString() },
      app: { get: () => null },
    });

    // Admin allows late join
    await runController(allowLateJoin, {
      params: { roomId: expiredRoom._id.toString(), candidateId: cand3._id.toString() },
      app: { get: () => null },
    });

    // Cand 3 auto-joins
    const joinRes3 = await runController(joinRoom, {
      user: { id: cand3._id },
      body: { roomId: expiredRoom._id.toString() },
      app: { get: () => null },
    });
    assert(joinRes3.status === 200, 'Step 3: Cand 3 joins expired room with manual override');

    const liveResStep3 = await runController(getLiveCandidates, {
      params: { testId: test._id.toString() },
      app: { get: () => null },
    });
    const cand3Live = liveResStep3.data.candidates[cand3._id.toString()];
    assert(cand3Live.status === 'NOT_STARTED', `Step 3: Cand 3 status is "NOT_STARTED" (found: "${cand3Live.status}")`);
    assert(cand3Live.colorStatus === 'WHITE', `Step 3: Cand 3 colorStatus is "WHITE" (found: "${cand3Live.colorStatus}")`);
    assert(cand3Live.timeRemaining === 0, 'Step 3: Cand 3 timeRemaining is 0');

    // --- STEP 4: Candidate 2 clicks "Start Test — Enter Fullscreen" (startAttempt) ---
    console.log('\n--- Step 4: Candidate 2 starts test attempt (startAttempt) ---');
    const startRes2 = await runController(startAttempt, {
      user: { id: cand2._id },
      params: { testId: test._id.toString() },
      body: { roomId: room._id.toString() },
      app: { get: () => null },
    });
    assert(startRes2.status === 200, 'Step 4: Cand 2 startAttempt returns 200');
    assert(Boolean(startRes2.data.candidateStartTime), 'Step 4: startAttempt returns candidateStartTime');
    assert(Boolean(startRes2.data.candidateEndTime), 'Step 4: startAttempt returns candidateEndTime');

    const liveResStep4 = await runController(getLiveCandidates, {
      params: { testId: test._id.toString() },
      app: { get: () => null },
    });

    const cand1After = liveResStep4.data.candidates[cand1._id.toString()];
    const cand2After = liveResStep4.data.candidates[cand2._id.toString()];
    const cand3After = liveResStep4.data.candidates[cand3._id.toString()];

    // Verify isolation: Cand 1 and Cand 3 STILL NOT_STARTED / WHITE
    assert(cand1After.status === 'NOT_STARTED' && cand1After.colorStatus === 'WHITE', 'Step 4: Cand 1 remains NOT_STARTED / WHITE');
    assert(cand3After.status === 'NOT_STARTED' && cand3After.colorStatus === 'WHITE', 'Step 4: Cand 3 remains NOT_STARTED / WHITE');

    // Verify Cand 2 transitioned to IN_PROGRESS / YELLOW with countdown
    assert(cand2After.status === 'IN_PROGRESS', `Step 4: Cand 2 status is "IN_PROGRESS" (found: "${cand2After.status}")`);
    assert(cand2After.colorStatus === 'YELLOW', `Step 4: Cand 2 colorStatus is "YELLOW" (found: "${cand2After.colorStatus}")`);
    assert(Boolean(cand2After.candidateStartTime), 'Step 4: Cand 2 has active candidateStartTime');
    assert(cand2After.timeRemaining > 80 * 60 * 1000, `Step 4: Cand 2 has active remaining time ~90m (found: ${Math.round(cand2After.timeRemaining / 60000)}m)`);

    // --- STEP 5: Verify getRoomCandidates behaves identically ---
    console.log('\n--- Step 5: Validating getRoomCandidates payload ---');
    const roomCandsRes = await runController(getRoomCandidates, {
      params: { roomId: room._id.toString() },
      app: { get: () => null },
    });
    assert(roomCandsRes.status === 200, 'Step 5: getRoomCandidates returns 200');
    const cand1InRoom = roomCandsRes.data.candidates.find((c) => c.candidateId.toString() === cand1._id.toString());
    const cand2InRoom = roomCandsRes.data.candidates.find((c) => c.candidateId.toString() === cand2._id.toString());

    assert(cand1InRoom.status === 'NOT_STARTED', `Step 5: Cand 1 in getRoomCandidates is "NOT_STARTED" (found: "${cand1InRoom.status}")`);
    assert(cand2InRoom.status === 'IN_PROGRESS', `Step 5: Cand 2 in getRoomCandidates is "IN_PROGRESS" (found: "${cand2InRoom.status}")`);

    // --- STEP 6: Candidate 2 Reconnection preserves timers (BUG-53) ---
    console.log('\n--- Step 6: Candidate 2 Reconnect preserves timers and IN_PROGRESS state ---');
    const cand2StartTimeOrig = new Date(cand2After.candidateStartTime).getTime();
    const reconnectRes2 = await runController(startAttempt, {
      user: { id: cand2._id },
      params: { testId: test._id.toString() },
      body: { roomId: room._id.toString() },
      app: { get: () => null },
    });
    assert(reconnectRes2.status === 200, 'Step 6: Cand 2 reconnect startAttempt returns 200');
    assert(
      new Date(reconnectRes2.data.candidateStartTime).getTime() === cand2StartTimeOrig,
      'Step 6: Cand 2 candidateStartTime was NOT reset upon reconnect'
    );

    // Clean up test data
    await Admin.deleteMany({ email: { $regex: /@bug83test\.com$/ } });
    await Candidate.deleteMany({ email: { $regex: /@bug83test\.com$/ } });
    await Folder.deleteMany({ name: { $regex: /BUG-83/ } });
    await Test.deleteMany({ title: { $regex: /BUG-83/ } });
    await Room.deleteMany({ roomName: { $regex: /BUG-83/ } });
    await QuestionSet.deleteMany({ name: { $regex: /BUG-83/ } });
    await Question.deleteMany({ title: { $regex: /BUG-83/ } });
    await Submission.deleteMany({ testId: test._id });

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  } catch (err) {
    console.error('Test suite error:', err);
    process.exitCode = 1;
  }

  console.log('\n------------------------------------------------------------------------');
  console.log(`BUG-83 TEST SUMMARY: ${passedTests}/${totalTests} checks passed.`);
  console.log('------------------------------------------------------------------------\n');
}

runTests();
