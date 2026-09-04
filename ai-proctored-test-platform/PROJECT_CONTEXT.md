# AI-Proctored Test Platform — Technical Project Context

> **Notice for Developers & AI Agents**: This document contains the complete, authoritative context for the **AI-Proctored Test Platform** codebase. Use this as your primary reference for architecture, database schemas, API routes, environment setup, and development state.

---

## 1. Project Purpose & Overview

The **AI-Proctored Test Platform** is an enterprise-grade, high-concurrency technical assessment and remote proctoring system tailored for hiring software engineers (specifically designed according to Globussoft Technology PRD specifications). 

### Key Capabilities
1. **Multi-Category Test Support**:
   - **SPOJ (Algorithmic)**: Standard competitive programming problems with visible and hidden test cases.
   - **REACT**: Web component development assessments.
   - **JAVASCRIPT**: Frontend & Node.js logic problems.
   - **AI_TEST (Prompt Engineering)**: Modern AI-assisted development tests where candidates interact with a built-in LLM (Kimi LLM) to generate, refine, and build multi-file web applications (HTML/CSS/JS) with live iframe previews.
2. **AI-Powered Proctoring Engine**:
   - **Client-Side Face Tracking**: MediaPipe Vision WASM running locally in the browser to detect candidate presence, no-face conditions (>15 mins), and multiple faces.
   - **Server-Side Object Detection**: Dedicated FastAPI microservice running YOLOv8n on PyTorch CPU for real-time mobile phone detection in webcam frame streams.
   - **Event Logging**: Tab switches, full-screen exits, and proctoring violations recorded with proof screenshots uploaded to Cloudinary.
3. **Live Admin Supervision**:
   - Real-time webcam grid monitoring over WebSockets (`Socket.io`).
   - Live malpractice alert notifications with instant review, warning, or candidate disqualification/termination controls.
4. **Automated Evaluation & Shortlisting**:
   - Judge0 sandbox integration for code execution against hidden test cases.
   - Automated 10-criteria code quality analysis using Kimi LLM.
   - Automated rank-ordered candidate shortlisting based on passing criteria and malpractice thresholds, with PDF report export.

---

## 2. Technology Stack

### Frontend (`/client`)
- **Core**: React 19, Vite 6, React Router v7
- **Code Editor**: Monaco Editor (`@monaco-editor/react`)
- **Proctoring**: `@mediapipe/tasks-vision` (FaceDetector)
- **Real-Time**: `socket.io-client` v4
- **HTTP Client**: Axios (with JWT automatic refresh interceptors)
- **UI & Notifications**: Custom Vanilla CSS design system, `react-hot-toast`

### Backend (`/server`)
- **Runtime**: Node.js (v24 compatible), Express.js v4
- **Real-Time**: Socket.io v4
- **Database**: MongoDB v7 with Mongoose ORM v8
- **Auth**: JWT (Access Token + Refresh Token architecture)
- **Security & Logging**: Helmet, CORS, Morgan

### Microservices & Execution Engines
- **YOLO Phone Detection Service (`/yolo-service`)**:
  - Python 3.14, FastAPI, PyTorch (CPU), Ultralytics YOLOv8n, Pillow, NumPy, Uvicorn.
  - Offloads CPU-bound inference to worker thread pool (`fastapi.concurrency.run_in_threadpool`).
- **Code Execution Sandbox (`Judge0`)**:
  - Self-hosted Judge0 v1.13.1 sandbox engine backed by Redis 7.2 and PostgreSQL 16.
- **AI Evaluation & Prompt Engine (`Kimi LLM`)**:
  - External/self-hosted Kimi LLM API service for code analysis & candidate AI-test chat interactions.
- **Media & Proof Storage (`Cloudinary`)**:
  - Cloudinary Node SDK for automated upload and hosting of malpractice proof screenshots.

### Containerization & Orchestration
- **Docker Compose**: Multi-container setup for `mongodb`, `backend`, `frontend`, `yolo-service`, `judge0`, `judge0-workers`, `redis`, and `postgres`.

---

## 3. Directory Structure

```
ai-proctored-test-platform/
├── package.json                   # Root scripts (npm run dev, npm run dev:server, npm run dev:client)
├── docker-compose.yml             # Full system multi-container orchestration
├── .env.example                   # Template environment variables
├── .env                           # Local environment configuration
├── PROJECT_CONTEXT.md             # Developer & AI context (This File)
├── AI_Proctored_Test_Platform_PRD.md # Business & Functional Requirements
│
├── client/                        # React Frontend App
│   ├── package.json
│   ├── vite.config.js
│   ├── Dockerfile
│   └── src/
│       ├── main.jsx               # Application entry point
│       ├── App.jsx                # Router & Global Providers
│       ├── index.css              # Core design tokens & base styling
│       ├── admin/
│       │   └── pages/             # Admin portal (Login, Dashboard, Tests, QuestionBank, LiveDashboard, Results, CreateAdmin)
│       ├── candidate/
│       │   └── pages/             # Candidate portal (Login, Register, JoinRoom, Instructions, TestScreen, AITestScreen, TestComplete)
│       ├── hooks/                 # Custom React hooks (useAuthContext, useProctoring, useAutosave, useSocket)
│       └── services/              # API Client (Axios) & Socket Client setup
│
├── server/                        # Node.js Express Backend
│   ├── package.json
│   ├── Dockerfile
│   ├── .env                       # Local server environment copy
│   └── src/
│       ├── app.js                 # Server entry point, express app setup & socket initialization
│       ├── controllers/           # Route logic handlers (auth, test, room, question, submission, aiTest, proctoring, evaluation, malpractice)
│       ├── middleware/            # Auth JWT validation, role checks, upload handlers
│       ├── models/                # 10 Mongoose Schemas (Admin, Candidate, Test, Room, QuestionSet, Question, Submission, EvaluationResult, MalpracticeLog, Shortlist)
│       ├── routes/                # Express API routes
│       ├── services/              # Integrations (judge0, kimi, cloudinary, evaluation, malpractice, shortlist)
│       └── sockets/               # Socket.io event handlers (webcam streaming, malpractice alerts)
│
└── yolo-service/                  # FastAPI YOLOv8 Microservice
    ├── app.py                     # FastAPI application & YOLO inference endpoint
    ├── requirements.txt           # Python dependencies (>= version constraints for Py3.14 compatibility)
    ├── pyrightconfig.json         # Pyrefly/Pyright IDE language server config
    ├── Dockerfile                 # Python Docker setup
    └── model/
        └── yolov8n.pt             # YOLOv8 nano model binary
```

---

## 4. Database Schemas (MongoDB / Mongoose)

The platform defines **10 primary Mongoose schemas** matching PRD Section 8:

### 1. `Admin` (`Admin.js`)
- `name`: String (Required)
- `email`: String (Required, Unique, Lowercase)
- `passwordHash`: String (Required)
- `role`: Enum `['SUPER_ADMIN', 'ADMIN']` (Required)
- `createdBy`: Ref `Admin` (Null for root super admin)
- `isActive`: Boolean (Default: `true`)
- Timestamps (`createdAt`, `updatedAt`)

### 2. `Candidate` (`Candidate.js`)
- `name`: String (Required)
- `email`: String (Required, Unique, Lowercase)
- `phone`: String
- `passwordHash`: String (Required)
- `createdAt`: Date (Default: `Date.now`)
- `expiresAt`: Date with TTL Index (`expires: 0`) — auto-deleted after candidate account expiry period (default: 3 days)
- `isDisqualified`: Boolean (Default: `false`)

### 3. `Test` (`Test.js`)
- `title`: String (Required)
- `testType`: Enum `['SPOJ', 'REACT', 'JAVASCRIPT', 'AI_TEST']` (Required)
- `createdBy`: Ref `Admin` (Required)
- `questionSetId`: Ref `QuestionSet` (Required)
- `durationMinutes`: Number (Required)
- `totalQuestions`: Number (Required, Default: `5`)
- `passingCriteria`: Number (Required) — threshold score e.g., 2.5
- `instructions`: String (Rich Text)
- `startTestWindowMinutes`: Number (Default: `10`) — validity duration for generated room codes
- `supportedLanguages`: Array of Enums `['python', 'java', 'cpp', 'c', 'javascript', 'react']`
- `malpracticeDisqualifyThreshold`: Number (Default: `null`) — set post-exam by admin
- `status`: Enum `['DRAFT', 'SCHEDULED', 'LIVE', 'ENDED']` (Default: `DRAFT`)
- Timestamps (`createdAt`, `updatedAt`)

### 4. `Room` (`Room.js`)
- `testId`: Ref `Test` (Required)
- `roomName`: String (Required, e.g., "Room 101")
- `roomCode`: String (Required, Unique, Index)
- `roomPassword`: String (Required)
- `passwordValidUntil`: Date (Required) — `createdAt + startTestWindowMinutes`
- `capacity`: Number
- `status`: Enum `['ACTIVE', 'CLOSED']` (Default: `ACTIVE`)
- `createdAt`: Date (Default: `Date.now`)

### 5. `QuestionSet` (`QuestionSet.js`)
- `testType`: Enum `['SPOJ', 'REACT', 'JAVASCRIPT', 'AI_TEST']` (Required)
- `name`: String (Required)
- `createdBy`: Ref `Admin` (Required)
- `questionIds`: Array of Ref `Question`
- `createdAt`: Date (Default: `Date.now`)

### 6. `Question` (`Question.js`)
- `questionSetId`: Ref `QuestionSet` (Required)
- `testType`: Enum `['SPOJ', 'REACT', 'JAVASCRIPT', 'AI_TEST']` (Required)
- `title`: String (Required)
- `description`: String (Required)
- `difficulty`: Enum `['EASY', 'MEDIUM', 'HARD']`
- `inputFormat`: String
- `outputFormat`: String
- `constraints`: String
- `visibleTestCases`: Array of `{ input: String, expectedOutput: String }`
- `hiddenTestCases`: Array of `{ input: String, expectedOutput: String }` (Strictly hidden from candidates)
- `aiTestBriefFiles`: Array of `{ fileName: String }` (Used for AI_TEST category)
- `createdAt`: Date (Default: `Date.now`)

### 7. `Submission` (`Submission.js`)
- `candidateId`: Ref `Candidate` (Required)
- `testId`: Ref `Test` (Required)
- `roomId`: Ref `Room` (Required)
- `questionId`: Ref `Question` (Required)
- `code`: String (Final submitted code or stringified file map)
- `filesJson`: Object (AI Test file map e.g., `{ "index.html": "...", "style.css": "..." }`)
- `language`: String
- `promptLog`: Array of `{ role: Enum['candidate', 'ai'], message: String, timestamp: Date }`
- `visibleTestCasesPassed` & `visibleTestCasesTotal`: Number
- `hiddenTestCasesPassed` & `hiddenTestCasesTotal`: Number
- `candidateStartTime`: Date (Timer start when candidate enters room)
- `candidateEndTime`: Date
- `submittedAt`: Date
- `status`: Enum `['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED_TIME_UP', 'AUTO_SUBMITTED_DISQUALIFIED']`
- Index: Compound index on `{ candidateId: 1, testId: 1, questionId: 1 }`

### 8. `EvaluationResult` (`EvaluationResult.js`)
- `submissionId`: Ref `Submission` (Required, Unique Index)
- `candidateId`: Ref `Candidate` (Required)
- `testId`: Ref `Test` (Required)
- `scoreBreakdown`:
  - Algorithmic (SPOJ/React/JS): `codeCorrectness` (30%), `testCasePassPercent` (10%), `timeComplexity` (15%), `spaceComplexity` (10%), `codeStructure` (10%), `problemSolvingApproach` (8%), `exceptionHandling` (8%), `inputValidation` (5%), `codeOptimization` (2%), `linesOfCode` (2%)
  - AI Test: `promptQuality` (60%), `outputCorrectnessDesign` (40%)
- `finalScorePerQuestion`: Number (0-10 scale)
- `questionsCompletedCount`: Number
- `isPassed`: Boolean (Checked against `Test.passingCriteria`)
- `evaluatedAt`: Date

### 9. `MalpracticeLog` (`MalpracticeLog.js`)
- `candidateId`: Ref `Candidate` (Required)
- `testId`: Ref `Test` (Required)
- `roomId`: Ref `Room` (Required)
- `violationType`: Enum `['PHONE_DETECTED', 'MULTIPLE_FACES', 'NO_FACE_15MIN', 'TAB_SWITCH', 'FULLSCREEN_EXIT', 'OTHER']`
- `proofScreenshotUrl`: String (Cloudinary hosted image URL)
- `detectedAt`: Date (Default: `Date.now`)
- `adminReviewed`: Boolean (Default: `false`)
- `adminAction`: Enum `['NONE', 'WARNED', 'DISQUALIFIED']`
- `reviewedBy`: Ref `Admin`
- `reviewedAt`: Date
- Index: Compound index on `{ testId: 1, roomId: 1, candidateId: 1 }`

### 10. `Shortlist` (`Shortlist.js`)
- `testId`: Ref `Test` (Required, Unique)
- `passingCriteriaUsed`: Number
- `malpracticeThresholdUsed`: Number
- `candidates`: Array of `{ candidateId, name, email, score, questionsCompleted, malpracticeCount, rank }`
- `generatedAt`: Date

---

## 5. Implemented API Endpoints & WebSockets

### Authentication (`/api/v1/auth`)
- `POST /auth/admin/login` — Admin authentication
- `POST /auth/admin/create` — Super Admin sub-admin creation
- `POST /auth/candidate/register` — Candidate registration
- `POST /auth/candidate/login` — Candidate login
- `POST /auth/refresh` — Refresh access token using refresh token
- `POST /auth/logout` — Invalidate user session

### Tests & Rooms (`/api/v1`)
- `POST /tests` & `GET /tests` — Create & list tests
- `GET /tests/:id` & `PATCH /tests/:id` & `DELETE /tests/:id` — Manage test
- `PATCH /tests/:id/passing-criteria` — Update passing score
- `PATCH /tests/:id/malpractice-threshold` — Update disqualify threshold
- `POST /tests/:id/start` & `POST /tests/:id/end` — Change test status
- `POST /tests/:testId/rooms` & `GET /tests/:testId/rooms` — Create/list rooms
- `DELETE /rooms/:roomId` & `GET /rooms/:roomId/candidates` — Manage room & candidates
- `POST /rooms/join` — Candidate room join (Validates `passwordValidUntil` window)

### Question Bank (`/api/v1`)
- `POST /question-sets` & `GET /question-sets` — Question set management
- `POST /question-sets/:setId/questions` & `GET /question-sets/:setId/questions` — Manage questions
- `PATCH /questions/:qId` & `DELETE /questions/:qId` — Question CRUD

### Candidate Submissions & Execution (`/api/v1`)
- `POST /tests/:testId/start-attempt` — Initialize candidate test session & candidate timer
- `GET /tests/:testId/questions/:qId` — Fetch question payload (hidden test cases excluded)
- `POST /submissions/:qId/run` — Execute code on Judge0 against visible test cases
- `POST /submissions/:qId/save` — Auto-save candidate code draft
- `POST /submissions/:qId/submit` — Final submission of question
- `POST /tests/:testId/submit-all` — Finalize complete exam submission

### AI Test Workspace (`/api/v1/ai-test`)
- `POST /ai-test/:qId/chat` — Candidate prompt interaction with Kimi LLM
- `POST /ai-test/:qId/save-files` — Save candidate multi-file project workspace
- `POST /ai-test/:qId/submit` — Submit AI test project
- `GET /ai-test/:qId/preview` — Get combined HTML/CSS/JS for iframe preview

### Proctoring & Malpractice (`/api/v1/proctoring`)
- `POST /proctoring/:testId/frame` — Upload webcam frame for YOLO phone check + Cloudinary proof
- `POST /proctoring/violation` — Record client-side violation (tab switch, face anomaly)
- `PATCH /malpractice-logs/:logId/review` — Admin review violation

### Evaluation & Reports (`/api/v1`)
- `GET /tests/:testId/results` — Fetch test evaluation metrics
- `GET /tests/:testId/shortlist` — Get candidate shortlist
- `POST /tests/:testId/shortlist/regenerate` — Recalculate shortlist
- `GET /tests/:testId/shortlist/export-pdf` — Download PDF report

### Socket.io Real-Time Events
- `join-room` — Candidates & Admins join socket channels (`room_<roomId>`)
- `webcam-frame` — Candidate streams live webcam frame to admin dashboard
- `malpractice-alert` — Real-time notification emitted to proctors upon violation
- `candidate-status` — Real-time ping for live presence monitoring
- `terminate-candidate` — Admin force-terminates candidate session via WebSocket

---

## 6. Development Setup & Environment Variables

### Environment Variables (`.env`)

```env
# Server Configuration
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173

# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/ai_proctored_test_platform

# JWT Authentication
JWT_ACCESS_SECRET=your_dev_jwt_access_secret_key
JWT_REFRESH_SECRET=your_dev_jwt_refresh_secret_key
JWT_ACCESS_EXPIRY=1d
JWT_REFRESH_EXPIRY=7d

# Judge0 Sandbox Execution Engine
JUDGE0_API_URL=http://localhost:2358
JUDGE0_API_KEY=

# Kimi LLM Service Integration
KIMI_API_BASE_URL=
KIMI_API_KEY=

# Cloudinary Storage Credentials
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# YOLO Phone Detection Microservice
YOLO_SERVICE_URL=http://localhost:8001

# Candidate Account TTL (Days)
CANDIDATE_ACCOUNT_EXPIRY_DAYS=3

# Socket.io Configuration
SOCKET_CORS_ORIGIN=http://localhost:5173
```

---

## 7. How to Run the Platform

### Option 1: Running Locally (Development Mode)

1. **Install Root & Sub-project Dependencies**:
   ```powershell
   npm run install:all
   ```

2. **Start Backend & Frontend Simultaneously**:
   ```powershell
   npm run dev
   ```
   - **Frontend**: Runs on `http://localhost:5173`
   - **Backend**: Runs on `http://localhost:5000`

3. **Start YOLO Microservice (Optional for phone detection)**:
   ```powershell
   cd yolo-service
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   uvicorn app:app --host 0.0.0.0 --port 8001
   ```

### Option 2: Running via Docker Compose

```powershell
docker-compose up --build
```
- Spawns `mongodb`, `backend`, `frontend`, `yolo-service`, `judge0`, `judge0-workers`, `redis`, and `postgres` containers.

---

## 8. Current System State & Key Architectural Decisions

### Completed Features & Hardened Logic
1. **Fair Candidate Timers**: Each candidate's countdown timer starts individually upon entering the room (`candidateStartTime`), preventing unfair time loss if room creation was earlier (FR-5.1).
2. **Hidden Test Case Security**: `hiddenTestCases` are strictly stripped from candidate API responses and only executed securely inside Judge0 sandbox evaluation (FR-4.2).
3. **Dual-Layer Proctoring**: Lightweight MediaPipe Vision WASM handles high-frequency face detection client-side to save server CPU, while high-risk phone detection is offloaded to the FastAPI YOLO thread pool (FR-7.2).
4. **Mongoose Duplicate Index Warning Clean-up**: Fixed duplicate index declarations on `Candidate` (`email`) and `Room` (`roomCode`), eliminating all Mongoose startup warnings.
5. **Python 3.14 Compatibility**: Dependencies in `yolo-service/requirements.txt` use `>=` minimum version constraints to allow installing Python 3.14 pre-built wheels on Windows.
6. **IDE Settings Preserved**: [.vscode/settings.json](file:///c:/Users/JOYDEEP/OneDrive/Desktop/spoj%20test%20website/.vscode/settings.json) and [pyrightconfig.json](file:///c:/Users/JOYDEEP/OneDrive/Desktop/spoj%20test%20website/ai-proctored-test-platform/yolo-service/pyrightconfig.json) are configured to resolve `.venv` packages cleanly in Antigravity IDE and VS Code.
7. **Git Remote**: Repository connected to GitHub (`git@github.com:printfJOYDEEP-BANERJEE/ai-proctored-test-platform.git`).
8. **Candidate Status Tile Semantics (BUG-44)**: Question palette tiles render Green exclusively for "Submitted" questions, Purple for the active question, and neutral gray for unattempted questions.
9. **AI Test View-Mode & Header Consolidations (BUG-46, BUG-47, BUG-48)**: Consolidated Split/Code/Preview toggle placement inside panel headers, resolved maximization state conflicts, and added internal iframe focus exemption (`isInternalIframeFocus`) to eliminate false tab-switch penalties.
10. **Panel Maximization & Violation Auto-Dismiss (BUG-49)**: Symmetrical 100% maximization for Code Editor and Preview panels; implemented shared `ViolationNotificationBanner` with 6-second auto-dismiss and timer reset on successive violations.
11. **In-Page Preview Modal (BUG-50)**: Replaced external `window.open` on the Preview popout button (`↗`) with an in-page modal dialog (`#ai-preview-modal-overlay`), preventing browser tab-switch violations during active tests.
12. **AI Test Multi-Question Navigation & State Isolation (BUG-51)**: Full multi-question exam support in `CandidateAITestScreen.jsx` with per-question file caching (`questionFilesRef`), dynamic question tab navigation strip (`#ai-question-nav-strip`), Prev/Next controls, preview refresh on switch, and dynamic exam progress tracking.
13. **Question Set Name and Type Editing (BUG-52)**: Implemented `PATCH /api/v1/question-sets/:setId` and Edit Set modal in Admin Question Bank. Supports instant renaming and safe type modification (locked when questions exist or when assigned to an existing test).
14. **Question Set Deletion & Management**: Implemented `DELETE /api/v1/question-sets/:setId` endpoint and Delete Set confirmation modal (`#delete-question-set-btn`) in Admin Question Bank. Supports cascade deletion of unassigned question sets and associated questions while safely blocking deletion if assigned to an active test.
15. **Results & Shortlist Score Normalization (BUG-001)**: Fixed score aggregation in `shortlistService.js` and `evaluationService.js` to ensure candidate overall scores are normalized on a strict 0–10 scale. Added server-side bounds clamping (`Math.min(10, Math.max(0, score))`) and defensive frontend metrics clamping in `AdminResults.jsx`.
16. **Webcam Disconnected Submit All Flow (BUG-002)**: Hardened `handleSubmitAll` in `CandidateAITestScreen.jsx` and `CandidateTestScreen.jsx` so candidates with webcam hardware disconnections can finalize their exam. Includes all-question file/promptLog persistence, reactive loading states (`isSubmittingAllState`), `sessionStorage` completion flag, and immediate redirect to `/candidate/complete`.
17. **Live Malpractice Violation Counter in AI Test Footer (FEATURE-003)**: Added a real-time malpractice counter badge (`#ai-violation-counter`) in the Candidate AI Test footer displaying `⚠️ Violations: X`. Incorporates dynamic severity color states (Green for 0, Yellow for 1–2, Red for 3+), hover tooltip, initial database fetch via `GET /api/v1/proctoring/:testId/violation-count`, and real-time socket updates via `candidate:violation-updated`.
18. **Shared Proctoring Footer Across All Candidate Test Screens (FEATURE-004)**: Extracted and consolidated the persistent bottom proctoring status bar into a single source of truth (`TestFooter.jsx`). Consumed across both Standard Coding Tests (`CandidateTestScreen.jsx` for SPOJ, JAVASCRIPT, REACT) and AI Tests (`CandidateAITestScreen.jsx`), providing unified proctoring telemetry, REC indicator, live violation counter, advisory banner, and system health status.
19. **Join Test Room Input Alignment Consistency (BUG-50)**: Synchronized "Room Password" input field styling (`CandidateJoinRoom.jsx`) to `textAlign: 'center'`, matching the "Room Code" field font, letter-spacing (`0.15em`), and size (`1.2rem`) for visual consistency and centered placeholder alignment.
20. **Post-Transition (1s Delay) Evidence Capture for Fullscreen Exit & Tab Switch (BUG-51)**: Switched violation screenshot capture in `useProctoring.js` from pre-transition rolling buffer to a scheduled 1000ms post-transition screen grab from the live `__proctoring_screen_video` monitor stream. Captures the destination window/tab/app navigated to while logging and dispatching the violation immediately with the exact detection timestamp (`detectedAt`).
22. **Single Exam Session Enforcement & Timer Continuation (BUG-53)**: Enforced strict single-active-session policy per candidate test attempt. When a candidate re-logs in or resumes an ongoing exam from a new tab/window, the backend preserves original `candidateStartTime` and `candidateEndTime` without timer reset or progress loss, generates a new `submissionSessionId`, and emits a `session:superseded` socket event. Previous tabs display a blocking `SessionSupersededOverlay.jsx` modal (`#session-superseded-overlay`) and disable interactions.
23. **Cross-Test Single Active Exam Enforcement (BUG-54)**: Enforced global platform-wide constraint where a candidate can have at most ONE active in-progress exam session across ALL tests. When a candidate with an active session on Test A attempts to join room or start an attempt on Test B, the backend rejects with HTTP 409 Conflict (`ACTIVE_SESSION_EXISTS_OTHER_TEST`) displaying the active test's title, while keeping Test A's timers, code, and submissions 100% untouched.

---

## 9. Next Recommended Tasks for Incoming Developers / AI

1. **Production Kimi & Cloudinary Credentials**:
   - Configure live API keys for Kimi LLM and Cloudinary in `.env` when deploying to production environments (currently using local fallbacks/stubs in development).
2. **SSH Key Registration on GitHub**:
   - Register your local SSH key (`~/.ssh/id_ed25519.pub`) on GitHub account settings if pushing directly over SSH (`git@github.com:...`).
3. **Playwright Driver Compatibility**:
   - Update Playwright version in local browser test runner environment to resolve 404 driver download issues when executing automated headless browser subagents.

---

## 10. Session Log

### 2026-09-04
- Fixed BUG-50: Center-aligned "Room Password" input field text and placeholder in `CandidateJoinRoom.jsx` to match "Room Code" field styling (`textAlign: 'center'`, `fontFamily: 'monospace'`, `fontSize: '1.2rem'`, `letterSpacing: '0.15em'`).
- Implemented BUG-51: Switched evidence capture for `FULLSCREEN_EXIT` and `TAB_SWITCH` in `useProctoring.js` to 1000ms post-transition screen grab, capturing the destination application/tab while preserving immediate event dispatch, watermarking, and detection timestamps.
- Resolved BUG-52: Fixed top navigation bar width flicker across admin pages by adding `scrollbar-gutter: stable;` on `html` and `width: 100%` on `.navbar` in `global.css`.
- Fixed BUG-53: Single-session enforcement and timer continuation across candidate reconnect/re-login. Preserved immutable server start/end times (`candidateStartTime`, `candidateEndTime`) in `submissionController.js`, generated unique `submissionSessionId`, emitted `session:superseded` socket event, and rendered full-screen blocking `SessionSupersededOverlay.jsx` on invalidated tabs with zero code loss. Passed 17/17 QA tests.
- Fixed BUG-54: Blocked candidates from joining or starting multiple different tests concurrently. Implemented `getActiveExamSessionForCandidate` in `submissionController.js` enforcing single active exam globally across all test types with 409 Conflict response, while preserving Test A untouched and unblocking Test B immediately upon Test A completion/expiry/disqualification. Passed 20/20 QA tests.
- Preserved all candidate room join authentication, late-join request lifecycle, preview iframe focus exemptions (BUG-48), and proctoring locks.

### 2026-09-03
- Resolved BUG-48 through BUG-52 across candidate test-taking and admin management flows.
- Resolved proctoring Temporal Dead Zone initialization crash in Candidate AI Test screen.
- Removed advisory banner for expired room passwords from Admin Test Detail view.
- Implemented Question Set deletion functionality (`DELETE /api/v1/question-sets/:setId`) with modal confirmation and safety guards blocking assigned tests.
- Fixed BUG-001 Results Dashboard score normalization where raw accumulated scores exceeded 10.0; enforced strict 0-10 scale across backend evaluation, shortlist aggregation, and frontend stat cards.
- Fixed BUG-002 Webcam Disconnected "Submit All & Finish Exam" flow; added all-question persistence, reactive loading states, double-submission guards, and immediate redirect to `/candidate/complete`.
- Implemented FEATURE-003 Live Malpractice/Violation Counter in AI Test footer with real-time socket subscriptions, severity color coding, and initial DB synchronization.
- Implemented FEATURE-004 Shared Proctoring Footer (`TestFooter.jsx`) unified across all candidate exam types (SPOJ, JS, React, AI_TEST) with zero duplicate markup.
- Validated client production build in 2.81s with 0 errors and verified 25/25 FEATURE-004 QA tests.
