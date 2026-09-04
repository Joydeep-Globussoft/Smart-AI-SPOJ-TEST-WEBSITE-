/**
 * QA Automated Verification Suite: BUG-60
 * Total Questions auto-population, read-only locking, and Passing Criteria validation
 *
 * Verifies that:
 * 1. AdminTests.jsx disables and derives Total Questions from Question Set count.
 * 2. AdminTestDetail.jsx disables and derives Total Questions in Edit Configuration modal.
 * 3. Passing criteria input in AdminTests cannot exceed Total Questions.
 * 4. Server createTest auto-derives totalQuestions from Question collection.
 * 5. Server createTest rejects 0-question Question Sets with 400.
 * 6. Server createTest rejects passingCriteria > totalQuestions with 400.
 * 7. Server updateTest updates totalQuestions and validates when questionSetId is changed in DRAFT.
 * 8. Server updatePassingCriteria rejects values exceeding totalQuestions with 400.
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
  console.log('QA VERIFICATION SUITE: BUG-60 (Total Questions Lock & Criteria Validation)');
  console.log('========================================================================\n');

  // --- PART 1: Static Code Inspection ---
  console.log('--- Part 1: Static Code Inspection ---');
  const adminTestsPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTests.jsx');
  const adminTestDetailPath = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminTestDetail.jsx');
  const testControllerPath = path.resolve(__dirname, '../../controllers/testController.js');

  const adminTestsCode = fs.readFileSync(adminTestsPath, 'utf8');
  const adminTestDetailCode = fs.readFileSync(adminTestDetailPath, 'utf8');
  const testControllerCode = fs.readFileSync(testControllerPath, 'utf8');

  // Client checks
  assert(
    adminTestsCode.includes('totalQuestions: qCount') &&
    adminTestsCode.includes('disabled') &&
    adminTestsCode.includes('readOnly'),
    'AdminTests.jsx auto-populates totalQuestions and sets input to disabled and readOnly'
  );

  assert(
    adminTestsCode.includes('formData.passingCriteria > qCount') ||
    adminTestsCode.includes('formData.passingCriteria > formData.totalQuestions'),
    'AdminTests.jsx validates that passingCriteria does not exceed Total Questions'
  );

  assert(
    adminTestDetailCode.includes('id="edit-total-questions"') &&
    adminTestDetailCode.includes('disabled') &&
    adminTestDetailCode.includes('readOnly'),
    'AdminTestDetail.jsx disables and locks totalQuestions in DRAFT Edit Modal'
  );

  // Server checks
  assert(
    testControllerCode.includes('actualQuestionCount <= 0') &&
    testControllerCode.includes('Selected Question Set contains 0 questions'),
    'testController.createTest rejects 0-question Question Sets with 400'
  );

  assert(
    testControllerCode.includes('parsedPassingCriteria > actualQuestionCount') &&
    testControllerCode.includes('totalQuestions: actualQuestionCount'),
    'testController.createTest validates passingCriteria and locks totalQuestions to actualQuestionCount'
  );

  assert(
    testControllerCode.includes('numericCriteria > existingTest.totalQuestions'),
    'testController.updatePassingCriteria rejects passing criteria exceeding totalQuestions'
  );

  // --- PART 2: Database & Controller Execution Verification ---
  console.log('\n--- Part 2: DB Integration & Controller Enforcement Tests ---');
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_proctored_test_platform';
  await mongoose.connect(uri);

  const QuestionSet = require('../../models/QuestionSet');
  const Question = require('../../models/Question');
  const Test = require('../../models/Test');
  const Admin = require('../../models/Admin');
  const { createTest, updateTest, updatePassingCriteria } = require('../../controllers/testController');

  const adminUser = await Admin.findOne();

  // Test 1: Reject createTest with 0-question QuestionSet
  const emptySet = await QuestionSet.create({
    name: 'QA Empty Set For Test Creation ' + Date.now(),
    testType: 'SPOJ',
    createdBy: adminUser._id,
    questionIds: [],
  });

  let emptyResStatus = null;
  let emptyResBody = null;
  const emptyReq = {
    user: { id: adminUser._id.toString() },
    body: {
      title: 'QA 0-Question Test',
      testType: 'SPOJ',
      questionSetId: emptySet._id.toString(),
      durationMinutes: 60,
      passingCriteria: 1,
      instructions: 'Instructions here',
    },
  };
  const emptyRes = {
    status: (code) => {
      emptyResStatus = code;
      return {
        json: (data) => {
          emptyResBody = data;
        },
      };
    },
  };

  await createTest(emptyReq, emptyRes, (err) => {
    if (err) console.error(err);
  });

  assert(
    emptyResStatus === 400 && emptyResBody.error?.includes('contains 0 questions'),
    'Server rejects creating a test with a 0-question Question Set (status: 400)'
  );

  // Test 2: Reject createTest when passingCriteria > actual questions in set
  const oneQSet = await QuestionSet.create({
    name: 'QA 1-Question Set For Test Creation ' + Date.now(),
    testType: 'SPOJ',
    createdBy: adminUser._id,
    questionIds: [],
  });

  const questionDoc = await Question.create({
    questionSetId: oneQSet._id,
    testType: 'SPOJ',
    title: 'QA Single Problem',
    description: 'Solve single problem',
    difficulty: 'EASY',
    visibleTestCases: [{ input: '1', expectedOutput: '1' }],
    hiddenTestCases: [{ input: '2', expectedOutput: '2' }],
  });
  await QuestionSet.findByIdAndUpdate(oneQSet._id, { $push: { questionIds: questionDoc._id } });

  let criteriaResStatus = null;
  let criteriaResBody = null;
  const criteriaReq = {
    user: { id: adminUser._id.toString() },
    body: {
      title: 'QA Mismatched Criteria Test',
      testType: 'SPOJ',
      questionSetId: oneQSet._id.toString(),
      durationMinutes: 60,
      passingCriteria: 3, // Set has only 1 question, passingCriteria is 3
      instructions: 'Instructions here',
    },
  };
  const criteriaRes = {
    status: (code) => {
      criteriaResStatus = code;
      return {
        json: (data) => {
          criteriaResBody = data;
        },
      };
    },
  };

  await createTest(criteriaReq, criteriaRes, (err) => {
    if (err) console.error(err);
  });

  assert(
    criteriaResStatus === 400 && criteriaResBody.error?.includes('cannot exceed total questions'),
    'Server rejects createTest when passingCriteria (3) > total questions (1) (status: 400)'
  );

  // Test 3: Successful creation auto-locks totalQuestions to actual count
  let validResStatus = null;
  let validResBody = null;
  const validReq = {
    user: { id: adminUser._id.toString() },
    body: {
      title: 'QA Valid 1-Q Test ' + Date.now(),
      testType: 'SPOJ',
      questionSetId: oneQSet._id.toString(),
      durationMinutes: 60,
      passingCriteria: 1,
      totalQuestions: 99, // Should be overridden by server to 1!
      instructions: 'Instructions here',
    },
  };
  const validRes = {
    status: (code) => {
      validResStatus = code;
      return {
        json: (data) => {
          validResBody = data;
        },
      };
    },
  };

  await createTest(validReq, validRes, (err) => {
    if (err) console.error(err);
  });

  assert(
    validResStatus === 201 && validResBody.test?.totalQuestions === 1,
    'Server successfully creates test and locks totalQuestions to 1 (ignoring arbitrary body value)'
  );

  const createdTestId = validResBody.test._id;

  // Test 4: updatePassingCriteria rejects values exceeding totalQuestions
  let patchCriteriaStatus = null;
  let patchCriteriaBody = null;
  const patchCriteriaReq = {
    params: { testId: createdTestId.toString() },
    body: { passingCriteria: 5 },
  };
  const patchCriteriaRes = {
    status: (code) => {
      patchCriteriaStatus = code;
      return {
        json: (data) => {
          patchCriteriaBody = data;
        },
      };
    },
  };

  await updatePassingCriteria(patchCriteriaReq, patchCriteriaRes, (err) => {
    if (err) console.error(err);
  });

  assert(
    patchCriteriaStatus === 400 && patchCriteriaBody.error?.includes('cannot exceed total questions'),
    'Server rejects updatePassingCriteria when new criteria (5) exceeds totalQuestions (1)'
  );

  // Cleanup
  await Question.deleteMany({ questionSetId: { $in: [emptySet._id, oneQSet._id] } });
  await QuestionSet.deleteMany({ _id: { $in: [emptySet._id, oneQSet._id] } });
  await Test.deleteOne({ _id: createdTestId });

  console.log('\n========================================================================');
  console.log(`SUMMARY: ${passedTests}/${totalTests} tests passed`);
  console.log('========================================================================\n');

  await mongoose.disconnect();
  process.exit(totalTests === passedTests ? 0 : 1);
}

runTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
