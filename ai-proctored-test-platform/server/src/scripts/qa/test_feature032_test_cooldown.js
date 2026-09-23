const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const Candidate = require('../../models/Candidate');
const Submission = require('../../models/Submission');
const Test = require('../../models/Test');
const Room = require('../../models/Room');
const { candidateLogin, candidateRegister } = require('../../controllers/authController');
const { submitAll, joinRoom, startAttempt } = require('../../controllers/submissionController');
const { submitAiTest } = require('../../controllers/aiTestController');
const { disqualifyCandidate } = require('../../controllers/adminController');
const { getCandidateCooldownStatus, recordCandidateTestFinish, COOLDOWN_DURATION_MS } = require('../../utils/cooldownHelper');

function createMockReqRes(body = {}, user = null, params = {}, query = {}) {
  const req = { body, user, params, query, app: { get: () => null } };
  let statusCode = 200;
  let responseData = null;

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    json(data) {
      responseData = data;
      return res;
    },
  };

  return { req, res, getStatus: () => statusCode, getData: () => responseData };
}

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: FEATURE-032 (12-Hour Cooldown Between Tests)');
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

  const createdCandidateIds = [];
  const createdTestIds = [];
  const createdRoomIds = [];
  const createdSubmissionIds = [];

  try {
    const timestamp = Date.now();

    // ── TEST 1: First-time candidate (no prior test) logs in normally ──
    console.log('\n--- 1. First-time candidate login (no restriction) ---');
    const firstCand = await Candidate.create({
      name: `First Timer ${timestamp}`,
      email: `first_timer_${timestamp}@globussoft.com`,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });
    createdCandidateIds.push(firstCand._id);

    const mock1 = createMockReqRes({ email: firstCand.email });
    await candidateLogin(mock1.req, mock1.res, () => {});
    assert(mock1.getStatus() === 200, 'Status 200 on first-time candidate login');
    assert(mock1.getData().token && mock1.getData().candidate, 'Login returns tokens and candidate object');

    // ── TEST 2: Candidate completes test via manual submission (submitAll) ──
    console.log('\n--- 2. Manual test submission records lastTestFinishedAt & starts 12h cooldown ---');
    const testDoc = await Test.create({
      title: `Cooldown Test ${timestamp}`,
      testType: 'SPOJ',
      durationMinutes: 60,
      totalQuestions: 2,
      passingCriteria: 1,
      instructions: 'Please follow test guidelines carefully.',
      status: 'LIVE',
      createdBy: new mongoose.Types.ObjectId(),
    });
    createdTestIds.push(testDoc._id);

    const roomDoc = await Room.create({
      testId: testDoc._id,
      roomName: 'Lab A',
      roomCode: `CD${timestamp.toString().slice(-4)}`,
      roomPassword: 'pwd',
      passwordValidUntil: new Date(Date.now() + 2 * 60 * 60 * 1000),
      status: 'ACTIVE',
    });
    createdRoomIds.push(roomDoc._id);

    const subDoc = await Submission.create({
      candidateId: firstCand._id,
      testId: testDoc._id,
      roomId: roomDoc._id,
      questionId: new mongoose.Types.ObjectId(),
      status: 'IN_PROGRESS',
      candidateStartTime: new Date(Date.now() - 30 * 60 * 1000),
      candidateEndTime: new Date(Date.now() + 30 * 60 * 1000),
    });
    createdSubmissionIds.push(subDoc._id);

    // Call submitAll
    const mockSubmitAll = createMockReqRes({}, { id: firstCand._id.toString() }, { testId: testDoc._id.toString() });
    await submitAll(mockSubmitAll.req, mockSubmitAll.res, () => {});
    assert(mockSubmitAll.getStatus() === 200, 'Status 200 on submitAll');

    // Verify lastTestFinishedAt recorded
    const updatedCand = await Candidate.findById(firstCand._id);
    assert(updatedCand.lastTestFinishedAt !== null, 'lastTestFinishedAt recorded in Candidate document');

    // ── TEST 3: Login within 12 hours is BLOCKED with dynamic remaining time ──
    console.log('\n--- 3. Login within 12 hours is blocked (403) ---');
    const mockLoginBlocked = createMockReqRes({ email: firstCand.email });
    await candidateLogin(mockLoginBlocked.req, mockLoginBlocked.res, () => {});
    assert(mockLoginBlocked.getStatus() === 403, 'Status 403 on login attempt during cooldown');
    const blockedData = mockLoginBlocked.getData();
    assert(blockedData.error && blockedData.error.includes('You cannot take another test yet'), 'Error message contains cooldown explanation');
    assert(blockedData.error.includes('11h') || blockedData.error.includes('12h'), 'Error message contains dynamic hours remaining');
    assert(blockedData.cooldownRemainingMs > 0, 'Response includes cooldownRemainingMs');
    assert(blockedData.eligibleAt !== undefined, 'Response includes eligibleAt timestamp');

    // ── TEST 4: Dynamic remaining time calculation accuracy ──
    console.log('\n--- 4. Dynamic countdown accuracy at different elapsed intervals ---');
    // Simulate candidate finished 4 hours ago (8h remaining)
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    await Candidate.findByIdAndUpdate(firstCand._id, { lastTestFinishedAt: fourHoursAgo });

    const status4h = await getCandidateCooldownStatus(firstCand._id);
    assert(status4h.inCooldown === true, 'inCooldown is true at 4h elapsed');
    assert(status4h.hours === 8, '8 hours remaining after 4h elapsed');
    assert(status4h.message.includes('8h'), 'Message reflects 8h countdown');

    // Simulate candidate finished 11 hours 40 minutes ago (20m remaining)
    const elevenHours40mAgo = new Date(Date.now() - (11 * 60 + 40) * 60 * 1000);
    await Candidate.findByIdAndUpdate(firstCand._id, { lastTestFinishedAt: elevenHours40mAgo });

    const status20m = await getCandidateCooldownStatus(firstCand._id);
    assert(status20m.inCooldown === true, 'inCooldown is true at 11h40m elapsed');
    assert(status20m.hours === 0 && status20m.minutes === 20, '20 minutes remaining after 11h40m elapsed');
    assert(status20m.message.includes('20m'), 'Message reflects 20m countdown without 0h prefix');

    // ── TEST 5: Repeated login attempts dynamically update countdown ──
    console.log('\n--- 5. Repeated login attempts mid-cooldown calculate dynamic countdown ---');
    const mockRep1 = createMockReqRes({ email: firstCand.email });
    await candidateLogin(mockRep1.req, mockRep1.res, () => {});
    assert(mockRep1.getStatus() === 403, 'First attempt blocked with 403');
    assert(mockRep1.getData().error.includes('20m'), 'First attempt shows 20m');

    // Fast-forward 10 minutes (now 10m remaining)
    const elevenHours50mAgo = new Date(Date.now() - (11 * 60 + 50) * 60 * 1000);
    await Candidate.findByIdAndUpdate(firstCand._id, { lastTestFinishedAt: elevenHours50mAgo });

    const mockRep2 = createMockReqRes({ email: firstCand.email });
    await candidateLogin(mockRep2.req, mockRep2.res, () => {});
    assert(mockRep2.getStatus() === 403, 'Second attempt blocked with 403');
    assert(mockRep2.getData().error.includes('10m'), 'Second attempt dynamically updates to 10m remaining');

    // ── TEST 6: Re-registration bypass attempt blocked during cooldown ──
    console.log('\n--- 6. Re-registration attempt with existing email during cooldown ---');
    const mockReReg = createMockReqRes({
      name: firstCand.name,
      email: firstCand.email,
    });
    await candidateRegister(mockReReg.req, mockReReg.res, () => {});
    assert(mockReReg.getStatus() === 403, 'Status 403 when trying to re-register during cooldown');
    assert(mockReReg.getData().error.includes('You cannot take another test yet'), 'Re-registration returns cooldown error');

    // ── TEST 7: Login after 12 hours succeeds normally ──
    console.log('\n--- 7. Login after 12 hours succeeds ---');
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000);
    await Candidate.findByIdAndUpdate(firstCand._id, { lastTestFinishedAt: thirteenHoursAgo });

    const statusExpired = await getCandidateCooldownStatus(firstCand._id);
    assert(statusExpired.inCooldown === false, 'inCooldown is false after 13 hours');

    const mockLoginSuccess = createMockReqRes({ email: firstCand.email });
    await candidateLogin(mockLoginSuccess.req, mockLoginSuccess.res, () => {});
    assert(mockLoginSuccess.getStatus() === 200, 'Status 200 on login after 12h cooldown expired');
    assert(mockLoginSuccess.getData().token !== undefined, 'Returns valid JWT token');

    // ── TEST 8: Admin disqualification starts 12h cooldown ──
    console.log('\n--- 8. Admin disqualification starts 12h cooldown ---');
    const disqCand = await Candidate.create({
      name: `Disq Candidate ${timestamp}`,
      email: `disq_${timestamp}@globussoft.com`,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });
    createdCandidateIds.push(disqCand._id);

    const mockDisq = createMockReqRes({ testId: testDoc._id.toString() }, { role: 'ADMIN' }, { candidateId: disqCand._id.toString() });
    await disqualifyCandidate(mockDisq.req, mockDisq.res, () => {});
    assert(mockDisq.getStatus() === 200, 'Status 200 on disqualifyCandidate');

    const disqCandUpdated = await Candidate.findById(disqCand._id);
    assert(disqCandUpdated.lastTestFinishedAt !== null, 'Disqualification sets lastTestFinishedAt');
    const disqCooldown = await getCandidateCooldownStatus(disqCand._id);
    assert(disqCooldown.inCooldown === true, 'Disqualified candidate enters cooldown');

    // ── TEST 9: AI test submission records lastTestFinishedAt ──
    console.log('\n--- 9. AI test submission records lastTestFinishedAt ---');
    const aiCand = await Candidate.create({
      name: `AI Candidate ${timestamp}`,
      email: `ai_${timestamp}@globussoft.com`,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });
    createdCandidateIds.push(aiCand._id);

    const aiQId = new mongoose.Types.ObjectId();
    const aiSub = await Submission.create({
      candidateId: aiCand._id,
      testId: testDoc._id,
      roomId: roomDoc._id,
      questionId: aiQId,
      status: 'IN_PROGRESS',
      candidateStartTime: new Date(),
    });
    createdSubmissionIds.push(aiSub._id);

    const mockAiSubmit = createMockReqRes(
      { filesJson: { 'index.html': '<h1>Hi</h1>' }, testId: testDoc._id.toString() },
      { id: aiCand._id.toString() },
      { questionId: aiQId.toString() }
    );
    await submitAiTest(mockAiSubmit.req, mockAiSubmit.res, () => {});
    assert(mockAiSubmit.getStatus() === 200, 'Status 200 on submitAiTest');

    const aiCandUpdated = await Candidate.findById(aiCand._id);
    assert(aiCandUpdated.lastTestFinishedAt !== null, 'submitAiTest sets lastTestFinishedAt');
    const aiCooldown = await getCandidateCooldownStatus(aiCand._id);
    assert(aiCooldown.inCooldown === true, 'AI test submitter enters cooldown');

    // ── TEST 10: Legacy candidate fallback from terminal Submission ──
    console.log('\n--- 10. Legacy candidate submission fallback ---');
    const legacyCand = await Candidate.create({
      name: `Legacy Cand ${timestamp}`,
      email: `legacy_cooldown_${timestamp}@globussoft.com`,
      lastTestFinishedAt: null, // Legacy: field not yet set
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });
    createdCandidateIds.push(legacyCand._id);

    const legacySub = await Submission.create({
      candidateId: legacyCand._id,
      testId: testDoc._id,
      roomId: roomDoc._id,
      questionId: new mongoose.Types.ObjectId(),
      status: 'AUTO_SUBMITTED_TIME_UP',
      submittedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    });
    createdSubmissionIds.push(legacySub._id);

    const legacyCooldown = await getCandidateCooldownStatus(legacyCand._id);
    assert(legacyCooldown.inCooldown === true, 'Legacy candidate with recent terminal submission enters cooldown');
    assert(legacyCooldown.hours === 10, '10 hours remaining for legacy candidate (2h elapsed)');

    const legacyCandSaved = await Candidate.findById(legacyCand._id);
    assert(legacyCandSaved.lastTestFinishedAt !== null, 'lastTestFinishedAt backfilled on legacy candidate');

    // ── TEST 11: Defense-in-depth on joinRoom and startAttempt ──
    console.log('\n--- 11. Defense-in-depth on joinRoom and startAttempt ---');
    const mockJoin = createMockReqRes({ roomId: roomDoc._id.toString() }, { id: firstCand._id.toString() });
    // Reset to in-cooldown state for firstCand
    await Candidate.findByIdAndUpdate(firstCand._id, { lastTestFinishedAt: new Date() });
    await joinRoom(mockJoin.req, mockJoin.res, () => {});
    assert(mockJoin.getStatus() === 403, 'joinRoom blocks candidate currently in cooldown');

    const mockStart = createMockReqRes({ roomId: roomDoc._id.toString() }, { id: firstCand._id.toString() }, { testId: testDoc._id.toString() });
    await startAttempt(mockStart.req, mockStart.res, () => {});
    assert(mockStart.getStatus() === 403, 'startAttempt blocks candidate currently in cooldown');

    // ── TEST 12: Frontend verification ──
    console.log('\n--- 12. Frontend verification ---');
    const loginSrc = fs.readFileSync(path.join(__dirname, '../../../../client/src/candidate/pages/CandidateLogin.jsx'), 'utf8');
    assert(loginSrc.includes('take another test yet'), 'CandidateLogin.jsx handles cooldown alert styling');

    const regSrc = fs.readFileSync(path.join(__dirname, '../../../../client/src/candidate/pages/CandidateRegister.jsx'), 'utf8');
    assert(regSrc.includes('take another test yet'), 'CandidateRegister.jsx handles cooldown alert styling');

  } catch (err) {
    console.error('Test execution error:', err);
    process.exitCode = 1;
  } finally {
    if (createdCandidateIds.length > 0) {
      await Candidate.deleteMany({ _id: { $in: createdCandidateIds } });
    }
    if (createdSubmissionIds.length > 0) {
      await Submission.deleteMany({ _id: { $in: createdSubmissionIds } });
    }
    if (createdRoomIds.length > 0) {
      await Room.deleteMany({ _id: { $in: createdRoomIds } });
    }
    if (createdTestIds.length > 0) {
      await Test.deleteMany({ _id: { $in: createdTestIds } });
    }
    await mongoose.disconnect();
    console.log(`\n========================================================================`);
    console.log(`TEST RESULTS: ${passedTests}/${totalTests} Passed`);
    console.log(`========================================================================\n`);
  }
}

runTests();
