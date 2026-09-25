/**
 * QA Test Suite for FEATURE-040:
 * Test Management Table Layout Rework:
 * - Spacing & tighter padding
 * - Exact column reordering: Index -> Test Title -> Type -> Status -> Created -> Duration -> Live For -> Passing Criteria -> Total Candidates -> Total Rooms -> Question Set -> Actions
 * - Rename "Total Participants" -> "Total Candidates"
 * - 2-line "Test Title" header + results count badge
 * - Fixed width Test Title with ellipsis truncation & hover tooltip
 * - Center alignment for data columns
 * - Dual-axis sticky frozen Index & Test Title columns
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
console.log('🧪 QA TEST SUITE: FEATURE-040 TABLE LAYOUT REWORK');
console.log('======================================================\n');

const globalCssPath = path.join(__dirname, '../../../../client/src/styles/global.css');
const adminTestsPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminTests.jsx');

const globalCssContent = fs.readFileSync(globalCssPath, 'utf8');
const adminTestsContent = fs.readFileSync(adminTestsPath, 'utf8');

// 1. Column Ordering Verification
runTest('Table columns match exact specified order: Index -> Title -> Type -> Status -> Created -> Duration -> Live For -> Passing Criteria -> Total Candidates -> Total Rooms -> Question Set -> Actions', () => {
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

  assert(indexTh !== -1, 'Index header must exist');
  assert(titleTh !== -1, 'Title header must exist');
  assert(typeTh !== -1, 'Type header must exist');
  assert(statusTh !== -1, 'Status header must exist');
  assert(createdTh !== -1, 'Created header must exist');
  assert(durationTh !== -1, 'Duration header must exist');
  assert(liveForTh !== -1, 'Live For header must exist');
  assert(passingTh !== -1, 'Passing Criteria header must exist');
  assert(candidatesTh !== -1, 'Total Candidates header must exist');
  assert(roomsTh !== -1, 'Total Rooms header must exist');
  assert(questionSetTh !== -1, 'Question Set header must exist');
  assert(actionsTh !== -1, 'Actions header must exist');

  assert(indexTh < titleTh, 'Index must be before Title');
  assert(titleTh < typeTh, 'Title must be before Type');
  assert(typeTh < statusTh, 'Type must be before Status');
  assert(statusTh < createdTh, 'Created must be immediately after Status');
  assert(createdTh < durationTh, 'Duration must be after Created');
  assert(durationTh < liveForTh, 'Live For must be after Duration');
  assert(liveForTh < passingTh, 'Passing Criteria must be after Live For');
  assert(passingTh < candidatesTh, 'Total Candidates must be after Passing Criteria');
  assert(candidatesTh < roomsTh, 'Total Rooms must be immediately after Total Candidates');
  assert(roomsTh < questionSetTh, 'Question Set must be after Total Rooms');
  assert(questionSetTh < actionsTh, 'Actions must be after Question Set');
});

// 2. Rename Verification: Total Participants -> Total Candidates
runTest('Display label renamed to "Total Candidates" in table header, sort dropdown and sort summary', () => {
  assert(adminTestsContent.includes('>Total Candidates</th>'), 'Table header must display Total Candidates');
  assert(adminTestsContent.includes("{ id: 'participants', label: 'Total Candidates' }"), 'SORT_FIELDS label must be Total Candidates');
  assert(adminTestsContent.includes("return `Total Candidates (${activeSortDir === 'desc' ? 'Highest' : 'Lowest'})`"), 'Sort summary must read Total Candidates');
});

// 3. "Test Title" 1-line header & badge layout (BUG-103)
runTest('"Test Title" header renders on a single line with result count badge', () => {
  assert(adminTestsContent.includes('<span>Test Title</span>'), 'Header must contain "Test Title" on single line');
  assert(adminTestsContent.includes('title={`Filtered result count: ${filteredTests.length}`}'), 'Results count badge is present in title header');
});

// 4. Test Title truncation & tooltip
runTest('Test Title cell truncates with ellipsis and renders hover tooltip', () => {
  assert(adminTestsContent.includes('textOverflow: \'ellipsis\''), 'Title must have ellipsis textOverflow');
  assert(adminTestsContent.includes('whiteSpace: \'nowrap\''), 'Title must have nowrap whiteSpace');
  assert(adminTestsContent.includes('overflow: \'hidden\''), 'Title must have hidden overflow');
  assert(adminTestsContent.includes('title={test.title}'), 'Title must provide hover tooltip');
});

// 5. Dual-Axis Sticky Frozen Columns CSS (BUG-103: Dynamic scroll shadow, no static line)
runTest('global.css defines dual-axis sticky frozen columns for Index and Test Title with dynamic scroll shadow', () => {
  assert(globalCssContent.includes('.test-table-scroll-container thead th.sticky-col-index {'), 'Must define th.sticky-col-index');
  assert(globalCssContent.includes('.test-table-scroll-container tbody td.sticky-col-index {'), 'Must define td.sticky-col-index');
  assert(globalCssContent.includes('.test-table-scroll-container thead th.sticky-col-title {'), 'Must define th.sticky-col-title');
  assert(globalCssContent.includes('.test-table-scroll-container tbody td.sticky-col-title {'), 'Must define td.sticky-col-title');
  assert(globalCssContent.includes('left: 36px;'), 'Title sticky left offset must be 36px');
  assert(globalCssContent.includes('.test-table-scroll-container.is-scrolled-x'), 'Must define is-scrolled-x modifier for scroll indicator');
});

// 6. Center Alignment & Actions Fixed Grid
runTest('Non-frozen columns are center-aligned and Actions column uses fixed button slots', () => {
  assert(adminTestsContent.includes('textAlign: \'center\' }}>Type</th>'), 'Type header must be center-aligned');
  assert(adminTestsContent.includes('textAlign: \'center\' }}>Status</th>'), 'Status header must be center-aligned');
  assert(adminTestsContent.includes('textAlign: \'center\' }}>Created</th>'), 'Created header must be center-aligned');
  assert(adminTestsContent.includes('textAlign: \'center\' }}>Duration</th>'), 'Duration header must be center-aligned');
  assert(adminTestsContent.includes('textAlign: \'center\' }}>Live For</th>'), 'Live For header must be center-aligned');
  assert(adminTestsContent.includes('textAlign: \'center\' }}>Passing Criteria</th>'), 'Passing Criteria header must be center-aligned');
  assert(adminTestsContent.includes('textAlign: \'center\' }}>Total Candidates</th>'), 'Total Candidates header must be center-aligned');
  assert(adminTestsContent.includes('textAlign: \'center\' }}>Total Rooms</th>'), 'Total Rooms header must be center-aligned');
  assert(adminTestsContent.includes('textAlign: \'center\' }}>Question Set</th>'), 'Question Set header must be center-aligned');
  assert(adminTestsContent.includes('textAlign: \'center\' }}>Actions</th>'), 'Actions header must be center-aligned');
  assert(adminTestsContent.includes('gridTemplateColumns: \'112px 94px 66px 32px\''), 'Actions column must use fixed 4-slot grid');
});

// 7. Non-regression of empty state & sticky scroll
runTest('Preserves colSpan=12 empty state and sticky scroll container', () => {
  assert(adminTestsContent.includes('colSpan={12}'), 'Empty state colSpan must be 12');
  assert(adminTestsContent.includes('className={`table-container test-table-scroll-container ${isScrolledLeft ? \'is-scrolled-x\' : \'\'}`}'), 'Scroll container class must support dynamic scroll state');
  assert(adminTestsContent.includes('minWidth: 1400') || adminTestsContent.includes('minWidth: 1250'), 'Table must have minWidth to prevent crushing');
});

console.log(`\n======================================================`);
console.log(`RESULTS: ${passedTests}/${totalTests} Passed`);
console.log(`======================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
