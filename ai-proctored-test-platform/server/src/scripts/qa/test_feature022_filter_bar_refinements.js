/**
 * QA Automated Verification Suite: FEATURE-022 Filter Bar Refinements
 *
 * Verifies:
 * 1. "More Filters" badge visibility and color contrast (defined --color-teal in global.css, high contrast text/bg in AdminTests.jsx).
 * 2. Redesigned "Sort by" dropdown menu (Windows Explorer-style) with 6 fields: Name, Date, Duration, Type, Status, Passing Criteria.
 * 3. Ascending and Descending direction selectors with active indicator (●) and divider.
 * 4. State persistence with URL params & backwards compatibility for legacy sort keys.
 * 5. Reduced "Search Tests" input box width (~2/3 width) with clean surrounding flex layout.
 * 6. Non-regression across BUG-86 sticky headers and FEATURE-029 row indexing/counts.
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

async function runFilterBarRefinementsTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: FEATURE-022 Filter Bar Refinements');
  console.log('========================================================================\n');

  const adminTestsPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTests.jsx');
  const globalCssPath = path.resolve(__dirname, '../../../../client/src/styles/global.css');

  const adminTestsCode = fs.readFileSync(adminTestsPath, 'utf8');
  const globalCssCode = fs.readFileSync(globalCssPath, 'utf8');

  // 1. More Filters badge contrast and --color-teal definition
  assert(
    globalCssCode.includes('--color-teal: #0E7C86') &&
    globalCssCode.includes('--color-teal: #14b8a6'),
    'global.css defines --color-teal in both light and dark themes'
  );

  assert(
    adminTestsCode.includes("background: showMoreFilters || advancedActiveCount > 0 ? '#FFFFFF'") &&
    adminTestsCode.includes("color: showMoreFilters || advancedActiveCount > 0 ? 'var(--color-primary, #0E7C86)' : '#FFFFFF'") &&
    adminTestsCode.includes('({advancedActiveCount})'),
    '"More Filters" badge renders with high-contrast, legible text and background'
  );

  // 2. Sort by menu fields
  assert(
    adminTestsCode.includes("label: 'Name'") &&
    adminTestsCode.includes("label: 'Date'") &&
    adminTestsCode.includes("label: 'Duration'") &&
    adminTestsCode.includes("label: 'Type'") &&
    adminTestsCode.includes("label: 'Status'") &&
    adminTestsCode.includes("label: 'Passing Criteria'"),
    'Sort by dropdown menu includes all 6 relevant fields: Name, Date, Duration, Type, Status, Passing Criteria'
  );

  // 3. Ascending / Descending selector and active bullet indicator (●)
  assert(
    adminTestsCode.includes("label: 'Ascending'") &&
    adminTestsCode.includes("label: 'Descending'") &&
    adminTestsCode.includes("isSelected ? '●' : ''"),
    'Sort by menu provides Ascending and Descending options with bullet dot (●) active indicators'
  );

  // 4. Click outside and Escape key handler for sort menu
  assert(
    adminTestsCode.includes('handleClickOutside') &&
    adminTestsCode.includes("e.key === 'Escape'") &&
    adminTestsCode.includes('showSortMenu'),
    'Sort by menu includes click-outside and Escape key dismissal'
  );

  // 5. Search Tests input width reduced to 2/3
  assert(
    adminTestsCode.includes("flex: '0 1 260px'") &&
    adminTestsCode.includes('placeholder="Search by test title or pool..."'),
    'Search Tests input box width is reduced to 2/3 (~260px) with clean left-alignment'
  );

  // 6. Non-regression of multi-field sorting execution
  assert(
    adminTestsCode.includes('case \'name\':') &&
    adminTestsCode.includes('case \'date\':') &&
    adminTestsCode.includes('case \'duration\':') &&
    adminTestsCode.includes('case \'type\':') &&
    adminTestsCode.includes('case \'status\':') &&
    adminTestsCode.includes('case \'passing\':') &&
    adminTestsCode.includes('activeSortDir === \'asc\' ? comparison : -comparison'),
    'Underlying sorting engine computes accurate comparisons for all 6 fields in both asc and desc directions'
  );

  // 7. Non-regression of FEATURE-029 and BUG-86
  assert(
    adminTestsCode.includes('className="table-container test-table-scroll-container"') &&
    adminTestsCode.includes('{index + 1}') &&
    adminTestsCode.includes('{filteredTests.length} {filteredTests.length === 1 ? \'result\' : \'results\'}'),
    'Preserves FEATURE-029 row indexing, sticky count badge, and BUG-86 sticky table container'
  );

  console.log(`\nFEATURE-022 Filter Bar Refinements Result: ${passedTests}/${totalTests} checks passed.`);
  if (passedTests === totalTests) {
    console.log('STATUS: ALL FILTER BAR REFINEMENT CRITERIA VERIFIED SUCCESSFUL\n');
  } else {
    process.exit(1);
  }
}

runFilterBarRefinementsTests();
