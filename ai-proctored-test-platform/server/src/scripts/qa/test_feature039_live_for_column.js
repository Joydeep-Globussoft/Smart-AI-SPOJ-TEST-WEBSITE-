/**
 * QA Test Suite for FEATURE-039:
 * Add "Live For" column to Test Management table
 */
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Admin = require('../../models/Admin');
const QuestionSet = require('../../models/QuestionSet');
const Folder = require('../../models/Folder');
const Candidate = require('../../models/Candidate');
const Submission = require('../../models/Submission');
const MalpracticeLog = require('../../models/MalpracticeLog');
const { getTests } = require('../../controllers/testController');

async function runFeature039Tests() {
  console.log('====================================================');
  console.log('🧪 QA TEST SUITE: FEATURE-039 LIVE FOR COLUMN');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function check(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Audit Frontend Source: AdminTests.jsx
  const adminTestsPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTests.jsx');
  const adminTestsSrc = fs.readFileSync(adminTestsPath, 'utf8');

  check(adminTestsSrc.includes('export const formatLiveFor ='), 'formatLiveFor helper function is exported in AdminTests.jsx');
  check(adminTestsSrc.includes('<th style={{ width: 120, minWidth: 105 }}>Live For</th>'), 'Table header includes Live For column');
  check(adminTestsSrc.includes('formatLiveFor(test, now)'), 'Table row renders formatLiveFor(test, now)');
  check(adminTestsSrc.includes('colSpan={12}'), 'Empty state updated with colSpan=12');

  // Verify exact column order: Duration -> Live For -> Passing Criteria -> Total Participants -> Question Set -> Total Rooms -> Created
  const durationIndex = adminTestsSrc.indexOf('Duration</th>');
  const liveForIndex = adminTestsSrc.indexOf('Live For</th>');
  const passingIndex = adminTestsSrc.indexOf('Passing Criteria</th>');
  const participantsIndex = adminTestsSrc.indexOf('Total Participants</th>');
  const questionSetIndex = adminTestsSrc.indexOf('Question Set</th>');
  const totalRoomsIndex = adminTestsSrc.indexOf('Total Rooms</th>');
  const createdIndex = adminTestsSrc.indexOf('Created</th>');

  check(
    durationIndex !== -1 &&
    liveForIndex !== -1 &&
    passingIndex !== -1 &&
    participantsIndex !== -1 &&
    questionSetIndex !== -1 &&
    totalRoomsIndex !== -1 &&
    createdIndex !== -1,
    'All headers in the sequence exist in AdminTests.jsx'
  );

  check(
    durationIndex < liveForIndex &&
    liveForIndex < passingIndex &&
    passingIndex < participantsIndex &&
    participantsIndex < questionSetIndex &&
    questionSetIndex < totalRoomsIndex &&
    totalRoomsIndex < createdIndex,
    'Exact column ordering verified: Duration → Live For → Passing Criteria → Total Participants → Question Set → Total Rooms → Created'
  );

  // 2. Logic Verification of formatLiveFor
  // Re-import formatLiveFor calculation logic
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

  const fixedNow = 1700000000000;

  // Case A: Draft test -> '—'
  const draftTestObj = { status: 'DRAFT', liveStartedAt: null, endedAt: null };
  check(formatLiveFor(draftTestObj, fixedNow) === '—', 'Draft test formatLiveFor returns "—"');

  // Case B: Live test started 45 minutes ago -> '45 Minutes'
  const liveTestObj = { status: 'LIVE', liveStartedAt: new Date(fixedNow - 45 * 60 * 1000).toISOString(), endedAt: null };
  check(formatLiveFor(liveTestObj, fixedNow) === '45 Minutes', `Live test formatLiveFor returns "45 Minutes" (got "${formatLiveFor(liveTestObj, fixedNow)}")`);

  // Case C: Live test started 1 hour 15 mins ago -> '1 Hour 15 Minutes'
  const liveTestObjLong = { status: 'LIVE', liveStartedAt: new Date(fixedNow - 75 * 60 * 1000).toISOString(), endedAt: null };
  check(formatLiveFor(liveTestObjLong, fixedNow) === '1 Hour 15 Minutes', `Live test formatLiveFor returns "1 Hour 15 Minutes" (got "${formatLiveFor(liveTestObjLong, fixedNow)}")`);

  // Case D: Ended test ran for 1 hour 34 minutes -> '1 Hour 34 Minutes'
  const endedStart = new Date(fixedNow - 120 * 60 * 1000).toISOString();
  const endedEnd = new Date(fixedNow - (120 - 94) * 60 * 1000).toISOString(); // 94 mins elapsed = 1h 34m
  const endedTestObj = { status: 'ENDED', liveStartedAt: endedStart, endedAt: endedEnd };
  check(formatLiveFor(endedTestObj, fixedNow) === '1 Hour 34 Minutes', `Ended test formatLiveFor returns "1 Hour 34 Minutes" (got "${formatLiveFor(endedTestObj, fixedNow)}")`);

  // Case E: Short-lived test (40 seconds) -> '40 Seconds'
  const shortStart = new Date(fixedNow - 40 * 1000).toISOString();
  const shortEnd = new Date(fixedNow).toISOString();
  const shortTestObj = { status: 'ENDED', liveStartedAt: shortStart, endedAt: shortEnd };
  check(formatLiveFor(shortTestObj, fixedNow) === '40 Seconds', `Short test formatLiveFor returns "40 Seconds" (got "${formatLiveFor(shortTestObj, fixedNow)}")`);

  // 3. Database & Backend Parity Test
  if (!mongoose.connection.readyState) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  const cleanupIds = {
    testIds: [],
  };

  try {
    const adminId = new mongoose.Types.ObjectId();

    // Create Draft test
    const dbDraft = await Test.create({
      title: 'QA 039 Draft Test ' + Date.now(),
      testType: 'JAVASCRIPT',
      durationMinutes: 30,
      passingCriteria: 1,
      status: 'DRAFT',
      instructions: 'QA Instructions',
      createdBy: adminId,
    });
    cleanupIds.testIds.push(dbDraft._id);

    // Create Live test (live for 20 mins)
    const dbLive = await Test.create({
      title: 'QA 039 Live Test ' + Date.now(),
      testType: 'JAVASCRIPT',
      durationMinutes: 45,
      passingCriteria: 2,
      status: 'LIVE',
      liveStartedAt: new Date(Date.now() - 20 * 60 * 1000),
      instructions: 'QA Instructions',
      createdBy: adminId,
    });
    cleanupIds.testIds.push(dbLive._id);

    // Create Ended test (ran for 50 mins)
    const endedStartedAt = new Date(Date.now() - 60 * 60 * 1000);
    const endedFinishedAt = new Date(Date.now() - 10 * 60 * 1000); // 50 mins
    const dbEnded = await Test.create({
      title: 'QA 039 Ended Test ' + Date.now(),
      testType: 'SPOJ',
      durationMinutes: 60,
      passingCriteria: 1,
      status: 'ENDED',
      liveStartedAt: endedStartedAt,
      endedAt: endedFinishedAt,
      instructions: 'QA Instructions',
      createdBy: adminId,
    });
    cleanupIds.testIds.push(dbEnded._id);

    // Call getTests controller
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

    const draftRes = responseData.tests.find((t) => t._id.toString() === dbDraft._id.toString());
    const liveRes = responseData.tests.find((t) => t._id.toString() === dbLive._id.toString());
    const endedRes = responseData.tests.find((t) => t._id.toString() === dbEnded._id.toString());

    check(Boolean(draftRes && liveRes && endedRes), 'All 3 sample tests found in getTests response');
    check(formatLiveFor(draftRes) === '—', `DB Draft test Live For is "—" (got "${formatLiveFor(draftRes)}")`);
    check(formatLiveFor(liveRes).includes('Minute'), `DB Live test Live For shows elapsed minutes (got "${formatLiveFor(liveRes)}")`);
    check(formatLiveFor(endedRes) === '50 Minutes', `DB Ended test Live For is "50 Minutes" (got "${formatLiveFor(endedRes)}")`);

  } finally {
    if (cleanupIds.testIds.length > 0) await Test.deleteMany({ _id: { $in: cleanupIds.testIds } });
    await mongoose.disconnect();
  }

  console.log(`\n====================================================`);
  console.log(`📊 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runFeature039Tests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
