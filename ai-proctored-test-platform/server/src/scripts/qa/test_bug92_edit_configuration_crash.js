/**
 * QA Verification Suite for BUG-92:
 * Fix "handleSaveConfig is not defined" crash when clicking Edit on draft test Configuration Details
 */

const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: BUG-92 Edit Configuration Crash Fix');
  console.log('========================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  ✗ [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  const testDetailPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx');
  const testControllerPath = path.join(__dirname, '../../controllers/testController.js');

  console.log('--- Step 1: Verify handleSaveConfig Definition & Form Wiring ---');
  const testDetailCode = fs.readFileSync(testDetailPath, 'utf-8');
  assert(fs.existsSync(testDetailPath), 'AdminTestDetail.jsx exists');
  assert(
    testDetailCode.includes('const handleSaveConfig = async (e) => {') ||
    testDetailCode.includes('const handleSaveConfig ='),
    'handleSaveConfig is explicitly defined in AdminTestDetail.jsx component scope'
  );
  assert(
    testDetailCode.includes('<form onSubmit={handleSaveConfig}>'),
    'Edit modal <form> onSubmit is properly bound to handleSaveConfig'
  );
  assert(
    testDetailCode.includes('const handleEditSave = handleSaveConfig;') ||
    testDetailCode.includes('handleEditSave'),
    'Backward compatibility alias handleEditSave is preserved'
  );

  console.log('\n--- Step 2: Verify Edit Button & Modal Open State ---');
  assert(
    testDetailCode.includes('id="edit-config-btn"') &&
    testDetailCode.includes('onClick={handleOpenEditModal}'),
    'Edit button on Configuration Details card is wired to handleOpenEditModal'
  );
  assert(
    testDetailCode.includes('instructions: test?.instructions || \'\''),
    'Existing test instructions are preserved when opening Edit modal (not reset to default)'
  );
  assert(
    testDetailCode.includes('title: test?.title || \'\''),
    'Existing test title is preserved when opening Edit modal'
  );
  assert(
    testDetailCode.includes('durationMinutes: test?.durationMinutes ?? 90'),
    'Existing durationMinutes is preserved when opening Edit modal'
  );

  console.log('\n--- Step 3: Verify Status Restrictions (DRAFT vs LIVE/ENDED) ---');
  assert(
    testDetailCode.includes("{test?.status === 'DRAFT' && (") &&
    testDetailCode.includes('id="edit-config-btn"'),
    'Edit button on Configuration Details card is strictly rendered only when test?.status === \'DRAFT\''
  );
  assert(
    testDetailCode.includes('if (test?.status !== \'DRAFT\') return;'),
    'handleOpenEditModal guards against opening when test is not in DRAFT status'
  );

  const testControllerCode = fs.readFileSync(testControllerPath, 'utf-8');
  assert(
    testControllerCode.includes("existing.status !== 'DRAFT'") &&
    testControllerCode.includes('403'),
    'Backend updateTest rejects modifications to non-DRAFT tests with 403 Forbidden'
  );
  assert(
    testControllerCode.includes('Test configuration can only be edited while in DRAFT status'),
    'Backend returns clear error message explaining DRAFT-only restriction'
  );

  console.log('\n--- Step 4: Verify Input Validation in handleSaveConfig ---');
  assert(
    testDetailCode.includes('if (!editFormData.title.trim())') &&
    testDetailCode.includes('Test title is required'),
    'Validates non-empty test title'
  );
  assert(
    testDetailCode.includes('if (!editFormData.folderId)') &&
    testDetailCode.includes('Please select a Question Folder'),
    'Validates folder selection'
  );
  assert(
    testDetailCode.includes('if (!editFormData.durationMinutes || Number(editFormData.durationMinutes) <= 0)'),
    'Validates positive duration'
  );
  assert(
    testDetailCode.includes('if (!editFormData.startTestWindowMinutes || Number(editFormData.startTestWindowMinutes) <= 0)'),
    'Validates positive join window'
  );
  assert(
    testDetailCode.includes('if (!editFormData.supportedLanguages || editFormData.supportedLanguages.length === 0)'),
    'Validates at least one supported language'
  );
  assert(
    testDetailCode.includes('if (!editFormData.instructions.trim())'),
    'Validates non-empty candidate instructions'
  );

  console.log('\n--- Step 5: Verify API Call & Instant Component State Update ---');
  assert(
    testDetailCode.includes('const res = await api.updateTest(testId, payload);') &&
    testDetailCode.includes('setTest(res.data.test);'),
    'Saves via api.updateTest and immediately updates local test state with returned test object'
  );
  assert(
    testDetailCode.includes('setShowEditModal(false);'),
    'Closes edit modal on successful save'
  );

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passedTests} passed, ${totalTests - passedTests} failed`);
  console.log('========================================================================\n');

  if (passedTests === totalTests) {
    console.log('✓ All BUG-92 tests passed successfully!');
  } else {
    process.exitCode = 1;
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
