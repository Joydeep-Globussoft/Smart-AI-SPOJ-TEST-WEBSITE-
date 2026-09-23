/**
 * QA Test Suite: BUG/UX-XX
 * Fix Hidden Warning Button Visibility in Dark Mode (Real-Time Malpractice Alert Modal)
 */

const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('===============================================================');
  console.log('   QA Test Suite: Malpractice Alert Warning Button Visibility  ');
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
  const globalCssPath = path.join(__dirname, '../../../../client/src/styles/global.css');

  const liveDashboardCode = fs.readFileSync(liveDashboardPath, 'utf-8');
  const globalCssCode = fs.readFileSync(globalCssPath, 'utf-8');

  // 1. Verify global.css .btn-warning styling
  assert(
    globalCssCode.includes('.btn-warning') &&
    globalCssCode.includes('background: #f59e0b;') &&
    globalCssCode.includes('color: #ffffff !important;'),
    'global.css: .btn-warning has high-contrast #f59e0b background and #ffffff text'
  );

  // 2. Verify Real-Time Malpractice Alert modal Warn Candidate button
  assert(
    liveDashboardCode.includes('id="alert-warn-candidate-btn"') &&
    liveDashboardCode.includes('className="btn btn-warning"'),
    'AdminLiveDashboard: Real-Time Malpractice Alert uses "btn btn-warning" class for Warn button'
  );

  // 3. Verify removal of conflicting/washed-out #fffbeb from alert button
  const alertSectionMatch = liveDashboardCode.match(/\{activeAlert && \([\s\S]*?\n        \)\}/);
  assert(Boolean(alertSectionMatch), 'AdminLiveDashboard: Found activeAlert modal section');
  if (alertSectionMatch) {
    const alertModalCode = alertSectionMatch[0];
    assert(
      !alertModalCode.includes('#fffbeb'),
      'AdminLiveDashboard: activeAlert modal does NOT contain washed-out #fffbeb background'
    );
    assert(
      alertModalCode.includes('⚠️ Warn Candidate'),
      'AdminLiveDashboard: Warn Candidate button text and icon preserved'
    );
    assert(
      alertModalCode.includes('handleReviewMalpractice') && alertModalCode.includes('handleManualWarn'),
      'AdminLiveDashboard: Warn Candidate click handlers and logic fully preserved'
    );
    assert(
      alertModalCode.includes('🚫 Disqualify') && alertModalCode.includes('Dismiss'),
      'AdminLiveDashboard: Disqualify and Dismiss buttons preserved unchanged'
    );
  }

  console.log('\n---------------------------------------------------------------');
  console.log(`Results: ${passedTests} / ${totalTests} assertions passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('---------------------------------------------------------------\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL MALPRACTICE ALERT WARNING BUTTON TESTS PASSED SUCCESSFULLY!\n');
  } else {
    console.error('⚠️ SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
