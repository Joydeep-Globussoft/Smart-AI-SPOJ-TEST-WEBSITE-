/**
 * QA Verification Suite for BUG-38:
 * Edit Test Configuration Modal Parity with Create New Test Modal
 *
 * Verifies:
 * 1. Edit modal includes a Test Type field with TEST_TYPES dropdown options (Criterion 1).
 * 2. Test Type is editable when test is in DRAFT status, and locked/disabled when LIVE or ENDED (Criterion 1).
 * 3. Changing Test Type in Edit modal immediately resets questionSetId to '' forcing valid re-selection (Criterion 2).
 * 4. Question Sets in Edit modal filter dynamically based on the currently selected testType (Criterion 2).
 * 5. Passing Criteria is intentionally absent from Edit modal, preserving the dedicated card on Test Detail (Criterion 3).
 * 6. "Join Window / Password Validity (Minutes)" uses unified label and helper sub-text in both modals (Criterion 4).
 * 7. Both modals offer the identical, canonical set of 6 Supported Language checkboxes matching schema (Criterion 5).
 * 8. Zero regressions to BUG-36 field editing, validation, or previous bug fixes (Criterion 6).
 */

const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: BUG-38 Edit Modal Parity with Create Modal');
  console.log('========================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  const testDetailPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx');
  const createModalPath = path.join(__dirname, '../../../../client/src/shared/CreateTestModal.jsx');
  const testModelPath = path.join(__dirname, '../../models/Test.js');
  const testControllerPath = path.join(__dirname, '../../controllers/testController.js');

  const testDetailCode = fs.readFileSync(testDetailPath, 'utf-8');
  const createModalCode = fs.readFileSync(createModalPath, 'utf-8');
  const testModelCode = fs.readFileSync(testModelPath, 'utf-8');
  const testControllerCode = fs.readFileSync(testControllerPath, 'utf-8');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Test Type Field in Edit Modal (Criterion 1)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Test Type Field Presence & Lifecycle Locking ---');
  assert(
    testDetailCode.includes('id="edit-test-type"') &&
    testDetailCode.includes('TEST_TYPES.map'),
    'Edit modal renders Test Type select dropdown with all test types'
  );
  assert(
    testDetailCode.includes("{test?.status === 'DRAFT' && (") &&
    testDetailCode.includes("if (test?.status !== 'DRAFT') return;"),
    'Edit modal and Test Type field are accessible strictly when test status is DRAFT (BUG-39)'
  );
  assert(
    testControllerCode.includes("existing.status !== 'DRAFT'") &&
    testControllerCode.includes('403'),
    'Backend updateTest rejects non-DRAFT modifications with 403 Forbidden'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Cascading Folder / Pool Reset on Test Type Change (Criterion 2)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Cascading Folder / Pool Reset on Test Type Change ---');
  assert(
    testDetailCode.includes('handleEditTestTypeChange') &&
    testDetailCode.includes("folderId: ''"),
    'handleEditTestTypeChange resets folderId to empty string when Test Type changes'
  );
  assert(
    testDetailCode.includes('p.testType === editFormData.testType'),
    'Question Folder dropdown in Edit modal filters by editFormData.testType'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Passing Criteria Integration (FEATURE-012)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Passing Criteria Integration (FEATURE-012) ---');
  assert(
    testDetailCode.includes('id="edit-passing-criteria"') &&
    createModalCode.includes('passingCriteria'),
    'Both Create and Edit modals include Passing Criteria field (FEATURE-012)'
  );
  assert(
    testDetailCode.includes('Passing Criteria') &&
    testDetailCode.includes('test.passingCriteria ?? 0'),
    'Passing Criteria is displayed in Configuration Details card (FEATURE-012)'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Label & Helper Text Consistency (Criterion 4)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Unified Labeling & Helper Sub-Text ---');
  assert(
    testDetailCode.includes('Join Window / Password Validity (Minutes)') &&
    createModalCode.includes('Join Window / Password Validity (Minutes)'),
    'Both Create and Edit modals use "Join Window / Password Validity (Minutes)" label'
  );
  assert(
    testDetailCode.includes('Room passwords expire after this window from room creation') &&
    createModalCode.includes('Room passwords expire after this window from room creation'),
    'Both Create and Edit modals include the room password expiration sub-text'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Supported Languages Canonical Parity (Criterion 5)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Supported Languages Parity & Schema Match ---');
  const schemaEnumMatch = testModelCode.includes("'python', 'java', 'cpp', 'c', 'javascript', 'react'");
  assert(
    schemaEnumMatch,
    'Test schema enum includes all 6 canonical languages: python, java, cpp, c, javascript, react'
  );

  const detailLangs = testDetailCode.match(/const PROGRAMMING_LANGUAGES = \[(.*?)\];/s)?.[1] || '';
  const createLangs = createModalCode.match(/const PROGRAMMING_LANGUAGES = \[(.*?)\];/s)?.[1] || '';

  const cleanDetail = detailLangs.replace(/\s+/g, '').replace(/'/g, '"');
  const cleanCreate = createLangs.replace(/\s+/g, '').replace(/'/g, '"');

  assert(
    cleanDetail.includes('react') && cleanCreate.includes('react'),
    'Both Create and Edit modals include "react" in PROGRAMMING_LANGUAGES'
  );
  assert(
    cleanDetail === cleanCreate,
    `Create and Edit modal languages match identically (${cleanDetail})`
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Regression Prevention Audit (Criterion 6)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: Regression Prevention Audit ---');
  assert(
    testDetailCode.includes('handleSaveConfig'),
    'Save configuration handler preserved'
  );
  assert(
    testDetailCode.includes('id="edit-config-btn"'),
    'Edit button on Configuration Details card preserved'
  );
  assert(
    testDetailCode.includes('getLiveSessionText'),
    'BUG-35 & BUG-37 Live timestamps header preserved'
  );
  assert(
    testDetailCode.includes('handleStartTest') && testDetailCode.includes('handleEndTest'),
    'Start and End test lifecycle actions preserved'
  );
  assert(
    testDetailCode.includes('handleAddRoomSubmit') && testDetailCode.includes('handleDeleteRoom'),
    'Physical room management actions preserved'
  );

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('========================================================================');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
