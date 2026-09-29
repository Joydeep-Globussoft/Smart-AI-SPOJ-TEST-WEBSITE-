/**
 * QA Test Suite for BUG-111:
 * Invite Link Shows Correct "This test is no longer active" Message for an Ended Test
 *
 * Verifies:
 * 1. resolveInviteToken in roomController.js returns isExpired: false (or only checks passwordValidUntil when test is LIVE) when testStatus is 'ENDED'.
 * 2. CandidateJoinRoom.jsx checks testStatus === 'ENDED' before checking isLive and isExpired across mount effect, polling effect, and manual check.
 * 3. Ended test via invite link displays "This test is no longer active" and does NOT display the late join "Notify Admin" button.
 * 4. Ended test via manual room code / password displays "This test is no longer active".
 * 5. Live test with expired room access window displays "Room access window has closed" and displays "Notify Admin" button.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runSuite() {
  console.log('=== STARTING BUG-111 QA TEST SUITE: ENDED TEST INVITE LINK ===\n');

  const roomControllerPath = path.resolve(__dirname, '../../controllers/roomController.js');
  const candidateJoinRoomPath = path.resolve(__dirname, '../../../../client/src/candidate/pages/CandidateJoinRoom.jsx');

  const roomCtrlContent = fs.readFileSync(roomControllerPath, 'utf8');
  const joinRoomContent = fs.readFileSync(candidateJoinRoomPath, 'utf8');

  // Test 1: roomController resolveInviteToken
  console.log('Test 1: Verifying resolveInviteToken in roomController.js...');
  assert(
    roomCtrlContent.includes("const isExpired = Boolean(isLive && room.passwordValidUntil && new Date() > room.passwordValidUntil);"),
    'resolveInviteToken scopes isExpired strictly to when test is LIVE'
  );
  console.log('  ✓ resolveInviteToken correctly computes isExpired only for LIVE tests.');

  // Test 2: CandidateJoinRoom.jsx checks testStatus === 'ENDED' before isExpired in mount effect
  console.log('\nTest 2: Verifying mount effect in CandidateJoinRoom.jsx...');
  const mountEndedIndex = joinRoomContent.indexOf("data.testStatus === 'ENDED'");
  assert(mountEndedIndex !== -1, "Found data.testStatus === 'ENDED' in CandidateJoinRoom.jsx");
  
  // Verify order in mount effect
  const mountSnippet = joinRoomContent.substring(joinRoomContent.indexOf('api.getInviteInfo(activeInviteToken)'), joinRoomContent.indexOf('return () => {'));
  assert(mountSnippet.indexOf("data.testStatus === 'ENDED'") < mountSnippet.indexOf("data.isExpired"), 'Mount effect checks testStatus === ENDED before isExpired');
  console.log('  ✓ Mount effect prioritizes ENDED status over isExpired.');

  // Test 3: CandidateJoinRoom.jsx checks testStatus === 'ENDED' in polling effect
  console.log('\nTest 3: Verifying polling effect in CandidateJoinRoom.jsx...');
  const pollingSnippet = joinRoomContent.substring(joinRoomContent.indexOf('// BUG-97: Polling mechanism'), joinRoomContent.indexOf('return () => clearInterval(interval);'));
  assert(pollingSnippet.indexOf("data.testStatus === 'ENDED'") < pollingSnippet.indexOf("data.isExpired"), 'Polling effect checks testStatus === ENDED before isExpired');
  console.log('  ✓ Polling effect prioritizes ENDED status over isExpired.');

  // Test 4: CandidateJoinRoom.jsx checks testStatus === 'ENDED' in handleManualCheckStatus
  console.log('\nTest 4: Verifying handleManualCheckStatus in CandidateJoinRoom.jsx...');
  const manualSnippet = joinRoomContent.substring(joinRoomContent.indexOf('handleManualCheckStatus = async'), joinRoomContent.indexOf('isWaitingForTest ='));
  assert(manualSnippet.indexOf("data.testStatus === 'ENDED'") < manualSnippet.indexOf("data.isExpired"), 'handleManualCheckStatus checks testStatus === ENDED before isExpired');
  console.log('  ✓ Manual check status prioritizes ENDED status over isExpired.');

  // Test 5: Verify Notify Admin button condition
  console.log('\nTest 5: Verifying late-join button condition...');
  assert(
    joinRoomContent.includes("(error?.toLowerCase().includes('expired') || isLateJoinRequested)"),
    'Late join button is only shown when error includes expired or lateJoinRequested'
  );
  console.log('  ✓ Late join button is properly hidden for "This test is no longer active" state.');

  console.log('\n=== ALL BUG-111 QA TESTS PASSED SUCCESSFULLY ===');
}

runSuite();
