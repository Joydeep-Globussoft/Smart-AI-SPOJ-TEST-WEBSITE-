/**
 * QA Test Suite for BUG-104:
 * Test Management Table — Delete Button Position + Frozen Column Hover Bleed-Through
 * 
 * Requirements:
 * Item 1:
 * - On DRAFT rows, position Delete button in the exact same horizontal slot and alignment
 *   that "Results" uses on ENDED rows (Slot 3: 66px width, centered/matching alignment).
 * - 3-slot grid: Slot 1 (112px, Manage & Rooms), Slot 2 (94px, Live Monitor / Test Summary / empty),
 *   Slot 3 (66px, Results / Delete / empty).
 * - Actions column header styled with width: 290, minWidth: 285.
 * 
 * Item 2:
 * - Frozen Test Title column must not bleed underlying badge colors on row hover when scrolled.
 * - Root cause fix: --color-table-row-hover updated from semi-transparent RGBA to 100% solid, fully opaque hex
 *   in both light (#f1f7f8) and dark (#16243d) themes.
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
console.log('🧪 QA TEST SUITE: BUG-104 DELETE POSITION & HOVER OPACITY');
console.log('======================================================\n');

const globalCssPath = path.join(__dirname, '../../../../client/src/styles/global.css');
const adminTestsPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminTests.jsx');

const globalCssContent = fs.readFileSync(globalCssPath, 'utf8');
const adminTestsContent = fs.readFileSync(adminTestsPath, 'utf8');

// Item 1: Delete Button Slot Alignment
runTest('Actions column uses fixed 3-slot CSS grid (112px, 94px, 66px) with Delete in Slot 3 for DRAFT rows', () => {
  assert(adminTestsContent.includes('gridTemplateColumns: \'112px 94px 66px\''), 'Actions column must use fixed 3-slot grid');
  assert(adminTestsContent.includes('width: 290, minWidth: 285'), 'Actions header must have width 290 and minWidth 285');
  
  // Verify slot mappings:
  // Slot 1: Manage & Rooms (always present)
  assert(adminTestsContent.includes('Manage &amp; Rooms'), 'Slot 1 must contain Manage & Rooms');
  
  // Slot 2: Live Monitor (LIVE) or Test Summary (ENDED) or empty <div />
  assert(adminTestsContent.includes('test.status === \'LIVE\' ? (') && adminTestsContent.includes('Live Monitor'), 'Slot 2 must render Live Monitor for LIVE');
  assert(adminTestsContent.includes('test.status === \'ENDED\' ? (') && adminTestsContent.includes('Test Summary'), 'Slot 2 must render Test Summary for ENDED');
  
  // Slot 3: Results (ENDED) or Delete 🗑️ (DRAFT) or empty <div />
  assert(adminTestsContent.includes('test.status === \'ENDED\' ? (') && adminTestsContent.includes('Results'), 'Slot 3 must render Results for ENDED');
  assert(adminTestsContent.includes('test.status === \'DRAFT\' ? (') && adminTestsContent.includes('setDeleteTarget(test)'), 'Slot 3 must render Delete for DRAFT');
});

// Item 2: Frozen Column Hover Opacity & Bleed-Through Fix
runTest('--color-table-row-hover is defined as solid opaque hex color in Light and Dark themes', () => {
  // Light mode check
  const lightModeMatch = globalCssContent.match(/(?::root|\[data-theme="light"\])[^\{]*\{[^}]*--color-table-row-hover:\s*([^;]+);/s);
  assert(lightModeMatch, 'Light mode --color-table-row-hover token must exist in :root');
  const lightColor = lightModeMatch[1].trim();
  assert(!lightColor.includes('rgba') && !lightColor.includes('hsla'), `Light mode hover color must be solid/opaque, found: ${lightColor}`);
  assert(lightColor === '#f1f7f8', `Light mode hover color should be #f1f7f8, found: ${lightColor}`);

  // Dark mode check
  const darkModeMatch = globalCssContent.match(/\[data-theme="dark"\]\s*\{[^}]*--color-table-row-hover:\s*([^;]+);/s);
  assert(darkModeMatch, 'Dark mode --color-table-row-hover token must exist in [data-theme="dark"]');
  const darkColor = darkModeMatch[1].trim();
  assert(!darkColor.includes('rgba') && !darkColor.includes('hsla'), `Dark mode hover color must be solid/opaque, found: ${darkColor}`);
  assert(darkColor === '#16243d', `Dark mode hover color should be #16243d, found: ${darkColor}`);
});

runTest('Sticky/frozen columns apply background: var(--color-table-row-hover) on row hover', () => {
  assert(globalCssContent.includes('.test-table-scroll-container tbody tr:hover td.sticky-col-index,'), 'Hover rule for sticky-col-index must exist');
  assert(globalCssContent.includes('.test-table-scroll-container tbody tr:hover td.sticky-col-title'), 'Hover rule for sticky-col-title must exist');
  assert(globalCssContent.includes('background: var(--color-table-row-hover);'), 'Sticky columns must use --color-table-row-hover on hover');
});

// Non-regression: Column order and features preserved
runTest('Preserves exact column sequence from BUG-103 and FEATURE-040', () => {
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

  assert(indexTh < titleTh && titleTh < typeTh && typeTh < statusTh && statusTh < createdTh && 
         createdTh < durationTh && durationTh < liveForTh && liveForTh < passingTh && 
         passingTh < candidatesTh && candidatesTh < roomsTh && roomsTh < questionSetTh && 
         questionSetTh < actionsTh, 'Column sequence must remain completely preserved');
});

console.log(`\n======================================================`);
console.log(`RESULTS: ${passedTests}/${totalTests} Passed`);
console.log(`======================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
