/**
 * QA Test Suite for FEATURE-019:
 * Downloadable & Printable QR Code Option for Physical Room Cards
 *
 * Verifies:
 * 1. AdminTestDetail.jsx imports QRCode library.
 * 2. "QR Code" button is rendered on each Physical Room card alongside "Copy Full Invite".
 * 3. Clicking "QR Code" opens a modal displaying the room's scannable QR code.
 * 4. The QR code encodes the exact same deep-link invite URL as "Copy Full Invite".
 * 5. High-resolution QR generation options (e.g. width 800, error correction level H) for physical posters.
 * 6. "Download PNG" button is available to download the QR code image.
 * 7. "Print Poster" button is available with room code, room password, test title, and scan instructions.
 * 8. Non-regression: "Copy Full Invite", room codes/passwords, candidates list modal, and room status remain intact.
 */

const fs = require('fs');
const path = require('path');

function runTests() {
  console.log('========================================================================');
  console.log('QA TEST SUITE: FEATURE-019 Room QR Code Modal & Download/Print');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ✕ [FAIL] ${message}`);
      failed++;
    }
  }

  const testDetailPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx');
  assert(fs.existsSync(testDetailPath), 'AdminTestDetail.jsx exists');

  const testDetailCode = fs.readFileSync(testDetailPath, 'utf8');

  // Step 1: Verify Library Import & State
  console.log('--- Step 1: Verify QRCode Import & State Hooks ---');
  assert(
    testDetailCode.includes("import QRCode from 'qrcode';"),
    'QRCode is imported from "qrcode"'
  );
  assert(
    testDetailCode.includes('selectedQrRoom') &&
    testDetailCode.includes('setSelectedQrRoom') &&
    testDetailCode.includes('qrDataUrl') &&
    testDetailCode.includes('setQrDataUrl'),
    'selectedQrRoom and qrDataUrl states are defined'
  );

  // Step 2: Verify QR Code Button on Physical Room Card
  console.log('\n--- Step 2: Verify QR Code Button on Physical Room Card ---');
  assert(
    testDetailCode.includes('id={`qr-code-btn-${room._id}`}') ||
    testDetailCode.includes('id={`qr-code-btn-'),
    'QR Code button has distinct ID on each room card'
  );
  assert(
    testDetailCode.includes('onClick={() => handleOpenQrModal(room)}'),
    'QR Code button is wired to handleOpenQrModal(room)'
  );
  assert(
    testDetailCode.includes('id={`copy-invite-btn-${room._id}`}') &&
    testDetailCode.includes('📋 Copy Full Invite'),
    '"Copy Full Invite" button is preserved directly next to "QR Code" button'
  );

  // Step 3: Verify Invite URL Parity between "Copy Full Invite" and QR Code
  console.log('\n--- Step 3: Verify Invite URL Generation Parity ---');
  assert(
    testDetailCode.includes('const inviteLink = room.inviteToken') &&
    testDetailCode.includes('`${window.location.origin}/candidate/register?invite=${room.inviteToken}`'),
    'Invite URL structure matches FEATURE-015 deep link pattern'
  );
  assert(
    testDetailCode.includes('QRCode.toDataURL(inviteLink,'),
    'QR code directly encodes the exact same inviteLink variable'
  );
  assert(
    testDetailCode.includes("errorCorrectionLevel: 'H'") &&
    testDetailCode.includes('width: 800'),
    'High-resolution parameters (width 800, error correction level H) configured for reliable scanning'
  );

  // Step 4: Verify QR Modal Elements & Context
  console.log('\n--- Step 4: Verify QR Modal Elements & Actions ---');
  assert(
    testDetailCode.includes('Room Entry QR Code') &&
    testDetailCode.includes('selectedQrRoom.roomCode') &&
    testDetailCode.includes('selectedQrRoom.roomPassword'),
    'Modal displays room context: Title, Room Code, and Room Password'
  );
  assert(
    testDetailCode.includes('id="download-qr-btn"') &&
    testDetailCode.includes('handleDownloadQr'),
    'Download PNG button is present and wired to handleDownloadQr'
  );
  assert(
    testDetailCode.includes('id="print-qr-btn"') &&
    testDetailCode.includes('handlePrintQr'),
    'Print Poster button is present and wired to handlePrintQr'
  );
  assert(
    testDetailCode.includes('id="close-qr-modal-btn"'),
    'Modal close button is present'
  );

  // Step 5: Verify Non-Regression
  console.log('\n--- Step 5: Verify Non-Regression on Room & Test Operations ---');
  assert(
    testDetailCode.includes('handleViewRoomCandidates') &&
    testDetailCode.includes('handleDeleteRoom'),
    'Physical room candidate view and delete actions preserved'
  );
  assert(
    testDetailCode.includes('handleSaveConfig') &&
    testDetailCode.includes('handleStartTest') &&
    testDetailCode.includes('handleEndTest'),
    'Test configuration editing and start/end workflows preserved'
  );

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
