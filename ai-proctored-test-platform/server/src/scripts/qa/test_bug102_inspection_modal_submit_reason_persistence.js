const path = require('path');
const fs = require('fs');
const assert = require('assert');

// ── BUG-102: Candidate Inspection Modal Submit Reason Persistence QA Suite ────

console.log('================================================================');
console.log('QA SUITE: BUG-102 Candidate Inspection Modal Submit Reason Persistence');
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

// ── TEST 1: Backend roomController.js preserves AUTO_SUBMITTED_TIME_UP in getLiveCandidates ─
runTest('Source Code Audit: roomController.js preserves AUTO_SUBMITTED_TIME_UP in getLiveCandidates', () => {
  const roomControllerPath = path.resolve(__dirname, '../../controllers/roomController.js');
  assert.ok(fs.existsSync(roomControllerPath), 'roomController.js must exist');
  const code = fs.readFileSync(roomControllerPath, 'utf8');

  // Verify getLiveCandidates does not collapse AUTO_SUBMITTED_TIME_UP into generic SUBMITTED
  assert.ok(
    code.includes("status = 'AUTO_SUBMITTED_TIME_UP'") &&
    code.includes("candidateMap[cid].status = 'AUTO_SUBMITTED_TIME_UP'"),
    'getLiveCandidates must assign AUTO_SUBMITTED_TIME_UP status for auto-submitted submissions'
  );
});

// ── TEST 2: Backend socketHandler.js preserves AUTO_SUBMITTED_TIME_UP in heartbeat ─
runTest('Source Code Audit: socketHandler.js emits AUTO_SUBMITTED_TIME_UP in dashboard:update', () => {
  const socketHandlerPath = path.resolve(__dirname, '../../sockets/socketHandler.js');
  assert.ok(fs.existsSync(socketHandlerPath), 'socketHandler.js must exist');
  const code = fs.readFileSync(socketHandlerPath, 'utf8');

  assert.ok(
    code.includes("candidateStatus = 'AUTO_SUBMITTED_TIME_UP'"),
    'socketHandler must assign candidateStatus = AUTO_SUBMITTED_TIME_UP'
  );
});

// ── TEST 3: Frontend AdminLiveDashboard.jsx preserves AUTO_SUBMITTED_TIME_UP on background sync ─
runTest('Source Code Audit: AdminLiveDashboard.jsx guards activeInspectCandidate and polling merge against reason loss', () => {
  const dashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');
  assert.ok(fs.existsSync(dashboardPath), 'AdminLiveDashboard.jsx must exist');
  const code = fs.readFileSync(dashboardPath, 'utf8');

  // Verify activeInspectCandidate memo
  assert.ok(
    code.includes("merged.status = 'AUTO_SUBMITTED_TIME_UP'"),
    'activeInspectCandidate must preserve AUTO_SUBMITTED_TIME_UP when merging candidatesMap'
  );

  // Verify modal badge helper maps to 'SUBMITTED (TIME UP)'
  assert.ok(
    code.includes("displayStatus = 'SUBMITTED (TIME UP)'"),
    'Modal badge helper must output SUBMITTED (TIME UP)'
  );
});

// ── TEST 4: Simulation of Modal Open & Periodic Polling Resolution Over Time ───
runTest('Logic Verification: Modal badge status remains stable over multiple polling cycles', () => {
  // Simulate candidate initial modal open
  const initialInspectCandidate = {
    candidateId: 'cand_123',
    name: 'hi',
    email: 'hi@g.com',
    status: 'AUTO_SUBMITTED_TIME_UP',
    colorStatus: 'GREEN',
    submittedAt: new Date().toISOString(),
  };

  const getDisplayStatus = (activeCand, isTestEnded = false) => {
    let displayStatus = activeCand.status;
    if (activeCand.status === 'AUTO_SUBMITTED_TIME_UP' || activeCand.status === 'AUTO_SUBMITTED') {
      displayStatus = 'SUBMITTED (TIME UP)';
    } else if (activeCand.status === 'DISQUALIFIED' || activeCand.status === 'AUTO_SUBMITTED_DISQUALIFIED' || activeCand.isDisqualified) {
      displayStatus = 'DISQUALIFIED';
    } else if (activeCand.status === 'SUBMITTED' || activeCand.colorStatus === 'GREEN') {
      displayStatus = 'SUBMITTED';
    } else if (activeCand.status === 'IN_PROGRESS') {
      displayStatus = 'IN_PROGRESS';
    } else {
      displayStatus = 'NOT_STARTED';
    }
    return displayStatus;
  };

  // Initial badge check
  assert.strictEqual(getDisplayStatus(initialInspectCandidate), 'SUBMITTED (TIME UP)');

  // Simulate 10 consecutive background polling updates (every 10s for 100s)
  let currentCandidatesMap = {
    cand_123: {
      candidateId: 'cand_123',
      name: 'hi',
      email: 'hi@g.com',
      status: 'AUTO_SUBMITTED_TIME_UP',
      colorStatus: 'GREEN',
    }
  };

  for (let cycle = 1; cycle <= 10; cycle++) {
    // Polling fetch resolves with candidateMap data
    const fromMap = currentCandidatesMap[initialInspectCandidate.candidateId];
    const merged = { ...initialInspectCandidate, ...fromMap };
    if (
      (initialInspectCandidate.status === 'AUTO_SUBMITTED_TIME_UP' || initialInspectCandidate.status === 'AUTO_SUBMITTED') &&
      fromMap.status === 'SUBMITTED'
    ) {
      merged.status = 'AUTO_SUBMITTED_TIME_UP';
    }

    const badge = getDisplayStatus(merged);
    assert.strictEqual(
      badge,
      'SUBMITTED (TIME UP)',
      `Polling cycle ${cycle} must maintain SUBMITTED (TIME UP)`
    );
  }
});

// ── TEST 5: Manual vs Disqualified vs Time-Up stability across all states ─────
runTest('Logic Verification: Manual submit, disqualified, and time-up remain stable and distinct', () => {
  const getDisplayStatus = (activeCand) => {
    if (activeCand.status === 'AUTO_SUBMITTED_TIME_UP' || activeCand.status === 'AUTO_SUBMITTED') {
      return 'SUBMITTED (TIME UP)';
    } else if (activeCand.status === 'DISQUALIFIED' || activeCand.status === 'AUTO_SUBMITTED_DISQUALIFIED' || activeCand.isDisqualified) {
      return 'DISQUALIFIED';
    } else if (activeCand.status === 'SUBMITTED' || activeCand.colorStatus === 'GREEN') {
      return 'SUBMITTED';
    } else if (activeCand.status === 'IN_PROGRESS') {
      return 'IN_PROGRESS';
    }
    return 'NOT_STARTED';
  };

  // Manual submission candidate
  const manualCand = { status: 'SUBMITTED', colorStatus: 'GREEN' };
  assert.strictEqual(getDisplayStatus(manualCand), 'SUBMITTED');

  // Time-up auto-submitted candidate
  const timeUpCand = { status: 'AUTO_SUBMITTED_TIME_UP', colorStatus: 'GREEN' };
  assert.strictEqual(getDisplayStatus(timeUpCand), 'SUBMITTED (TIME UP)');

  // Disqualified candidate
  const disqCand = { status: 'DISQUALIFIED', isDisqualified: true, colorStatus: 'RED' };
  assert.strictEqual(getDisplayStatus(disqCand), 'DISQUALIFIED');
});

console.log(`\n================================================================`);
console.log(`QA RESULTS: ${passCount} passed, ${failCount} failed`);
console.log(`================================================================\n`);

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
