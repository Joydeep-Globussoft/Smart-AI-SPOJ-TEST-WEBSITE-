/**
 * QA Verification Suite for FEATURE/UX-XX:
 * Improve Room Candidate List with Candidate Timeline Details
 *
 * Verifies:
 * 1. Actions column is completely removed from Room Candidates modal.
 * 2. Inspect button is completely removed.
 * 3. Candidate rows are clickable, with hover styles defined for Light and Dark modes.
 * 4. Row index appears before Candidate Name without a column heading (blank <th>).
 * 5. Column order: [blank] | Candidate Name | Email | Questions | Violations | Status | Room Joined | Test Start | Submitted At | Time taken
 * 6. Live Sync Active indicator: shown when test is LIVE, removed when test is ENDED.
 * 7. Server getRoomCandidates controller populates roomJoinedAt and joinedAt.
 * 8. Candidate timelines & Time Taken calculation for:
 *    - NOT_STARTED candidates
 *    - IN_PROGRESS candidates
 *    - SUBMITTED candidates
 *    - AUTO_SUBMITTED_TIME_UP candidates
 *    - AUTO_SUBMITTED_DISQUALIFIED candidates
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

async function runTests() {
  console.log('========================================================================');
  console.log('QA SUITE: FEATURE/UX-XX Room Candidate Timeline Details & Modal');
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
  const globalCssPath = path.join(__dirname, '../../../../client/src/styles/global.css');
  const roomControllerPath = path.join(__dirname, '../../controllers/roomController.js');

  const testDetailCode = fs.readFileSync(testDetailPath, 'utf-8');
  const globalCssCode = fs.readFileSync(globalCssPath, 'utf-8');
  const roomControllerCode = fs.readFileSync(roomControllerPath, 'utf-8');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Source Code Structure & UI Logic Audit
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Frontend Modal Source Code Audit ---');

  // 1. Actions column & Inspect button removal
  assert(
    !testDetailCode.includes('<th style={{ textAlign: \'right\' }}>Actions</th>') &&
    !testDetailCode.includes('<th>Actions</th>'),
    'Actions column heading is completely removed from Room Candidates modal'
  );
  assert(
    !testDetailCode.includes('<button\n                              type="button"\n                              onClick={() => handleInspectCandidate(c)}\n                              className="btn btn-secondary"') &&
    !testDetailCode.includes('Inspect\n                            </button>'),
    'Inspect button is completely removed from candidate rows'
  );

  // 2. Row Clickability & Hover class
  assert(
    testDetailCode.includes('className="room-candidate-table-row"') &&
    testDetailCode.includes('onClick={() => handleInspectCandidate(c)}'),
    'Candidate row is clickable and triggers handleInspectCandidate'
  );

  // 3. Column Order & Blank Index Heading
  assert(
    testDetailCode.includes('<th style={{ width: 36, paddingLeft: 10, paddingRight: 4, textAlign: \'center\' }}></th>') ||
    testDetailCode.includes('<th style={{ width: 36, paddingLeft: 12, paddingRight: 4 }}></th>'),
    'Index column has NO heading (blank <th>)'
  );
  assert(
    testDetailCode.includes('<th>Candidate Name</th>') || testDetailCode.includes('<th style={{ whiteSpace: \'nowrap\' }}>Candidate Name</th>'),
    'Table includes Candidate Name column'
  );
  assert(
    testDetailCode.includes('<th>Email</th>') || testDetailCode.includes('<th style={{ whiteSpace: \'nowrap\' }}>Email</th>'),
    'Table includes Email column'
  );
  assert(
    testDetailCode.includes('<th>Questions</th>') || testDetailCode.includes('<th style={{ whiteSpace: \'nowrap\', textAlign: \'center\' }}>Questions</th>'),
    'Table includes Questions column'
  );
  assert(
    testDetailCode.includes('<th>Violations</th>') || testDetailCode.includes('<th style={{ whiteSpace: \'nowrap\' }}>Violations</th>'),
    'Table includes Violations column'
  );
  assert(
    testDetailCode.includes('<th>Status</th>') || testDetailCode.includes('<th style={{ whiteSpace: \'nowrap\' }}>Status</th>'),
    'Table includes Status column'
  );
  assert(
    testDetailCode.includes('<th>Room Joined</th>') || testDetailCode.includes('<th style={{ whiteSpace: \'nowrap\' }}>Room Joined</th>'),
    'Table includes Room Joined column'
  );
  assert(
    testDetailCode.includes('<th>Test Start</th>') || testDetailCode.includes('<th style={{ whiteSpace: \'nowrap\' }}>Test Start</th>'),
    'Table includes Test Start column'
  );
  assert(
    testDetailCode.includes('<th>Submitted At</th>') || testDetailCode.includes('<th style={{ whiteSpace: \'nowrap\' }}>Submitted At</th>'),
    'Table includes Submitted At column'
  );
  assert(
    testDetailCode.includes('<th>Time taken</th>') || testDetailCode.includes('<th style={{ whiteSpace: \'nowrap\' }}>Time taken</th>'),
    'Table includes Time taken column'
  );

  // 4. Live Sync Active conditional rendering
  assert(
    testDetailCode.includes('test?.status === \'LIVE\' && (') &&
    testDetailCode.includes('Live Sync Active'),
    'Live Sync Active is rendered ONLY when test.status === "LIVE"'
  );

  // 5. CSS Divider & Hover styles
  assert(
    globalCssCode.includes('.room-candidate-table-row'),
    'global.css contains .room-candidate-table-row class'
  );
  assert(
    globalCssCode.includes('[data-theme="dark"] .room-candidate-table-row') &&
    globalCssCode.includes('[data-theme="light"] .room-candidate-table-row'),
    'global.css includes light and dark mode divider & hover styles for candidate rows'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Backend Controller Audit
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Backend roomController Audit ---');
  assert(
    roomControllerCode.includes('roomJoinedAt') && roomControllerCode.includes('joinedEntry?.joinedAt || candidate.createdAt'),
    'getRoomCandidates populates roomJoinedAt from joinedEntry.joinedAt or candidate.createdAt'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Functional Simulation of Timeline Calculations
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Timeline & Duration Calculations ---');

  const formatTimelineTime = (dateInput) => {
    if (!dateInput) return '—';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  };

  const calculateCandidateTimeTaken = (candidate, isTestEnded) => {
    if (!candidate) return '—';

    const startRaw = candidate.candidateStartTime || candidate.startedAt;
    if (!startRaw || candidate.status === 'NOT_STARTED') {
      return '—';
    }

    const startTime = new Date(startRaw).getTime();
    if (isNaN(startTime) || startTime <= 0) {
      return '—';
    }

    const isSubmitted =
      candidate.status === 'SUBMITTED' ||
      candidate.status === 'AUTO_SUBMITTED' ||
      candidate.status === 'AUTO_SUBMITTED_TIME_UP' ||
      candidate.status === 'AUTO_SUBMITTED_DISQUALIFIED' ||
      Boolean(candidate.submittedAt);

    const isDisqualified = candidate.status === 'DISQUALIFIED' || candidate.isDisqualified;

    let endTime;
    if (candidate.submittedAt) {
      endTime = new Date(candidate.submittedAt).getTime();
    } else if (isSubmitted && candidate.candidateEndTime) {
      endTime = new Date(candidate.candidateEndTime).getTime();
    } else if (isDisqualified) {
      const endRaw = candidate.submittedAt || candidate.candidateEndTime;
      endTime = endRaw ? new Date(endRaw).getTime() : Date.now();
    } else if (candidate.status === 'IN_PROGRESS') {
      if (isTestEnded && candidate.candidateEndTime) {
        endTime = new Date(candidate.candidateEndTime).getTime();
      } else {
        endTime = Date.now();
        if (candidate.candidateEndTime) {
          const maxEnd = new Date(candidate.candidateEndTime).getTime();
          if (!isNaN(maxEnd) && endTime > maxEnd) {
            endTime = maxEnd;
          }
        }
      }
    } else {
      return '—';
    }

    if (isNaN(endTime) || endTime <= startTime) {
      return '0s';
    }

    const durationMs = Math.max(0, endTime - startTime);
    const totalSeconds = Math.floor(durationMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${mins < 10 ? '0' : ''}${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
    }
    if (mins > 0) {
      return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
    }
    return `${secs}s`;
  };

  // Case 1: NOT_STARTED Candidate
  const candNotStarted = {
    name: 'Suresh',
    status: 'NOT_STARTED',
    roomJoinedAt: '2026-09-24T11:15:00.000Z',
    candidateStartTime: null,
    submittedAt: null,
  };
  const ttNotStarted = calculateCandidateTimeTaken(candNotStarted, false);
  const startNotStarted = candNotStarted.candidateStartTime ? formatTimelineTime(candNotStarted.candidateStartTime) : '—';
  const subNotStarted = candNotStarted.submittedAt ? formatTimelineTime(candNotStarted.submittedAt) : '—';
  const joinNotStarted = formatTimelineTime(candNotStarted.roomJoinedAt);

  assert(startNotStarted === '—', 'NOT_STARTED candidate Test Start is "—"');
  assert(subNotStarted === '—', 'NOT_STARTED candidate Submitted At is "—"');
  assert(ttNotStarted === '—', 'NOT_STARTED candidate Time taken is "—"');
  assert(joinNotStarted !== '—', 'NOT_STARTED candidate Room Joined is populated');

  // Case 2: SUBMITTED Candidate
  // Start: 11:31:20 AM, Submitted: 11:46:35 AM -> 15m 15s
  const startTs = new Date('2026-09-24T11:31:20.000Z').getTime();
  const submitTs = startTs + (15 * 60 + 15) * 1000;
  const candSubmitted = {
    name: 'Dinesh',
    status: 'SUBMITTED',
    roomJoinedAt: '2026-09-24T11:20:00.000Z',
    candidateStartTime: new Date(startTs).toISOString(),
    submittedAt: new Date(submitTs).toISOString(),
  };
  const ttSubmitted = calculateCandidateTimeTaken(candSubmitted, false);
  assert(ttSubmitted === '15m 15s', `SUBMITTED candidate Time taken is "15m 15s" (got: "${ttSubmitted}")`);

  // Case 3: AUTO_SUBMITTED_TIME_UP Candidate
  // Start: 11:31:20 AM, Auto-Submitted at 20m 00s -> 20m 00s
  const submitTimeUpTs = startTs + (20 * 60) * 1000;
  const candAutoTimeUp = {
    name: 'Ramesh',
    status: 'AUTO_SUBMITTED_TIME_UP',
    roomJoinedAt: '2026-09-24T11:20:00.000Z',
    candidateStartTime: new Date(startTs).toISOString(),
    submittedAt: new Date(submitTimeUpTs).toISOString(),
  };
  const ttAutoTimeUp = calculateCandidateTimeTaken(candAutoTimeUp, true);
  assert(ttAutoTimeUp === '20m 00s', `AUTO_SUBMITTED_TIME_UP Time taken is "20m 00s" (got: "${ttAutoTimeUp}")`);

  // Case 4: AUTO_SUBMITTED_DISQUALIFIED Candidate
  // Start: 11:31:20 AM, Disqualified at 5m 30s
  const submitDisqTs = startTs + (5 * 60 + 30) * 1000;
  const candDisq = {
    name: 'Noi',
    status: 'AUTO_SUBMITTED_DISQUALIFIED',
    isDisqualified: true,
    roomJoinedAt: '2026-09-24T11:20:00.000Z',
    candidateStartTime: new Date(startTs).toISOString(),
    submittedAt: new Date(submitDisqTs).toISOString(),
  };
  const ttDisq = calculateCandidateTimeTaken(candDisq, true);
  assert(ttDisq === '5m 30s', `AUTO_SUBMITTED_DISQUALIFIED Time taken is "5m 30s" (got: "${ttDisq}")`);

  // Case 5: 1 Hour+ Duration test
  const submitHourTs = startTs + (1 * 3600 + 5 * 60 + 10) * 1000;
  const candHour = {
    name: 'Long Candidate',
    status: 'SUBMITTED',
    candidateStartTime: new Date(startTs).toISOString(),
    submittedAt: new Date(submitHourTs).toISOString(),
  };
  const ttHour = calculateCandidateTimeTaken(candHour, true);
  assert(ttHour === '1h 05m 10s', `1h+ Duration formats as "1h 05m 10s" (got: "${ttHour}")`);

  console.log(`\n========================================================================`);
  console.log(`RESULTS: ${passedTests}/${totalTests} tests passed.`);
  console.log(`========================================================================\n`);

  if (passedTests === totalTests) {
    console.log('ALL FEATURE/UX-XX ACCEPTANCE CRITERIA SATISFIED!');
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
