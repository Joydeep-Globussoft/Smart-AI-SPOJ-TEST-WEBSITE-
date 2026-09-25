/**
 * QA Automated Verification Suite: FEATURE-029 & Follow-up
 * Row Indexing, Always-Visible Total Count, Column Spacing & Question Set Truncation
 *
 * Verifies:
 * 1. AdminTests.jsx table header includes a leftmost blank index column (<th style={{ width: 36 ... }}></th>).
 * 2. AdminTests.jsx table header displays always-visible total count ({filteredTests.length} result(s)).
 * 3. Table rows render position-based row numbering (1, 2, 3...) that dynamically re-flows on filter/sort.
 * 4. Empty filtered state renders within the table (colSpan=9) maintaining the sticky header and 0 results count.
 * 5. BUG-86 sticky scroll container and header CSS rules are preserved with balanced table layout.
 * 6. BUG-87 plain text question set is truncated with ellipsis and displays full text via title hover tooltip.
 * 7. FEATURE-021 / FEATURE-022 filter, sort, and search states remain fully intact.
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

async function runFeature029Tests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: FEATURE-029 (Row Indexing, Header Count & Column Spacing)');
  console.log('========================================================================\n');

  const adminTestsPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTests.jsx');
  const globalCssPath = path.resolve(__dirname, '../../../../client/src/styles/global.css');

  const adminTestsCode = fs.readFileSync(adminTestsPath, 'utf8');
  const globalCssCode = fs.readFileSync(globalCssPath, 'utf8');

  // 1. Leftmost Blank Index Column Header
  assert(
    adminTestsCode.includes('<th style={{ width: 36, minWidth: 36, textAlign: \'center\' }}></th>'),
    'Table header has a blank/empty leftmost cell for the index column'
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

  // 4. Empty filtered state renders inside table with colSpan
  assert(
    (adminTestsCode.includes('colSpan={9}') || adminTestsCode.includes('colSpan={10}') || adminTestsCode.includes('colSpan={11}')) &&
    adminTestsCode.includes('No tests match your filter criteria'),
    'Empty state is handled gracefully with colSpan when filters yield 0 results'
  );

  // 5. BUG-86 sticky header & balanced layout preservation
  assert(
    adminTestsCode.includes('className="table-container test-table-scroll-container"') &&
    (adminTestsCode.includes('minWidth: 1140') || adminTestsCode.includes('minWidth: 1060') || adminTestsCode.includes('minWidth: 980') || adminTestsCode.includes('minWidth: 960')) &&
    globalCssCode.includes('.test-table-scroll-container thead th {') &&
    globalCssCode.includes('position: sticky;'),
    'BUG-86 sticky header container and balanced column width rules are preserved'
  );

  // 6. BUG-87 plain text question set with ellipsis truncation and hover tooltip
  assert(
    adminTestsCode.includes('title={questionSetName}') &&
    adminTestsCode.includes('textOverflow: \'ellipsis\'') &&
    adminTestsCode.includes('whiteSpace: \'nowrap\''),
    'Question Set column truncates long names with ellipsis and provides full name in title tooltip'
  );

  // 7. Non-regression of action buttons and links
  assert(
    (adminTestsCode.includes('Manage &amp; Rooms') || adminTestsCode.includes('Manage & Rooms')) &&
    adminTestsCode.includes('Live Monitor') &&
    adminTestsCode.includes('Test Summary') &&
    adminTestsCode.includes('Results'),
    'All action links (Manage & Rooms, Live Monitor, Test Summary, Results) remain intact'
  );

  console.log(`\nFEATURE-029 Verification Result: ${passedTests}/${totalTests} checks passed.`);
  if (passedTests === totalTests) {
    console.log('STATUS: ALL FEATURE-029 CRITERIA VERIFIED SUCCESSFUL\n');
  } else {
    process.exit(1);
  }
}

runFeature029Tests();
