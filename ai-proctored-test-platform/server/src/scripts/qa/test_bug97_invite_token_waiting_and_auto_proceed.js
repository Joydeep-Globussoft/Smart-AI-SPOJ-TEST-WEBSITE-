/**
 * QA Test Suite for BUG-97:
 * Invite-link/QR-code flow preserves invite context when test hasn't started yet and auto-proceeds on LIVE.
 *
 * Acceptance Criteria & Edge Cases:
 * 1. Static audits:
 *    - submissionController returns code 'TEST_NOT_STARTED' and room/test metadata when test is not LIVE
 *    - roomController resolveInviteToken returns testId and isLive boolean
 *    - testController startTest broadcasts test:started to all channels
 *    - CandidateJoinRoom renders dedicated waiting screen, preserves inviteToken, polls & listens for test:started
 *    - CandidateRegister & CandidateLogin auto-join returning candidates without forcing re-registration
 * 2. Integration Tests:
 *    - Unstarted test (DRAFT): candidate join via inviteToken returns 403 TEST_NOT_STARTED with testId & roomId
 *    - Public resolveInviteToken confirms valid: true, isLive: false
 *    - Admin starts test -> status changes to LIVE, password window opened
 *    - Public resolveInviteToken confirms isLive: true
 *    - Candidate 1 auto-joins via preserved inviteToken -> 200 OK
 *    - Candidate 2 (concurrent) auto-joins via preserved inviteToken -> 200 OK
 *    - Candidate 3 manual room code & password entry -> succeeds independently without regression
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/spoj_ai_test_platform';
const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Candidate = require('../../models/Candidate');
const Folder = require('../../models/Folder');
const QuestionSet = require('../../models/QuestionSet');
const Question = require('../../models/Question');
const { generateAccessToken } = require('../../controllers/authController');
const { joinRoom } = require('../../controllers/submissionController');
const { resolveInviteToken, createRoom } = require('../../controllers/roomController');
const { startTest } = require('../../controllers/testController');

console.log('========================================================================');
console.log('QA VERIFICATION SUITE: BUG-97 (Invite Flow Preserves Context & Auto-Proceeds)');
console.log('========================================================================\n');

let passedTests = 0;
let totalTests = 0;

function check(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
    process.exitCode = 1;
  }
}

// ── PART 1: Static Architecture & Source Code Audits ─────────────────────────
console.log('--- Part 1: Static Architecture & Contract Audits ---');

const candidateJoinRoomSrc = fs.readFileSync(
  path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateJoinRoom.jsx'),
  'utf8'
);
const candidateRegisterSrc = fs.readFileSync(
  path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateRegister.jsx'),
  'utf8'
);
const candidateLoginSrc = fs.readFileSync(
  path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateLogin.jsx'),
  'utf8'
);
const submissionControllerSrc = fs.readFileSync(
  path.resolve(__dirname, '../../controllers/submissionController.js'),
  'utf8'
);
const roomControllerSrc = fs.readFileSync(
  path.resolve(__dirname, '../../controllers/roomController.js'),
  'utf8'
);
const testControllerSrc = fs.readFileSync(
  path.resolve(__dirname, '../../controllers/testController.js'),
  'utf8'
);

// 1. submissionController audits
check(
  submissionControllerSrc.includes("code: 'TEST_NOT_STARTED'") &&
  submissionControllerSrc.includes('testTitle: test.title'),
  'submissionController: joinRoom returns code TEST_NOT_STARTED with test metadata when test is not LIVE'
);

// 2. roomController audits
check(
  roomControllerSrc.includes('testId: test._id') &&
  roomControllerSrc.includes('isLive,'),
  'roomController: resolveInviteToken returns testId and isLive boolean'
);

// 3. testController audits
check(
  testControllerSrc.includes("io.emit('test:started', { testId: test._id, status: 'LIVE' })"),
  'testController: startTest broadcasts test:started event globally'
);

// 4. CandidateJoinRoom audits
check(
  candidateJoinRoomSrc.includes('activeInviteToken') &&
  candidateJoinRoomSrc.includes("sessionStorage.setItem('pendingInviteToken', activeInviteToken)"),
  'CandidateJoinRoom: preserves activeInviteToken in sessionStorage'
);

check(
  candidateJoinRoomSrc.includes('onTestStarted') &&
  candidateJoinRoomSrc.includes('performAutoJoin'),
  'CandidateJoinRoom: subscribes to onTestStarted and triggers performAutoJoin on live signal'
);

check(
  candidateJoinRoomSrc.includes('setInterval') &&
  candidateJoinRoomSrc.includes('api.getInviteInfo'),
  'CandidateJoinRoom: implements active interval polling while waiting for test to start'
);

check(
  candidateJoinRoomSrc.includes('isWaitingForTest ?') &&
  candidateJoinRoomSrc.includes('Waiting for Test to Start'),
  'CandidateJoinRoom: renders dedicated Waiting Screen for invite candidates instead of manual room code inputs'
);

// 5. CandidateRegister & Login audits
check(
  candidateRegisterSrc.includes('user.type === \'candidate\'') &&
  candidateRegisterSrc.includes('api.joinRoom({ inviteToken })'),
  'CandidateRegister: auto-joins logged-in candidate upon reopening invite link without forcing re-registration'
);

check(
  candidateLoginSrc.includes('user.type === \'candidate\'') &&
  candidateLoginSrc.includes('api.joinRoom({ inviteToken })'),
  'CandidateLogin: auto-joins logged-in candidate upon reopening invite link'
);

// ── PART 2: Database & Controller Integration Tests ───────────────────────────
async function runIntegrationTests() {
  console.log('\n--- Part 2: Dynamic Controller & Model Integration Tests ---');

  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB test database.');

    const adminId = new mongoose.Types.ObjectId();
    const mockIo = {
      to: () => ({ emit: () => {} }),
      emit: () => {},
    };
    const mockApp = { get: (name) => (name === 'io' ? mockIo : null) };

    // 1. Create Folder, Question Set & Questions
    const folder = await Folder.create({
      name: 'BUG-97 QA Folder',
      testType: 'JAVASCRIPT',
      createdBy: adminId,
    });

    const qSet = await QuestionSet.create({
      name: 'BUG-97 QA Set',
      testType: 'JAVASCRIPT',
      folderId: folder._id,
      createdBy: adminId,
    });

    const question = await Question.create({
      questionSetId: qSet._id,
      testType: 'JAVASCRIPT',
      title: 'Sum of Two Numbers',
      description: 'Return a + b',
      inputFormat: 'input',
      outputFormat: 'output',
      visibleTestCases: [{ input: '2 3', expectedOutput: '5' }],
      hiddenTestCases: [{ input: '10 20', expectedOutput: '30' }],
      points: 10,
    });

    await QuestionSet.findByIdAndUpdate(qSet._id, { questionIds: [question._id] });

    // 2. Create Test in DRAFT status (NOT LIVE yet)
    const testDoc = await Test.create({
      title: 'BUG-97 QA Engineering Assessment',
      testType: 'JAVASCRIPT',
      instructions: '<p>Instructions</p>',
      questionSetId: qSet._id,
      durationMinutes: 60,
      startTestWindowMinutes: 15,
      passingCriteria: 1,
      status: 'DRAFT',
      createdBy: adminId,
    });

    // 3. Create Room with inviteToken
    const roomCodeUnique = crypto.randomBytes(3).toString('hex').toUpperCase();
    const roomDoc = await Room.create({
      testId: testDoc._id,
      roomName: 'Lab Beta',
      roomCode: roomCodeUnique,
      roomPassword: 'pwd' + crypto.randomBytes(4).toString('hex'),
      inviteToken: crypto.randomBytes(16).toString('hex'),
      status: 'ACTIVE',
      createdBy: adminId,
      joinedCandidates: [],
    });

    // 4. Create Candidates (Passwordless 3-day accounts)
    const cand1 = await Candidate.create({
      name: 'Candidate Waiting One',
      email: `cand1_bug97_${Date.now()}@example.com`,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
    });

    const cand2 = await Candidate.create({
      name: 'Candidate Waiting Two',
      email: `cand2_bug97_${Date.now()}@example.com`,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
    });

    const cand3Manual = await Candidate.create({
      name: 'Candidate Manual Entry',
      email: `cand3_bug97_${Date.now()}@example.com`,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
    });

    // --- TEST STEP 1: Candidate 1 attempts joinRoom via inviteToken before test is LIVE -> Expect 403 TEST_NOT_STARTED ---
    let step1Res = null;
    const req1 = {
      user: { id: cand1._id.toString() },
      body: { inviteToken: roomDoc.inviteToken },
      app: mockApp,
    };
    const res1 = {
      status: (code) => {
        step1Res = { status: code };
        return {
          json: (data) => {
            step1Res.data = data;
          },
        };
      },
    };

    await joinRoom(req1, res1, (err) => { if (err) throw err; });
    check(step1Res.status === 403, 'Step 1: Joining unstarted test via inviteToken returns 403 Forbidden');
    check(step1Res.data.code === 'TEST_NOT_STARTED', 'Step 1: Error code is TEST_NOT_STARTED');
    check(step1Res.data.roomId.toString() === roomDoc._id.toString(), 'Step 1: Error response includes roomId');
    check(step1Res.data.testId.toString() === testDoc._id.toString(), 'Step 1: Error response includes testId');

    // --- TEST STEP 2: Candidate queries public resolveInviteToken before test is LIVE ---
    let step2Res = null;
    const req2 = { params: { inviteToken: roomDoc.inviteToken } };
    const res2 = {
      json: (data) => { step2Res = data; },
      status: (code) => ({ json: (d) => { step2Res = { status: code, ...d }; } }),
    };

    await resolveInviteToken(req2, res2, (err) => { if (err) throw err; });
    check(step2Res.valid === true, 'Step 2: resolveInviteToken reports valid: true');
    check(step2Res.isLive === false, 'Step 2: resolveInviteToken reports isLive: false');
    check(step2Res.testTitle === 'BUG-97 QA Engineering Assessment', 'Step 2: resolveInviteToken returns testTitle');
    check(step2Res.roomName === 'Lab Beta', 'Step 2: resolveInviteToken returns roomName');
    check(step2Res.testId.toString() === testDoc._id.toString(), 'Step 2: resolveInviteToken returns testId');

    // --- TEST STEP 3: Admin starts test -> status updates to LIVE ---
    let step3Res = null;
    const req3 = {
      params: { testId: testDoc._id.toString() },
      user: { id: adminId.toString(), role: 'ADMIN' },
      app: mockApp,
    };
    const res3 = {
      json: (data) => { step3Res = data; },
      status: (code) => ({ json: (d) => { step3Res = { status: code, ...d }; } }),
    };

    await startTest(req3, res3, (err) => { if (err) throw err; });
    check(step3Res.test.status === 'LIVE', 'Step 3: Admin startTest transitions test to LIVE');

    // Verify room status and passwordValidUntil updated
    const updatedRoom = await Room.findById(roomDoc._id);
    check(updatedRoom.status === 'ACTIVE', 'Step 3: Room status is ACTIVE');
    check(Boolean(updatedRoom.passwordValidUntil && new Date() < updatedRoom.passwordValidUntil), 'Step 3: Room password window is active');

    // --- TEST STEP 4: Public resolveInviteToken now reports isLive: true ---
    let step4Res = null;
    await resolveInviteToken(req2, {
      json: (data) => { step4Res = data; },
      status: (code) => ({ json: (d) => { step4Res = { status: code, ...d }; } }),
    }, (err) => { if (err) throw err; });
    check(step4Res.isLive === true, 'Step 4: resolveInviteToken now reports isLive: true');

    // --- TEST STEP 5: Candidate 1 auto-joins via preserved inviteToken -> 200 OK ---
    let step5Res = null;
    const req5 = {
      user: { id: cand1._id.toString() },
      body: { inviteToken: roomDoc.inviteToken },
      app: mockApp,
    };
    const res5 = {
      status: (code) => ({ json: (d) => { step5Res = { status: code, data: d }; } }),
      json: (data) => { step5Res = { status: 200, data }; },
    };

    await joinRoom(req5, res5, (err) => { if (err) throw err; });
    check(step5Res.status === 200, 'Step 5: Candidate 1 successfully auto-joins via preserved inviteToken');
    check(step5Res.data.room._id.toString() === roomDoc._id.toString(), 'Step 5: Candidate 1 joined correct room');
    check(step5Res.data.test.title === 'BUG-97 QA Engineering Assessment', 'Step 5: Candidate 1 received test metadata');

    // --- TEST STEP 6: Concurrent Candidate 2 auto-joins via preserved inviteToken -> 200 OK ---
    let step6Res = null;
    const req6 = {
      user: { id: cand2._id.toString() },
      body: { inviteToken: roomDoc.inviteToken },
      app: mockApp,
    };
    const res6 = {
      status: (code) => ({ json: (d) => { step6Res = { status: code, data: d }; } }),
      json: (data) => { step6Res = { status: 200, data }; },
    };

    await joinRoom(req6, res6, (err) => { if (err) throw err; });
    check(step6Res.status === 200, 'Step 6: Candidate 2 (concurrent) auto-joins via preserved inviteToken');

    // --- TEST STEP 7: Candidate 3 Manual Room Code & Password Entry -> 200 OK without regression ---
    let step7Res = null;
    const req7 = {
      user: { id: cand3Manual._id.toString() },
      body: { roomCode: roomDoc.roomCode, roomPassword: roomDoc.roomPassword },
      app: mockApp,
    };
    const res7 = {
      status: (code) => ({ json: (d) => { step7Res = { status: code, data: d }; } }),
      json: (data) => { step7Res = { status: 200, data }; },
    };

    await joinRoom(req7, res7, (err) => { if (err) throw err; });
    check(step7Res.status === 200, 'Step 7: Candidate 3 manual roomCode & roomPassword join succeeds without regression');

    // Clean up test data
    await Candidate.deleteMany({ _id: { $in: [cand1._id, cand2._id, cand3Manual._id] } });
    await Room.deleteOne({ _id: roomDoc._id });
    await Test.deleteOne({ _id: testDoc._id });
    await Question.deleteOne({ _id: question._id });
    await QuestionSet.deleteOne({ _id: qSet._id });
    await Folder.deleteOne({ _id: folder._id });

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');

    console.log('\n------------------------------------------------------------------------');
    console.log(`BUG-97 TEST SUMMARY: ${passedTests}/${totalTests} checks passed.`);
    console.log('------------------------------------------------------------------------\n');
  } catch (err) {
    console.error('Integration test error:', err);
    process.exitCode = 1;
    await mongoose.disconnect().catch(() => {});
  }
}

runIntegrationTests();
