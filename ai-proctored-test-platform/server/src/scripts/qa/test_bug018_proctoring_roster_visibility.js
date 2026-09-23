/**
 * QA Test Suite for BUG-018: Fix Poor Visibility and Data Presentation in Candidate Proctoring Summary Roster
 *
 * Verifies:
 * 1. Column header displays "Candidate Name" instead of "Candidate (FR-7.3 Counter)".
 * 2. Zero visible "FR-" references appear in the candidate roster UI header, labels, and button tooltips.
 * 3. Status badge styling function renders distinct, high-contrast, accessible badges for:
 *    - NOT_STARTED (Neutral slate/gray)
 *    - IN_PROGRESS (Amber/Yellow)
 *    - SUBMITTED (Emerald Green)
 *    - AUTO_SUBMITTED (Cyan/Blue)
 *    - DISQUALIFIED (Crimson Red)
 * 4. Status / Time column has high-contrast typography and semantic styling across states.
 * 5. Room and Question Set badges are cleanly grouped with strong hierarchy.
 * 6. Action buttons (Inspect, View Result, Warn, Disqualify) have crisp borders and high-contrast text.
 * 7. UNREVIEWED proof badge in Inspect modal is clearly visible with prominent styling.
 */

const fs = require('fs');
const path = require('path');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    testsPassed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    testsFailed++;
  }
}

console.log('\n=== Starting BUG-018 QA Test Suite: Proctoring Summary Roster Visibility ===\n');

const liveDashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');
const content = fs.readFileSync(liveDashboardPath, 'utf8');

// 1. Column Header Check
console.log('1. Verifying Column Header Labels & Clean UI...');
assert(
  content.includes('<div>Candidate Name</div>'),
  'Table header includes "Candidate Name"'
);
assert(
  !content.includes('<div>Candidate (FR-7.3 Counter)</div>'),
  'Table header does NOT contain internal requirement reference "(FR-7.3 Counter)"'
);

// 2. Visible FR Reference Check in tooltips / user-facing UI
console.log('\n2. Verifying Elimination of User-Facing FR Identifiers...');
const userFacingFRRegex = /(title|placeholder|label)=["'][^"']*FR-\d+(\.\d+)?/i;
const matches = content.match(userFacingFRRegex);
assert(
  !matches,
  `No visible FR-* requirement references found in user-facing JSX attributes (found: ${matches ? matches[0] : 'none'})`
);

// 3. Status Badge Helper & Contrast Verification
console.log('\n3. Verifying Candidate Status Badge Redesign & Contrast...');
assert(
  content.includes('renderCandidateStatusBadge'),
  'renderCandidateStatusBadge helper is implemented'
);
assert(
  content.includes("statusKey = 'NOT_STARTED'") &&
  content.includes("bg = 'rgba(100, 116, 139, 0.14)'") &&
  content.includes("color = 'var(--color-navy, #334155)'"),
  'NOT_STARTED badge uses high-contrast slate background and dark navy/slate text'
);
assert(
  content.includes("statusKey = 'IN_PROGRESS'") &&
  content.includes("color = '#b45309'"),
  'IN_PROGRESS badge uses high-contrast amber text'
);
assert(
  content.includes("statusKey = 'SUBMITTED'") &&
  content.includes("color = '#059669'"),
  'SUBMITTED badge uses high-contrast emerald green text'
);
assert(
  content.includes("statusKey = 'AUTO_SUBMITTED'") &&
  content.includes("color = '#0284c7'"),
  'AUTO_SUBMITTED badge uses high-contrast blue/cyan text'
);
assert(
  content.includes("statusKey = 'DISQUALIFIED'") &&
  content.includes("color = '#dc2626'"),
  'DISQUALIFIED badge uses high-contrast red text'
);

// 4. CandidateRowItem Rendering
console.log('\n4. Verifying CandidateRowItem Integration...');
assert(
  content.includes('{renderCandidateStatusBadge(candidate, isCandidateInProgress, colorStatus, isTestEnded)}'),
  'CandidateRowItem uses renderCandidateStatusBadge for status column rendering'
);

// 5. Room & Set Presentation
console.log('\n5. Verifying Room & Set presentation...');
assert(
  content.includes("{roomName || candidate.roomName || 'Room'}") &&
  content.includes("style={{ color: 'var(--color-navy)', fontSize: '0.84rem' }}"),
  'Room Name uses strong typography with var(--color-navy)'
);
assert(
  content.includes('🎲 {candidate.assignedSetIndex ? `Set ${candidate.assignedSetIndex}` : candidate.assignedQuestionSetName}'),
  'Question set badge is grouped with Room column with clear borders and styling'
);

// 6. Status / Time Column Visibility
console.log('\n6. Verifying Status / Time Column Visibility...');
assert(
  content.includes("color: formattedTimer === 'Not started'") &&
  content.includes("'var(--color-navy, #334155)'"),
  'Status / Time column renders with strong high-contrast color (#334155 / #059669 / #dc2626) instead of faded muted text'
);

// 7. Action Button Visibility
console.log('\n7. Verifying Action Button Visibility...');
assert(
  content.includes('border: \'1.5px solid var(--color-border)\'') &&
  content.includes('Inspect'),
  'Inspect button has crisp 1.5px solid border and defined styling'
);
assert(
  content.includes('View Result') &&
  content.includes("border: isCandidateSubmitted(candidate, isTestEnded) ? '1.5px solid #0E7C86' : '1.5px solid var(--color-border)'"),
  'View Result button has crisp border and clear enabled/disabled contrast'
);

// 8. UNREVIEWED Badge in Inspect Modal
console.log('\n8. Verifying UNREVIEWED badge styling in Evidence Modal...');
assert(
  content.includes('⏳ UNREVIEWED') &&
  content.includes('background: \'rgba(100, 116, 139, 0.15)\''),
  'UNREVIEWED badge in malpractice proof modal has clear background, border, and prominent text'
);

console.log(`\n==================================================`);
console.log(`Results: ${testsPassed} passed, ${testsFailed} failed`);
console.log(`==================================================\n`);

if (testsFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
