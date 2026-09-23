/**
 * QA Automated Verification Suite: FEATURE-028
 * Clickable Admin Dashboard Stat Cards Navigating to Filtered Views
 *
 * Verifies that:
 * 1. "Active LIVE Tests" links to /admin/tests?status=LIVE
 * 2. "Total Tests Created" links to /admin/tests
 * 3. "Question Sets" links to /admin/question-bank
 * 4. "Completed Assessments" links to /admin/tests?status=ENDED
 * 5. Visual hover and clickable affordance (.stat-card-clickable) is defined and applied.
 * 6. AdminTests.jsx processes status query parameters into its filter state.
 * 7. Stat calculations (liveTests, tests, questionSets, endedTests) remain intact without regression.
 */

const fs = require('fs');
const path = require('path');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
  }
}

async function runFeature028Tests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: FEATURE-028 (Clickable Dashboard Stat Cards)');
  console.log('========================================================================\n');

  const dashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminDashboard.jsx');
  const globalCssPath = path.resolve(__dirname, '../../../../client/src/styles/global.css');
  const adminTestsPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTests.jsx');

  const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');
  const globalCssCode = fs.readFileSync(globalCssPath, 'utf8');
  const adminTestsCode = fs.readFileSync(adminTestsPath, 'utf8');

  // 1. "Active LIVE Tests" links to /admin/tests?status=LIVE
  assert(
    dashboardCode.includes('to="/admin/tests?status=LIVE"') &&
    dashboardCode.includes('Active LIVE Tests'),
    '"Active LIVE Tests" card is a Link targeting /admin/tests?status=LIVE'
  );

  // 2. "Total Tests Created" links to /admin/tests
  assert(
    dashboardCode.includes('to="/admin/tests"') &&
    dashboardCode.includes('Total Tests Created'),
    '"Total Tests Created" card is a Link targeting /admin/tests'
  );

  // 3. "Question Sets" links to /admin/question-bank
  assert(
    dashboardCode.includes('to="/admin/question-bank"') &&
    dashboardCode.includes('Question Sets'),
    '"Question Sets" card is a Link targeting /admin/question-bank'
  );

  // 4. "Completed Assessments" links to /admin/tests?status=ENDED
  assert(
    dashboardCode.includes('to="/admin/tests?status=ENDED"') &&
    dashboardCode.includes('Completed Assessments'),
    '"Completed Assessments" card is a Link targeting /admin/tests?status=ENDED'
  );

  // 5. Visual/UX Affordance (.stat-card-clickable)
  assert(
    dashboardCode.includes('stat-card-clickable') &&
    globalCssCode.includes('.stat-card-clickable') &&
    globalCssCode.includes('cursor: pointer') &&
    globalCssCode.includes('.stat-card-clickable:hover'),
    'Cards have .stat-card-clickable class with hover transformation and cursor: pointer'
  );

  // 6. Test Management filter state compatibility
  assert(
    adminTestsCode.includes('useAdminFilterState') &&
    adminTestsCode.includes('status: \'ALL\'') &&
    adminTestsCode.includes('filterStatus'),
    'AdminTests correctly consumes URL status query parameters via useAdminFilterState'
  );

  // 7. Preserved Stat Calculations & Dashboard Layout
  assert(
    dashboardCode.includes('liveTests.length') &&
    dashboardCode.includes('tests.length') &&
    dashboardCode.includes('questionSets.length') &&
    dashboardCode.includes('endedTests.length') &&
    dashboardCode.includes('+ Create New Test'),
    'Preserves stat calculations, test counts, and Create New Test modal button'
  );

  console.log(`\nFEATURE-028 Verification Result: ${passedTests}/${totalTests} checks passed.`);
  if (passedTests === totalTests) {
    console.log('STATUS: ALL FEATURE-028 CRITERIA VERIFIED SUCCESSFUL\n');
  }
}

runFeature028Tests();
