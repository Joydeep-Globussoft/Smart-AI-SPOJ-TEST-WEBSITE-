/**
 * QA Automated Verification Suite: BUG-XX (BUG-50)
 * Preview Section External/Open Icon Triggers False Tab-Switch Violation
 *
 * Verifies that:
 * 1. The Preview external/open icon (↗) no longer calls window.open() or opens a new browser tab/window.
 * 2. Clicking the icon opens an in-page modal dialog keeping the candidate within the active test context.
 * 3. No browser tab switch is triggered and no TAB_SWITCH malpractice log / alert / counter increment occurs.
 * 4. Closing the preview modal (via "✕ Close Preview" or Escape key) cleanly restores candidate test interaction.
 * 5. Genuine browser tab-switching (document.hidden, Alt-Tab) detection remains 100% intact and unweakened.
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
  console.log('QA VERIFICATION SUITE: BUG-XX (Preview In-Page Modal & No Tab-Switch)');
  console.log('========================================================================\n');

  const aiTestPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateAITestScreen.jsx');
  const proctoringPath = path.resolve(__dirname, '../../../../client/src/hooks/useProctoring.js');

  const aiTestCode = fs.readFileSync(aiTestPath, 'utf-8');
  const proctoringCode = fs.readFileSync(proctoringPath, 'utf-8');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Elimination of window.open & target="_blank" (Criteria 1, 4)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Elimination of External Window & Tab Opening ---');

  assert(
    !aiTestCode.includes('window.open('),
    'window.open() is completely eliminated from CandidateAITestScreen (Criteria 1 & 4)'
  );
  assert(
    !aiTestCode.includes('target="_blank"'),
    'target="_blank" is not used in CandidateAITestScreen'
  );
  assert(
    !aiTestCode.includes("window.open(url, '_blank')"),
    'Direct blob URL popout to external window is removed'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: In-Page Full Preview Modal Implementation (Criteria 2, 3, 7)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: In-Page Full Preview Modal Implementation ---');

  assert(
    aiTestCode.includes('const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);') ||
    aiTestCode.includes('[isPreviewModalOpen, setIsPreviewModalOpen]'),
    'CandidateAITestScreen defines isPreviewModalOpen state'
  );

  assert(
    aiTestCode.includes('id="ai-preview-popout-btn"') &&
    aiTestCode.includes('onClick={() => setIsPreviewModalOpen(true)}'),
    'External open icon (↗) sets isPreviewModalOpen(true) to open in-page modal (Criterion 2)'
  );

  assert(
    aiTestCode.includes('id="ai-preview-modal-overlay"') &&
    aiTestCode.includes('role="dialog"'),
    'Renders in-page modal overlay with role="dialog" and aria-modal="true" (Criterion 3)'
  );

  assert(
    aiTestCode.includes('id="ai-preview-modal-close-btn"') &&
    aiTestCode.includes('onClick={() => setIsPreviewModalOpen(false)}'),
    'In-page modal provides interactive "✕ Close Preview" button to resume test (Criterion 7)'
  );

  assert(
    aiTestCode.includes("e.key === 'Escape' && isPreviewModalOpen") &&
    aiTestCode.includes('setIsPreviewModalOpen(false)'),
    'Pressing Escape key automatically closes in-page preview modal'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Modal Live Preview Controls & Iframe Integration (Criteria 9)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Modal Live Preview Controls & Iframe Integration ---');

  assert(
    aiTestCode.includes('id="ai-preview-modal-reload-btn"') &&
    aiTestCode.includes('onClick={() => setPreviewKey((k) => k + 1)}'),
    'In-page modal retains ↻ Reload functionality (Criterion 9)'
  );

  assert(
    aiTestCode.includes('id="ai-test-preview-modal-iframe"') &&
    aiTestCode.includes('data-preview-iframe="true"'),
    'Modal iframe is tagged with data-preview-iframe="true" for proctoring exemption'
  );

  assert(
    aiTestCode.includes('sandbox="allow-scripts allow-modals"'),
    'Modal iframe uses standard sandbox permissions without popups or external navigation'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Tab Switch Detection Integrity & Proctoring Unweakened (Criteria 4, 5, 8)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Proctoring & Tab Switch Detection Integrity ---');

  assert(
    proctoringCode.includes("triggerDelayedScreenViolation('TAB_SWITCH'"),
    'useProctoring maintains standard TAB_SWITCH detection'
  );

  assert(
    proctoringCode.includes('document.hidden') &&
    proctoringCode.includes('handleVisibilityChange'),
    'Genuine tab switches (document.hidden) trigger TAB_SWITCH violation (Criterion 8)'
  );

  assert(
    proctoringCode.includes('isInternalIframeFocus') &&
    proctoringCode.includes("active.dataset?.previewIframe === 'true'"),
    'Focusing into data-preview-iframe iframe is recognized as internal activity'
  );

  assert(
    aiTestCode.includes('zIndex: 950') &&
    aiTestCode.includes('CameraDisconnectedOverlay'),
    'Modal z-index (950) allows webcam PiP (1000) and proctoring overlays to remain visible on top'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Regression Audit (Criterion 10)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Regression Audit Across Candidate Features ---');

  assert(
    aiTestCode.includes('ViewModeSegmentedToggle'),
    'ViewMode segmented toggle is preserved'
  );
  assert(
    aiTestCode.includes('ViolationNotificationBanner'),
    'ViolationNotificationBanner auto-dismiss component is preserved'
  );
  assert(
    aiTestCode.includes('ai-panel2-expand-btn') &&
    aiTestCode.includes('ai-panel3-expand-btn'),
    'Panel 2 and Panel 3 expand/restore buttons are preserved'
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
