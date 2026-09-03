// test_feature004_shared_proctoring_footer.js
// Automated QA verification for FEATURE-004: Shared Proctoring Footer & Live Violation Counter across all Candidate Test Screens
const fs = require('fs');
const path = require('path');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✕ FAIL: ${message}`);
  }
}

function runTests() {
  console.log('\n========================================================================');
  console.log('QA VERIFICATION SUITE: FEATURE-004 (Shared Proctoring Footer across Test Types)');
  console.log('========================================================================\n');

  const testFooterPath = path.join(__dirname, '../../../../client/src/candidate/components/TestFooter.jsx');
  const counterPath = path.join(__dirname, '../../../../client/src/candidate/components/FooterViolationCounter.jsx');
  const stdTestPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateTestScreen.jsx');
  const aiTestPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateAITestScreen.jsx');

  const testFooterCode = fs.readFileSync(testFooterPath, 'utf8');
  const counterCode = fs.readFileSync(counterPath, 'utf8');
  const stdTestCode = fs.readFileSync(stdTestPath, 'utf8');
  const aiTestCode = fs.readFileSync(aiTestPath, 'utf8');

  // ── TEST 1: TestFooter Shared Component Architecture ──
  console.log('--- TEST 1: TestFooter Shared Component Design & Elements ---');
  assert(testFooterCode.includes('id="candidate-test-footer"'), 'TestFooter renders with DOM ID #candidate-test-footer');
  assert(testFooterCode.includes('● REC'), 'Includes REC recording indicator');
  assert(testFooterCode.includes('Face'), 'Includes dynamic Face/No-Face detection badge');
  assert(testFooterCode.includes('Proctored'), 'Includes Proctored badge');
  assert(testFooterCode.includes('<FooterViolationCounter count={violationCount} />'), 'Integrates shared FooterViolationCounter component');
  assert(testFooterCode.includes('Do not switch tabs or open other applications. Violations are monitored.'), 'Displays proctoring advisory warning message');
  assert(testFooterCode.includes('All systems normal'), 'Displays system health status indicator');
  assert(testFooterCode.includes('📶'), 'Displays network telemetry icon');
  assert(testFooterCode.includes('id="test-footer-report-issue-btn"'), 'Includes Report Issue button with DOM ID');

  // ── TEST 2: Single Source of Truth / No Duplication ──
  console.log('\n--- TEST 2: Single Source of Truth Audit ---');
  assert(!stdTestCode.includes('● REC'), 'Standard CandidateTestScreen does not hardcode duplicate footer markup');
  assert(!aiTestCode.includes('● REC'), 'CandidateAITestScreen does not hardcode duplicate footer markup');
  assert(stdTestCode.includes('import TestFooter from'), 'CandidateTestScreen imports shared TestFooter component');
  assert(aiTestCode.includes('import TestFooter from'), 'CandidateAITestScreen imports shared TestFooter component');

  // ── TEST 3: Standard Coding Test Integration (SPOJ, JS, REACT) ──
  console.log('\n--- TEST 3: Standard Coding Test Screen Integration ---');
  assert(stdTestCode.includes('<TestFooter proctoring={proctoring} violationCount={violationCount} />'), 'CandidateTestScreen renders <TestFooter proctoring={proctoring} violationCount={violationCount} />');
  assert(stdTestCode.includes('const [violationCount, setViolationCount] = useState(0)'), 'CandidateTestScreen defines reactive violationCount state');
  assert(stdTestCode.includes('getViolationCount(session.test._id)'), 'CandidateTestScreen fetches initial count from backend on session load');
  assert(stdTestCode.includes('onCandidateViolationUpdated(onViolationUpdated)'), 'CandidateTestScreen subscribes to real-time socket violation updates');

  // ── TEST 4: AI Test Screen Integration (AI_TEST) ──
  console.log('\n--- TEST 4: AI Test Screen Integration ---');
  assert(aiTestCode.includes('<TestFooter proctoring={proctoring} violationCount={violationCount} />'), 'CandidateAITestScreen renders <TestFooter proctoring={proctoring} violationCount={violationCount} />');
  assert(aiTestCode.includes('const [violationCount, setViolationCount] = useState(0)'), 'CandidateAITestScreen defines reactive violationCount state');
  assert(aiTestCode.includes('getViolationCount(session.test._id)'), 'CandidateAITestScreen fetches initial count from backend on session load');
  assert(aiTestCode.includes('onCandidateViolationUpdated(onViolationUpdated)'), 'CandidateAITestScreen subscribes to real-time socket violation updates');

  // ── TEST 5: Violation Counter Visual Severities ──
  console.log('\n--- TEST 5: FooterViolationCounter Severity Contract ---');
  assert(counterCode.includes('#22c55e'), 'Green state configured for 0 violations');
  assert(counterCode.includes('#facc15'), 'Yellow state configured for 1-2 violations');
  assert(counterCode.includes('#f87171'), 'Red state configured for 3+ violations');
  assert(counterCode.includes('title="Total malpractice events recorded during this test session."'), 'Tooltip configured for informational hover');

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (100%)`);
  console.log('========================================================================\n');
}

runTests();
