const path = require('path');
const fs = require('fs');
const assert = require('assert');
const { resolveCandidateTimelines } = require('../../utils/timelineHelper');

// ── BUG-022: Room Joined and Test Start Consistency QA Suite ─────────────────

console.log('================================================================');
console.log('QA SUITE: BUG-022 Room Joined and Test Start Consistency');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    Error: ${err.message}`);
    failCount++;
  }
}

// ── TEST 1: Exact User Scenario Reproduction & Verification ──────────────────
runTest('Exact User Scenario: Candidate with delayed joinedAt resolves to candidate.createdAt before testStartedAt', () => {
  const candidateCreatedAt = new Date('2026-09-24T11:36:58Z');
  const testStartedAt = new Date('2026-09-24T11:37:56Z');
  const roomJoinedAtRaw = new Date('2026-09-24T11:40:36Z'); // 3m 38s after test start
  const testEndedAt = new Date('2026-09-24T13:44:46Z');

  const resolved = resolveCandidateTimelines({
    roomJoinedAtRaw,
    candidateCreatedAt,
    testStartedAtRaw: testStartedAt,
    testEndedAtRaw: testEndedAt,
    candidateId: 'cand_he',
    testId: 'test_1',
    roomId: 'room_II',
  });

  assert.ok(resolved.roomJoinedAt, 'roomJoinedAt must be defined');
  assert.ok(resolved.testStartedAt, 'testStartedAt must be defined');
  assert.ok(resolved.testEndedAt, 'testEndedAt must be defined');

  const resolvedRoomJoinTime = new Date(resolved.roomJoinedAt).getTime();
  const resolvedTestStartTime = new Date(resolved.testStartedAt).getTime();
  const resolvedTestEndTime = new Date(resolved.testEndedAt).getTime();

  // Assert canonical value is 11:36:58Z
  assert.strictEqual(resolvedRoomJoinTime, candidateCreatedAt.getTime(), 'roomJoinedAt must resolve to the earliest valid timestamp (11:36:58Z)');
  assert.strictEqual(resolvedTestStartTime, testStartedAt.getTime(), 'testStartedAt must be 11:37:56Z');
  assert.strictEqual(resolvedTestEndTime, testEndedAt.getTime(), 'testEndedAt must be 13:44:46Z');

  // Enforce strict chronological ordering
  assert.ok(resolvedRoomJoinTime <= resolvedTestStartTime, 'roomJoinedAt must occur BEFORE or AT testStartedAt');
  assert.ok(resolvedTestStartTime <= resolvedTestEndTime, 'testStartedAt must occur BEFORE or AT testEndedAt');
});

// ── TEST 2: Standard Sequential Candidate Attempt ────────────────────────────
runTest('Standard Sequential Attempt: 11:30 Joined -> 11:35 Started -> 12:35 Submitted', () => {
  const roomJoinedAt = new Date('2026-09-24T11:30:00Z');
  const testStartedAt = new Date('2026-09-24T11:35:00Z');
  const testEndedAt = new Date('2026-09-24T12:35:00Z');

  const resolved = resolveCandidateTimelines({
    roomJoinedAtRaw: roomJoinedAt,
    candidateCreatedAt: roomJoinedAt,
    testStartedAtRaw: testStartedAt,
    testEndedAtRaw: testEndedAt,
    candidateId: 'cand_standard',
    testId: 'test_1',
    roomId: 'room_1',
  });

  assert.strictEqual(new Date(resolved.roomJoinedAt).getTime(), roomJoinedAt.getTime());
  assert.strictEqual(new Date(resolved.testStartedAt).getTime(), testStartedAt.getTime());
  assert.strictEqual(new Date(resolved.testEndedAt).getTime(), testEndedAt.getTime());
});

// ── TEST 3: Unstarted Candidate ──────────────────────────────────────────────
runTest('Unstarted Candidate: Room Joined preserved, testStartedAt and testEndedAt remain null', () => {
  const roomJoinedAt = new Date('2026-09-24T11:30:00Z');

  const resolved = resolveCandidateTimelines({
    roomJoinedAtRaw: roomJoinedAt,
    candidateCreatedAt: roomJoinedAt,
    testStartedAtRaw: null,
    testEndedAtRaw: null,
    candidateId: 'cand_unstarted',
    testId: 'test_1',
    roomId: 'room_1',
  });

  assert.strictEqual(new Date(resolved.roomJoinedAt).getTime(), roomJoinedAt.getTime());
  assert.strictEqual(resolved.testStartedAt, null);
  assert.strictEqual(resolved.testEndedAt, null);
});

// ── TEST 4: Backend Source Code Audit ────────────────────────────────────────
runTest('Backend Source Code Audit: roomController, proctoringController, submissionController utilize timeline canonicalization', () => {
  const roomCtrlPath = path.resolve(__dirname, '../../controllers/roomController.js');
  const procCtrlPath = path.resolve(__dirname, '../../controllers/proctoringController.js');
  const subCtrlPath = path.resolve(__dirname, '../../controllers/submissionController.js');

  const roomSrc = fs.readFileSync(roomCtrlPath, 'utf8');
  const procSrc = fs.readFileSync(procCtrlPath, 'utf8');
  const subSrc = fs.readFileSync(subCtrlPath, 'utf8');

  assert.ok(roomSrc.includes("require('../utils/timelineHelper')"), 'roomController must import timelineHelper');
  assert.ok(roomSrc.includes('resolveCandidateTimelines'), 'roomController must call resolveCandidateTimelines in getRoomCandidates and getLiveCandidates');

  assert.ok(procSrc.includes("require('../utils/timelineHelper')"), 'proctoringController must import timelineHelper');
  assert.ok(procSrc.includes('resolveCandidateTimelines'), 'proctoringController must call resolveCandidateTimelines in getCandidateMalpracticeLogs');

  assert.ok(subSrc.includes('candidateJoinTime'), 'submissionController must compute candidateJoinTime to avoid later overwrite');
});

// ── TEST 5: Separate Room Joined (1:40 PM) vs Test Start (1:48 PM) ─────────
runTest('Candidate login at 1:40 PM and Test Start at 1:48 PM preserves distinct timestamps', () => {
  const candidateCreatedAt = new Date('2026-09-24T13:40:36Z');
  const candidateLastLoginAt = new Date('2026-09-24T13:40:36Z');
  const candidateRoomJoinedAt = new Date('2026-09-24T13:40:36Z');
  const testStartedAt = new Date('2026-09-24T13:48:15Z'); // 7m 39s later after instructions & permissions
  const testEndedAt = new Date('2026-09-24T14:03:32Z');

  const resolved = resolveCandidateTimelines({
    roomJoinedAtRaw: candidateRoomJoinedAt,
    candidateCreatedAt,
    candidateLastLoginAt,
    candidateRoomJoinedAt,
    testStartedAtRaw: testStartedAt,
    testEndedAtRaw: testEndedAt,
    candidateId: 'cand_distinct_test',
    testId: 'test_distinct',
    roomId: 'room_distinct',
  });

  assert.strictEqual(new Date(resolved.roomJoinedAt).getTime(), candidateRoomJoinedAt.getTime(), 'roomJoinedAt must be 13:40:36Z');
  assert.strictEqual(new Date(resolved.testStartedAt).getTime(), testStartedAt.getTime(), 'testStartedAt must be 13:48:15Z');
  assert.strictEqual(new Date(resolved.testEndedAt).getTime(), testEndedAt.getTime(), 'testEndedAt must be 14:03:32Z');
  assert.notStrictEqual(new Date(resolved.roomJoinedAt).getTime(), new Date(resolved.testStartedAt).getTime(), 'roomJoinedAt and testStartedAt must NOT be equal when candidate joined earlier');
});

// ── TEST 6: Frontend Source Code Audit ───────────────────────────────────────
runTest('Frontend Source Code Audit: AdminTestDetail.jsx and AdminLiveDashboard.jsx enforce canonical room joined consistency', () => {
  const testDetailPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx');
  const liveDashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');

  const testDetailSrc = fs.readFileSync(testDetailPath, 'utf8');
  const liveDashboardSrc = fs.readFileSync(liveDashboardPath, 'utf8');

  assert.ok(testDetailSrc.includes('getCanonicalRoomJoinedTime'), 'AdminTestDetail.jsx must define and use getCanonicalRoomJoinedTime');
  assert.ok(liveDashboardSrc.includes('getInspectRoomJoinedText'), 'AdminLiveDashboard.jsx must define getInspectRoomJoinedText');
  assert.ok(liveDashboardSrc.includes('resolvedJoin.getTime() > validStart.getTime()') || liveDashboardSrc.includes('dJoin.getTime() > dStart.getTime()'), 'AdminLiveDashboard.jsx must validate room joined against test start');
});

console.log('\n================================================================');
console.log(`SUMMARY: ${passCount} Passed, ${failCount} Failed`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
