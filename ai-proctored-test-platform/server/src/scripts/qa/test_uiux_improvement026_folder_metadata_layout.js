import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('--- Starting QA Test: UI/UX IMPROVEMENT-026 (Folder Card Metadata Single-Row Layout) ---');

const qbankFile = path.resolve(__dirname, '../../../../client/src/admin/pages/AdminQuestionBank.jsx');
const content = fs.readFileSync(qbankFile, 'utf8');

// 1. Check that Set Count and Created Date are rendered within the same flex wrapper
assert(
  content.includes("justifyContent: 'space-between'") &&
  content.includes('{setCount} {setCount === 1 ? \'Set\' : \'Sets\'} · {totalQ} Qs') &&
  content.includes('Created: {formatDateTime(f.createdAt)}'),
  'Failed: Set Count / Qs and Created Date must be in the same row'
);

// 2. Check responsive flexWrap
assert(
  content.includes("flexWrap: 'wrap', gap: 6"),
  'Failed: flexWrap and gap must be applied for responsive behavior'
);

// 3. Check formatQuestionTitle from UI RESTRUCTURE-025 is preserved
assert(
  content.includes('formatQuestionTitle(q, idx)'),
  'Failed: formatQuestionTitle must remain preserved (UI RESTRUCTURE-025)'
);

// 4. Check formatDateTime from FEATURE-035 is preserved
assert(
  content.includes('export const formatDateTime ='),
  'Failed: formatDateTime helper must be preserved (FEATURE-035)'
);

console.log('✓ All folder card metadata layout checks passed successfully');
console.log('--- UI/UX IMPROVEMENT-026 QA PASS ---');
