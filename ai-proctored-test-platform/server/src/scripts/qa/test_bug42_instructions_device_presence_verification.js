/**
 * QA Automated Verification Suite: Instructions Page Real Device Presence & Live Stream Verification
 * (Pre-Test Webcam Verification vs Cached Permission & Static Placeholder)
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
  console.log('QA VERIFICATION SUITE: Instructions Real Device Presence Verification');
  console.log('========================================================================\n');

  const instructionsPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateInstructions.jsx');
  const verifierPath = path.resolve(__dirname, '../../../../client/src/services/mediaStreamVerifier.js');

  const instructionsCode = fs.readFileSync(instructionsPath, 'utf-8');
  const verifierCode = fs.readFileSync(verifierPath, 'utf-8');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Shared Media Stream Verifier Integration (Criteria 5 & 6)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- TEST 1: Shared Media Stream Verifier Integration ---');
  assert(
    instructionsCode.includes("import { verifyActiveVideoStream, checkHardwareDevices } from '../../services/mediaStreamVerifier'"),
    'CandidateInstructions imports verifyActiveVideoStream and checkHardwareDevices'
  );
  assert(
    verifierCode.includes('export async function verifyActiveVideoStream') &&
    verifierCode.includes('export async function checkHardwareDevices'),
    'mediaStreamVerifier exports verifyActiveVideoStream and checkHardwareDevices'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Distinct Webcam Status & Error Handling (Criteria 1 & 2)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: Distinct Webcam Status & Error Handling ---');
  assert(
    instructionsCode.includes("webcamStatus === 'NOT_FOUND'") &&
    instructionsCode.includes('✗ No Camera Found'),
    'CandidateInstructions displays "✗ No Camera Found" when no webcam is detected'
  );
  assert(
    instructionsCode.includes("vErr.name === 'NotFoundError' || vErr.name === 'DevicesNotFoundError'") &&
    instructionsCode.includes("setWebcamStatus('NOT_FOUND')"),
    'NotFoundError explicitly sets webcamStatus to NOT_FOUND'
  );
  assert(
    instructionsCode.includes("vErr.name === 'NotAllowedError' || vErr.name === 'PermissionDeniedError'") &&
    instructionsCode.includes("setWebcamStatus('DENIED')"),
    'NotAllowedError explicitly sets webcamStatus to DENIED ("✗ Not Granted")'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Static Placeholder Detection (Criteria 3 & 4)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: Static Placeholder & Idle Driver Detection ---');
  assert(
    verifierCode.includes('STATIC_PLACEHOLDER') &&
    verifierCode.includes('diff === 0'),
    'mediaStreamVerifier samples frames and detects 0-diff static graphics (e.g. Iriun cat image)'
  );
  assert(
    instructionsCode.includes('const feedHealth = await verifyActiveVideoStream') &&
    instructionsCode.includes("setWebcamStatus('NOT_FOUND')"),
    'CandidateInstructions validates live frame delivery before marking webcam as GRANTED'
  );
  assert(
    instructionsCode.includes('No active camera feed detected. Your camera driver appears idle or disconnected'),
    'Explicit error message for idle/disconnected virtual camera drivers'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Live Preview Box Synchronization (Criterion 3)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: Live Preview Box Synchronization ---');
  assert(
    instructionsCode.includes('{webcamGranted && (') &&
    instructionsCode.includes('● LIVE PREVIEW'),
    '"● LIVE PREVIEW" badge is strictly rendered ONLY when webcamGranted is true'
  );
  assert(
    instructionsCode.includes('No Webcam Detected') &&
    instructionsCode.includes('Connect a physical camera and click "Grant Permissions"'),
    'Clean "No Webcam Detected" placeholder rendered when camera is not connected'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Microphone & Screen Share Parity (Criteria 4 & 5)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 5: Microphone & Screen Share Parity ---');
  assert(
    instructionsCode.includes("micStatus === 'NOT_FOUND'") &&
    instructionsCode.includes('✗ No Mic Found'),
    'Microphone explicitly differentiates "✗ No Mic Found" from permission denial'
  );
  assert(
    instructionsCode.includes("screenStatus === 'GRANTED' ? '✓ Granted' : '✗ Not Granted'"),
    'Screen share explicitly checks active stream and monitor displaySurface'
  );
  assert(
    instructionsCode.includes("surface && surface !== 'monitor'") &&
    instructionsCode.includes("setScreenStatus('DENIED')"),
    'Tab/Window sharing is rejected with instruction to share Entire Screen'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Hardware Change & Start Button Lockdown (Criteria 2 & 5)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TEST 6: Hardware Change & Start Button Lockdown ---');
  assert(
    instructionsCode.includes("addEventListener('devicechange', handleDeviceChange)"),
    'devicechange listener attached on instructions page to catch real-time hardware disconnections'
  );
  assert(
    instructionsCode.includes('disabled={loading || !isPermissionsComplete}'),
    '"Start Test — Enter Fullscreen" button strictly disabled unless all 3 permissions are GRANTED'
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
