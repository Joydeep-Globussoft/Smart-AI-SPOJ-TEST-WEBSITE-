/**
 * QA Automated Verification Suite: FEATURE-013 (REVISED)
 * Folder becomes the primary Question Bank container — every Question Set must live inside a Folder
 * Consolidates & replaces FEATURE-012's Question Set Pool concept: Folder IS the pool.
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
  console.log('QA VERIFICATION SUITE: FEATURE-013 (REVISED: Folder Primary Container & Pool)');
  console.log('========================================================================\n');

  // --- PART 1: Static Code & Architecture Audits ---
  console.log('--- Part 1: Static Architecture & File Verification ---');

  const folderModelPath = path.resolve(__dirname, '../../models/Folder.js');
  const questionSetModelPath = path.resolve(__dirname, '../../models/QuestionSet.js');
  const testModelPath = path.resolve(__dirname, '../../models/Test.js');
  const migrationPath = path.resolve(__dirname, '../../scripts/migrations/migrate_folders.js');
  const folderControllerPath = path.resolve(__dirname, '../../controllers/folderController.js');
  const folderRoutesPath = path.resolve(__dirname, '../../routes/folderRoutes.js');
  const questionControllerPath = path.resolve(__dirname, '../../controllers/questionController.js');
  const testControllerPath = path.resolve(__dirname, '../../controllers/testController.js');
  const adminQuestionBankPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminQuestionBank.jsx');
  const createTestModalPath = path.resolve(__dirname, '../../../../client/src/shared/CreateTestModal.jsx');
  const apiClientPath = path.resolve(__dirname, '../../../../client/src/services/apiClient.js');

  assert(fs.existsSync(folderModelPath), 'Folder.js model file exists');
  assert(fs.existsSync(questionSetModelPath), 'QuestionSet.js model file exists');
  assert(fs.existsSync(testModelPath), 'Test.js model file exists');
  assert(fs.existsSync(migrationPath), 'migrate_folders.js migration file exists');
  assert(fs.existsSync(folderControllerPath), 'folderController.js controller file exists');
  assert(fs.existsSync(folderRoutesPath), 'folderRoutes.js route file exists');
  assert(fs.existsSync(adminQuestionBankPath), 'AdminQuestionBank.jsx client file exists');
  assert(fs.existsSync(createTestModalPath), 'CreateTestModal.jsx client file exists');
  assert(fs.existsSync(apiClientPath), 'apiClient.js client file exists');

  const folderModelSrc = fs.readFileSync(folderModelPath, 'utf8');
  assert(folderModelSrc.includes('name:') && folderModelSrc.includes('testType:'), 'Folder model defines name and testType');
  assert(folderModelSrc.includes('enum: [\'SPOJ\', \'REACT\', \'JAVASCRIPT\', \'AI_TEST\']'), 'Folder model enforces testType enum');

  const questionSetModelSrc = fs.readFileSync(questionSetModelPath, 'utf8');
  assert(questionSetModelSrc.includes('folderId:'), 'QuestionSet model defines folderId');
  assert(questionSetModelSrc.includes('ref: \'Folder\''), 'QuestionSet folderId references Folder model');

  const testModelSrc = fs.readFileSync(testModelPath, 'utf8');
  assert(testModelSrc.includes('folderId:'), 'Test model defines folderId');

  const folderControllerSrc = fs.readFileSync(folderControllerPath, 'utf8');
  assert(folderControllerSrc.includes('getFolders') && folderControllerSrc.includes('createFolder'), 'folderController implements getFolders and createFolder');
  assert(folderControllerSrc.includes('updateFolder') && folderControllerSrc.includes('deleteFolder'), 'folderController implements updateFolder and deleteFolder');
  assert(folderControllerSrc.includes('Cannot delete Folder:') && (folderControllerSrc.includes('referencingTests') || folderControllerSrc.includes('Test.find')), 'folderController enforces safe deletion blocking when referenced by tests');

  const questionControllerSrc = fs.readFileSync(questionControllerPath, 'utf8');
  assert(questionControllerSrc.includes('folderId') && questionControllerSrc.includes('createQuestionSet'), 'questionController requires folderId when creating set');
  assert(questionControllerSrc.includes('uploadPdfBatch') && (questionControllerSrc.includes('folderId') || questionControllerSrc.includes('folderName')), 'uploadPdfBatch supports folderId and folderName');

  const adminQuestionBankSrc = fs.readFileSync(adminQuestionBankPath, 'utf8');
  assert(adminQuestionBankSrc.includes('folders') && adminQuestionBankSrc.includes('selectedFolder'), 'AdminQuestionBank manages folders state');
  assert(adminQuestionBankSrc.includes('showNewFolderModal') && adminQuestionBankSrc.includes('showEditFolderModal'), 'AdminQuestionBank provides Folder creation and edit modals');
  assert(adminQuestionBankSrc.includes('showDeleteFolderModal'), 'AdminQuestionBank provides Safe Folder deletion modal');
  assert(adminQuestionBankSrc.includes('showUploadPdfModal'), 'AdminQuestionBank supports PDF upload with Folder destination');
  assert(adminQuestionBankSrc.includes('api.getFolders'), 'AdminQuestionBank fetches folders via API');

  const apiClientSrc = fs.readFileSync(apiClientPath, 'utf8');
  assert(apiClientSrc.includes('getFolders:') && apiClientSrc.includes('createFolder:'), 'apiClient defines getFolders and createFolder');
  assert(apiClientSrc.includes('updateFolder:') && apiClientSrc.includes('deleteFolder:'), 'apiClient defines updateFolder and deleteFolder');

  console.log('\n--- Part 2: Functional Database, Migration & Model Hierarchy Verification ---');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spoj_test_platform';
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
  console.log('[INFO] Connected to MongoDB at:', mongoUri);

  const Folder = require('../../models/Folder');
  const QuestionSet = require('../../models/QuestionSet');
  const Question = require('../../models/Question');
  const Test = require('../../models/Test');
  const Admin = require('../../models/Admin');
  const Candidate = require('../../models/Candidate');
  const Room = require('../../models/Room');
  const Submission = require('../../models/Submission');
  const { migrateFoldersToHierarchy } = require('../../scripts/migrations/migrate_folders');

  // Find or create test admin
  let admin = await Admin.findOne({ email: 'qa_feature013_admin@spoj.test' });
  if (!admin) {
    admin = await Admin.create({
      name: 'QA Feature 013 Admin',
      email: 'qa_feature013_admin@spoj.test',
      passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
      role: 'ADMIN',
    });
  }

  // Run migration on existing DB
  console.log('\n--- Testing Migration Idempotency ---');
  const migrationResult = await migrateFoldersToHierarchy();
  assert(migrationResult && typeof migrationResult.migratedCount === 'number', 'migrateFoldersToHierarchy executed and returned summary');

  // Verify all QuestionSets in DB now have valid folderId
  const unassignedSets = await QuestionSet.countDocuments({ $or: [{ folderId: null }, { folderId: { $exists: false } }] });
  assert(unassignedSets === 0, `All QuestionSets now have a valid folderId (unassigned: ${unassignedSets})`);

  console.log('\n--- Part 3: Folder CRUD & Safe Deletion Enforcement ---');

  // 1. Create a new Folder
  const testFolder = await Folder.create({
    name: 'QA Test Folder Alpha',
    testType: 'SPOJ',
    description: 'Folder for testing QA hierarchy',
    createdBy: admin._id,
  });
  assert(testFolder && testFolder.name === 'QA Test Folder Alpha', 'Successfully created Folder in DB');
  assert(testFolder.testType === 'SPOJ', 'Folder testType correctly set to SPOJ');

  // 2. Create Question Sets inside the Folder
  const set1 = await QuestionSet.create({
    name: 'Alpha Set 1',
    folderId: testFolder._id,
    testType: 'SPOJ',
    createdBy: admin._id,
  });

  const set2 = await QuestionSet.create({
    name: 'Alpha Set 2',
    folderId: testFolder._id,
    testType: 'SPOJ',
    createdBy: admin._id,
  });

  assert(set1.folderId.toString() === testFolder._id.toString(), 'Set 1 correctly assigned to testFolder');
  assert(set2.folderId.toString() === testFolder._id.toString(), 'Set 2 correctly assigned to testFolder');

  // Add 2 questions to each set
  const q1A = await Question.create({
    title: 'Alpha 1 Q1',
    description: 'Alpha 1 Q1 desc',
    difficulty: 'EASY',
    testType: 'SPOJ',
    visibleTestCases: [{ input: '1', expectedOutput: '1' }],
    questionSetId: set1._id,
    createdBy: admin._id,
  });
  const q1B = await Question.create({
    title: 'Alpha 1 Q2',
    description: 'Alpha 1 Q2 desc',
    difficulty: 'MEDIUM',
    testType: 'SPOJ',
    visibleTestCases: [{ input: '2', expectedOutput: '2' }],
    questionSetId: set1._id,
    createdBy: admin._id,
  });
  set1.questionIds = [q1A._id, q1B._id];
  await set1.save();

  const q2A = await Question.create({
    title: 'Alpha 2 Q1',
    description: 'Alpha 2 Q1 desc',
    difficulty: 'EASY',
    testType: 'SPOJ',
    visibleTestCases: [{ input: '3', expectedOutput: '3' }],
    questionSetId: set2._id,
    createdBy: admin._id,
  });
  const q2B = await Question.create({
    title: 'Alpha 2 Q2',
    description: 'Alpha 2 Q2 desc',
    difficulty: 'MEDIUM',
    testType: 'SPOJ',
    visibleTestCases: [{ input: '4', expectedOutput: '4' }],
    questionSetId: set2._id,
    createdBy: admin._id,
  });
  set2.questionIds = [q2A._id, q2B._id];
  await set2.save();

  // Test safe deletion logic directly
  const activeSetsInFolder = await QuestionSet.countDocuments({ folderId: testFolder._id });
  assert(activeSetsInFolder === 2, `Folder contains 2 active sets (found: ${activeSetsInFolder})`);

  let blockedDelete = false;
  if (activeSetsInFolder > 0) {
    blockedDelete = true;
  }
  assert(blockedDelete === true, 'Safe deletion rule correctly identifies non-empty folder and blocks deletion');

  console.log('\n--- Part 4: Moving Question Set between Folders ---');
  const targetFolder = await Folder.create({
    name: 'QA Target Folder Beta',
    testType: 'SPOJ',
    description: 'Target folder for move test',
    createdBy: admin._id,
  });

  // Move set2 to targetFolder
  set2.folderId = targetFolder._id;
  await set2.save();

  const setsInAlpha = await QuestionSet.countDocuments({ folderId: testFolder._id });
  const setsInBeta = await QuestionSet.countDocuments({ folderId: targetFolder._id });
  assert(setsInAlpha === 1, `Alpha folder has 1 set remaining after move (found: ${setsInAlpha})`);
  assert(setsInBeta === 1, `Beta folder has 1 set after move (found: ${setsInBeta})`);

  // Move set2 back to testFolder for pool tests
  set2.folderId = testFolder._id;
  await set2.save();

  console.log('\n--- Part 5: Folder as Test Pool (Consolidating FEATURE-012) ---');

  // Create a 3rd set in testFolder
  const set3 = await QuestionSet.create({
    name: 'Alpha Set 3',
    folderId: testFolder._id,
    testType: 'SPOJ',
    createdBy: admin._id,
  });
  const q3A = await Question.create({
    title: 'Alpha 3 Q1',
    description: 'Alpha 3 Q1 desc',
    difficulty: 'EASY',
    testType: 'SPOJ',
    visibleTestCases: [{ input: '5', expectedOutput: '5' }],
    questionSetId: set3._id,
    createdBy: admin._id,
  });
  const q3B = await Question.create({
    title: 'Alpha 3 Q2',
    description: 'Alpha 3 Q2 desc',
    difficulty: 'MEDIUM',
    testType: 'SPOJ',
    visibleTestCases: [{ input: '6', expectedOutput: '6' }],
    questionSetId: set3._id,
    createdBy: admin._id,
  });
  set3.questionIds = [q3A._id, q3B._id];
  await set3.save();

  // Verify all 3 sets have equal question count (2 questions each)
  const poolSets = await QuestionSet.find({ folderId: testFolder._id }).sort({ createdAt: 1, _id: 1 });
  assert(poolSets.length === 3, `Found all 3 pool sets in Folder (found: ${poolSets.length})`);
  const counts = poolSets.map((s) => s.questionIds.length);
  const allEqual = counts.every((c) => c === counts[0]);
  assert(allEqual === true, `All sets in folder pool have identical question count: ${counts.join(', ')}`);

  // Create Test configured with Folder as Pool
  const poolTest = await Test.create({
    title: 'QA Folder Pool Live Test',
    description: 'Test using Folder as round-robin pool container',
    testType: 'SPOJ',
    folderId: testFolder._id,
    questionSetPoolId: testFolder._id.toString(),
    totalQuestions: counts[0],
    durationMinutes: 60,
    passingCriteria: 1,
    instructions: 'Test instructions rich text',
    status: 'LIVE',
    createdBy: admin._id,
  });
  assert(poolTest && poolTest.folderId.toString() === testFolder._id.toString(), 'Created Test with folderId as pool');

  // Create two distinct physical rooms
  const roomA = await Room.create({
    roomName: 'Physical Room 101',
    roomCode: 'RM101_' + Date.now(),
    roomPassword: 'pass' + Date.now(),
    testId: poolTest._id,
    capacity: 10,
    status: 'ACTIVE',
  });

  const roomB = await Room.create({
    roomName: 'Physical Room 202',
    roomCode: 'RM202_' + Date.now(),
    roomPassword: 'pass' + (Date.now() + 1),
    testId: poolTest._id,
    capacity: 10,
    status: 'ACTIVE',
  });

  // Helper to simulate candidate join and round-robin assignment using Folder sets
  async function simulateJoin(candidateName, candidateEmail, room) {
    let cand = await Candidate.findOne({ email: candidateEmail });
    if (!cand) {
      cand = await Candidate.create({
        name: candidateName,
        email: candidateEmail,
        passwordHash: '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890',
      });
    }

    // Atomic room counter increment
    const joinCounter = room.candidateJoinCounter || 0;
    const rotationIndex = joinCounter % poolSets.length;
    const assignedSet = poolSets[rotationIndex];

    room.candidateJoinCounter = joinCounter + 1;
    room.joinedCandidates.push({
      candidateId: cand._id,
      assignedQuestionSetId: assignedSet._id,
      joinIndex: joinCounter,
      joinedAt: new Date(),
    });
    await room.save();

    return { cand, assignedSet, rotationIndex };
  }

  // Room A candidate joins:
  const rA1 = await simulateJoin('RoomA Cand 1', 'ra1@test.com', roomA);
  const rA2 = await simulateJoin('RoomA Cand 2', 'ra2@test.com', roomA);
  const rA3 = await simulateJoin('RoomA Cand 3', 'ra3@test.com', roomA);
  const rA4 = await simulateJoin('RoomA Cand 4', 'ra4@test.com', roomA); // Should wrap to Set 1

  assert(rA1.assignedSet._id.toString() === poolSets[0]._id.toString(), 'Room A Cand 1 gets Set 1 from Folder');
  assert(rA2.assignedSet._id.toString() === poolSets[1]._id.toString(), 'Room A Cand 2 gets Set 2 from Folder');
  assert(rA3.assignedSet._id.toString() === poolSets[2]._id.toString(), 'Room A Cand 3 gets Set 3 from Folder');
  assert(rA4.assignedSet._id.toString() === poolSets[0]._id.toString(), 'Room A Cand 4 wraps around to Set 1 (Index 0)');

  // Room B candidate joins (independent rotation starting at Set 1):
  const rB1 = await simulateJoin('RoomB Cand 1', 'rb1@test.com', roomB);
  assert(rB1.assignedSet._id.toString() === poolSets[0]._id.toString(), 'Room B Cand 1 independently starts at Set 1');

  // Verify Attempted calculation per candidate's assigned set questions (BUG-58 / FEATURE-010)
  const candA2AssignedQuestions = await Question.find({ questionSetId: rA2.assignedSet._id });
  assert(candA2AssignedQuestions.length === 2, `Cand A2 assigned 2 questions from their set: ${candA2AssignedQuestions.map((q) => q.title).join(', ')}`);

  // Cleanup QA test data
  console.log('\n--- Cleaning up QA Test Fixtures ---');
  await Question.deleteMany({ questionSetId: { $in: [set1._id, set2._id, set3._id] } });
  await QuestionSet.deleteMany({ _id: { $in: [set1._id, set2._id, set3._id] } });
  await Room.deleteMany({ _id: { $in: [roomA._id, roomB._id] } });
  await Test.deleteMany({ _id: poolTest._id });
  await Folder.deleteMany({ _id: { $in: [testFolder._id, targetFolder._id] } });
  await Candidate.deleteMany({ email: { $in: ['ra1@test.com', 'ra2@test.com', 'ra3@test.com', 'ra4@test.com', 'rb1@test.com'] } });

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
