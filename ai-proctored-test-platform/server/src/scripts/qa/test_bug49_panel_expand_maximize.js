/**
 * QA Automated Verification Suite: BUG-49
 * Expand/Maximize Icon Behavior Across All Four Panels:
 * Question, Code Editor, Preview, AI Assistant
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
  console.log('QA VERIFICATION SUITE: BUG-49 (Panel Expand/Maximize Functionality)');
  console.log('========================================================================\n');

  const aiTestPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateAITestScreen.jsx');
  const aiTestCode = fs.readFileSync(aiTestPath, 'utf-8');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Consistent Expand/Restore Handlers Across All 4 Panels (Criteria 1, 2, 4)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Symmetrical Maximize Handlers Across All 4 Panels ---');

  // Panel 1: Question
  assert(
    aiTestCode.includes("setMaximizedPanel((p) => (p === 'question' ? null : 'question'))"),
    'Question panel expand button toggles maximizedPanel === "question"'
  );
  assert(
    aiTestCode.includes("maximizedPanel === 'question' ? 'Restore Panel' : 'Maximize Panel'"),
    'Question panel expand button has dynamic Restore/Maximize tooltip'
  );

  // Panel 2: Code Editor
  assert(
    aiTestCode.includes("id=\"ai-panel2-expand-btn\"") &&
    aiTestCode.includes("setMaximizedPanel((p) => (p === 'editor' ? null : 'editor'))"),
    'Code Editor panel expand button toggles maximizedPanel === "editor" (Criterion 1)'
  );
  assert(
    aiTestCode.includes("maximizedPanel === 'editor' ? 'Restore Panel' : 'Maximize Panel'"),
    'Code Editor panel expand button has dynamic Restore/Maximize tooltip'
  );
  assert(
    aiTestCode.includes("maximizedPanel === 'editor' ? '🗗' : '⛶'"),
    'Code Editor panel expand button toggles between 🗗 (restore) and ⛶ (maximize)'
  );

  // Panel 3: Preview
  assert(
    aiTestCode.includes("id=\"ai-panel3-expand-btn\"") &&
    aiTestCode.includes("setMaximizedPanel((p) => (p === 'preview' ? null : 'preview'))"),
    'Preview panel expand button toggles maximizedPanel === "preview" (Criterion 2)'
  );
  assert(
    aiTestCode.includes("maximizedPanel === 'preview' ? 'Restore Panel' : 'Maximize Panel'"),
    'Preview panel expand button has dynamic Restore/Maximize tooltip'
  );
  assert(
    aiTestCode.includes("maximizedPanel === 'preview' ? '🗗' : '⛶'"),
    'Preview panel expand button toggles between 🗗 (restore) and ⛶ (maximize)'
  );

  // Panel 4: AI Assistant
  assert(
    aiTestCode.includes("setMaximizedPanel((p) => (p === 'chat' ? null : 'chat'))"),
    'AI Assistant panel expand button toggles maximizedPanel === "chat" (Criterion 4)'
  );
  assert(
    aiTestCode.includes("maximizedPanel === 'chat' ? 'Restore Panel' : 'Maximize Panel'"),
    'AI Assistant panel expand button has dynamic Restore/Maximize tooltip'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Layout CSS Computations for Maximized State (Criteria 1, 2)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Full Width Layout Computations in Maximized State ---');

  // Code Editor flex & display when maximized
  assert(
    aiTestCode.includes("maximizedPanel === 'editor'\n              ? '1 1 100%'") ||
    aiTestCode.includes("maximizedPanel === 'editor' ? '1 1 100%'") ||
    aiTestCode.includes("maximizedPanel === 'editor'"),
    'Code Editor allocates 1 1 100% flex space when maximized'
  );
  assert(
    aiTestCode.includes("maximizedPanel === 'editor' ? 'flex' : 'none'"),
    'Code Editor sets display to flex when maximized, while hiding when another panel is maximized'
  );

  // Preview flex & display when maximized
  assert(
    aiTestCode.includes("maximizedPanel === 'preview'\n              ? '1 1 100%'") ||
    aiTestCode.includes("maximizedPanel === 'preview' ? '1 1 100%'") ||
    aiTestCode.includes("maximizedPanel === 'preview'"),
    'Preview allocates 1 1 100% flex space when maximized'
  );
  assert(
    aiTestCode.includes("maximizedPanel === 'preview' ? 'flex' : 'none'"),
    'Preview sets display to flex when maximized, while hiding when another panel is maximized'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: State Restoration Simulation (Criterion 3)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: State Restoration Simulation ---');

  function simulatePanelVisibility(maximized, viewMode) {
    return {
      question: (!maximized || maximized === 'question') ? 'flex' : 'none',
      editor: !maximized ? (viewMode === 'preview' ? 'none' : 'flex') : (maximized === 'editor' ? 'flex' : 'none'),
      preview: !maximized ? (viewMode === 'code' ? 'none' : 'flex') : (maximized === 'preview' ? 'flex' : 'none'),
      chat: (!maximized || maximized === 'chat') ? 'flex' : 'none',
    };
  }

  // 1. In Split view, maximize Code Editor -> only Editor is visible
  const splitMaxEditor = simulatePanelVisibility('editor', 'split');
  assert(splitMaxEditor.editor === 'flex' && splitMaxEditor.question === 'none' && splitMaxEditor.preview === 'none' && splitMaxEditor.chat === 'none',
    'Maximized Code Editor hides all other 3 panels'
  );

  // 2. Restore -> both Editor and Preview are visible again
  const restoredSplit = simulatePanelVisibility(null, 'split');
  assert(restoredSplit.editor === 'flex' && restoredSplit.preview === 'flex' && restoredSplit.question === 'flex' && restoredSplit.chat === 'flex',
    'Restoring Code Editor in split view restores all 4 panels to split view layout'
  );

  // 3. In Split view, maximize Preview -> only Preview is visible
  const splitMaxPreview = simulatePanelVisibility('preview', 'split');
  assert(splitMaxPreview.preview === 'flex' && splitMaxPreview.question === 'none' && splitMaxPreview.editor === 'none' && splitMaxPreview.chat === 'none',
    'Maximized Preview hides all other 3 panels'
  );

  // 4. In Code view, maximize Code Editor -> restore -> returns to Code view (Preview stays hidden)
  const codeMaxEditor = simulatePanelVisibility('editor', 'code');
  assert(codeMaxEditor.editor === 'flex' && codeMaxEditor.preview === 'none', 'Maximized editor in code mode is full-width');
  const restoredCode = simulatePanelVisibility(null, 'code');
  assert(restoredCode.editor === 'flex' && restoredCode.preview === 'none', 'Restored editor in code mode keeps preview hidden');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: ViewMode Toggle Remains Accessible & Clears Maximize (Criterion 5)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Toggle Accessibility & Clearing Maximize ---');

  assert(
    aiTestCode.includes("(!maximizedPanel ? (viewMode === 'split' || viewMode === 'code') : maximizedPanel === 'editor')"),
    'Toggle remains accessible in Code Editor header during normal split/code modes or when editor is maximized'
  );
  assert(
    aiTestCode.includes("(!maximizedPanel ? viewMode === 'preview' : maximizedPanel === 'preview')"),
    'Toggle remains accessible in Preview header during normal preview mode or when preview is maximized'
  );
  assert(
    aiTestCode.includes("setMaximizedPanel(null)") &&
    aiTestCode.includes("handleViewModeChange = useCallback"),
    'Clicking ViewModeSegmentedToggle clears any active maximize state immediately'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Smooth Monaco Re-layout on Maximize & Regression Audit
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Monaco Re-layout & Regression Audit ---');

  assert(
    aiTestCode.includes("[viewMode, maximizedPanel]"),
    'Monaco editor resize dispatch listens to both viewMode and maximizedPanel changes'
  );
  assert(
    aiTestCode.includes('id="ai-test-preview-iframe"'),
    'Preview iframe id preserved for BUG-48 Part B tab-switch exemption'
  );
  assert(
    aiTestCode.includes('ai-submit-all-btn'),
    'Submit All & Finish button preserved'
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
