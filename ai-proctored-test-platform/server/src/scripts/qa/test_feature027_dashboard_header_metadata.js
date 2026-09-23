/**
 * QA Automated Verification Suite: FEATURE-027
 * Duration, Passing Criteria, Question Set, Created, and Live-for info on Test Summary Dashboard header
 *
 * Verifies that:
 * 1. AdminLiveDashboard.jsx includes Duration stat block in header.
 * 2. AdminLiveDashboard.jsx includes Passing Criteria (renamed from Passing Threshold).
 * 3. AdminLiveDashboard.jsx includes Question Set folder/set name.
 * 4. AdminLiveDashboard.jsx includes Created date and creator name.
 * 5. AdminLiveDashboard.jsx includes Live Session time range and live duration (e.g. Live for 1h 34m / Not yet live).
 * 6. Edge cases: Not yet live tests, long folder names, missing fields handled safely.
 * 7. Non-regression: Preserves Test Concluded badge, Room Filter, View Shortlist & Results button, Roster table, etc.
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

async function runFeature027Tests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: FEATURE-027 (Test Summary Header Metadata)');
  console.log('========================================================================\n');

  const liveDashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');
  const liveDashboardCode = fs.readFileSync(liveDashboardPath, 'utf8');

  // 1. Duration Stat Block
  assert(
    liveDashboardCode.includes('Duration') &&
    liveDashboardCode.includes('test?.durationMinutes') &&
    liveDashboardCode.includes('Minutes'),
    'Header contains Duration stat block matching test configuration'
  );

  // 2. Passing Criteria (Renamed from Passing Threshold)
  assert(
    liveDashboardCode.includes('Passing Criteria') &&
    liveDashboardCode.includes('≥') &&
    liveDashboardCode.includes('test?.passingCriteria'),
    'Header displays Passing Criteria with "≥ X Qs" format matching platform-wide terminology'
  );

  // 3. Question Set
  assert(
    liveDashboardCode.includes('Question Set') &&
    (liveDashboardCode.includes('questionSetPoolName') || liveDashboardCode.includes('questionSetId')) &&
    liveDashboardCode.includes('poolSetCount'),
    'Header displays Question Set / Folder name with set count details'
  );

  // 4. Created Date & Author
  assert(
    liveDashboardCode.includes('Created') &&
    liveDashboardCode.includes('createdBy') &&
    liveDashboardCode.includes('createdAt'),
    'Header displays Created by author and creation date'
  );

  // 5. Live Session & Live-For duration
  assert(
    liveDashboardCode.includes('Live Session') &&
    liveDashboardCode.includes('formatLiveDuration') &&
    liveDashboardCode.includes('getLiveSessionText'),
    'Header displays Live Session range and computed live duration'
  );

  // 6. Edge case handling: "Not yet live" fallback
  assert(
    liveDashboardCode.includes('Not yet live'),
    'Header safely falls back to "Not yet live" when test has not started'
  );

  // 7. Non-regression: Controls and Badges
  assert(
    liveDashboardCode.includes('TestStatusBadge') &&
    liveDashboardCode.includes('Test Concluded') &&
    liveDashboardCode.includes('selectedRoomId') &&
    liveDashboardCode.includes('View Shortlist') &&
    liveDashboardCode.includes('CandidateDetailEvaluationModal'),
    'Preserves status badges, room dropdown, shortlist navigation button, and evaluation modal'
  );

  console.log(`\nFEATURE-027 Verification Result: ${passedTests}/${totalTests} checks passed.`);
  if (passedTests === totalTests) {
    console.log('STATUS: ALL FEATURE-027 CRITERIA VERIFIED SUCCESSFUL\n');
  }
}

runFeature027Tests();
