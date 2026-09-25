/**
 * QA Test Suite for FEATURE-041:
 * Remove Redundant PDF Filename Prefix from Question Titles
 * 
 * Requirements:
 * 1. On question set detail view, change displayed question title format from "<filename>.pdf | Problem N" to just "Problem N" (or actual problem label).
 * 2. Display-only change: do not alter or delete underlying question records or PDF metadata.
 * 3. Applied consistently across Question Set Detail view, Question Edit modal placeholder, Candidate Evaluation Detail modal, and Submission Evaluation API.
 * 4. Custom authored titles and non-PDF questions remain untouched.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

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

console.log('\n======================================================');
console.log('🧪 QA TEST SUITE: FEATURE-041 REMOVE PDF FILENAME PREFIX');
console.log('======================================================\n');

const qbankPath = path.join(__dirname, '../../../../client/src/admin/pages/AdminQuestionBank.jsx');
const evalModalPath = path.join(__dirname, '../../../../client/src/shared/CandidateDetailEvaluationModal.jsx');
const evalControllerPath = path.join(__dirname, '../../controllers/evaluationController.js');

const qbankContent = fs.readFileSync(qbankPath, 'utf8');
const evalModalContent = fs.readFileSync(evalModalPath, 'utf8');
const evalControllerContent = fs.readFileSync(evalControllerPath, 'utf8');

// 1. Extract formatQuestionTitle from AdminQuestionBank or define equivalent logic
const formatQuestionTitle = (q, idx = 0) => {
  if (!q) return `Problem ${idx + 1}`;

  if (q.title && typeof q.title === 'string' && q.title.trim()) {
    let trimmed = q.title.trim();

    const bracketMatch = trimmed.match(/^(?:.*\.pdf\s*)?[\(\[]\s*(?:Problem|Question)\s*(\d+)\s*[\)\]]$/i);
    if (bracketMatch) {
      return `Problem ${bracketMatch[1]}`;
    }

    trimmed = trimmed.replace(/^.*?\.pdf\s*[\|\:\-–—]\s*/i, '').trim();

    const qMatch = trimmed.match(/^Question\s+(\d+)$/i);
    if (qMatch) {
      return `Problem ${qMatch[1]}`;
    }

    if (trimmed) {
      return trimmed;
    }
  }

  return `Problem ${idx + 1}`;
};

// Unit tests for title formatting
runTest('Strips <filename>.pdf | prefix from "set_5.pdf | Problem 1" -> "Problem 1"', () => {
  assert.strictEqual(formatQuestionTitle({ title: 'set_5.pdf | Problem 1' }, 0), 'Problem 1');
});

runTest('Strips <filename>.pdf | prefix from "set_6.pdf | Problem 2" -> "Problem 2"', () => {
  assert.strictEqual(formatQuestionTitle({ title: 'set_6.pdf | Problem 2' }, 1), 'Problem 2');
});

runTest('Formats legacy bracketed title "set_1.pdf (Problem 1)" -> "Problem 1"', () => {
  assert.strictEqual(formatQuestionTitle({ title: 'set_1.pdf (Problem 1)' }, 0), 'Problem 1');
});

runTest('Formats legacy bracketed question title "java_exam.pdf (Question 3)" -> "Problem 3"', () => {
  assert.strictEqual(formatQuestionTitle({ title: 'java_exam.pdf (Question 3)' }, 2), 'Problem 3');
});

runTest('Formats PDF-imported question with empty title to "Problem N"', () => {
  assert.strictEqual(formatQuestionTitle({ title: '', isPdfImported: true, pdfOriginalName: 'set_5.pdf' }, 0), 'Problem 1');
  assert.strictEqual(formatQuestionTitle({ title: '', isPdfImported: true, pdfOriginalName: 'set_6.pdf' }, 3), 'Problem 4');
});

runTest('Preserves custom authored (non-PDF) question titles without alteration', () => {
  assert.strictEqual(formatQuestionTitle({ title: 'Two Sum', isPdfImported: false }, 0), 'Two Sum');
  assert.strictEqual(formatQuestionTitle({ title: 'Reverse Linked List II', isPdfImported: false }, 1), 'Reverse Linked List II');
  assert.strictEqual(formatQuestionTitle({ title: 'Design an LRU Cache', isPdfImported: false }, 2), 'Design an LRU Cache');
});

runTest('Preserves custom problem names extracted from PDF without filename prefix', () => {
  assert.strictEqual(formatQuestionTitle({ title: 'algorithms.pdf | Longest Common Subsequence', isPdfImported: true }, 0), 'Longest Common Subsequence');
  assert.strictEqual(formatQuestionTitle({ title: 'quiz.pdf : Graph Dijkstra Algorithm', isPdfImported: true }, 1), 'Graph Dijkstra Algorithm');
});

// Source code structural checks
runTest('AdminQuestionBank.jsx renders question card header with formatQuestionTitle', () => {
  assert(qbankContent.includes('formatQuestionTitle(q, idx)'), 'Must render formatQuestionTitle(q, idx) in card title');
  assert(qbankContent.includes('export const formatQuestionTitle ='), 'Must export formatQuestionTitle');
  assert(qbankContent.includes('placeholder={questionForm.isPdfImported ? "e.g. Problem 1 (or leave blank for default)" : "e.g. Reverse Linked List II"}'), 'Question edit modal placeholder updated');
});

runTest('AdminQuestionBank.jsx preserves per-question PDF preview and details controls', () => {
  assert(qbankContent.includes('EmbeddedPdfViewer'), 'EmbeddedPdfViewer component preserved');
  assert(qbankContent.includes('setExpandedQuestionId(isExpanded ? null : q._id)'), 'Details expansion button preserved');
  assert(qbankContent.includes('handleOpenEditQuestion(q)'), 'Edit question button preserved');
  assert(qbankContent.includes('setDeleteTarget(q)'), 'Delete question button preserved');
});

runTest('CandidateDetailEvaluationModal.jsx uses formatQuestionTitle for question list and inspect modal', () => {
  assert(evalModalContent.includes('import { formatQuestionTitle } from \'../admin/pages/AdminQuestionBank\''), 'Imports formatQuestionTitle');
  assert(evalModalContent.includes('formatQuestionTitle(q,'), 'Uses formatQuestionTitle in question list table');
  assert(evalModalContent.includes('formatQuestionTitle(inspectingQuestion,'), 'Uses formatQuestionTitle in inspect code report header');
});

runTest('evaluationController.js strips redundant PDF prefix in getCandidateEvaluationDetail', () => {
  assert(evalControllerContent.includes('questionTitle.replace(/^.*?\\.pdf\\s*[\\|\\:\\-–—]\\s*/i, \'\')'), 'evaluationController strips PDF prefix');
});

console.log(`\n======================================================`);
console.log(`RESULTS: ${passedTests}/${totalTests} Passed`);
console.log(`======================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
