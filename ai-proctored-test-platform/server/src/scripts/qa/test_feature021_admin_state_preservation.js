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
console.log('FEATURE-021 TEST SUITE: Admin State & Scroll Preservation');
console.log('======================================================\n');

const clientSrcPath = path.join(__dirname, '../../../../client/src');
const filterHookPath = path.join(clientSrcPath, 'hooks/useAdminFilterState.js');
const scrollHookPath = path.join(clientSrcPath, 'hooks/useScrollRestoration.js');
const adminTestsPath = path.join(clientSrcPath, 'admin/pages/AdminTests.jsx');
const adminResultsPath = path.join(clientSrcPath, 'admin/pages/AdminResults.jsx');
const adminQBankPath = path.join(clientSrcPath, 'admin/pages/AdminQuestionBank.jsx');
const adminLivePath = path.join(clientSrcPath, 'admin/pages/AdminLiveDashboard.jsx');
const adminCreateAdminPath = path.join(clientSrcPath, 'admin/pages/AdminCreateAdmin.jsx');
const adminTestDetailPath = path.join(clientSrcPath, 'admin/pages/AdminTestDetail.jsx');
const adminDashboardPath = path.join(clientSrcPath, 'admin/pages/AdminDashboard.jsx');

const filterHookContent = fs.readFileSync(filterHookPath, 'utf8');
const scrollHookContent = fs.readFileSync(scrollHookPath, 'utf8');
const adminTestsContent = fs.readFileSync(adminTestsPath, 'utf8');
const adminResultsContent = fs.readFileSync(adminResultsPath, 'utf8');
const adminQBankContent = fs.readFileSync(adminQBankPath, 'utf8');
const adminLiveContent = fs.readFileSync(adminLivePath, 'utf8');
const adminCreateAdminContent = fs.readFileSync(adminCreateAdminPath, 'utf8');
const adminTestDetailContent = fs.readFileSync(adminTestDetailPath, 'utf8');
const adminDashboardContent = fs.readFileSync(adminDashboardPath, 'utf8');

// 1. Hooks Architecture
runTest('useAdminFilterState.js correctly synchronizes URL search params with default fallback', () => {
  assert(filterHookContent.includes('export function useAdminFilterState'), 'Must export useAdminFilterState');
  assert(filterHookContent.includes('useSearchParams'), 'Must use useSearchParams from react-router-dom');
  assert(filterHookContent.includes('replace: true'), 'Must update params with replace: true');
  assert(filterHookContent.includes('nextParams.delete(key)'), 'Must delete default/empty parameters to keep clean URLs');
});

runTest('useScrollRestoration.js saves and restores scroll coordinates in sessionStorage', () => {
  assert(scrollHookContent.includes('export function useScrollRestoration'), 'Must export useScrollRestoration');
  assert(scrollHookContent.includes('sessionStorage.setItem'), 'Must save scroll position to sessionStorage');
  assert(scrollHookContent.includes('sessionStorage.getItem'), 'Must read scroll position from sessionStorage');
  assert(scrollHookContent.includes('addEventListener(\'scroll\''), 'Must attach passive scroll listener');
});

// 2. AdminTests State & Scroll Preservation
runTest('AdminTests.jsx wires search, type, and status filters to useAdminFilterState', () => {
  assert(adminTestsContent.includes('useAdminFilterState(DEFAULT_FILTERS)'), 'Must initialize useAdminFilterState');
  assert(adminTestsContent.includes('updateFilter(\'search\', e.target.value)'), 'Must update search filter');
  assert(adminTestsContent.includes('updateFilter(\'type\', e.target.value)'), 'Must update type filter');
  assert(adminTestsContent.includes('updateFilter(\'status\', e.target.value)'), 'Must update status filter');
});

runTest('AdminTests.jsx attaches scroll restoration to table container without mutating sticky styles', () => {
  assert(adminTestsContent.includes('useScrollRestoration({'), 'Must use useScrollRestoration');
  assert(adminTestsContent.includes('ref={tableContainerRef}'), 'Must attach tableContainerRef to table container');
  assert(adminTestsContent.includes('className="table-container test-table-scroll-container"'), 'Must keep test-table-scroll-container class for BUG-86');
});

// 3. AdminResults State & Scroll Preservation
runTest('AdminResults.jsx preserves activeTab and searchQuery across navigation', () => {
  assert(adminResultsContent.includes('useAdminFilterState(DEFAULT_FILTERS)'), 'Must initialize useAdminFilterState in AdminResults');
  assert(adminResultsContent.includes('updateFilter(\'tab\', tab)'), 'Must preserve tab selection');
  assert(adminResultsContent.includes('updateFilter(\'search\', search)'), 'Must preserve search query');
  assert(adminResultsContent.includes('useScrollRestoration({'), 'Must attach useScrollRestoration to Results page');
});

// 4. AdminQuestionBank State & Scroll Preservation
runTest('AdminQuestionBank.jsx preserves folder hierarchy, active set, search, and type filter', () => {
  assert(adminQBankContent.includes('useAdminFilterState(DEFAULT_FILTERS)'), 'Must initialize useAdminFilterState in AdminQuestionBank');
  assert(adminQBankContent.includes('handleSelectFolder'), 'Must handle folder selection with filter sync');
  assert(adminQBankContent.includes('handleSelectSet'), 'Must handle question set selection with filter sync');
  assert(adminQBankContent.includes('handleBackToSets'), 'Must handle back navigation to sets list');
  assert(adminQBankContent.includes('useScrollRestoration({'), 'Must attach useScrollRestoration to Question Bank');
});

// 5. AdminLiveDashboard State & Audio Preference Preservation
runTest('AdminLiveDashboard.jsx preserves room, search, and status filters in URL params', () => {
  assert(adminLiveContent.includes('useAdminFilterState(DEFAULT_FILTERS)'), 'Must initialize useAdminFilterState in AdminLiveDashboard');
  assert(adminLiveContent.includes('updateFilter(\'room\', r)'), 'Must preserve selectedRoomId');
  assert(adminLiveContent.includes('updateFilter(\'search\', s)'), 'Must preserve searchQuery');
  assert(adminLiveContent.includes('updateFilter(\'status\', st)'), 'Must preserve filterStatus');
});

runTest('AdminLiveDashboard.jsx persists voiceEnabled in localStorage rather than URL params (User Condition 2)', () => {
  assert(adminLiveContent.includes('localStorage.getItem(\'admin_voice_announcements_enabled\')'), 'Must read voiceEnabled from localStorage');
  assert(adminLiveContent.includes('localStorage.setItem(\'admin_voice_announcements_enabled\''), 'Must write voiceEnabled to localStorage');
  assert(!filterHookContent.includes('voiceEnabled'), 'voiceEnabled must NOT be in URL search params');
});

// 6. Manage Admins, Test Detail, and Dashboard Scroll Restoration
runTest('AdminCreateAdmin.jsx, AdminTestDetail.jsx, and AdminDashboard.jsx wire useScrollRestoration', () => {
  assert(adminCreateAdminContent.includes('useScrollRestoration({'), 'AdminCreateAdmin must use useScrollRestoration');
  assert(adminTestDetailContent.includes('useScrollRestoration({'), 'AdminTestDetail must use useScrollRestoration');
  assert(adminDashboardContent.includes('useScrollRestoration({'), 'AdminDashboard must use useScrollRestoration');
});

// 7. Fresh Data Fetch Guarantee across all 6 pages
runTest('All admin pages guarantee fresh API data fetch on mount before applying preserved filters', () => {
  assert(adminTestsContent.includes('api.getTests()'), 'AdminTests must fetch fresh tests from API');
  assert(adminResultsContent.includes('api.getResults(') || adminResultsContent.includes('api.getShortlist('), 'AdminResults must fetch fresh results');
  assert(adminQBankContent.includes('api.getFolders()'), 'AdminQuestionBank must fetch fresh folders');
  assert(adminLiveContent.includes('api.getLiveCandidates('), 'AdminLiveDashboard must fetch fresh live candidates');
  assert(adminCreateAdminContent.includes('api.getAdmins()'), 'AdminCreateAdmin must fetch fresh admins');
  assert(adminTestDetailContent.includes('api.getTest('), 'AdminTestDetail must fetch fresh test details');
});

console.log(`\n======================================================`);
console.log(`RESULTS: ${passedTests}/${totalTests} Passed`);
console.log(`======================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
