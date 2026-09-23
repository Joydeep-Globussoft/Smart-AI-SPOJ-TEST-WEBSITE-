/**
 * QA Test Suite for FEATURE-026:
 * Navigation from Results & Shortlist page to Test Summary Dashboard
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
  }
}

async function execute() {
  console.log('\n======================================================');
  console.log('FEATURE-026 TEST SUITE: Navigation between Results & Summary Dashboard');
  console.log('======================================================\n');

  // 1. AdminResults.jsx has the Test Summary Dashboard button in the header
  runTest('AdminResults.jsx includes direct "Test Summary Dashboard" button linked to /admin/tests/${testId}/live', () => {
    const resultsCode = fs.readFileSync(
      path.resolve(__dirname, '../../../../client/src/admin/pages/AdminResults.jsx'),
      'utf-8'
    );
    assert(
      resultsCode.includes('to={`/admin/tests/${testId}/live`}'),
      'Direct link to /admin/tests/${testId}/live exists'
    );
    assert(
      resultsCode.includes('Test Summary Dashboard'),
      'Button label "Test Summary Dashboard" exists'
    );
  });

  // 2. Breadcrumbs on AdminResults.jsx are confirmed and link to Test Detail
  runTest('AdminResults.jsx breadcrumbs link to All Tests and Test Detail page', () => {
    const resultsCode = fs.readFileSync(
      path.resolve(__dirname, '../../../../client/src/admin/pages/AdminResults.jsx'),
      'utf-8'
    );
    assert(resultsCode.includes('to="/admin/tests"'), 'Breadcrumb links to /admin/tests');
    assert(resultsCode.includes('to={`/admin/tests/${testId}`}'), 'Breadcrumb links to /admin/tests/${testId}');
    assert(resultsCode.includes('{test?.title || \'Test\'}'), 'Breadcrumb displays dynamic test title');
  });

  // 3. AdminTestDetail.jsx retains both navigation buttons
  runTest('AdminTestDetail.jsx retains both Test Summary Dashboard and View Results & Shortlist buttons', () => {
    const detailCode = fs.readFileSync(
      path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx'),
      'utf-8'
    );
    assert(
      detailCode.includes('to={`/admin/tests/${test._id}/live`}'),
      'Test Detail links to /live'
    );
    assert(
      detailCode.includes('to={`/admin/tests/${test._id}/results`}'),
      'Test Detail links to /results'
    );
    assert(
      detailCode.includes('Test Summary Dashboard'),
      'Test Detail has Test Summary Dashboard button'
    );
    assert(
      detailCode.includes('View Results &amp; Shortlist'),
      'Test Detail has View Results & Shortlist button'
    );
  });

  // 4. Non-regression: AdminResults retains Regenerate, Export PDF, and shared CandidateDetailEvaluationModal
  runTest('AdminResults.jsx preserves all other actions and shared modal functionality', () => {
    const resultsCode = fs.readFileSync(
      path.resolve(__dirname, '../../../../client/src/admin/pages/AdminResults.jsx'),
      'utf-8'
    );
    assert(resultsCode.includes('Apply & Recalculate Shortlist'), 'Apply & Recalculate Shortlist button preserved');
    assert(resultsCode.includes('Export Shortlist PDF'), 'Export Shortlist PDF button preserved');
    assert(resultsCode.includes('CandidateDetailEvaluationModal'), 'CandidateDetailEvaluationModal preserved');
    assert(resultsCode.includes('Detail Evaluation'), 'Detail Evaluation shortlist button preserved');
  });

  console.log(`\n======================================================`);
  console.log(`RESULTS: ${passedTests}/${totalTests} Passed`);
  console.log(`======================================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

execute().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
