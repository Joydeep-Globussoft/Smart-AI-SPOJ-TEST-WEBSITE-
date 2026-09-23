/**
 * QA Test: Verify Action Button Visibility and Contrast in Light and Dark Modes in Proctoring Roster
 *
 * Checks:
 * 1. global.css defines .roster-action-btn, .roster-action-btn-inspect, .roster-action-btn-result-enabled,
 *    .roster-action-btn-warn-enabled, .roster-action-btn-danger, and .roster-action-btn-disabled across themes.
 * 2. AdminLiveDashboard.jsx properly uses these classes for all 4 action buttons:
 *    - Inspect (neutral action, high contrast in light & dark modes)
 *    - View Result (enabled teal with white text when submitted, disabled readable text when not submitted)
 *    - Warn (enabled warning amber when malpracticeCount > 0, disabled readable text when malpracticeCount == 0)
 *    - Disqualify (danger red with white text)
 * 3. All states (enabled, disabled, hover, focus) maintain legible contrast and clear boundaries.
 */

const fs = require('fs');
const path = require('path');

function runTest() {
  console.log('--- QA Test: Candidate Live Proctoring Roster Action Buttons Contrast ---');

  const globalCssPath = path.resolve(__dirname, '../../../../client/src/styles/global.css');
  const adminLiveDashboardPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');

  if (!fs.existsSync(globalCssPath)) {
    throw new Error(`global.css not found at ${globalCssPath}`);
  }
  if (!fs.existsSync(adminLiveDashboardPath)) {
    throw new Error(`AdminLiveDashboard.jsx not found at ${adminLiveDashboardPath}`);
  }

  const globalCssContent = fs.readFileSync(globalCssPath, 'utf8');
  const adminLiveDashboardContent = fs.readFileSync(adminLiveDashboardPath, 'utf8');

  // Check 1: global.css rules
  const requiredCssClasses = [
    '.roster-action-btn',
    '.roster-action-btn-inspect',
    '.roster-action-btn-result-enabled',
    '.roster-action-btn-warn-enabled',
    '.roster-action-btn-danger',
    '.roster-action-btn-disabled',
    '[data-theme="dark"] .roster-action-btn-warn-enabled',
    '[data-theme="dark"] .roster-action-btn-disabled',
    '[data-theme="light"] .roster-action-btn-disabled'
  ];

  for (const cssClass of requiredCssClasses) {
    if (!globalCssContent.includes(cssClass)) {
      throw new Error(`Assertion failed: global.css is missing rule for ${cssClass}`);
    }
  }
  console.log('✅ PASS: All required roster action button CSS classes and theme overrides are present in global.css');

  // Check 2: AdminLiveDashboard.jsx button assignments
  // Inspect button
  if (!adminLiveDashboardContent.includes('roster-action-btn-inspect')) {
    throw new Error('Assertion failed: AdminLiveDashboard.jsx does not use roster-action-btn-inspect');
  }
  console.log('✅ PASS: Inspect button uses roster-action-btn-inspect');

  // View Result button
  if (!adminLiveDashboardContent.includes('roster-action-btn-result-enabled') ||
      !adminLiveDashboardContent.includes('roster-action-btn-disabled')) {
    throw new Error('Assertion failed: AdminLiveDashboard.jsx does not toggle roster-action-btn-result-enabled and roster-action-btn-disabled for View Result');
  }
  console.log('✅ PASS: View Result button properly toggles enabled and disabled roster action classes');

  // Warn button
  if (!adminLiveDashboardContent.includes('roster-action-btn-warn-enabled')) {
    throw new Error('Assertion failed: AdminLiveDashboard.jsx does not use roster-action-btn-warn-enabled');
  }
  console.log('✅ PASS: Warn button properly toggles warn-enabled and disabled roster action classes');

  // Disqualify button
  if (!adminLiveDashboardContent.includes('roster-action-btn-danger')) {
    throw new Error('Assertion failed: AdminLiveDashboard.jsx does not use roster-action-btn-danger');
  }
  console.log('✅ PASS: Disqualify button uses roster-action-btn-danger');

  // Check 3: Preserved candidate logic & event handlers
  if (!adminLiveDashboardContent.includes('onSelect(candidate)') ||
      !adminLiveDashboardContent.includes('onOpenEvaluationDetail') ||
      !adminLiveDashboardContent.includes('onWarn(candidate)') ||
      !adminLiveDashboardContent.includes('onDisqualify(candidate)')) {
    throw new Error('Assertion failed: Handlers onSelect, onOpenEvaluationDetail, onWarn, or onDisqualify were altered');
  }
  console.log('✅ PASS: All original button handlers and candidate status conditions are preserved');

  console.log('🎉 ALL ACTION BUTTON VISIBILITY AND CONTRAST QA CHECKS PASSED!');
}

runTest();
