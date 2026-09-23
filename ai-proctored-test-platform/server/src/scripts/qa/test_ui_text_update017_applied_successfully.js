/**
 * QA Verification Suite for UI TEXT UPDATE-017:
 * Replace Success Toast Message with "Applied Successfully"
 *
 * Verifies:
 * 1. AdminResults.jsx displays "Applied Successfully" toast on threshold updates / shortlist recalculation.
 * 2. AdminResults.jsx does not expose internal requirement IDs (e.g. FR-10.1) or technical wording in user-facing toasts.
 * 3. All existing threshold update logic and shortlist refresh functionality remain preserved.
 */

const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: UI TEXT UPDATE-017 Applied Successfully');
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

  const resultsPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminResults.jsx');
  const resultsCode = fs.readFileSync(resultsPath, 'utf-8');

  // Check 1: "Applied Successfully" toast present
  assert(
    resultsCode.includes("toast.success('Applied Successfully')"),
    'AdminResults: Success toast displays "Applied Successfully"'
  );

  // Check 2: Technical FR-10.1 notification removed
  assert(
    !resultsCode.includes("Thresholds updated & shortlist re-calculated (FR-10.1)") &&
    !resultsCode.includes("re-calculated (FR-10.1)"),
    'AdminResults: Internal requirement ID "FR-10.1" and technical jargon removed from toast'
  );

  // Check 3: Functional threshold update preserved
  assert(
    resultsCode.includes('api.updatePassingCriteria(') &&
    resultsCode.includes('api.updateMalpracticeThreshold(') &&
    resultsCode.includes('api.getShortlist('),
    'AdminResults: Threshold update logic and shortlist refresh workflow preserved'
  );

  console.log('\n------------------------------------------------------------------------');
  console.log(`Results: ${passedTests} / ${totalTests} assertions passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('------------------------------------------------------------------------\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL UI TEXT UPDATE-017 QA CHECKS PASSED SUCCESSFULLY!\n');
  } else {
    console.error('⚠️ SOME QA CHECKS FAILED!\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running QA suite:', err);
  process.exit(1);
});
