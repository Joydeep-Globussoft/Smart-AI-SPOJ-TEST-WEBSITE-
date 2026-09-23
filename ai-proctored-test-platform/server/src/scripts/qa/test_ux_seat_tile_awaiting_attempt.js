/**
 * QA Test Suite: UX-XX
 * Remove Duplicate "Not Started" Status from Candidate Card (SeatTile)
 * Verify main status shows "Not started" and bottom line shows "Awaiting attempt"
 */

const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('===============================================================');
  console.log('   QA Test Suite: Candidate Card Awaiting Attempt Status      ');
  console.log('===============================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  const liveDashboardPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');
  const liveDashboardCode = fs.readFileSync(liveDashboardPath, 'utf-8');

  // 1. Extract SeatTile component
  const normalizedCode = liveDashboardCode.replace(/\r\n/g, '\n');
  const startIdx = normalizedCode.indexOf('const SeatTile = memo(');
  const endIdx = normalizedCode.indexOf('const CandidateRowItem = memo(');
  const seatTileCode = startIdx !== -1 && endIdx !== -1 ? normalizedCode.substring(startIdx, endIdx) : '';

  assert(Boolean(seatTileCode), 'AdminLiveDashboard: Found SeatTile component definition');

  if (seatTileCode) {
    // 2. Check main status line retains "Not started"
    assert(
      seatTileCode.includes("? 'Not started'") &&
      seatTileCode.includes("candidate.status === 'NOT_STARTED'"),
      'SeatTile: Main status line retains "Not started" for unstarted candidate'
    );

    // 3. Check bottom line displays "Awaiting attempt"
    assert(
      seatTileCode.includes("return 'Awaiting attempt';"),
      'SeatTile: Bottom line returns "Awaiting attempt" for unstarted candidate'
    );

    // 4. Check that SeatTile does not return duplicate 'Not started' from formattedTimer
    const formattedTimerMatch = seatTileCode.match(/const formattedTimer = useMemo\(\(\) => \{[\s\S]*?\}, \[/);
    assert(Boolean(formattedTimerMatch), 'Extracted formattedTimer from SeatTile');
    if (formattedTimerMatch) {
      const timerCode = formattedTimerMatch[0];
      assert(
        !timerCode.includes("return 'Not started';"),
        'SeatTile formattedTimer does NOT return duplicate "Not started"'
      );
    }

    // 5. In-Progress and Submitted states preserved
    assert(
      seatTileCode.includes("return 'Submitted';") &&
      seatTileCode.includes("return 'Disqualified';") &&
      seatTileCode.includes("left"),
      'SeatTile: Submitted, Disqualified, and active countdown timer formats preserved'
    );
  }

  console.log('\n---------------------------------------------------------------');
  console.log(`Results: ${passedTests} / ${totalTests} assertions passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('---------------------------------------------------------------\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL CANDIDATE CARD AWAITING ATTEMPT TESTS PASSED SUCCESSFULLY!\n');
  } else {
    console.error('⚠️ SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
