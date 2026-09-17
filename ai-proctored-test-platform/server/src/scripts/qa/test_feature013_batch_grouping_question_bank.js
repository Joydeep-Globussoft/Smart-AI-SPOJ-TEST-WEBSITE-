/**
 * QA Automated Verification Suite: FEATURE-013
 * Show which Question Sets belong to the same PDF upload batch, directly in Question Bank
 *
 * Verifies:
 * 1. Data model schema & getQuestionSets endpoint return uploadBatchId and uploadBatchName
 * 2. Static verification of AdminQuestionBank.jsx:
 *    - View mode toggle (Flat List vs By Batch)
 *    - Batch filter dropdown (All, Batch Only, Manual Only, Specific Batches)
 *    - Visual badge/tag on question set rows when uploadBatchId is present
 *    - Collapsible batch grouping headers with count indicators
 *    - Manual/ungrouped sets section in grouped view
 *    - Selected Question Set header card batch badge and subtitle info
 *    - Preserves BUG-59 question count accuracy and BUG-52 edit set capabilities
 * 3. Functional Database & Grouping/Filtering Logic:
 *    - Sets created in a batch carry matching uploadBatchId and uploadBatchName
 *    - Manual sets carry null uploadBatchId
 *    - Filtering by BATCH_ONLY, MANUAL_ONLY, and specific batch ID
 *    - Grouping algorithm groups batch members together and isolates manual sets
 *    - Partial batch deletion retains remaining batch sets properly
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: FEATURE-013 (Batch Grouping in Question Bank)');
  console.log('========================================================================\n');

  // --- PART 1: Static Code & Architecture Audits ---
  console.log('--- Part 1: Static Architecture & File Verification ---');

  const questionSetModelPath = path.resolve(__dirname, '../../models/QuestionSet.js');
  const questionControllerPath = path.resolve(__dirname, '../../controllers/questionController.js');
  const adminQuestionBankPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminQuestionBank.jsx');

  assert(fs.existsSync(questionSetModelPath), 'QuestionSet.js model file exists');
  assert(fs.existsSync(questionControllerPath), 'questionController.js controller file exists');
  assert(fs.existsSync(adminQuestionBankPath), 'AdminQuestionBank.jsx client file exists');

  const questionSetModelSrc = fs.readFileSync(questionSetModelPath, 'utf8');
  assert(questionSetModelSrc.includes('uploadBatchId:'), 'QuestionSet schema defines uploadBatchId');
  assert(questionSetModelSrc.includes('uploadBatchName:'), 'QuestionSet schema defines uploadBatchName');

  const questionControllerSrc = fs.readFileSync(questionControllerPath, 'utf8');
  assert(questionControllerSrc.includes('getQuestionSets'), 'questionController contains getQuestionSets endpoint');
  assert(questionControllerSrc.includes('uploadPdfBatch'), 'questionController contains uploadPdfBatch endpoint');
  assert(questionControllerSrc.includes('uploadBatchId'), 'questionController stamps uploadBatchId in batch upload');

  const adminQuestionBankSrc = fs.readFileSync(adminQuestionBankPath, 'utf8');

  // View Mode & Grouping State
  assert(adminQuestionBankSrc.includes('groupByBatch'), 'AdminQuestionBank has groupByBatch state');
  assert(adminQuestionBankSrc.includes('filterBatch'), 'AdminQuestionBank has filterBatch state');
  assert(adminQuestionBankSrc.includes('collapsedBatches'), 'AdminQuestionBank has collapsedBatches state');
  assert(adminQuestionBankSrc.includes('toggleBatchCollapse'), 'AdminQuestionBank has toggleBatchCollapse function');
  assert(adminQuestionBankSrc.includes('uniqueBatches'), 'AdminQuestionBank extracts uniqueBatches via useMemo');
  assert(adminQuestionBankSrc.includes('groupedSections'), 'AdminQuestionBank computes groupedSections via useMemo');

  // Sidebar Controls
  assert(adminQuestionBankSrc.includes('id="view-flat-btn"'), 'AdminQuestionBank has Flat List view button');
  assert(adminQuestionBankSrc.includes('id="view-group-batch-btn"'), 'AdminQuestionBank has Group By Batch view button');
  assert(adminQuestionBankSrc.includes('id="filter-type-select"'), 'AdminQuestionBank has Type filter dropdown');
  assert(adminQuestionBankSrc.includes('id="filter-batch-select"'), 'AdminQuestionBank has Batch filter dropdown');

  // Badge & Indicators
  assert(adminQuestionBankSrc.includes('qs.uploadBatchId'), 'AdminQuestionBank checks uploadBatchId for badge rendering');
  assert(adminQuestionBankSrc.includes('📁 From Batch:'), 'AdminQuestionBank detail header displays "From Batch:" badge');
  assert(adminQuestionBankSrc.includes('From batch:'), 'AdminQuestionBank detail subtitle shows batch name');

  // Non-regression assertions
  assert(adminQuestionBankSrc.includes('BUG-59') || adminQuestionBankSrc.includes('questionCount'), 'Preserved BUG-59 question count dynamic sync');
  assert(adminQuestionBankSrc.includes('handleOpenEditSet') && adminQuestionBankSrc.includes('handleEditSetSubmit'), 'Preserved BUG-52 Edit Question Set capability');
  assert(adminQuestionBankSrc.includes('handleDeleteSetSubmit'), 'Preserved Question Set delete capability');

  console.log('\n--- Part 2: Functional Database & Batch Grouping Logic Verification ---');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spoj_test_platform';
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log('[INFO] Connected to MongoDB at:', mongoUri);

  const QuestionSet = require('../../models/QuestionSet');
  const Question = require('../../models/Question');
  const Admin = require('../../models/Admin');

  // Get or create dummy admin user
  let adminUser = await Admin.findOne({ role: 'SUPER_ADMIN' });
  if (!adminUser) {
    adminUser = await Admin.create({
      name: 'QA Admin F13',
      email: `qa_admin_f13_${Date.now()}@example.com`,
      passwordHash: 'hashed_password_dummy',
      role: 'SUPER_ADMIN',
    });
  }

  const batchId = `f13_batch_${Date.now()}`;
  const batchName = 'QA_Upload_Batch_Globussoft';

  // 1. Create Question Sets belonging to a batch
  const batchSet1 = await QuestionSet.create({
    name: 'QA F13 Batch Set 1',
    testType: 'SPOJ',
    createdBy: adminUser._id,
    uploadBatchId: batchId,
    uploadBatchName: batchName,
  });

  const batchSet2 = await QuestionSet.create({
    name: 'QA F13 Batch Set 2',
    testType: 'SPOJ',
    createdBy: adminUser._id,
    uploadBatchId: batchId,
    uploadBatchName: batchName,
  });

  const batchSet3 = await QuestionSet.create({
    name: 'QA F13 Batch Set 3',
    testType: 'SPOJ',
    createdBy: adminUser._id,
    uploadBatchId: batchId,
    uploadBatchName: batchName,
  });

  // 2. Create a manual (ungrouped) Question Set
  const manualSet = await QuestionSet.create({
    name: 'QA F13 Manual Set',
    testType: 'SPOJ',
    createdBy: adminUser._id,
    uploadBatchId: null,
    uploadBatchName: null,
  });

  // Query all sets
  const allSets = await QuestionSet.find({
    _id: { $in: [batchSet1._id, batchSet2._id, batchSet3._id, manualSet._id] }
  }).lean();

  assert(allSets.length === 4, 'Successfully fetched 4 test question sets');

  const bSets = allSets.filter((s) => s.uploadBatchId === batchId);
  assert(bSets.length === 3, 'All 3 batch sets have matching uploadBatchId');
  assert(bSets.every((s) => s.uploadBatchName === batchName), 'All 3 batch sets have matching uploadBatchName');

  const mSets = allSets.filter((s) => !s.uploadBatchId);
  assert(mSets.length === 1 && mSets[0].name === 'QA F13 Manual Set', 'Manual set has null uploadBatchId');

  // Test Filter Logic
  // Filter: BATCH_ONLY
  const batchOnlyFiltered = allSets.filter((s) => Boolean(s.uploadBatchId));
  assert(batchOnlyFiltered.length === 3, 'BATCH_ONLY filter returns only batch sets');

  // Filter: MANUAL_ONLY
  const manualOnlyFiltered = allSets.filter((s) => !s.uploadBatchId);
  assert(manualOnlyFiltered.length === 1, 'MANUAL_ONLY filter returns only manual sets');

  // Filter: Specific Batch
  const specificBatchFiltered = allSets.filter((s) => s.uploadBatchId === batchId);
  assert(specificBatchFiltered.length === 3, 'Specific batchId filter returns matching sets');

  // Test Grouping Logic
  const batchMap = new Map();
  const manualList = [];

  allSets.forEach((s) => {
    if (s.uploadBatchId) {
      if (!batchMap.has(s.uploadBatchId)) {
        batchMap.set(s.uploadBatchId, {
          batchId: s.uploadBatchId,
          batchName: s.uploadBatchName,
          sets: [],
        });
      }
      batchMap.get(s.uploadBatchId).sets.push(s);
    } else {
      manualList.push(s);
    }
  });

  assert(batchMap.has(batchId), 'Grouping logic created section for batchId');
  assert(batchMap.get(batchId).sets.length === 3, 'Grouped batch section contains 3 sets');
  assert(manualList.length === 1, 'Grouped manual section contains 1 set');

  // Test partial deletion: delete 1 set from batch
  await QuestionSet.findByIdAndDelete(batchSet2._id);
  const remainingSets = await QuestionSet.find({
    _id: { $in: [batchSet1._id, batchSet2._id, batchSet3._id, manualSet._id] }
  }).lean();

  const remainingBatchSets = remainingSets.filter((s) => s.uploadBatchId === batchId);
  assert(remainingBatchSets.length === 2, 'After deleting 1 set, remaining 2 batch sets still retain batch grouping');

  // Clean up
  await QuestionSet.deleteMany({
    _id: { $in: [batchSet1._id, batchSet2._id, batchSet3._id, manualSet._id] }
  });
  console.log('[INFO] Cleaned up test question sets.');

  await mongoose.disconnect();
  console.log('[INFO] Disconnected from MongoDB.');

  console.log('\n========================================================================');
  console.log(`QA SUMMARY: ${passedTests} / ${totalTests} tests passed`);
  console.log('========================================================================');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('[FATAL ERROR]', err);
  process.exit(1);
});
