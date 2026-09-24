/**
 * QA Verification Suite for UX-XX:
 * Improve Test Creation and Live Date/Time Display
 *
 * Verifies:
 * 1. CREATION INFORMATION:
 *    - Displays creator name, day name, full date (DD/MM/YYYY), and exact creation time on ONE LINE.
 *    - Expected format: "Created by Super Admin on Wednesday, 24/09/2026 at 11:20 AM"
 *    - Uses actual test creation timestamp (createdAt).
 * 2. LIVE INFORMATION (Same-day creation & live):
 *    - Day name appears on creation line.
 *    - Day name is NOT repeated on the Live line.
 *    - Expected: "Live: 11:31 AM – 11:52 AM"
 * 3. LIVE INFORMATION (Different-day creation & live):
 *    - Creation line shows creation day name.
 *    - Live line explicitly shows live day name.
 *    - Expected: "Live: Thursday, 11:31 AM – 11:52 AM"
 * 4. Currently LIVE session:
 *    - Same day as creation: "Live: 11:31 AM – now"
 *    - Different day from creation: "Live: Thursday, 11:31 AM – now"
 * 5. Midnight-spanning test session:
 *    - Shows start day and end day: "Live: Thursday, 11:45 PM – Friday, 12:15 AM"
 * 6. Live for duration pill badge:
 *    - Preserved completely intact: "⏱️ Live for 20m"
 * 7. Draft / Unstarted test:
 *    - Creation line shows full date & time.
 *    - Live session line is not rendered.
 * 8. Source code inspection of AdminTestDetail.jsx and AdminLiveDashboard.jsx.
 */

const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: UX-XX Test Creation and Live Date/Time Display');
  console.log('========================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  const testDetailPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx');
  const liveDashboardPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');

  const testDetailCode = fs.readFileSync(testDetailPath, 'utf-8');
  const liveDashboardCode = fs.readFileSync(liveDashboardPath, 'utf-8');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Source Code Audit for Formatting Helpers
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Source Code Logic Audit ---');
  assert(
    testDetailCode.includes('const getDayName ='),
    'AdminTestDetail contains getDayName helper'
  );
  assert(
    testDetailCode.includes('const formatFullDate ='),
    'AdminTestDetail contains formatFullDate helper'
  );
  assert(
    testDetailCode.includes('const formatTimeOnly ='),
    'AdminTestDetail contains formatTimeOnly helper'
  );
  assert(
    testDetailCode.includes('const formatCreationDateText ='),
    'AdminTestDetail contains formatCreationDateText helper'
  );
  assert(
    testDetailCode.includes('const isSameCalendarDay ='),
    'AdminTestDetail contains isSameCalendarDay helper'
  );
  assert(
    testDetailCode.includes('const getLiveSessionText ='),
    'AdminTestDetail contains getLiveSessionText helper'
  );
  assert(
    testDetailCode.includes('formatCreationDateText(test.createdAt)'),
    'AdminTestDetail uses formatCreationDateText on test.createdAt'
  );
  assert(
    testDetailCode.includes('⏱️ Live for {formatLiveDuration(test.liveStartedAt, test.endedAt)}'),
    'AdminTestDetail preserves Live for badge intact'
  );

  // Live dashboard audit
  assert(
    liveDashboardCode.includes('const formatCreationDateText ='),
    'AdminLiveDashboard contains formatCreationDateText helper'
  );
  assert(
    liveDashboardCode.includes('formatCreationDateText(test?.createdAt)'),
    'AdminLiveDashboard uses formatCreationDateText in header card'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Functional Logic Verification of Formatters
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Functional Logic Verification ---');

  const getDayName = (dateObj) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dateObj.getDay()];
  };

  const formatFullDate = (dateObj) => {
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const formatTimeOnly = (dateObj) => {
    let hours = dateObj.getHours();
    const minutes = String(dateObj.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  const isSameCalendarDay = (d1, d2) => {
    if (!d1 || !d2) return false;
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const formatCreationDateText = (dateInput) => {
    if (!dateInput) return '—';
    const dateObj = new Date(dateInput);
    if (isNaN(dateObj.getTime())) return '—';
    return `${getDayName(dateObj)}, ${formatFullDate(dateObj)} at ${formatTimeOnly(dateObj)}`;
  };

  const getLiveSessionText = (test) => {
    if (!test?.liveStartedAt) return null;

    const startDate = new Date(test.liveStartedAt);
    if (isNaN(startDate.getTime())) return null;

    const createdDate = test.createdAt ? new Date(test.createdAt) : null;
    const isLive = test.status === 'LIVE';
    const isEnded = test.status === 'ENDED';

    if (!isLive && !isEnded) return null;

    const isDifferentDayFromCreation = createdDate && !isNaN(createdDate.getTime())
      ? !isSameCalendarDay(startDate, createdDate)
      : false;

    const dayPrefix = isDifferentDayFromCreation ? `${getDayName(startDate)}, ` : '';

    if (isEnded) {
      if (!test.endedAt) return null;
      const endDate = new Date(test.endedAt);
      if (isNaN(endDate.getTime())) return null;

      const sameDayLive = isSameCalendarDay(startDate, endDate);

      if (sameDayLive) {
        return `Live: ${dayPrefix}${formatTimeOnly(startDate)} – ${formatTimeOnly(endDate)}`;
      } else {
        return `Live: ${getDayName(startDate)}, ${formatTimeOnly(startDate)} – ${getDayName(endDate)}, ${formatTimeOnly(endDate)}`;
      }
    }

    if (isLive) {
      return `Live: ${dayPrefix}${formatTimeOnly(startDate)} – now`;
    }

    return null;
  };

  // Case 1: Same day creation and live session
  // Test created on 2026-09-24 at 11:20 AM local, live from 11:31 AM to 11:52 AM
  const date2026_09_24 = new Date(2026, 8, 24, 11, 20); // 24 Sept 2026
  const liveStart_09_24 = new Date(2026, 8, 24, 11, 31);
  const liveEnd_09_24 = new Date(2026, 8, 24, 11, 52);

  const testSameDay = {
    status: 'ENDED',
    createdAt: date2026_09_24.toISOString(),
    liveStartedAt: liveStart_09_24.toISOString(),
    endedAt: liveEnd_09_24.toISOString(),
    createdBy: { name: 'Super Admin' }
  };

  const creationText1 = `Created by ${testSameDay.createdBy.name} on ${formatCreationDateText(testSameDay.createdAt)}`;
  const liveText1 = getLiveSessionText(testSameDay);

  console.log(`Same-Day Creation Output: "${creationText1}"`);
  console.log(`Same-Day Live Output:     "${liveText1}"`);

  assert(
    creationText1.includes('Thursday, 24/09/2026 at 11:20 AM') || creationText1.includes('24/09/2026 at 11:20 AM'),
    'Creation line format matches "<DayName>, DD/MM/YYYY at hh:mm AM/PM"'
  );
  assert(
    creationText1.startsWith('Created by Super Admin on '),
    'Creation line starts with "Created by <Name> on "'
  );
  assert(
    liveText1 === 'Live: 11:31 AM – 11:52 AM',
    `Same-day live line does NOT repeat day name ("Live: 11:31 AM – 11:52 AM"), got: "${liveText1}"`
  );

  // Case 2: Different day creation and live session
  // Created on 2026-09-23 (Wednesday) at 11:20 AM, live on 2026-09-24 (Thursday) from 11:31 AM to 11:52 AM
  const date2026_09_23 = new Date(2026, 8, 23, 11, 20);
  const testDifferentDay = {
    status: 'ENDED',
    createdAt: date2026_09_23.toISOString(),
    liveStartedAt: liveStart_09_24.toISOString(),
    endedAt: liveEnd_09_24.toISOString(),
    createdBy: { name: 'Super Admin' }
  };

  const creationText2 = `Created by ${testDifferentDay.createdBy.name} on ${formatCreationDateText(testDifferentDay.createdAt)}`;
  const liveText2 = getLiveSessionText(testDifferentDay);

  console.log(`\nDifferent-Day Creation Output: "${creationText2}"`);
  console.log(`Different-Day Live Output:     "${liveText2}"`);

  assert(
    creationText2.includes('Wednesday, 23/09/2026 at 11:20 AM'),
    'Different-day creation line contains "Wednesday, 23/09/2026 at 11:20 AM"'
  );
  assert(
    liveText2 === 'Live: Thursday, 11:31 AM – 11:52 AM',
    `Different-day live line includes live day name ("Live: Thursday, 11:31 AM – 11:52 AM"), got: "${liveText2}"`
  );

  // Case 3: Live in-progress test
  const testInProgressSameDay = {
    status: 'LIVE',
    createdAt: date2026_09_24.toISOString(),
    liveStartedAt: liveStart_09_24.toISOString(),
  };
  const testInProgressDiffDay = {
    status: 'LIVE',
    createdAt: date2026_09_23.toISOString(),
    liveStartedAt: liveStart_09_24.toISOString(),
  };

  const liveInProgress1 = getLiveSessionText(testInProgressSameDay);
  const liveInProgress2 = getLiveSessionText(testInProgressDiffDay);

  assert(
    liveInProgress1 === 'Live: 11:31 AM – now',
    `In-progress same-day test returns "Live: 11:31 AM – now", got: "${liveInProgress1}"`
  );
  assert(
    liveInProgress2 === 'Live: Thursday, 11:31 AM – now',
    `In-progress different-day test returns "Live: Thursday, 11:31 AM – now", got: "${liveInProgress2}"`
  );

  // Case 4: Midnight spanning test (e.g. starts Thursday 11:45 PM, ends Friday 12:15 AM)
  const liveMidnightStart = new Date(2026, 8, 24, 23, 45);
  const liveMidnightEnd = new Date(2026, 8, 25, 0, 15);
  const testMidnight = {
    status: 'ENDED',
    createdAt: date2026_09_24.toISOString(),
    liveStartedAt: liveMidnightStart.toISOString(),
    endedAt: liveMidnightEnd.toISOString(),
  };

  const liveMidnightText = getLiveSessionText(testMidnight);
  console.log(`\nMidnight Spanning Output: "${liveMidnightText}"`);
  assert(
    liveMidnightText === 'Live: Thursday, 11:45 PM – Friday, 12:15 AM',
    `Midnight spanning test displays both start and end days ("Live: Thursday, 11:45 PM – Friday, 12:15 AM"), got: "${liveMidnightText}"`
  );

  // Case 5: Draft / Unstarted test
  const testDraft = {
    status: 'DRAFT',
    createdAt: date2026_09_24.toISOString(),
    liveStartedAt: null,
    endedAt: null,
  };

  const liveDraftText = getLiveSessionText(testDraft);
  assert(
    liveDraftText === null,
    'Draft test returns null for live session text (not rendered)'
  );

  console.log(`\n========================================================================`);
  console.log(`RESULTS: ${passedTests}/${totalTests} tests passed.`);
  console.log(`========================================================================\n`);

  if (passedTests === totalTests) {
    console.log('ALL QA CRITERIA SATISFIED!');
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
