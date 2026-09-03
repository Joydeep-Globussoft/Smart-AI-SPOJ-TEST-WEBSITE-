# Walkthrough: BUG-30 Fix — Auto-End Lifecycle & Tentative Time Fallbacks

This update resolves **BUG-30 (Part A & Part B)** by implementing automatic lifecycle termination for concluded tests and fixing the "TENTATIVE TIME" badge fallback to distinguish between unstarted tests and completed sessions.

---

## 1. Problem Summary

1. **Part A (Indefinite LIVE Tests)**:
   - Previously, tests only transitioned from `LIVE` to `ENDED` when an admin manually clicked "End Test".
   - If all rooms expired/closed and all candidates finished or were disqualified, tests remained `LIVE` indefinitely across days (e.g. "Final test" remained `LIVE` for over 24 hours).
2. **Part B ("TENTATIVE TIME" Badge Fallback)**:
   - When no candidate was `IN_PROGRESS`, the dashboard fell back to showing `"Not started"` even when all candidates had already completed or been disqualified.

---

## 2. Changes Implemented

### Part A — Test Auto-End Lifecycle & Room Closure

- **`testLifecycleService.js` ([`testLifecycleService.js`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/server/src/services/testLifecycleService.js))**:
  - `performEndTest(testId, io, reason)`: Sets test status to `ENDED`, closes all active rooms, broadcasts `test:ended` and `room:updated` (`ROOMS_CLOSED`), and runs `evaluationService.runFinalEvaluationPass(testId)`.
  - `checkAndAutoEndTest(testId, io)`: Evaluates if a test has concluded:
    1. Zero rooms accepting new joins (all rooms `CLOSED` or `now > passwordValidUntil`).
    2. Zero candidates currently `IN_PROGRESS` (all joined candidates reached terminal states: `SUBMITTED`, `AUTO_SUBMITTED_TIME_UP`, `DISQUALIFIED`, or timer expired).
    3. Any unstarted joined candidates have exceeded their `startTestWindowMinutes` past room password expiry.
  - `checkAndAutoEndAllLiveTests(io)`: Sweeps all LIVE tests across the entire database.
  - `startLifecycleScheduler(io, 30000)`: Background daemon running every 30 seconds to clean up expired tests without requiring user interaction.
- **Opportunistic Checks**:
  - `GET /api/v1/tests` & `GET /api/v1/tests/:testId` in `testController.js`
  - `GET /api/v1/tests/:testId/live-candidates` in `roomController.js`
  - `POST /api/v1/submissions/submit-all` in `submissionController.js`
  - Candidate disqualification in `proctoringController.js`
- **Advisory Banner in `AdminTestDetail.jsx` ([`AdminTestDetail.jsx`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/admin/pages/AdminTestDetail.jsx))**:
  - Prominent warning banner displayed if a test is `LIVE` but all rooms have expired, providing a 1-click `⏹ End Test Now` button.

### Part B — "TENTATIVE TIME" Distinct Fallbacks

- **`AdminLiveDashboard.jsx` ([`AdminLiveDashboard.jsx`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/admin/pages/AdminLiveDashboard.jsx))**:
  - **Case 1: No Candidate Has Started Yet** (`candidatesInScope.length === 0` or no candidate has started): Displays `"Not started"` with tooltip `Tentative Time: No candidates have started yet`.
  - **Case 2: All Candidates Reached Terminal States** (`SUBMITTED`, `DISQUALIFIED`, or timer expired): Displays `"Session concluded"` with tooltip `Tentative Time: All candidates have finished or reached terminal states`.
  - **Case 3: In-Progress Candidates Active**: Displays the MAX remaining time among `IN_PROGRESS` candidates (BUG-21 preserved, e.g. `25m 00s`, monospace font with `#38BDF8`).
  - **Case 4: Test Status is `ENDED`**: Displays `"00:00 (Concluded)"`.

---

## 3. Verification & Acceptance Criteria Results

We executed the automated QA suite `test_bug30_lifecycle_and_tentative_time.js`:

| Acceptance Criterion | Result | Details |
| :--- | :---: | :--- |
| **1. "Final test" Auto-transitions to ENDED** | **PASS** | `Final test` transitioned from `LIVE` to `ENDED` and all rooms set to `CLOSED`. |
| **2. Multi-test Database Sweep** | **PASS** | Swept across all existing tests in DB; 10 completed expired tests transitioned to `ENDED`. |
| **2b. Active Tests Preserved** | **PASS** | Tests with future valid rooms (`JavaScript Core Assessment`, `SPOJ DSA Core Evaluation`, etc.) remained `LIVE`. |
| **3. Expired Room Password Blocks Joins** | **PASS** | Rooms past `passwordValidUntil` return `403 Room code expired` on candidate join attempt. |
| **4. "Not started" vs "Session concluded"** | **PASS** | Returns `"Not started"` when 0 candidates started; returns `"Session concluded"` when all candidates finished. |
| **5. BUG-21 In-Progress Remaining Time** | **PASS** | Calculates MAX remaining time among active candidates without regression. |
| **6. Manual "End Test" Action** | **PASS** | Admins can manually end a test at any time, transitioning status and closing rooms. |

Frontend production bundle compiled in `3.69s` with **0 errors**.

---

## 4. BUG-31: 1-Second Delayed Screen-Share Capture for `TAB_SWITCH` & `FULLSCREEN_EXIT`

### Problem Summary
Previously (per BUG-13), when a `TAB_SWITCH` or `FULLSCREEN_EXIT` violation occurred, the screen-capture frame was grabbed from the `MediaStream` immediately at the instant the event fired. This often resulted in mid-transition or blank frames rather than showing the window or tab the candidate actually navigated to.

### Changes Implemented
1. **Immediate Detection & Flagging**:
   - In [`useProctoring.js`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/hooks/useProctoring.js), `triggerDelayedScreenViolation` records the exact `detectedAt` timestamp synchronously at `t = 0`.
   - Fires `emitTabSwitch` / `emitFullscreenExit` socket events to admins immediately.
   - Shows candidate violation banner (`warningMessage`) and toast alert (`toast.error`) immediately.
2. **1-Second Settling Delay for Screen Capture**:
   - Waits 1 second (`setTimeout(..., 1000)`) before grabbing the frame from `screenVideoRef.current`.
   - The captured frame reflects the candidate's actual settled screen state.
   - Preserves original detection timestamp in watermark footer and sends `detectedAt` to backend.
3. **Independent Timers & Cleanup**:
   - Multiple rapid violations manage their own closures and timers in `delayedViolationTimeoutsRef` without clobbering each other.
   - All pending timers are cleared if the hook unmounts.
4. **Webcam Violations Unchanged**:
   - `PHONE_DETECTED`, `MULTIPLE_FACES`, and `NO_FACE_15MIN` continue to capture immediately without delay.
5. **Backend Timestamp Storage**:
   - In [`proctoringController.js`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/server/src/controllers/proctoringController.js), `reportViolation` accepts `detectedAt` from request body and stores it in `MalpracticeLog.create({ ..., detectedAt })`.

### QA Verification Results
Executed automated test suite `test_bug31_delayed_screen_capture.js`:
- Immediate alert fired synchronously at `t = 0ms`: **PASS**
- Screenshot capture delayed by approximately 1 second (`1007ms`): **PASS**
- Rapid successive violations (`TAB_SWITCH` then `FULLSCREEN_EXIT`) resolved independently: **PASS**
- Webcam violations (`MULTIPLE_FACES`) remained immediate (`0ms`): **PASS**
- Backend `MalpracticeLog` accurately preserved `detectedAt`: **PASS**
- Client build (`npm run build`) succeeded in `1.85s` with **0 errors**.

---

## 5. BUG-32: Seat Map Tile Styling & Visibility Improvements

### Problem Summary
On the Live Physical Seat Map in [`AdminLiveDashboard.jsx`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/admin/pages/AdminLiveDashboard.jsx):
1. The "Not Started" (WHITE) tile border was a faint gray (`#e5e7eb`) with `opacity: 0.75`, making it blend into the page background.
2. The bottom-right corner of each tile displayed a redundant literal color-name text label (`"YELLOW"`, `"WHITE"`, `"GREEN"`, `"RED"`).
3. The circular status dot in the top-right corner of the WHITE tile was rendered in faint `#e5e7eb` on a white background, making it nearly invisible.

### Changes Implemented
1. **Black Border for "Not Started" Tiles**:
   - Replaced `#e5e7eb` with solid black (`#111827`), matching the visual weight of the yellow, green, and red tiles.
   - Removed opacity suppression (`opacity: 1`), keeping the tile crisp and distinct.
   - Updated the Seat Map legend swatch for "Not Started" to `border: '2px solid #111827'`.
2. **Removed Redundant Color-Name Text Labels**:
   - Removed the literal text label span (`"YELLOW"`, `"WHITE"`, `"GREEN"`, `"RED"`) from the tile footer across all statuses.
   - Preserved all other content: candidate name, violation badge (`⚠️ count`), room name, questions solved progress, and live timer/status string.
3. **High-Visibility Status Dots**:
   - For WHITE tiles: dot now has a solid fill (`#94A3B8`) with a distinct black outline (`border: '1.5px solid #111827'`).
   - For GREEN, YELLOW, and RED tiles: dots retain their vibrant colors with matching borders and glow.
   - Applied matching visible borders to table view (`CandidateRowItem`) status dots.

### QA Verification Results
Executed automated test suite `test_bug32_seat_map_styling.js`:
- WHITE tile border is solid black (`2px solid #111827`): **PASS**
- No color-name text label rendered across any tile status: **PASS**
- Status dot on WHITE tile has visible fill (`#94A3B8`) and black border (`1.5px solid #111827`): **PASS**
- In-progress, Passed, and Disqualified tiles preserved styling and visibility: **PASS**
- All other tile content (name, violations, room, Qs solved, timer) preserved: **PASS**
- Summary: **30 / 30 tests passed (100%)**. Client build succeeded in **1.76s** with **0 errors**.

---

## 6. BUG-33: Fullscreen Native Notification Bar Auto-Dismiss Fix

### Problem & Root Cause Investigation
On candidate test screens, entering fullscreen displayed Chromium's native keyboard-lock notification:
> `http://localhost:5173 – to exit full screen, press and hold [Esc]`

Rather than auto-hiding after 3–4 seconds, the notification remained permanently visible, obstructing top header buttons ("Submit Project", "Submit All & Finish").

**Root Cause Found**:
- In `CandidateAITestScreen.jsx` and `CandidateTestScreen.jsx`, an inline arrow function `onWarning: (msg) => setWarningMessage(msg)` was passed to `useProctoring`.
- The parent component re-renders every 1 second as the session countdown timer ticks down.
- In `useProctoring.js`, the fullscreen listener `useEffect` had `onWarning` in its dependency array.
- On every 1-second render, the effect's cleanup ran `unlockKeyboard()` and then immediately executed `lockKeyboard()`, issuing a new `navigator.keyboard.lock()` call to Chromium.
- Chromium treated each call as a new lock request, resetting its internal 3-second auto-hide timer every second, pinning the prompt permanently to the top of the viewport.

### Changes Implemented
1. **Synchronous Lock Status Tracking (`isKeyboardLockedRef`)**:
   - In [`useProctoring.js`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/hooks/useProctoring.js), added `isKeyboardLockedRef = useRef(false)`.
   - `lockKeyboard()` checks `if (isKeyboardLockedRef.current) return;`. It executes `navigator.keyboard.lock()` once on initial fullscreen entry. Subsequent re-renders do not re-invoke `keyboard.lock()`.
2. **Stable Callback Storage (`onWarningRef`)**:
   - Stored `onWarning` inside `onWarningRef = useRef(onWarning)`.
   - Removed `onWarning` from the `useEffect` dependency array, preventing the fullscreen effect from tearing down and re-running on render.
3. **Memoized Parent Handlers**:
   - In [`CandidateAITestScreen.jsx`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/candidate/pages/CandidateAITestScreen.jsx) and [`CandidateTestScreen.jsx`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/candidate/pages/CandidateTestScreen.jsx), wrapped `handleProctorWarning` in `useCallback`.
4. **Clean Exit & Re-Entry Lifecycle**:
   - Fullscreen exit (`handleFullscreenChange`) calls `unlockKeyboard()`, releasing the lock and resetting `isKeyboardLockedRef.current = false`.
   - Re-entering fullscreen safely engages `lockKeyboard()` once again, showing the notification briefly before it auto-hides.
   - Component unmount cleanly releases keyboard locks.

### QA Verification Results
Executed automated test suite `test_bug33_fullscreen_notification_lifecycle.js`:
- Keyboard lock called exactly ONCE on fullscreen entry: **PASS**
- 10 successive simulated 1-second timer re-renders produced 0 additional lock/unlock calls: **PASS**
- Fullscreen exit cleanly called `unlockKeyboard()` and reset lock state: **PASS**
- Fullscreen re-entry successfully re-engaged keyboard lock: **PASS**
- Code audit across `useProctoring.js`, `CandidateAITestScreen.jsx`, and `CandidateTestScreen.jsx`: **PASS**
- Summary: **18 / 18 tests passed (100%)**. Client build succeeded in **1.89s** with **0 errors**.

---

## 7. FEATURE: "Split / Code / Preview" View-Mode Toggle (AI Test Screen)

### Feature Overview
Added a three-button segmented control — **`◫ Split`**, **`💻 Code`**, **`▶ Preview`** — to the AI Test candidate screen's toolbar and panel headers, allowing candidates to toggle between:
1. **Split** (Default): Code Editor and Preview visible side-by-side at their proportional widths, with the center divider (Splitter 1) active for manual resizing.
2. **Code**: Preview panel collapsed (`display: 'none'`); Code Editor expands to fill the full combined width previously occupied by both panels.
3. **Preview**: Code Editor panel collapsed (`display: 'none'`); Preview iframe expands to fill the full combined width previously occupied by both panels.
4. **AI Assistant**: Remains visible, connected, and functional across all three view modes.

### Key Implementations
1. **Segmented UI Control**:
   - Styled with dark container (`#090d16`), subtle border (`#1e293b`), and Globussoft teal active highlight (`#0E7C86`).
   - Integrated in the top `timer-bar` toolbar directly above the panels, and compact versions in the Code Editor and Preview panel headers alongside their maximize buttons.
2. **Non-Destructive Visibility**:
   - Controlled via CSS `display: 'none'` / `display: 'flex'` without unmounting DOM elements, guaranteeing no loss of unsaved code, cursor positions, file tabs (`index.html`, `style.css`, `script.js`), or preview iframe state.
   - Automatically dispatches `window.resize` on view mode change so Monaco editor smoothly recalculates layout.
3. **Session Persistence**:
   - Initialized and persisted via `sessionStorage` (`ai_test_view_mode`), preserving the candidate's chosen mode across file tab switches and AI chat interactions.
4. **Isolated Scope**:
   - Exclusively applied to `CandidateAITestScreen.jsx`; standard JavaScript/SPOJ screens (`CandidateTestScreen.jsx`) are completely unaffected.

### QA Verification Results
Executed automated test suite `test_ai_editor_view_mode_toggle.js`:
- Segmented toggle component & buttons verified: **PASS**
- State persistence via `sessionStorage` verified: **PASS**
- Panel widths & visibility logic across all 3 view modes verified: **PASS**
- Non-destructive DOM visibility toggling (no unmount) verified: **PASS**
- Isolation to AI Test screen only (no changes to standard test screen) verified: **PASS**
- Regression audit (BUG-14, BUG-31, BUG-33) verified: **PASS**
- Summary: **31 / 31 tests passed (100%)**. Client build succeeded in **1.87s** with **0 errors**.

---

## 8. BUG-34: Fullscreen Refresh Bypass Prevention

### Problem
When a candidate exited fullscreen and refreshed the browser tab (`F5` / reload), `useProctoring` initialized `isFullscreen` to `true` by default and only listened for future `fullscreenchange` events. Because no state transition fired on a fresh page load in windowed mode, `proctoring.isFullscreen` remained `true`. The candidate could interact with questions, write code, run against test cases, and submit completely outside of fullscreen with zero blocking overlay, no re-prompt, and without the reload-triggered fullscreen exit being logged.

### Root Cause
1. `isFullscreen` in `useProctoring.js` was statically initialized with `useState(true)`.
2. Browser `fullscreenchange` event listeners only execute on active transitions; on initial mount after a reload in windowed mode, no transition occurs.
3. As a result, `proctoring.isFullscreen` evaluated to `true`, bypassing the fullscreen blocking overlay on reload.

### Solution
1. **Dynamic Initialization from Document State**:
   - Initialized `isFullscreen` via `useState(() => Boolean(document.fullscreenElement || document.webkitFullscreenElement))`. On a hard reload outside fullscreen, `isFullscreen` immediately starts as `false`.
2. **Immediate Mount / Reload Check & Violation Logging**:
   - In `useProctoring`'s fullscreen effect, immediately evaluates `document.fullscreenElement`.
   - If outside fullscreen on mount/reload, ensures `setIsFullscreen(false)`, logs a `FULLSCREEN_EXIT` violation (via `triggerDelayedScreenViolation`), and fires real-time socket alert to admins (`emitFullscreenExit`).
   - Guarded via `hasCheckedInitialFullscreenRef` to run once per page load and prevent duplicate logs on component re-renders.
   - `// ASSUMPTION: Fullscreen exits resulting from a browser refresh/reload are logged as standard FULLSCREEN_EXIT violations and count toward the candidate's malpractice total and disqualification threshold.`
3. **Blocking Overlay with Elevated z-Index**:
   - Updated the blocking overlay in both `CandidateTestScreen.jsx` and `CandidateAITestScreen.jsx` with `zIndex: 99999`, backdrop blur, and explicit action buttons (`#re-enter-fullscreen-btn`, `#ai-re-enter-fullscreen-btn`).
   - Completely blocks all interaction with questions, Monaco editor, splitters, run buttons, and submit buttons until the candidate clicks to re-enter fullscreen.
4. **Enhanced Re-Entry & Keyboard Lock**:
   - Enhanced `requestFullscreen` to support both standard and WebKit vendor prefixes. Upon successful re-entry, locks the keyboard again and restores test interaction.
5. **Exam Clock & Code State Integrity**:
   - The countdown timer strictly derives from server `candidateEndTime` against `Date.now()`. Staying on the blocking overlay does not pause the clock. If time expires while outside fullscreen, `handleTimerExpire` automatically submits.
   - Previously saved drafts and submissions (`sessionStorage` and backend save) are restored immediately upon re-entering fullscreen.

### Verification Results
Executed automated test suite `test_bug34_fullscreen_refresh_bypass.js`:
- Dynamic `isFullscreen` initialization on mount/reload verified: **PASS**
- Simulation of hard page reload producing `isFullscreen = false` verified: **PASS**
- Violation logging and socket emission on reload outside fullscreen verified: **PASS**
- Fullscreen blocking overlay (zIndex 99999) on both test screens verified: **PASS**
- Request fullscreen re-entry and keyboard lock verified: **PASS**
- Timer independence and autosaved draft restoration verified: **PASS**
- Regression audit (BUG-13, BUG-29, BUG-31, BUG-33) verified: **PASS**
- Summary: **18 / 18 tests passed (100%)**. Client build succeeded in **1.90s** with **0 errors**.

---

## 9. FEATURE: Actual Test Start and End Timestamps on Test Detail Page

### Feature Overview
Enhanced the Test detail page header ([`AdminTestDetail.jsx`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/admin/pages/AdminTestDetail.jsx)) to display the actual timestamps for when a test started and ended, as well as its total live duration.

### Key Implementations
1. **Backend Schema Updates**:
   - Added additive lifecycle timestamps `liveStartedAt: { type: Date, default: null }` and `endedAt: { type: Date, default: null }` to [`Test.js`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/server/src/models/Test.js).
2. **Transition Tracking**:
   - **Start Test** (`startTest` in [`testController.js`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/server/src/controllers/testController.js)): Records `liveStartedAt: now` upon transitioning to `LIVE`.
   - **End Test** (`performEndTest` in [`testLifecycleService.js`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/server/src/services/testLifecycleService.js)): Records `endedAt: now` upon transitioning to `ENDED`.
   - **Legacy Fallback / Backfill**: In `getTest`, if an older `LIVE` or `ENDED` test is loaded without recorded timestamps, `liveStartedAt` is backfilled from the earliest room's start window, and `endedAt` from `updatedAt`.
   - `// ASSUMPTION: If liveStartedAt was not recorded when test went LIVE, derive from the earliest room's start window or createdAt.`
3. **Frontend Header Display**:
   - **LIVE Tests**: Displays `Started: [date] at [time]`.
   - **ENDED Tests**: Displays `Started: [date] at [time] • Ended: [date] at [time]` and convenience badge `⏱️ Live for [Xh Ym]`.
   - **DRAFT / SCHEDULED Tests**: Only displays the existing `Created by [name] on [date]`.
   - Styled consistently with muted gray text (`#6b7280`, `0.875rem`) below the test title and badges.

### QA Verification Results
Executed automated test suite `test_test_lifecycle_timestamps.js`:
- Schema fields `liveStartedAt` and `endedAt` verified: **PASS**
- `startTest` records `liveStartedAt` verified: **PASS**
- `performEndTest` records `endedAt` verified: **PASS**
- `getTest` fallback backfill for legacy tests verified: **PASS**
- Frontend date/time formatting and duration calculation verified: **PASS**
- Conditional visibility across `DRAFT`, `LIVE`, and `ENDED` verified: **PASS**
- Zero regressions to badges, action buttons, or created by lines: **PASS**
- Summary: **21 / 21 tests passed (100%)**. Production build succeeded in **1.87s** with **0 errors**.

---

## 10. BUG-35: Redundant Duplicate Date Deduplication on Test Detail Header

### Problem
On the Test detail header, displaying creation date, start date, and end date separately caused visual clutter when all events occurred on the same day (e.g. `Created by BIG BOSS on 3/9/2026` followed by `Started: 3/9/2026 at 12:27 pm · Ended: 3/9/2026 at 12:37 pm`).

### Solution
Replaced the separate `Started: ... · Ended: ...` text line with a date-deduplicated `Live: ...` line following the three required rules:
- **RULE A** (Same day for start, end, and creation): Omits date on Live line entirely.
  `Line 1: Created by BIG BOSS on 3/9/2026`
  `Line 2: Live: 12:27 pm – 12:37 pm (10m)`
- **RULE B** (Live session same day, but different from creation): Displays the live date once.
  `Line 1: Created by BIG BOSS on 1/9/2026`
  `Line 2: Live: 3/9/2026, 12:27 pm – 12:37 pm (10m)`
- **RULE C** (Live session spans midnight across different calendar days): Displays both dates explicitly.
  `Line 2: Live: 3/9/2026 11:50 pm – 4/9/2026 12:10 am (20m)`
- **In-Progress LIVE Tests**: Shows `Live: [start time] – now` (or `Live: [date], [start time] – now` if started on a previous day).
- **DRAFT / SCHEDULED Tests**: Only shows `Created by [admin] on [date]`, no Live line.
- **Duration Calculation**: Directly reuses `formatLiveDuration` to append duration suffix `(Xm)` or `(Xh Ym)`.
- **Preserved Elements**: The separate `⏱️ Live for ...` pill badge remains completely untouched with its exact formatting and position.

### QA Verification Results
Executed automated test suite `test_bug35_date_deduplication.js`:
- Rule A date deduplication verified: **PASS**
- Rule B date inclusion verified: **PASS**
- Rule C midnight spanning verified: **PASS**
- LIVE test in-progress phrasing verified: **PASS**
- DRAFT tests omission verified: **PASS**
- Duration reuse verified: **PASS**
- Separate pill badge preserved: **PASS**
- Zero regressions to badges and action buttons: **PASS**
- Summary: **15 / 15 tests passed (100%)**. Client build succeeded in **1.79s** with **0 errors**.

---

## 11. BUG-37: Duration Deduplication and Pipe "|" Separator on Live Header Line

### Problem
On the Test detail header, the duration was being rendered twice (both inline as `(15h 28m)` and in the separate `⏱ LIVE FOR 15H 28M` pill badge). Additionally, within multi-part timestamps like `2/9/2026 7:12 pm`, the date and time ran together without visual separation.

### Solution
1. **Removed Inline Duration**: Completely eliminated the parenthetical `(${duration})` suffix from `getLiveSessionText`. The duration is now rendered exclusively in the `⏱️ Live for ...` pill badge.
2. **Added Pipe `|` Separator**:
   - **Rule A** (same day as created, dates omitted): `Live: 12:27 pm – 12:37 pm` (no pipe needed).
   - **Rule B** (same day live, different from creation date): `Live: 3/9/2026 | 12:27 pm – 12:37 pm`.
   - **Rule C** (session spans multiple days): `Live: 2/9/2026 | 7:12 pm – 3/9/2026 | 10:41 am`.
   - **Live In-Progress**: `Live: 12:27 pm – now` (same day) or `Live: 3/9/2026 | 12:27 pm – now` (different day).
3. **Pill Badge**: Left completely untouched in its original format, styling, and position.

### QA Verification Results
Executed automated test suite `test_bug37_separator_and_duration_dedup.js`:
- Zero parenthetical duration in Live line verified: **PASS**
- Rule B date and time pipe separation verified: **PASS**
- Rule C two-date pipe separation verified: **PASS**
- Rule A date omission without stray pipe verified: **PASS**
- Live in-progress pipe separation verified: **PASS**
- Separate pill badge preserved as single source of truth for duration: **PASS**
- Zero regressions to badges, created by line, or action buttons: **PASS**
- Summary: **16 / 16 tests passed (100%)**. Client build succeeded in **1.81s** with **0 errors**.

---

## 12. BUG-36: Test Configuration Editing (DRAFT & LIVE/ENDED Lifecycles)

### Problem
On the Test detail page, core test configuration fields (Question Set, Duration, Total Questions, Start Window, Supported Languages, Instructions, and Test Name) could not be edited after test creation, even when the test was still in `DRAFT` status and had not yet started.

### Solution
1. **Edit Button on Configuration Details Card**:
   - Added an `✏️ Edit` button to the `Configuration Details` card header in [`AdminTestDetail.jsx`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/admin/pages/AdminTestDetail.jsx).
2. **DRAFT Status Full Editability**:
   - When opened on a `DRAFT` test, all fields are unlocked and fully editable:
     - Test Name / Title
     - Question Set (dropdown filtered by `test.testType`, with fallback to ensure current set is listed)
     - Duration (Minutes)
     - Total Questions
     - Start Window / Join Window (Minutes)
     - Supported Languages (multi-select checkboxes)
     - Candidate Instructions
3. **LIVE / ENDED Status Protection**:
   - Once a test has transitioned to `LIVE` or `ENDED`, assessment parameters (Question Set, Duration, Total Questions, Start Window, Languages) are disabled to protect candidate sessions and scoring integrity.
   - An advisory banner (`🔒 Core assessment settings... are locked once a test is LIVE`) informs the admin.
   - Test Name and Instructions remain editable.
4. **Backend Enforcement & Validation**:
   - [`updateTest` in `testController.js`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/server/src/controllers/testController.js) rejects changes to locked configuration fields if test status is `LIVE` or `ENDED`.
   - Validates positive duration, positive question count, positive window, non-empty languages, and non-empty title/instructions.
   - Fully populates `createdBy` and `questionSetId` upon returning the updated test object.
5. **Instant Synchronization**:
   - `setTest(res.data.test)` updates local state immediately, updating the header title, question set name, duration, questions count, start window, languages, and instructions without a page reload.

### QA Verification Results
Executed automated test suite `test_bug36_edit_test_configuration.js`:
- Edit button present on Configuration Details card: **PASS**
- Full field editability in DRAFT status: **PASS**
- Field locking and advisory notice in LIVE/ENDED status: **PASS**
- Server-side security enforcement for locked fields: **PASS**
- Input validation checks: **PASS**
- Instant client state synchronization: **PASS**
- Zero regressions to Passing Criteria, Malpractice Threshold, or Room management: **PASS**
- Summary: **15 / 15 tests passed (100%)**. Client build succeeded in **1.76s** with **0 errors**.

---

## 13. BUG-38: Edit Test Configuration Modal Full Parity with Create Modal

### Problem
Comparing the "Create New Test" modal against the "Edit Test Configuration" modal built for BUG-36 revealed discrepancies:
1. Missing `Test Type` dropdown field in the Edit modal.
2. Need to confirm intentional omission of `Passing Criteria` from the Edit modal (to prevent conflicting dual editing paths with the dedicated Passing Criteria card).
3. Inconsistent field labeling: `Start Window` in Edit vs. `Join Window / Password Validity (Minutes)` with expiration subtext in Create.
4. Divergent Supported Languages: Edit showed `REACT` while Create only showed 5 languages without `REACT`.

### Solution
1. **Added Test Type with Cascading Reset**:
   - Added `Test Type *` select dropdown to the Edit modal in [`AdminTestDetail.jsx`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/admin/pages/AdminTestDetail.jsx).
   - Editable only while `test.status === 'DRAFT'`. Locked/disabled for `LIVE` and `ENDED` tests.
   - When changed, `questionSetId` is immediately reset to empty (`''`), requiring the admin to choose a valid question set for the newly selected test type.
   - Question Sets in the dropdown filter dynamically by `editFormData.testType`.
2. **Preserved Single Source of Truth for Passing Criteria**:
   - Confirmed intentional omission from Edit Configuration modal. Passing Criteria remains exclusively editable via the dedicated card on the Test Detail page, which directly invokes shortlist recalculation.
3. **Unified Field Labels and Layout**:
   - Renamed label to `Join Window / Password Validity (Minutes)`.
   - Added helper sub-text: `Room passwords expire after this window from room creation (FR-3.3).`
   - Unified modal layout to mirror Create modal:
     - Row 1: `Test Title *`
     - Row 2: `Test Type *` & `Question Set *` (2 columns)
     - Row 3: `Duration (Minutes) *` & `Total Questions` (2 columns)
     - Row 4: `Join Window / Password Validity (Minutes)`
     - Row 5: `Supported Languages`
     - Row 6: `Candidate Instructions *`
4. **Canonical Supported Languages Parity**:
   - Audited the `Test` Mongoose model schema enum: `['python', 'java', 'cpp', 'c', 'javascript', 'react']`.
   - Added `'react'` to `PROGRAMMING_LANGUAGES` in [`AdminTests.jsx`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/admin/pages/AdminTests.jsx) so both Create and Edit modals offer the exact identical set of 6 checkboxes.

### QA Verification Results
Executed automated test suite `test_bug38_edit_modal_parity.js`:
- Edit modal renders Test Type select dropdown with all test types: **PASS**
- Test Type field is disabled when test status is not DRAFT: **PASS**
- Backend updateTest locks testType when test is LIVE or ENDED: **PASS**
- `handleEditTestTypeChange` resets `questionSetId` to empty string when Test Type changes: **PASS**
- Question Set dropdown filters by `editFormData.testType`: **PASS**
- Passing Criteria intentionally omitted from Edit modal: **PASS**
- Unified `Join Window / Password Validity (Minutes)` label and helper sub-text: **PASS**
- Canonical 6 supported languages match identically between Create and Edit: **PASS**
- Zero regressions to previous features or bug fixes: **PASS**
- Summary: **17 / 17 tests passed (100%)**. Client build succeeded in **1.86s** with **0 errors**.

---

## 14. BUG-39: DRAFT-Only Test Configuration Editing & Button Visibility

### Problem
On the Test detail page for an `ENDED` or `LIVE` test, the "Edit" button on the Configuration Details card was still visible and clickable. Per directive, editing is strictly DRAFT-only: once a test goes `LIVE` or has `ENDED`, the Edit button should be hidden and the backend endpoint must reject modifications with 403 Forbidden.

### Solution
1. **Conditional "Edit" Button Rendering**:
   - In [`AdminTestDetail.jsx`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/admin/pages/AdminTestDetail.jsx#L719-L738), wrapped the Edit button with `{test?.status === 'DRAFT' && (...)}`.
   - The button is visible and active on `DRAFT` tests, and completely hidden on `LIVE` and `ENDED` tests.
2. **Backend API Security Enforcement**:
   - In [`testController.js:updateTest`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/server/src/controllers/testController.js#L112-L130), added a strict check:
     ```javascript
     if (existing.status !== 'DRAFT') {
       return res.status(403).json({
         error: `Test configuration can only be edited while in DRAFT status. Current status: ${existing.status}.`,
       });
     }
     ```
   - Direct API calls attempting to mutate non-DRAFT tests are immediately rejected.
3. **Dead Partial-Locking Code Cleanup**:
   - Cleaned up confusing partial-edit logic, complex ternaries, and advisory banners.
   - Simplified modal header badge to `DRAFT`.
   - Guarded `handleOpenEditModal` and `handleSaveConfig` with `if (test?.status !== 'DRAFT') return;`.
4. **Preserved Independent Controls**:
   - Passing Criteria (FR-2.2) remains editable anytime via its dedicated card.
   - Malpractice Disqualification Threshold (FR-2.3) remains editable post-test via its dedicated card.

### QA Verification Results
Executed automated test suite `test_bug39_draft_only_edit.js`:
- Edit button conditionally rendered strictly for `DRAFT` status: **PASS**
- Edit button completely hidden on `LIVE` tests: **PASS**
- Edit button completely hidden on `ENDED` tests: **PASS**
- Client-side open and save guards enforced: **PASS**
- Backend `updateTest` rejects non-DRAFT tests with 403 Forbidden: **PASS**
- Full field editing in DRAFT status preserved: **PASS**
- Independent Passing Criteria and Malpractice Threshold controls preserved: **PASS**
- Dead partial-lock code and advisory banners cleaned up: **PASS**
- Summary: **18 / 18 tests passed (100%)**. Client build succeeded in **1.77s** with **0 errors**.

---

## 15. BUG-40: Webcam Disconnect Reliability & Full Interaction Lockdown Enforcement

### Problem
1. **Flaky & Intermittent Detection**: After unplugging a USB webcam, the disconnect warning overlay only flashed for ~1 second before disappearing on its own. Investigation revealed that in Chromium on Windows, disconnected video tracks often remain in `readyState: 'live'`. In [`useProctoring.js`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/hooks/useProctoring.js), the 1000ms face detection loop evaluated `if (videoTrack && videoTrack.readyState === 'live') { handleCameraReconnected(); }`, erroneously treating the dead/zombie track as reconnected and dismissing the overlay immediately.
2. **Missing Interaction Lock**: When the warning appeared, the code editor, Run button, Submit button, question navigation, language selector, and custom input remained interactive behind the overlay, creating a proctoring bypass.
3. **Dual Inconsistent UI**: The backend emitted `candidate:warning` for camera disconnect, rendering a red dismissible banner and toast notification with an `✕` button alongside the full-screen overlay, creating a confusing and weak warning path.

### Solution
1. **Eliminated False Auto-Recovery & Stale Tracks**:
   - In [`useProctoring.js:handleCameraDisconnected`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/hooks/useProctoring.js#L290-L318), all tracks in `streamRef.current` are explicitly stopped and nulled out (`streamRef.current = null`, `activeTrackRef.current = null`, `videoRef.current.srcObject = null`).
   - In the face detection loop, if `isCameraDisconnectedRef.current` is true, the loop returns immediately without processing frames and without attempting auto-recovery on stale tracks.
2. **Continuous 1000ms Hardware Polling Monitor**:
   - Added a continuous 1000ms polling interval combined with the `devicechange` event listener querying `navigator.mediaDevices.enumerateDevices()`.
   - When connected: if `videoDevices.length === 0` or the active camera device ID is absent from connected devices, it triggers `handleCameraDisconnected()` within ≤1 second.
   - When disconnected: if `videoDevices.length > 0`, it triggers `reconnectCamera()`.
3. **Strict Verified Live Stream Reconnection**:
   - Reconnection strictly requires `navigator.mediaDevices.getUserMedia(...)` to acquire a brand-new live MediaStream with `videoTracks[0].readyState === 'live'`.
   - If `getUserMedia` fails (e.g., camera still unplugged), `isCameraDisconnected` remains `true` continuously. The overlay stays visible and never flickers off.
4. **Full Interaction Lockdown Enforcement**:
   - In [`CandidateTestScreen.jsx`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/candidate/pages/CandidateTestScreen.jsx):
     - Monaco Editor: `readOnly: Boolean(disqualified || proctoring?.isCameraDisconnected)`.
     - Run button & Submit Question button: `disabled={... || proctoring?.isCameraDisconnected}`.
     - Question Navigation: `handleSelectQuestion` guarded with `if (proctoring?.isCameraDisconnected) return;`, and `QuestionTab` buttons disabled with `not-allowed` cursor and reduced opacity.
     - Language Dropdown: `disabled={disqualified || proctoring?.isCameraDisconnected}`.
     - Code typing handler (`handleCodeChange`): guarded with `if (proctoring?.isCameraDisconnected) return;`.
     - Custom Input Textarea: `disabled={disqualified || proctoring?.isCameraDisconnected}`.
   - In [`CandidateAITestScreen.jsx`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/candidate/pages/CandidateAITestScreen.jsx):
     - File edits (`handleFileChange`), file additions (`handleAddFile`), file deletions (`handleDeleteFile`), AI chat messages (`handleSendChat`), clipboard copy (`handleCopyFromChat`), and project submissions (`handleSubmitQuestion`) are all guarded with `if (proctoring?.isCameraDisconnected) return;`.
5. **Emergency Actions & Timer Preserved on Overlay**:
   - The full-screen blocking overlay ([`CameraDisconnectedOverlay.jsx`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/candidate/components/CameraDisconnectedOverlay.jsx)) covers `100vw` by `100vh` at `zIndex: 999999` with `pointerEvents: 'all'`.
   - Prominently displays the active test countdown timer (`timerDisplay`).
   - "Reconnect Camera" button (`#reconnect-camera-btn`) allows manual reconnection attempts.
   - "Submit All & Finish Exam" button (`#disconnected-submit-all-btn`) allows candidates to conclude their test while disconnected.
6. **Single Authoritative UI Treatment**:
   - Removed `io.to('candidate:' + candidateId).emit('candidate:warning', ...)` in [`proctoringController.js:reportCameraDisconnected`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/server/src/controllers/proctoringController.js#L340-L355).
   - In candidate screens, `onWarning` explicitly ignores `violationType === 'CAMERA_DISCONNECTED'` so no weak top banners or toasts are shown.
7. **Administrative Auditing & Non-Blocking Face Absence Preserved**:
   - `reportCameraDisconnected` and `reportCameraReconnected` record `disconnectAt`, `reconnectAt`, and `durationSeconds` for admin audit logs, transitioning seat map status between `YELLOW` and `GREEN`.
   - Preserved non-blocking "No Face Detected" behavior for brief out-of-frame moments (15-minute absence threshold in [`useProctoring.js`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/hooks/useProctoring.js#L630-L650) and floating PIP badge in [`DraggableWebcamPip.jsx`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/shared/DraggableWebcamPip.jsx#L173-L177)).

### QA Verification Results
Executed automated test suite `test_bug40_webcam_disconnect_reliability.js`:
- Continuous 1000ms polling monitor queries `enumerateDevices()`: **PASS**
- Stale stream/tracks stopped and nulled out immediately: **PASS**
- Face detection loop suspends and prevents false auto-recovery: **PASS**
- `reconnectCamera` verifies live track before clearing disconnect: **PASS**
- Failed reconnection keeps `isCameraDisconnected` strictly `true`: **PASS**
- Run, Submit, Editor, Navigation, Language, and Input locked down: **PASS**
- AI Test Screen file edits and chat blocked during disconnect: **PASS**
- Countdown timer, Reconnect button, and Submit All preserved on overlay: **PASS**
- Weak banner and toast eliminated for camera disconnect: **PASS**
- Backend violation logging with `disconnectAt`, `reconnectAt`, `durationSeconds`: **PASS**
- Non-blocking "No Face Detected" behavior preserved: **PASS**
- Summary: **28 / 28 tests passed (100%)**. Client build succeeded in **1.70s** with **0 errors**.

---

## 16. BUG-41: ReconnectCamera Initialization Order & Temporal Dead Zone (TDZ) Fix

### Problem
After granting camera/mic/screen-share permissions on the Instructions page and clicking "Start Test — Enter Fullscreen," the candidate test screen crashed immediately with an error-boundary screen: `"Cannot access 'reconnectCamera' before initialization"`.
In [`useProctoring.js`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/hooks/useProctoring.js), a `useEffect` setting up `window.__simulateCameraReconnect` included `reconnectCamera` in its dependency array `[handleCameraDisconnected, reconnectCamera]` at line 409, while `const reconnectCamera = useCallback(...)` was declared at line 412. During the component's initial synchronous render pass, evaluating the dependency array before the `const` declaration was initialized triggered a JavaScript Temporal Dead Zone `ReferenceError`.

### Solution
1. **Reordered Declaration Before Usage**:
   - Moved `const reconnectCamera = useCallback(async () => { ... }, [attachTrackListeners, handleCameraReconnected]);` above the simulation `useEffect`.
   - Placed the simulation `useEffect` after `reconnectCamera`.
2. **Verified Hook Order & Dependencies**:
   - All references to `reconnectCamera` (in the simulation `useEffect`, the continuous hardware monitoring `useEffect`, and the hook return object) now strictly execute after `reconnectCamera` is declared.
3. **Confirmed Server-Side Timer Resilience**:
   - Observed that during client-side crashes, the server-side test countdown timer and proctoring session continue running accurately without logging false malpractice violations, confirming correct architectural separation of client UI and server state truth.

### QA Verification Results
Executed automated test suite `test_bug41_reconnect_camera_initialization.js`:
- `reconnectCamera` declaration strictly precedes simulation effect and dependency array: **PASS**
- `reconnectCamera` declaration strictly precedes continuous hardware monitor: **PASS**
- Hook return value and screen wiring to `CameraDisconnectedOverlay onRetry` verified: **PASS**
- Zero Temporal Dead Zone (TDZ) reference errors during initialization: **PASS**
- Disconnect lifecycle and interaction lockdown from BUG-40 preserved: **PASS**
- Summary: **11 / 11 tests passed (100%)**. Client build succeeded in **1.92s** with **0 errors**.


## 17. BUG-42: Webcam Disconnect Frame Delivery Stall Detection & Face Absence Distinction

### Problem & Regression Investigation
When physically unplugging an external camera (such as a USB webcam, phone connected via Iriun Webcam, or virtual driver), the candidate test screen showed only the small `"❌ No Face!"` label on the floating PIP widget, rather than activating the full-screen `"Webcam Disconnected"` blocking overlay.

Investigation of git history and hardware driver behavior revealed the precise chain of root causes:
1. **Windows / Chromium Video Track Driver Behavior**:
   - When an external webcam or virtual camera (e.g. Iriun Webcam) is physically unplugged, the DirectShow / MediaFoundation driver in Windows does **NOT** transition `videoTrack.readyState` to `'ended'`; it remains `'live'` indefinitely.
   - `track.onended` and `track.onmute` do not fire.
   - `navigator.mediaDevices.enumerateDevices()` continues listing the virtual camera device because the software driver remains active in Windows PnP (`Get-PnpDevice -Class Camera` shows `Iriun Webcam: OK`).
   - The `<video>` element retains the last rendered frame in its memory buffer without clearing or throwing an error (`readyState` remains 4).
2. **MediaPipe Processing of Frozen Frames**:
   - Because `videoTrack.readyState` remained `'live'`, the proctoring hook believed the camera was still functioning normally.
   - Every 1000ms, the face detection loop executed `detectForVideo(video, startTimeMs)` on the **frozen** video frame.
   - Because the frozen frame had no detectable face (or stale/empty image), MediaPipe returned 0 detections (`detectedFaces === 0`), causing `setFaceCount(0)`.
   - The floating PIP widget rendered `"❌ No Face!"`, which is the exact same non-blocking badge used when a candidate temporarily looks away.
3. **Premature Auto-Recovery Polling Loop**:
   - In earlier iterations, `checkCameraHardware` checked `if (videoDevices.length > 0) reconnectCamera();` on an unprompted 1000ms polling interval. On any machine with an integrated or virtual camera driver, `videoDevices.length > 0` was always true, causing continuous false reconnect attempts that dismissed the disconnect overlay.

### Solution
1. **Direct Video Frame Presentation Monitoring**:
   - Added native frame arrival tracking using:
     - `video.requestVideoFrameCallback()` for frame-by-frame presentation callbacks.
     - `video.getVideoPlaybackQuality().totalVideoFrames` for frame counter progression across Chromium.
     - `video.currentTime` progression checks.
   - If the camera is actively connected, frames are presented at ~30 fps (`timeSinceLastFrame < 100ms`).
   - When the camera is physically disconnected, frame delivery stops completely (0 fps).
   - If `timeSinceLastFrame > 2000ms` (and the tab is not in a background hidden state), a **frame stall** is detected, and `handleCameraDisconnected()` is immediately called.
2. **Face Detection Loop Safety**:
   - Checked `isFrameStalled` **before** invoking MediaPipe.
   - MediaPipe `detectForVideo` is **never executed** on frozen or stalled video frames.
3. **Elimination of Auto-Reconnect Polling**:
   - Removed the 1000ms polling loop that attempted auto-reconnection.
   - Auto-reconnection now triggers exclusively on genuine hardware plug-in events (`devicechange` with increased video device count) or when the candidate explicitly clicks the **"🔄 Reconnect Camera"** button on the blocking overlay.
4. **Architectural Directive & Regression Guard Comment**:
   - Added a prominent top-level architectural warning comment in [`useProctoring.js`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/hooks/useProctoring.js) documenting the distinction between low-severity face absence and high-severity camera disconnect to prevent future regressions.

### QA Verification Results
Executed automated test suite `test_bug42_webcam_disconnect_frame_stall_distinction.js`:
- Architectural directive and regression guard comment present: **PASS**
- Frame delivery tracking via `requestVideoFrameCallback` and `totalVideoFrames`: **PASS**
- Frame stall detected within 2000ms on frame cessation: **PASS**
- MediaPipe `detectForVideo` prevented from running on frozen frames: **PASS**
- Faulty 1000ms polling loop removed and replaced with genuine `devicechange` listener: **PASS**
- Monaco editor locked in `readOnly` and Run/Submit buttons disabled on disconnect: **PASS**
- Floating PIP retains non-blocking `"❌ No Face!"` and `"✓ Face Detected"` badges: **PASS**
- All 15 repository QA suites executed: **15 / 15 suites passed (100%)**.


## 18. Instructions Page Real Device Presence & Live Stream Verification (BUG-42 Device Permissions)

### Problem & Root Cause
On the Instructions page (`CandidateInstructions.jsx`), when no physical camera was attached or when an idle virtual camera driver was active (e.g. Iriun Webcam on PC with phone disconnected), the Device Permissions panel displayed `"Webcam: ✓ Granted"` and enabled `"Start Test — Enter Fullscreen"`. The live preview box displayed an idle placeholder graphic (an orange cat with `"Looking for the phone"`), revealing that no active camera feed was truly transmitting, yet the UI treated the device as verified.

Root causes identified:
1. **Permission vs. Presence Conflation**: The verification logic accepted any successful `getUserMedia()` call with `readyState === 'live'`. Virtual camera drivers (e.g. Iriun, OBS) create software video devices that accept connections and report `live` even when no physical camera/phone is transmitting video.
2. **Lack of Error State Differentiation**: `NotFoundError` and `NotAllowedError` were treated uniformly under a generic error banner without distinct negative statuses (e.g. differentiating `"✗ No Camera Found"` from `"✗ Not Granted"`).
3. **Desynchronized Preview Box**: The live preview box was showing the virtual driver's placeholder feed while displaying `"● LIVE PREVIEW"` and claiming `"Granted"`.

### Solution
1. **Shared Media Stream Verification (`mediaStreamVerifier.js`)**:
   - Created [`client/src/services/mediaStreamVerifier.js`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/services/mediaStreamVerifier.js) exporting `verifyActiveVideoStream` and `checkHardwareDevices`.
   - Checks `navigator.mediaDevices.enumerateDevices()` to verify that a hardware videoinput device exists.
   - Samples frames from the video stream using an offscreen canvas: real camera sensors (even in pitch darkness) continuously produce natural photon and thermal shot noise (`diff > 0`). Synthetic/idle driver placeholders (e.g. Iriun cat graphic) produce byte-identical static frames (`diff === 0`).
   - If `diff === 0`, `verifyActiveVideoStream` flags `STATIC_PLACEHOLDER`, stops the tracks, and rejects the stream.
2. **Distinct Status Indicators**:
   - `webcamStatus`: `'GRANTED'` (`"✓ Granted"`), `'NOT_FOUND'` (`"✗ No Camera Found"`), `'DENIED'` (`"✗ Not Granted"`).
   - `micStatus`: `'GRANTED'` (`"✓ Granted"`), `'NOT_FOUND'` (`"✗ No Mic Found"`), `'DENIED'` (`"✗ Not Granted"`).
   - `screenStatus`: `'GRANTED'` (`"✓ Granted"`), `'DENIED'` (`"✗ Not Granted"`).
3. **Synchronized Preview Box**:
   - `<video>` and `"● LIVE PREVIEW"` badge are rendered **only** when `webcamGranted` is true and a verified live stream is active.
   - When no physical webcam is connected or idle driver is rejected, the box renders a clean dark placeholder with `"📷 No Webcam Detected"` and clear guidance to connect a physical camera.
4. **Live Hardware Monitor**:
   - Added a `devicechange` listener on the Instructions page to immediately flip status to `"✗ No Camera Found"` and disable `"Start Test"` if a camera is unplugged prior to starting.
5. **Start Button Gating**:
   - `"Start Test — Enter Fullscreen"` is strictly disabled unless `webcamStatus === 'GRANTED' && micStatus === 'GRANTED' && screenStatus === 'GRANTED'`.

### QA Verification Results
Executed automated test suite `test_bug42_instructions_device_presence_verification.js`:
- Shared media stream verifier integration: **PASS**
- Distinction of `"✗ No Camera Found"` from `"✗ Not Granted"`: **PASS**
- Static placeholder graphic detection (0-diff rejection): **PASS**
- Live preview box synchronization with granted status: **PASS**
- Microphone and Screen Share live stream verification: **PASS**
- Real-time `devicechange` listener and Start button gating: **PASS**
- Summary: **15 / 15 tests passed (100%)**.
- Full repository QA suites (all 16 suites): **16 / 16 passed (100%)**.


## 19. Seat Map In-Progress Yellow Dot Pulse Animation (BUG-43)

### Problem & Change Request
The small yellow status dot in the top-right corner of each "In Progress" candidate tile on the Live Physical Seat Map (`AdminLiveDashboard.jsx`) was previously solid and static. To visually distinguish actively working candidates at a glance as "currently active", the yellow dot needed to blink/pulse using the exact same smooth opacity pulse treatment previously established in BUG-27 for the green `"● LIVE"` badge dot.

### Solution
1. **GPU-Accelerated CSS Pulse Animation**:
   - Reused `@keyframes liveDotPulse` (smooth `0.35` -> `1` opacity transition over a 1.8-second cycle with `ease-in-out infinite`) in [`client/src/styles/global.css`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/styles/global.css).
   - Defined `.seat-tile-dot-pulse` with `will-change: opacity` to guarantee independent GPU hardware layer compositing with zero layout reflows (NFR 60fps compliance).
2. **Selective State Targeting in [`AdminLiveDashboard.jsx`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/admin/pages/AdminLiveDashboard.jsx)**:
   - Evaluated `isYellowDot = color === STATUS_COLORS.YELLOW`.
   - Applied `.seat-tile-dot-pulse` and `animation: liveDotPulse 1.8s ease-in-out infinite` **strictly** when `isYellowDot` is true.
   - Non-yellow states remain static:
     - **Passed (green)**: Solid static `#2ECC71`.
     - **Disqualified (red)**: Solid static `#E74C3C`.
     - **Not Started (white/gray)**: Solid static `#94A3B8` fill with high-contrast `#111827` border (preserving BUG-32 visibility).
3. **Table Row Parity**:
   - Extended the same pulsing indicator to `CandidateRowItem` for visual consistency across both Seat Map and Table views.

### QA Verification Results
Executed automated test suite `test_bug43_seatmap_tile_yellow_dot_pulse.js`:
- Reused `@keyframes liveDotPulse` from BUG-27: **PASS**
- `.seat-tile-dot-pulse` class composited with `will-change: opacity`: **PASS**
- `SeatTile` calculates `isYellowDot` strictly on `STATUS_COLORS.YELLOW`: **PASS**
- Applied pulsing class and GPU inline animation strictly to yellow dot: **PASS**
- Passed (green), Disqualified (red), and Not Started (white) dots remain static: **PASS**
- BUG-32 contrast border and fill for Not Started dot fully preserved: **PASS**
- No layout thrashing (strictly opacity-based animation): **PASS**
- `CandidateRowItem` visual parity confirmed: **PASS**
- Summary: **10 / 10 tests passed (100%)**.
- Full repository QA suites (all 17 suites): **17 / 17 passed (100%)**.


## 20. Increased Pulse Visibility & Amplitude for In-Progress Yellow Dot (BUG-45)

### Problem
The initial pulse effect from BUG-43 was too subtle to register at a glance against the light yellow/cream seat map tile background (`#F1C40F15`). The low contrast between 35% opacity yellow and the card background caused the dot to look almost static unless closely inspected.

### Solution
1. **Dramatic Opacity Amplitude**:
   - Widened the opacity swing from `0.35` -> `1.0` to **`0.18` -> `1.0`** (82% opacity drop), ensuring the dot visibly fades in and out with high contrast against the cream card.
2. **Breathing Scale Dynamic**:
   - Added gentle size scaling: `transform: scale(1)` at 0%/100% to **`transform: scale(1.28)`** at 50% with `transform-origin: center`, giving the dot a visible biological "breathing" rhythm that catches the eye immediately.
3. **Radial Ping Glow**:
   - Incorporated expanding box-shadow pulse:
     - 0%/100%: `box-shadow: 0 0 6px rgba(241, 196, 15, 0.9), 0 0 0 0 rgba(241, 196, 15, 0.6)`
     - 50%: `box-shadow: 0 0 2px rgba(241, 196, 15, 0.2), 0 0 0 5px rgba(241, 196, 15, 0)`
   - Sends a soft, elegant 5px wave outward without any jarring flicker or layout movement.
4. **Scoping & LIVE Badge Dot Status**:
   - This enhanced pulse is tailored specifically to the yellow In-Progress dot (`@keyframes seatTileDotPulse`), preserving the standard green LIVE badge dot (`@keyframes liveDotPulse` from BUG-27) without unexpected side effects.
   - Non-yellow dots (Passed green, Disqualified red, Not Started white with black border) remain completely static.

### QA Verification Results
Executed automated test suite `test_bug43_seatmap_tile_yellow_dot_pulse.js`:
- `@keyframes seatTileDotPulse` high-amplitude opacity (1.0 -> 0.18) & scale (1.0 -> 1.28): **PASS**
- Expanding radial ping glow (5px box-shadow wave): **PASS**
- `.seat-tile-dot-pulse` GPU composited with `will-change: opacity, transform`: **PASS**
- `SeatTile` and `CandidateRowItem` render high-visibility pulse strictly for In-Progress: **PASS**
- Static state preserved for Passed, Disqualified, and Not Started dots: **PASS**
- BUG-32 high-contrast border and fill preserved for Not Started: **PASS**
- Summary: **11 / 11 tests passed (100%)**.
- Full repository QA suites (all 17 suites): **17 / 17 passed (100%)**.


## 21. Green Tile Status Meaning: "Submitted" (BUG-44)

### Problem
Previously, the seat map legend and color derivation marked candidates as GREEN based on "Passed (≥ Criteria)". This caused several critical issues during live monitoring:
1. In-progress candidates who reached the passing threshold were turning GREEN mid-test before submitting.
2. Candidates who submitted having solved fewer questions than the passing threshold were not colored GREEN, despite having completed and finished their test.
3. The seat map legend label "Passed (≥ Criteria)" implied that the live monitoring tile reflected scoring qualification rather than test completion state.

### Solution
1. **Unified Four-Color System (`getCandidateColorStatus`)**:
   - Single source of truth applied uniformly across `SeatTile`, `CandidateRowItem`, and `CandidateInspectionModal`:
     - **GREEN (`#2ECC71`)**: Strictly indicates **`SUBMITTED`** (manual "Submit All & Finish" or automatic time-expiry submission `AUTO_SUBMITTED_TIME_UP`), independent of question count or passing criteria.
     - **YELLOW (`#F1C40F`)**: Currently taking the test (`IN_PROGRESS` with active `candidateStartTime`), regardless of whether they have already solved ≥ passing criteria questions.
     - **RED (`#E74C3C`)**: Disqualified (`DISQUALIFIED`, manual admin action or malpractice threshold exceeded).
     - **WHITE (`#ffffff` fill, `#111827` border)**: Not started (`NOT_STARTED`).
2. **Backend Alignment**:
   - In [`roomController.js`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/server/src/controllers/roomController.js): Removed the passing criteria override loop that turned active in-progress candidates green.
   - In [`socketHandler.js`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/server/src/sockets/socketHandler.js): Updated `candidate:heartbeat` to derive `GREEN` strictly when `status === 'SUBMITTED'` or `'AUTO_SUBMITTED_TIME_UP'`.
   - In [`submissionController.js`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/server/src/controllers/submissionController.js): Broadcast `seatmap:status` with `colorStatus: 'GREEN'` on both manual submit and auto-submit timeout.
3. **Legend and UI Consistency**:
   - Updated seat map legend label from "Passed (≥ Criteria)" to **"Submitted"**.
   - Updated Table Roster filter dropdown option from "Passed" to **"Submitted"**.
   - Updated Real-Time Metrics Bar to display **"Submitted"** (green card) and a distinct **"Meeting Criteria (≥ N Qs)"** stat card so admins have both real-time completion status and scoring qualification without ambiguity.
4. **Scoring & Shortlist Logic Preservation**:
   - Verified that `shortlistService.js` and `evaluationService.js` are **100% UNCHANGED** and continue to evaluate candidate pass/fail against `test.passingCriteria`.

### QA Verification Results
Executed automated test suite `test_bug44_green_tile_submitted_meaning.js`:
- Client `getCandidateColorStatus` maps SUBMITTED and AUTO_SUBMITTED_TIME_UP to GREEN: **PASS**
- IN_PROGRESS candidates remain YELLOW regardless of score: **PASS**
- DISQUALIFIED candidates remain RED: **PASS**
- NOT_STARTED candidates remain WHITE: **PASS**
- Legend label reads "Submitted": **PASS**
- Filter dropdown uses "Submitted": **PASS**
- Real-time metrics bar differentiates "Submitted" vs "Meeting Criteria": **PASS**
- Backend roomController and socketHandler derive GREEN strictly from submission: **PASS**
- Shortlist & Evaluation pass/fail logic verified untouched: **PASS**
- Applied consistently across Seat Map, Table Roster, and Inspection Modal: **PASS**
- Summary: **16 / 16 tests passed (100%)**.
- Full repository QA suites (all 18 suites): **18 / 18 passed (100%)**.


## 22. Consolidate View-Mode Toggle to Single Authoritative Instance (BUG-46)

### Problem
The "Split / Code / Preview" view-mode segmented control was simultaneously rendered in three redundant locations on [`CandidateAITestScreen.jsx`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/candidate/pages/CandidateAITestScreen.jsx):
1. In the top header bar next to "Time Remaining".
2. In Panel #2 (Code Editor panel header).
3. In Panel #3 (Preview panel header).

This created visual clutter, confusion about which toggle was authoritative, and redundancy.

### Solution
1. **Removed Top Header Bar Toggle**:
   - Removed `<ViewModeSegmentedToggle />` from the top timer bar, returning it to showing exclusively "Time Remaining", countdown clock, and submission action buttons.
2. **Removed Preview Panel Header Toggle**:
   - Removed the duplicate segmented control from the Preview panel header (Panel #3).
   - Preserved all other Preview panel elements: panel number `3`, "Preview" title, `http://localhost:3000` address bar, `● LIVE` indicator, reload (`↻`), and open-in-new-window controls.
   - Enhanced the Preview header's expand/restore button (`⛶` / `🗗`) so that if a candidate enters full-width preview mode (`viewMode === 'preview'`), clicking restore seamlessly returns them to split mode.
3. **Consolidated to Single Instance in Code Editor Header**:
   - Retained exactly ONE authoritative segmented toggle in Panel #2 (Code Editor header) with `compact` styling.
4. **Preserved Shared State & Full Functionality**:
   - Single shared `viewMode` state continues to control both Code Editor and Preview panels non-destructively (`display: none` / `flex`).
   - Drag splitters, AI Assistant panel, multi-file tabs (`index.html`, `style.css`, `app.js`), proctoring lock, and fullscreen blocking overlays remain 100% unaffected.

### QA Verification Results
Executed automated test suite `test_bug46_view_mode_toggle_single_instance.js`:
- Exactly ONE `<ViewModeSegmentedToggle />` rendered across the entire screen: **PASS**
- Top timer bar does NOT contain the toggle: **PASS**
- Preview panel header does NOT contain the toggle: **PASS**
- Code Editor panel header contains the sole authoritative toggle: **PASS**
- Preview panel address bar, LIVE badge, and refresh controls preserved: **PASS**
- Shared `viewMode` state & layout expansion preserved: **PASS**
- Zero regressions to AI Assistant, tabs, violation banners, or proctoring: **PASS**
- Summary: **17 / 17 tests passed (100%)**.
- Full repository QA suites (all 19 suites): **19 / 19 passed (100%)**.


## 23. Resolve View-Mode Click Handler State Conflict & Restore Multi-Click Reliability (BUG-47)

### Problem
1. When any panel maximization (`maximizedPanel !== null`) was activated, it took precedence over `viewMode` in the CSS `display` and `flex` calculations.
2. `handleViewModeChange` did not reset `maximizedPanel`, causing clicks on the `ViewModeSegmentedToggle` ("Split", "Code", "Preview") to update the toggle's internal state without altering the actual DOM layout.
3. The candidate was left stuck in a full-screen panel with desynced visual toggle highlights.
4. An investigation into the floating circular "✕" icon confirmed it is Google Chrome's native HTML5 fullscreen exit UI bubble when the cursor touches the top screen edge, not an orphaned markup element.

### Solution
1. **Unify State & Clear Conflicts**:
   - Updated `handleViewModeChange` to explicitly call `setMaximizedPanel(null)`, immediately dismissing any panel maximization lock and guaranteeing that selecting Split, Code, or Preview renders the expected layout without delay.
2. **Harmonize Panel Expand Buttons with View Mode**:
   - Panel 2 (Code Editor) expand button now toggles `handleViewModeChange(viewMode === 'code' ? 'split' : 'code')`.
   - Panel 3 (Preview) expand button now toggles `handleViewModeChange(viewMode === 'preview' ? 'split' : 'preview')`.
   - In `viewMode === 'preview'`, added an explicit, accessible `[ ◫ Split View ]` button in the Preview panel header alongside the `🗗` restore button so candidates can instantaneously return to side-by-side split view.
3. **Confirmed Single Toggle Instance**:
   - Exactly ONE `ViewModeSegmentedToggle` exists across the entire screen, located strictly in Panel 2 (Code Editor header).
   - Zero toggle instances in top timer header bar and zero toggle instances in Preview panel header.

### QA Verification Results
Executed automated test suite `test_bug47_view_mode_click_handler.js`:
- Exactly ONE `ViewModeSegmentedToggle` rendered across the screen: **PASS**
- Top timer bar and Preview header 100% free of toggles: **PASS**
- `handleViewModeChange` clears `maximizedPanel`: **PASS**
- Expand buttons unified with `viewMode`: **PASS**
- Multi-click order transitions (`Code → Preview → Split → Code`) verified seamless: **PASS**
- Zero regressions to AI Assistant, tabs, violation banner, or proctoring: **PASS**
- Summary: **18 / 18 tests passed (100%)**.
- Full repository QA suites (all 20 suites): **20 / 20 passed (100%)**.


## 24. Persistent Top Header Toggle & Preview Iframe Focus Exemption (BUG-48)

### Problem
1. **Part A — Toggle Disappeared in Preview Mode**: Placing the single `ViewModeSegmentedToggle` inside the Code Editor panel header caused it to be hidden when the candidate clicked "Preview", because Preview mode sets the Code Editor to `display: 'none'`. This left the candidate with no toggle on screen to switch back to Split or Code mode.
2. **Part B — False TAB_SWITCH on Preview Iframe Click**: Clicking anywhere inside the Preview panel's rendered iframe caused the main `window` to fire a `blur` event as focus entered the child browsing context, falsely triggering a `TAB_SWITCH` violation toast and warning banner.

### Solution
1. **Part A — Dynamic Panel-Header Toggle Placement (Revised)**:
   - Completely removed the toggle from the top header bar (near Time Remaining).
   - In **Split mode** and **Code mode**, the toggle is rendered inside the **Code Editor panel's header** (`(viewMode === 'split' || viewMode === 'code')`).
   - In **Preview mode**, the toggle is rendered inside the **Preview panel's header** (`viewMode === 'preview'`), ensuring the candidate always has the toggle accessible to switch away from Preview.
   - At no point does the toggle appear in both headers simultaneously or in the top bar. Exactly ONE toggle exists on-screen at all times.
2. **Part B — Exempted Internal Preview Iframe Focus from TAB_SWITCH**:
   - Added `id="ai-test-preview-iframe"` and `data-preview-iframe="true"` to the preview `<iframe />`.
   - In `useProctoring.js`, updated `handleWindowBlur` to check `document.activeElement` for the preview iframe alongside a short 60ms grace period.
   - When focus moves into the preview iframe while `!document.hidden`, the false `TAB_SWITCH` violation is suppressed.
   - Genuine tab switches (`document.hidden === true`) and switching to external desktop applications (`active.tagName !== 'IFRAME'`) continue to trigger immediate violations.

### QA Verification Results
Executed automated test suite `test_bug48_persistent_toggle_iframe_tabswitch.js`:
- Toggle NEVER appears in top header bar: **PASS**
- Toggle appears in Code Editor panel header for Split and Code modes: **PASS**
- Toggle moves to Preview panel header when Preview mode is active: **PASS**
- Exactly ONE toggle rendered on-screen across all three modes: **PASS**
- Clicking into preview iframe suppresses false TAB_SWITCH: **PASS**
- Genuine tab switches (`document.hidden`) and Alt-Tab to external apps still trigger TAB_SWITCH: **PASS**
- Zero regressions across Code Editor, AI Assistant, tabs, webcam proctoring: **PASS**
- Summary: **21 / 21 tests passed (100%)**.
- Full repository QA suites (all 21 suites): **21 / 21 passed (100%)**.


## 25. Expand Panel (Maximize) Functionality for Code Editor & Preview (BUG-49)

### Problem
1. While the Question and AI Assistant panels expanded to fill 100% full screen when clicking their `⛶` expand icons (`maximizedPanel === 'question'` and `maximizedPanel === 'chat'`), clicking the expand icon on the Code Editor or Preview panel did not fully maximize them.
2. In BUG-47, the Code Editor and Preview expand buttons had been temporarily mapped to `handleViewModeChange`, which only toggled between Split and Code (or Split and Preview) within the center 54% column, leaving Question (24%) and AI Assistant (22%) visible.

### Solution
1. **Symmetrical Panel Maximization Across All 4 Panels**:
   - Reconnected Code Editor expand button to toggle `maximizedPanel === 'editor'` via `setMaximizedPanel((p) => (p === 'editor' ? null : 'editor'))`.
   - Reconnected Preview expand button to toggle `maximizedPanel === 'preview'` via `setMaximizedPanel((p) => (p === 'preview' ? null : 'preview'))`.
   - In both cases, the maximized panel expands to `flex: '1 1 100%'` and `display: 'flex'`, while the other three panels receive `display: 'none'`, perfectly matching Question and AI Assistant.
2. **State Restoration**:
   - Collapsing back out of the maximized state (`setMaximizedPanel(null)`) automatically restores the exact previous layout based on the candidate's active `viewMode` (`split`, `code`, or `preview`).
3. **Toggle Accessibility During Maximize**:
   - The Split/Code/Preview toggle remains accessible in the Code Editor header when editor is maximized, and in the Preview header when preview is maximized.
   - Clicking any mode in the toggle while a panel is maximized automatically clears `maximizedPanel` and applies the new `viewMode`.
4. **Smooth Monaco Editor Re-layout**:
   - Added `maximizedPanel` to the resize `useEffect` dependency array so Monaco immediately re-lays out when maximizing or restoring.

### QA Verification Results
Executed automated test suite `test_bug49_panel_expand_maximize.js`:
- Symmetrical maximize handlers across all 4 panels: **PASS**
- Full-width layout flex and display computations: **PASS**
- Multi-state restoration simulation across split, code, and preview modes: **PASS**
- Toggle accessibility in maximized panel headers: **PASS**
- Smooth Monaco re-layout event dispatch: **PASS**
- Zero regressions to AI Assistant, question bank, multi-file tabs, or proctoring: **PASS**
- Summary: **25 / 25 tests passed (100%)**.
- Full repository QA suites (all 22 suites): **22 / 22 passed (100%)**.


## 26. Violation Notification Auto-Dismiss & Shared Banner Component (BUG-49 / BUG-50)

### Problem
1. When a proctoring violation was triggered (such as `FULLSCREEN_EXIT` or `TAB_SWITCH`), the full-width orange/red warning banner at the top and the top-right toast persisted indefinitely.
2. The candidate was forced to manually click the "✕" button on each notification to close them.
3. If multiple violations occurred in quick succession, previous notifications lingered without resetting their dismissal lifecycle.
4. This issue occurred on both the Standard Coding Test screen and the AI Test screen.

### Solution
1. **Single Source of Truth (`ViolationNotificationBanner.jsx`)**:
   - Created shared component `client/src/candidate/components/ViolationNotificationBanner.jsx` exporting `ViolationNotificationBanner`, `useViolationNotification`, and `showViolationToast`.
   - Both `CandidateTestScreen.jsx` and `CandidateAITestScreen.jsx` now consume this single shared component and hook.
2. **Auto-Dismiss Behavior**:
   - Configured a 6-second auto-dismiss timer (`6000ms`, within the requested 5–8s range) for both the top banner and the top-right toast.
   - When the timer expires, the notification automatically fades/unmounts without requiring manual user interaction.
3. **Manual "✕" Dismissal Preserved**:
   - The interactive "✕" button remains fully available on both the banner and toast for immediate early dismissal.
4. **Timer Reset & In-Place Updates on Successive Violations**:
   - When a new violation occurs while a notification is active, the auto-dismiss timer immediately resets to a fresh 6-second countdown.
   - The fixed toast ID (`id: 'proctor-violation-toast'`) ensures that rapid successive violations update the toast in-place rather than stacking multiple toasts on top of each other.
5. **Backend Violation Persistence Preserved**:
   - Candidate notification auto-dismissal is purely cosmetic; backend malpractice logging (`MalpracticeLog`), proctor alerts, and admin seat map counts are completely unaffected.

### QA Verification Results
Executed automated test suite `test_bug49_violation_auto_dismiss.js`:
- Single source of truth shared component and hook consumed by both test screens: **PASS**
- Auto-dismiss duration set to 6000ms: **PASS**
- Interactive manual "✕" button clears notification immediately: **PASS**
- Timer resets and toast updates in-place on successive violations: **PASS**
- Backend malpractice logging and socket alerts fully preserved: **PASS**
- Summary: **19 / 19 tests passed (100%)**.
- Full repository QA suites (all 23 suites): **23 / 23 passed (100%)**.


## 27. Preview Section External/Open Icon In-Page Modal (BUG-XX / BUG-50)

### Problem
1. In the Preview section of the AI Test screen, clicking the external/open icon (`↗`) located in the navigation address bar called `window.open(url, '_blank')`.
2. Opening an external browser tab switched browser focus away from the proctored test, causing `document.hidden` to become `true` and triggering an immediate `TAB_SWITCH` violation.
3. This penalized candidates for invoking an intended platform feature.

### Solution
1. **Elimination of `window.open` and External Navigation**:
   - Completely removed `window.open` and blob URL external window creation from [`CandidateAITestScreen.jsx`](file:///c:/Users/GLB-BLR-112/Desktop/spoj%20test%20website/ai-proctored-test-platform/client/src/candidate/pages/CandidateAITestScreen.jsx).
2. **In-Page Full Application Preview Modal**:
   - Connected the `↗` button to toggle an in-page modal dialog: `setIsPreviewModalOpen(true)`.
   - Renders a clean full-screen modal overlay (`id="ai-preview-modal-overlay"`, `role="dialog"`, `zIndex: 950`) within the candidate test page context.
   - Includes simulated browser address bar (`http://localhost:3000`), a reload button `↻` (`id="ai-preview-modal-reload-btn"`), and an explicit `✕ Close Preview` button (`id="ai-preview-modal-close-btn"`).
   - Added keyboard Escape handler (`useEffect`) so candidates can close the modal by pressing `Esc`.
3. **Proctoring Integrity Uncompromised**:
   - The modal iframe is tagged with `data-preview-iframe="true"`, ensuring focus within the preview does not trigger false tab switch warnings.
   - The webcam PiP (`DraggableWebcamPip`, `zIndex: 1000`) and fullscreen blocking overlay (`zIndex: 9999`) sit above the modal, maintaining uninterrupted candidate monitoring.
   - Standard browser tab-switching (`document.hidden`, Alt-Tab) detection remains 100% active and unweakened.

### QA Verification Results
Executed automated test suite `test_bug50_preview_inpage_modal_no_tabswitch.js`:
- Elimination of `window.open` and `target="_blank"`: **PASS**
- In-page full preview modal overlay with `role="dialog"`: **PASS**
- Reload button and interactive "✕ Close Preview" / Escape handler: **PASS**
- Modal iframe tagged with `data-preview-iframe="true"`: **PASS**
- Standard proctoring TAB_SWITCH detection remains intact for genuine tab switches: **PASS**
- Summary: **18 / 18 tests passed (100%)**.
- Full repository QA suites (all 24 suites): **24 / 24 passed (100%)**.


## 28. AI Test Multi-Question Support and Navigation (BUG-XX / BUG-51)

### Problem
1. When an AI_TEST question set contained multiple questions (e.g. Q1 "Frontend" and Q2 "Login page"), starting the test exam displayed only Q1 in the candidate view.
2. The backend (`submissionController.js`) correctly populated and returned all questions in the question set, but `CandidateAITestScreen.jsx` completely lacked question navigation controls (no question tabs or prev/next buttons).
3. The editor file state and active file were tied strictly to `questions[0]`, lacking per-question memory isolation.

### Solution
1. **Per-Question State Isolation (`CandidateAITestScreen.jsx`)**:
   - Added `questionFilesRef` and `questionActiveFileRef` to cache code files and active file selection per question ID (`{ [questionId]: { [fileName]: content } }`).
   - Kept `filesRef` synchronized with local state on every edit so user typing is immediately captured without waiting for React re-render cycles.
   - On initial mount from `sessionStorage`, pre-populated `questionFilesRef` for every question using existing submissions, question starter files (`aiTestBriefFiles`), or defaults.
   - Restored `submittedQuestions` set from any existing submissions marked `status === 'SUBMITTED'`.
2. **Question Navigation Handler (`handleSelectQuestion`)**:
   - Automatically snapshots current question code into `questionFilesRef`.
   - Fires asynchronous autosave (`api.saveFiles`) for the active question.
   - Sets `activeQuestionIdx` to the target index.
   - Loads target question's files and active file from cache.
   - Increments `previewKey` (`setPreviewKey(k => k + 1)`) to immediately refresh the Sandpack preview for the newly selected question.
3. **Question Navigation UI in Panel 1**:
   - **Question Tab Strip**: Renders `#ai-question-nav-strip` below the header when `session.questions.length > 1`. Each tab (`#ai-question-tab-${idx}`) highlights the active question in purple (`#7c3aed`) and displays a green checkmark (`✓`) if submitted.
   - **Prev / Next Buttons**: Renders `#ai-prev-question-btn` and `#ai-next-question-btn` in the Question panel with boundary disabling on first/last questions.
4. **Progress & Submission Tracking**:
   - Top timer bar dynamically displays `Progress: {submittedQuestions.size}/{session.questions.length} Submitted` and `Status: Q{idx + 1} Submitted` / `In Progress`.
   - Isolated question submission: submitting Q1 updates Q1's status while keeping Q2 active and submittable.
   - Preserved `handleSubmitAll` and timer expiry to submit current files before finalizing.

### QA Verification Results
Executed automated test suite `test_bug51_ai_test_multi_question_navigation.js`:
- Backend returns all populated questions up to `totalQuestions`: **PASS**
- Per-question files isolation and caching: **PASS**
- Dynamic question tab navigation strip & Prev/Next buttons: **PASS**
- State preservation, autosave, and preview refresh on switch: **PASS**
- Dynamic Progress indicator (`submittedQuestions.size / totalQuestions`): **PASS**
- Isolated question submission: **PASS**
- Regression audit (view-mode toggle, modal, camera overlay): **PASS**
- Summary: **20 / 20 tests passed (100%)**.
- Full repository QA suites (all 25 suites): **25 / 25 passed (100%)**.


## 29. Question Set Name and Type Editing (BUG-XX / BUG-52)

### Problem
In Admin → Question Bank, selecting a Question Set displayed the set's name and type badge, but lacked any Edit action. Admins could not update the Question Set name or change its test type, nor was there any backend `PATCH` endpoint for Question Sets.

### Solution
1. **Backend Route & Controller (`questionRoutes.js`, `questionController.js`)**:
   - Added `PATCH /api/v1/question-sets/:setId` route protected by `verifyToken, requireAdmin` middleware.
   - Implemented `updateQuestionSet`:
     - Validates non-empty `name` (trims whitespace, rejects empty names with 400).
     - Validates `testType` against allowed types: `SPOJ`, `REACT`, `JAVASCRIPT`, `AI_TEST`.
     - **Test Association Safety**: If the Question Set is assigned to an existing Test, changing its `testType` is blocked with a descriptive error (`Cannot change test type: This Question Set is assigned to test ...`).
     - **Question Schema Safety**: If the Question Set contains existing questions, changing its `testType` is blocked (`Cannot change test type: This Question Set contains ... existing question(s)`).
     - Allows safe `testType` modification when the set has 0 questions and is unassigned.
     - Preserves MongoDB `_id` and existing `questionIds`.
2. **Frontend Service & UI (`apiClient.js`, `AdminQuestionBank.jsx`)**:
   - Added `updateQuestionSet: (setId, data) => axios.patch(\`/question-sets/\${setId}\`, data)` in `apiClient.js`.
   - Added `✏ Edit Set` button (`#edit-question-set-btn`) in the Question Set Header Card next to the name and type badge.
   - Added Edit Question Set Modal (`#edit-set-name-input`, `#edit-set-type-select`, `#save-edit-set-btn`, `#cancel-edit-set-btn`).
   - Automatically disables `testType` dropdown in the modal if the set contains existing questions, with clear guidance text.
   - Updates `selectedSet` and `questionSets` state in-place on successful save, immediately updating both the details card and the sidebar set list without full page reload.

### QA Verification Results
Executed automated test suite `test_bug52_edit_question_set_name_and_type.js`:
- `apiClient` exports `updateQuestionSet`: **PASS**
- `AdminQuestionBank` renders Edit Set button with click handler: **PASS**
- `AdminQuestionBank` contains Edit modal and form submit handler: **PASS**
- `AdminQuestionBank` disables `testType` select when set contains questions: **PASS**
- `AdminQuestionBank` updates state in-place on save: **PASS**
- Route registers `PATCH /question-sets/:setId` with `verifyToken` & `requireAdmin`: **PASS**
- Controller validates assigned tests and question count before allowing type changes: **PASS**
- Admin successfully updates Question Set name: **PASS**
- Question Set MongoDB `_id` is preserved: **PASS**
- Server rejects empty Question Set name with 400: **PASS**
- Admin successfully updates `testType` when unassigned and 0 questions: **PASS**
- Server rejects invalid `testType` with 400: **PASS**
- Server blocks changing `testType` when assigned to an existing Test: **PASS**
- Admin can safely update name even when assigned to a Test: **PASS**
- Server blocks changing `testType` when set contains existing questions: **PASS**
- Server rejects non-admin / candidate updates with 403: **PASS**
- Server returns 404 for non-existent Question Set ID: **PASS**
- Summary: **18 / 18 tests passed (100%)**.
- Full repository QA suites (all 26 suites): **26 / 26 passed (100%)**.















