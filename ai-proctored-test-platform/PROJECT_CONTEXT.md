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

### 2026-09-03
- Resolved BUG-48 through BUG-52 across candidate test-taking and admin management flows.
- Implemented in-page preview modal dialog eliminating false TAB_SWITCH proctoring violations.
- Implemented AI Test multi-question exam navigation and per-question file cache state isolation.
- Implemented Question Set name and type editing in Admin Question Bank with strict test association safety rules.
- Validated all 26 automated repository QA test suites with a 100% pass rate.
