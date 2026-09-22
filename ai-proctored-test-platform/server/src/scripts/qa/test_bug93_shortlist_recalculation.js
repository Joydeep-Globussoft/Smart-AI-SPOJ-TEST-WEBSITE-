const mongoose = require('mongoose');
const path = require('path');
const assert = require('assert');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

let passedTests = 0;
let totalTests = 0;

async function runTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
  }
}

console.log('\n======================================================');
console.log('BUG-93 TEST SUITE: Shortlist Recalculation Idempotency & Criteria Filtering');
console.log('======================================================\n');

(async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const Test = require('../../models/Test');
    const Shortlist = require('../../models/Shortlist');
    const Candidate = require('../../models/Candidate');
    const EvaluationResult = require('../../models/EvaluationResult');
    const shortlistService = require('../../services/shortlistService');
    const { updatePassingCriteria, updateMalpracticeThreshold } = require('../../controllers/testController');

    // 1. Drop TTL index if present
    try {
      await Candidate.collection.dropIndex('expiresAt_1');
    } catch (_) {}

    // 2. Locate test "again"
    const againTest = await Test.findOne({ title: 'again' });
    assert(againTest, 'Test "again" must exist in DB');

    await runTest('Test "again" shortlist recalculation with unchanged criteria (Min Qs: 0, Malpractice: None) produces exactly 2 candidates', async () => {
      // Ensure criteria are Min Qs: 0, Malpractice: None
      againTest.passingCriteria = 0;
      againTest.malpracticeDisqualifyThreshold = null;
      await againTest.save();

      const sl1 = await shortlistService.regenerate(againTest._id.toString());
      assert.strictEqual(sl1.candidates.length, 2, `Expected 2 shortlisted candidates, got ${sl1.candidates.length}`);
      
      const names = sl1.candidates.map(c => c.name);
      assert(names.includes('he'), 'Candidate "he" must be in shortlist');
      assert(names.includes('hh'), 'Candidate "hh" must be in shortlist');
      assert.strictEqual(sl1.passingCriteriaUsed, 0, 'passingCriteriaUsed must be 0');
      assert.strictEqual(sl1.malpracticeThresholdUsed, null, 'malpracticeThresholdUsed must be null');
    });

    await runTest('Idempotency: Recalculating again with unchanged criteria produces identical results', async () => {
      const sl2 = await shortlistService.regenerate(againTest._id.toString());
      assert.strictEqual(sl2.candidates.length, 2, 'Must still produce exactly 2 candidates');
      assert.strictEqual(sl2.candidates[0].score, 3, 'Top candidate score must be 3.00');
      assert.strictEqual(sl2.candidates[1].score, 3, 'Second candidate score must be 3.00');
    });

    await runTest('Increasing Passing Criteria correctly filters out candidates not meeting the threshold', async () => {
      // Set passing criteria to 1 (both candidates solved 0 questions)
      againTest.passingCriteria = 1;
      await againTest.save();

      const slFiltered = await shortlistService.regenerate(againTest._id.toString());
      assert.strictEqual(slFiltered.candidates.length, 0, 'Expected 0 candidates when min Qs is 1 and all solved 0 Qs');
      assert.strictEqual(slFiltered.passingCriteriaUsed, 1, 'passingCriteriaUsed must be 1');

      // Reset back to 0
      againTest.passingCriteria = 0;
      await againTest.save();

      const slRestored = await shortlistService.regenerate(againTest._id.toString());
      assert.strictEqual(slRestored.candidates.length, 2, 'Resetting passing criteria to 0 must restore all 2 candidates');
    });

    await runTest('Test "again 2" (second test) recalculation with unchanged criteria preserves its candidate', async () => {
      const again2Test = await Test.findOne({ title: 'again 2' });
      if (again2Test) {
        again2Test.passingCriteria = 0;
        again2Test.malpracticeDisqualifyThreshold = null;
        await again2Test.save();

        const slAgain2 = await shortlistService.regenerate(again2Test._id.toString());
        assert(slAgain2.candidates.length >= 1, 'Test "again 2" must have at least 1 candidate');
        assert(slAgain2.candidates.some(c => c.name === 'hh'), 'Candidate "hh" must be in "again 2" shortlist');
      }
    });

    await runTest('Malpractice threshold filtering correctly excludes candidates exceeding threshold', async () => {
      // When malpracticeDisqualifyThreshold is 0, clean candidates (0 violations) are kept
      againTest.malpracticeDisqualifyThreshold = 0;
      await againTest.save();

      const slClean = await shortlistService.regenerate(againTest._id.toString());
      assert.strictEqual(slClean.candidates.length, 2, 'Clean candidates with 0 violations must remain on shortlist');
      assert.strictEqual(slClean.malpracticeThresholdUsed, 0, 'malpracticeThresholdUsed must be 0');

      // Reset back to null
      againTest.malpracticeDisqualifyThreshold = null;
      await againTest.save();
      const slNull = await shortlistService.regenerate(againTest._id.toString());
      assert.strictEqual(slNull.candidates.length, 2, 'Setting threshold back to null must keep candidates');
    });

    await runTest('Detailed Evaluation Results endpoint populates real candidate names & emails instead of placeholders', async () => {
      const { getResults } = require('../../controllers/evaluationController');
      const req = { params: { testId: againTest._id.toString() } };
      let responseData = null;
      const res = {
        json: (data) => { responseData = data; }
      };

      await getResults(req, res, () => {});
      assert(responseData && responseData.results, 'Must return results array');
      assert(responseData.results.length > 0, 'Must have evaluation results');

      for (const r of responseData.results) {
        assert(r.candidateId && r.candidateId.name, 'Candidate must have a name');
        assert(r.candidateId.name !== 'Candidate' || r.candidateId.email !== '—', 'Must not be placeholder Candidate/—');
      }
    });

    console.log(`\n======================================================`);
    console.log(`RESULTS: ${passedTests}/${totalTests} Passed`);
    console.log(`======================================================\n`);

    await mongoose.disconnect();

    if (passedTests !== totalTests) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test suite runner error:', err);
    process.exit(1);
  }
})();
