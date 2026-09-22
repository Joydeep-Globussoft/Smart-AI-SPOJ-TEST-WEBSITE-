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
console.log('FEATURE-022 TEST SUITE: Advanced Filters & Sort in Test Management');
console.log('======================================================\n');

const testControllerPath = path.join(__dirname, '../../controllers/testController.js');
const adminTestsPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminTests.jsx');

const testControllerContent = fs.readFileSync(testControllerPath, 'utf8');
const adminTestsContent = fs.readFileSync(adminTestsPath, 'utf8');

// 1. Backend Data Aggregation Verification
runTest('testController.js enriches getTests with activity metrics (rooms, candidates, violations)', () => {
  assert(testControllerContent.includes('Room.aggregate('), 'Must run Room.aggregate for room status metrics');
  assert(testControllerContent.includes('Submission.aggregate('), 'Must run Submission.aggregate for candidate/disqualification stats');
  assert(testControllerContent.includes('MalpracticeLog.aggregate('), 'Must run MalpracticeLog.aggregate for violations stats');
  assert(testControllerContent.includes('hasActiveRooms: activeRooms > 0'), 'Must include hasActiveRooms flag');
  assert(testControllerContent.includes('hasCandidates: candidateCount > 0'), 'Must include hasCandidates flag');
  assert(testControllerContent.includes('hasViolations: totalViolations > 0'), 'Must include hasViolations flag');
  assert(testControllerContent.includes(".populate('questionSetId', 'name testType folderId')"), 'Must populate folderId on questionSetId');
});

// 2. Main Filter Bar: 3 Primary Filters Unchanged & Preserved
runTest('AdminTests.jsx retains the 3 primary filters unchanged and visible', () => {
  assert(adminTestsContent.includes('Search Tests'), 'Must retain Search Tests input');
  assert(adminTestsContent.includes('Filter by Type'), 'Must retain Filter by Type select');
  assert(adminTestsContent.includes('Filter by Status'), 'Must retain Filter by Status select');
  assert(adminTestsContent.includes("updateFilter('search', e.target.value)"), 'Must wire search to useAdminFilterState');
  assert(adminTestsContent.includes("updateFilter('type', e.target.value)"), 'Must wire type to useAdminFilterState');
  assert(adminTestsContent.includes("updateFilter('status', e.target.value)"), 'Must wire status to useAdminFilterState');
});

// 3. More Filters Button & Badge
runTest('AdminTests.jsx provides a More Filters toggle button with active count badge', () => {
  assert(adminTestsContent.includes('More Filters'), 'Must have More Filters button');
  assert(adminTestsContent.includes('advancedActiveCount > 0'), 'Must check advancedActiveCount for badge display');
  assert(adminTestsContent.includes('({advancedActiveCount})'), 'Must show count indicator badge');
  assert(adminTestsContent.includes('setShowMoreFilters'), 'Must toggle More Filters panel on click');
});

// 4. Sort by Dropdown Positioned on Far Right
runTest('AdminTests.jsx provides a Sort by dropdown on the far right of the filter bar', () => {
  assert(adminTestsContent.includes('Sort by'), 'Must have Sort by dropdown');
  assert(adminTestsContent.includes("marginLeft: 'auto'"), 'Sort by must be positioned on far right');
  assert(adminTestsContent.includes('Newest first'), 'Sort by must include Newest first');
  assert(adminTestsContent.includes('Oldest first'), 'Sort by must include Oldest first');
  assert(adminTestsContent.includes('Duration'), 'Sort by must include Duration');
  assert(adminTestsContent.includes('Alphabetical (A-Z)'), 'Sort by must include Alphabetical (A-Z)');
});

// 5. More Filters Panel: 3 Sections with all 8 Filters
runTest('AdminTests.jsx More Filters panel contains TIMING, CONTENT, and ACTIVITY sections', () => {
  // TIMING
  assert(adminTestsContent.includes('Timing'), 'Must have Timing section header');
  assert(adminTestsContent.includes('Date Created'), 'Must have Date Created filter');
  assert(adminTestsContent.includes('LAST_7_DAYS') && adminTestsContent.includes('LAST_30_DAYS'), 'Must have Date preset options');
  assert(adminTestsContent.includes('Duration'), 'Must have Duration filter');
  assert(adminTestsContent.includes('LE_30') && adminTestsContent.includes('GT_90'), 'Must have Duration bucket options');

  // CONTENT
  assert(adminTestsContent.includes('Content'), 'Must have Content section header');
  assert(adminTestsContent.includes('Passing Criteria'), 'Must have Passing Criteria filter');
  assert(adminTestsContent.includes('NO_MIN') && adminTestsContent.includes('HAS_MIN'), 'Must have Passing Criteria options');
  assert(adminTestsContent.includes('Question Set / Folder'), 'Must have Question Set / Folder filter');
  assert(adminTestsContent.includes('api.getFolders()'), 'Must dynamically populate folders from api.getFolders()');
  assert(adminTestsContent.includes('Language'), 'Must have Language filter');
  assert(adminTestsContent.includes('Python') && adminTestsContent.includes('React') && adminTestsContent.includes('JavaScript'), 'Must include languages');

  // ACTIVITY
  assert(adminTestsContent.includes('Activity'), 'Must have Activity section header');
  assert(adminTestsContent.includes('Room Status'), 'Must have Room Status filter');
  assert(adminTestsContent.includes('HAS_ACTIVE') && adminTestsContent.includes('NO_ACTIVE'), 'Must have Room Status options');
  assert(adminTestsContent.includes('Candidate Activity'), 'Must have Candidate Activity filter');
  assert(adminTestsContent.includes('HAS_CANDIDATES') && adminTestsContent.includes('NO_CANDIDATES'), 'Must have Candidate Activity options');
  assert(adminTestsContent.includes('Violations Present'), 'Must have Violations Present filter');
  assert(adminTestsContent.includes('HAS_VIOLATIONS'), 'Must have Violations Present options');
});

// 6. Active Filter Chips & Clear All
runTest('AdminTests.jsx renders removable active filter chips with individual ✕ and Clear all', () => {
  assert(adminTestsContent.includes('activeChips.length > 0'), 'Chip row must collapse when no filters are active');
  assert(adminTestsContent.includes('Active Filters:'), 'Must label the active filter chips');
  assert(adminTestsContent.includes('chip.onRemove'), 'Each chip must have removal handler');
  assert(adminTestsContent.includes('Clear all'), 'Must include Clear all link/button');
  assert(adminTestsContent.includes('setFilters(DEFAULT_FILTERS)'), 'Clear all must reset filters to default');
});

// 7. AND Filter Combination & Empty State
runTest('AdminTests.jsx combines all filters with strict AND logic and shows clear empty state', () => {
  assert(
    adminTestsContent.includes('matchesType &&') &&
    adminTestsContent.includes('matchesStatus &&') &&
    adminTestsContent.includes('matchesSearch &&') &&
    adminTestsContent.includes('matchesDate &&') &&
    adminTestsContent.includes('matchesDuration &&') &&
    adminTestsContent.includes('matchesPassing &&') &&
    adminTestsContent.includes('matchesFolder &&') &&
    adminTestsContent.includes('matchesLang &&') &&
    adminTestsContent.includes('matchesRoom &&') &&
    adminTestsContent.includes('matchesCandidate &&') &&
    adminTestsContent.includes('matchesViolation'),
    'Must combine all filters with strict AND logic'
  );
  assert(adminTestsContent.includes('No tests match your filter criteria'), 'Must display distinct empty state when filters yield no results');
});

console.log(`\n======================================================`);
console.log(`RESULTS: ${passedTests}/${totalTests} Passed`);
console.log(`======================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
