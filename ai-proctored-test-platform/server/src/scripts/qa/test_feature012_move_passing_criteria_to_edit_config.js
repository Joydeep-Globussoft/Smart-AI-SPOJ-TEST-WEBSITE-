/**
 * QA Verification Suite for FEATURE-012:
 * Move Passing Criteria Configuration into "Edit Test Configuration" and
 * Remove Duplicate Criteria Panels from Manage Test Page.
 *
 * Verifies:
 * 1. "Passing Criteria (FR-2.2)" card is completely removed from AdminTestDetail.jsx.
 * 2. "Malpractice Disqualification Threshold (FR-2.3)" card is completely removed from AdminTestDetail.jsx.
 * 3. Configuration Details card displays "Passing Criteria" with correct value.
 * 4. "Edit Test Configuration" modal contains the "Passing Criteria (Minimum Questions to Pass)" numeric input (#edit-passing-criteria).
 * 5. Pre-populates existing passing criteria from test model.
 * 6. Validates passing criteria cannot exceed totalQuestions in both client and backend (updateTest).
 * 7. Results & Shortlist page (AdminResults.jsx) preserves passing criteria and malpractice threshold controls for post-test recalculation.
 * 8. Backend updateTest accepts and persists passingCriteria.
 */

const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: FEATURE-012 Move Passing Criteria to Edit Config');
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

  const testDetailPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx');
  const resultsPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminResults.jsx');
  const testControllerPath = path.join(__dirname, '../../controllers/testController.js');
  const testModelPath = path.join(__dirname, '../../models/Test.js');

  const testDetailCode = fs.readFileSync(testDetailPath, 'utf-8');
  const resultsCode = fs.readFileSync(resultsPath, 'utf-8');
  const testControllerCode = fs.readFileSync(testControllerPath, 'utf-8');
  const testModelCode = fs.readFileSync(testModelPath, 'utf-8');

  // Check 1: Removal of Passing Criteria card from AdminTestDetail
  assert(
    !testDetailCode.includes('Passing Criteria (FR-2.2)') &&
    !testDetailCode.includes('handleUpdatePassingCriteria'),
    'Passing Criteria (FR-2.2) card and handler removed from Manage Test page'
  );

  // Check 2: Removal of Malpractice Disqualification Threshold card from AdminTestDetail
  assert(
    !testDetailCode.includes('Malpractice Disqualification Threshold (FR-2.3)') &&
    !testDetailCode.includes('handleUpdateMalpracticeThreshold'),
    'Malpractice Disqualification Threshold (FR-2.3) card and handler removed from Manage Test page'
  );

  // Check 3: Configuration Details card displays Passing Criteria row
  assert(
    testDetailCode.includes('Passing Criteria') &&
    testDetailCode.includes('test.passingCriteria ?? 0') &&
    testDetailCode.includes('Configuration Details'),
    'Configuration Details card displays dynamic Passing Criteria row'
  );

  // Check 4: Edit modal contains #edit-passing-criteria input with label and helper text
  assert(
    testDetailCode.includes('id="edit-passing-criteria"') &&
    testDetailCode.includes('Passing Criteria (Minimum Questions to Pass) *') &&
    testDetailCode.includes('Candidates must solve at least this many questions to qualify for the shortlist.'),
    'Edit modal renders Passing Criteria (Minimum Questions to Pass) input with helper text'
  );

  // Check 5: Edit modal pre-populates passingCriteria and updates on folder change
  assert(
    testDetailCode.includes('passingCriteria: test?.passingCriteria ?? 0') &&
    testDetailCode.includes('passingCriteria: p.passingCriteria > qCount ? qCount : p.passingCriteria'),
    'Edit modal pre-populates existing passingCriteria and adjusts dynamically on folder change'
  );

  // Check 6: Client-side validation in handleSaveConfig
  assert(
    testDetailCode.includes('parsedPassingCriteria > Number(editFormData.totalQuestions)') &&
    testDetailCode.includes('Passing criteria') &&
    testDetailCode.includes('cannot exceed total questions'),
    'Client-side handleSaveConfig validates passingCriteria bounds'
  );

  // Check 7: Backend controller validates and persists passingCriteria in updateTest
  assert(
    testControllerCode.includes('req.body.passingCriteria !== undefined') &&
    (testControllerCode.includes('req.body.passingCriteria > finalTotalQuestions') || testControllerCode.includes('parsedPassing > targetTotalQuestions')) &&
    testControllerCode.includes('Passing criteria must be a non-negative number'),
    'Backend updateTest validates and persists passingCriteria safely'
  );

  // Check 8: Results & Shortlist page preserves threshold management
  assert(
    resultsCode.includes('api.updatePassingCriteria') &&
    resultsCode.includes('api.updateMalpracticeThreshold') &&
    resultsCode.includes('passingCriteria') &&
    resultsCode.includes('malpracticeThreshold'),
    'AdminResults page preserves post-test shortlist threshold controls'
  );

  // Check 9: Test Model Schema preserves passingCriteria
  assert(
    testModelCode.includes('passingCriteria: { type: Number, required: true }'),
    'Test schema retains passingCriteria field'
  );

  console.log(`\nFEATURE-012 Verification Result: ${passedTests}/${totalTests} checks passed.`);
  if (passedTests === totalTests) {
    console.log('STATUS: ALL CRITERIA VERIFIED SUCCESSFUL\n');
  } else {
    console.error('STATUS: FAILED CHECKS DETECTED\n');
    process.exitCode = 1;
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
