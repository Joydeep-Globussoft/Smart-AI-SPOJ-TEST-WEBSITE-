// Evaluation Controller — Module 7 + Reports Module 8
// Implements all endpoints from Section 9.7 exactly
const Test = require('../models/Test');
const Submission = require('../models/Submission');
const EvaluationResult = require('../models/EvaluationResult');
const Shortlist = require('../models/Shortlist');
const MalpracticeLog = require('../models/MalpracticeLog');
const shortlistService = require('../services/shortlistService');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// ── GET /tests/:testId/results ────────────────────────────────────────────────
// Response: { results: [] } (per-candidate scores)
const getResults = async (req, res, next) => {
  try {
    const { testId } = req.params;
    const rawResults = await EvaluationResult.find({ testId })
      .populate('candidateId', 'name email phone isDisqualified')
      .sort({ finalScorePerQuestion: -1 })
      .lean();

    // Resilient fallback for candidate name/email if candidate document was purged or failed to populate
    const shortlist = await Shortlist.findOne({ testId }).lean();
    const shortlistCandidateMap = {};
    if (shortlist?.candidates) {
      for (const c of shortlist.candidates) {
        if (c.candidateId) {
          shortlistCandidateMap[c.candidateId.toString()] = c;
        }
      }
    }

    const results = rawResults.map((r) => {
      if (!r.candidateId || !r.candidateId.name) {
        const rawCid = (r.candidateId?._id || r.candidateId)?.toString();
        const slCand = shortlistCandidateMap[rawCid];
        if (slCand) {
          return {
            ...r,
            candidateId: {
              _id: rawCid,
              name: slCand.name,
              email: slCand.email,
              phone: slCand.phone || '',
              isDisqualified: Boolean(slCand.isDisqualified),
            },
          };
        }
      }
      return r;
    });

    res.json({ results });
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
    res.json({ shortlist });
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
    res.json({ shortlist });
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

module.exports = {
  getResults,
  getShortlist,
  regenerateShortlist,
  exportShortlistPdf,
  getCopyPasteLog,
};
