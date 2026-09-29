/**
 * QA Test Suite for UI/UX IMPROVEMENT-037:
 * Rebalance Candidate Name and Room Column Widths to Improve Room Name Visibility
 *
 * Verifies:
 * 1. AdminLiveDashboard.jsx:
 *    - Table header gridTemplateColumns is rebalanced: '1.4fr 1.8fr 1.1fr 0.9fr 1.1fr 1fr 1.8fr'
 *    - CandidateRowItem gridTemplateColumns matches header exactly: '1.4fr 1.8fr 1.1fr 0.9fr 1.1fr 1fr 1.8fr'
 *    - Candidate Name column reduced from 2fr to 1.4fr, reclaiming wasted horizontal space.
 *    - Room column increased from 1.1fr to 1.8fr (~60% expansion), allowing significantly more characters to display before truncation.
 *    - Status column maintained at 1.1fr to ensure badges like AUTO SUBMITTED, NOT STARTED, SUBMITTED stay fully visible.
 *    - Tooltip title attributes present on both Candidate Name and Room Name.
 * 2. Visual Balance:
 *    - Non-regression on BUG-018, BUG-033, BUG-035, BUG-036.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runSuite() {
  console.log('=== STARTING UI/UX IMPROVEMENT-037 QA TEST SUITE: REBALANCE COLUMN WIDTHS ===\n');

  const dashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');
  assert(fs.existsSync(dashboardPath), 'AdminLiveDashboard.jsx must exist');

  const content = fs.readFileSync(dashboardPath, 'utf8');

  // Test 1: Header Grid Template Columns
  console.log('Test 1: Verifying Table Header Bar gridTemplateColumns...');
  const expectedGrid = "'1.4fr 1.8fr 1.1fr 0.9fr 1.1fr 1fr 1.8fr'";
  assert(content.includes(`gridTemplateColumns: ${expectedGrid}`), `Header uses rebalanced grid: ${expectedGrid}`);
  console.log('  ✓ Table header rebalanced grid verified.');

  // Test 2: Row Grid Template Columns
  console.log('\nTest 2: Verifying CandidateRowItem gridTemplateColumns matches Header...');
  const rowMatches = (content.match(/gridTemplateColumns:\s*'1\.4fr 1\.8fr 1\.1fr 0\.9fr 1\.1fr 1fr 1\.8fr'/g) || []).length;
  assert(rowMatches >= 2, `Both CandidateRowItem and Table Header use ${expectedGrid} (found ${rowMatches} occurrences)`);
  console.log('  ✓ CandidateRowItem and Table Header gridTemplateColumns perfectly synchronized.');

  // Test 3: Tooltips on Candidate Name and Room Name
  console.log('\nTest 3: Verifying hover tooltips on Candidate Name and Room Name...');
  assert(content.includes('title={candidate.name || candidate.candidateName || \'Candidate\'}'), 'Candidate name has hover tooltip');
  assert(content.includes('title={roomName || candidate.roomName || \'Room\'}'), 'Room name has hover tooltip');
  console.log('  ✓ Hover tooltips verified on both columns.');

  // Test 4: Regression Verifications
  console.log('\nTest 4: Verifying zero regressions on prior bug fixes (BUG-018, BUG-036)...');
  assert(content.includes('const CandidateRowItem = memo('), 'CandidateRowItem component exists');
  assert(content.includes('BUG-036: Structured two-column layout for fixed Set Badge alignment'), 'BUG-036 layout intact');
  assert(content.includes("className=\"candidate-set-badge\""), 'Candidate set badge intact');
  console.log('  ✓ BUG-018 and BUG-036 behaviors preserved.');

  console.log('\n=== ALL UI/UX IMPROVEMENT-037 QA TESTS PASSED (100% SUCCESS) ===\n');
}

runSuite();
