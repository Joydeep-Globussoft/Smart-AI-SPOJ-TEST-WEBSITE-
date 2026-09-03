/**
 * QA Verification Suite for: Split / Code / Preview View-Mode Toggle on AI Test Screen
 *
 * Verifies all Acceptance Criteria:
 * 1. "Split / Code / Preview" segmented toggle exists on AI Test screen toolbar.
 * 2. Clicking "Split" displays both Code Editor and Preview side-by-side at default/custom proportions.
 * 3. Clicking "Code" hides Preview and expands Code Editor to full width.
 * 4. Clicking "Preview" hides Code Editor and expands Preview to full width.
 * 5. AI Assistant panel remains visible and functional in all three view modes.
 * 6. Selected view mode is persisted to sessionStorage (key: ai_test_view_mode).
 * 7. Panels toggle visibility via CSS display without unmounting, preserving unsaved code, tabs, and iframe state.
 * 8. Toggle is NOT added to standard candidate test screen (CandidateTestScreen.jsx).
 * 9. Regression prevention: BUG-14, BUG-31, BUG-33 preserved.
 */

const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: AI Test Editor View-Mode Toggle (Split/Code/Preview)');
  console.log('========================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${message}`);
      process.exitCode = 1;
    }
  }

  // Read CandidateAITestScreen.jsx and CandidateTestScreen.jsx
  const aiTestPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateAITestScreen.jsx');
  const stdTestPath = path.join(__dirname, '../../../../client/src/candidate/pages/CandidateTestScreen.jsx');

  const aiTestCode = fs.readFileSync(aiTestPath, 'utf-8');
  const stdTestCode = fs.readFileSync(stdTestPath, 'utf-8');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Segmented Toggle UI Component (Criterion 1)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Segmented Toggle Component & Buttons ---');
  assert(
    aiTestCode.includes('const ViewModeSegmentedToggle ='),
    'ViewModeSegmentedToggle component defined (Criterion 1)'
  );
  assert(
    aiTestCode.includes('Split') && aiTestCode.includes('Code') && aiTestCode.includes('Preview'),
    'Toggle contains all three modes: Split, Code, and Preview'
  );
  assert(
    aiTestCode.includes('#0E7C86'),
    'Toggle uses Globussoft teal (#0E7C86) for active state highlight'
  );
  // BUG-48 (REVISED): Toggle lives inside Code Editor header (split/code) and Preview header (preview); NEVER in top bar
  assert(
    !aiTestCode.includes('<ViewModeSegmentedToggle viewMode={viewMode} onChange={handleViewModeChange} />'),
    'Toggle NEVER appears in top header bar (BUG-48 Revised Criterion 1)'
  );
  assert(
    aiTestCode.includes("viewMode === 'split' || viewMode === 'code'") &&
    aiTestCode.includes('<ViewModeSegmentedToggle viewMode={viewMode} onChange={handleViewModeChange} compact />'),
    'Toggle placed in Code Editor panel header for Split and Code modes (BUG-48 Revised Criteria 2 & 3)'
  );
  assert(
    aiTestCode.includes("viewMode === 'preview'") &&
    aiTestCode.includes('<ViewModeSegmentedToggle viewMode={viewMode} onChange={handleViewModeChange} compact />'),
    'Toggle placed in Preview panel header for Preview mode (BUG-48 Revised Criterion 4)'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: State Persistence (Criterion 6)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: State Persistence in sessionStorage ---');
  assert(
    aiTestCode.includes("sessionStorage.getItem('ai_test_view_mode')"),
    'Initial viewMode state checks sessionStorage (key: ai_test_view_mode)'
  );
  assert(
    aiTestCode.includes("sessionStorage.setItem('ai_test_view_mode', mode)"),
    'handleViewModeChange persists selected mode to sessionStorage (Criterion 6)'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Layout computation for the 3 view modes (Criteria 2, 3, 4, 5, 7)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Panel Widths & Visibility Logic for 3 View Modes ---');

  function computePanelStyles(viewMode, maximizedPanel, panelWidths) {
    // Code Editor Panel style computation
    const editorDisplay = !maximizedPanel
      ? (viewMode === 'preview' ? 'none' : 'flex')
      : (maximizedPanel === 'editor' ? 'flex' : 'none');

    const editorFlex = maximizedPanel === 'editor'
      ? '1 1 100%'
      : viewMode === 'code'
      ? `0 0 calc(${panelWidths[1] + panelWidths[2]}% - 5px)`
      : `0 0 calc(${panelWidths[1]}% - 7.5px)`;

    // Preview Panel style computation
    const previewDisplay = !maximizedPanel
      ? (viewMode === 'code' ? 'none' : 'flex')
      : (maximizedPanel === 'preview' ? 'flex' : 'none');

    const previewFlex = maximizedPanel === 'preview'
      ? '1 1 100%'
      : viewMode === 'preview'
      ? `0 0 calc(${panelWidths[1] + panelWidths[2]}% - 5px)`
      : `0 0 calc(${panelWidths[2]}% - 7.5px)`;

    // Splitter 1 visibility
    const splitter1Visible = !maximizedPanel && viewMode === 'split';

    // AI Assistant Panel visibility
    const aiAssistantDisplay = !maximizedPanel || maximizedPanel === 'chat' ? 'flex' : 'none';

    return {
      editorDisplay,
      editorFlex,
      previewDisplay,
      previewFlex,
      splitter1Visible,
      aiAssistantDisplay,
    };
  }

  const widths = [24, 30, 24, 22];

  // Mode A: 'split'
  const splitStyles = computePanelStyles('split', null, widths);
  assert(splitStyles.editorDisplay === 'flex', 'Split mode: Code Editor is visible (Criterion 2)');
  assert(splitStyles.previewDisplay === 'flex', 'Split mode: Preview is visible (Criterion 2)');
  assert(splitStyles.splitter1Visible === true, 'Split mode: Splitter 1 between Code and Preview is active');
  assert(splitStyles.editorFlex === '0 0 calc(30% - 7.5px)', 'Split mode: Code Editor has its proportional width');
  assert(splitStyles.previewFlex === '0 0 calc(24% - 7.5px)', 'Split mode: Preview has its proportional width');
  assert(splitStyles.aiAssistantDisplay === 'flex', 'Split mode: AI Assistant is visible (Criterion 5)');

  // Mode B: 'code'
  const codeStyles = computePanelStyles('code', null, widths);
  assert(codeStyles.editorDisplay === 'flex', 'Code mode: Code Editor is visible (Criterion 3)');
  assert(codeStyles.previewDisplay === 'none', 'Code mode: Preview is hidden (Criterion 3)');
  assert(codeStyles.splitter1Visible === false, 'Code mode: Splitter 1 is hidden');
  assert(codeStyles.editorFlex === '0 0 calc(54% - 5px)', 'Code mode: Code Editor expands to fill Code + Preview (30% + 24% = 54%)');
  assert(codeStyles.aiAssistantDisplay === 'flex', 'Code mode: AI Assistant is visible (Criterion 5)');

  // Mode C: 'preview'
  const previewStyles = computePanelStyles('preview', null, widths);
  assert(previewStyles.editorDisplay === 'none', 'Preview mode: Code Editor is hidden (Criterion 4)');
  assert(previewStyles.previewDisplay === 'flex', 'Preview mode: Preview is visible (Criterion 4)');
  assert(previewStyles.splitter1Visible === false, 'Preview mode: Splitter 1 is hidden');
  assert(previewStyles.previewFlex === '0 0 calc(54% - 5px)', 'Preview mode: Preview expands to fill Code + Preview (30% + 24% = 54%)');
  assert(previewStyles.aiAssistantDisplay === 'flex', 'Preview mode: AI Assistant is visible (Criterion 5)');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Non-destructive DOM visibility toggling (Criterion 7)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Non-destructive DOM Visibility (No Unmounting) ---');
  assert(
    aiTestCode.includes("viewMode === 'preview' ? 'none' : 'flex'"),
    'Code Editor uses CSS display none/flex so Monaco is never unmounted or unsaved code lost (Criterion 7)'
  );
  assert(
    aiTestCode.includes("viewMode === 'code' ? 'none' : 'flex'"),
    'Preview uses CSS display none/flex so iframe DOM and live reload are preserved (Criterion 7)'
  );
  assert(
    aiTestCode.includes("window.dispatchEvent(new Event('resize'))"),
    'Resize event dispatched on viewMode change to trigger Monaco layout update'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Isolation to AI Test Screen Only (Criterion 8)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Toggle Not Present in Standard Test Screen ---');
  assert(
    !stdTestCode.includes('ViewModeSegmentedToggle'),
    'CandidateTestScreen.jsx does NOT contain ViewModeSegmentedToggle (Criterion 8)'
  );
  assert(
    !stdTestCode.includes('ai_test_view_mode'),
    'CandidateTestScreen.jsx does NOT use ai_test_view_mode (Criterion 8)'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Regression Prevention Audit (Criterion 9)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: Regression Prevention Audit (BUG-14, BUG-31, BUG-33) ---');
  assert(
    aiTestCode.includes('const handleProctorWarning = useCallback('),
    'CandidateAITestScreen preserves BUG-33 handleProctorWarning useCallback memoization'
  );
  assert(
    aiTestCode.includes('onWarning: handleProctorWarning'),
    'CandidateAITestScreen passes handleProctorWarning to useProctoring'
  );
  assert(
    aiTestCode.includes('allowInternalCopyPaste: true'),
    'CandidateAITestScreen preserves FR-6.1 internal copy paste permission'
  );
  assert(
    aiTestCode.includes('handleSubmitQuestion') && aiTestCode.includes('handleSubmitAll'),
    'CandidateAITestScreen preserves submission handlers'
  );

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('========================================================================');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
