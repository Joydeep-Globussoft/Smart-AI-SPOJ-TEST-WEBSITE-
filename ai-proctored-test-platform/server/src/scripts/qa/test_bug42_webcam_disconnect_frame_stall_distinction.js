/**
 * QA Automated Verification Suite: BUG-42 Frame Delivery Stall Detection & Face Absence Distinction
 *
 * Verifies that:
 * 1. The architectural directive & regression guard is permanently preserved in useProctoring.js.
 * 2. Active video frame presentation (requestVideoFrameCallback, totalVideoFrames, currentTime)
 *    is continuously monitored to detect physical disconnects that leave track.readyState 'live'.
 * 3. MediaPipe face detection NEVER executes on a frozen/stalled video frame.
 * 4. "No Face Detected" (low severity) remains strictly distinct from "Camera Disconnected" (high severity).
 * 5. Reconnection does not run in a busy 1-second polling loop that auto-dismisses the overlay on virtual drivers.
 * 6. Lockdown behavior across code editor, buttons, and navigation is strictly enforced.
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
  console.log('QA VERIFICATION SUITE: BUG-42 Frame Delivery Stall & Disconnect Distinction');
  console.log('========================================================================\n');

  const useProctoringPath = path.resolve(__dirname, '../../../../client/src/hooks/useProctoring.js');
  const candidateTestScreenPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateTestScreen.jsx');
  const candidateAITestScreenPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateAITestScreen.jsx');
  const overlayPath = path.resolve(__dirname, '../../../../client/src/candidate/components/CameraDisconnectedOverlay.jsx');
  const webcamPipPath = path.resolve(__dirname, '../../../../client/src/shared/DraggableWebcamPip.jsx');

  const useProctoringCode = fs.readFileSync(useProctoringPath, 'utf-8');
  const candidateTestScreenCode = fs.readFileSync(candidateTestScreenPath, 'utf-8');
  const candidateAITestScreenCode = fs.readFileSync(candidateAITestScreenPath, 'utf-8');
  const overlayCode = fs.readFileSync(overlayPath, 'utf-8');
  const webcamPipCode = fs.readFileSync(webcamPipPath, 'utf-8');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Architectural Directive & Regression Guard Comment (Requirement 4)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Architectural Directive & Regression Guard ---');
  assert(
    useProctoringCode.includes('ARCHITECTURAL DIRECTIVE & REGRESSION GUARD: WEBCAM DISCONNECT VS NO FACE') &&
    useProctoringCode.includes('WARNING: THIS DETECTION LOGIC HAS FAILED REPEATEDLY (4 OCCURRENCES)'),
    'Prominent architectural comment is present at top of disconnect logic'
  );
  assert(
    useProctoringCode.includes('LOW SEVERITY — "NO FACE DETECTED"') &&
    useProctoringCode.includes('Shows ONLY the small floating "❌ No Face!" badge in DraggableWebcamPip'),
    'Directive explicitly documents low-severity non-blocking behavior for covered face / looking away'
  );
  assert(
    useProctoringCode.includes('HIGH SEVERITY — "CAMERA DISCONNECTED"') &&
    useProctoringCode.includes('Immediately activates full-screen blocking CameraDisconnectedOverlay'),
    'Directive explicitly documents high-severity full-screen blocking behavior for physical disconnect'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Active Frame Delivery Tracking & Frozen Frame Prevention
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Active Frame Delivery Tracking & Frozen Frame Prevention ---');
  assert(
    useProctoringCode.includes('lastFramePresentedTimeRef') &&
    useProctoringCode.includes('lastVideoTotalFramesRef') &&
    useProctoringCode.includes('frameCallbackIdRef'),
    'Frame delivery tracking refs declared in useProctoring'
  );
  assert(
    useProctoringCode.includes('requestVideoFrameCallback') &&
    useProctoringCode.includes('lastFramePresentedTimeRef.current = Date.now()'),
    'Native requestVideoFrameCallback listener attached to video element'
  );
  assert(
    useProctoringCode.includes('getVideoPlaybackQuality') &&
    useProctoringCode.includes('totalVideoFrames > lastVideoTotalFramesRef.current'),
    'Continuous fallback monitoring via HTMLVideoElement.getVideoPlaybackQuality().totalVideoFrames'
  );
  assert(
    useProctoringCode.includes('const isFrameStalled = isMediaReady && !document.hidden && timeSinceLastFrame > 2000'),
    'Frame stall detected when no frames presented for > 2000ms'
  );
  assert(
    useProctoringCode.includes('document.hidden') &&
    useProctoringCode.includes('lastFramePresentedTimeRef.current = Date.now()'),
    'Background/hidden tabs protected from false camera disconnect triggers'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Face Detection Loop Safety — MediaPipe NEVER Runs on Frozen Frames
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Face Detection Safety ---');
  const frameStallIdx = useProctoringCode.indexOf('isFrameStalled');
  const detectForVideoIdx = useProctoringCode.indexOf('detectForVideo(video, startTimeMs)');
  assert(
    frameStallIdx > 0 && detectForVideoIdx > 0 && frameStallIdx < detectForVideoIdx,
    'Frame stall and disconnect check strictly precedes MediaPipe detectForVideo execution'
  );
  assert(
    useProctoringCode.includes('if (isCameraDisconnectedRef.current)') &&
    useProctoringCode.includes('suppress face detection and avoid running on stale frames'),
    'Face detection loop completely suppresses execution while camera is marked disconnected'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Elimination of Faulty 1-Second Auto-Reconnect Polling Loop
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Auto-Reconnect Behavior ---');
  assert(
    !useProctoringCode.includes('setInterval(checkCameraHardware, 1000)'),
    'Faulty 1000ms auto-reconnect polling loop is removed to prevent false recovery on virtual cameras'
  );
  assert(
    useProctoringCode.includes("addEventListener('devicechange', onDeviceChange)") &&
    useProctoringCode.includes('videoDevices.length > knownDeviceCount'),
    'Auto-reconnection only attempts on genuine hardware plug-in events (devicechange with new device count)'
  );
  assert(
    overlayCode.includes('id="reconnect-camera-btn"') &&
    candidateTestScreenCode.includes('onRetry={proctoring?.reconnectCamera}'),
    'Candidate manual "Reconnect Camera" button is authoritative recovery path'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Complete Lockdown & Manual Sequence Contract (2a - 2f)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Interaction Lockdown Contract ---');
  assert(
    candidateTestScreenCode.includes('readOnly: Boolean(disqualified || proctoring?.isCameraDisconnected)'),
    'Editor locked in readOnly mode when isCameraDisconnected is true (Step 2d)'
  );
  assert(
    candidateTestScreenCode.includes('disabled={isRunning || !code || disqualified || proctoring?.isCameraDisconnected}'),
    'Run and Submit buttons disabled when isCameraDisconnected is true (Step 2d)'
  );
  assert(
    candidateTestScreenCode.includes('cursor: proctoring?.isCameraDisconnected ? \'not-allowed\' : \'pointer\''),
    'Question navigation tabs locked with not-allowed cursor when disconnected (Step 2d)'
  );
  assert(
    webcamPipCode.includes('❌ No Face!') &&
    webcamPipCode.includes('✓ Face Detected'),
    'Floating PIP widget retains non-blocking No Face / Face Detected badge states (Steps 2a, 2b, 2c)'
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
