/**
 * QA Test Suite: BUG/XX
 * Fix Incorrect Initial State When Inspecting Not-Started Candidate
 */

const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('========================================================================');
  console.log('   QA Test Suite: Candidate Inspection Not-Started Initial State       ');
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

  const proctoringControllerPath = path.join(__dirname, '../../../../server/src/controllers/proctoringController.js');
  const proctoringControllerCode = fs.readFileSync(proctoringControllerPath, 'utf-8');

  const roomControllerPath = path.join(__dirname, '../../../../server/src/controllers/roomController.js');
  const roomControllerCode = fs.readFileSync(roomControllerPath, 'utf-8');

  const liveDashboardPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');
  const liveDashboardCode = fs.readFileSync(liveDashboardPath, 'utf-8');

  // Check 1: proctoringController does not use candDoc.createdAt as candidateStartTime
  assert(
    !proctoringControllerCode.includes('candidateStartTime: subDoc?.candidateStartTime || candDoc?.createdAt'),
    'proctoringController: Removed candDoc.createdAt fallback for candidateStartTime in getCandidateMalpracticeLogs'
  );
  assert(
    proctoringControllerCode.includes('candidateStartTime: subDoc?.candidateStartTime || null'),
    'proctoringController: sessionTimestamps candidateStartTime is strictly subDoc.candidateStartTime || null'
  );

  // Check 2: roomController does not use sub.createdAt as candidateStartTime
  assert(
    !roomControllerCode.includes('candidateStartTime: sub.candidateStartTime || sub.createdAt'),
    'roomController: Removed sub.createdAt fallback for candidateStartTime in getRoomCandidates'
  );

  // Check 3: AdminLiveDashboard normalize on open inspect
  assert(
    liveDashboardCode.includes('const isStarted = Boolean(cand.candidateStartTime || cand.startedAt);') &&
    liveDashboardCode.includes("status = isDisqualified ? 'DISQUALIFIED' : isSubmitted ? (cand.status || 'SUBMITTED') : isStarted ? (cand.status || 'IN_PROGRESS') : 'NOT_STARTED'"),
    'AdminLiveDashboard: handleOpenInspectCandidate normalizes unstarted candidates to NOT_STARTED immediately'
  );

  // Check 4: Modal badge rendering does not output raw 'WHITE'
  assert(
    liveDashboardCode.includes("displayStatus = 'NOT_STARTED'") &&
    !liveDashboardCode.includes("(activeInspectCandidate.status || inspectColorStatus || 'ACTIVE')"),
    'AdminLiveDashboard: Modal badge renders authoritative NOT_STARTED label instead of raw WHITE'
  );

  // Check 5: Questions Solved shows '—' for unstarted candidate
  assert(
    liveDashboardCode.includes("activeInspectCandidate.status === 'NOT_STARTED' || (!activeInspectCandidate.candidateStartTime && activeInspectCandidate.status !== 'SUBMITTED' && activeInspectCandidate.status !== 'IN_PROGRESS')") &&
    liveDashboardCode.includes("? '—'"),
    'AdminLiveDashboard: Questions Solved shows "—" for unstarted candidates'
  );

  // Check 6: Extract helper functions and test behavioral edge cases
  const normalizedCode = liveDashboardCode.replace(/\r\n/g, '\n');
  const matchFn1 = normalizedCode.match(/const getCandidateRemainingMs = \([\s\S]*?\n\};/);
  const matchFn2 = normalizedCode.match(/const formatCandidateRemainingTime = \([\s\S]*?\n\};/);
  const matchFn3 = normalizedCode.match(/const getCandidateTimeSpent = \([\s\S]*?\n\};/);
  const matchFn4 = normalizedCode.match(/const getCandidateInspectionTimeInfo = \([\s\S]*?\n\};/);

  assert(Boolean(matchFn1 && matchFn2 && matchFn3 && matchFn4), 'Extracted all 4 time helper functions from live dashboard');

  const bundleCode = `
    ${matchFn1[0]}
    ${matchFn2[0]}
    ${matchFn3[0]}
    ${matchFn4[0]}
    return { getCandidateRemainingMs, formatCandidateRemainingTime, getCandidateTimeSpent, getCandidateInspectionTimeInfo };
  `;
  const factory = new Function(bundleCode);
  const fns = factory();
  const getCandidateRemainingMs = fns.getCandidateRemainingMs;
  const getCandidateInspectionTimeInfo = fns.getCandidateInspectionTimeInfo;

  const now = Date.now();

  // Test Case A: Candidate NOT STARTED (colorStatus: 'WHITE', candidateStartTime: null, status: 'NOT_STARTED')
  const candNotStartedA = {
    name: 'Ramesh',
    status: 'NOT_STARTED',
    colorStatus: 'WHITE',
    candidateStartTime: null,
    candidateEndTime: null,
    questionsCompleted: 0,
  };
  const infoNotStartedA = getCandidateInspectionTimeInfo(candNotStartedA, now, false, 30);
  assert(infoNotStartedA.label === 'Time Spent:', `Not started candidate has label "Time Spent:" (got: ${infoNotStartedA.label})`);
  assert(infoNotStartedA.value === '—', `Not started candidate has value "—" (got: ${infoNotStartedA.value})`);
  const remMsNotStartedA = getCandidateRemainingMs(candNotStartedA, now, 30);
  assert(remMsNotStartedA === 0, `Not started candidate remaining time is 0ms (got: ${remMsNotStartedA}ms)`);

  // Test Case B: Candidate object from seatmap without explicit status field before start
  const candNotStartedB = {
    name: 'Hi',
    colorStatus: 'WHITE',
    candidateStartTime: null,
    candidateEndTime: null,
    questionsCompleted: 0,
  };
  const infoNotStartedB = getCandidateInspectionTimeInfo(candNotStartedB, now, false, 30);
  assert(infoNotStartedB.label === 'Time Spent:', `Unstarted candidate without status field has label "Time Spent:" (got: ${infoNotStartedB.label})`);
  assert(infoNotStartedB.value === '—', `Unstarted candidate without status field has value "—" (got: ${infoNotStartedB.value})`);
  const remMsNotStartedB = getCandidateRemainingMs(candNotStartedB, now, 30);
  assert(remMsNotStartedB === 0, `Unstarted candidate remaining time is 0ms (got: ${remMsNotStartedB}ms)`);

  // Test Case C: IN_PROGRESS candidate actively testing
  const candActive = {
    name: 'Dinesh',
    status: 'IN_PROGRESS',
    colorStatus: 'YELLOW',
    candidateStartTime: new Date(now - 1000 * 60 * 5), // 5 mins ago
    candidateEndTime: new Date(now + 1000 * 60 * 25), // 25 mins remaining
  };
  const infoActive = getCandidateInspectionTimeInfo(candActive, now, false, 30);
  assert(infoActive.label === 'Time Remaining:', `Active candidate shows "Time Remaining:" (got: ${infoActive.label})`);
  assert(infoActive.value === '25m 00s', `Active candidate shows "25m 00s" remaining (got: ${infoActive.value})`);

  // Test Case D: SUBMITTED candidate
  const candSubmitted = {
    name: 'Suresh',
    status: 'SUBMITTED',
    colorStatus: 'GREEN',
    candidateStartTime: new Date(now - 1000 * 60 * 20),
    submittedAt: new Date(now - 1000 * 60 * 5),
  };
  const infoSubmitted = getCandidateInspectionTimeInfo(candSubmitted, now, false, 30);
  assert(infoSubmitted.label === 'Time Spent:', `Submitted candidate shows "Time Spent:" (got: ${infoSubmitted.label})`);
  assert(infoSubmitted.value === '15m 00s', `Submitted candidate shows actual elapsed duration "15m 00s" (got: ${infoSubmitted.value})`);

  console.log('\n------------------------------------------------------------------------');
  console.log(`Results: ${passedTests} / ${totalTests} assertions passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('------------------------------------------------------------------------\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL NOT-STARTED INITIAL INSPECTION STATE TESTS PASSED SUCCESSFULLY!\n');
  } else {
    console.error('⚠️ SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error in QA runner:', err);
  process.exit(1);
});
