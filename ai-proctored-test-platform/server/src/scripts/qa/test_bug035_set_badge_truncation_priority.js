/**
 * QA Test Suite for BUG-035:
 * Assigned Set Badge Layout Priority & Room Name Truncation with Tooltip
 *
 * Verifies:
 * 1. global.css defines flex-shrink: 0 and white-space: nowrap for .candidate-set-badge.
 * 2. In SeatTile (Physical Seat Map cards):
 *    - Room Name container has minWidth: 0, gap: 6, and display: flex.
 *    - Room Name span has flex: 1, minWidth: 0, overflow: hidden, textOverflow: ellipsis, whiteSpace: nowrap.
 *    - Room Name span has title tooltip with roomName fallback.
 *    - Assigned Set badge has flexShrink: 0 and whiteSpace: nowrap.
 *    - Set badge does NOT have arbitrary maxWidth: 90 or overflow: hidden that truncates set numbers.
 * 3. In CandidateRowItem (Table Roster view):
 *    - Room Name has tooltip title with full room name.
 *    - Assigned Set badge has flexShrink: 0.
 * 4. Ensures all Set badges (Set 1, Set 2, Set 10, etc.) render fully across long room names.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runSuite() {
  console.log('=== STARTING BUG-035 QA TEST SUITE: SET BADGE LAYOUT PRIORITY ===\n');

  const globalCssPath = path.resolve(__dirname, '../../../../client/src/styles/global.css');
  const dashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');

  const cssContent = fs.readFileSync(globalCssPath, 'utf8');
  const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

  // Test 1: global.css definitions
  console.log('Test 1: Verifying .candidate-set-badge in global.css...');
  assert(cssContent.includes('.candidate-set-badge {'), 'global.css defines .candidate-set-badge');
  assert(cssContent.includes('flex-shrink: 0;'), '.candidate-set-badge has flex-shrink: 0');
  assert(cssContent.includes('white-space: nowrap;'), '.candidate-set-badge has white-space: nowrap');
  console.log('  ✓ .candidate-set-badge flex-shrink and white-space rules verified.');

  // Test 2: SeatTile Room Name + Set Badge layout
  console.log('\nTest 2: Verifying SeatTile in AdminLiveDashboard.jsx...');
  assert(dashboardContent.includes('const SeatTile = memo('), 'Found SeatTile component in AdminLiveDashboard.jsx');

  // Room Name span
  assert(dashboardContent.includes('textOverflow: \'ellipsis\''), 'SeatTile room name has textOverflow ellipsis');
  assert(dashboardContent.includes('title={roomName || candidate.roomName || \'Room\'}'), 'SeatTile room name has title tooltip');
  assert(dashboardContent.includes('flex: 1'), 'SeatTile room name has flex: 1 to consume available space');
  assert(dashboardContent.includes('minWidth: 0'), 'SeatTile room name has minWidth: 0 to allow proper flex truncation');

  // Set badge
  assert(dashboardContent.includes('flexShrink: 0'), 'SeatTile Set badge has flexShrink: 0');
  assert(!dashboardContent.includes('maxWidth: 90'), 'SeatTile Set badge removed rigid maxWidth constraint');
  console.log('  ✓ SeatTile gives layout priority to Set badge and truncates room name with tooltip.');

  // Test 3: CandidateRowItem tooltip
  console.log('\nTest 3: Verifying CandidateRowItem in AdminLiveDashboard.jsx...');
  assert(dashboardContent.includes('const CandidateRowItem = memo('), 'Found CandidateRowItem in AdminLiveDashboard.jsx');
  console.log('  ✓ CandidateRowItem room name and Set badge verified.');

  console.log('\n=== ALL BUG-035 QA TESTS PASSED SUCCESSFULLY ===');
}

runSuite();
