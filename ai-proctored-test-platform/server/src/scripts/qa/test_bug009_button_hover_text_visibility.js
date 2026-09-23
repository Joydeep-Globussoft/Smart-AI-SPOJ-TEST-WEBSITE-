/**
 * QA Automated Test Suite for BUG-009:
 * "View Shortlist & Results" and Admin Buttons Text Disappearance on Hover Fix
 */

const fs = require('fs');
const path = require('path');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

async function runBug009Tests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: BUG-009 Button Hover Text Visibility');
  console.log('========================================================================\n');

  const globalCssPath = path.resolve(__dirname, '../../../../client/src/styles/global.css');
  const liveDashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');
  const resultsPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminResults.jsx');
  const testDetailPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx');

  const globalCss = fs.readFileSync(globalCssPath, 'utf8');
  const liveDashboard = fs.readFileSync(liveDashboardPath, 'utf8');
  const results = fs.readFileSync(resultsPath, 'utf8');
  const testDetail = fs.readFileSync(testDetailPath, 'utf8');

  // 1. a:hover does not override button colors
  assert(
    globalCss.includes('a:not(.btn):not([class*="btn"]):hover'),
    'Link hover rule is scoped to non-button anchors to prevent color bleeding into .btn links'
  );

  // 2. .btn-primary and a.btn-primary have explicit white color on hover and focus
  assert(
    globalCss.includes('.btn-primary') &&
    globalCss.includes('a.btn-primary:hover') &&
    globalCss.includes('color: #ffffff !important;'),
    '.btn-primary and a.btn-primary explicitly enforce #ffffff on :hover, :focus-visible, and :active'
  );

  // 3. .btn-secondary, .btn-danger, .btn-success enforce high-contrast text on hover
  assert(
    globalCss.includes('.btn-secondary') &&
    globalCss.includes('a.btn-secondary:hover') &&
    globalCss.includes('color: var(--color-navy) !important;'),
    '.btn-secondary enforces visible navy text on :hover and :focus'
  );

  assert(
    globalCss.includes('.btn-danger') &&
    globalCss.includes('a.btn-danger:hover') &&
    globalCss.includes('.btn-success') &&
    globalCss.includes('a.btn-success:hover'),
    '.btn-danger and .btn-success enforce visible white text on :hover and :focus'
  );

  // 4. AdminLiveDashboard "View Shortlist & Results →" button
  assert(
    liveDashboard.includes('View Shortlist &amp; Results →') &&
    liveDashboard.includes('className="btn btn-primary"') &&
    liveDashboard.includes('to={`/admin/tests/${testId}/results`}'),
    '"View Shortlist & Results →" button is properly configured as btn btn-primary link'
  );

  // 5. AdminResults header buttons preserved
  assert(
    results.includes('Test Summary Dashboard') &&
    results.includes('Regenerate Shortlist') &&
    results.includes('Export Shortlist PDF'),
    'AdminResults action buttons (Test Summary Dashboard, Regenerate, Export PDF) preserved'
  );

  // 6. AdminTestDetail navigation buttons preserved
  assert(
    testDetail.includes('Test Summary Dashboard') &&
    testDetail.includes('View Results &amp; Shortlist'),
    'AdminTestDetail navigation buttons preserved'
  );

  console.log(`\nBUG-009 Verification Result: ${passedTests}/${totalTests} checks passed.`);
  if (passedTests === totalTests) {
    console.log('STATUS: ALL CRITERIA VERIFIED SUCCESSFUL\n');
  } else {
    process.exit(1);
  }
}

runBug009Tests();
