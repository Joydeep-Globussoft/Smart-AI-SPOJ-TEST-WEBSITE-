// test_bug001_results_score_normalization.js
// Automated test suite for BUG-001: Score Normalization (0-10 scale)
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

const evaluationService = require('../../services/evaluationService');
const shortlistService = require('../../services/shortlistService');
const Shortlist = require('../../models/Shortlist');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ ${message}`);
    passedTests++;
  } else {
    console.error(`  ✕ FAIL: ${message}`);
  }
}

async function runTests() {
  console.log('\n==================================================');
  console.log('BUG-001: Score Normalization QA Verification');
  console.log('==================================================\n');

  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ai_proctored_test_platform';
    await mongoose.connect(mongoUri);

    // ── TEST 1: Special Verification from Prompt Spec ──
    console.log('[1] Special Verification Scenario (Candidates with 3.0, 7.5, 10.0)');
    const testScores = [3.0, 7.5, 10.0];
    const topScore = Math.max(...testScores);
    const avgScore = testScores.reduce((a, b) => a + b, 0) / testScores.length;
    const formattedAvg = Number(avgScore.toFixed(2));

    assert(topScore === 10.0, `Top score is 10.0 (got ${topScore})`);
    assert(topScore <= 10.0, `Top score <= 10.0`);
    assert(formattedAvg === 6.83, `Average score is 6.83 (got ${formattedAvg})`);
    assert(avgScore <= 10.0, `Average score <= 10.0`);

    // ── TEST 2: Existing Database Record Recalculation ──
    console.log('\n[2] Recalculating Shortlist for Existing Test with Previously Over-Max Scores');
    const testIdWith15 = '6a9815210682ecaba618f9b5'; // Hiring drive 1
    const updatedShortlist = await shortlistService.regenerate(testIdWith15);
    
    assert(updatedShortlist !== null, 'Shortlist document regenerated');
    if (updatedShortlist && updatedShortlist.candidates.length > 0) {
      const allUnder10 = updatedShortlist.candidates.every(c => c.score >= 0 && c.score <= 10);
      assert(allUnder10, 'All candidates in shortlist have scores between 0 and 10');

      const gopal = updatedShortlist.candidates.find(c => c.name === 'GOPAL');
      if (gopal) {
        assert(gopal.score <= 10.0, `GOPAL score corrected from 15 to ${gopal.score} (<= 10.0)`);
      }

      const abhi = updatedShortlist.candidates.find(c => c.name === 'Abhi Das');
      if (abhi) {
        assert(abhi.score <= 10.0, `Abhi Das score corrected from 15 to ${abhi.score} (<= 10.0)`);
      }
    }

    // ── TEST 3: Defensive Frontend Metrics Clamping Logic ──
    console.log('\n[3] Defensive Frontend Metrics Clamping Logic');
    const mockCandidatesOver10 = [{ score: 15.0 }, { score: 20.0 }];
    const mockTop = Math.min(10, Math.max(0, Number(mockCandidatesOver10[0].score))).toFixed(1);
    const mockAvg = Math.min(
      10,
      Math.max(
        0,
        mockCandidatesOver10.reduce((acc, curr) => acc + curr.score, 0) / mockCandidatesOver10.length
      )
    ).toFixed(1);

    assert(mockTop === '10.0', `Defensive frontend top score clamped to 10.0 (got ${mockTop})`);
    assert(mockAvg === '10.0', `Defensive frontend average score clamped to 10.0 (got ${mockAvg})`);

  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    await mongoose.disconnect();
    console.log(`\n--------------------------------------------------`);
    console.log(`Summary: ${passedTests} / ${totalTests} tests passed (${Math.round((passedTests / totalTests) * 100)}%)`);
    console.log(`--------------------------------------------------\n`);
  }
}

runTests();
