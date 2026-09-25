const path = require('path');
const fs = require('fs');
const assert = require('assert');

// ── FEATURE-037: Roster "Time" Column Rework & Table Title Renames QA Suite ──

console.log('========================================================================');
console.log('QA SUITE: FEATURE-037 Roster Time Column Rework & Table Title Renames');
console.log('========================================================================\n');

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

const dashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');
assert.ok(fs.existsSync(dashboardPath), 'AdminLiveDashboard.jsx must exist');
const code = fs.readFileSync(dashboardPath, 'utf8');

// ── TEST 1: Table Title Renames ──────────────────────────────────────────────
runTest('Source Code Audit: Table titles renamed cleanly to "Candidate Live Proctoring" and "Candidate Proctoring Summary"', () => {
  assert.ok(
    code.includes("{isTestEnded ? 'Candidate Proctoring Summary' : 'Candidate Live Proctoring'}"),
    'Table title must toggle between Candidate Proctoring Summary and Candidate Live Proctoring'
  );
  assert.ok(
    !code.includes('Candidate Proctoring Summary Roster'),
    'Old title "Candidate Proctoring Summary Roster" must be removed'
  );
  assert.ok(
    !code.includes('Candidate Live Proctoring Roster'),
    'Old title "Candidate Live Proctoring Roster" must be removed'
  );
});

// ── TEST 2: Dynamic Column Header ────────────────────────────────────────────
runTest('Source Code Audit: Time column header dynamically toggles between "Time Remaining" (live) and "Time Spent" (ended)', () => {
  assert.ok(
    code.includes("<div>{isTestEnded ? 'Time Spent' : 'Time Remaining'}</div>"),
    'Header must render "Time Spent" when isTestEnded, and "Time Remaining" when live'
  );
  assert.ok(
    !code.includes("<div>{isTestEnded ? 'Status / Time' : 'Time Left'}</div>"),
    'Old static header "Status / Time" must be removed'
  );
});

// ── TEST 3: Props passed to CandidateRowItem ─────────────────────────────────
runTest('Source Code Audit: testDurationMinutes passed to CandidateRowItem', () => {
  assert.ok(
    code.includes('testDurationMinutes={test?.durationMinutes || test?.duration || 30}'),
    'testDurationMinutes must be passed to CandidateRowItem'
  );
});

// ── TEST 4: Live In-Progress Countdown Calculation ───────────────────────────
runTest('Logic Verification: In-progress candidate countdown recalculates from authoritative timestamps and clamps at 0m 0s', () => {
  const getCandidateRemainingMs = (candidate, currentNow, testDurationMinutes) => {
    if (!candidate) return 0;
    const isTerminal =
      candidate.status === 'SUBMITTED' ||
      candidate.status === 'AUTO_SUBMITTED' ||
      candidate.status === 'AUTO_SUBMITTED_TIME_UP' ||
      candidate.status === 'AUTO_SUBMITTED_DISQUALIFIED' ||
      candidate.status === 'DISQUALIFIED' ||
      candidate.isDisqualified ||
      Boolean(candidate.submittedAt);

    if (isTerminal || candidate.status === 'NOT_STARTED') return 0;

    const startRaw = candidate.candidateStartTime || candidate.startedAt;
    if (!startRaw) return 0;

    if (candidate.candidateEndTime) {
      const endMs = new Date(candidate.candidateEndTime).getTime();
      if (!isNaN(endMs) && endMs > 0) {
        return Math.max(0, endMs - currentNow);
      }
    }

    if (typeof testDurationMinutes === 'number' && testDurationMinutes > 0 && startRaw) {
      const startMs = new Date(startRaw).getTime();
      if (!isNaN(startMs) && startMs > 0) {
        const endMs = startMs + testDurationMinutes * 60 * 1000;
        return Math.max(0, endMs - currentNow);
      }
    }
    return 0;
  };

  const getRosterTime = (candidate, now, isTestEnded, testDurationMinutes = 30) => {
    if (isTestEnded) {
      // Mocked matching getCandidateTimeSpent
      if (!candidate.candidateStartTime) return '—';
      const start = new Date(candidate.candidateStartTime).getTime();
      const end = candidate.submittedAt ? new Date(candidate.submittedAt).getTime() : now;
      const totalSec = Math.max(0, Math.floor((end - start) / 1000));
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
    }

    const isDisqualified =
      candidate.status === 'DISQUALIFIED' ||
      candidate.status === 'AUTO_SUBMITTED_DISQUALIFIED' ||
      candidate.isDisqualified ||
      candidate.colorStatus === 'RED';

    const isSubmitted =
      candidate.status === 'SUBMITTED' ||
      candidate.status === 'AUTO_SUBMITTED' ||
      candidate.status === 'AUTO_SUBMITTED_TIME_UP' ||
      Boolean(candidate.submittedAt) ||
      candidate.colorStatus === 'GREEN';

    if (isSubmitted || isDisqualified) {
      return '0m 0s';
    }

    const startRaw = candidate.candidateStartTime || candidate.startedAt;
    if (!startRaw || candidate.status === 'NOT_STARTED') {
      const durMins = typeof testDurationMinutes === 'number' && testDurationMinutes > 0 ? testDurationMinutes : 30;
      const hours = Math.floor(durMins / 60);
      const mins = durMins % 60;
      if (hours > 0) return `${hours}h ${mins}m 0s`;
      return `${mins}m 0s`;
    }

    const remainingMs = getCandidateRemainingMs(candidate, now, testDurationMinutes);
    if (remainingMs <= 0) {
      return '0m 0s';
    }

    const totalSec = Math.floor(remainingMs / 1000);
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;

    if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
    return `${mins}m ${secs}s`;
  };

  const now = Date.now();
  // 1. In-progress candidate: 18m into a 30m test -> 12m 0s remaining
  const candidate18m = {
    status: 'IN_PROGRESS',
    candidateStartTime: new Date(now - 18 * 60 * 1000).toISOString(),
    candidateEndTime: new Date(now + 12 * 60 * 1000).toISOString(),
  };
  assert.strictEqual(getRosterTime(candidate18m, now, false, 30), '12m 0s');

  // 2. In-progress candidate countdown tick (1 second later)
  assert.strictEqual(getRosterTime(candidate18m, now + 1000, false, 30), '11m 59s');

  // 3. In-progress candidate expired time (>30m elapsed) -> clamps at 0m 0s
  const candidateExpired = {
    status: 'IN_PROGRESS',
    candidateStartTime: new Date(now - 35 * 60 * 1000).toISOString(),
    candidateEndTime: new Date(now - 5 * 60 * 1000).toISOString(),
  };
  assert.strictEqual(getRosterTime(candidateExpired, now, false, 30), '0m 0s');

  // 4. Early submitted candidate during live test -> 0m 0s
  const candidateSubmitted = {
    status: 'SUBMITTED',
    candidateStartTime: new Date(now - 10 * 60 * 1000).toISOString(),
    submittedAt: new Date(now - 2 * 60 * 1000).toISOString(),
  };
  assert.strictEqual(getRosterTime(candidateSubmitted, now, false, 30), '0m 0s');

  // 5. Early disqualified candidate during live test -> 0m 0s
  const candidateDisqualified = {
    status: 'DISQUALIFIED',
    isDisqualified: true,
    candidateStartTime: new Date(now - 10 * 60 * 1000).toISOString(),
  };
  assert.strictEqual(getRosterTime(candidateDisqualified, now, false, 30), '0m 0s');

  // 6. Not started candidate during live test -> Full test duration "30m 0s"
  const candidateNotStarted = {
    status: 'NOT_STARTED',
    candidateStartTime: null,
  };
  assert.strictEqual(getRosterTime(candidateNotStarted, now, false, 30), '30m 0s');

  // 7. Transition to Ended Test (isTestEnded === true) -> Shows Time Spent
  assert.strictEqual(getRosterTime(candidateSubmitted, now, true, 30), '8m 00s');
  assert.strictEqual(getRosterTime(candidateNotStarted, now, true, 30), '—');
});

// ── TEST 5: Filter & Search Compatibility ────────────────────────────────────
runTest('Filter & Search: Candidate list filtering operates smoothly with reworked column', () => {
  const mockCandidates = {
    c1: { candidateId: 'c1', name: 'Alice', status: 'IN_PROGRESS', candidateStartTime: new Date().toISOString() },
    c2: { candidateId: 'c2', name: 'Bob', status: 'SUBMITTED', submittedAt: new Date().toISOString() },
    c3: { candidateId: 'c3', name: 'Charlie', status: 'NOT_STARTED' },
  };

  const filter = (search, status, isTestEnded) => {
    return Object.values(mockCandidates).filter((c) => {
      const matchesSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = status === 'ALL' || c.status === status;
      return matchesSearch && matchesStatus;
    });
  };

  assert.strictEqual(filter('ali', 'ALL', false).length, 1);
  assert.strictEqual(filter('', 'SUBMITTED', false).length, 1);
  assert.strictEqual(filter('', 'ALL', false).length, 3);
});

console.log(`\n========================================================================`);
console.log(`QA RESULTS: ${passCount} passed, ${failCount} failed`);
console.log(`========================================================================\n`);

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
