/**
 * QA Verification Suite: BUG-XX / BUG-52
 * Question Set Name and Type Editing in Admin Question Bank
 *
 * Requirements:
 * 1. Admin can update Question Set name.
 * 2. Empty Question Set name is rejected with 400.
 * 3. Question Set type can be updated when unassigned to tests and has 0 questions.
 * 4. Changing Question Set type when assigned to an existing Test is blocked with 400 and clear explanation.
 * 5. Changing Question Set type when the set contains existing questions is blocked with 400.
 * 6. Non-admin / candidate cannot update Question Set (403 Forbidden).
 * 7. Existing question IDs and MongoDB _id are preserved.
 * 8. Frontend AdminQuestionBank.jsx contains Edit Set button, modal, form fields, and state sync.
 * 9. apiClient.js exports updateQuestionSet method.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('QA Suite: BUG-52 Question Set Name & Type Editing');
  console.log('================================================================\n');

  // --- PART 1: Frontend & Route Code Audits ---
  console.log('--- Part 1: Code Structure & Contract Audits ---');

  const apiClientPath = path.join(__dirname, '../../../../client/src/services/apiClient.js');
  const apiClientCode = fs.readFileSync(apiClientPath, 'utf8');
  assert(
    apiClientCode.includes('updateQuestionSet: (setId, data) => axios.patch(`/question-sets/${setId}`, data)'),
    'apiClient exports updateQuestionSet PATCH helper'
  );

  const qBankPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminQuestionBank.jsx');
  const qBankCode = fs.readFileSync(qBankPath, 'utf8');
  assert(
    qBankCode.includes('id="edit-question-set-btn"') && qBankCode.includes('handleOpenEditSet'),
    'AdminQuestionBank renders Edit Set button with click handler'
  );
  assert(
    qBankCode.includes('showEditSetModal') && qBankCode.includes('handleEditSetSubmit'),
    'AdminQuestionBank contains Edit Question Set modal and submit handler'
  );
  assert(
    qBankCode.includes('id="edit-set-name-input"') && qBankCode.includes('id="edit-set-type-select"'),
    'AdminQuestionBank renders edit name input and type select elements'
  );
  assert(
    qBankCode.includes('disabled={questions.length > 0}'),
    'AdminQuestionBank disables testType select when question set contains questions'
  );
  assert(
    qBankCode.includes('setSelectedSet(updatedSet)') && qBankCode.includes('prev.map('),
    'AdminQuestionBank updates selectedSet and questionSets state in-place on edit success'
  );

  const routePath = path.join(__dirname, '../../routes/questionRoutes.js');
  const routeCode = fs.readFileSync(routePath, 'utf8');
  assert(
    routeCode.includes("router.patch('/question-sets/:setId', verifyToken, requireAdmin, updateQuestionSet);"),
    'questionRoutes registers PATCH /question-sets/:setId with verifyToken and requireAdmin'
  );

  const controllerPath = path.join(__dirname, '../../controllers/questionController.js');
  const controllerCode = fs.readFileSync(controllerPath, 'utf8');
  assert(
    controllerCode.includes('const updateQuestionSet = async (req, res, next)') &&
    controllerCode.includes('Test.findOne({ questionSetId: setId })') &&
    controllerCode.includes('Question.countDocuments({ questionSetId: setId })'),
    'questionController validates assigned tests and question count before allowing type changes'
  );

  // --- PART 2: Database & API Integration Tests ---
  console.log('\n--- Part 2: API & Validation Integration Tests ---');
  await mongoose.connect(process.env.MONGODB_URI);

  const QuestionSet = require('../../models/QuestionSet');
  const Question = require('../../models/Question');
  const Test = require('../../models/Test');
  const Admin = require('../../models/Admin');
  const Candidate = require('../../models/Candidate');

  let admin = await Admin.findOne();
  if (!admin) {
    admin = await Admin.create({
      name: 'QA Admin',
      email: `admin_${Date.now()}@qa.com`,
      passwordHash: 'dummy',
      role: 'ADMIN',
    });
  }

  const adminToken = jwt.sign(
    { id: admin._id.toString(), email: admin.email, type: 'admin', role: admin.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: '1h' }
  );

  const { updateQuestionSet } = require('../../controllers/questionController');
  const { requireAdmin } = require('../../middleware/authMiddleware');

  const invokeUpdate = async (setId, body, user = { id: admin._id, type: 'admin', role: 'ADMIN' }) => {
    return new Promise((resolve) => {
      const req = {
        params: { setId: setId.toString() },
        body,
        user,
      };
      const res = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          resolve({ status: this.statusCode, data });
        },
      };
      const next = (err) => {
        resolve({ status: 500, data: { error: err.message } });
      };

      // Verify authorization through requireAdmin middleware
      requireAdmin(req, res, () => {
        updateQuestionSet(req, res, next);
      });
    });
  };

  // 1. Create a clean test Question Set with 0 questions
  const cleanSet = await QuestionSet.create({
    name: `Test QA Set ${Date.now()}`,
    testType: 'REACT',
    createdBy: admin._id,
    questionIds: [],
  });

  // Test: Update name only
  const updateNameRes = await invokeUpdate(cleanSet._id, { name: 'Updated QA Set Name' });
  assert(
    updateNameRes.status === 200 && updateNameRes.data.questionSet?.name === 'Updated QA Set Name',
    'Admin successfully updates Question Set name'
  );
  assert(
    updateNameRes.data.questionSet?._id.toString() === cleanSet._id.toString(),
    'Question Set MongoDB _id is preserved across update'
  );

  // Test: Reject empty name
  const emptyNameRes = await invokeUpdate(cleanSet._id, { name: '   ' });
  assert(
    emptyNameRes.status === 400 && emptyNameRes.data.error?.includes('empty'),
    'Server rejects empty Question Set name with 400'
  );

  // Test: Update type when 0 questions and unassigned
  const updateTypeRes = await invokeUpdate(cleanSet._id, { testType: 'AI_TEST' });
  assert(
    updateTypeRes.status === 200 && updateTypeRes.data.questionSet?.testType === 'AI_TEST',
    'Admin successfully updates testType when set is unassigned and has 0 questions'
  );

  // Test: Reject invalid testType
  const invalidTypeRes = await invokeUpdate(cleanSet._id, { testType: 'INVALID_TYPE' });
  assert(
    invalidTypeRes.status === 400 && invalidTypeRes.data.error?.includes('Invalid testType'),
    'Server rejects unsupported testType with 400'
  );

  // Test: Block type change when Question Set is assigned to a Test
  const assignedTest = await Test.create({
    title: `Assigned Test ${Date.now()}`,
    testType: 'AI_TEST',
    createdBy: admin._id,
    questionSetId: cleanSet._id,
    durationMinutes: 30,
    totalQuestions: 1,
    passingCriteria: 1,
    instructions: 'Test instructions',
    status: 'DRAFT',
  });

  const changeAssignedTypeRes = await invokeUpdate(cleanSet._id, { testType: 'SPOJ' });
  assert(
    changeAssignedTypeRes.status === 400 &&
    changeAssignedTypeRes.data.error?.includes('assigned to test'),
    'Server blocks changing testType when Question Set is assigned to an existing Test'
  );

  // Test: Name can still be updated even when assigned to a Test
  const updateAssignedNameRes = await invokeUpdate(cleanSet._id, { name: 'Assigned Set Renamed' });
  assert(
    updateAssignedNameRes.status === 200 && updateAssignedNameRes.data.questionSet?.name === 'Assigned Set Renamed',
    'Admin can safely update Question Set name even when assigned to a Test'
  );

  // Clean up the assigned test
  await Test.findByIdAndDelete(assignedTest._id);

  // Test: Block type change when Question Set contains questions
  const createdQuestion = await Question.create({
    questionSetId: cleanSet._id,
    testType: 'AI_TEST',
    title: 'QA Sample Question',
    description: 'Sample description',
    difficulty: 'EASY',
    aiTestBriefFiles: [{ fileName: 'index.html' }],
  });
  await QuestionSet.findByIdAndUpdate(cleanSet._id, {
    $push: { questionIds: createdQuestion._id },
  });

  const changeWithQuestionsRes = await invokeUpdate(cleanSet._id, { testType: 'JAVASCRIPT' });
  assert(
    changeWithQuestionsRes.status === 400 &&
    changeWithQuestionsRes.data.error?.includes('contains 1 existing question'),
    'Server blocks changing testType when Question Set contains existing questions'
  );

  // Test: Reject unauthorized update (candidate user)
  const candidateRes = await invokeUpdate(cleanSet._id, { name: 'Hacked Name' }, { id: 'cand123', type: 'candidate' });
  assert(
    candidateRes.status === 403,
    'Server rejects Question Set update from non-admin candidate with 403'
  );

  // Test: 404 for non-existent Question Set ID
  const fakeId = new mongoose.Types.ObjectId();
  const notFoundRes = await invokeUpdate(fakeId, { name: 'Nonexistent' });
  assert(
    notFoundRes.status === 404,
    'Server returns 404 for non-existent Question Set ID'
  );

  // Clean up
  await Question.findByIdAndDelete(createdQuestion._id);
  await QuestionSet.findByIdAndDelete(cleanSet._id);

  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log(`TOTAL TESTS: ${totalTests} | PASSED: ${passedTests} | FAILED: ${totalTests - passedTests}`);
  console.log('================================================================');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running QA suite:', err);
  process.exit(1);
});
