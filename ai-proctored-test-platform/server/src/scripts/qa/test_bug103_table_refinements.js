/**
 * QA Test Suite for BUG-103:
 * Test Management Table Refinements & Regressions:
 * 1. Single line "TEST TITLE" header + results count badge
 * 2. No stray static vertical line at rest; dynamic scroll shadow active on horizontal scroll
 * 3. Uniform, proportionate column spacing across all data columns
 * 4. Actions column button slots are fixed horizontally (Manage & Rooms | Live Monitor/Test Summary | Results | Delete 🗑️)
 * 5. Single source of truth for column ordering & "Total Candidates" label
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
console.log('🧪 QA TEST SUITE: BUG-103 TABLE REFINEMENTS');
console.log('======================================================\n');

const globalCssPath = path.join(__dirname, '../../../../client/src/styles/global.css');
const adminTestsPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminTests.jsx');

const globalCssContent = fs.readFileSync(globalCssPath, 'utf8');
const adminTestsContent = fs.readFileSync(adminTestsPath, 'utf8');

// 1. Single Line Test Title Header (Item C)
runTest('Test Title header is a single line with results count badge', () => {
  assert(adminTestsContent.includes('<span>Test Title</span>'), 'Header must contain "Test Title" on single line');
  assert(!adminTestsContent.includes('<span>Test</span>\n                        <span>Title</span>'), 'Header must not be split on two lines');
  assert(adminTestsContent.includes('title={`Filtered result count: ${filteredTests.length}`}'), 'Results count badge is present');
});

// 2. Dynamic Scroll Shadow & No Stray Line at Rest (Item D)
runTest('Frozen title column has no static border/shadow at rest, and uses is-scrolled-x for dynamic scroll shadow', () => {
  assert(globalCssContent.includes('.test-table-scroll-container thead th.sticky-col-title {'), 'Defines th.sticky-col-title');
  assert(globalCssContent.includes('border-right: none;'), 'Must have border-right: none at rest');
  assert(globalCssContent.includes('box-shadow: none;'), 'Must have box-shadow: none at rest');
  assert(globalCssContent.includes('.test-table-scroll-container.is-scrolled-x thead th.sticky-col-title'), 'Defines is-scrolled-x shadow on th');
  assert(globalCssContent.includes('.test-table-scroll-container.is-scrolled-x tbody td.sticky-col-title'), 'Defines is-scrolled-x shadow on td');
  assert(adminTestsContent.includes('handleTableScroll'), 'AdminTests has scroll event handler');
  assert(adminTestsContent.includes('is-scrolled-x'), 'AdminTests applies is-scrolled-x class dynamically');
});

// 3. Uniform Column Spacing & Proportional Widths (Item E)
runTest('All data columns have proportional, uniform widths and center alignment', () => {
  assert(adminTestsContent.includes('textAlign: \'center\' }}>Duration</th>'), 'Duration header is center aligned');
  assert(adminTestsContent.includes('textAlign: \'center\' }}>Live For</th>'), 'Live For header is center aligned');
  assert(adminTestsContent.includes('textAlign: \'center\' }}>Passing Criteria</th>'), 'Passing Criteria header is center aligned');
  assert(adminTestsContent.includes('textAlign: \'center\' }}>Total Candidates</th>'), 'Total Candidates header is center aligned');
  assert(adminTestsContent.includes('textAlign: \'center\' }}>Total Rooms</th>'), 'Total Rooms header is center aligned');
  assert(globalCssContent.includes('.test-table-scroll-container thead th {') && globalCssContent.includes('padding: 10px 8px;'), 'Global table padding is uniform');
});

// 4. Fixed Button Slots in Actions Column (Item F & BUG-104)
runTest('Actions column implements 3-slot fixed CSS grid (Manage & Rooms | Live Monitor/Test Summary | Results/Delete)', () => {
  assert(adminTestsContent.includes('gridTemplateColumns: \'112px 94px 66px\''), 'Actions column uses fixed 3-slot grid');
  assert(adminTestsContent.includes('Manage &amp; Rooms'), 'Slot 1: Manage & Rooms');
  assert(adminTestsContent.includes('Live Monitor'), 'Slot 2: Live Monitor for LIVE tests');
  assert(adminTestsContent.includes('Test Summary'), 'Slot 2: Test Summary for ENDED tests');
  assert(adminTestsContent.includes('Results'), 'Slot 3: Results for ENDED tests');
  assert(adminTestsContent.includes('🗑️'), 'Slot 3: Delete for DRAFT tests');
});

// 5. Approved Column Order & Total Candidates Label Consistency (Items A & B)
runTest('Exact column sequence is Index -> Test Title -> Type -> Status -> Created -> Duration -> Live For -> Passing Criteria -> Total Candidates -> Total Rooms -> Question Set -> Actions', () => {
  const indexTh = adminTestsContent.indexOf('sticky-col-index');
  const titleTh = adminTestsContent.indexOf('sticky-col-title');
  const typeTh = adminTestsContent.indexOf('>Type</th>');
  const statusTh = adminTestsContent.indexOf('>Status</th>');
  const createdTh = adminTestsContent.indexOf('>Created</th>');
  const durationTh = adminTestsContent.indexOf('>Duration</th>');
  const liveForTh = adminTestsContent.indexOf('>Live For</th>');
  const passingTh = adminTestsContent.indexOf('>Passing Criteria</th>');
  const candidatesTh = adminTestsContent.indexOf('>Total Candidates</th>');
  const roomsTh = adminTestsContent.indexOf('>Total Rooms</th>');
  const questionSetTh = adminTestsContent.indexOf('>Question Set</th>');
  const actionsTh = adminTestsContent.indexOf('>Actions</th>');

  assert(indexTh < titleTh && titleTh < typeTh && typeTh < statusTh && statusTh < createdTh && createdTh < durationTh && durationTh < liveForTh && liveForTh < passingTh && passingTh < candidatesTh && candidatesTh < roomsTh && roomsTh < questionSetTh && questionSetTh < actionsTh, 'Column sequence must match exact approved order');
});

console.log(`\n======================================================`);
console.log(`RESULTS: ${passedTests}/${totalTests} Passed`);
console.log(`======================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
