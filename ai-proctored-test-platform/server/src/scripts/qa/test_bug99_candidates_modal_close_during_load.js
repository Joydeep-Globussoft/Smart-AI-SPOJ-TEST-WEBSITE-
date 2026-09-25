import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Starting QA Test: BUG-99 (Candidates Modal Reopening After Being Closed During Load) ---');

// 1. Source code analysis
const testDetailFile = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx');
const apiClientFile = path.resolve(__dirname, '../../../../client/src/services/apiClient.js');

const testDetailCode = fs.readFileSync(testDetailFile, 'utf8');
const apiClientCode = fs.readFileSync(apiClientFile, 'utf8');

// Assert AbortController and FetchId refs exist
assert(
  testDetailCode.includes('candidatesAbortControllerRef = useRef(null)') &&
  testDetailCode.includes('candidatesFetchIdRef = useRef(0)'),
  'Failed: candidatesAbortControllerRef and candidatesFetchIdRef must be defined in AdminTestDetail.jsx'
);

// Assert handleCloseRoomCandidatesModal is defined and aborts pending controller
assert(
  testDetailCode.includes('handleCloseRoomCandidatesModal = useCallback(') &&
  testDetailCode.includes('candidatesAbortControllerRef.current.abort()') &&
  testDetailCode.includes('candidatesFetchIdRef.current++'),
  'Failed: handleCloseRoomCandidatesModal must abort pending requests and increment fetch ID'
);

// Assert handleViewRoomCandidates guards against aborted / stale requests and closed modal
assert(
  testDetailCode.includes('controller.signal.aborted || currentFetchId !== candidatesFetchIdRef.current') &&
  testDetailCode.includes('if (!prev) return null;'),
  'Failed: handleViewRoomCandidates must guard against aborted requests and closed modal state'
);

// Assert all modal close triggers use handleCloseRoomCandidatesModal
assert(
  testDetailCode.includes('onClick={handleCloseRoomCandidatesModal}'),
  'Failed: Modal close triggers (backdrop, header ✕, footer Close) must invoke handleCloseRoomCandidatesModal'
);

// Assert apiClient accepts config/signal
assert(
  apiClientCode.includes('getRoomCandidates: (roomId, config = {}) => axios.get(`/rooms/${roomId}/candidates`, config)'),
  'Failed: apiClient.getRoomCandidates must accept config with signal'
);

console.log('✓ All source code verification checks passed successfully');

// 2. Behavioral simulation test of the abort & guard logic
let selectedRoomCandidates = null;
let loadingCandidates = false;
let candidateSearchQuery = '';
let abortController = null;
let fetchId = 0;
let toastErrorCalled = false;

const closeRoomCandidatesModal = () => {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  fetchId++;
  selectedRoomCandidates = null;
  loadingCandidates = false;
  candidateSearchQuery = '';
};

const viewRoomCandidates = async (room, apiFetchMock) => {
  if (abortController) {
    abortController.abort();
  }
  const controller = new AbortController();
  abortController = controller;
  const currentFetchId = ++fetchId;

  selectedRoomCandidates = { room, list: [] };
  loadingCandidates = true;

  try {
    const res = await apiFetchMock(room._id, controller.signal);

    if (controller.signal.aborted || currentFetchId !== fetchId) {
      return;
    }

    if (selectedRoomCandidates) {
      selectedRoomCandidates = { room, list: res.data?.candidates || [] };
    }
  } catch (err) {
    const isCanceled = controller.signal.aborted || currentFetchId !== fetchId;
    if (!isCanceled) {
      toastErrorCalled = true;
      selectedRoomCandidates = null;
    }
  } finally {
    if (currentFetchId === fetchId && !controller.signal.aborted) {
      loadingCandidates = false;
    }
  }
};

// Scenario A: User opens Room 1 modal, then closes it before fetch completes
const mockDelayedFetchRoom1 = (roomId, signal) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      resolve({ data: { candidates: [{ name: 'Candidate 1' }] } });
    }, 100);

    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';
      reject(abortErr);
    });
  });
};

(async () => {
  toastErrorCalled = false;
  // Step 1: Open Room 1
  const promise1 = viewRoomCandidates({ _id: 'room-1', roomName: 'Room 1' }, mockDelayedFetchRoom1);
  assert(selectedRoomCandidates !== null, 'Failed: Modal should be open initially');
  assert(loadingCandidates === true, 'Failed: Loading should be true');

  // Step 2: User immediately closes modal after 10ms (while fetch is still in flight)
  await new Promise((r) => setTimeout(r, 10));
  closeRoomCandidatesModal();
  assert(selectedRoomCandidates === null, 'Failed: Modal should be closed immediately after clicking close');

  // Step 3: Wait for original promise to resolve/reject
  await promise1.catch(() => {});
  await new Promise((r) => setTimeout(r, 150));

  // Assert modal did NOT reopen
  assert.strictEqual(selectedRoomCandidates, null, 'Failed: Modal reopened after being closed during load!');
  assert.strictEqual(loadingCandidates, false, 'Failed: loadingCandidates should remain false');
  assert.strictEqual(toastErrorCalled, false, 'Failed: Aborted request should not fire toast error');

  console.log('✓ Scenario A: Modal closed mid-load stays closed permanently with 0 phantom reopenings');

  // Scenario B: Rapid room switching (Open Room 1, immediately switch to Room 2)
  const mockSlowRoom1 = (roomId, signal) => new Promise((resolve) => setTimeout(() => resolve({ data: { candidates: [{ name: 'Room 1 Cand' }] } }), 100));
  const mockFastRoom2 = (roomId, signal) => new Promise((resolve) => setTimeout(() => resolve({ data: { candidates: [{ name: 'Room 2 Cand' }] } }), 20));

  const pRoom1 = viewRoomCandidates({ _id: 'room-1', roomName: 'Room 1' }, mockSlowRoom1);
  const pRoom2 = viewRoomCandidates({ _id: 'room-2', roomName: 'Room 2' }, mockFastRoom2);

  await Promise.all([pRoom1, pRoom2]);

  assert(selectedRoomCandidates !== null, 'Failed: Room 2 modal should be open');
  assert.strictEqual(selectedRoomCandidates.room._id, 'room-2', 'Failed: Room 2 should be the active room');
  assert.strictEqual(selectedRoomCandidates.list[0].name, 'Room 2 Cand', 'Failed: Room 1 response must not overwrite Room 2');

  console.log('✓ Scenario B: Rapid room switching correctly preserves latest room and discards stale responses');
  console.log('--- BUG-99 QA PASS ---');
})();
