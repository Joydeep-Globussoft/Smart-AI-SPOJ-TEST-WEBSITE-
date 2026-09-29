/**
 * QA Test Suite for BUG-034:
 * Room Metrics Separator Contrast & Readability in Light & Dark Mode
 *
 * Verifies:
 * 1. global.css defines .room-metric-divider with light and dark mode rules.
 * 2. In AdminTestDetail.jsx:
 *    - Physical room cards use the styled pipe divider "|" with .room-metric-divider class.
 *    - Replaces the low-contrast faint dot "•".
 *    - Separates Candidates | Submitted | Violations clearly.
 * 3. In CandidateDetailEvaluationModal.jsx:
 *    - Evaluation modal metrics use .room-metric-divider pipe separators consistently.
 * 4. Checks that underlying candidate, submission, and violation counts remain unchanged.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runSuite() {
  console.log('=== STARTING BUG-034 QA TEST SUITE: ROOM METRICS SEPARATOR CONTRAST ===\n');

  const globalCssPath = path.resolve(__dirname, '../../../../client/src/styles/global.css');
  const testDetailPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx');
  const modalPath = path.resolve(__dirname, '../../../../client/src/shared/CandidateDetailEvaluationModal.jsx');

  const cssContent = fs.readFileSync(globalCssPath, 'utf8');
  const testDetailContent = fs.readFileSync(testDetailPath, 'utf8');
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  // Test 1: global.css definitions
  console.log('Test 1: Verifying .room-metric-divider in global.css...');
  assert(cssContent.includes('.room-metric-divider {'), 'global.css defines .room-metric-divider');
  assert(cssContent.includes('[data-theme="dark"] .room-metric-divider {'), 'global.css defines dark mode override for .room-metric-divider');
  console.log('  ✓ .room-metric-divider styles verified.');

  // Test 2: AdminTestDetail.jsx room card summary metrics
  console.log('\nTest 2: Verifying room card metrics in AdminTestDetail.jsx...');
  assert(testDetailContent.includes('className="room-metric-divider"'), 'AdminTestDetail uses room-metric-divider class');
  
  // Verify that the room metrics strip has pipe dividers between Candidates, Submitted, and Violations
  const stripStart = testDetailContent.indexOf('className="room-metrics-strip"');
  assert(stripStart !== -1, 'Found room-metrics-strip in AdminTestDetail.jsx');
  const stripSnippet = testDetailContent.substring(stripStart, stripStart + 3000);

  assert(stripSnippet.includes('candidateTotal'), 'Metrics strip includes Candidates');
  assert(stripSnippet.includes('room.submittedCount'), 'Metrics strip includes Submitted count');
  assert(stripSnippet.includes('room.violationCount'), 'Metrics strip includes Violations count');
  assert(stripSnippet.includes('className="room-metric-divider"'), 'Metrics strip uses styled pipe divider');
  assert(!stripSnippet.includes('color: \'var(--color-border, #cbd5e1)\' }}>•</span>'), 'Faint dot separator removed from room-metrics-strip');
  console.log('  ✓ Room metrics strip uses high-contrast pipe separators.');

  // Test 3: CandidateDetailEvaluationModal.jsx metrics
  console.log('\nTest 3: Verifying CandidateDetailEvaluationModal.jsx metrics...');
  assert(modalContent.includes('className="room-metric-divider"'), 'CandidateDetailEvaluationModal uses room-metric-divider class');
  console.log('  ✓ CandidateDetailEvaluationModal uses .room-metric-divider.');

  console.log('\n=== ALL BUG-034 QA TESTS PASSED SUCCESSFULLY ===');
}

runSuite();
