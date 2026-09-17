/**
 * QA Automated Verification Suite: FEATURE-013 REVISION
 * Cascading Folder Deletion with Strict Test Dependency Safeguards
 * 
 * Rules:
 * 1. A folder CAN be deleted in one action (cascading - deleting folder, all sets, questions, unshared PDF assets)
 *    IF AND ONLY IF none of its sets or the folder itself are referenced by any Test (DRAFT, SCHEDULED, LIVE, or ENDED).
 * 2. If ANY set or the folder is referenced by ANY Test, block deletion entirely (all-or-nothing)
 *    and return clear error details listing all referencing test titles and statuses.
 * 3. Empty folders (0 sets) delete immediately when unreferenced.
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

// Helper to simulate express req, res, next for controller methods
function createMockReqRes(params = {}, body = {}, query = {}, user = { id: 'admin123' }) {
  const req = { params, body, query, user };
  let statusCode = 200;
  let jsonResponse = null;

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      jsonResponse = data;
      return this;
    },
  };

  const next = (err) => {
    if (err) throw err;
  };

  return { req, res, getStatus: () => statusCode, getJson: () => jsonResponse, next };
}

async function runTests() {
  console.log('========================================================================');
  console.log('QA VERIFICATION SUITE: FEATURE-013 REVISION (Cascading Folder Deletion)');
  console.log('========================================================================\n');

  // --- PART 1: Static Architecture & File Verification ---
  console.log('--- Part 1: Static Architecture & File Verification ---');

  const pdfStorageServicePath = path.resolve(__dirname, '../../services/pdfStorageService.js');
  const folderControllerPath = path.resolve(__dirname, '../../controllers/folderController.js');
  const adminQuestionBankPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminQuestionBank.jsx');

  assert(fs.existsSync(pdfStorageServicePath), 'pdfStorageService.js exists');
  assert(fs.existsSync(folderControllerPath), 'folderController.js exists');
  assert(fs.existsSync(adminQuestionBankPath), 'AdminQuestionBank.jsx exists');

  const pdfStorageSrc = fs.readFileSync(pdfStorageServicePath, 'utf8');
  assert(pdfStorageSrc.includes('deletePdfAsset'), 'pdfStorageService exports deletePdfAsset');
  assert(pdfStorageSrc.includes('fs.unlinkSync') || pdfStorageSrc.includes('unlink'), 'pdfStorageService deletes from disk cache');
  assert(pdfStorageSrc.includes('PdfAsset.deleteMany'), 'pdfStorageService deletes from Mongo Atlas PdfAsset');

  const folderControllerSrc = fs.readFileSync(folderControllerPath, 'utf8');
  assert(folderControllerSrc.includes('pdfStorageService'), 'folderController imports pdfStorageService');
  assert(folderControllerSrc.includes('folderId') && folderControllerSrc.includes('questionSetPoolId'), 'deleteFolder checks folderId and questionSetPoolId');
  assert(folderControllerSrc.includes('questionSetId: { $in: setIds }'), 'deleteFolder checks legacy questionSetId fallback across all child sets');
  assert(folderControllerSrc.includes('Question.deleteMany'), 'deleteFolder cascades to Question collection');
  assert(folderControllerSrc.includes('QuestionSet.deleteMany'), 'deleteFolder cascades to QuestionSet collection');

  const adminQBankSrc = fs.readFileSync(adminQuestionBankPath, 'utf8');
  assert(adminQBankSrc.includes('deleteFolderError'), 'AdminQuestionBank defines deleteFolderError state');
  assert(adminQBankSrc.includes('Cascading Deletion Warning'), 'AdminQuestionBank displays cascading deletion warning for non-empty folders');
  assert(!adminQBankSrc.includes('Folders with question sets cannot be deleted'), 'AdminQuestionBank removed old unconditional block message');

  // --- PART 2: Database Live Execution Tests ---
  console.log('\n--- Part 2: Database Live Execution Tests ---');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spoj_test_db';
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log('Connected to MongoDB for live validation.');

  const Folder = require('../../models/Folder');
  const QuestionSet = require('../../models/QuestionSet');
  const Question = require('../../models/Question');
  const Test = require('../../models/Test');
  const Admin = require('../../models/Admin');
  const PdfAsset = require('../../models/PdfAsset');
  const pdfStorageService = require('../../services/pdfStorageService');
  const { deleteFolder } = require('../../controllers/folderController');

  let admin = await Admin.findOne({ email: 'qa_feature013_cascade_admin@spoj.test' });
  if (!admin) {
    admin = await Admin.create({
      name: 'QA Cascade Admin',
      email: 'qa_feature013_cascade_admin@spoj.test',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
      role: 'ADMIN',
    });
  }

  // TEST CASE 1: Empty Folder Deletion
  console.log('\n--- Test 1: Empty Folder Deletion ---');
  const emptyFolder = await Folder.create({
    name: 'QA Empty Folder',
    testType: 'SPOJ',
    description: 'Empty folder test',
    createdBy: admin._id,
  });

  const mockReqRes1 = createMockReqRes({ id: emptyFolder._id.toString() }, {}, {}, { id: admin._id });
  await deleteFolder(mockReqRes1.req, mockReqRes1.res, mockReqRes1.next);

  assert(mockReqRes1.getStatus() === 200, 'Empty folder deletes with HTTP 200');
  const emptyFolderInDb = await Folder.findById(emptyFolder._id);
  assert(emptyFolderInDb === null, 'Empty folder is completely removed from DB');

  // TEST CASE 2: Unreferenced Non-Empty Folder Cascading Deletion (with Questions & PDF Assets)
  console.log('\n--- Test 2: Unreferenced Non-Empty Folder Cascading Deletion ---');
  const cascadeFolder = await Folder.create({
    name: 'QA Cascading Folder Alpha',
    testType: 'SPOJ',
    description: 'Folder with 2 sets and PDF questions',
    createdBy: admin._id,
  });

  const setA1 = await QuestionSet.create({
    name: 'Alpha Set 1',
    folderId: cascadeFolder._id,
    testType: 'SPOJ',
    createdBy: admin._id,
  });
  const setA2 = await QuestionSet.create({
    name: 'Alpha Set 2',
    folderId: cascadeFolder._id,
    testType: 'SPOJ',
    createdBy: admin._id,
  });

  // Create mock PDF assets
  const pdfFile1 = `qa_cascade_unique_pdf_1_${Date.now()}.pdf`;
  const pdfFile2 = `qa_cascade_unique_pdf_2_${Date.now()}.pdf`;
  await pdfStorageService.savePdfAsset(pdfFile1, 'orig1.pdf', Buffer.from('%PDF-1.4 Mock PDF 1 Content'), admin._id);
  await pdfStorageService.savePdfAsset(pdfFile2, 'orig2.pdf', Buffer.from('%PDF-1.4 Mock PDF 2 Content'), admin._id);

  const qA1 = await Question.create({
    title: 'Alpha 1 Q1 (PDF)',
    description: 'Desc',
    difficulty: 'EASY',
    testType: 'SPOJ',
    questionSetId: setA1._id,
    isPdfImported: true,
    pdfFileName: pdfFile1,
    pdfOriginalName: 'orig1.pdf',
    visibleTestCases: [{ input: '1', expectedOutput: '1' }],
  });
  const qA2 = await Question.create({
    title: 'Alpha 1 Q2',
    description: 'Desc',
    difficulty: 'MEDIUM',
    testType: 'SPOJ',
    questionSetId: setA1._id,
    visibleTestCases: [{ input: '2', expectedOutput: '2' }],
  });
  const qA3 = await Question.create({
    title: 'Alpha 2 Q1 (PDF)',
    description: 'Desc',
    difficulty: 'EASY',
    testType: 'SPOJ',
    questionSetId: setA2._id,
    isPdfImported: true,
    pdfFileName: pdfFile2,
    pdfOriginalName: 'orig2.pdf',
    visibleTestCases: [{ input: '3', expectedOutput: '3' }],
  });

  const mockReqRes2 = createMockReqRes({ id: cascadeFolder._id.toString() }, {}, {}, { id: admin._id });
  await deleteFolder(mockReqRes2.req, mockReqRes2.res, mockReqRes2.next);

  assert(mockReqRes2.getStatus() === 200, 'Cascading folder deletes with HTTP 200');
  assert(mockReqRes2.getJson()?.deletedSetsCount === 2, 'Response indicates 2 deleted Question Sets');
  assert(mockReqRes2.getJson()?.deletedQuestionsCount === 3, 'Response indicates 3 deleted Questions');

  const checkFolder = await Folder.findById(cascadeFolder._id);
  const checkSets = await QuestionSet.find({ folderId: cascadeFolder._id });
  const checkQuestions = await Question.find({ _id: { $in: [qA1._id, qA2._id, qA3._id] } });
  const checkPdf1 = await PdfAsset.findOne({ fileName: pdfFile1 });
  const checkPdf2 = await PdfAsset.findOne({ fileName: pdfFile2 });

  assert(checkFolder === null, 'Folder is deleted from DB');
  assert(checkSets.length === 0, 'All Question Sets in folder are deleted from DB');
  assert(checkQuestions.length === 0, 'All Questions in sets are deleted from DB');
  assert(checkPdf1 === null && checkPdf2 === null, 'All associated PDF assets are cleaned up from DB');

  // TEST CASE 3: Shared PDF Asset Preservation
  console.log('\n--- Test 3: Shared PDF Asset Preservation across Folders ---');
  const sharedPdfFile = `qa_shared_pdf_${Date.now()}.pdf`;
  await pdfStorageService.savePdfAsset(sharedPdfFile, 'shared.pdf', Buffer.from('%PDF-1.4 Mock Shared PDF Content'), admin._id);

  const folderX = await Folder.create({ name: 'Folder X', testType: 'SPOJ', createdBy: admin._id });
  const setX = await QuestionSet.create({ name: 'Set X', folderId: folderX._id, testType: 'SPOJ', createdBy: admin._id });
  const qX = await Question.create({
    title: 'QX',
    testType: 'SPOJ',
    questionSetId: setX._id,
    isPdfImported: true,
    pdfFileName: sharedPdfFile,
    pdfOriginalName: 'shared.pdf',
  });

  const folderY = await Folder.create({ name: 'Folder Y', testType: 'SPOJ', createdBy: admin._id });
  const setY = await QuestionSet.create({ name: 'Set Y', folderId: folderY._id, testType: 'SPOJ', createdBy: admin._id });
  const qY = await Question.create({
    title: 'QY',
    testType: 'SPOJ',
    questionSetId: setY._id,
    isPdfImported: true,
    pdfFileName: sharedPdfFile,
    pdfOriginalName: 'shared.pdf',
  });

  // Delete Folder X
  const mockReqRes3 = createMockReqRes({ id: folderX._id.toString() }, {}, {}, { id: admin._id });
  await deleteFolder(mockReqRes3.req, mockReqRes3.res, mockReqRes3.next);

  assert(mockReqRes3.getStatus() === 200, 'Folder X deletes with HTTP 200');
  const checkSharedPdf = await PdfAsset.findOne({ fileName: sharedPdfFile });
  assert(checkSharedPdf !== null, 'Shared PDF asset was PRESERVED because Question Y in Folder Y still references it');

  // Cleanup Folder Y
  const mockReqRes3b = createMockReqRes({ id: folderY._id.toString() }, {}, {}, { id: admin._id });
  await deleteFolder(mockReqRes3b.req, mockReqRes3b.res, mockReqRes3b.next);
  const checkSharedPdfAfterY = await PdfAsset.findOne({ fileName: sharedPdfFile });
  assert(checkSharedPdfAfterY === null, 'Shared PDF asset cleaned up once Folder Y (last reference) is deleted');

  // TEST CASE 4: Dependency Blocking on DRAFT Test referencing folderId
  console.log('\n--- Test 4: Dependency Blocking on DRAFT Test ---');
  const folderDraft = await Folder.create({ name: 'Draft Ref Folder', testType: 'SPOJ', createdBy: admin._id });
  const setDraft = await QuestionSet.create({ name: 'Draft Set 1', folderId: folderDraft._id, testType: 'SPOJ', createdBy: admin._id });
  const testDraft = await Test.create({
    title: 'QA Draft Assessment',
    testType: 'SPOJ',
    folderId: folderDraft._id,
    questionSetPoolId: folderDraft._id.toString(),
    durationMinutes: 45,
    totalQuestions: 2,
    passingCriteria: 1,
    instructions: 'Instructions',
    status: 'DRAFT',
    createdBy: admin._id,
  });

  const mockReqRes4 = createMockReqRes({ id: folderDraft._id.toString() }, {}, {}, { id: admin._id });
  await deleteFolder(mockReqRes4.req, mockReqRes4.res, mockReqRes4.next);

  assert(mockReqRes4.getStatus() === 400, 'Deletion blocked with HTTP 400 when referenced by DRAFT test');
  assert(mockReqRes4.getJson()?.error.includes('QA Draft Assessment') && mockReqRes4.getJson()?.error.includes('(DRAFT)'), 'Error message includes Test title and (DRAFT) status');
  const checkFolderDraft = await Folder.findById(folderDraft._id);
  assert(checkFolderDraft !== null, 'Folder still exists in DB (not deleted)');

  // TEST CASE 5: Dependency Blocking on LIVE Test
  console.log('\n--- Test 5: Dependency Blocking on LIVE Test ---');
  const folderLive = await Folder.create({ name: 'Live Ref Folder', testType: 'SPOJ', createdBy: admin._id });
  const setLive = await QuestionSet.create({ name: 'Live Set 1', folderId: folderLive._id, testType: 'SPOJ', createdBy: admin._id });
  const testLive = await Test.create({
    title: 'QA GTA Live Challenge',
    testType: 'SPOJ',
    folderId: folderLive._id,
    questionSetPoolId: folderLive._id.toString(),
    durationMinutes: 60,
    totalQuestions: 2,
    passingCriteria: 1,
    instructions: 'Instructions',
    status: 'LIVE',
    createdBy: admin._id,
  });

  const mockReqRes5 = createMockReqRes({ id: folderLive._id.toString() }, {}, {}, { id: admin._id });
  await deleteFolder(mockReqRes5.req, mockReqRes5.res, mockReqRes5.next);

  assert(mockReqRes5.getStatus() === 400, 'Deletion blocked with HTTP 400 when referenced by LIVE test');
  assert(mockReqRes5.getJson()?.error.includes('QA GTA Live Challenge') && mockReqRes5.getJson()?.error.includes('(LIVE)'), 'Error message includes Test title and (LIVE) status');

  // TEST CASE 6: Dependency Blocking on ENDED Test referencing legacy questionSetId
  console.log('\n--- Test 6: Dependency Blocking on ENDED Test via legacy questionSetId fallback ---');
  const folderEnded = await Folder.create({ name: 'Ended Legacy Folder', testType: 'SPOJ', createdBy: admin._id });
  const setEnded1 = await QuestionSet.create({ name: 'Ended Set 1', folderId: folderEnded._id, testType: 'SPOJ', createdBy: admin._id });
  const setEnded2 = await QuestionSet.create({ name: 'Ended Set 2', folderId: folderEnded._id, testType: 'SPOJ', createdBy: admin._id });

  // Test created with legacy questionSetId pointing to setEnded1 (folderId is null on legacy test)
  const testEnded = await Test.create({
    title: 'QA Hiring Drive 2025',
    testType: 'SPOJ',
    questionSetId: setEnded1._id,
    folderId: null,
    durationMinutes: 90,
    totalQuestions: 2,
    passingCriteria: 1,
    instructions: 'Instructions',
    status: 'ENDED',
    createdBy: admin._id,
  });

  const mockReqRes6 = createMockReqRes({ id: folderEnded._id.toString() }, {}, {}, { id: admin._id });
  await deleteFolder(mockReqRes6.req, mockReqRes6.res, mockReqRes6.next);

  assert(mockReqRes6.getStatus() === 400, 'Deletion blocked with HTTP 400 when set is referenced by ENDED test via legacy questionSetId');
  assert(mockReqRes6.getJson()?.error.includes('QA Hiring Drive 2025') && mockReqRes6.getJson()?.error.includes('(ENDED)'), 'Error message includes Test title and (ENDED) status');
  
  // Verify all-or-nothing protection: Neither setEnded1 nor setEnded2 nor folderEnded was deleted
  const checkFolderEnded = await Folder.findById(folderEnded._id);
  const checkSetEnded1 = await QuestionSet.findById(setEnded1._id);
  const checkSetEnded2 = await QuestionSet.findById(setEnded2._id);
  assert(checkFolderEnded !== null, 'Folder was NOT deleted');
  assert(checkSetEnded1 !== null, 'Set 1 (directly referenced) was NOT deleted');
  assert(checkSetEnded2 !== null, 'Set 2 (unreferenced sibling in same folder) was NOT partially deleted');

  // TEST CASE 7: Multiple Tests referencing Folder/Sets across different statuses
  console.log('\n--- Test 7: Multiple Dependent Tests Reporting ---');
  const folderMulti = await Folder.create({ name: 'Multi Dependency Folder', testType: 'SPOJ', createdBy: admin._id });
  const setMulti1 = await QuestionSet.create({ name: 'Multi Set 1', folderId: folderMulti._id, testType: 'SPOJ', createdBy: admin._id });
  const setMulti2 = await QuestionSet.create({ name: 'Multi Set 2', folderId: folderMulti._id, testType: 'SPOJ', createdBy: admin._id });

  const testM1 = await Test.create({
    title: 'Test Alpha Multi',
    testType: 'SPOJ',
    folderId: folderMulti._id,
    durationMinutes: 30,
    totalQuestions: 1,
    passingCriteria: 1,
    instructions: 'Ins',
    status: 'DRAFT',
    createdBy: admin._id,
  });
  const testM2 = await Test.create({
    title: 'Test Beta Multi',
    testType: 'SPOJ',
    folderId: folderMulti._id,
    durationMinutes: 30,
    totalQuestions: 1,
    passingCriteria: 1,
    instructions: 'Ins',
    status: 'LIVE',
    createdBy: admin._id,
  });
  const testM3 = await Test.create({
    title: 'Test Gamma Multi',
    testType: 'SPOJ',
    questionSetId: setMulti2._id,
    durationMinutes: 30,
    totalQuestions: 1,
    passingCriteria: 1,
    instructions: 'Ins',
    status: 'ENDED',
    createdBy: admin._id,
  });

  const mockReqRes7 = createMockReqRes({ id: folderMulti._id.toString() }, {}, {}, { id: admin._id });
  await deleteFolder(mockReqRes7.req, mockReqRes7.res, mockReqRes7.next);

  assert(mockReqRes7.getStatus() === 400, 'Deletion blocked with HTTP 400 when multiple tests depend on folder/sets');
  const errText = mockReqRes7.getJson()?.error || '';
  assert(errText.includes('"Test Alpha Multi" (DRAFT)'), 'Error lists Test Alpha Multi (DRAFT)');
  assert(errText.includes('"Test Beta Multi" (LIVE)'), 'Error lists Test Beta Multi (LIVE)');
  assert(errText.includes('"Test Gamma Multi" (ENDED)'), 'Error lists Test Gamma Multi (ENDED)');
  assert(mockReqRes7.getJson()?.referencingTests?.length === 3, 'Response includes referencingTests array with 3 items');

  // TEST CASE 8: Deletion succeeds once all referencing tests are deleted/reassigned
  console.log('\n--- Test 8: Unblocked Deletion after Test Deletions ---');
  await Test.deleteMany({ _id: { $in: [testM1._id, testM2._id, testM3._id] } });

  const mockReqRes8 = createMockReqRes({ id: folderMulti._id.toString() }, {}, {}, { id: admin._id });
  await deleteFolder(mockReqRes8.req, mockReqRes8.res, mockReqRes8.next);

  assert(mockReqRes8.getStatus() === 200, 'Folder deletion succeeds with HTTP 200 after all referencing tests are removed');
  const checkFolderMulti = await Folder.findById(folderMulti._id);
  const checkSetsMulti = await QuestionSet.find({ folderId: folderMulti._id });
  assert(checkFolderMulti === null && checkSetsMulti.length === 0, 'Folder and all child sets cleanly cascading-deleted');

  // Clean up remaining test fixtures
  console.log('\n--- Cleaning up QA Test Fixtures ---');
  await Test.deleteMany({ _id: { $in: [testDraft._id, testLive._id, testEnded._id] } });
  await QuestionSet.deleteMany({ folderId: { $in: [folderDraft._id, folderLive._id, folderEnded._id] } });
  await Folder.deleteMany({ _id: { $in: [folderDraft._id, folderLive._id, folderEnded._id] } });

  console.log('\n========================================================================');
  console.log(`QA VERIFICATION SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('========================================================================\n');

  await mongoose.disconnect();

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('[FATAL ERROR IN QA SUITE]:', err);
  process.exit(1);
});
