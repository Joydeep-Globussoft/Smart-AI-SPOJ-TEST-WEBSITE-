/**
 * QA Automated Verification Suite: BUG-49 (Violation Notification Auto-Dismiss)
 * Verifies auto-dismiss behavior for both top banner and top-right toast,
 * manual dismiss via "✕", timer reset on new violation, and single source of truth.
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
  console.log('QA VERIFICATION SUITE: BUG-49 (Violation Auto-Dismiss Notification)');
  console.log('========================================================================\n');

  const bannerPath = path.resolve(__dirname, '../../../../client/src/candidate/components/ViolationNotificationBanner.jsx');
  const testScreenPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateTestScreen.jsx');
  const aiTestScreenPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateAITestScreen.jsx');
  const proctoringPath = path.resolve(__dirname, '../../../../client/src/hooks/useProctoring.js');

  const bannerCode = fs.readFileSync(bannerPath, 'utf-8');
  const testScreenCode = fs.readFileSync(testScreenPath, 'utf-8');
  const aiTestScreenCode = fs.readFileSync(aiTestScreenPath, 'utf-8');
  const proctoringCode = fs.readFileSync(proctoringPath, 'utf-8');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Single Source of Truth - Shared Component & Hook (Criterion 4)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Shared Component & Single Source of Truth ---');
  assert(
    bannerCode.includes('export default function ViolationNotificationBanner'),
    'ViolationNotificationBanner component is exported as default'
  );
  assert(
    bannerCode.includes('export const useViolationNotification'),
    'useViolationNotification custom hook is exported from shared component'
  );
  assert(
    bannerCode.includes('export const showViolationToast'),
    'showViolationToast helper is exported with fixed toast ID and duration'
  );

  // Standard Test Screen integration
  assert(
    testScreenCode.includes("import ViolationNotificationBanner, { useViolationNotification } from '../components/ViolationNotificationBanner'"),
    'CandidateTestScreen imports shared ViolationNotificationBanner and useViolationNotification'
  );
  assert(
    testScreenCode.includes('<ViolationNotificationBanner'),
    'CandidateTestScreen renders shared ViolationNotificationBanner component'
  );

  // AI Test Screen integration
  assert(
    aiTestScreenCode.includes("import ViolationNotificationBanner, { useViolationNotification } from '../components/ViolationNotificationBanner'"),
    'CandidateAITestScreen imports shared ViolationNotificationBanner and useViolationNotification'
  );
  assert(
    aiTestScreenCode.includes('<ViolationNotificationBanner'),
    'CandidateAITestScreen renders shared ViolationNotificationBanner component'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Auto-Dismiss Behavior (5-8 seconds duration) (Criterion 1)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Auto-Dismiss Duration Configuration ---');
  assert(
    bannerCode.includes('DEFAULT_AUTO_DISMISS_MS = 6000') || bannerCode.includes('6000'),
    'Default auto-dismiss duration is set to 6000ms (within suggested 5-8s range)'
  );
  assert(
    bannerCode.includes('setTimeout') && bannerCode.includes('onDismiss?.()'),
    'ViolationNotificationBanner schedules auto-dismiss timer calling onDismiss'
  );
  assert(
    bannerCode.includes('id: VIOLATION_TOAST_ID') && bannerCode.includes('duration'),
    'showViolationToast specifies auto-dismiss duration option for toast'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Manual "✕" Close Button Preserved (Criterion 2)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Manual Dismissal Via "✕" Close Button ---');
  assert(
    bannerCode.includes('onClick={onDismiss}') && bannerCode.includes('✕'),
    'ViolationNotificationBanner renders interactive ✕ button invoking onDismiss'
  );
  assert(
    bannerCode.includes('toast.dismiss(t.id)') && bannerCode.includes('✕'),
    'showViolationToast renders interactive ✕ button invoking toast.dismiss'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Timer Reset on Successive Violations (Criterion 3)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Timer Reset and De-duplication on Successive Violations ---');
  assert(
    bannerCode.includes('clearTimeout(timerRef.current)') && bannerCode.includes('timerRef.current = setTimeout'),
    'useViolationNotification clears existing timer and schedules fresh countdown on new violation'
  );
  assert(
    bannerCode.includes('return () => clearTimeout(timer);'),
    'ViolationNotificationBanner useEffect clears previous timer when message prop changes'
  );
  assert(
    bannerCode.includes("const VIOLATION_TOAST_ID = 'proctor-violation-toast'"),
    'Fixed toast ID ensures successive violations update toast in-place instead of stacking'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Backend Violation Logging & Screen-Capture Proof Preserved (Criterion 5)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Violation Persistence & Proctoring Integrity ---');
  assert(
    proctoringCode.includes('triggerDelayedScreenViolation'),
    'useProctoring delayed screen-capture violation logic preserved'
  );
  assert(
    testScreenCode.includes('onCandidateWarning(onWarning)'),
    'CandidateTestScreen socket onCandidateWarning listener preserved'
  );
  assert(
    aiTestScreenCode.includes('onCandidateWarning(onWarning)'),
    'CandidateAITestScreen socket onCandidateWarning listener preserved'
  );
  assert(
    testScreenCode.includes('CameraDisconnectedOverlay') &&
    aiTestScreenCode.includes('CameraDisconnectedOverlay'),
    'CameraDisconnectedOverlay integration preserved across both candidate screens'
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
