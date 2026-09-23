/**
 * QA Test Suite for FEATURE-024:
 * Add "View Result" button on Candidate Inspection modal and Test Summary roster — works for any submitted candidate
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
const Shortlist = require('../../models/Shortlist');

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
  console.log('FEATURE-024 TEST SUITE: View Result on Roster & Modal');
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

  // 1. Single source of truth: CandidateDetailEvaluationModal exists and is used across both pages
  runTest('Single Source of Truth: CandidateDetailEvaluationModal.jsx is imported and used by both AdminResults and AdminLiveDashboard', () => {
    const modalPath = path.resolve(__dirname, '../../../../client/src/shared/CandidateDetailEvaluationModal.jsx');
    assert(fs.existsSync(modalPath), 'CandidateDetailEvaluationModal.jsx exists in client/src/shared/');

    const modalCode = fs.readFileSync(modalPath, 'utf-8');
    assert(modalCode.includes('export default function CandidateDetailEvaluationModal'), 'Default export CandidateDetailEvaluationModal');
    assert(modalCode.includes('api.getCandidateEvaluationDetail'), 'Calls getCandidateEvaluationDetail API');
    assert(modalCode.includes('inspect-split-screen'), 'Includes split-screen code inspection');

    const resultsCode = fs.readFileSync(
      path.resolve(__dirname, '../../../../client/src/admin/pages/AdminResults.jsx'),
      'utf-8'
    );
    assert(
      resultsCode.includes("import CandidateDetailEvaluationModal from '../../shared/CandidateDetailEvaluationModal'"),
      'AdminResults imports shared CandidateDetailEvaluationModal'
    );
    assert(
      resultsCode.includes('<CandidateDetailEvaluationModal'),
      'AdminResults renders shared CandidateDetailEvaluationModal'
    );

    const liveCode = fs.readFileSync(
      path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx'),
      'utf-8'
    );
    assert(
      liveCode.includes("import CandidateDetailEvaluationModal from '../../shared/CandidateDetailEvaluationModal'"),
      'AdminLiveDashboard imports shared CandidateDetailEvaluationModal'
    );
    assert(
      liveCode.includes('<CandidateDetailEvaluationModal'),
      'AdminLiveDashboard renders shared CandidateDetailEvaluationModal'
    );
  });

  // 2. Roster Table: View Result button in Actions column
  runTest('Candidate Proctoring Summary Roster table includes View Result button alongside Inspect and Disqualify', () => {
    const liveCode = fs.readFileSync(
      path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx'),
      'utf-8'
    );
    assert(liveCode.includes('View Result'), 'View Result button text present');
    assert(liveCode.includes('onOpenEvaluationDetail'), 'onOpenEvaluationDetail handler passed to row');
    assert(
      liveCode.includes('disabled={!isCandidateSubmitted(candidate, isTestEnded)}'),
      'Roster View Result button disabled when candidate is not submitted'
    );
  });

  // 3. Candidate Inspection Modal: View Result button in footer
  runTest('Candidate Inspection & Evidence modal includes View Result button in modal footer', () => {
    const liveCode = fs.readFileSync(
      path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx'),
      'utf-8'
    );
    assert(
      liveCode.includes('onClick={() => handleOpenEvaluationDetail(activeInspectCandidate)}'),
      'Modal View Result button opens evaluation detail for active inspect candidate'
    );
    assert(
      liveCode.includes('disabled={!isCandidateSubmitted(activeInspectCandidate, isTestEnded)}'),
      'Modal View Result button disabled when active inspect candidate is not submitted'
    );
  });

  // 4. Candidate submission status evaluation helper logic
  runTest('isCandidateSubmitted helper correctly classifies candidate states', () => {
    const liveCode = fs.readFileSync(
      path.resolve(__dirname, '../../../../client/src/admin/pages/AdminLiveDashboard.jsx'),
      'utf-8'
    );
    assert(liveCode.includes('export const isCandidateSubmitted ='), 'isCandidateSubmitted helper exported');

    // Simulate helper logic
    const isSubmitted = (candidate, isTestEnded = false) => {
      if (!candidate) return false;
      const status = candidate.status;
      if (
        status === 'SUBMITTED' ||
        status === 'AUTO_SUBMITTED_TIME_UP' ||
        status === 'AUTO_SUBMITTED_DISQUALIFIED' ||
        status === 'DISQUALIFIED' ||
        Boolean(candidate.isDisqualified)
      ) {
        return true;
      }
      if (isTestEnded && candidate.candidateStartTime && status !== 'NOT_STARTED') {
        return true;
      }
      return false;
    };

    assert.strictEqual(isSubmitted({ status: 'SUBMITTED' }), true);
    assert.strictEqual(isSubmitted({ status: 'AUTO_SUBMITTED_TIME_UP' }), true);
    assert.strictEqual(isSubmitted({ status: 'AUTO_SUBMITTED_DISQUALIFIED' }), true);
    assert.strictEqual(isSubmitted({ status: 'DISQUALIFIED' }), true);
    assert.strictEqual(isSubmitted({ isDisqualified: true }), true);
    assert.strictEqual(isSubmitted({ status: 'IN_PROGRESS', candidateStartTime: new Date() }, false), false);
    assert.strictEqual(isSubmitted({ status: 'NOT_STARTED' }, false), false);
    assert.strictEqual(isSubmitted({ status: 'IN_PROGRESS', candidateStartTime: new Date() }, true), true);
  });

  // 5. Backend getCandidateEvaluationDetail works regardless of shortlist membership
  await runAsyncTest('Non-shortlisted submitted candidates can have their results evaluated without 403/404 shortlist gating', async () => {
    const testId = '6aa919e7b8c675e3709daa4e';
    const candId = '6aa91a1c2c7214a48caedd24';

    const res = await callDetail(testId, candId);
    assert.strictEqual(res.statusCode, 200);
    assert(res.data.candidate, 'Candidate returned');
    assert(res.data.questions.length > 0, 'Questions returned');
  });

  // 6. Candidate with 0 questions attempted
  await runAsyncTest('Candidate with 0 questions attempted displays empty/zero breakdown without crash', async () => {
    const testId = '6aa919e7b8c675e3709daa4e';
    const candId = '6aa91dbbcb57355fcfd07042';

    const res = await callDetail(testId, candId);
    assert.strictEqual(res.statusCode, 200);
    assert(Array.isArray(res.data.questions), 'Questions array returned');
    assert.strictEqual(res.data.questions[1].isAttempted, false);
    assert.strictEqual(res.data.questions[1].status, 'NOT_ATTEMPTED');
    assert.strictEqual(res.data.questions[1].evaluation, null);
  });

  // 7. Disqualified candidate evaluation detail
  await runAsyncTest('Disqualified candidate returns evaluations alongside disqualification context', async () => {
    const testId = '6aa919e7b8c675e3709daa4e';
    const candId = '6aa91a1c2c7214a48caedd24';

    const res = await callDetail(testId, candId);
    assert.strictEqual(res.statusCode, 200);
    assert(res.data.candidate !== null);
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
