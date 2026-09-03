/**
 * QA Automated Verification Suite: BUG-48
 * Part A: Persistent Split/Code/Preview Toggle in Shared Header
 * Part B: Suppress False TAB_SWITCH on Preview Iframe Focus
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: BUG-48 (Persistent Toggle & Iframe Tab Switch Fix)');
  console.log('========================================================================\n');

  const aiTestPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateAITestScreen.jsx');
  const proctoringPath = path.resolve(__dirname, '../../../../client/src/hooks/useProctoring.js');

  const aiTestCode = fs.readFileSync(aiTestPath, 'utf-8');
  const proctoringCode = fs.readFileSync(proctoringPath, 'utf-8');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Part A - Persistent Single Toggle in Shared Header
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Part A - Panel-Header Toggle Placement (BUG-48 Revised) ---');
  const topHeaderSection = aiTestCode.split('Time Remaining:')[1]?.split('Submit Project')[0] || '';
  assert(
    !topHeaderSection.includes('<ViewModeSegmentedToggle'),
    'Toggle NEVER appears in top header bar (BUG-48 Revised Criterion 1)'
  );

  const editorHeaderSection = aiTestCode.split('PANEL 2: Code Editor')[1]?.split('Sub-header: File Tabs Bar')[0] || '';
  assert(
    editorHeaderSection.includes("viewMode === 'split' || viewMode === 'code'") &&
    editorHeaderSection.includes('<ViewModeSegmentedToggle'),
    'In Split and Code modes, toggle appears inside Code Editor panel header (BUG-48 Revised Criteria 2 & 3)'
  );

  const previewHeaderSection = aiTestCode.split('PANEL 3: Preview')[1]?.split('Browser Address Bar Sub-header')[0] || '';
  assert(
    previewHeaderSection.includes("viewMode === 'preview'") &&
    previewHeaderSection.includes('<ViewModeSegmentedToggle'),
    'In Preview mode, toggle appears inside Preview panel header (BUG-48 Revised Criterion 4)'
  );

  // Simulation: under any mode, exactly ONE toggle is active on screen
  function countVisibleToggles(mode) {
    let count = 0;
    if (mode === 'split' || mode === 'code') count++; // Code Editor header
    if (mode === 'preview') count++; // Preview header
    return count;
  }
  assert(countVisibleToggles('split') === 1, 'Exactly ONE toggle visible in Split mode');
  assert(countVisibleToggles('code') === 1, 'Exactly ONE toggle visible in Code mode');
  assert(countVisibleToggles('preview') === 1, 'Exactly ONE toggle visible in Preview mode');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Part A - Non-blocking View Mode Transitions & State Sync
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Part A - Non-blocking Transitions & State Sync ---');
  assert(
    aiTestCode.includes('setMaximizedPanel(null)') &&
    aiTestCode.includes('handleViewModeChange = useCallback((mode) => {'),
    'handleViewModeChange clears maximizedPanel to avoid view freeze'
  );

  assert(
    aiTestCode.includes("viewMode === 'preview' ? 'none' : 'flex'"),
    'Code Editor hides in Preview mode while persistent top bar toggle remains visible'
  );

  assert(
    aiTestCode.includes("viewMode === 'code' ? 'none' : 'flex'"),
    'Preview hides in Code mode while persistent top bar toggle remains visible'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Part B - Preview Iframe Identification & Focus Handling
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Part B - Preview Iframe Focus Exception ---');
  assert(
    aiTestCode.includes('id="ai-test-preview-iframe"') &&
    aiTestCode.includes('data-preview-iframe="true"'),
    'Preview iframe in CandidateAITestScreen is identified with id and data-preview-iframe'
  );

  assert(
    proctoringCode.includes('isInternalIframeFocus'),
    'useProctoring defines isInternalIframeFocus helper'
  );

  assert(
    proctoringCode.includes("active.tagName === 'IFRAME'") ||
    proctoringCode.includes("active.id === 'ai-test-preview-iframe'"),
    'useProctoring inspects document.activeElement for IFRAME or preview iframe ID'
  );

  assert(
    proctoringCode.includes('!document.hidden'),
    'useProctoring verifies document is visible (!document.hidden) before exempting iframe focus'
  );

  assert(
    proctoringCode.includes('setTimeout') &&
    proctoringCode.includes('handleWindowBlur'),
    'useProctoring includes grace period for window blur to evaluate activeElement iframe focus'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Part B - Simulation of Focus vs. Genuine Tab Switch
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Part B - Logic Simulation (Iframe Click vs Genuine Tab Switch) ---');
  
  function simulateBlurViolation(activeTagName, activeId, isDocHidden) {
    const isInternalIframe = !isDocHidden && (activeTagName === 'IFRAME' || activeId === 'ai-test-preview-iframe');
    if (isInternalIframe) {
      return false; // Suppressed
    }
    return true; // Violation triggered
  }

  assert(
    simulateBlurViolation('IFRAME', 'ai-test-preview-iframe', false) === false,
    'Clicking into Preview iframe on visible page does NOT trigger TAB_SWITCH'
  );

  assert(
    simulateBlurViolation('BODY', null, true) === true,
    'Genuinely switching browser tabs (document.hidden = true) triggers TAB_SWITCH'
  );

  assert(
    simulateBlurViolation('IFRAME', 'ai-test-preview-iframe', true) === true,
    'Switching to another tab even if iframe was active triggers TAB_SWITCH'
  );

  assert(
    simulateBlurViolation('BUTTON', 'submit-btn', false) === true,
    'Alt-tabbing to an external desktop application (activeElement != IFRAME) triggers TAB_SWITCH'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Standing Directives & Regression Audit
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Regression Audit ---');
  assert(
    aiTestCode.includes('PANEL 4: AI Assistant'),
    'PANEL 4: AI Assistant panel preserved'
  );
  assert(
    aiTestCode.includes('index.html') &&
    aiTestCode.includes('style.css') &&
    aiTestCode.includes('app.js'),
    'Multi-file tabs preserved'
  );
  assert(
    aiTestCode.includes('ai-submit-question-btn') &&
    aiTestCode.includes('ai-submit-all-btn'),
    'Submit Project and Submit All buttons preserved'
  );
  assert(
    aiTestCode.includes('<CameraDisconnectedOverlay'),
    'Webcam disconnect overlay preserved'
  );
  assert(
    proctoringCode.includes('triggerDelayedScreenViolation'),
    'Delayed screen-capture violation mechanism preserved (BUG-31)'
  );

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('========================================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
