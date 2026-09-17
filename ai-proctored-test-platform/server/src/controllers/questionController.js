// Question Bank Controller — Module 2 (FEATURE-013 Folder Hierarchy)
const path = require('path');
const fs = require('fs');
const Folder = require('../models/Folder');
const QuestionSet = require('../models/QuestionSet');
const Question = require('../models/Question');
const Test = require('../models/Test');
const pdfStorageService = require('../services/pdfStorageService');

// ── POST /question-sets ───────────────────────────────────────────────────────
const createQuestionSet = async (req, res, next) => {
  try {
    const { folderId, name, testType } = req.body;
    if (!folderId || !name) {
      return res.status(400).json({ error: 'folderId and name are required' });
    }

    const folder = await Folder.findById(folderId);
    if (!folder) {
      return res.status(404).json({ error: 'Selected Folder not found' });
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ error: 'Question Set name cannot be empty' });
    }

    const questionSet = await QuestionSet.create({
      folderId: folder._id,
      testType: folder.testType, // Inherits testType strictly from parent folder
      name: trimmedName,
      createdBy: req.user.id,
      questionIds: [],
    });

    await questionSet.populate('createdBy', 'name email');
    await questionSet.populate('folderId', 'name testType');

    res.status(201).json({ questionSet });
  } catch (err) {
    next(err);
  }
};

// ── GET /question-sets ────────────────────────────────────────────────────────
const getQuestionSets = async (req, res, next) => {
  try {
    const { folderId, testType } = req.query || {};
    const filter = {};
    if (folderId) {
      filter.folderId = folderId;
    }
    if (testType && testType !== 'ALL') {
      filter.testType = testType;
    }

    const questionSets = await QuestionSet.find(filter)
      .populate('createdBy', 'name email')
      .populate('folderId', 'name testType')
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
    const { name, testType, folderId } = req.body;

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

    // 2. Validate and move to a different folder if provided
    if (folderId !== undefined && folderId.toString() !== questionSet.folderId?.toString()) {
      const targetFolder = await Folder.findById(folderId);
      if (!targetFolder) {
        return res.status(404).json({ error: 'Target folder not found' });
      }
      if (targetFolder.testType !== questionSet.testType) {
        return res.status(400).json({
          error: `Cannot move Question Set (${questionSet.testType}) into a ${targetFolder.testType} folder. Test types must match.`,
        });
      }
      questionSet.folderId = targetFolder._id;
    }

    // 3. Validate and update testType if changed
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

      // Check parent folder testType
      const parentFolder = await Folder.findById(questionSet.folderId);
      if (parentFolder && parentFolder.testType !== testType) {
        const otherSetsInFolder = await QuestionSet.countDocuments({
          folderId: parentFolder._id,
          _id: { $ne: questionSet._id },
        });
        if (otherSetsInFolder === 0) {
          parentFolder.testType = testType;
          await parentFolder.save();
        } else {
          return res.status(400).json({
            error: `Cannot change Question Set test type to ${testType}: Parent folder "${parentFolder.name}" contains other ${parentFolder.testType} sets. Please move this set to a ${testType} folder instead.`,
          });
        }
      }

      questionSet.testType = testType;
    }

    await questionSet.save();
    await questionSet.populate('createdBy', 'name email');
    await questionSet.populate('folderId', 'name testType');

    res.json({ questionSet });
  } catch (err) {
    next(err);
  }
};

// ── POST /question-sets/:setId/questions ─────────────────────────────────────
// AC: Reject with 400 if visibleTestCases is empty for non-PDF questions (FR-4.1)
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
      isPdfImported,
      pdfFileName,
      pdfOriginalName,
      pdfPageRange,
    } = req.body;

    const questionSet = await QuestionSet.findById(setId);
    if (!questionSet) {
      return res.status(404).json({ error: 'QuestionSet not found' });
    }

    // Validation
    if (!isPdfImported) {
      if (!title || !description) {
        return res.status(400).json({ error: 'Title and description are required for manually authored questions' });
      }
      if (!visibleTestCases || visibleTestCases.length === 0) {
        return res.status(400).json({ error: 'At least 1 visible test case is required (FR-4.1)' });
      }
    }

    const question = await Question.create({
      questionSetId: setId,
      testType: questionSet.testType,
      title: title ? title.trim() : '',
      description: description ? description.trim() : '',
      difficulty: difficulty || null,
      inputFormat: inputFormat ? inputFormat.trim() : '',
      outputFormat: outputFormat ? outputFormat.trim() : '',
      constraints: constraints ? constraints.trim() : '',
      visibleTestCases: visibleTestCases || [],
      hiddenTestCases: hiddenTestCases || [],
      aiTestBriefFiles: questionSet.testType === 'AI_TEST' ? aiTestBriefFiles : undefined,
      isPdfImported: Boolean(isPdfImported),
      pdfFileName: pdfFileName || '',
      pdfOriginalName: pdfOriginalName || '',
      pdfPageRange: pdfPageRange || { startPage: 1, endPage: 1 },
      isIncomplete: false,
    });

    // Update parent QuestionSet's questionIds array
    await QuestionSet.findByIdAndUpdate(setId, {
      $push: { questionIds: question._id },
    });

    res.status(201).json({ question });
  } catch (err) {
    next(err);
  }
};

// ── GET /question-sets/:setId/questions ──────────────────────────────────────
const getQuestions = async (req, res, next) => {
  try {
    const { setId } = req.params;
    const questionSet = await QuestionSet.findById(setId);
    if (!questionSet) {
      return res.status(404).json({ error: 'QuestionSet not found' });
    }

    // Role-based visibility: Admins get hiddenTestCases, Candidates NEVER get hiddenTestCases (Section 9.4)
    const isAdmin = req.user && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'TEST_ADMIN');
    let questions;

    if (isAdmin) {
      questions = await Question.find({ questionSetId: setId }).sort({ createdAt: 1 });
    } else {
      questions = await Question.find({ questionSetId: setId })
        .select('-hiddenTestCases')
        .sort({ createdAt: 1 });
    }

    res.json({ questions, questionSet });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /questions/:questionId ──────────────────────────────────────────────
const updateQuestion = async (req, res, next) => {
  try {
    const { questionId } = req.params;
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
      isPdfImported,
      pdfFileName,
      pdfOriginalName,
      pdfPageRange,
    } = req.body;

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (title !== undefined) question.title = title.trim();
    if (description !== undefined) question.description = description.trim();
    if (difficulty !== undefined) question.difficulty = difficulty;
    if (inputFormat !== undefined) question.inputFormat = inputFormat.trim();
    if (outputFormat !== undefined) question.outputFormat = outputFormat.trim();
    if (constraints !== undefined) question.constraints = constraints.trim();
    if (visibleTestCases !== undefined) question.visibleTestCases = visibleTestCases;
    if (hiddenTestCases !== undefined) question.hiddenTestCases = hiddenTestCases;
    if (aiTestBriefFiles !== undefined) question.aiTestBriefFiles = aiTestBriefFiles;
    if (isPdfImported !== undefined) question.isPdfImported = isPdfImported;
    if (pdfFileName !== undefined) question.pdfFileName = pdfFileName;
    if (pdfOriginalName !== undefined) question.pdfOriginalName = pdfOriginalName;
    if (pdfPageRange !== undefined) question.pdfPageRange = pdfPageRange;

    await question.save();
    res.json({ question });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /questions/:questionId ─────────────────────────────────────────────
const deleteQuestion = async (req, res, next) => {
  try {
    const { questionId } = req.params;
    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const setId = question.questionSetId;

    // Delete question record
    await Question.findByIdAndDelete(questionId);

    // Remove from QuestionSet's questionIds array
    await QuestionSet.findByIdAndUpdate(setId, {
      $pull: { questionIds: questionId },
    });

    res.json({ success: true, message: 'Question deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /question-sets/:setId ──────────────────────────────────────────────
const deleteQuestionSet = async (req, res, next) => {
  try {
    const { setId } = req.params;
    const questionSet = await QuestionSet.findById(setId);
    if (!questionSet) {
      return res.status(404).json({ error: 'QuestionSet not found' });
    }

    // Safety check: Prevent deletion if this QuestionSet is assigned to an existing Test
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
// FEATURE-009 & FEATURE-013: Bulk PDF upload to Question Bank within a Folder
const uploadPdfBatch = async (req, res, next) => {
  try {
    const { folderId, folderName, testType } = req.body;
    const validTypes = ['SPOJ', 'REACT', 'JAVASCRIPT', 'AI_TEST'];

    let targetFolder = null;

    if (folderId) {
      // Option A: Upload into existing folder
      targetFolder = await Folder.findById(folderId);
      if (!targetFolder) {
        return res.status(404).json({ error: 'Target folder not found' });
      }
    } else {
      // Option B: Create a new folder
      if (!testType || !validTypes.includes(testType)) {
        return res.status(400).json({
          error: `Invalid or missing testType. Must be one of: ${validTypes.join(', ')}`,
        });
      }
      const finalFolderName = (folderName && folderName.trim()) || `PDF Upload Batch - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      targetFolder = await Folder.create({
        name: finalFolderName,
        testType,
        description: 'Created via PDF bulk folder upload',
        createdBy: req.user.id,
      });
    }

    const effectiveTestType = targetFolder.testType;

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
      folderId: targetFolder._id,
      folderName: targetFolder.name,
      testType: effectiveTestType,
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

      // Save original PDF file to disk and persistent MongoDB Atlas storage (BUG-005)
      const safeOriginalBase = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
      const uniqueFileName = `${Date.now()}_${uuidv4().slice(0, 8)}_${safeOriginalBase}`;
      await pdfStorageService.savePdfAsset(uniqueFileName, originalName, file.buffer, req.user?.id);

      // Derive distinct Question Set name with collision handling
      const baseSetName = sanitizeQuestionSetName(originalName);
      let setName = baseSetName;
      let collisionSuffix = 1;
      while (await QuestionSet.findOne({ name: setName })) {
        setName = `${baseSetName} (${collisionSuffix++})`;
      }

      // 1. Create QuestionSet assigned directly to targetFolder
      const questionSet = await QuestionSet.create({
        folderId: targetFolder._id,
        name: setName,
        testType: effectiveTestType,
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
          testType: effectiveTestType,
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
        folderId: targetFolder._id,
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
      message: `Processed ${files.length} PDF(s): ${summary.questionSetsCreated} Question Set(s) created in Folder "${targetFolder.name}", ${summary.failedPdfs.length} failed.`,
      summary,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /question-sets/pools ──────────────────────────────────────────────────
// FEATURE-012 & FEATURE-013: List all Question Set Pools (Folders) with question count validation
const getQuestionPools = async (req, res, next) => {
  try {
    const { testType } = req.query;
    const filter = {};
    if (testType && testType !== 'ALL') {
      filter.testType = testType;
    }

    const folders = await Folder.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    const folderIds = folders.map((f) => f._id);
    const questionSets = await QuestionSet.find({ folderId: { $in: folderIds } })
      .populate('createdBy', 'name email')
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    const setIds = questionSets.map((s) => s._id);
    const questions = await Question.find({ questionSetId: { $in: setIds } }, { _id: 1, questionSetId: 1 }).lean();

    const countMap = {};
    for (const q of questions) {
      const sId = q.questionSetId.toString();
      countMap[sId] = (countMap[sId] || 0) + 1;
    }

    const setsByFolder = {};
    for (const qs of questionSets) {
      const fId = qs.folderId.toString();
      if (!setsByFolder[fId]) setsByFolder[fId] = [];
      const qCount = countMap[qs._id.toString()] || 0;
      setsByFolder[fId].push({
        _id: qs._id,
        name: qs.name,
        testType: qs.testType,
        questionCount: qCount,
        createdAt: qs.createdAt,
      });
    }

    const pools = folders.map((folder) => {
      const fId = folder._id.toString();
      const sets = setsByFolder[fId] || [];
      const setCount = sets.length;

      if (setCount === 0) {
        return {
          poolId: fId,
          poolName: folder.name,
          testType: folder.testType,
          setCount: 0,
          questionCount: 0,
          isValid: false,
          validationError: 'Folder contains 0 question sets.',
          sets: [],
          createdBy: folder.createdBy,
          createdAt: folder.createdAt,
        };
      }

      const counts = sets.map((s) => s.questionCount);
      const firstCount = counts[0];
      const allSame = counts.every((c) => c === firstCount);
      const hasEmptySet = counts.some((c) => c === 0);

      let isValid = true;
      let validationError = null;

      if (hasEmptySet) {
        isValid = false;
        const emptySets = sets.filter((s) => s.questionCount === 0).map((s) => `"${s.name}"`).join(', ');
        validationError = `Folder contains set(s) with 0 questions: ${emptySets}.`;
      } else if (!allSame) {
        isValid = false;
        const mismatchDetails = sets.map((s) => `"${s.name}" (${s.questionCount} Qs)`).join(', ');
        validationError = `Question Sets in this Folder have mismatched question counts: ${mismatchDetails}. All sets in a pool must have the exact same question count.`;
      }

      return {
        poolId: fId,
        poolName: folder.name,
        testType: folder.testType,
        setCount,
        questionCount: allSame && !hasEmptySet ? firstCount : null,
        isValid,
        validationError,
        sets,
        createdBy: folder.createdBy,
        createdAt: folder.createdAt,
      };
    });

    res.json({ pools });
  } catch (err) {
    next(err);
  }
};

// ── GET /questions/pdf-asset/:filename ────────────────────────────────────────
const servePdfAsset = async (req, res, next) => {
  try {
    const asset = await pdfStorageService.getPdfAsset(req.params.filename);

    if (!asset) {
      console.warn(`[servePdfAsset] PDF asset not found on disk or in MongoDB: "${req.params.filename}"`);
      return res.status(404).json({ error: 'PDF asset not found.' });
    }

    const safeFilename = path.basename(req.params.filename);

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

    if (asset.buffer) {
      return res.send(asset.buffer);
    }

    const stream = fs.createReadStream(asset.filePath);
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
  getQuestionPools,
  servePdfAsset,
};
