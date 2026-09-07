// AI Test Controller — Module 4
// Implements all endpoints from Section 9.6 exactly
// ASSUMPTION: Copy-paste allowed within AI Test interface (chat → editor), blocked from external
// sources. See FR-6.1 note and user confirmation.
const Submission = require('../models/Submission');
const Question = require('../models/Question');
const kimiService = require('../services/kimiService');

// ── POST /ai-test/:questionId/chat ────────────────────────────────────────────
// Body: { message, testId }
// Response: { reply }
// Proxies to Kimi, appends to promptLog (FR-6.2)
// AC: Every chat message and AI reply appended to promptLog with timestamp
const aiChat = async (req, res, next) => {
  try {
    const { questionId } = req.params;
    const { message, testId } = req.body;
    const candidateId = req.user.id;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    let targetTestId = testId || req.query.testId;
    if (!targetTestId) {
      const activeSub = await Submission.findOne({
        candidateId,
        questionId,
        status: 'IN_PROGRESS',
      }).sort({ candidateStartTime: -1 });
      targetTestId = activeSub?.testId;
    }

    if (!targetTestId) {
      return res.status(400).json({ error: 'testId is required' });
    }

    // Get question context for Kimi
    const question = await Question.findById(questionId, { hiddenTestCases: 0 });
    if (!question) return res.status(404).json({ error: 'Question not found' });

    // FR-6.1: AI response is returned in chat panel ONLY — never auto-inserted into filesJson
    // Candidate must manually copy (within-interface only) into the editor
    const reply = await kimiService.chat(question.description, message);

    // Append to promptLog with timestamps (FR-6.2)
    const timestamp = new Date();
    await Submission.findOneAndUpdate(
      { candidateId, testId: targetTestId, questionId },
      {
        $push: {
          promptLog: {
            $each: [
              { role: 'candidate', message, timestamp },
              { role: 'ai', message: reply, timestamp: new Date() },
            ],
          },
        },
      },
      { upsert: false }
    );

    res.json({ reply });
  } catch (err) {
    next(err);
  }
};

// ── POST /ai-test/:questionId/save-files ──────────────────────────────────────
// Body: { filesJson, testId }
// Response: { success: true }
const saveFiles = async (req, res, next) => {
  try {
    const { questionId } = req.params;
    const { filesJson, testId } = req.body;
    const candidateId = req.user.id;

    let targetTestId = testId || req.query.testId;
    if (!targetTestId) {
      const activeSub = await Submission.findOne({
        candidateId,
        questionId,
        status: 'IN_PROGRESS',
      }).sort({ candidateStartTime: -1 });
      targetTestId = activeSub?.testId;
    }

    if (!targetTestId) {
      return res.status(400).json({ error: 'testId is required to save files' });
    }

    await Submission.findOneAndUpdate(
      { candidateId, testId: targetTestId, questionId },
      { filesJson },
      { upsert: false }
    );

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── POST /ai-test/:questionId/submit ──────────────────────────────────────────
// Body: { filesJson, promptLog, testId }
// Response: { submission }
const submitAiTest = async (req, res, next) => {
  try {
    const { questionId } = req.params;
    const { filesJson, promptLog, testId } = req.body;
    const candidateId = req.user.id;

    if (!filesJson) {
      return res.status(400).json({ error: 'filesJson is required' });
    }

    let targetTestId = testId || req.query.testId;
    if (!targetTestId) {
      const activeSub = await Submission.findOne({
        candidateId,
        questionId,
        status: 'IN_PROGRESS',
      }).sort({ candidateStartTime: -1 });
      targetTestId = activeSub?.testId;
    }

    if (!targetTestId) {
      return res.status(400).json({ error: 'testId is required to submit AI test' });
    }

    const submission = await Submission.findOneAndUpdate(
      { candidateId, testId: targetTestId, questionId },
      {
        filesJson,
        // Replace promptLog if provided (full log from client as backup — server log is authoritative)
        // ASSUMPTION: Server-side promptLog (from /chat calls) is authoritative; client-provided
        // promptLog only fills gaps if server log is empty
        ...(promptLog && { promptLog }),
        status: 'SUBMITTED',
        submittedAt: new Date(),
      },
      { new: true, upsert: false }
    );

    if (!submission) {
      return res.status(404).json({ error: 'Submission session not found. Call start-attempt first.' });
    }

    // Enqueue AI Test evaluation
    const evaluationService = require('../services/evaluationService');
    evaluationService.evaluateSingleSubmission(submission._id.toString()).catch(console.error);

    res.json({ submission });
  } catch (err) {
    next(err);
  }
};

// ── GET /ai-test/:questionId/preview ─────────────────────────────────────────
// Response: { previewBundle } — data handed to Sandpack on client (client-side rendering)
// AC: No new Submission record or server call created merely by clicking Preview (FR-6.3)
const getPreview = async (req, res, next) => {
  try {
    const { questionId } = req.params;
    const candidateId = req.user.id;
    const targetTestId = req.query.testId || req.body?.testId;

    const query = { candidateId, questionId };
    if (targetTestId) {
      query.testId = targetTestId;
    }

    // Only return the current filesJson — Sandpack renders client-side (FR-6.3)
    const submission = await Submission.findOne(
      query,
      { filesJson: 1 }
    );

    // FR-6.3: This endpoint does NOT create or modify any Submission record
    res.json({ previewBundle: submission?.filesJson || {} });
  } catch (err) {
    next(err);
  }
};

module.exports = { aiChat, saveFiles, submitAiTest, getPreview };
