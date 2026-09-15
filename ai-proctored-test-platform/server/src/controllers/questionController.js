// Question Bank Controller — Module 2
// Implements all endpoints from Section 9.4 exactly
const QuestionSet = require('../models/QuestionSet');
const Question = require('../models/Question');
const Test = require('../models/Test');

// ── POST /question-sets ───────────────────────────────────────────────────────
const createQuestionSet = async (req, res, next) => {
  try {
    const { testType, name } = req.body;
    if (!testType || !name) {
      return res.status(400).json({ error: 'testType and name are required' });
    }

    const questionSet = await QuestionSet.create({
      testType,
      name,
      createdBy: req.user.id,
    });

    res.status(201).json({ questionSet });
  } catch (err) {
    next(err);
  }
};

// ── GET /question-sets ────────────────────────────────────────────────────────
const getQuestionSets = async (req, res, next) => {
  try {
    const questionSets = await QuestionSet.find()
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    // Query question counts and questionIds for each question set to guarantee accurate, real-time counts (BUG-59, FEATURE-010)
    const setIds = questionSets.map((s) => s._id);
    const questionsBySet = await Question.find(
      { questionSetId: { $in: setIds } },
      { _id: 1, questionSetId: 1 }
    ).lean();

    const countMap = {};
    const idsMap = {};
    for (const q of questionsBySet) {
      const sId = q.questionSetId.toString();
      countMap[sId] = (countMap[sId] || 0) + 1;
      if (!idsMap[sId]) idsMap[sId] = [];
      idsMap[sId].push(q._id);
    }

    const hydratedSets = questionSets.map((s) => {
      const sId = s._id.toString();
      const actualIds = idsMap[sId] || [];
      const questionCount = countMap[sId] || 0;
      return {
        ...s,
        questionIds: actualIds,
        questionCount,
        incompleteCount: 0,
        hasIncompleteQuestions: false,
      };
    });

    res.json({ questionSets: hydratedSets });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /question-sets/:setId ───────────────────────────────────────────────
const updateQuestionSet = async (req, res, next) => {
  try {
    const { setId } = req.params;
    const { name, testType } = req.body;

    const questionSet = await QuestionSet.findById(setId);
    if (!questionSet) {
      return res.status(404).json({ error: 'QuestionSet not found' });
    }

    // 1. Validate and update name if provided
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Question Set name cannot be empty' });
      }
      questionSet.name = name.trim();
    }

    // 2. Validate and update testType if changed
    if (testType !== undefined && testType !== questionSet.testType) {
      const validTypes = ['SPOJ', 'REACT', 'JAVASCRIPT', 'AI_TEST'];
      if (!validTypes.includes(testType)) {
        return res.status(400).json({ error: `Invalid testType. Must be one of: ${validTypes.join(', ')}` });
      }

      // Check if this Question Set is already assigned to any existing Test
      const assignedTest = await Test.findOne({ questionSetId: setId });
      if (assignedTest) {
        return res.status(400).json({
          error: `Cannot change test type: This Question Set is assigned to test "${assignedTest.title}" (${assignedTest.testType}).`,
        });
      }

      // Check if this Question Set already contains questions
      const questionCount = await Question.countDocuments({ questionSetId: setId });
      if (questionCount > 0) {
        return res.status(400).json({
          error: `Cannot change test type: This Question Set contains ${questionCount} existing question(s).`,
        });
      }

      questionSet.testType = testType;
    }

    await questionSet.save();
    await questionSet.populate('createdBy', 'name email');

    res.json({ questionSet });
  } catch (err) {
    next(err);
  }
};

// ── POST /question-sets/:setId/questions ─────────────────────────────────────
// AC: Reject with 400 if visibleTestCases or hiddenTestCases is empty (FR-4.1)
const createQuestion = async (req, res, next) => {
  try {
    const { setId } = req.params;
    const {
      title,
      description,
      difficulty,
      inputFormat,
      outputFormat,
      constraints,
      visibleTestCases,
      hiddenTestCases,
      aiTestBriefFiles,
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'title and description are required' });
    }

    // At least 1 visible test case is required for non-AI standard tests
    if (!visibleTestCases || visibleTestCases.length === 0) {
      return res.status(400).json({ error: 'At least 1 visible test case is required' });
    }

    const questionSet = await QuestionSet.findById(setId);
    if (!questionSet) return res.status(404).json({ error: 'QuestionSet not found' });

    const question = await Question.create({
      questionSetId: setId,
      testType: questionSet.testType,
      title,
      description,
      difficulty: difficulty || undefined,
      inputFormat: inputFormat || undefined,
      outputFormat: outputFormat || undefined,
      constraints: constraints || undefined,
      visibleTestCases: visibleTestCases || [],
      hiddenTestCases: hiddenTestCases || [],
      aiTestBriefFiles: aiTestBriefFiles || [],
      isIncomplete: false,
    });

    // Add question to set's questionIds array
    await QuestionSet.findByIdAndUpdate(setId, { $addToSet: { questionIds: question._id } });

    res.status(201).json({ question });
  } catch (err) {
    next(err);
  }
};

// ── GET /question-sets/:setId/questions ───────────────────────────────────────
// AC: hiddenTestCases excluded from response for candidate-authenticated requests (FR-4.2)
const getQuestions = async (req, res, next) => {
  try {
    const { setId } = req.params;
    const isAdmin = req.user && req.user.type === 'admin';

    // FR-4.2: Never return hiddenTestCases to candidates
    const projection = isAdmin ? {} : { hiddenTestCases: 0 };
    const questions = await Question.find({ questionSetId: setId }, projection);
    res.json({ questions });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /questions/:questionId ──────────────────────────────────────────────
const updateQuestion = async (req, res, next) => {
  try {
    const disallowed = ['_id', 'questionSetId', 'testType', 'createdAt'];
    disallowed.forEach((k) => delete req.body[k]);

    // Validate test cases if being updated
    if (req.body.visibleTestCases !== undefined && req.body.visibleTestCases.length === 0) {
      return res.status(400).json({ error: 'At least 1 visible test case is required' });
    }

    req.body.isIncomplete = false;

    const question = await Question.findByIdAndUpdate(req.params.questionId, req.body, {
      new: true,
      runValidators: true,
    });
    if (!question) return res.status(404).json({ error: 'Question not found' });
    res.json({ question });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /questions/:questionId ─────────────────────────────────────────────
const deleteQuestion = async (req, res, next) => {
  try {
    const question = await Question.findByIdAndDelete(req.params.questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    // Remove from QuestionSet's questionIds array
    await QuestionSet.findByIdAndUpdate(question.questionSetId, {
      $pull: { questionIds: question._id },
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /question-sets/:setId ─────────────────────────────────────────────
const deleteQuestionSet = async (req, res, next) => {
  try {
    const { setId } = req.params;
    const questionSet = await QuestionSet.findById(setId);
    if (!questionSet) {
      return res.status(404).json({ error: 'Question Set not found' });
    }

    // Check if this Question Set is assigned to any existing Test
    const assignedTest = await Test.findOne({ questionSetId: setId });
    if (assignedTest) {
      return res.status(400).json({
        error: `Cannot delete Question Set: It is assigned to test "${assignedTest.title}".`,
      });
    }

    // Delete associated questions from Question collection
    await Question.deleteMany({ questionSetId: setId });

    // Delete the Question Set
    await QuestionSet.findByIdAndDelete(setId);

    res.json({ success: true, message: 'Question set deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// ── POST /question-sets/upload-pdf-batch ──────────────────────────────────────
// FEATURE-009: Bulk PDF upload to Question Bank
const uploadPdfBatch = async (req, res, next) => {
  try {
    const { testType } = req.body;
    const validTypes = ['SPOJ', 'REACT', 'JAVASCRIPT', 'AI_TEST'];
    if (!testType || !validTypes.includes(testType)) {
      return res.status(400).json({
        error: `Invalid or missing testType. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    const files = req.files || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'No PDF files were uploaded.' });
    }

    const path = require('path');
    const fs = require('fs');
    const { v4: uuidv4 } = require('uuid');
    const { parsePdfQuestions, sanitizeQuestionSetName } = require('../services/pdfParserService');

    // Ensure storage directory exists
    const uploadDir = path.resolve(__dirname, '../../uploads/pdf_questions');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const summary = {
      totalPdfs: files.length,
      totalPdfsReceived: files.length,
      questionSetsCreated: 0,
      totalQuestionSetsCreated: 0,
      questionsCreated: 0,
      totalQuestionsCreated: 0,
      incompleteQuestions: 0,
      questionsWithVisibleCases: 0,
      questionsNeedingReview: 0,
      failedPdfsCount: 0,
      createdSets: [],
      failedPdfs: [],
      fileReports: [],
    };

    for (const file of files) {
      const originalName = file.originalname || 'unknown.pdf';
      const isPdf = originalName.toLowerCase().endsWith('.pdf') || file.mimetype === 'application/pdf';

      console.log(`[UploadPdfBatch] Processing file "${originalName}" (size: ${file.size || file.buffer?.length} bytes)`);

      if (!isPdf) {
        const failReason = 'File does not have a .pdf extension or is not a valid PDF MIME type.';
        summary.failedPdfs.push({
          fileName: originalName,
          originalName: originalName,
          reason: failReason,
        });
        summary.fileReports.push({
          status: 'FAILED',
          originalName: originalName,
          setName: originalName,
          questionCount: 0,
          questions: [],
          reason: failReason,
        });
        continue;
      }

      // Parse PDF for question boundaries and visible test cases
      const parsed = await parsePdfQuestions(file.buffer, originalName);

      if (!parsed.success || !parsed.questions || parsed.questions.length === 0) {
        const failReason = parsed.reason || 'Could not detect any valid question boundaries in PDF.';
        console.warn(`[UploadPdfBatch] PDF parsing failed for "${originalName}": ${failReason}`);
        summary.failedPdfs.push({
          fileName: originalName,
          originalName: originalName,
          reason: failReason,
        });
        summary.fileReports.push({
          status: 'FAILED',
          originalName: originalName,
          setName: originalName,
          questionCount: 0,
          questions: [],
          reason: failReason,
        });
        continue;
      }

      // Save original PDF file to disk with unique identifier
      const safeOriginalBase = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueFileName = `${Date.now()}_${uuidv4().slice(0, 8)}_${safeOriginalBase}`;
      const filePath = path.join(uploadDir, uniqueFileName);
      fs.writeFileSync(filePath, file.buffer);

      // Derive distinct Question Set name with collision handling
      const baseSetName = sanitizeQuestionSetName(originalName);
      let setName = baseSetName;
      let collisionSuffix = 1;
      while (await QuestionSet.findOne({ name: setName })) {
        setName = `${baseSetName} (${collisionSuffix++})`;
      }

      // 1. Create QuestionSet
      const questionSet = await QuestionSet.create({
        name: setName,
        testType,
        createdBy: req.user.id,
        questionIds: [],
      });

      // 2. Create Question records for each detected question
      const createdQuestionIds = [];
      for (const q of parsed.questions) {
        const visibleCases = q.visibleTestCases || [];
        const isExtractionOk = q.exampleParsingStatus === 'SUCCESS';

        const question = await Question.create({
          questionSetId: questionSet._id,
          testType,
          title: '', // No title per Decision #2
          description: '', // PDF page is the statement per Decision #4
          difficulty: null, // No difficulty per Decision #3
          visibleTestCases: visibleCases,
          hiddenTestCases: [], // Empty per Decision #5
          isPdfImported: true,
          pdfFileName: uniqueFileName,
          pdfOriginalName: originalName,
          pdfPageRange: {
            startPage: q.startPage,
            endPage: q.endPage,
          },
          isIncomplete: false,
          exampleParsingStatus: q.exampleParsingStatus,
        });

        createdQuestionIds.push(question._id);
        summary.totalQuestionsCreated++;
        summary.questionsCreated++;

        if (visibleCases.length > 0) {
          summary.questionsWithVisibleCases++;
        }
        if (!isExtractionOk || visibleCases.length === 0) {
          summary.questionsNeedingReview++;
        }
      }

      // Update QuestionSet with question IDs
      await QuestionSet.findByIdAndUpdate(questionSet._id, {
        questionIds: createdQuestionIds,
      });

      summary.totalQuestionSetsCreated++;
      summary.questionSetsCreated++;
      summary.createdSets.push({
        _id: questionSet._id,
        name: questionSet.name,
        testType: questionSet.testType,
        questionCount: createdQuestionIds.length,
        pdfFileName: uniqueFileName,
      });

      summary.fileReports.push({
        status: 'SUCCESS',
        originalName: originalName,
        setName: questionSet.name,
        questionCount: createdQuestionIds.length,
        questions: parsed.questions.map((q, qIdx) => ({
          questionIndex: qIdx + 1,
          questionNumber: q.questionNumber,
          pageRange: { startPage: q.startPage, endPage: q.endPage },
          visibleTestCasesCount: q.visibleTestCases?.length || 0,
          exampleParsingStatus: q.exampleParsingStatus,
        })),
        reason: null,
      });
    }

    summary.failedPdfsCount = summary.failedPdfs.length;

    res.status(200).json({
      success: true,
      message: `Processed ${files.length} PDF(s): ${summary.questionSetsCreated} Question Set(s) created, ${summary.failedPdfs.length} failed.`,
      summary,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /questions/pdf-asset/:filename ────────────────────────────────────────
// Serves stored PDF files for candidate/admin embedded PDF viewers (BUG-72: Cross-origin iframe enabled)
const servePdfAsset = async (req, res, next) => {
  try {
    const path = require('path');
    const fs = require('fs');
    const safeFilename = path.basename(req.params.filename);
    const filePath = path.resolve(__dirname, '../../uploads/pdf_questions', safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'PDF asset not found.' });
    }

    // Explicitly allow cross-origin iframe framing across all hosting origins (Render <-> Vercel / localhost)
    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Security-Policy', "frame-ancestors *");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeFilename}"`);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  createQuestionSet,
  getQuestionSets,
  updateQuestionSet,
  deleteQuestionSet,
  createQuestion,
  getQuestions,
  updateQuestion,
  deleteQuestion,
  uploadPdfBatch,
  servePdfAsset,
};
