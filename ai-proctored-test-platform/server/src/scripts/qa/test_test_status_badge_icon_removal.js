/**
 * QA Automated Verification Suite: Test Status Badge Icon Removal
 *
 * Verifies that:
 * 1. AdminLiveDashboard.jsx does not render checkered flag icon (🏁) in the TEST STATUS badge.
 * 2. Badge displays "Test Status" label and "Test Concluded" status text cleanly without an icon.
 * 3. Live Tentative Time badge behavior is preserved.
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

async function runTestStatusIconTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: TEST STATUS Badge Icon Removal');
  console.log('========================================================================\n');

  const adminLiveDashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');
  const code = fs.readFileSync(adminLiveDashboardPath, 'utf8');

  // 1. No checkered flag icon
  assert(!code.includes('🏁'), 'Checkered flag icon (🏁) is completely removed from AdminLiveDashboard');

  // 2. Icon is omitted when test has ended
  assert(
    code.includes('{!isTestEnded && <span style={{ fontSize: \'1rem\' }}>⏱️</span>}'),
    'TEST STATUS badge renders without any icon when test is concluded (isTestEnded is true)'
  );

  // 3. Label and status text preserved
  assert(
    code.includes("{isTestEnded ? 'Test Status' : 'Tentative Time'}") &&
    code.includes("{isTestEnded ? 'Test Concluded' : tentativeTimer.formatted}"),
    'TEST STATUS label and "Test Concluded" status value are cleanly preserved'
  );

  console.log(`\nTest Status Badge Icon Removal Result: ${passedTests}/${totalTests} checks passed.`);
  if (passedTests === totalTests) {
    console.log('STATUS: ALL CRITERIA VERIFIED SUCCESSFUL\n');
  } else {
    process.exit(1);
  }
}

runTestStatusIconTests();
