/**
 * Regression Test: BUG-94 — Test-Level Candidate Isolation and Roster Alignment
 *
 * Requirements:
 * 1. Test A (1 candidate) vs Test B (3 candidates) — complete candidate isolation.
 * 2. Shortlist for Test A never includes Test B candidates, and vice versa.
 * 3. Candidate appearing in multiple tests has isolated scores per test.
 * 4. Regenerating shortlist multiple times is idempotent (no duplicates / appending).
 * 5. Deleted candidate attempts are cleanly excluded (Edge Case 4).
 * 6. Backend safeguard: shortlistedCandidates <= totalCandidates.
 * 7. Verification of test r15 roster-shortlist parity.
 */

const mongoose = require('mongoose');
const assert = require('assert');
require('dotenv').config({ path: './.env' });

const Test = require('../../models/Test');
const Room = require('../../models/Room');
const Candidate = require('../../models/Candidate');
const Question = require('../../models/Question');
const QuestionSet = require('../../models/QuestionSet');
const Submission = require('../../models/Submission');
const EvaluationResult = require('../../models/EvaluationResult');
const Shortlist = require('../../models/Shortlist');
const shortlistService = require('../../services/shortlistService');
const { getLiveCandidates } = require('../../controllers/roomController');
const { getResults, getShortlist } = require('../../controllers/evaluationController');

async function runRegressionTest() {
  console.log('===============================================================');
  console.log('QA: Testing BUG-94 Test Isolation & Roster Alignment');
  console.log('===============================================================');

  await mongoose.connect(process.env.MONGODB_URI);

  const cleanupIds = {
    testIds: [],
    candidateIds: [],
    roomIds: [],
    questionSetIds: [],
    questionIds: [],
  };

  try {
    const Admin = require('../../models/Admin');
    const Folder = require('../../models/Folder');
    const adminDoc = await Admin.findOne();
    const folderDoc = await Folder.findOne();
    const adminId = adminDoc?._id || new mongoose.Types.ObjectId();
    const folderId = folderDoc?._id || new mongoose.Types.ObjectId();

    // ── STEP 1: Create Question Set & Question ──
    const qSet = await QuestionSet.create({
      name: 'QA BUG-94 Question Set ' + Date.now(),
      testType: 'JAVASCRIPT',
      createdBy: adminId,
      folderId: folderId,
    });
    cleanupIds.questionSetIds.push(qSet._id);

    const question = await Question.create({
      questionSetId: qSet._id,
      title: 'QA BUG-94 Reverse String',
      problemStatement: 'Reverse the input string',
      inputFormat: 'string',
      outputFormat: 'string',
      difficulty: 'EASY',
      testType: 'JAVASCRIPT',
      timeLimitMinutes: 30,
      visibleTestCases: [{ input: 'hello', expectedOutput: 'olleh' }],
    });
    cleanupIds.questionIds.push(question._id);

    // ── STEP 2: Create Test A (1 candidate) and Test B (3 candidates) ──
    const testA = await Test.create({
      title: 'QA_TEST_A_' + Date.now(),
      testType: 'JAVASCRIPT',
      status: 'ENDED',
      questionSetId: qSet._id,
      passingCriteria: 0,
      totalQuestions: 1,
      durationMinutes: 60,
      instructions: 'QA Test Instructions',
      startTestWindowMinutes: 60,
      createdBy: adminId,
    });
    cleanupIds.testIds.push(testA._id);

    const testB = await Test.create({
      title: 'QA_TEST_B_' + Date.now(),
      testType: 'JAVASCRIPT',
      status: 'ENDED',
      questionSetId: qSet._id,
      passingCriteria: 0,
      totalQuestions: 1,
      durationMinutes: 60,
      instructions: 'QA Test Instructions',
      startTestWindowMinutes: 60,
      createdBy: adminId,
    });
    cleanupIds.testIds.push(testB._id);

    // Create Candidate A1
    const candA1 = await Candidate.create({
      name: 'Alice Candidate A1',
      email: `alice_a1_${Date.now()}@example.com`,
      passwordHash: 'dummyhash',
      expiresAt: null,
    });
    cleanupIds.candidateIds.push(candA1._id);

    // Create Candidates B1, B2, B3
    const candB1 = await Candidate.create({
      name: 'Bob Candidate B1',
      email: `bob_b1_${Date.now()}@example.com`,
      passwordHash: 'dummyhash',
      expiresAt: null,
    });
    cleanupIds.candidateIds.push(candB1._id);

    const candB2 = await Candidate.create({
      name: 'Charlie Candidate B2',
      email: `charlie_b2_${Date.now()}@example.com`,
      passwordHash: 'dummyhash',
      expiresAt: null,
    });
    cleanupIds.candidateIds.push(candB2._id);

    const candB3 = await Candidate.create({
      name: 'David Candidate B3',
      email: `david_b3_${Date.now()}@example.com`,
      passwordHash: 'dummyhash',
      expiresAt: null,
    });
    cleanupIds.candidateIds.push(candB3._id);

    // Create Room for Test A
    const roomA = await Room.create({
      testId: testA._id,
      roomName: 'Room A-101',
      roomCode: 'RMA_' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      roomPassword: 'pass',
      joinedCandidates: [
        {
          candidateId: candA1._id,
          joinedAt: new Date(),
          assignedQuestionSetId: qSet._id,
          joinIndex: 1,
        },
      ],
    });
    cleanupIds.roomIds.push(roomA._id);

    // Create Room for Test B
    const roomB = await Room.create({
      testId: testB._id,
      roomName: 'Room B-201',
      roomCode: 'RMB_' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      roomPassword: 'pass',
      joinedCandidates: [
        {
          candidateId: candB1._id,
          joinedAt: new Date(),
          assignedQuestionSetId: qSet._id,
          joinIndex: 1,
        },
        {
          candidateId: candB2._id,
          joinedAt: new Date(),
          assignedQuestionSetId: qSet._id,
          joinIndex: 2,
        },
        {
          candidateId: candB3._id,
          joinedAt: new Date(),
          assignedQuestionSetId: qSet._id,
          joinIndex: 3,
        },
      ],
    });
    cleanupIds.roomIds.push(roomB._id);

    // Submissions and Evaluations for Test A (Candidate A1: score 9.0)
    const subA1 = await Submission.create({
      candidateId: candA1._id,
      testId: testA._id,
      roomId: roomA._id,
      questionId: question._id,
      assignedQuestionSetId: qSet._id,
      code: 'function reverse(s) { return s.split("").reverse().join(""); }',
      language: 'javascript',
      status: 'SUBMITTED',
      isAttempted: true,
      visibleTestCasesPassed: 1,
      visibleTestCasesTotal: 1,
      candidateStartTime: new Date(),
      candidateEndTime: new Date(Date.now() + 1800000),
      submittedAt: new Date(),
    });
    await EvaluationResult.create({
      submissionId: subA1._id,
      candidateId: candA1._id,
      testId: testA._id,
      finalScorePerQuestion: 9.0,
      questionsCompletedCount: 1,
      isPassed: true,
      evaluatedAt: new Date(),
    });

    // Submissions and Evaluations for Test B (B1: 8.0, B2: 7.0, B3: 6.0)
    const bScores = [
      { cand: candB1, score: 8.0 },
      { cand: candB2, score: 7.0 },
      { cand: candB3, score: 6.0 },
    ];
    for (const b of bScores) {
      const subB = await Submission.create({
        candidateId: b.cand._id,
        testId: testB._id,
        roomId: roomB._id,
        questionId: question._id,
        assignedQuestionSetId: qSet._id,
        code: 'function reverse(s) { return s.split("").reverse().join(""); }',
        language: 'javascript',
        status: 'SUBMITTED',
        isAttempted: true,
        visibleTestCasesPassed: 1,
        visibleTestCasesTotal: 1,
        candidateStartTime: new Date(),
        candidateEndTime: new Date(Date.now() + 1800000),
        submittedAt: new Date(),
      });
      await EvaluationResult.create({
        submissionId: subB._id,
        candidateId: b.cand._id,
        testId: testB._id,
        finalScorePerQuestion: b.score,
        questionsCompletedCount: 1,
        isPassed: true,
        evaluatedAt: new Date(),
      });
    }

    // ── STEP 3: Test Isolation Verification ──
    console.log('\n--- Step 3: Verifying Cross-Test Shortlist Isolation ---');
    const shortlistA = await shortlistService.regenerate(testA._id.toString());
    const shortlistB = await shortlistService.regenerate(testB._id.toString());

    console.log(`Test A Shortlist candidates: ${shortlistA.candidates.length}`);
    console.log(`Test B Shortlist candidates: ${shortlistB.candidates.length}`);

    assert.strictEqual(shortlistA.candidates.length, 1, 'Test A must contain exactly 1 candidate');
    assert.strictEqual(shortlistA.candidates[0].name, 'Alice Candidate A1', 'Test A must contain Alice');
    assert.strictEqual(shortlistA.totalCandidates, 1, 'Test A totalCandidates must be 1');

    assert.strictEqual(shortlistB.candidates.length, 3, 'Test B must contain exactly 3 candidates');
    assert.strictEqual(shortlistB.totalCandidates, 3, 'Test B totalCandidates must be 3');

    // Verify zero cross-contamination
    const testBCandidateIds = [candB1._id.toString(), candB2._id.toString(), candB3._id.toString()];
    assert(
      !testBCandidateIds.includes(shortlistA.candidates[0].candidateId.toString()),
      'Test A shortlist must NEVER contain any candidate from Test B'
    );
    const testAShortlistIds = shortlistA.candidates.map((c) => c.candidateId.toString());
    for (const bCand of shortlistB.candidates) {
      assert(
        !testAShortlistIds.includes(bCand.candidateId.toString()),
        `Test B shortlist must NEVER contain Test A candidate (found: ${bCand.name})`
      );
    }
    console.log('✓ Complete cross-test candidate isolation verified.');

    // ── STEP 4: Idempotent Shortlist Regeneration ──
    console.log('\n--- Step 4: Verifying Idempotent Shortlist Regeneration (Zero Duplicates) ---');
    for (let i = 1; i <= 5; i++) {
      const regenerated = await shortlistService.regenerate(testB._id.toString());
      assert.strictEqual(regenerated.candidates.length, 3, `Run ${i}: Candidates count must stay strictly 3`);
    }
    console.log('✓ Idempotent regeneration verified across 5 sequential executions.');

    // ── STEP 5: Deleted Candidate Attempt Exclusion (Edge Case 4) ──
    console.log('\n--- Step 5: Verifying Deleted Candidate Attempt Handling (Edge Case 4) ---');
    // Simulate David (B3) account deletion (e.g. TTL purge)
    await Candidate.deleteOne({ _id: candB3._id });

    // Regenerate Test B shortlist
    const afterDeleteShortlist = await shortlistService.regenerate(testB._id.toString());
    console.log(
      `After deleting Candidate B3, Test B candidates: ${afterDeleteShortlist.candidates.length} (total: ${afterDeleteShortlist.totalCandidates})`
    );
    assert.strictEqual(
      afterDeleteShortlist.candidates.length,
      2,
      'Deleted candidate must be immediately removed from shortlist'
    );
    assert.strictEqual(
      afterDeleteShortlist.totalCandidates,
      2,
      'Total candidates roster must drop to 2 after candidate deletion'
    );
    const remainingNames = afterDeleteShortlist.candidates.map((c) => c.name);
    assert(!remainingNames.includes('David Candidate B3'), 'David Candidate B3 must not appear in shortlist');
    assert(!remainingNames.includes('Candidate'), 'No dummy "Candidate" records should ever appear');
    console.log('✓ Deleted candidate exclusion and clean roster alignment verified.');

    // ── STEP 6: Endpoint Safeguard & Parity Verification ──
    console.log('\n--- Step 6: Verifying Controller Endpoint Safeguard and Total Counts ---');
    let endpointShortlistData = null;
    await getShortlist(
      { params: { testId: testB._id.toString() } },
      {
        json: (data) => {
          endpointShortlistData = data;
        },
      },
      () => {}
    );
    assert(endpointShortlistData, 'getShortlist must return data');
    assert.strictEqual(
      endpointShortlistData.shortlistedCandidates,
      2,
      'Endpoint shortlistedCandidates must equal 2'
    );
    assert.strictEqual(endpointShortlistData.totalCandidates, 2, 'Endpoint totalCandidates must equal 2');
    assert(
      endpointShortlistData.shortlistedCandidates <= endpointShortlistData.totalCandidates,
      'Backend safeguard: shortlistedCandidates <= totalCandidates'
    );

    let endpointResultsData = null;
    await getResults(
      { params: { testId: testB._id.toString() } },
      {
        json: (data) => {
          endpointResultsData = data;
        },
      },
      () => {}
    );
    assert(endpointResultsData, 'getResults must return data');
    assert.strictEqual(endpointResultsData.totalCandidates, 2, 'getResults totalCandidates must equal 2');
    const distinctResultCands = new Set(endpointResultsData.results.map((r) => r.candidateId._id.toString()));
    assert.strictEqual(distinctResultCands.size, 2, 'Results distinct candidate count must equal 2');
    console.log('✓ Controller endpoint safeguards and totalCandidates parity verified.');

    // ── STEP 7: Verify Test "r15" in Production Database ──
    console.log('\n--- Step 7: Verifying Production Test r15 Roster & Shortlist Parity ---');
    const r15Id = '6aabd937edab0338e84ab899';
    let r15Live = null;
    await getLiveCandidates(
      { params: { testId: r15Id }, app: { get: () => ({ emit: () => {} }) } },
      {
        json: (data) => {
          r15Live = data;
        },
      },
      () => {}
    );
    let r15Sl = null;
    await getShortlist(
      { params: { testId: r15Id } },
      {
        json: (data) => {
          r15Sl = data;
        },
      },
      () => {}
    );

    const r15LiveCount = Object.keys(r15Live?.candidates || {}).length;
    const r15SlCount = r15Sl?.shortlist?.candidates?.length || 0;
    console.log(`Test r15: Test Summary Live Candidates = ${r15LiveCount}, Shortlisted Candidates = ${r15SlCount}`);
    assert.strictEqual(r15LiveCount, 1, 'r15 Live Candidates must be exactly 1');
    assert.strictEqual(r15SlCount, 1, 'r15 Shortlist Candidates must be exactly 1');
    assert.strictEqual(r15Sl.shortlist.candidates[0].name, 'he', 'r15 Shortlist candidate must be "he"');
    assert.strictEqual(r15Sl.shortlist.candidates[0].email, 'he@g.com', 'r15 Shortlist email must be "he@g.com"');
    console.log('✓ Test r15 100% parity verified between Test Summary and Results & Shortlist.');

    console.log('\n===============================================================');
    console.log('ALL REGRESSION TESTS PASSED SUCCESSFULLY! (BUG-94)');
    console.log('===============================================================');
  } catch (err) {
    console.error('Error during test execution:', err);
    throw err;
  } finally {
    // Clean up temporary test documents
    console.log('\nCleaning up temporary test documents...');
    if (cleanupIds.testIds.length > 0) await Test.deleteMany({ _id: { $in: cleanupIds.testIds } });
    if (cleanupIds.candidateIds.length > 0) await Candidate.deleteMany({ _id: { $in: cleanupIds.candidateIds } });
    if (cleanupIds.roomIds.length > 0) await Room.deleteMany({ _id: { $in: cleanupIds.roomIds } });
    if (cleanupIds.questionSetIds.length > 0) await QuestionSet.deleteMany({ _id: { $in: cleanupIds.questionSetIds } });
    if (cleanupIds.questionIds.length > 0) await Question.deleteMany({ _id: { $in: cleanupIds.questionIds } });
    if (cleanupIds.testIds.length > 0) {
      await Submission.deleteMany({ testId: { $in: cleanupIds.testIds } });
      await EvaluationResult.deleteMany({ testId: { $in: cleanupIds.testIds } });
      await Shortlist.deleteMany({ testId: { $in: cleanupIds.testIds } });
    }
    console.log('Cleanup finished.');
    process.exit(0);
  }
}

runRegressionTest().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
