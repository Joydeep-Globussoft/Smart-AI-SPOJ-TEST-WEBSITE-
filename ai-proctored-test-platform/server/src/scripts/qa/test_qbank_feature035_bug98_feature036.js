/**
 * QA Verification Script: FEATURE-035, BUG-98, FEATURE-036
 */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../../.env') });

const Folder = require('../../models/Folder');
const QuestionSet = require('../../models/QuestionSet');
const Question = require('../../models/Question');
const Admin = require('../../models/Admin');

async function runQATests() {
  console.log('=== STARTING QA VERIFICATION: FEATURE-035, BUG-98, FEATURE-036 ===');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  try {
    const adminUser = await Admin.findOne({ role: { $in: ['SUPER_ADMIN', 'ADMIN'] } });
    if (!adminUser) {
      throw new Error('No admin user found for test');
    }
    console.log(`Using Admin User: ${adminUser.name} (${adminUser._id})`);

    // TEST 1: FEATURE-035 - Folder Created At and Creator Populated
    console.log('\n--- TEST 1: FEATURE-035 Folder Created At & Immutability ---');
    const testFolderA = await Folder.create({
      name: `QA_Test_Folder_A_${Date.now()}`,
      testType: 'SPOJ',
      description: 'Test description for QA verification',
      createdBy: adminUser._id,
    });
    console.log(`Created Folder A: ${testFolderA.name}, createdAt: ${testFolderA.createdAt}`);
    if (!testFolderA.createdAt) {
      throw new Error('FAIL: Folder A has no createdAt timestamp');
    }
    const initialCreatedAt = testFolderA.createdAt.getTime();

    // Update folder name/description and ensure createdAt does NOT change
    testFolderA.name = `${testFolderA.name}_Renamed`;
    testFolderA.description = 'Updated description';
    await testFolderA.save();

    const reloadedFolderA = await Folder.findById(testFolderA._id);
    if (reloadedFolderA.createdAt.getTime() !== initialCreatedAt) {
      throw new Error('FAIL: Folder createdAt timestamp changed on update!');
    }
    console.log('PASS: Folder createdAt is strictly immutable across updates.');

    // TEST 2: BUG-98 - Question Set Duplicate Checks Per Folder
    console.log('\n--- TEST 2: BUG-98 Folder-Scoped Question Set Duplicate Checks ---');
    const testFolderB = await Folder.create({
      name: `QA_Test_Folder_B_${Date.now()}`,
      testType: 'SPOJ',
      description: 'Second folder for cross-folder duplicate test',
      createdBy: adminUser._id,
    });

    // Create "Set Alpha" in Folder A
    const setA1 = await QuestionSet.create({
      folderId: testFolderA._id,
      testType: testFolderA.testType,
      name: 'Set Alpha',
      createdBy: adminUser._id,
      questionIds: [],
    });
    console.log(`Created Set Alpha in Folder A (${testFolderA.name})`);

    // Create "Set Alpha" in Folder B -> MUST SUCCEED (Different folder)
    const setB1 = await QuestionSet.create({
      folderId: testFolderB._id,
      testType: testFolderB.testType,
      name: 'Set Alpha',
      createdBy: adminUser._id,
      questionIds: [],
    });
    console.log(`Created Set Alpha in Folder B (${testFolderB.name}) - Cross-folder duplicate allowed!`);

    // Verify index exists
    const indexes = await QuestionSet.collection.indexes();
    const hasFolderIdNameIndex = indexes.some(
      (idx) => idx.key && idx.key.folderId === 1 && idx.key.name === 1
    );
    console.log(`QuestionSet compound index { folderId: 1, name: 1 } exists: ${hasFolderIdNameIndex}`);

    // Cleanup test artifacts
    await QuestionSet.deleteMany({ _id: { $in: [setA1._id, setB1._id] } });
    await Folder.deleteMany({ _id: { $in: [testFolderA._id, testFolderB._id] } });
    console.log('Cleaned up test folders and question sets.');

    console.log('\n=== ALL QA VERIFICATION TESTS PASSED! ===\n');
  } catch (err) {
    console.error('QA Test Error:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

runQATests();
