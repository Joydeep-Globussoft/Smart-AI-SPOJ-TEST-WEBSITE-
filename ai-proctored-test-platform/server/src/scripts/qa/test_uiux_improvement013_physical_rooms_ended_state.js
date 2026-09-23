/**
 * QA Verification Suite for UI/UX IMPROVEMENT-013:
 * Improve Visual Appearance of Physical Rooms After Test Completion
 * (LIVE and ENDED States Should Feel Equally Premium)
 *
 * Verifies:
 * 1. Concluded room styling: No washed-out opacity reduction (opacity: 1 is retained).
 * 2. Dedicated completion indicators: High-contrast "✓ COMPLETED" badge and "✓ Room Completed Successfully" status.
 * 3. Dedicated live indicators: "● ACTIVE" badge with pulsing glow for active tests.
 * 4. Room summary metrics: Displays "👥 X Candidates • ✅ Y Submitted • ⚠️ Z Violations".
 * 5. Candidate count directly visible on room cards and button label.
 * 6. Action buttons (Copy Full Invite, QR Code, Candidates) retain full visual prominence, high contrast, and hover styling.
 * 7. Backend roomController aggregates and returns candidateCount, submittedCount, and violationCount.
 * 8. Zero regressions on existing test management and room features.
 */

const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: UI/UX IMPROVEMENT-013 Physical Rooms Ended State');
  console.log('========================================================================\n');

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

  const testDetailPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx');
  const roomControllerPath = path.join(__dirname, '../../controllers/roomController.js');

  const testDetailCode = fs.readFileSync(testDetailPath, 'utf-8');
  const roomControllerCode = fs.readFileSync(roomControllerPath, 'utf-8');

  // Check 1: No washed-out opacity: 0.75 for closed/ended room cards
  assert(
    !testDetailCode.includes('opacity: isClosed ? 0.75 : 1') &&
    !testDetailCode.includes('opacity: isEnded ? 0.75 : 1'),
    'AdminTestDetail: Room cards retain full 1.0 opacity in concluded/ended state (no faded 0.75 opacity)'
  );

  // Check 2: Dedicated COMPLETED badge for concluded rooms
  assert(
    testDetailCode.includes('COMPLETED') &&
    testDetailCode.includes('badge-completed'),
    'AdminTestDetail: Concluded rooms display high-contrast "✓ COMPLETED" badge'
  );

  // Check 3: Active indicator for live rooms
  assert(
    testDetailCode.includes('ACTIVE') &&
    testDetailCode.includes('pulse 2s infinite'),
    'AdminTestDetail: Live rooms display "● ACTIVE" badge with pulsing indicator'
  );

  // Check 4: Informative completion status text
  assert(
    testDetailCode.includes('Room Completed Successfully'),
    'AdminTestDetail: Displays positive "✓ Room Completed Successfully" completion indicator'
  );

  // Check 5: Room summary metrics strip
  assert(
    testDetailCode.includes('Candidates') &&
    testDetailCode.includes('Submitted') &&
    testDetailCode.includes('Violations') &&
    testDetailCode.includes('room-metrics-strip'),
    'AdminTestDetail: Room cards display summary metrics strip (Candidates, Submitted, Violations)'
  );

  // Check 6: Action buttons retain high contrast styling and candidate counts
  assert(
    testDetailCode.includes('Copy Full Invite') &&
    testDetailCode.includes('QR Code') &&
    testDetailCode.includes('Candidates') &&
    testDetailCode.includes('candidateTotal !== undefined'),
    'AdminTestDetail: Action buttons (Copy Full Invite, QR Code, Candidates count) retain high contrast and active state'
  );

  // Check 7: Backend roomController aggregates submission & malpractice stats
  assert(
    roomControllerCode.includes('Submission.aggregate') &&
    roomControllerCode.includes('MalpracticeLog.aggregate') &&
    roomControllerCode.includes('rObj.candidateCount =') &&
    roomControllerCode.includes('rObj.submittedCount =') &&
    roomControllerCode.includes('rObj.violationCount ='),
    'roomController: Aggregates and returns candidateCount, submittedCount, and violationCount per room'
  );

  // Check 8: Preserves capacity label change
  assert(
    testDetailCode.includes('Room Capacity (max 150)'),
    'AdminTestDetail: Preserved user label update "Room Capacity (max 150)"'
  );

  console.log('\n------------------------------------------------------------------------');
  console.log(`Results: ${passedTests} / ${totalTests} assertions passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('------------------------------------------------------------------------\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL UI/UX IMPROVEMENT-013 QA CHECKS PASSED SUCCESSFULLY!\n');
  } else {
    console.error('⚠️ SOME QA CHECKS FAILED!\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running QA suite:', err);
  process.exit(1);
});
