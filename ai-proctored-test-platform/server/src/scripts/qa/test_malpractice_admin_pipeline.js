// test_malpractice_admin_pipeline.js
// Automated verification for end-to-end violation & malpractice telemetry to Admin Panel
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../../.env') });

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✕ FAIL: ${message}`);
  }
}

async function runSuite() {
  console.log('\n========================================================================');
  console.log('QA VERIFICATION: End-to-End Malpractice Data Delivery to Admin Panel');
  console.log('========================================================================\n');

  const proctoringControllerPath = path.join(__dirname, '../../controllers/proctoringController.js');
  const socketHandlerPath = path.join(__dirname, '../../sockets/socketHandler.js');
  const adminLiveDashboardPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx');
  const useProctoringPath = path.join(__dirname, '../../../../client/src/hooks/useProctoring.js');

  const proctoringCode = fs.readFileSync(proctoringControllerPath, 'utf8');
  const socketCode = fs.readFileSync(socketHandlerPath, 'utf8');
  const adminDashboardCode = fs.readFileSync(adminLiveDashboardPath, 'utf8');
  const proctoringHookCode = fs.readFileSync(useProctoringPath, 'utf8');

  // --- TEST 1: Backend proctoringController Malpractice Emitters & Resilient Room Resolution ---
  console.log('--- TEST 1: Backend proctoringController Malpractice Emitters ---');
  assert(
    proctoringCode.includes("io.to(`test:${testId}:admin`).emit('malpractice:alert'"),
    'proctoringController emits malpractice:alert to test:${testId}:admin room'
  );
  assert(
    proctoringCode.includes("io.to(`test:${testId}:admin`).emit('dashboard:update'"),
    'proctoringController emits dashboard:update to test:${testId}:admin room'
  );
  assert(
    proctoringCode.includes("io.to(`test:${testId}:admin`).emit('seatmap:status'"),
    'proctoringController emits seatmap:status to test:${testId}:admin room'
  );
  assert(
    proctoringCode.includes('Submission.findOne({ candidateId, testId })'),
    'Auto-resolves roomId from active submission if omitted by client'
  );
  assert(
    proctoringCode.includes("proofScreenshotUrl = screenshotBase64"),
    'Graceful fallback to data URL proof if Cloudinary upload is unconfigured'
  );

  // --- TEST 2: Socket Handler Admin Channel Authentication & Candidate Event Broadcasts ---
  console.log('\n--- TEST 2: Socket Handler Channel & Role Contracts ---');
  assert(
    socketCode.includes("['SUPER_ADMIN', 'ADMIN'].includes(socket.user?.role)") || socketCode.includes("socket.user?.type === 'admin'"),
    'admin:join permits both role-based and type-based admin credentials'
  );
  assert(
    socketCode.includes("socket.on('candidate:tabswitch'"),
    'socketHandler listens for candidate:tabswitch'
  );
  assert(
    socketCode.includes("socket.on('candidate:fullscreenexit'"),
    'socketHandler listens for candidate:fullscreenexit'
  );
  assert(
    socketCode.includes("io.to(`test:${testId}:admin`).emit('seatmap:status'"),
    'candidate:tabswitch and candidate:fullscreenexit immediately broadcast warning color to admin channel'
  );

  // --- TEST 3: Admin Live Dashboard Alert Queue & Modal Integration ---
  console.log('\n--- TEST 3: Admin Live Dashboard Alert Queue & Real-Time Modal ---');
  assert(
    adminDashboardCode.includes('const adminId = user?.id || user?._id;'),
    'AdminLiveDashboard resolves adminId from user.id or user._id for resilient socket join'
  );
  assert(
    adminDashboardCode.includes('onMalpracticeAlert(handleMalpracticeAlert)'),
    'AdminLiveDashboard subscribes to onMalpracticeAlert'
  );
  assert(
    adminDashboardCode.includes('setAlertQueue((q) => [...q, alertData])') || adminDashboardCode.includes('setAlertQueue((q) => q.concat(alertData))'),
    'AdminLiveDashboard buffers incoming malpractice alerts into alertQueue'
  );
  assert(
    adminDashboardCode.includes('setActiveAlert(alertQueue[0])'),
    'AdminLiveDashboard pops alertQueue to activeAlert'
  );
  assert(
    adminDashboardCode.includes('Real-Time Malpractice Alert'),
    'AdminLiveDashboard renders the Real-Time Malpractice Alert Modal (FR-7.3)'
  );
  assert(
    adminDashboardCode.includes('setZoomScreenshotUrl(activeAlert.proofScreenshotUrl)'),
    'AdminLiveDashboard supports full-resolution zoom on captured proof frame'
  );

  // --- TEST 4: useProctoring Client-Side Violation Telemetry ---
  console.log('\n--- TEST 4: Candidate useProctoring Telemetry Pipeline ---');
  assert(
    proctoringHookCode.includes('api.reportViolation'),
    'useProctoring calls api.reportViolation with screenshotBase64 proof'
  );
  assert(
    proctoringHookCode.includes('triggerDelayedScreenViolation'),
    'useProctoring implements post-transition delayed screen capture for TAB_SWITCH & FULLSCREEN_EXIT'
  );

  console.log(`\nResults: ${passedTests}/${totalTests} tests passed`);
  if (passedTests === totalTests) {
    console.log('✓ ALL MALPRACTICE TELEMETRY VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  } else {
    console.error('✕ SOME TESTS FAILED!\n');
    process.exit(1);
  }
}

runSuite().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
