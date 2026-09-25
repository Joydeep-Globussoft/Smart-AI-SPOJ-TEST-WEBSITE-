const mongoose = require('mongoose');
const path = require('path');
const assert = require('assert');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const Question = require('../../models/Question');
const QuestionSet = require('../../models/QuestionSet');
const Folder = require('../../models/Folder');

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

async function verifyLiveDb() {
  console.log('\n======================================================');
  console.log('🧪 LIVE DB VERIFICATION: FEATURE-041 QUESTION SET TITLES');
  console.log('======================================================\n');

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/spoj_test_platform');

  const sets = await QuestionSet.find({}).populate('questionIds');
  console.log(`Found ${sets.length} Question Sets in database.`);

  let totalQuestionsChecked = 0;
  let pdfQuestionsChecked = 0;

  for (const set of sets) {
    if (!set.questionIds || set.questionIds.length === 0) continue;

    console.log(`\nChecking Question Set: "${set.name}" (${set.questionIds.length} questions)`);

    set.questionIds.forEach((q, idx) => {
      totalQuestionsChecked++;
      const formatted = formatQuestionTitle(q, idx);
      const hasPdfPrefix = /\.pdf\s*[\|\:\-–—]/i.test(formatted) || /\.pdf\s*\(/i.test(formatted);

      if (q.isPdfImported) {
        pdfQuestionsChecked++;
      }

      console.log(`  Q${idx + 1}: Raw Title="${q.title || '(empty)'}", isPdf=${q.isPdfImported}, PDF="${q.pdfFileName || q.pdfOriginalName || 'N/A'}" -> Rendered Title="${formatted}"`);
      assert(!hasPdfPrefix, `Rendered title "${formatted}" must not have .pdf prefix!`);
    });
  }

  console.log(`\n✅ Verified ${totalQuestionsChecked} total questions across ${sets.length} sets (${pdfQuestionsChecked} PDF questions).`);
  console.log('✅ All rendered titles are completely clean and free of redundant PDF filename prefixes!\n');

  await mongoose.disconnect();
}

verifyLiveDb().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
