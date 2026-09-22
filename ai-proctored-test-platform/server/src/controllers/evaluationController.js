// Evaluation Controller — Module 7 + Reports Module 8
// Implements all endpoints from Section 9.7 exactly
const Test = require('../models/Test');
const Candidate = require('../models/Candidate');
const Question = require('../models/Question');
const QuestionSet = require('../models/QuestionSet');
const Room = require('../models/Room');
const Submission = require('../models/Submission');
const EvaluationResult = require('../models/EvaluationResult');
const Shortlist = require('../models/Shortlist');
const MalpracticeLog = require('../models/MalpracticeLog');
const shortlistService = require('../services/shortlistService');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// ── GET /tests/:testId/results ────────────────────────────────────────────────
// Response: { results: [], testId, totalCandidates } (per-candidate scores)
const getResults = async (req, res, next) => {
  try {
    const { testId } = req.params;

    // Fetch valid candidates enrolled in this test
    const { validCandidateIds, totalCandidates } = await shortlistService.getEnrolledTestCandidates(testId);

    const rawResults = await EvaluationResult.find({
      testId,
      candidateId: { $in: validCandidateIds },
    })
      .populate('candidateId', 'name email phone isDisqualified')
      .sort({ finalScorePerQuestion: -1 })
      .lean();

    // Defensively keep only results where candidateId was properly populated
    const results = rawResults.filter((r) => r.candidateId && r.candidateId._id);

    res.json({ results, testId, totalCandidates });
  } catch (err) {
    next(err);
  }
};

// ── GET /tests/:testId/shortlist ──────────────────────────────────────────────
const getShortlist = async (req, res, next) => {
  try {
    const { testId } = req.params;
    let shortlist = await Shortlist.findOne({ testId });
    if (!shortlist) {
      shortlist = await shortlistService.regenerate(testId);
    }
    const totalCandidates =
      shortlist.totalCandidates !== undefined
        ? shortlist.totalCandidates
        : (await shortlistService.getEnrolledTestCandidates(testId)).totalCandidates;

    res.json({
      shortlist,
      testId,
      totalCandidates,
      shortlistedCandidates: shortlist.candidates?.length || 0,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /tests/:testId/shortlist/regenerate ──────────────────────────────────
// Manual trigger (also auto-triggered by passing-criteria/malpractice-threshold PATCH)
const regenerateShortlist = async (req, res, next) => {
  try {
    const { testId } = req.params;
    const shortlist = await shortlistService.regenerate(testId);
    res.json({
      shortlist,
      testId,
      totalCandidates: shortlist.totalCandidates || 0,
      shortlistedCandidates: shortlist.candidates?.length || 0,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /tests/:testId/shortlist/export-pdf ───────────────────────────────────
// AC: PDF includes Globussoft letterhead (Section 14), candidate names/emails/scores (FR-10.2)
const exportShortlistPdf = async (req, res, next) => {
  try {
    const { testId } = req.params;
    const test = await Test.findById(testId);
    if (!test) return res.status(404).json({ error: 'Test not found' });

    const shortlist = await Shortlist.findOne({ testId });
    if (!shortlist) return res.status(404).json({ error: 'Shortlist not yet generated' });

    // Generate PDF with pdfkit (FR-10.2)
    const doc = new PDFDocument({ size: 'A4', margin: 50 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="shortlist-${testId}.pdf"`
    );
    doc.pipe(res);

    // ── Globussoft Letterhead (Section 14) ──────────────────────────────────
    // Clean letterhead banner with official Globussoft logo
    doc
      .rect(0, 0, doc.page.width, 105)
      .fill('#ffffff');

    doc
      .rect(0, 102, doc.page.width, 3)
      .fill('#0E7C86');

    const logoPath = path.join(__dirname, '../assets/globussoft-logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 18, { height: 68, fit: [180, 68] });
    } else {
      doc
        .fillColor('#0E7C86')
        .font('Helvetica-Bold')
        .fontSize(22)
        .text('Globussoft Technology', 50, 25);

      doc
        .font('Helvetica')
        .fontSize(11)
        .text('Technology Ahead of Time', 50, 55);
    }

    doc
      .fillColor('#4b5563')
      .font('Helvetica')
      .fontSize(9)
      .text(
        'Globussoft Technology\n1st Floor, Uday Mansion, Koramangala Industrial Layout,\nKoramangala, Bengaluru, Karnataka 560034',
        280,
        28,
        { align: 'right', width: 265 }
      );

    // ── Report Title ─────────────────────────────────────────────────────────
    doc
      .fillColor('#1A2B3C')
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(`Candidate Shortlist Report`, 50, 120);

    doc
      .fillColor('#444444')
      .font('Helvetica')
      .fontSize(11)
      .text(`Test: ${test.title}`, 50, 145)
      .text(`Generated: ${new Date(shortlist.generatedAt).toLocaleString()}`, 50, 162)
      .text(`Passing Criteria: ${shortlist.passingCriteriaUsed} questions`, 50, 179)
      .text(
        `Malpractice Threshold: ${shortlist.malpracticeThresholdUsed ?? 'Not set'}`,
        50,
        196
      );

    // ── Table Header ─────────────────────────────────────────────────────────
    const tableTop = 230;
    const colWidths = [50, 160, 180, 70, 60];
    const cols = ['Rank', 'Name', 'Email', 'Score', 'Questions'];

    doc
      .rect(50, tableTop, 510, 24)
      .fill('#0E7C86');
    doc.fillColor('white').font('Helvetica-Bold').fontSize(10);

    let xPos = 55;
    cols.forEach((col, i) => {
      doc.text(col, xPos, tableTop + 7, { width: colWidths[i] });
      xPos += colWidths[i];
    });

    // ── Table Rows ────────────────────────────────────────────────────────────
    doc.fillColor('#1A2B3C').font('Helvetica').fontSize(9);
    shortlist.candidates.forEach((c, idx) => {
      const rowY = tableTop + 24 + idx * 22;
      if (idx % 2 === 0) {
        doc.rect(50, rowY, 510, 22).fill('#F7F9FA');
      }
      doc.fillColor('#1A2B3C');
      let rx = 55;
      const rowData = [
        c.rank,
        c.name,
        c.email,
        (c.score || 0).toFixed(2),
        (c.questionsCompleted || 0).toFixed(1),
      ];
      rowData.forEach((val, i) => {
        doc.text(String(val), rx, rowY + 6, { width: colWidths[i] });
        rx += colWidths[i];
      });
    });

    // ── Footer ────────────────────────────────────────────────────────────────
    doc
      .moveTo(50, doc.page.height - 60)
      .lineTo(doc.page.width - 50, doc.page.height - 60)
      .stroke('#0E7C86');
    doc
      .fillColor('#888888')
      .fontSize(8)
      .text(
        'Confidential — For internal use only by Globussoft Technology HR team.',
        50,
        doc.page.height - 45,
        { align: 'center' }
      );

    doc.end();
  } catch (err) {
    next(err);
  }
};

// ── GET /submissions/:submissionId/copy-paste-log ─────────────────────────────
const getCopyPasteLog = async (req, res, next) => {
  try {
    const { submissionId } = req.params;
    const submission = await Submission.findById(submissionId, 'candidateId promptLog');
    if (!submission) return res.status(404).json({ error: 'Submission not found' });
    // Copy-paste events are tracked client-side and embedded in submission metadata
    // ASSUMPTION: Copy-paste events stored in promptLog for AI Test; for standard test
    // they are prevented at browser level (FR-5.4), so this log may be empty
    res.json({ events: submission.promptLog || [] });
  } catch (err) {
    next(err);
  }
};

// ── GET /tests/:testId/candidates/:candidateId/evaluations ────────────────────
// FEATURE-023: Per-candidate drill-down showing all questions, submissions & evaluations
const getCandidateEvaluationDetail = async (req, res, next) => {
  try {
    const { testId, candidateId } = req.params;

    const test = await Test.findById(testId).lean();
    if (!test) return res.status(404).json({ error: 'Test not found' });

    // 1. Verify candidate exists and is enrolled in this test
    const [candidateDoc, roomJoined, subExists] = await Promise.all([
      Candidate.findById(candidateId, 'name email phone isDisqualified').lean(),
      Room.exists({ testId, 'joinedCandidates.candidateId': candidateId }),
      Submission.exists({ testId, candidateId }),
    ]);

    if (!roomJoined && !subExists) {
      return res.status(404).json({ error: 'Candidate is not enrolled in this test' });
    }

    if (!candidateDoc) {
      return res.status(404).json({ error: 'Candidate account not found or deleted' });
    }

    const candidate = candidateDoc;

    // 2. Fetch all Submissions and EvaluationResults for this candidate in this test
    const submissions = await Submission.find({ testId, candidateId }).lean();
    const evaluations = await EvaluationResult.find({ testId, candidateId }).lean();

    // 3. Resolve assignedQuestionSetId for this candidate (supporting FEATURE-012 Round-Robin)
    let assignedQuestionSetId = null;

    // Check submissions first
    for (const sub of submissions) {
      if (sub.assignedQuestionSetId) {
        assignedQuestionSetId = sub.assignedQuestionSetId;
        break;
      }
    }

    // If not in submissions, check Room joinedCandidates
    if (!assignedQuestionSetId) {
      const room = await Room.findOne({
        testId,
        'joinedCandidates.candidateId': candidateId,
      }).lean();
      if (room) {
        const entry = room.joinedCandidates.find(
          (jc) => jc.candidateId?.toString() === candidateId.toString()
        );
        if (entry?.assignedQuestionSetId) {
          assignedQuestionSetId = entry.assignedQuestionSetId;
        } else if (room.assignedQuestionSetId) {
          assignedQuestionSetId = room.assignedQuestionSetId;
        }
      }
    }

    // Fallback to test.questionSetId
    if (!assignedQuestionSetId && test.questionSetId) {
      assignedQuestionSetId = test.questionSetId;
    }

    // 4. Fetch all Question documents for this candidate
    let questions = [];
    if (assignedQuestionSetId) {
      questions = await Question.find({ questionSetId: assignedQuestionSetId })
        .sort({ createdAt: 1 })
        .lean();
    } else if (test.folderId) {
      const poolSets = await QuestionSet.find({ folderId: test.folderId }).lean();
      if (poolSets.length > 0) {
        questions = await Question.find({ questionSetId: poolSets[0]._id })
          .sort({ createdAt: 1 })
          .lean();
      }
    }

    // 5. Ensure all questions from submissions are also accounted for
    const knownQIds = new Set(questions.map((q) => q._id.toString()));
    const extraQIds = submissions
      .map((s) => s.questionId?.toString())
      .filter((qid) => qid && !knownQIds.has(qid));

    if (extraQIds.length > 0) {
      const extraQuestions = await Question.find({ _id: { $in: extraQIds } }).lean();
      questions.push(...extraQuestions);
    }

    // 6. Map submissions & evaluations by questionId / submissionId
    const subByQId = {};
    const evalBySubId = {};
    const evalByQId = {};

    for (const sub of submissions) {
      if (sub.questionId) {
        subByQId[sub.questionId.toString()] = sub;
      }
    }

    for (const ev of evaluations) {
      if (ev.submissionId) {
        evalBySubId[ev.submissionId.toString()] = ev;
      }
    }

    // Also link evaluation by questionId via its submission
    for (const sub of submissions) {
      const ev = evalBySubId[sub._id.toString()];
      if (ev && sub.questionId) {
        evalByQId[sub.questionId.toString()] = ev;
      }
    }

    // 7. Format structured per-question result list
    const formattedQuestions = questions.map((q, idx) => {
      const qIdStr = q._id.toString();
      const sub = subByQId[qIdStr];
      const ev = sub ? (evalBySubId[sub._id.toString()] || evalByQId[qIdStr]) : evalByQId[qIdStr];

      const isAttempted = Boolean(
        sub &&
          (sub.isAttempted ||
            (sub.code && sub.code.trim().length > 0) ||
            sub.status === 'SUBMITTED' ||
            sub.status === 'AUTO_SUBMITTED_TIME_UP')
      );

      const status = sub?.status
        ? sub.status
        : isAttempted
        ? 'SUBMITTED'
        : 'NOT_ATTEMPTED';

      const questionTitle = q.title && q.title.trim() ? q.title.trim() : `Question ${idx + 1}`;

      return {
        questionIndex: idx + 1,
        questionId: q._id,
        title: questionTitle,
        description: q.description || '',
        testType: q.testType || test.testType,
        difficulty: q.difficulty || 'MEDIUM',
        isAttempted,
        status,
        code: sub?.code || '',
        language: sub?.language || test.supportedLanguages?.[0] || 'javascript',
        filesJson: sub?.filesJson || null,
        promptLog: sub?.promptLog || ev?.promptLog || [],
        submittedAt: sub?.submittedAt || null,
        evaluation: ev
          ? {
              _id: ev._id,
              finalScorePerQuestion: ev.finalScorePerQuestion ?? 0,
              scoreBreakdown: ev.scoreBreakdown || {},
              llmFeedback: ev.llmFeedback || '',
              promptLog: ev.promptLog || sub?.promptLog || [],
              isPassed: Boolean(ev.isPassed),
              evaluatedAt: ev.evaluatedAt,
            }
          : null,
      };
    });

    res.json({
      candidate,
      test: {
        _id: test._id,
        title: test.title,
        testType: test.testType,
        durationMinutes: test.durationMinutes,
        passingCriteria: test.passingCriteria,
        totalQuestions: test.totalQuestions,
      },
      questions: formattedQuestions,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getResults,
  getShortlist,
  regenerateShortlist,
  exportShortlistPdf,
  getCopyPasteLog,
  getCandidateEvaluationDetail,
};
