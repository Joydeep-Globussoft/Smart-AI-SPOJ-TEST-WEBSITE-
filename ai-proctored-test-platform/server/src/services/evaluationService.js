// Evaluation Service — Module 7
// Implements FR-9.1 through FR-9.4 (Evaluation Engine)
// Triggered after submission: runs Judge0 on hidden test cases, LLM scoring, computes weighted score
const Submission = require('../models/Submission');
const EvaluationResult = require('../models/EvaluationResult');
const Question = require('../models/Question');
const Test = require('../models/Test');
const judge0Service = require('./judge0Service');
const kimiService = require('./kimiService');

/**
 * FR-9.4: Weighted scoring formula for standard coding tests
 * Sum of weights = 1.0 (100%), Normalized to 0-10 scale
 */
const computeStandardScore = (breakdown) => {
  const score =
    (breakdown.codeCorrectness || 0) * 0.30 +
    (breakdown.testCasePassPercent || 0) * 0.10 +
    (breakdown.timeComplexity || 0) * 0.15 +
    (breakdown.spaceComplexity || 0) * 0.10 +
    (breakdown.codeStructure || 0) * 0.10 +
    (breakdown.problemSolvingApproach || 0) * 0.08 +
    (breakdown.exceptionHandling || 0) * 0.08 +
    (breakdown.inputValidation || 0) * 0.05 +
    (breakdown.codeOptimization || 0) * 0.02 +
    (breakdown.linesOfCode || 0) * 0.02;

  if (isNaN(score)) return 0;
  if (score < 0 || score > 10) {
    console.warn(`[Eval] Standard score out of bounds (${score}), clamping to [0, 10].`);
  }
  return Math.min(10, Math.max(0, score));
};

/**
 * FR-9.4: Weighted scoring formula for AI Test
 * Sum of weights = 1.0 (100%), Normalized to 0-10 scale
 */
const computeAiTestScore = (breakdown) => {
  const score =
    (breakdown.promptQuality || 0) * 0.60 +
    (breakdown.outputCorrectnessDesign || 0) * 0.40;

  if (isNaN(score)) return 0;
  if (score < 0 || score > 10) {
    console.warn(`[Eval] AI Test score out of bounds (${score}), clamping to [0, 10].`);
  }
  return Math.min(10, Math.max(0, score));
};

/**
 * Evaluate a single submission (called after each question submit).
 * @param {string} submissionId
 */
const evaluateSingleSubmission = async (submissionId) => {
  try {
    const submission = await Submission.findById(submissionId).populate('questionId');
    if (!submission) {
      console.error(`[Eval] Submission not found: ${submissionId}`);
      return;
    }

    const question = await Question.findById(submission.questionId);
    if (!question) {
      console.error(`[Eval] Question not found for submission ${submissionId}`);
      return;
    }

    let scoreBreakdown = {};
    let finalScorePerQuestion = 0;

    if (question.testType === 'AI_TEST') {
      // FR-9.3: AI Test scoring
      // promptQuality (60%): score promptLog via Kimi
      const promptResult = await kimiService.scorePromptLog(
        submission.promptLog || [],
        question.description
      );

      // outputCorrectnessDesign (40%): heuristic HTML/CSS validation
      // ASSUMPTION: Using heuristic HTML validation since vision-capable judging requires
      // additional setup. Score based on file completeness and basic validation.
      const outputScore = evaluateOutputCorrectnessDesign(submission.filesJson, question);

      scoreBreakdown = {
        promptQuality: promptResult.promptQuality,
        outputCorrectnessDesign: outputScore,
      };
      finalScorePerQuestion = computeAiTestScore(scoreBreakdown);
    } else {
      // Standard coding test (SPOJ, REACT, JAVASCRIPT)
      // FR-9.1: Run against hidden test cases via Judge0
      const hiddenTestCases = question.hiddenTestCases || [];
      let hiddenPassed = 0;
      let hiddenTotal = hiddenTestCases.length;

      if (hiddenTotal > 0 && submission.code) {
        try {
          const hiddenResults = await judge0Service.runAgainstTestCases(
            submission.code,
            submission.language,
            hiddenTestCases
          );

          hiddenPassed = hiddenResults.filter((r, i) => {
            const expected = hiddenTestCases[i]?.expectedOutput?.trim();
            const actual = r.stdout?.trim();
            return actual === expected;
          }).length;

          // Update submission with hidden test case results
          await Submission.findByIdAndUpdate(submissionId, {
            hiddenTestCasesPassed: hiddenPassed,
            hiddenTestCasesTotal: hiddenTotal,
          });
        } catch (err) {
          console.error('[Eval] Judge0 hidden test cases error:', err);
        }
      }

      // FR-9.1: codeCorrectness (30%) from hidden test cases
      const codeCorrectness = hiddenTotal > 0 ? (hiddenPassed / hiddenTotal) * 10 : 0;

      // FR-9.1: testCasePassPercent (10%) from visible test cases
      const visiblePassPercent =
        submission.visibleTestCasesTotal > 0
          ? (submission.visibleTestCasesPassed / submission.visibleTestCasesTotal) * 10
          : 0;

      // FR-9.2: LLM-based code quality scoring
      let llmScores = {
        timeComplexity: 5,
        spaceComplexity: 5,
        codeStructure: 5,
        problemSolvingApproach: 5,
        exceptionHandling: 5,
        inputValidation: 5,
        codeOptimization: 5,
        linesOfCode: 5,
      };

      if (submission.code) {
        try {
          llmScores = await kimiService.scoreCodeQuality(
            submission.code,
            submission.language,
            question.description
          );
        } catch (err) {
          console.error('[Eval] LLM code quality scoring error:', err);
        }
      }

      scoreBreakdown = {
        codeCorrectness,
        testCasePassPercent: visiblePassPercent,
        ...llmScores,
      };
      finalScorePerQuestion = computeStandardScore(scoreBreakdown);
    }

    // questionsCompletedCount: visible test cases ratio (for live progress, FR-5.5)
    const questionsCompletedCount =
      submission.visibleTestCasesTotal > 0
        ? Math.min(1.0, submission.visibleTestCasesPassed / submission.visibleTestCasesTotal)
        : 0;

    // Get test passing criteria
    const test = await Test.findById(submission.testId, 'passingCriteria');

    // Save EvaluationResult
    await EvaluationResult.findOneAndUpdate(
      { submissionId: submission._id },
      {
        submissionId: submission._id,
        candidateId: submission.candidateId,
        testId: submission.testId,
        scoreBreakdown,
        finalScorePerQuestion,
        questionsCompletedCount,
        // isPassed computed after all questions evaluated (in aggregation step)
        isPassed: false, // will be updated in runFinalEvaluationPass
        evaluatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    console.log(
      `[Eval] Submission ${submissionId}: score=${finalScorePerQuestion.toFixed(2)}`
    );
  } catch (err) {
    console.error('[Eval] evaluateSingleSubmission error:', err);
  }
};

/**
 * Run final evaluation pass for all submissions in a test (triggered on test:end).
 * Aggregates per-candidate scores and sets isPassed.
 * @param {string} testId
 */
const runFinalEvaluationPass = async (testId) => {
  try {
    const test = await Test.findById(testId);
    if (!test) return;

    // Auto-mark any remaining IN_PROGRESS submissions as AUTO_SUBMITTED_TIME_UP
    await Submission.updateMany(
      { testId, status: 'IN_PROGRESS' },
      { status: 'AUTO_SUBMITTED_TIME_UP', submittedAt: new Date() }
    );

    // Find all submissions for this test
    const pendingSubmissions = await Submission.find({
      testId,
      status: { $in: ['SUBMITTED', 'AUTO_SUBMITTED_TIME_UP', 'AUTO_SUBMITTED_DISQUALIFIED'] },
    });

    for (const sub of pendingSubmissions) {
      await evaluateSingleSubmission(sub._id.toString());
    }

    // Aggregate per-candidate total scores
    await aggregateCandidateScores(testId, test.passingCriteria);

    // Regenerate shortlist
    const shortlistService = require('./shortlistService');
    await shortlistService.regenerate(testId);

    console.log(`[Eval] Final evaluation pass complete for test ${testId}`);
  } catch (err) {
    console.error('[Eval] runFinalEvaluationPass error:', err);
  }
};

/**
 * Evaluate all submissions for a specific candidate in a test.
 * Called after submit-all or auto-submit.
 */
const evaluateCandidateSubmissions = async (candidateId, testId) => {
  const submissions = await Submission.find({
    candidateId,
    testId,
    status: { $in: ['SUBMITTED', 'AUTO_SUBMITTED_TIME_UP', 'AUTO_SUBMITTED_DISQUALIFIED'] },
  });

  for (const sub of submissions) {
    await evaluateSingleSubmission(sub._id.toString());
  }

  const test = await Test.findById(testId, 'passingCriteria');
  if (test) {
    await aggregateCandidateScores(testId, test.passingCriteria, candidateId);
  }
};

/**
 * Aggregate per-candidate scores and set isPassed.
 */
const aggregateCandidateScores = async (testId, passingCriteria, specificCandidateId = null) => {
  const match = specificCandidateId
    ? { testId, candidateId: specificCandidateId }
    : { testId };

  const results = await EvaluationResult.find(match);

  // Group by candidateId
  const byCandidate = {};
  for (const r of results) {
    const cid = r.candidateId.toString();
    if (!byCandidate[cid]) byCandidate[cid] = [];
    byCandidate[cid].push(r);
  }

  // For each candidate, sum questionsCompletedCount and check passing criteria
  for (const [candidateId, candidateResults] of Object.entries(byCandidate)) {
    const totalCompleted = candidateResults.reduce(
      (sum, r) => sum + (r.questionsCompletedCount || 0),
      0
    );
    const isPassed = totalCompleted >= passingCriteria;

    await EvaluationResult.updateMany(
      { candidateId, testId },
      { $set: { isPassed } }
    );
  }
};

/**
 * Heuristic output correctness/design scoring for AI Test (FR-9.3)
 * Used when LLM vision judging is not available.
 */
const evaluateOutputCorrectnessDesign = (filesJson, question) => {
  if (!filesJson || Object.keys(filesJson).length === 0) return 0;

  let score = 0;

  // Check required files are present
  const requiredFiles = question.aiTestBriefFiles?.map((f) => f.fileName) || ['index.html'];
  const submittedFiles = Object.keys(filesJson);
  const presentFiles = requiredFiles.filter((f) => submittedFiles.includes(f));
  score += (presentFiles.length / Math.max(requiredFiles.length, 1)) * 3; // up to 3 points

  // Check HTML file has basic structure
  const htmlContent = filesJson['index.html'] || '';
  if (htmlContent.includes('<!DOCTYPE') || htmlContent.includes('<html')) score += 1;
  if (htmlContent.includes('<head') && htmlContent.includes('<body')) score += 1;
  if (htmlContent.includes('<title')) score += 0.5;

  // Check CSS is present and non-trivial
  const cssContent = filesJson['style.css'] || filesJson['styles.css'] || '';
  if (cssContent.length > 100) score += 1;
  if (cssContent.includes('@media') || cssContent.includes('flex') || cssContent.includes('grid')) {
    score += 0.5; // responsive/modern CSS
  }

  // Check JS if applicable
  const jsContent = filesJson['script.js'] || filesJson['index.js'] || '';
  if (jsContent.length > 50) score += 1;

  return Math.min(10, score); // cap at 10
};

module.exports = {
  evaluateSingleSubmission,
  runFinalEvaluationPass,
  evaluateCandidateSubmissions,
  aggregateCandidateScores,
};
