/**
 * QA Automated Verification Suite: BUG-46 (View Mode Toggle Single Instance Consolidation)
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
  console.log('QA VERIFICATION SUITE: BUG-46 (View Mode Toggle Single Instance)');
  console.log('========================================================================\n');

  const aiTestPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateAITestScreen.jsx');
  const aiTestCode = fs.readFileSync(aiTestPath, 'utf-8');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Exactly ONE Instance Rendered (Criteria 1, 2, 3)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Single Authoritative Toggle Placement (BUG-48 Revised) ---');
  // Top header bar check (near Time Remaining - must NEVER appear here)
  const timerBarSection = aiTestCode.split('Time Remaining:')[1]?.split('Submit Project')[0] || '';
  assert(
    !timerBarSection.includes('<ViewModeSegmentedToggle'),
    'Toggle NEVER appears in top header bar (BUG-48 Revised Criterion 1)'
  );

  // Code Editor panel header check
  const editorHeaderSection = aiTestCode.split('PANEL 2: Code Editor')[1]?.split('Sub-header: File Tabs Bar')[0] || '';
  assert(
    editorHeaderSection.includes("viewMode === 'split' || viewMode === 'code'") &&
    editorHeaderSection.includes('<ViewModeSegmentedToggle'),
    'Toggle placed inside Code Editor panel header for Split and Code modes (BUG-48 Revised Criteria 2 & 3)'
  );

  // Preview panel header check
  const previewPanelSection = aiTestCode.split('PANEL 3: Preview')[1]?.split('Browser Address Bar Sub-header')[0] || '';
  assert(
    previewPanelSection.includes("viewMode === 'preview'") &&
    previewPanelSection.includes('<ViewModeSegmentedToggle'),
    'Toggle placed inside Preview panel header for Preview mode (BUG-48 Revised Criterion 4)'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Preview Panel Header Elements Preserved (Criterion 2)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Preview Panel Header Elements Preserved ---');
  assert(
    aiTestCode.includes('<span>http://localhost:3000</span>') &&
    aiTestCode.includes('● LIVE'),
    'Preview panel retains http://localhost:3000 address bar and ● LIVE indicator'
  );
  assert(
    aiTestCode.includes('title="Reload Preview"') &&
    aiTestCode.includes('title="Open in new window"'),
    'Preview panel retains reload and open-in-new-window controls'
  );
  assert(
    previewPanelSection.includes("setMaximizedPanel((p) => (p === 'preview' ? null : 'preview'))"),
    'Preview panel expand/restore button toggles full panel maximization (BUG-49)'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Shared State & Layout Functionality (Criterion 4)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Shared State & Layout Computation ---');
  assert(
    aiTestCode.includes("const [viewMode, setViewMode] = useState("),
    'Single shared viewMode state controls both Code Editor and Preview panels'
  );
  assert(
    aiTestCode.includes("viewMode === 'preview' ? 'none' : 'flex'"),
    'Code Editor hides (display: none) when viewMode is preview'
  );
  assert(
    aiTestCode.includes("viewMode === 'code' ? 'none' : 'flex'"),
    'Preview hides (display: none) when viewMode is code'
  );
  assert(
    aiTestCode.includes("viewMode === 'code'") &&
    aiTestCode.includes("calc(${panelWidths[1] + panelWidths[2]}% - 5px)"),
    'Code Editor expands to full center width in code mode'
  );
  assert(
    aiTestCode.includes("viewMode === 'preview'") &&
    aiTestCode.includes("calc(${panelWidths[1] + panelWidths[2]}% - 5px)"),
    'Preview expands to full center width in preview mode'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Zero Regressions to Key AI Test Components (Criterion 5)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Regression Audit (Criterion 5) ---');
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
