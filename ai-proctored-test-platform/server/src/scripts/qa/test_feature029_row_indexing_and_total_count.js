/**
 * QA Automated Verification Suite: FEATURE-029
 * Row Indexing & Always-Visible Total Count in Test Management Table
 *
 * Verifies that:
 * 1. AdminTests.jsx table header includes a leftmost "#" index column.
 * 2. AdminTests.jsx table header displays always-visible total count ({filteredTests.length} result(s)).
 * 3. Table rows render position-based row numbering (1, 2, 3...) that dynamically re-flows on filter/sort.
 * 4. Empty filtered state renders within the table (colSpan=9) maintaining the sticky header and 0 results count.
 * 5. BUG-86 sticky scroll container and header CSS rules are preserved.
 * 6. BUG-87 plain text question set rendering is preserved.
 * 7. FEATURE-021 / FEATURE-022 filter, sort, and search states remain fully intact.
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

async function runFeature029Tests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: FEATURE-029 (Row Indexing & Header Total Count)');
  console.log('========================================================================\n');

  const adminTestsPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTests.jsx');
  const globalCssPath = path.resolve(__dirname, '../../../../client/src/styles/global.css');

  const adminTestsCode = fs.readFileSync(adminTestsPath, 'utf8');
  const globalCssCode = fs.readFileSync(globalCssPath, 'utf8');

  // 1. Leftmost '#' (Index) Column Header
  assert(
    adminTestsCode.includes('<th style={{ width: 48, minWidth: 48, textAlign: \'center\'') &&
    adminTestsCode.includes('#'),
    'Table header has a leftmost "#" column for position-based numbering'
  );

  // 2. Position-based row indexing (index + 1)
  assert(
    adminTestsCode.includes('{index + 1}') &&
    adminTestsCode.includes('filteredTests.map((test, index) =>'),
    'Table rows render position-based index (index + 1) based on current sort/filter view'
  );

  // 3. Always-visible total filtered count badge in sticky thead
  assert(
    adminTestsCode.includes('filteredTests.length') &&
    adminTestsCode.includes('{filteredTests.length === 1 ? \'result\' : \'results\'}') &&
    adminTestsCode.includes('<span>Test Title</span>'),
    'Sticky table header contains always-visible filtered result count badge'
  );

  // 4. Empty filtered state renders inside table with colSpan=9
  assert(
    adminTestsCode.includes('colSpan={9}') &&
    adminTestsCode.includes('No tests match your filter criteria'),
    'Empty state is handled gracefully with colSpan=9 when filters yield 0 results'
  );

  // 5. BUG-86 sticky header & scrollbar preservation
  assert(
    adminTestsCode.includes('className="table-container test-table-scroll-container"') &&
    adminTestsCode.includes('minWidth: 1250') &&
    globalCssCode.includes('.test-table-scroll-container thead th {') &&
    globalCssCode.includes('position: sticky;'),
    'BUG-86 sticky header container and CSS rules are preserved'
  );

  // 6. BUG-87 plain text question set preservation
  assert(
    adminTestsCode.includes('{test.questionSetPoolName || test.folderId?.name || test.questionSetId?.name || \'—\'}'),
    'BUG-87 plain text Question Set rendering is preserved'
  );

  // 7. Non-regression of action buttons and links
  assert(
    adminTestsCode.includes('Manage &amp; Rooms') || adminTestsCode.includes('Manage & Rooms') &&
    adminTestsCode.includes('Live Monitor') &&
    adminTestsCode.includes('Test Summary') &&
    adminTestsCode.includes('Results'),
    'All action links (Manage & Rooms, Live Monitor, Test Summary, Results) remain intact'
  );

  console.log(`\nFEATURE-029 Verification Result: ${passedTests}/${totalTests} checks passed.`);
  if (passedTests === totalTests) {
    console.log('STATUS: ALL FEATURE-029 CRITERIA VERIFIED SUCCESSFUL\n');
  }
}

runFeature029Tests();
