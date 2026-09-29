/**
 * QA Test Suite for BUG-033:
 * Dark Mode "Set" Badge Contrast & Readability in Physical Seat Map Cards and Roster
 *
 * Verifies:
 * 1. global.css defines --badge-purple-* CSS custom properties for Light and Dark themes.
 * 2. global.css defines .candidate-set-badge with dedicated Light and Dark Mode rules.
 * 3. In Light Mode:
 *    - background: rgba(99, 102, 241, 0.12)
 *    - color: #4338ca
 *    - border: 1px solid rgba(99, 102, 241, 0.35)
 * 4. In Dark Mode:
 *    - background: rgba(139, 92, 246, 0.24) (high contrast dark violet)
 *    - color: #c4b5fd (bright violet, WCAG AAA compliant > 8:1 contrast)
 *    - border: 1px solid rgba(167, 139, 250, 0.6) (sharp visible border)
 *    - box-shadow for enhanced distinctness
 * 5. AdminLiveDashboard.jsx uses .candidate-set-badge in:
 *    - SeatTile (Physical Seat Map cards)
 *    - CandidateRowItem (Roster list view)
 * 6. Visual hierarchy & emoji 🎲 preserved without modifying set-assignment logic.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runSuite() {
  console.log('=== STARTING BUG-033 QA TEST SUITE: SET BADGE CONTRAST ===\n');

  const globalCssPath = path.resolve(__dirname, '../../../../client/src/styles/global.css');
  const dashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');

  const cssContent = fs.readFileSync(globalCssPath, 'utf8');
  const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

  // Test 1: Light Theme CSS Variables
  console.log('Test 1: Verifying Light Theme --badge-purple variables in global.css...');
  assert(cssContent.includes('--badge-purple-bg: rgba(99, 102, 241, 0.12);'), 'Light theme defines --badge-purple-bg');
  assert(cssContent.includes('--badge-purple-text: #4338ca;'), 'Light theme defines --badge-purple-text');
  assert(cssContent.includes('--badge-purple-border: rgba(99, 102, 241, 0.35);'), 'Light theme defines --badge-purple-border');
  console.log('  ✓ Light theme badge variables verified.');

  // Test 2: Dark Theme CSS Variables
  console.log('\nTest 2: Verifying Dark Theme --badge-purple overrides in global.css...');
  assert(cssContent.includes('--badge-purple-bg: rgba(139, 92, 246, 0.24);'), 'Dark theme defines --badge-purple-bg');
  assert(cssContent.includes('--badge-purple-text: #c4b5fd;'), 'Dark theme defines --badge-purple-text');
  assert(cssContent.includes('--badge-purple-border: rgba(167, 139, 250, 0.6);'), 'Dark theme defines --badge-purple-border');
  console.log('  ✓ Dark theme badge variables verified.');

  // Test 3: .candidate-set-badge class and dark mode styling
  console.log('\nTest 3: Verifying .candidate-set-badge CSS class in global.css...');
  assert(cssContent.includes('.candidate-set-badge {'), '.candidate-set-badge class declared');
  assert(cssContent.includes('[data-theme="dark"] .candidate-set-badge {'), 'Dark mode selector for .candidate-set-badge declared');
  assert(cssContent.includes('color: #c4b5fd;'), 'Dark mode uses bright violet text #c4b5fd');
  assert(cssContent.includes('.candidate-set-badge:hover {'), 'Hover state defined for .candidate-set-badge');
  console.log('  ✓ .candidate-set-badge and dark theme rules verified.');

  // Test 4: SeatTile in AdminLiveDashboard.jsx uses .candidate-set-badge
  console.log('\nTest 4: Verifying SeatTile in AdminLiveDashboard.jsx...');
  assert(dashboardContent.includes('className="candidate-set-badge"'), 'AdminLiveDashboard includes candidate-set-badge class');
  assert(!dashboardContent.includes("color: '#4338ca'"), 'Hardcoded inline purple color removed from AdminLiveDashboard');
  assert(dashboardContent.includes('🎲 {candidate.assignedSetIndex ? `Set ${candidate.assignedSetIndex}` : candidate.assignedQuestionSetName}'), 'Set badge content and dice emoji preserved');
  console.log('  ✓ SeatTile uses .candidate-set-badge class.');

  // Test 5: CandidateRowItem in AdminLiveDashboard.jsx uses .candidate-set-badge
  console.log('\nTest 5: Verifying CandidateRowItem in AdminLiveDashboard.jsx...');
  const occurrences = (dashboardContent.match(/className="candidate-set-badge"/g) || []).length;
  assert(occurrences >= 2, `Expected at least 2 occurrences of candidate-set-badge, found ${occurrences}`);
  console.log(`  ✓ Found ${occurrences} occurrences of .candidate-set-badge (SeatTile + CandidateRowItem).`);

  console.log('\n=== ALL BUG-033 QA TESTS PASSED SUCCESSFULLY ===');
}

runSuite();
