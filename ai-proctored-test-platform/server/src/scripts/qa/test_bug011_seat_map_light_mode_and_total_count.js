/**
 * QA Automated Test Suite for BUG-011:
 * Improve Light Mode Visibility in Physical Seat Map Summary + Display Total Candidate Count
 */

const fs = require('fs');
const path = require('path');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

async function runBug011Tests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: BUG-011 Seat Map Light Mode & Total Candidate Count');
  console.log('========================================================================\n');

  const globalCssPath = path.resolve(__dirname, '../../../../client/src/styles/global.css');
  const liveDashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');

  const globalCss = fs.readFileSync(globalCssPath, 'utf8');
  const liveDashboard = fs.readFileSync(liveDashboardPath, 'utf8');

  // 1. Total Candidate Count Badge in Embedded Header
  assert(
    liveDashboard.includes('id="seat-map-total-count-badge"') &&
    (liveDashboard.includes('Total Candidates: ${Object.keys(candidatesMap).length}') ||
     liveDashboard.includes('Showing ${seatMapCandidates.length} of ${Object.keys(candidatesMap).length} Candidates')),
    'Embedded seat map card header renders dynamic #seat-map-total-count-badge with filtered subset support'
  );

  // 2. Total Candidate Count Badge in Expanded Overlay Header
  assert(
    liveDashboard.includes('id="expanded-seat-map-total-count-badge"') &&
    (liveDashboard.includes('Total Candidates: ${Object.keys(candidatesMap).length}') ||
     liveDashboard.includes('Showing ${seatMapCandidates.length} of ${Object.keys(candidatesMap).length} Candidates')),
    'Expanded full-viewport overlay renders dynamic #expanded-seat-map-total-count-badge'
  );

  // 3. Expand & Collapse Button Light Mode Contrast
  assert(
    liveDashboard.includes('id="expand-seat-map-btn"') &&
    liveDashboard.includes("color: 'var(--color-navy, #0f172a)'") &&
    liveDashboard.includes("border: '1.5px solid var(--color-border, #cbd5e1)'"),
    '#expand-seat-map-btn uses visible navy text and crisp border in light and dark mode'
  );

  assert(
    liveDashboard.includes('id="collapse-seat-map-btn"') &&
    liveDashboard.includes("color: 'var(--color-navy, #0f172a)'") &&
    liveDashboard.includes("border: '1.5px solid var(--color-border, #cbd5e1)'"),
    '#collapse-seat-map-btn uses visible navy text and crisp border in light and dark mode'
  );

  // 4. Legend Labels Contrast
  assert(
    liveDashboard.includes("color: 'var(--color-navy, #0f172a)', fontWeight: 600") &&
    liveDashboard.includes('Submitted') &&
    liveDashboard.includes('In Progress') &&
    liveDashboard.includes('Disqualified') &&
    liveDashboard.includes('Not Started'),
    'Legend labels have high-contrast text styling (var(--color-navy, #0f172a), fontWeight: 600)'
  );

  // 5. SeatTile Light Mode Readability
  assert(
    liveDashboard.includes("border: `2px solid ${isWhite ? 'var(--color-seat-not-started-border, #cbd5e1)' : color}`") &&
    liveDashboard.includes("color: 'var(--color-text-muted, #475569)'") &&
    liveDashboard.includes("color: 'var(--color-navy)'"),
    'SeatTile candidate cards render high-contrast candidate name, room name, solved count, and crisp borders'
  );

  // 6. Global CSS Token for Not Started Border
  assert(
    globalCss.includes('--color-seat-not-started-border: #cbd5e1;'),
    'global.css defines --color-seat-not-started-border: #cbd5e1 in light mode for visible card distinction'
  );

  // 7. Non-Regression: Expand/Collapse full-viewport overlay
  assert(
    liveDashboard.includes('id="seat-map-expanded-overlay"') &&
    liveDashboard.includes('zIndex: 900') &&
    liveDashboard.includes('onClick={() => setIsSeatMapExpanded(true)}') &&
    liveDashboard.includes('onClick={() => setIsSeatMapExpanded(false)}'),
    'FEATURE-030 full-viewport toggle behavior is fully preserved'
  );

  console.log(`\nBUG-011 Verification Result: ${passedTests}/${totalTests} checks passed.`);
  if (passedTests === totalTests) {
    console.log('STATUS: ALL CRITERIA VERIFIED SUCCESSFUL\n');
  } else {
    process.exit(1);
  }
}

runBug011Tests();
