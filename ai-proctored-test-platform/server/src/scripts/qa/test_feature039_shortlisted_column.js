/**
 * QA Test Suite for FEATURE-039:
 * Add "SHORTLISTED" Column to Tests Table Showing Total Qualified Candidates
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
const Shortlist = require('../../models/Shortlist');
const { getTests } = require('../../controllers/testController');

async function runFeature039Tests() {
  console.log('====================================================');
  console.log('🧪 QA TEST SUITE: FEATURE-039 SHORTLISTED COLUMN');
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

  check(adminTestsSrc.includes("{ id: 'shortlisted', label: 'Shortlisted' }"), 'SORT_FIELDS includes Shortlisted');
  check(adminTestsSrc.includes("if (s === 'shortlisted_asc' || s === 'shortlisted_desc') return 'shortlisted';"), 'activeSortField handles shortlisted sorting');
  check(adminTestsSrc.includes("if (activeSortField === 'shortlisted')"), 'currentSortSummaryLabel handles shortlisted label');
  check(adminTestsSrc.includes('Shortlisted</th>'), 'Table header includes Shortlisted column');
  check(adminTestsSrc.includes('getShortlistedInfo(test)'), 'Table row renders shortlisted info using getShortlistedInfo helper');
  check(adminTestsSrc.includes('colSpan={13}'), 'Empty state updated with colSpan={13} for the 13-column table');

  // Verify column ordering: Submissions -> Shortlisted -> Total Rooms -> Question Set
  const submissionsIndex = adminTestsSrc.indexOf('Submissions</th>');
  const shortlistedIndex = adminTestsSrc.indexOf('Shortlisted</th>');
  const totalRoomsIndex = adminTestsSrc.indexOf('Total Rooms</th>');
  const questionSetIndex = adminTestsSrc.indexOf('Question Set</th>');

  check(submissionsIndex !== -1 && shortlistedIndex !== -1 && totalRoomsIndex !== -1 && questionSetIndex !== -1, 'All adjacent headers exist in source');
  check(
    submissionsIndex < shortlistedIndex && shortlistedIndex < totalRoomsIndex && totalRoomsIndex < questionSetIndex,
    'Shortlisted is positioned strictly between Submissions and Total Rooms'
  );

  // Check helper function logic
  check(adminTestsSrc.includes('export const getShortlistedInfo = (test) => {'), 'getShortlistedInfo is exported and structured');
  check(adminTestsSrc.includes("display: '—'") && adminTestsSrc.includes("display: String(count)"), 'getShortlistedInfo handles both unavailable (—) and numeric counts');
  check(adminTestsSrc.includes("Shortlist Rate:"), 'getShortlistedInfo includes Shortlist Rate percentage in tooltip');

  // 2. Test Backend Logic against MongoDB
  if (!mongoose.connection.readyState) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  const cleanupIds = {
    testIds: [],
    roomIds: [],
    candidateIds: [],
    shortlistIds: [],
  };

  try {
    const adminId = new mongoose.Types.ObjectId();

    // Test 1: Draft Test (No Shortlist Generated) -> Should have shortlistedCount: null or isAvailable: false
    const draftTest = await Test.create({
      title: 'QA Draft Test 039 ' + Date.now(),
      testType: 'JAVASCRIPT',
      durationMinutes: 30,
      passingCriteria: 1,
      status: 'DRAFT',
      instructions: 'QA Instructions',
      createdBy: adminId,
    });
    cleanupIds.testIds.push(draftTest._id);

    // Test 2: Live Test (No Shortlist Generated) -> Should have shortlistedCount: null
    const liveTest = await Test.create({
      title: 'QA Live Test 039 ' + Date.now(),
      testType: 'JAVASCRIPT',
      durationMinutes: 45,
      passingCriteria: 2,
      status: 'LIVE',
      instructions: 'QA Instructions',
      createdBy: adminId,
    });
    cleanupIds.testIds.push(liveTest._id);

    // Test 3: Ended Test with 0 Shortlisted Candidates (Shortlist doc exists with 0 qualified)
    const endedZeroShortlistTest = await Test.create({
      title: 'QA Ended 0 Shortlisted Test 039 ' + Date.now(),
      testType: 'JAVASCRIPT',
      durationMinutes: 45,
      passingCriteria: 3,
      status: 'ENDED',
      instructions: 'QA Instructions',
      createdBy: adminId,
    });
    cleanupIds.testIds.push(endedZeroShortlistTest._id);

    const zeroSl = await Shortlist.create({
      testId: endedZeroShortlistTest._id,
      candidates: [],
      totalCandidates: 5,
      passingCriteria: 3,
      generatedAt: new Date(),
    });
    cleanupIds.shortlistIds.push(zeroSl._id);

    // Test 4: Ended Test with 3 Shortlisted Candidates (Official Shortlist has 3 candidates)
    const endedShortlistedTest = await Test.create({
      title: 'QA Ended 3 Shortlisted Test 039 ' + Date.now(),
      testType: 'JAVASCRIPT',
      durationMinutes: 60,
      passingCriteria: 2,
      status: 'ENDED',
      instructions: 'QA Instructions',
      createdBy: adminId,
    });
    cleanupIds.testIds.push(endedShortlistedTest._id);

    const c1 = new mongoose.Types.ObjectId();
    const c2 = new mongoose.Types.ObjectId();
    const c3 = new mongoose.Types.ObjectId();
    cleanupIds.candidateIds.push(c1, c2, c3);

    const slDoc = await Shortlist.create({
      testId: endedShortlistedTest._id,
      candidates: [
        { candidateId: c1, rank: 1, totalScore: 100, passCriteriaMet: true },
        { candidateId: c2, rank: 2, totalScore: 85, passCriteriaMet: true },
        { candidateId: c3, rank: 3, totalScore: 70, passCriteriaMet: true },
      ],
      totalCandidates: 10,
      passingCriteria: 2,
      generatedAt: new Date(),
    });
    cleanupIds.shortlistIds.push(slDoc._id);

    // Call getTests controller to test the API enrichment
    let jsonResult = null;
    const req = { user: { role: 'SUPER_ADMIN', _id: adminId } };
    const res = {
      json: (data) => {
        jsonResult = data;
      },
    };
    const next = (err) => {
      console.error('getTests error:', err);
    };

    await getTests(req, res, next);

    check(jsonResult && Array.isArray(jsonResult.tests), 'getTests returned array of tests');

    const testsMap = {};
    jsonResult.tests.forEach((t) => {
      testsMap[t._id.toString()] = t;
    });

    const resDraft = testsMap[draftTest._id.toString()];
    check(resDraft !== undefined, 'Draft test returned in getTests list');
    check(resDraft.shortlistedCount === null && !resDraft.hasShortlist, 'Draft test returns shortlistedCount: null and hasShortlist: false');

    const resLive = testsMap[liveTest._id.toString()];
    check(resLive !== undefined, 'Live test returned in getTests list');
    check(resLive.shortlistedCount === null && !resLive.hasShortlist, 'Live test returns shortlistedCount: null and hasShortlist: false');

    const resZero = testsMap[endedZeroShortlistTest._id.toString()];
    check(resZero !== undefined, 'Ended test with 0 shortlist returned');
    check(resZero.shortlistedCount === 0 && resZero.hasShortlist, 'Ended test with 0 candidates in Shortlist collection returns shortlistedCount: 0');

    const resThree = testsMap[endedShortlistedTest._id.toString()];
    check(resThree !== undefined, 'Ended test with 3 shortlist returned');
    check(resThree.shortlistedCount === 3 && resThree.hasShortlist, 'Ended test returns exact Shortlist candidate count (3)');

    // Test Shortlist Recalculation / Regeneration updates count
    await Shortlist.updateOne(
      { _id: slDoc._id },
      {
        $push: {
          candidates: { candidateId: new mongoose.Types.ObjectId(), rank: 4, totalScore: 60, passCriteriaMet: true },
        },
      }
    );

    let updatedJson = null;
    const resUpdate = {
      json: (data) => {
        updatedJson = data;
      },
    };
    await getTests(req, resUpdate, next);
    const updatedTest = updatedJson.tests.find((t) => t._id.toString() === endedShortlistedTest._id.toString());
    check(updatedTest.shortlistedCount === 4, 'Regenerated/updated shortlist immediately updates shortlistedCount to 4');

  } catch (err) {
    console.error('QA Test execution failed:', err);
    failed++;
  } finally {
    // Cleanup created test documents
    if (cleanupIds.testIds.length > 0) {
      await Test.deleteMany({ _id: { $in: cleanupIds.testIds } });
    }
    if (cleanupIds.shortlistIds.length > 0) {
      await Shortlist.deleteMany({ _id: { $in: cleanupIds.shortlistIds } });
    }
    await mongoose.disconnect();
  }

  console.log('\n====================================================');
  console.log(`📊 FEATURE-039 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runFeature039Tests();
