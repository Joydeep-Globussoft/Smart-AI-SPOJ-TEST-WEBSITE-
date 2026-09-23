/**
 * QA Test Suite: BUG/UX-XX
 * Remove Duplicate Malpractice Count from Candidate Name Column in Live Proctoring Roster
 */

const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('===============================================================');
  console.log('   QA Test Suite: Remove Duplicate Malpractice from Name Column ');
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

  // 1. Extract CandidateRowItem code
  const normalizedCode = liveDashboardCode.replace(/\r\n/g, '\n');
  const startIdx = normalizedCode.indexOf('const CandidateRowItem = memo(');
  const endIdx = normalizedCode.indexOf('export default function AdminLiveDashboard');
  const rowItemCode = startIdx !== -1 && endIdx !== -1 ? normalizedCode.substring(startIdx, endIdx) : '';

  assert(Boolean(rowItemCode), 'AdminLiveDashboard: Found CandidateRowItem component definition');

    // 2. Candidate Name column does NOT contain duplicate badge
    const nameColMatch = rowItemCode.match(/\{\/\* Candidate Name \*\/\}\s*<div[\s\S]*?<\/div>/);
    assert(Boolean(nameColMatch), 'Found Candidate Name column block in CandidateRowItem');

    if (nameColMatch) {
      const nameColCode = nameColMatch[0];
      assert(
        !nameColCode.includes('⚠️') &&
        !nameColCode.includes('malpracticeCount') &&
        !nameColCode.includes('Malpractice Counter:'),
        'Candidate Name column has NO duplicate malpractice badge or count'
      );
      assert(
        nameColCode.includes('candidate.name') || nameColCode.includes('candidate.candidateName'),
        'Candidate Name column renders candidate name properly'
      );
      assert(
        nameColCode.includes('seat-tile-dot-pulse') || nameColCode.includes('borderRadius: \'50%\''),
        'Candidate Name column retains online/status dot indicator'
      );
    }

    // 3. Dedicated Malpractice column is preserved
    assert(
      rowItemCode.includes('⚠️ {malpracticeCount} Violations') || rowItemCode.includes('⚠️ {malpracticeCount}'),
      'Dedicated Malpractice column retains violation count badge'
    );
    assert(
      rowItemCode.includes('✓ Clean (0)'),
      'Dedicated Malpractice column retains "✓ Clean (0)" for 0 violations'
    );

    // 4. Actions column preserved
    assert(
      rowItemCode.includes('Inspect') &&
      rowItemCode.includes('View Result') &&
      rowItemCode.includes('Warn') &&
      rowItemCode.includes('Disqualify'),
      'Action buttons in CandidateRowItem are intact'
    );

  console.log('\n---------------------------------------------------------------');
  console.log(`Results: ${passedTests} / ${totalTests} assertions passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('---------------------------------------------------------------\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL ROSTER CANDIDATE NAME TESTS PASSED SUCCESSFULLY!\n');
  } else {
    console.error('⚠️ SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
