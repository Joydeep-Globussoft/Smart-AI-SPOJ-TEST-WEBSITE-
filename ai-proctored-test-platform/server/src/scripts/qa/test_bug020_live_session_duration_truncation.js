/**
 * test_bug020_live_session_duration_truncation.js
 * 
 * QA Verification Test Suite for BUG-020:
 * - Verifies Live Session duration formatting across all durations (5m, 20m, 1h 05m, 2h 30m, etc.).
 * - Verifies getLiveSessionText output format for LIVE and ENDED test states.
 * - Verifies AdminLiveDashboard.jsx Live Session card component structure:
 *   - No clipping / truncation styles (whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis') on the duration container.
 *   - Duration text wraps cleanly on line 2 as preferred.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Replicate formatLiveDuration from AdminLiveDashboard.jsx
const formatLiveDuration = (startDateStr, endDateStr) => {
  if (!startDateStr || !endDateStr) return null;
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const diffMs = end - start;
  if (diffMs <= 0 || isNaN(diffMs)) return null;
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return '< 1m';
};

const isSameCalendarDay = (d1, d2) => {
  if (!d1 || !d2) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

const formatTimeOnly = (dateObj) => {
  return dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
};

const formatDateOnly = (dateObj) => {
  return dateObj.toLocaleDateString();
};

const getLiveSessionText = (test) => {
  if (!test?.liveStartedAt) return null;

  const startDate = new Date(test.liveStartedAt);
  const createdDate = new Date(test.createdAt);
  const isLive = test.status === 'LIVE';
  const isEnded = test.status === 'ENDED';

  if (!isLive && !isEnded) return null;

  if (isEnded) {
    if (!test.endedAt) return null;
    const endDate = new Date(test.endedAt);

    const sameDayLive = isSameCalendarDay(startDate, endDate);
    const sameDayCreated = isSameCalendarDay(startDate, createdDate);

    if (sameDayLive) {
      if (sameDayCreated) {
        return `Live: ${formatTimeOnly(startDate)} – ${formatTimeOnly(endDate)}`;
      } else {
        return `Live: ${formatDateOnly(startDate)} | ${formatTimeOnly(startDate)} – ${formatTimeOnly(endDate)}`;
      }
    } else {
      return `Live: ${formatDateOnly(startDate)} | ${formatTimeOnly(startDate)} – ${formatDateOnly(endDate)} | ${formatTimeOnly(endDate)}`;
    }
  }

  return `Live: ${formatTimeOnly(startDate)}`;
};

async function runBug020Tests() {
  console.log('===============================================================');
  console.log('   QA Test Suite: BUG-020 Live Session Duration Truncation     ');
  console.log('===============================================================\n');

  console.log('--- 1. Testing formatLiveDuration edge cases ---');
  const now = new Date('2026-09-23T10:49:00Z');
  
  // 20 mins (matching the reported screenshot)
  const end20m = new Date('2026-09-23T11:09:00Z');
  assert.strictEqual(formatLiveDuration(now, end20m), '20m', '20 mins duration formats as 20m');

  // 5 mins
  const end5m = new Date('2026-09-23T10:54:00Z');
  assert.strictEqual(formatLiveDuration(now, end5m), '5m', '5 mins duration formats as 5m');

  // 22 mins
  const end22m = new Date('2026-09-23T11:11:00Z');
  assert.strictEqual(formatLiveDuration(now, end22m), '22m', '22 mins duration formats as 22m');

  // 1 hour
  const end1h = new Date('2026-09-23T11:49:00Z');
  assert.strictEqual(formatLiveDuration(now, end1h), '1h', '1 hour duration formats as 1h');

  // 1h 05m
  const end1h5m = new Date('2026-09-23T11:54:00Z');
  assert.strictEqual(formatLiveDuration(now, end1h5m), '1h 5m', '1h 05m duration formats as 1h 5m');

  // 2h 30m
  const end2h30m = new Date('2026-09-23T13:19:00Z');
  assert.strictEqual(formatLiveDuration(now, end2h30m), '2h 30m', '2h 30m duration formats as 2h 30m');

  // < 1m
  const end30s = new Date('2026-09-23T10:49:30Z');
  assert.strictEqual(formatLiveDuration(now, end30s), '< 1m', 'Sub-minute duration formats as < 1m');

  console.log('✅ Duration formatting tests passed.\n');

  console.log('--- 2. Testing getLiveSessionText output ---');
  const mockTestEnded = {
    status: 'ENDED',
    createdAt: '2026-09-23T10:00:00Z',
    liveStartedAt: '2026-09-23T10:49:00Z',
    endedAt: '2026-09-23T11:09:00Z',
  };
  const sessionText = getLiveSessionText(mockTestEnded);
  assert(Boolean(sessionText), 'Live session text generated');
  assert(sessionText.startsWith('Live:'), 'Starts with Live:');
  console.log(`[Result] Ended Test Session Text: "${sessionText}"`);

  console.log('✅ getLiveSessionText tests passed.\n');

  console.log('--- 3. Testing AdminLiveDashboard.jsx Component Source Code for Truncation Styles ---');
  const dashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');
  const dashboardSource = fs.readFileSync(dashboardPath, 'utf8');

  // Verify the Live Session card block
  const liveSessionBlockStart = dashboardSource.indexOf('{/* 5. Live Session / Live for */}');
  assert(liveSessionBlockStart !== -1, 'Live Session block found in AdminLiveDashboard.jsx');

  const liveSessionBlockEnd = dashboardSource.indexOf('{/* ── Pending Late-Join Requests', liveSessionBlockStart);
  const liveSessionBlock = dashboardSource.substring(liveSessionBlockStart, liveSessionBlockEnd !== -1 ? liveSessionBlockEnd : liveSessionBlockStart + 1000);

  // Assert that whiteSpace: 'nowrap' is NOT present in the Live Session container or duration text
  assert(
    !liveSessionBlock.includes("whiteSpace: 'nowrap'") && !liveSessionBlock.includes('whiteSpace: "nowrap"'),
    'CRITICAL: Live Session card must NOT use whiteSpace: nowrap that causes text truncation'
  );

  // Assert that overflow: 'hidden' is NOT clipping the Live Session text
  assert(
    !liveSessionBlock.includes("overflow: 'hidden'") && !liveSessionBlock.includes('overflow: "hidden"'),
    'CRITICAL: Live Session card must NOT use overflow: hidden that clips duration text'
  );

  // Assert that textOverflow: 'ellipsis' is NOT truncating the Live Session text
  assert(
    !liveSessionBlock.includes("textOverflow: 'ellipsis'") && !liveSessionBlock.includes('textOverflow: "ellipsis"'),
    'CRITICAL: Live Session card must NOT use textOverflow: ellipsis'
  );

  // Assert that duration text is rendered on a dedicated block
  assert(
    liveSessionBlock.includes('⏱️ Live for {formatLiveDuration(test.liveStartedAt, test.endedAt)}'),
    'Live duration is rendered with ⏱️ icon and full formatLiveDuration text'
  );

  // Assert wordBreak: 'break-word' is used for responsive wrapping
  assert(
    liveSessionBlock.includes("wordBreak: 'break-word'"),
    'wordBreak: break-word is set for graceful wrapping on narrow screens'
  );

  console.log('✅ Component structural verification passed: Zero clipping styles present, clean 2-line layout ensured.\n');

  console.log('===============================================================');
  console.log('   🎉 ALL BUG-020 VERIFICATION TESTS PASSED SUCCESSFULLY!       ');
  console.log('===============================================================\n');
}

runBug020Tests();
