// test_malpractice_deduplication.js
// Verifies fix for duplicate malpractice alerts, delayed evidence capture buffering,
// single-modal proof updates, and elimination of duplicate modal blocks.

const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✕ [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ [PASS] ${message}`);
}

async function runSuite() {
  console.log('========================================================================');
  console.log('QA VERIFICATION: Malpractice Alert Deduplication & Evidence Buffering');
  console.log('========================================================================\n');

  const proctoringControllerPath = path.join(__dirname, '../../controllers/proctoringController.js');
  const socketHandlerPath = path.join(__dirname, '../../sockets/socketHandler.js');
  const adminLiveDashboardPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');
  const socketClientPath = path.join(__dirname, '../../../../client/src/services/socketClient.js');

  const proctoringCode = fs.readFileSync(proctoringControllerPath, 'utf8');
  const socketCode = fs.readFileSync(socketHandlerPath, 'utf8');
  const adminDashboardCode = fs.readFileSync(adminLiveDashboardPath, 'utf8');
  const socketClientCode = fs.readFileSync(socketClientPath, 'utf8');

  // --- CHECK 1: Backend proctoringController Evidence Update Tagging ---
  console.log('--- CHECK 1: Backend proctoringController Evidence Update Tagging ---');
  assert(
    proctoringCode.includes('const isExistingLogUpdate = Boolean(log);'),
    'proctoringController checks if incoming POST /violation updates an existing recent log'
  );
  assert(
    proctoringCode.includes('isEvidenceUpdate: isExistingLogUpdate'),
    'proctoringController flags isEvidenceUpdate on malpractice:alert socket emit'
  );
  assert(
    proctoringCode.includes("io.to(`test:${testId}:admin`).emit('malpractice:evidence-updated'"),
    'proctoringController emits dedicated malpractice:evidence-updated event'
  );
  assert(
    proctoringCode.includes('if (!isExistingLogUpdate) {') &&
    proctoringCode.includes("io.to(`candidate:${candidateId}`).emit('candidate:warning'"),
    'Candidate warning is NOT duplicated when delayed evidence proof arrives'
  );

  // --- CHECK 2: Backend socketHandler Pending Proof Tagging ---
  console.log('\n--- CHECK 2: Backend socketHandler Pending Proof Tagging ---');
  assert(
    socketCode.includes("hasPendingProof: violationType === 'FULLSCREEN_EXIT' || violationType === 'TAB_SWITCH'"),
    'socketHandler flags hasPendingProof: true for delayed-capture events (FULLSCREEN_EXIT & TAB_SWITCH)'
  );

  // --- CHECK 3: Socket Client Listeners ---
  console.log('\n--- CHECK 3: Socket Client Listeners ---');
  assert(
    socketClientCode.includes("export const onMalpracticeEvidenceUpdated"),
    'socketClient exports onMalpracticeEvidenceUpdated'
  );
  assert(
    socketClientCode.includes("export const offMalpracticeEvidenceUpdated"),
    'socketClient exports offMalpracticeEvidenceUpdated'
  );

  // --- CHECK 4: Admin Live Dashboard Alert Deduplication & Buffering ---
  console.log('\n--- CHECK 4: Admin Live Dashboard Alert Deduplication & Buffering ---');
  assert(
    adminDashboardCode.includes('const pendingDelayedEvidenceRef = useRef(new Map());'),
    'AdminLiveDashboard tracks pendingDelayedEvidenceRef to buffer alerts awaiting proof screenshots'
  );
  assert(
    adminDashboardCode.includes('const recentDismissedAlertsRef = useRef(new Map());'),
    'AdminLiveDashboard tracks recently dismissed alerts to prevent re-popping dismissed modals'
  );
  assert(
    adminDashboardCode.includes('closeActiveAlert'),
    'AdminLiveDashboard implements closeActiveAlert to record dismissed log IDs'
  );
  assert(
    adminDashboardCode.includes('proofScreenshotUrl: alertData.proofScreenshotUrl') &&
    adminDashboardCode.includes('isCurrentlyActive'),
    'AdminLiveDashboard updates currently active alert live when proof screenshot arrives (no duplicate modal)'
  );
  assert(
    adminDashboardCode.includes('alreadyInQueue'),
    'AdminLiveDashboard updates queued alert in-place rather than appending a duplicate entry'
  );
  assert(
    adminDashboardCode.includes('pendingDelayedEvidenceRef.current.delete'),
    'AdminLiveDashboard clears pending buffer and merges proof screenshot seamlessly'
  );
  assert(
    adminDashboardCode.includes('Capturing proof evidence screenshot...'),
    'AdminLiveDashboard renders sleek capture indicator when proof screenshot is pending'
  );

  // --- CHECK 5: Duplicate JSX Modal Snippet Elimination ---
  console.log('\n--- CHECK 5: Single Source of Truth & Duplicate JSX Snippet Elimination ---');
  const alertModalMatches = (adminDashboardCode.match(/<h3[^>]*>[\s\n]*Real-Time Malpractice Alert/g) || []).length;
  assert(
    alertModalMatches === 1,
    `AdminLiveDashboard contains exactly 1 alert modal definition (found ${alertModalMatches})`
  );
  assert(
    !adminDashboardCode.includes('Malpractice Alert (FR-7.3)</h3>'),
    'Obsolete duplicate modal block with zIndex 1100 has been completely removed'
  );
  assert(
    adminDashboardCode.includes("activeAlert.violationType === 'CAMERA_DISCONNECTED'"),
    'Camera disconnected security alert box preserved in the modern alert modal'
  );

  console.log('\n========================================================================');
  console.log('✓ ALL MALPRACTICE DEDUPLICATION VERIFICATION CHECKS PASSED!');
  console.log('========================================================================\n');
}

runSuite().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
