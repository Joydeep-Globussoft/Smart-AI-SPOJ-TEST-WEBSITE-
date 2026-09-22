// test_return_to_room_candidates_modal.js
// Automated verification of return-to-source navigation contract when closing candidate inspection modal

const assert = require('assert');

console.log('=== QA Verification: Candidate Inspection Return-to-Source Contract ===\n');

// 1. Emulate AdminTestDetail Inspect Candidate click
function simulateInspectClick({ testId, candidate, selectedRoom, searchQuery }) {
  const cid = candidate.candidateId || candidate._id;
  if (!cid) return null;
  const roomId = selectedRoom?._id || selectedRoom?.id;
  const currentQ = searchQuery ? searchQuery.trim() : '';

  const queryParams = new URLSearchParams();
  queryParams.set('candidateId', cid);
  if (roomId) {
    queryParams.set('roomId', roomId);
    queryParams.set('from', 'roomCandidates');
  }
  if (currentQ) {
    queryParams.set('q', currentQ);
  }

  const navigateUrl = `/admin/tests/${testId}/live?${queryParams.toString()}`;
  const navigationState = { fromRoomCandidates: true, roomId, q: currentQ };

  return { navigateUrl, navigationState, searchParams: queryParams };
}

// 2. Emulate AdminLiveDashboard handleCloseInspectModal
function simulateCloseInspectModal({ testId, searchParams, locationState }) {
  let navigatedTo = null;
  const fromRoom = searchParams.get('from') === 'roomCandidates' || locationState?.fromRoomCandidates;
  const returnRoomId = searchParams.get('roomId') || locationState?.roomId;
  const searchQ = searchParams.get('q') || locationState?.q;

  if (fromRoom) {
    if (returnRoomId) {
      navigatedTo = `/admin/tests/${testId}?openRoomId=${returnRoomId}${searchQ ? `&q=${encodeURIComponent(searchQ)}` : ''}`;
    } else {
      navigatedTo = `/admin/tests/${testId}`;
    }
    return { action: 'NAVIGATE_SOURCE', url: navigatedTo };
  }

  return { action: 'CLOSE_INTERNAL_ONLY', url: `/admin/tests/${testId}/live` };
}

// 3. Emulate AdminTestDetail auto-open on return
function simulateTestDetailAutoOpen({ rooms, openRoomId, returnQuery }) {
  if (!openRoomId) return { modalOpened: false };
  if (!rooms || rooms.length === 0) return { modalOpened: false, waitingForRooms: true };

  const targetRoom = rooms.find((r) => (r._id || r.id)?.toString() === openRoomId.toString());
  if (targetRoom) {
    return {
      modalOpened: true,
      roomName: targetRoom.roomName,
      restoredSearchQuery: returnQuery || '',
      cleanedParams: { openRoomId: null, q: null },
    };
  }
  return { modalOpened: false, notFound: true };
}

// --- TEST SCENARIO A: Inspect candidate with active search query and return ---
console.log('Scenario A: Inspect candidate with search filter from Room Candidates modal');
const testId = 'test_abc123';
const mockRoom = { _id: 'room_xyz999', roomName: 'Proctoring Hall A' };
const mockCandidate = { candidateId: 'cand_456', name: 'John Doe', email: 'john@example.com' };
const activeSearch = 'John';

const inspectStep = simulateInspectClick({
  testId,
  candidate: mockCandidate,
  selectedRoom: mockRoom,
  searchQuery: activeSearch,
});

assert.strictEqual(
  inspectStep.navigateUrl,
  '/admin/tests/test_abc123/live?candidateId=cand_456&roomId=room_xyz999&from=roomCandidates&q=John',
  'Deep link URL carries candidateId, roomId, from=roomCandidates, and q'
);
assert.strictEqual(inspectStep.navigationState.fromRoomCandidates, true);
assert.strictEqual(inspectStep.navigationState.roomId, 'room_xyz999');
assert.strictEqual(inspectStep.navigationState.q, 'John');
console.log('  [PASS] Inspect click correctly generated deep link URL and navigation state.');

const closeStep = simulateCloseInspectModal({
  testId,
  searchParams: inspectStep.searchParams,
  locationState: inspectStep.navigationState,
});

assert.strictEqual(closeStep.action, 'NAVIGATE_SOURCE');
assert.strictEqual(
  closeStep.url,
  '/admin/tests/test_abc123?openRoomId=room_xyz999&q=John',
  'Closing inspection returned back to test detail with openRoomId and search query preserved'
);
console.log('  [PASS] Closing inspection navigates back to Test Detail with openRoomId & search query.');

// Test auto-open on return
const returnUrlParams = new URLSearchParams(closeStep.url.split('?')[1]);
const autoOpenStep = simulateTestDetailAutoOpen({
  rooms: [mockRoom, { _id: 'room_other', roomName: 'Other Room' }],
  openRoomId: returnUrlParams.get('openRoomId'),
  returnQuery: returnUrlParams.get('q'),
});

assert.strictEqual(autoOpenStep.modalOpened, true);
assert.strictEqual(autoOpenStep.roomName, 'Proctoring Hall A');
assert.strictEqual(autoOpenStep.restoredSearchQuery, 'John');
console.log('  [PASS] Auto-open successfully matched room and restored search query filter.\n');

// --- TEST SCENARIO B: Inspect candidate without search query and return ---
console.log('Scenario B: Inspect candidate without search query');
const inspectStepB = simulateInspectClick({
  testId,
  candidate: mockCandidate,
  selectedRoom: mockRoom,
  searchQuery: '',
});

const closeStepB = simulateCloseInspectModal({
  testId,
  searchParams: inspectStepB.searchParams,
  locationState: inspectStepB.navigationState,
});

assert.strictEqual(
  closeStepB.url,
  '/admin/tests/test_abc123?openRoomId=room_xyz999',
  'Closing inspection returned back to test detail with openRoomId and no q parameter'
);
console.log('  [PASS] Closing inspection navigates back cleanly without extra empty query parameters.\n');

// --- TEST SCENARIO C: Candidate inspected directly from Live Monitoring roster (NOT from room modal) ---
console.log('Scenario C: Inspect directly from Live Dashboard roster');
const liveRosterParams = new URLSearchParams('candidateId=cand_456');
const closeStepC = simulateCloseInspectModal({
  testId,
  searchParams: liveRosterParams,
  locationState: null,
});

assert.strictEqual(closeStepC.action, 'CLOSE_INTERNAL_ONLY');
assert.strictEqual(closeStepC.url, '/admin/tests/test_abc123/live');
console.log('  [PASS] Closing candidate inspected from Live Dashboard stays on Live Dashboard (no regressions to BUG-24/BUG-30).\n');

console.log('All Return-to-Source navigation contracts verified successfully!');
