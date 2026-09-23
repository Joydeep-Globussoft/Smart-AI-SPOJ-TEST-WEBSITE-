/**
 * QA Test Suite: BUG/UX-XX
 * Show Time Remaining During Live Test and Time Spent After Completion
 * in Candidate Inspection & Evidence Modal
 */

const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('===============================================================');
  console.log('   QA Test Suite: Candidate Inspection Live Remaining vs Spent Time   ');
  console.log('===============================================================\n');

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
  const liveDashboardCode = fs.readFileSync(liveDashboardPath, 'utf-8');

  // 1. Check helper function definitions in AdminLiveDashboard.jsx
  assert(
    liveDashboardCode.includes('const getCandidateInspectionTimeInfo ='),
    'AdminLiveDashboard: Implements getCandidateInspectionTimeInfo'
  );
  assert(
    liveDashboardCode.includes('const formatCandidateRemainingTime ='),
    'AdminLiveDashboard: Implements formatCandidateRemainingTime'
  );
  assert(
    liveDashboardCode.includes('const getCandidateTimeSpent ='),
    'AdminLiveDashboard: Implements getCandidateTimeSpent'
  );

  // 2. Check JSX usage in Candidate Inspection Modal
  assert(
    liveDashboardCode.includes('id="inspect-candidate-time-spent-label"') &&
    liveDashboardCode.includes('{timeInfo.label}') &&
    liveDashboardCode.includes('id="inspect-candidate-time-spent-val"') &&
    liveDashboardCode.includes('{timeInfo.value}'),
    'AdminLiveDashboard: Modal Key Metrics Grid renders dynamic timeInfo label and value'
  );

  // Extract functions for behavior testing
  const normalizedCode = liveDashboardCode.replace(/\r\n/g, '\n');
  const matchFn1 = normalizedCode.match(/const getCandidateRemainingMs = \([\s\S]*?\n\};/);
  const matchFn2 = normalizedCode.match(/const formatCandidateRemainingTime = \([\s\S]*?\n\};/);
  const matchFn3 = normalizedCode.match(/const getCandidateTimeSpent = \([\s\S]*?\n\};/);
  const matchFn4 = normalizedCode.match(/const getCandidateInspectionTimeInfo = \([\s\S]*?\n\};/);

  assert(Boolean(matchFn1 && matchFn2 && matchFn3 && matchFn4), 'Extracted all 4 time helper functions');

  let getCandidateRemainingMs, formatCandidateRemainingTime, getCandidateTimeSpent, getCandidateInspectionTimeInfo;
  if (matchFn1 && matchFn2 && matchFn3 && matchFn4) {
    const bundleCode = `
      ${matchFn1[0]}
      ${matchFn2[0]}
      ${matchFn3[0]}
      ${matchFn4[0]}
      return { getCandidateRemainingMs, formatCandidateRemainingTime, getCandidateTimeSpent, getCandidateInspectionTimeInfo };
    `;
    const factory = new Function(bundleCode);
    const fns = factory();
    getCandidateRemainingMs = fns.getCandidateRemainingMs;
    formatCandidateRemainingTime = fns.formatCandidateRemainingTime;
    getCandidateTimeSpent = fns.getCandidateTimeSpent;
    getCandidateInspectionTimeInfo = fns.getCandidateInspectionTimeInfo;
  }

  const baseT0 = 1774300000000;

  // Case 1: LIVE test + candidate actively attempting (e.g. 27m 48s remaining)
  const candLiveActive = {
    status: 'IN_PROGRESS',
    candidateStartTime: new Date(baseT0),
    candidateEndTime: new Date(baseT0 + (30 * 60 * 1000)), // 30m total duration
  };
  const now1 = baseT0 + (2 * 60 * 1000) + (12 * 1000); // 2m 12s elapsed -> 27m 48s remaining
  const info1 = getCandidateInspectionTimeInfo(candLiveActive, now1, false, 30);
  assert(info1.label === 'Time Remaining:', `Live active candidate shows "Time Remaining:" (${info1.label})`);
  assert(info1.value === '27m 48s', `Live active candidate shows correct remaining time 27m 48s (${info1.value})`);

  // Case 2: LIVE test + candidate actively attempting with short time (2m 12s remaining)
  const now2 = baseT0 + (27 * 60 * 1000) + (48 * 1000); // 27m 48s elapsed -> 2m 12s remaining
  const info2 = getCandidateInspectionTimeInfo(candLiveActive, now2, false, 30);
  assert(info2.label === 'Time Remaining:', `Live active candidate shows "Time Remaining:" (${info2.label})`);
  assert(info2.value === '2m 12s', `Live active candidate shows correct remaining time 2m 12s (${info2.value})`);

  // Case 3: LIVE test + candidate timer reaches 0 but status still IN_PROGRESS (edge case: no negative values)
  const now3 = baseT0 + (32 * 60 * 1000); // past candidateEndTime
  const info3 = getCandidateInspectionTimeInfo(candLiveActive, now3, false, 30);
  assert(info3.label === 'Time Remaining:', `Expired active candidate shows "Time Remaining:" (${info3.label})`);
  assert(info3.value === '0s', `Expired active candidate shows "0s" without negative numbers (${info3.value})`);

  // Case 4: Candidate submits before natural test end during LIVE test (e.g. submitted at 18m 42s)
  const candEarlySubmit = {
    status: 'SUBMITTED',
    candidateStartTime: new Date(baseT0),
    candidateEndTime: new Date(baseT0 + (30 * 60 * 1000)),
    submittedAt: new Date(baseT0 + (18 * 60 * 1000) + (42 * 1000)),
  };
  const now4 = baseT0 + (25 * 60 * 1000);
  const info4 = getCandidateInspectionTimeInfo(candEarlySubmit, now4, false, 30);
  assert(info4.label === 'Time Spent:', `Early submitted candidate immediately switches to "Time Spent:" (${info4.label})`);
  assert(info4.value === '18m 42s', `Early submitted candidate shows actual elapsed duration 18m 42s (${info4.value})`);

  // Case 5: Candidate auto-submitted (Time Up)
  const candTimeUpSubmit = {
    status: 'AUTO_SUBMITTED_TIME_UP',
    candidateStartTime: new Date(baseT0),
    candidateEndTime: new Date(baseT0 + (30 * 60 * 1000)),
    submittedAt: new Date(baseT0 + (30 * 60 * 1000)),
  };
  const info5 = getCandidateInspectionTimeInfo(candTimeUpSubmit, now4, false, 30);
  assert(info5.label === 'Time Spent:', `Auto-submitted candidate shows "Time Spent:" (${info5.label})`);
  assert(info5.value === '30m 00s', `Auto-submitted candidate shows duration 30m 00s (${info5.value})`);

  // Case 6: Candidate Disqualified during LIVE test
  const candDisqualified = {
    status: 'DISQUALIFIED',
    isDisqualified: true,
    candidateStartTime: new Date(baseT0),
    disqualifiedAt: new Date(baseT0 + (24 * 60 * 1000) + (18 * 1000)),
  };
  const info6 = getCandidateInspectionTimeInfo(candDisqualified, now4, false, 30);
  assert(info6.label === 'Time Spent:', `Disqualified candidate shows "Time Spent:" (${info6.label})`);
  assert(info6.value === '24m 18s', `Disqualified candidate shows duration 24m 18s (${info6.value})`);

  // Case 7: Test has ENDED (isTestEnded = true) -> Always shows "Time Spent:"
  const candPostTestEnd = {
    status: 'IN_PROGRESS',
    candidateStartTime: new Date(baseT0),
    candidateEndTime: new Date(baseT0 + (42 * 60 * 1000) + (12 * 1000)),
  };
  const info7 = getCandidateInspectionTimeInfo(candPostTestEnd, baseT0 + 3600000, true, 30);
  assert(info7.label === 'Time Spent:', `Concluded test shows "Time Spent:" (${info7.label})`);
  assert(info7.value === '42m 12s', `Concluded test shows actual time spent 42m 12s (${info7.value})`);

  // Case 8: Candidate NOT STARTED during LIVE test
  const candNotStarted = {
    status: 'NOT_STARTED',
    candidateStartTime: null,
  };
  const info8 = getCandidateInspectionTimeInfo(candNotStarted, now1, false, 30);
  assert(info8.label === 'Time Spent:', `Not started candidate shows "Time Spent:" (${info8.label})`);
  assert(info8.value === '—', `Not started candidate shows "—" (${info8.value})`);

  console.log('\n---------------------------------------------------------------');
  console.log(`Results: ${passedTests} / ${totalTests} assertions passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('---------------------------------------------------------------\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL CANDIDATE INSPECTION TIME TESTS PASSED SUCCESSFULLY!\n');
  } else {
    console.error('⚠️ SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
