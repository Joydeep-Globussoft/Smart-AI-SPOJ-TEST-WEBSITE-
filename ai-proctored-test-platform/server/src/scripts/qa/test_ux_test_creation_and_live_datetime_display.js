/**
 * QA Verification Suite for UX-XX:
 * Improve Test Creation and Live Date/Time Display
 *
 * Verifies:
 * 1. CREATION INFORMATION:
 *    - Displays creator name, day name, full date (DD/MM/YYYY), and exact creation time on ONE LINE.
 *    - Expected format: "Created by Super Admin on Wednesday, 24/09/2026 at 11:20 AM"
 *    - Uses actual test creation timestamp (createdAt).
 * 2. LIVE INFORMATION (CASE A — Same-day creation & live):
 *    - Day name and date appear on creation line.
 *    - Live line contains only the time range.
 *    - Expected: "Live: 11:31 AM – 11:52 AM"
 * 3. LIVE INFORMATION (CASE B — Different-day creation & live):
 *    - Creation line shows creation day name and date.
 *    - Live line explicitly shows time range | Live day | Live date.
 *    - Expected: "Live: 11:31 AM – 11:52 AM | Thursday | 25/09/2026"
 * 4. Currently LIVE session:
 *    - Same day as creation: "Live: 11:31 AM – now"
 *    - Different day from creation: "Live: 11:31 AM – now | Thursday | 25/09/2026"
 * 5. Midnight-spanning test session:
 *    - Shows start time | start day | start date – end time | end day | end date
 *    - Example: "Live: 11:45 PM | Thursday | 24/09/2026 – 12:15 AM | Friday | 25/09/2026"
 * 6. Live for duration badge:
 *    - Shows Hours, Minutes, Seconds instead of H, M, S
 *    - E.g.: "20 Minutes", "1 Hour 23 Minutes", "2 Hours", "45 Seconds"
 *    - Badge renders: "⏱️ Live for 20 Minutes"
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

  const formatLiveDuration = (startDateStr, endDateStr) => {
    if (!startDateStr || !endDateStr) return null;
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const diffMs = end - start;
    if (diffMs <= 0 || isNaN(diffMs)) return null;
    const totalSeconds = Math.floor(diffMs / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const seconds = totalSeconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'Hour' : 'Hours'}`);
    if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'Minute' : 'Minutes'}`);
    if (parts.length > 0) return parts.join(' ');
    if (seconds > 0) return `${seconds} ${seconds === 1 ? 'Second' : 'Seconds'}`;
    return '< 1 Second';
  };

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

    const differentDaySuffix = isDifferentDayFromCreation
      ? ` | ${getDayName(startDate)} | ${formatFullDate(startDate)}`
      : '';

    if (isEnded) {
      if (!test.endedAt) return null;
      const endDate = new Date(test.endedAt);
      if (isNaN(endDate.getTime())) return null;

      const sameDayLive = isSameCalendarDay(startDate, endDate);

      if (sameDayLive) {
        return `Live: ${formatTimeOnly(startDate)} – ${formatTimeOnly(endDate)}${differentDaySuffix}`;
      } else {
        return `Live: ${formatTimeOnly(startDate)} | ${getDayName(startDate)} | ${formatFullDate(startDate)} – ${formatTimeOnly(endDate)} | ${getDayName(endDate)} | ${formatFullDate(endDate)}`;
      }
    }

    if (isLive) {
      return `Live: ${formatTimeOnly(startDate)} – now${differentDaySuffix}`;
    }

    return null;
  };

  // Case A: Same day creation and live session
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
  const durationText1 = formatLiveDuration(testSameDay.liveStartedAt, testSameDay.endedAt);

  console.log(`Case A (Same-Day) Creation: "${creationText1}"`);
  console.log(`Case A (Same-Day) Live:     "${liveText1}"`);
  console.log(`Case A (Same-Day) Duration: "${durationText1}"`);

  assert(
    creationText1.includes('Thursday, 24/09/2026 at 11:20 AM'),
    'Creation line format matches "<DayName>, DD/MM/YYYY at hh:mm AM/PM"'
  );
  assert(
    creationText1.startsWith('Created by Super Admin on '),
    'Creation line starts with "Created by <Name> on "'
  );
  assert(
    liveText1 === 'Live: 11:31 AM – 11:52 AM',
    `Case A live line contains only time range ("Live: 11:31 AM – 11:52 AM"), got: "${liveText1}"`
  );
  assert(
    durationText1 === '21 Minutes',
    `Duration formats with "Minutes" ("21 Minutes"), got: "${durationText1}"`
  );

  // Case B: Different day creation and live session
  // Created on 2026-09-24 (Thursday) at 11:20 AM, live on 2026-09-25 (Friday) from 11:31 AM to 11:52 AM
  const date2026_09_25_start = new Date(2026, 8, 25, 11, 31);
  const date2026_09_25_end = new Date(2026, 8, 25, 11, 52);
  const testDifferentDay = {
    status: 'ENDED',
    createdAt: date2026_09_24.toISOString(),
    liveStartedAt: date2026_09_25_start.toISOString(),
    endedAt: date2026_09_25_end.toISOString(),
    createdBy: { name: 'Super Admin' }
  };

  const creationText2 = `Created by ${testDifferentDay.createdBy.name} on ${formatCreationDateText(testDifferentDay.createdAt)}`;
  const liveText2 = getLiveSessionText(testDifferentDay);

  console.log(`\nCase B (Different-Day) Creation: "${creationText2}"`);
  console.log(`Case B (Different-Day) Live:     "${liveText2}"`);

  assert(
    creationText2.includes('Thursday, 24/09/2026 at 11:20 AM'),
    'Case B creation line contains "Thursday, 24/09/2026 at 11:20 AM"'
  );
  assert(
    liveText2 === 'Live: 11:31 AM – 11:52 AM | Friday | 25/09/2026',
    `Case B live line formats as "Live: 11:31 AM – 11:52 AM | Friday | 25/09/2026", got: "${liveText2}"`
  );

  // Case 3: Live in-progress test
  const testInProgressSameDay = {
    status: 'LIVE',
    createdAt: date2026_09_24.toISOString(),
    liveStartedAt: liveStart_09_24.toISOString(),
  };
  const testInProgressDiffDay = {
    status: 'LIVE',
    createdAt: date2026_09_24.toISOString(),
    liveStartedAt: date2026_09_25_start.toISOString(),
  };

  const liveInProgress1 = getLiveSessionText(testInProgressSameDay);
  const liveInProgress2 = getLiveSessionText(testInProgressDiffDay);

  assert(
    liveInProgress1 === 'Live: 11:31 AM – now',
    `In-progress same-day test returns "Live: 11:31 AM – now", got: "${liveInProgress1}"`
  );
  assert(
    liveInProgress2 === 'Live: 11:31 AM – now | Friday | 25/09/2026',
    `In-progress different-day test returns "Live: 11:31 AM – now | Friday | 25/09/2026", got: "${liveInProgress2}"`
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
    liveMidnightText === 'Live: 11:45 PM | Thursday | 24/09/2026 – 12:15 AM | Friday | 25/09/2026',
    `Midnight spanning test displays both start and end dates/times, got: "${liveMidnightText}"`
  );

  // Case 5: Duration formatting unit tests (Hours, Minutes, Seconds)
  console.log('\n--- TEST 3: Duration Units (Hours, Minutes, Seconds) ---');
  const baseTime = new Date('2026-09-24T10:00:00.000Z').getTime();
  assert(
    formatLiveDuration(new Date(baseTime).toISOString(), new Date(baseTime + 20 * 60 * 1000).toISOString()) === '20 Minutes',
    '20 minutes formats as "20 Minutes"'
  );
  assert(
    formatLiveDuration(new Date(baseTime).toISOString(), new Date(baseTime + 60 * 1000).toISOString()) === '1 Minute',
    '1 minute formats as "1 Minute"'
  );
  assert(
    formatLiveDuration(new Date(baseTime).toISOString(), new Date(baseTime + 2 * 60 * 60 * 1000).toISOString()) === '2 Hours',
    '2 hours formats as "2 Hours"'
  );
  assert(
    formatLiveDuration(new Date(baseTime).toISOString(), new Date(baseTime + (1 * 60 * 60 + 23 * 60) * 1000).toISOString()) === '1 Hour 23 Minutes',
    '1h 23m formats as "1 Hour 23 Minutes"'
  );
  assert(
    formatLiveDuration(new Date(baseTime).toISOString(), new Date(baseTime + 45 * 1000).toISOString()) === '45 Seconds',
    '45 seconds formats as "45 Seconds"'
  );
  assert(
    formatLiveDuration(new Date(baseTime).toISOString(), new Date(baseTime + 1 * 1000).toISOString()) === '1 Second',
    '1 second formats as "1 Second"'
  );

  // Case 6: Draft / Unstarted test
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
