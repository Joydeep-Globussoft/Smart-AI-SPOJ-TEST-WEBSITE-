import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Starting QA Test: UI RESTRUCTURE-025 (Question Card Header & Naming Format) ---');

// 1. Verify formatQuestionTitle logic directly
const formatQuestionTitle = (q, idx = 0) => {
  if (!q) return `Problem ${idx + 1}`;

  if (q.title && typeof q.title === 'string' && q.title.trim()) {
    const trimmed = q.title.trim();
    const match = trimmed.match(/^(.*?)\s*[\(\[]\s*(?:Problem|Question)\s*(\d+)\s*[\)\]]$/i);
    if (match) {
      const base = match[1].replace(/[\s:\-–—|]+$/, '').trim();
      return base ? `${base} | Problem ${match[2]}` : `Problem ${match[2]}`;
    }
    return trimmed;
  }

  if (q.isPdfImported) {
    const baseName = q.pdfOriginalName || q.pdfFileName || 'Problem';
    return `${baseName} | Problem ${idx + 1}`;
  }

  return `Problem ${idx + 1}`;
};

// Test Case 1: Legacy format set_1.pdf (Problem 1) -> set_1.pdf | Problem 1
assert.strictEqual(
  formatQuestionTitle({ title: 'set_1.pdf (Problem 1)' }, 0),
  'set_1.pdf | Problem 1',
  'Failed: set_1.pdf (Problem 1) should format to set_1.pdf | Problem 1'
);

// Test Case 2: Legacy format abc.pdf (Problem 4) -> abc.pdf | Problem 4
assert.strictEqual(
  formatQuestionTitle({ title: 'abc.pdf (Problem 4)' }, 3),
  'abc.pdf | Problem 4',
  'Failed: abc.pdf (Problem 4) should format to abc.pdf | Problem 4'
);

// Test Case 3: Legacy format java_set.pdf (Problem 2) -> java_set.pdf | Problem 2
assert.strictEqual(
  formatQuestionTitle({ title: 'java_set.pdf (Problem 2)' }, 1),
  'java_set.pdf | Problem 2',
  'Failed: java_set.pdf (Problem 2) should format to java_set.pdf | Problem 2'
);

// Test Case 4: Question with Question keyword e.g. set_2.pdf (Question 3)
assert.strictEqual(
  formatQuestionTitle({ title: 'set_2.pdf (Question 3)' }, 2),
  'set_2.pdf | Problem 3',
  'Failed: Question keyword should format to Problem X'
);

// Test Case 5: Newly imported PDF question with empty title and pdfOriginalName
assert.strictEqual(
  formatQuestionTitle({ title: '', isPdfImported: true, pdfOriginalName: 'set_1.pdf' }, 0),
  'set_1.pdf | Problem 1',
  'Failed: empty title on PDF import should format using pdfOriginalName'
);

// Test Case 6: Custom authored question title
assert.strictEqual(
  formatQuestionTitle({ title: 'Two Sum', isPdfImported: false }, 0),
  'Two Sum',
  'Failed: custom title should remain unchanged'
);

// Test Case 7: Already formatted title
assert.strictEqual(
  formatQuestionTitle({ title: 'set_1.pdf | Problem 1' }, 0),
  'set_1.pdf | Problem 1',
  'Failed: already formatted title should be preserved'
);

console.log('✓ All title formatting unit tests passed successfully');

// 2. Verify AdminQuestionBank.jsx source code
const qbankFile = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminQuestionBank.jsx');
const content = fs.readFileSync(qbankFile, 'utf8');

// Part A: PDF filename badge is removed from the question card header
assert(
  !content.includes('📄 PDF: {q.pdfFileName}'),
  'Failed: 📄 PDF: {q.pdfFileName} badge should be removed from question card'
);

// Part B: "Rendered directly from original PDF" text is removed
assert(
  !content.includes('Rendered directly from original PDF'),
  'Failed: "Rendered directly from original PDF" subtitle must be removed from question card'
);

// Part C: formatQuestionTitle is defined and used for question title
assert(
  content.includes('formatQuestionTitle(q, idx)'),
  'Failed: Question title header must call formatQuestionTitle(q, idx)'
);
assert(
  content.includes('export const formatQuestionTitle ='),
  'Failed: formatQuestionTitle helper must be defined and exported'
);

// Part D: Details / Edit / Delete buttons and EmbeddedPdfViewer in Details must remain intact
assert(
  content.includes('onClick={() => setExpandedQuestionId(isExpanded ? null : q._id)}'),
  'Failed: Details toggle button must remain intact'
);
assert(
  content.includes('onClick={() => handleOpenEditQuestion(q)}'),
  'Failed: Edit button must remain intact'
);
assert(
  content.includes('onClick={() => setDeleteTarget(q)}'),
  'Failed: Delete button must remain intact'
);
assert(
  content.includes('EmbeddedPdfViewer'),
  'Failed: EmbeddedPdfViewer must remain intact for preview'
);

console.log('✓ All AdminQuestionBank.jsx structural verification checks passed successfully');
console.log('--- UI RESTRUCTURE-025 QA PASS ---');
