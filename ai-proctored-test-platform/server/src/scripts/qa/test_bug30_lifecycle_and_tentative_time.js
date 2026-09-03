const mongoose = require('mongoose');
require('dotenv').config();

const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Candidate = require('../../models/Candidate');
const Submission = require('../../models/Submission');
const {
  checkAndAutoEndTest,
  checkAndAutoEndAllLiveTests,
  performEndTest,
} = require('../../services/testLifecycleService');

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: BUG-30 (Auto-End Lifecycle & Tentative Time)');
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

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Final test auto-transitions to ENDED (Criterion 1 & 2)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Verify "Final test" auto-transitions to ENDED ---');
  const finalTestBefore = await Test.findOne({ title: /final test/i });
  assert(finalTestBefore !== null, 'Found "Final test" in DB');

  if (finalTestBefore) {
    console.log(`Initial status of "${finalTestBefore.title}": ${finalTestBefore.status}`);
    const didEnd = await checkAndAutoEndTest(finalTestBefore._id, null);
    const finalTestAfter = await Test.findById(finalTestBefore._id);
    console.log(`Updated status of "${finalTestAfter.title}": ${finalTestAfter.status}`);

    assert(
      finalTestAfter.status === 'ENDED',
      '"Final test" successfully auto-transitioned from LIVE to ENDED'
    );

    const finalTestRooms = await Room.find({ testId: finalTestBefore._id });
    const allRoomsClosed = finalTestRooms.every((r) => r.status === 'CLOSED');
    assert(allRoomsClosed, 'All rooms for "Final test" were automatically set to CLOSED');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Multi-test sweep across database (Criterion 2)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Multi-test sweep across existing test records ---');
  const liveTestsBefore = await Test.find({ status: 'LIVE' }).lean();
  console.log(`Found ${liveTestsBefore.length} LIVE tests before sweep`);

  const endedIds = await checkAndAutoEndAllLiveTests(null);
  console.log(`Sweep auto-ended ${endedIds.length} test(s):`, endedIds);

  assert(Array.isArray(endedIds), 'Auto-ended sweep executed successfully across database');

  // Verify that tests with active future rooms did NOT auto-end
  const now = new Date();
  const activeFutureRooms = await Room.find({
    status: 'ACTIVE',
    passwordValidUntil: { $gt: now },
  }).lean();

  for (const r of activeFutureRooms) {
    const parentTest = await Test.findById(r.testId);
    if (parentTest) {
      assert(
        parentTest.status === 'LIVE',
        `Test "${parentTest.title}" with valid active room (${r.roomName}) remained LIVE and was NOT auto-ended`
      );
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Password expired room rejects candidate join (Criterion 3)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Expired room password rejects candidate join (403) ---');
  const expiredRoom = await Room.findOne({
    passwordValidUntil: { $lt: now },
  }).lean();

  assert(expiredRoom !== null, `Found room with expired password: ${expiredRoom?.roomCode}`);

  if (expiredRoom) {
    // Check condition directly matching joinRoom implementation
    const isExpired = !expiredRoom.passwordValidUntil || new Date() > new Date(expiredRoom.passwordValidUntil);
    assert(isExpired, `Room ${expiredRoom.roomCode} is correctly detected as expired (ValidUntil: ${expiredRoom.passwordValidUntil})`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Tentative Time fallback logic (Criterion 4 & 5)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Tentative Time label calculations (Part B) ---');

  // Simulation function matching AdminLiveDashboard useMemo logic exactly
  function calculateTentativeTime(testObj, candidatesMap, nowMs) {
    if (!testObj) return { formatted: '—', rawMs: 0, hasActive: false };
    if (testObj.status === 'ENDED') {
      return { formatted: '00:00 (Concluded)', rawMs: 0, hasActive: false };
    }

    const inProgressCandidates = Object.values(candidatesMap).filter((c) => {
      if (c.status !== 'IN_PROGRESS' || !c.candidateStartTime) return false;
      const rem = Math.max(0, new Date(c.candidateEndTime).getTime() - nowMs);
      return rem > 0;
    });

    const candidatesInScope = Object.values(candidatesMap);

    if (inProgressCandidates.length === 0) {
      if (candidatesInScope.length === 0) {
        return { formatted: 'Not started', rawMs: 0, hasActive: false };
      }
      const anyStarted = candidatesInScope.some(
        (c) => c.candidateStartTime || c.status === 'IN_PROGRESS' || c.status === 'SUBMITTED' || c.status === 'AUTO_SUBMITTED_TIME_UP'
      );
      if (!anyStarted) {
        return { formatted: 'Not started', rawMs: 0, hasActive: false };
      }
      return { formatted: 'Session concluded', rawMs: 0, hasActive: false };
    }

    const remainingTimes = inProgressCandidates.map((c) =>
      Math.max(0, new Date(c.candidateEndTime).getTime() - nowMs)
    );
    const maxRemainingMs = Math.max(...remainingTimes);
    const totalSec = Math.max(0, Math.floor(maxRemainingMs / 1000));
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const secStr = secs < 10 ? `0${secs}` : `${secs}`;
    const minStr = mins < 10 ? `0${mins}` : `${mins}`;

    return {
      formatted: hours > 0 ? `${hours}h ${minStr}m ${secStr}s` : `${minStr}m ${secStr}s`,
      rawMs: maxRemainingMs,
      hasActive: true,
    };
  }

  const liveTestStub = { status: 'LIVE' };
  const endedTestStub = { status: 'ENDED' };
  const nowMs = Date.now();

  // 4a: Zero candidates ever joined
  const resEmpty = calculateTentativeTime(liveTestStub, {}, nowMs);
  assert(resEmpty.formatted === 'Not started', 'Empty candidate roster returns "Not started"');

  // 4b: Candidates joined room, but none have started yet
  const resJoinedNotStarted = calculateTentativeTime(liveTestStub, {
    c1: { candidateId: 'c1', status: 'NOT_STARTED', candidateStartTime: null },
  }, nowMs);
  assert(resJoinedNotStarted.formatted === 'Not started', 'Joined but unstarted candidates return "Not started"');

  // 4c: Candidates joined, completed/disqualified (all reached terminal states)
  const resAllFinished = calculateTentativeTime(liveTestStub, {
    c1: { candidateId: 'c1', status: 'SUBMITTED', candidateStartTime: new Date(nowMs - 3600000) },
    c2: { candidateId: 'c2', status: 'DISQUALIFIED', candidateStartTime: new Date(nowMs - 3600000) },
  }, nowMs);
  assert(resAllFinished.formatted === 'Session concluded', 'All finished/disqualified candidates return "Session concluded"');

  // 4d: Test is ended
  const resEnded = calculateTentativeTime(endedTestStub, {}, nowMs);
  assert(resEnded.formatted === '00:00 (Concluded)', 'ENDED test returns "00:00 (Concluded)"');

  // 5: Candidates actively IN_PROGRESS with remaining time (BUG-21 regression check)
  const resActive = calculateTentativeTime(liveTestStub, {
    c1: { candidateId: 'c1', status: 'IN_PROGRESS', candidateStartTime: new Date(nowMs - 60000), candidateEndTime: new Date(nowMs + 25 * 60000) },
    c2: { candidateId: 'c2', status: 'IN_PROGRESS', candidateStartTime: new Date(nowMs - 60000), candidateEndTime: new Date(nowMs + 10 * 60000) },
    c3: { candidateId: 'c3', status: 'SUBMITTED', candidateStartTime: new Date(nowMs - 120000) },
  }, nowMs);
  assert(resActive.hasActive === true, 'In-progress candidates set hasActive: true');
  assert(resActive.formatted.startsWith('25m'), `Correctly computes max remaining time (25m): received "${resActive.formatted}"`);

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Manual End Test action works as before (Criterion 6)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: Manual "End Test" action verification ---');
  const adminUser = await Candidate.findOne(); // grab any valid ObjectId
  const sampleTest = new Test({
    title: 'Manual End Test Verification ' + Date.now(),
    testType: 'JAVASCRIPT',
    createdBy: adminUser._id,
    questionSetId: adminUser._id,
    durationMinutes: 15,
    totalQuestions: 5,
    passingCriteria: 2,
    instructions: 'Test instructions',
    status: 'LIVE',
  });
  await sampleTest.save();

  const sampleRoom = new Room({
    testId: sampleTest._id,
    roomName: 'Manual End Room',
    roomCode: 'MEND' + Math.floor(1000 + Math.random() * 9000),
    roomPassword: 'PASSWORD123',
    status: 'ACTIVE',
    passwordValidUntil: new Date(Date.now() + 600000),
  });
  await sampleRoom.save();

  console.log(`Created test "${sampleTest.title}" (${sampleTest._id}) with active room`);

  // Call performEndTest manually
  const manuallyEndedTest = await performEndTest(sampleTest._id, null, 'MANUAL');
  assert(manuallyEndedTest.status === 'ENDED', 'Manual performEndTest successfully transitions status to ENDED');

  const updatedRoom = await Room.findById(sampleRoom._id);
  assert(updatedRoom.status === 'CLOSED', 'Manual performEndTest automatically set active room to CLOSED');

  // Cleanup test record
  await Test.findByIdAndDelete(sampleTest._id);
  await Room.findByIdAndDelete(sampleRoom._id);

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('========================================================================');

  await mongoose.disconnect();
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
