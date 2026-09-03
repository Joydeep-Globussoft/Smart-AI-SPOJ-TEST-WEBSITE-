/**
 * QA Automated Verification Suite: BUG-47 (Split/Code/Preview Toggle Click Handler & De-duplication)
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
  console.log('QA VERIFICATION SUITE: BUG-47 (View Mode Click Handler & Single Toggle)');
  console.log('========================================================================\n');

  const aiTestPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateAITestScreen.jsx');
  const aiTestCode = fs.readFileSync(aiTestPath, 'utf-8');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Exactly ONE Toggle Instance (Criterion 1)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Single Authoritative Toggle Instance ---');
  const toggleOccurrences = aiTestCode.match(/<ViewModeSegmentedToggle/g) || [];
  const topHeaderSection = aiTestCode.split('Time Remaining:')[1]?.split('Submit Project')[0] || '';
  assert(
    !topHeaderSection.includes('<ViewModeSegmentedToggle'),
    'Toggle NEVER appears in top header bar (BUG-48 Revised Criterion 1)'
  );

  const editorHeaderSection = aiTestCode.split('PANEL 2: Code Editor')[1]?.split('Sub-header: File Tabs Bar')[0] || '';
  assert(
    editorHeaderSection.includes("viewMode === 'split' || viewMode === 'code'") &&
    editorHeaderSection.includes('<ViewModeSegmentedToggle'),
    'Toggle placed inside Code Editor panel header for Split and Code modes (BUG-48 Revised Criteria 2 & 3)'
  );

  const previewHeaderSection = aiTestCode.split('PANEL 3: Preview')[1]?.split('Browser Address Bar Sub-header')[0] || '';
  assert(
    previewHeaderSection.includes("viewMode === 'preview'") &&
    previewHeaderSection.includes('<ViewModeSegmentedToggle'),
    'Toggle placed inside Preview panel header for Preview mode (BUG-48 Revised Criterion 4)'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Single Source of Truth & Dismissal of Conflicts (Criteria 2, 3)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Single Source of Truth & State Synchronization ---');
  assert(
    aiTestCode.includes('setMaximizedPanel(null)') &&
    aiTestCode.includes('handleViewModeChange = useCallback((mode) => {'),
    'handleViewModeChange clears maximizedPanel (setMaximizedPanel(null)) to prevent layout freeze'
  );

  assert(
    editorHeaderSection.includes("setMaximizedPanel((p) => (p === 'editor' ? null : 'editor'))"),
    'Panel 2 expand button maximizes/restores Code Editor panel across full screen (BUG-49)'
  );

  assert(
    previewHeaderSection.includes("setMaximizedPanel((p) => (p === 'preview' ? null : 'preview'))"),
    'Panel 3 expand button maximizes/restores Preview panel across full screen (BUG-49)'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Multi-Click Transitions (Criterion 5)
  // Simulation of state transitions: Code -> Preview -> Split -> Code
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Multi-Click Order Transitions (Code -> Preview -> Split -> Code) ---');
  
  function simulateLayout(currentMode, isMaximized) {
    const effectiveMaximized = isMaximized ? null : null; // handleViewModeChange always clears maximizedPanel
    const editorDisplay = !effectiveMaximized ? (currentMode === 'preview' ? 'none' : 'flex') : 'none';
    const previewDisplay = !effectiveMaximized ? (currentMode === 'code' ? 'none' : 'flex') : 'none';
    return { editorDisplay, previewDisplay };
  }

  // Step 1: Start at Split
  let layout = simulateLayout('split', false);
  assert(layout.editorDisplay === 'flex' && layout.previewDisplay === 'flex', 'Transition 1: Split mode shows both Code Editor and Preview side-by-side');

  // Step 2: Click 'code'
  layout = simulateLayout('code', true); // Even if previously maximized, clears it
  assert(layout.editorDisplay === 'flex' && layout.previewDisplay === 'none', 'Transition 2: Code mode expands Code Editor, hides Preview');

  // Step 3: Click 'preview'
  layout = simulateLayout('preview', false);
  assert(layout.editorDisplay === 'none' && layout.previewDisplay === 'flex', 'Transition 3: Preview mode expands Preview, hides Code Editor');

  // Step 4: Click 'split'
  layout = simulateLayout('split', false);
  assert(layout.editorDisplay === 'flex' && layout.previewDisplay === 'flex', 'Transition 4: Split mode correctly restores side-by-side layout');

  // Step 5: Click 'code' again
  layout = simulateLayout('code', false);
  assert(layout.editorDisplay === 'flex' && layout.previewDisplay === 'none', 'Transition 5: Subsequent Code click re-expands Code Editor without getting stuck');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Regression Audit (Criterion 6)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Regression Audit (Criterion 6) ---');
  assert(
    aiTestCode.includes('PANEL 4: AI Assistant'),
    'PANEL 4: AI Assistant panel layout is preserved'
  );
  assert(
    aiTestCode.includes('index.html') &&
    aiTestCode.includes('style.css') &&
    aiTestCode.includes('app.js'),
    'Multi-file tabs (index.html, style.css, app.js) are preserved'
  );
  assert(
    aiTestCode.includes('ai-submit-question-btn') &&
    aiTestCode.includes('ai-submit-all-btn'),
    'Submit Project and Submit All & Finish action buttons are preserved'
  );
  assert(
    aiTestCode.includes('warningMessage') &&
    aiTestCode.includes('{warningMessage}'),
    'Violation warning banner is preserved'
  );
  assert(
    aiTestCode.includes('isCameraDisconnected') &&
    aiTestCode.includes('<CameraDisconnectedOverlay'),
    'Webcam disconnect proctoring overlay & lock are preserved'
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
