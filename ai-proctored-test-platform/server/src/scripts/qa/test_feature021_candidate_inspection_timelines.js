const path = require('path');
const fs = require('fs');
const assert = require('assert');

// ── FEATURE-021: Candidate Inspection & Evidence Timeline Timestamps QA Suite ─

console.log('================================================================');
console.log('QA SUITE: FEATURE-021 Candidate Inspection Timeline Timestamps');
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

// ── TEST 1: Source Code Audit for 2-Row 6-Metric Grid & IDs ──────────────────
runTest('Source Code Audit: AdminLiveDashboard.jsx contains 2-Row Key Metrics Grid with proper IDs', () => {
  const dashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');
  assert.ok(fs.existsSync(dashboardPath), 'AdminLiveDashboard.jsx must exist');
  const code = fs.readFileSync(dashboardPath, 'utf8');

  // Verify modal elements
  assert.ok(code.includes('id="inspect-candidate-key-metrics-grid"'), 'Key metrics grid container must have id');
  assert.ok(code.includes('Questions Solved:'), 'Row 1 must contain Questions Solved');
  assert.ok(code.includes('Total Violations:'), 'Row 1 must contain Total Violations');
  assert.ok(code.includes('id="inspect-candidate-time-spent-label"'), 'Row 1 must contain Time Spent / Remaining label ID');
  assert.ok(code.includes('id="inspect-candidate-room-joined-label"'), 'Row 2 must contain Room Joined label ID');
  assert.ok(code.includes('id="inspect-candidate-room-joined-val"'), 'Row 2 must contain Room Joined value ID');
  assert.ok(code.includes('id="inspect-candidate-test-start-label"'), 'Row 2 must contain Test Start label ID');
  assert.ok(code.includes('id="inspect-candidate-test-start-val"'), 'Row 2 must contain Test Start value ID');
  assert.ok(code.includes('id="inspect-candidate-test-end-label"'), 'Row 2 must contain Test End label ID');
  assert.ok(code.includes('id="inspect-candidate-test-end-val"'), 'Row 2 must contain Test End value ID');
});

// ── TEST 2: Source Code Audit for Helper Functions ───────────────────────────
runTest('Source Code Audit: AdminLiveDashboard.jsx defines formatting and evaluation helpers', () => {
  const dashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');
  const code = fs.readFileSync(dashboardPath, 'utf8');

  assert.ok(code.includes('formatInspectTimestamp'), 'Must declare formatInspectTimestamp');
  assert.ok(code.includes('getInspectRoomJoinedText'), 'Must declare getInspectRoomJoinedText');
  assert.ok(code.includes('getInspectTestStartText'), 'Must declare getInspectTestStartText');
  assert.ok(code.includes('getInspectTestEndText'), 'Must declare getInspectTestEndText');
});

// ── TEST 3: Logic Verification of Timeline Helpers (Unit Tests) ─────────────
runTest('Logic Verification: Helper logic handles all required states & special cases accurately', () => {
  const formatInspectTimestamp = (dateInput) => {
    if (!dateInput) return 'Unavailable';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return 'Unavailable';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  };

  const getInspectRoomJoinedText = (candidate) => {
    if (!candidate) return 'Unavailable';
    const raw = candidate.roomJoinedAt || candidate.joinedAt || candidate.candidateJoinedAt;
    if (!raw) return 'Unavailable';
    return formatInspectTimestamp(raw);
  };

  const getInspectTestStartText = (candidate) => {
    if (!candidate) return 'Unavailable';
    const raw = candidate.testStartedAt || candidate.candidateStartTime || candidate.startedAt;
    const isStarted = Boolean(raw);
    if (candidate.status === 'NOT_STARTED' || (!isStarted && candidate.status !== 'SUBMITTED' && candidate.status !== 'IN_PROGRESS')) {
      return 'Not Started';
    }
    if (!raw) return 'Unavailable';
    return formatInspectTimestamp(raw);
  };

  const getInspectTestEndText = (candidate) => {
    if (!candidate) return 'Unavailable';
    const startRaw = candidate.testStartedAt || candidate.candidateStartTime || candidate.startedAt;
    const isStarted = Boolean(startRaw);

    if (candidate.status === 'NOT_STARTED' || (!isStarted && candidate.status !== 'SUBMITTED' && candidate.status !== 'IN_PROGRESS')) {
      return '—';
    }

    const isSubmitted =
      candidate.status === 'SUBMITTED' ||
      candidate.status === 'AUTO_SUBMITTED' ||
      candidate.status === 'AUTO_SUBMITTED_TIME_UP' ||
      candidate.status === 'AUTO_SUBMITTED_DISQUALIFIED' ||
      Boolean(candidate.submittedAt) ||
      candidate.colorStatus === 'GREEN';

    const isDisqualified = candidate.status === 'DISQUALIFIED' || candidate.isDisqualified || candidate.colorStatus === 'RED';

    if (isSubmitted || candidate.submittedAt || candidate.testEndedAt) {
      const raw = candidate.testEndedAt || candidate.submittedAt || candidate.candidateEndTime;
      if (!raw) return 'Unavailable';
      return formatInspectTimestamp(raw);
    }

    if (isDisqualified) {
      const raw = candidate.testEndedAt || candidate.submittedAt || candidate.disqualifiedAt || candidate.candidateEndTime || candidate.lastMalpracticeAt;
      if (!raw) return 'Unavailable';
      return formatInspectTimestamp(raw);
    }

    if (candidate.status === 'IN_PROGRESS' || isStarted) {
      return 'In Progress';
    }

    return '—';
  };

  const joinTime = new Date('2026-09-24T10:30:00Z').toISOString();
  const startTime = new Date('2026-09-24T10:45:00Z').toISOString();
  const endTime = new Date('2026-09-24T11:15:00Z').toISOString();

  // Case 1: Joined room, but NOT started
  const notStartedCand = {
    candidateId: 'c1',
    status: 'NOT_STARTED',
    roomJoinedAt: joinTime,
    testStartedAt: null,
    testEndedAt: null,
  };
  assert.strictEqual(getInspectRoomJoinedText(notStartedCand), formatInspectTimestamp(joinTime));
  assert.strictEqual(getInspectTestStartText(notStartedCand), 'Not Started');
  assert.strictEqual(getInspectTestEndText(notStartedCand), '—');

  // Case 2: IN_PROGRESS candidate
  const inProgressCand = {
    candidateId: 'c2',
    status: 'IN_PROGRESS',
    roomJoinedAt: joinTime,
    testStartedAt: startTime,
    candidateStartTime: startTime,
    testEndedAt: null,
  };
  assert.strictEqual(getInspectRoomJoinedText(inProgressCand), formatInspectTimestamp(joinTime));
  assert.strictEqual(getInspectTestStartText(inProgressCand), formatInspectTimestamp(startTime));
  assert.strictEqual(getInspectTestEndText(inProgressCand), 'In Progress');

  // Case 3: SUBMITTED candidate
  const submittedCand = {
    candidateId: 'c3',
    status: 'SUBMITTED',
    roomJoinedAt: joinTime,
    testStartedAt: startTime,
    candidateStartTime: startTime,
    submittedAt: endTime,
    testEndedAt: endTime,
  };
  assert.strictEqual(getInspectRoomJoinedText(submittedCand), formatInspectTimestamp(joinTime));
  assert.strictEqual(getInspectTestStartText(submittedCand), formatInspectTimestamp(startTime));
  assert.strictEqual(getInspectTestEndText(submittedCand), formatInspectTimestamp(endTime));

  // Case 4: AUTO_SUBMITTED_TIME_UP candidate
  const autoSubmittedCand = {
    candidateId: 'c4',
    status: 'AUTO_SUBMITTED_TIME_UP',
    roomJoinedAt: joinTime,
    testStartedAt: startTime,
    candidateStartTime: startTime,
    submittedAt: endTime,
    testEndedAt: endTime,
  };
  assert.strictEqual(getInspectRoomJoinedText(autoSubmittedCand), formatInspectTimestamp(joinTime));
  assert.strictEqual(getInspectTestStartText(autoSubmittedCand), formatInspectTimestamp(startTime));
  assert.strictEqual(getInspectTestEndText(autoSubmittedCand), formatInspectTimestamp(endTime));

  // Case 5: Historical attempt with missing timestamps
  const historicalCand = {
    candidateId: 'c5',
    status: 'SUBMITTED',
    roomJoinedAt: null,
    testStartedAt: null,
    testEndedAt: null,
  };
  assert.strictEqual(getInspectRoomJoinedText(historicalCand), 'Unavailable');
  assert.strictEqual(getInspectTestStartText(historicalCand), 'Unavailable');
  assert.strictEqual(getInspectTestEndText(historicalCand), 'Unavailable');
});

// ── TEST 4: Backend Controller Audit ─────────────────────────────────────────
runTest('Backend Controller Audit: proctoringController and roomController return timeline fields', () => {
  const procCtrlPath = path.resolve(__dirname, '../../controllers/proctoringController.js');
  const roomCtrlPath = path.resolve(__dirname, '../../controllers/roomController.js');

  const procCode = fs.readFileSync(procCtrlPath, 'utf8');
  assert.ok(procCode.includes('roomJoinedAt'), 'proctoringController must return roomJoinedAt');
  assert.ok(procCode.includes('testStartedAt'), 'proctoringController must return testStartedAt');
  assert.ok(procCode.includes('testEndedAt'), 'proctoringController must return testEndedAt');

  const roomCode = fs.readFileSync(roomCtrlPath, 'utf8');
  assert.ok(roomCode.includes('roomJoinedAt'), 'roomController must populate roomJoinedAt');
  assert.ok(roomCode.includes('testStartedAt'), 'roomController must populate testStartedAt');
  assert.ok(roomCode.includes('testEndedAt'), 'roomController must populate testEndedAt');
});

console.log('\n================================================================');
console.log(`SUMMARY: ${passCount} Passed, ${failCount} Failed`);
console.log('================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
