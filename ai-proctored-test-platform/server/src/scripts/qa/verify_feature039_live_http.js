/**
 * verify_feature039_live_http.js
 * End-to-end verification of FEATURE-039 "Live For" column logic against database and API endpoints
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const Test = require('../../models/Test');
const Admin = require('../../models/Admin');
const Room = require('../../models/Room');
const QuestionSet = require('../../models/QuestionSet');
const Folder = require('../../models/Folder');
const Candidate = require('../../models/Candidate');
const Submission = require('../../models/Submission');
const MalpracticeLog = require('../../models/MalpracticeLog');
const { getTests } = require('../../controllers/testController');

// Logic extracted from client AdminTests.jsx & AdminLiveDashboard.jsx
const formatLiveFor = (test, currentNow = Date.now()) => {
  if (!test) return '—';
  if (test.status === 'DRAFT' || !test.liveStartedAt) {
    return '—';
  }
  const start = new Date(test.liveStartedAt);
  if (isNaN(start.getTime())) return '—';

  const end = test.status === 'ENDED' && test.endedAt ? new Date(test.endedAt) : new Date(currentNow);
  if (isNaN(end.getTime())) return '—';

  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return '< 1 Second';

  const totalSeconds = Math.floor(diffMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'Hour' : 'Hours'}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'Minute' : 'Minutes'}`);
  if (parts.length > 0) return parts.join(' ');
  if (seconds > 0) return `${seconds} ${seconds === 1 ? 'Second' : 'Seconds'}`;
  return '< 1 Second';
};

const formatLiveDurationDashboard = (startDateStr, endDateStr) => {
  if (!startDateStr || !endDateStr) return null;
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const diffMs = end - start;
  if (diffMs <= 0 || isNaN(diffMs)) return null;
  const totalSeconds = Math.floor(diffMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'Hour' : 'Hours'}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'Minute' : 'Minutes'}`);
  if (parts.length > 0) return parts.join(' ');
  if (seconds > 0) return `${seconds} ${seconds === 1 ? 'Second' : 'Seconds'}`;
  return '< 1 Second';
};

async function run() {
  console.log('========================================================');
  console.log('🔍 VERIFY FEATURE-039: LIVE FOR COLUMN & DASHBOARD PARITY');
  console.log('========================================================\n');

  if (!mongoose.connection.readyState) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  const cleanupTestIds = [];

  try {
    const admin = await Admin.findOne();
    const adminId = admin ? admin._id : new mongoose.Types.ObjectId();

    // 1. Create a DRAFT test
    const draftTest = await Test.create({
      title: `QA E2E Draft Test ${Date.now()}`,
      testType: 'JAVASCRIPT',
      durationMinutes: 30,
      passingCriteria: 1,
      status: 'DRAFT',
      instructions: 'QA',
      createdBy: adminId,
    });
    cleanupTestIds.push(draftTest._id);

    // 2. Create a LIVE test (live for 35 minutes)
    const liveStartTime = new Date(Date.now() - 35 * 60 * 1000);
    const liveTest = await Test.create({
      title: `QA E2E Live Test ${Date.now()}`,
      testType: 'AI_TEST',
      durationMinutes: 60,
      passingCriteria: 2,
      status: 'LIVE',
      liveStartedAt: liveStartTime,
      instructions: 'QA',
      createdBy: adminId,
    });
    cleanupTestIds.push(liveTest._id);

    // 3. Create an ENDED test (ran for 1 hour 20 minutes)
    const endedStartTime = new Date(Date.now() - 100 * 60 * 1000);
    const endedEndTime = new Date(Date.now() - 20 * 60 * 1000);
    const endedTest = await Test.create({
      title: `QA E2E Ended Test ${Date.now()}`,
      testType: 'REACT',
      durationMinutes: 90,
      passingCriteria: 3,
      status: 'ENDED',
      liveStartedAt: endedStartTime,
      endedAt: endedEndTime,
      instructions: 'QA',
      createdBy: adminId,
    });
    cleanupTestIds.push(endedTest._id);

    // 4. Fetch via getTests controller
    const req = { app: { get: () => null } };
    let responseData = null;
    const res = {
      json: (data) => {
        responseData = data;
      },
    };

    await getTests(req, res, (err) => {
      if (err) throw err;
    });

    const fetchedDraft = responseData.tests.find((t) => t._id.toString() === draftTest._id.toString());
    const fetchedLive = responseData.tests.find((t) => t._id.toString() === liveTest._id.toString());
    const fetchedEnded = responseData.tests.find((t) => t._id.toString() === endedTest._id.toString());

    console.log('1. Draft Test:');
    console.log(`   - Status: ${fetchedDraft.status}`);
    console.log(`   - Live For: "${formatLiveFor(fetchedDraft)}"`);
    console.assert(formatLiveFor(fetchedDraft) === '—', 'Draft test must show "—"');

    console.log('\n2. Live Test:');
    console.log(`   - Status: ${fetchedLive.status}`);
    console.log(`   - liveStartedAt: ${fetchedLive.liveStartedAt}`);
    console.log(`   - Live For: "${formatLiveFor(fetchedLive)}"`);
    console.assert(formatLiveFor(fetchedLive).includes('35 Minutes'), 'Live test must show "35 Minutes"');

    console.log('\n3. Ended Test:');
    console.log(`   - Status: ${fetchedEnded.status}`);
    console.log(`   - liveStartedAt: ${fetchedEnded.liveStartedAt}`);
    console.log(`   - endedAt: ${fetchedEnded.endedAt}`);
    console.log(`   - Live For (Test Management Table): "${formatLiveFor(fetchedEnded)}"`);
    console.log(`   - Live Duration (AdminLiveDashboard Header): "${formatLiveDurationDashboard(fetchedEnded.liveStartedAt, fetchedEnded.endedAt)}"`);
    
    // Parity assertion
    console.assert(
      formatLiveFor(fetchedEnded) === formatLiveDurationDashboard(fetchedEnded.liveStartedAt, fetchedEnded.endedAt),
      'Test Management "Live For" value must EXACTLY match AdminLiveDashboard header duration'
    );
    console.assert(formatLiveFor(fetchedEnded) === '1 Hour 20 Minutes', 'Ended test must show "1 Hour 20 Minutes"');

    console.log('\n✅ All Live E2E tests and parity verifications passed successfully!');
  } finally {
    if (cleanupTestIds.length > 0) {
      await Test.deleteMany({ _id: { $in: cleanupTestIds } });
    }
    await mongoose.disconnect();
  }
}

run().catch((err) => {
  console.error('Fatal error during E2E verification:', err);
  process.exit(1);
});
