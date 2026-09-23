/**
 * QA Test Suite for FEATURE-023
 * Restructure Results & Shortlist page:
 * - Replaces "Detailed Evaluation Results" tab with per-candidate "Result" column
 * - Provides "Detail Evaluation" drill-down scoped to each candidate's exact assigned questions
 * - Provides "Inspect Code" 50/50 split-screen view (code on left, rubric on right)
 * - Verifies unattempted questions handling
 * - Verifies FEATURE-012 round-robin question set resolution
 * - Verifies AI feedback scoping (AI_TEST only)
 */

const assert = require('assert');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../../server/.env') });

const { getCandidateEvaluationDetail } = require('../../controllers/evaluationController');
const Test = require('../../models/Test');
const Candidate = require('../../models/Candidate');
const Question = require('../../models/Question');
const QuestionSet = require('../../models/QuestionSet');
const Submission = require('../../models/Submission');
const EvaluationResult = require('../../models/EvaluationResult');
const Room = require('../../models/Room');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
  }
}

async function execute() {
  console.log('\n======================================================');
  console.log('FEATURE-023 TEST SUITE: Results & Shortlist Restructure & Drill-Down');
  console.log('======================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);

  // Helper to call controller
  const callDetail = async (testId, candidateId) => {
    let result = null;
    let statusCode = 200;
    const req = { params: { testId, candidateId } };
    const res = {
      status: (c) => {
        statusCode = c;
        return res;
      },
      json: (d) => {
        result = d;
      },
    };
    await getCandidateEvaluationDetail(req, res, (err) => {
      if (err) throw err;
    });
    return { statusCode, data: result };
  };

  // 1. Candidate 'he' in test 'again' (JavaScript test)
  await runAsyncTest('Candidate "he" receives correctly scoped per-question breakdown without duplicates', async () => {
    const testId = '6aa919e7b8c675e3709daa4e';
    const candId = '6aa91a1c2c7214a48caedd24';
    const res = await callDetail(testId, candId);
    assert.strictEqual(res.statusCode, 200);
    assert(res.data.candidate, 'Candidate metadata returned');
    assert.strictEqual(res.data.candidate.name, 'he');
    assert.strictEqual(res.data.questions.length, 4, 'Exactly 4 questions returned (no duplicates)');

    const q1 = res.data.questions[0];
    assert.strictEqual(q1.questionIndex, 1);
    assert(q1.isAttempted, 'Q1 was attempted');
    assert(q1.code && q1.code.length > 0, 'Q1 has submitted code');
    assert(q1.evaluation, 'Q1 has evaluation rubric');
    assert.strictEqual(typeof q1.evaluation.finalScorePerQuestion, 'number');
  });

  // 2. Candidate 'hh' in test 'again' (Unattempted Questions Edge Case)
  await runAsyncTest('Candidate "hh" correctly displays NOT_ATTEMPTED for unsubmitted questions rather than blank/0 score', async () => {
    const testId = '6aa919e7b8c675e3709daa4e';
    const candId = '6aa91dbbcb57355fcfd07042';
    const res = await callDetail(testId, candId);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.data.questions.length, 4);

    // Q1 was attempted
    assert.strictEqual(res.data.questions[0].isAttempted, true);
    assert(res.data.questions[0].evaluation, 'Q1 has evaluation');

    // Q2, Q3, Q4 were NOT attempted
    for (let i = 1; i < 4; i++) {
      const q = res.data.questions[i];
      assert.strictEqual(q.isAttempted, false, `Q${i + 1} marked as not attempted`);
      assert.strictEqual(q.status, 'NOT_ATTEMPTED', `Q${i + 1} status is NOT_ATTEMPTED`);
      assert.strictEqual(q.evaluation, null, `Q${i + 1} evaluation is null (not ambiguous 0 score)`);
      assert.strictEqual(q.code, '', `Q${i + 1} code is empty string`);
    }
  });

  // 3. Multi-Test Verification (Condition 2) — Test "again 2"
  await runAsyncTest('Multi-test verification: "again 2" test candidate detail resolves correctly', async () => {
    const testId = '6aa91d87cb57355fcfd06f93';
    const candId = '6aa91dbbcb57355fcfd07042';
    const res = await callDetail(testId, candId);
    assert.strictEqual(res.statusCode, 200);
    assert(res.data.questions.length > 0, 'Questions returned for test again 2');
    assert(res.data.candidate, 'Candidate returned for test again 2');
  });

  // 4. FEATURE-012 Round-Robin Question Set Pool Resolution (Condition 4)
  await runAsyncTest('FEATURE-012: Resolves distinct assigned question sets for candidates in pool/round-robin test', async () => {
    const hiringTestId = '6ab0e5fc8d0b25980be66ed0';
    const cand1Id = '6ab0e62e8d0b25980be66f0a'; // assigned Set 1
    const cand2Id = '6ab0e847077892eb456883d2'; // assigned Set 2

    const res1 = await callDetail(hiringTestId, cand1Id);
    const res2 = await callDetail(hiringTestId, cand2Id);

    assert.strictEqual(res1.statusCode, 200);
    assert.strictEqual(res2.statusCode, 200);

    const qIds1 = res1.data.questions.map((q) => q.questionId.toString());
    const qIds2 = res2.data.questions.map((q) => q.questionId.toString());

    assert(qIds1.length > 0, 'Candidate 1 has assigned questions');
    assert(qIds2.length > 0, 'Candidate 2 has assigned questions');

    // Confirm that candidates assigned different sets received different question IDs
    const overlap = qIds1.filter((qid) => qIds2.includes(qid));
    assert.strictEqual(
      overlap.length,
      0,
      'Candidates assigned to Set 1 and Set 2 receive distinct questions (zero overlap)'
    );
  });

  // 5. AI Feedback Scoping (Condition 3)
  runTest('AI evaluator feedback and prompt log are scoped strictly to AI_TEST test type', () => {
    const modalCode = fs.readFileSync(
      path.resolve(__dirname, '../../../../client/src/shared/CandidateDetailEvaluationModal.jsx'),
      'utf-8'
    );
    assert(
      modalCode.includes("testType === 'AI_TEST' || inspectingQuestion.testType === 'AI_TEST'"),
      'AI feedback/prompt log only rendered when testType is AI_TEST'
    );
  });

  // 6. UI & Structure Validations
  runTest('AdminResults.jsx Official Shortlist table has Result column after Status with Detail Evaluation button', () => {
    const adminResultsCode = fs.readFileSync(
      path.resolve(__dirname, '../../../../client/src/admin/pages/AdminResults.jsx'),
      'utf-8'
    );
    assert(adminResultsCode.includes('<th style={{ textAlign: \'right\' }}>Result</th>'), 'Header includes Result column');
    assert(adminResultsCode.includes('Detail Evaluation'), 'Row contains Detail Evaluation button');
    assert(adminResultsCode.includes('handleOpenCandidateDetail(c)'), 'Button triggers handleOpenCandidateDetail');
    assert(adminResultsCode.includes('CandidateDetailEvaluationModal'), 'Uses shared CandidateDetailEvaluationModal component');
  });

  runTest('CandidateDetailEvaluationModal implements split-screen Inspect Code view with Monaco Editor and 10-parameter rubric', () => {
    const modalCode = fs.readFileSync(
      path.resolve(__dirname, '../../../../client/src/shared/CandidateDetailEvaluationModal.jsx'),
      'utf-8'
    );
    assert(modalCode.includes('import Editor from \'@monaco-editor/react\''), 'Monaco editor imported');
    assert(modalCode.includes('inspect-split-screen'), 'Split-screen layout used');
    assert(modalCode.includes('inspect-split-left'), 'Left pane for submitted code exists');
    assert(modalCode.includes('inspect-split-right'), 'Right pane for evaluation rubric exists');
    assert(modalCode.includes('readOnly: true'), 'Monaco editor set to read-only');
  });

  runTest('global.css includes responsive media query for split-screen layout (Condition 5)', () => {
    const globalCss = fs.readFileSync(
      path.resolve(__dirname, '../../../../client/src/styles/global.css'),
      'utf-8'
    );
    assert(globalCss.includes('.inspect-split-screen'), '.inspect-split-screen defined');
    assert(globalCss.includes('@media (max-width: 900px)'), 'Responsive breakpoint defined for <= 900px');
    assert(globalCss.includes('flex-direction: column'), 'Split-screen stacks vertically on narrow screens');
  });

  runTest('Old aggregate rubric modal and duplicate candidate tab are completely retired (Condition 1)', () => {
    const adminResultsCode = fs.readFileSync(
      path.resolve(__dirname, '../../../../client/src/admin/pages/AdminResults.jsx'),
      'utf-8'
    );
    assert(!adminResultsCode.includes('Detailed Evaluation Results ('), 'Old tab header removed');
    assert(!adminResultsCode.includes('Inspect Full Rubric'), 'Old Inspect Full Rubric button retired');
    assert(!adminResultsCode.includes('selectedResult'), 'Old selectedResult state cleanly removed');
  });

  await mongoose.disconnect();

  console.log(`\n======================================================`);
  console.log(`RESULTS: ${passedTests}/${totalTests} Passed`);
  console.log(`======================================================\n`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

execute().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
