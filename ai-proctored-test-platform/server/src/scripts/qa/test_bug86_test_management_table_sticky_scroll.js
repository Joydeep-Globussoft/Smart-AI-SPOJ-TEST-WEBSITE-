/**
 * QA Test Suite for BUG-86 & BUG-87:
 * - Single persistent horizontal scrollbar pinned at bottom of viewport
 * - Non-clipped Test Management page header & filter card below navbar
 * - Sticky table header row (thead th) during vertical scrolling
 * - Plain-text Question Set column rendering without folder badges/icons (BUG-87)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
  }
}

console.log('\n======================================================');
console.log('BUG-86 & BUG-87 TEST SUITE: Sticky Table & Plain Text Question Set');
console.log('======================================================\n');

const globalCssPath = path.join(__dirname, '../../../../client/src/styles/global.css');
const adminTestsPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminTests.jsx');

const globalCssContent = fs.readFileSync(globalCssPath, 'utf8');
const adminTestsContent = fs.readFileSync(adminTestsPath, 'utf8');

// 1. CSS Verification
runTest('global.css defines .test-table-scroll-container with flex, overflow: auto, and sticky thead th', () => {
  assert(globalCssContent.includes('.test-table-scroll-container {'), 'Must have .test-table-scroll-container');
  assert(globalCssContent.includes('overflow: auto;'), 'Must have overflow: auto');
  assert(globalCssContent.includes('.test-table-scroll-container thead th {'), 'Must have sticky thead th');
  assert(globalCssContent.includes('position: sticky;'), 'Must have position: sticky');
  assert(globalCssContent.includes('top: 0;'), 'Must have top: 0');
  assert(globalCssContent.includes('z-index: 10;'), 'Must have z-index: 10');
});

runTest('global.css removed redundant duplicate .persistent-horizontal-scrollbar', () => {
  assert(!globalCssContent.includes('.persistent-horizontal-scrollbar {'), 'Must not have duplicate persistent-horizontal-scrollbar rule');
});

// 2. AdminTests Layout Verification
runTest('AdminTests.jsx has fixed/non-scrolling page header and filter card preventing navbar clipping', () => {
  assert(adminTestsContent.includes('height: \'calc(100vh - 64px)\''), 'main-content must be constrained to viewport below navbar');
  assert(adminTestsContent.includes('overflow: \'hidden\''), 'main-content must not scroll outer page title behind navbar');
  assert(adminTestsContent.includes('flexShrink: 0'), 'Header and filter card must have flexShrink: 0');
});

runTest('AdminTests.jsx has single table scroll container with sticky header and bottom scrollbar', () => {
  assert(adminTestsContent.includes('className="table-container test-table-scroll-container"'), 'Table must use test-table-scroll-container');
  assert(!adminTestsContent.includes('persistent-horizontal-scrollbar'), 'Must not render secondary duplicate scrollbar track');
  assert(adminTestsContent.includes('minWidth: 1250') || adminTestsContent.includes('minWidth: 1100'), 'Table must have minWidth to prevent column crushing');
});

// 3. BUG-87 Verification: Question Set plain text
runTest('AdminTests.jsx renders folder-linked and manual Question Sets as plain text (BUG-87)', () => {
  assert(
    adminTestsContent.includes('{test.questionSetPoolName || test.folderId?.name || test.questionSetId?.name || \'—\'}'),
    'Question Set column must render plain text value'
  );
  assert(!adminTestsContent.includes('📁'), 'Question Set column must not render folder emoji/icon');
  assert(!adminTestsContent.includes('rgba(14, 124, 134, 0.15)'), 'Question Set column must not render green badge background');
});

// 4. Non-regression of Actions, Search, and Filters
runTest('AdminTests.jsx retains all action buttons and filter inputs', () => {
  assert(adminTestsContent.includes('Manage &amp; Rooms') || adminTestsContent.includes('Manage & Rooms'), 'Manage & Rooms must exist');
  assert(adminTestsContent.includes('Live Monitor'), 'Live Monitor must exist');
  assert(adminTestsContent.includes('Test Summary'), 'Test Summary must exist');
  assert(adminTestsContent.includes('Results'), 'Results must exist');
  assert(adminTestsContent.includes('Delete Test'), 'Delete Test must exist');
  assert(adminTestsContent.includes('Search Tests'), 'Search Tests input must exist');
  assert(adminTestsContent.includes('Filter by Type'), 'Filter by Type select must exist');
  assert(adminTestsContent.includes('Filter by Status'), 'Filter by Status select must exist');
});

console.log(`\n======================================================`);
console.log(`RESULTS: ${passedTests}/${totalTests} Passed`);
console.log(`======================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
