/**
 * QA Verification Suite for FEATURE:
 * Replace "Session Status: Test Ended" with Actual Time Spent by Candidate in Candidate Inspection & Evidence
 *
 * Verifies:
 * 1. AdminLiveDashboard renders "Time Spent:" label in Key Metrics Grid.
 * 2. AdminLiveDashboard removes "Session Status: Test Ended" and "Time Remaining:".
 * 3. getCandidateTimeSpent calculates actual candidate participation duration accurately:
 *    - Manual Submission (e.g., 1h 02m)
 *    - Short Duration (e.g., 18m 42s)
 *    - Auto Submission / Time Expired (e.g., 59m 59s)
 *    - Disqualified (e.g., 24m 18s)
 *    - Abandoned Session (e.g., 12m 03s)
 *    - Live In-Progress (e.g., 42m 11s dynamic counter)
 *    - Not Started (—)
 *    - Missing Timestamps (Unavailable)
 * 4. Submission status badge (SUBMITTED, SUBMITTED (TIME UP), DISQUALIFIED, etc.) is preserved.
 * 5. Backend proctoringController returns sessionTimestamps in getCandidateMalpracticeLogs.
 * 6. Backend roomController returns candidateStartTime, candidateEndTime, and submittedAt in getLiveCandidates & getRoomCandidates.
 * 7. Backend submissionController broadcasts submittedAt in candidate:submitted socket event.
 */

const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: Candidate Inspection & Evidence Time Spent');
  console.log('========================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  const liveDashboardPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');
  const proctoringControllerPath = path.join(__dirname, '../../controllers/proctoringController.js');
  const roomControllerPath = path.join(__dirname, '../../controllers/roomController.js');
  const submissionControllerPath = path.join(__dirname, '../../controllers/submissionController.js');

  const liveDashboardCode = fs.readFileSync(liveDashboardPath, 'utf-8');
  const proctoringControllerCode = fs.readFileSync(proctoringControllerPath, 'utf-8');
  const roomControllerCode = fs.readFileSync(roomControllerPath, 'utf-8');
  const submissionControllerCode = fs.readFileSync(submissionControllerPath, 'utf-8');

  // Check 1: Time Spent label rendered in Key Metrics Grid
  assert(
    liveDashboardCode.includes('inspect-candidate-time-spent-label') &&
    liveDashboardCode.includes('Time Spent:'),
    'AdminLiveDashboard: Key Metrics Grid renders "Time Spent:" label'
  );

  // Check 2: "Session Status: Test Ended" is removed from modal grid
  assert(
    !liveDashboardCode.includes("{isTestEnded ? 'Session Status:' : 'Time Remaining:'}") &&
    !liveDashboardCode.includes(": 'Test Ended'"),
    'AdminLiveDashboard: "Session Status: Test Ended" removed from Key Metrics Grid'
  );

  // Check 3: getCandidateTimeSpent function implementation and extraction for testing
  assert(
    liveDashboardCode.includes('const getCandidateTimeSpent ='),
    'AdminLiveDashboard: Implements getCandidateTimeSpent function'
  );

  const normalizedCode = liveDashboardCode.replace(/\r\n/g, '\n');
  const fnMatch = normalizedCode.match(/const getCandidateTimeSpent = \([\s\S]*?\n\};/);
  assert(Boolean(fnMatch), 'AdminLiveDashboard: Successfully extracted getCandidateTimeSpent function');

  let getCandidateTimeSpent;
  if (fnMatch) {
    try {
      const fnCode = fnMatch[0] + '; return getCandidateTimeSpent;';
      const factory = new Function(fnCode);
      getCandidateTimeSpent = factory();
    } catch (err) {
      console.error('Failed to parse getCandidateTimeSpent:', err);
    }
  }

  if (getCandidateTimeSpent) {
    const baseT0 = 1774300000000; // arbitrary base timestamp

    // 3a. Manual Submission (1h 02m)
    const cand1 = {
      status: 'SUBMITTED',
      candidateStartTime: new Date(baseT0),
      submittedAt: new Date(baseT0 + (62 * 60 * 1000) + (15 * 1000)), // 1h 2m 15s
    };
    const res1 = getCandidateTimeSpent(cand1, baseT0 + 4000000, true);
    assert(res1 === '1h 02m', `Manual submission formatted duration (${res1} === '1h 02m')`);

    // 3b. Short Duration (18m 42s)
    const cand2 = {
      status: 'SUBMITTED',
      candidateStartTime: new Date(baseT0),
      submittedAt: new Date(baseT0 + (18 * 60 * 1000) + (42 * 1000)), // 18m 42s
    };
    const res2 = getCandidateTimeSpent(cand2, baseT0 + 2000000, true);
    assert(res2 === '18m 42s', `Short duration formatted (${res2} === '18m 42s')`);

    // 3c. Auto Submission (59m 59s)
    const cand3 = {
      status: 'AUTO_SUBMITTED_TIME_UP',
      candidateStartTime: new Date(baseT0),
      submittedAt: new Date(baseT0 + (59 * 60 * 1000) + (59 * 1000)), // 59m 59s
    };
    const res3 = getCandidateTimeSpent(cand3, baseT0 + 4000000, true);
    assert(res3 === '59m 59s', `Auto submission formatted (${res3} === '59m 59s')`);

    // 3d. Disqualified (24m 18s)
    const cand4 = {
      status: 'DISQUALIFIED',
      isDisqualified: true,
      candidateStartTime: new Date(baseT0),
      disqualifiedAt: new Date(baseT0 + (24 * 60 * 1000) + (18 * 1000)), // 24m 18s
    };
    const res4 = getCandidateTimeSpent(cand4, baseT0 + 4000000, true);
    assert(res4 === '24m 18s', `Disqualified duration formatted (${res4} === '24m 18s')`);

    // 3e. Abandoned Session (12m 03s)
    const cand5 = {
      status: 'IN_PROGRESS',
      candidateStartTime: new Date(baseT0),
      candidateEndTime: new Date(baseT0 + (12 * 60 * 1000) + (3 * 1000)),
    };
    const res5 = getCandidateTimeSpent(cand5, baseT0 + 5000000, true);
    assert(res5 === '12m 03s', `Abandoned / ended session formatted (${res5} === '12m 03s')`);

    // 3f. Live In-Progress (42m 11s)
    const cand6 = {
      status: 'IN_PROGRESS',
      candidateStartTime: new Date(baseT0),
      candidateEndTime: new Date(baseT0 + (90 * 60 * 1000)),
    };
    const res6 = getCandidateTimeSpent(cand6, baseT0 + (42 * 60 * 1000) + (11 * 1000), false);
    assert(res6 === '42m 11s', `Live in-progress dynamic counter formatted (${res6} === '42m 11s')`);

    // 3g. Not Started (—)
    const cand7 = {
      status: 'NOT_STARTED',
      candidateStartTime: null,
    };
    const res7 = getCandidateTimeSpent(cand7, baseT0, false);
    assert(res7 === '—', `Not started candidate formatted (${res7} === '—')`);

    // 3h. Unavailable on missing start timestamp
    const cand8 = {
      status: 'SUBMITTED',
      candidateStartTime: null,
      submittedAt: null,
    };
    const res8 = getCandidateTimeSpent(cand8, baseT0, true);
    assert(res8 === 'Unavailable', `Missing timestamps fallback (${res8} === 'Unavailable')`);
  }

  // Check 4: Submission status badges preserved in header
  assert(
    liveDashboardCode.includes("activeInspectCandidate.status === 'AUTO_SUBMITTED_TIME_UP'") &&
    liveDashboardCode.includes("SUBMITTED (TIME UP)") &&
    liveDashboardCode.includes("className=\"badge\""),
    'AdminLiveDashboard: Preserved submission status badges (SUBMITTED, AUTO_SUBMITTED_TIME_UP, DISQUALIFIED)'
  );

  // Check 5: Backend proctoringController returns sessionTimestamps
  assert(
    proctoringControllerCode.includes('sessionTimestamps:') &&
    proctoringControllerCode.includes('candidateStartTime: subDoc?.candidateStartTime') &&
    proctoringControllerCode.includes('submittedAt: subDoc?.submittedAt'),
    'proctoringController: getCandidateMalpracticeLogs returns sessionTimestamps'
  );

  // Check 6: Backend roomController returns candidateStartTime, candidateEndTime, submittedAt
  assert(
    roomControllerCode.includes('candidateStartTime: timers.startTime || null') &&
    roomControllerCode.includes('submittedAt: timers.submittedAt || null') &&
    (roomControllerCode.includes('candidateStartTime: sub.candidateStartTime || null') || roomControllerCode.includes('candidateStartTime: sub.candidateStartTime || sub.createdAt || null')),
    'roomController: getLiveCandidates and getRoomCandidates populate session timestamps'
  );

  // Check 7: Backend submissionController emits submittedAt on candidate:submitted
  assert(
    submissionControllerCode.includes("io.to(`test:${testId}:admin`).emit('candidate:submitted'") &&
    submissionControllerCode.includes('submittedAt: now') &&
    submissionControllerCode.includes('submittedAt: autoNow'),
    'submissionController: candidate:submitted emits submittedAt timestamp'
  );

  console.log('\n------------------------------------------------------------------------');
  console.log(`Results: ${passedTests} / ${totalTests} assertions passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('------------------------------------------------------------------------\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL CANDIDATE INSPECTION TIME SPENT QA CHECKS PASSED SUCCESSFULLY!\n');
  } else {
    console.error('⚠️ SOME QA CHECKS FAILED!\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running QA suite:', err);
  process.exit(1);
});
