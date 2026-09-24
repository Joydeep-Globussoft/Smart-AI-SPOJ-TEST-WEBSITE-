// Folder Controller — FEATURE-013
// Primary Question Bank container and Question Set Pool
const Folder = require('../models/Folder');
const QuestionSet = require('../models/QuestionSet');
const Question = require('../models/Question');
const Test = require('../models/Test');
const pdfStorageService = require('../services/pdfStorageService');

// ── GET /folders ───────────────────────────────────────────────────────────────
const getFolders = async (req, res, next) => {
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

    // Fetch all QuestionSets belonging to these folders
    const questionSets = await QuestionSet.find({ folderId: { $in: folderIds } })
      .populate('createdBy', 'name email')
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    // Query accurate dynamic question counts from Question collection (BUG-59)
    const setIds = questionSets.map((s) => s._id);
    const questions = await Question.find(
      { questionSetId: { $in: setIds } },
      { _id: 1, questionSetId: 1 }
    ).lean();

    const qCountMap = {};
    const qIdsMap = {};
    for (const q of questions) {
      const sId = q.questionSetId.toString();
      qCountMap[sId] = (qCountMap[sId] || 0) + 1;
      if (!qIdsMap[sId]) qIdsMap[sId] = [];
      qIdsMap[sId].push(q._id);
    }

    // Map sets to their parent folders
    const setsByFolder = {};
    for (const qs of questionSets) {
      const fId = qs.folderId.toString();
      if (!setsByFolder[fId]) setsByFolder[fId] = [];
      const count = qCountMap[qs._id.toString()] || 0;
      setsByFolder[fId].push({
        ...qs,
        questionCount: count,
        questionIds: qIdsMap[qs._id.toString()] || [],
      });
    }

    // Hydrate each folder with stats and pool validation rules
    const hydratedFolders = folders.map((folder) => {
      const fId = folder._id.toString();
      const sets = setsByFolder[fId] || [];
      const setCount = sets.length;
      const totalQuestions = sets.reduce((sum, s) => sum + s.questionCount, 0);

      // Evaluate pool validity for test creation
      let isValidPool = true;
      let questionCountPerSet = null;
      let poolError = null;

      if (setCount === 0) {
        isValidPool = false;
        poolError = 'Folder contains 0 question sets.';
      } else {
        const counts = sets.map((s) => s.questionCount);
        const firstCount = counts[0];
        const allSame = counts.every((c) => c === firstCount);
        const hasEmptySet = counts.some((c) => c === 0);

        if (hasEmptySet) {
          isValidPool = false;
          const emptySets = sets
            .filter((s) => s.questionCount === 0)
            .map((s) => `"${s.name}"`)
            .join(', ');
          poolError = `Folder contains set(s) with 0 questions: ${emptySets}.`;
        } else if (!allSame) {
          isValidPool = false;
          const mismatchDetails = sets
            .map((s) => `"${s.name}" (${s.questionCount} Qs)`)
            .join(', ');
          poolError = `Question Sets have mismatched question counts: ${mismatchDetails}. All sets in a pool must have the exact same question count.`;
        } else {
          isValidPool = true;
          questionCountPerSet = firstCount;
        }
      }

      return {
        ...folder,
        setCount,
        totalQuestions,
        questionSets: sets,
        isValidPool,
        questionCountPerSet,
        poolError,
      };
    });

    res.json({ folders: hydratedFolders });
  } catch (err) {
    next(err);
  }
};

// ── POST /folders ──────────────────────────────────────────────────────────────
const createFolder = async (req, res, next) => {
  try {
    const { name, testType, description } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const validTypes = ['SPOJ', 'REACT', 'JAVASCRIPT', 'AI_TEST'];
    if (!testType || !validTypes.includes(testType)) {
      return res.status(400).json({
        error: `Invalid or missing testType. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    const folder = await Folder.create({
      name: name.trim(),
      testType,
      description: description ? description.trim() : '',
      createdBy: req.user.id,
    });

    await folder.populate('createdBy', 'name email');

    res.status(201).json({ folder });
  } catch (err) {
    next(err);
  }
};

// ── GET /folders/:id ───────────────────────────────────────────────────────────
const getFolder = async (req, res, next) => {
  try {
    const folder = await Folder.findById(req.params.id)
      .populate('createdBy', 'name email')
      .lean();

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const questionSets = await QuestionSet.find({ folderId: folder._id })
      .populate('createdBy', 'name email')
      .sort({ createdAt: 1, _id: 1 })
      .lean();

    const setIds = questionSets.map((s) => s._id);
    const questions = await Question.find(
      { questionSetId: { $in: setIds } },
      { _id: 1, questionSetId: 1 }
    ).lean();

    const qCountMap = {};
    for (const q of questions) {
      const sId = q.questionSetId.toString();
      qCountMap[sId] = (qCountMap[sId] || 0) + 1;
    }

    const hydratedSets = questionSets.map((s) => ({
      ...s,
      questionCount: qCountMap[s._id.toString()] || 0,
    }));

    const totalQuestions = hydratedSets.reduce((sum, s) => sum + s.questionCount, 0);

    res.json({
      folder: {
        ...folder,
        setCount: hydratedSets.length,
        totalQuestions,
        questionSets: hydratedSets,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /folders/:id ─────────────────────────────────────────────────────────
const updateFolder = async (req, res, next) => {
  try {
    const { name, description, testType } = req.body;
    const folder = await Folder.findById(req.params.id);

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ error: 'Folder name cannot be empty' });
      }
      folder.name = name.trim();
    }

    if (description !== undefined) {
      folder.description = typeof description === 'string' ? description.trim() : '';
    }

    if (testType !== undefined && testType !== folder.testType) {
      const validTypes = ['SPOJ', 'REACT', 'JAVASCRIPT', 'AI_TEST'];
      if (!validTypes.includes(testType)) {
        return res.status(400).json({ error: `Invalid testType. Must be one of: ${validTypes.join(', ')}` });
      }

      // Check if folder contains any sets
      const childCount = await QuestionSet.countDocuments({ folderId: folder._id });
      if (childCount > 0) {
        return res.status(400).json({
          error: `Cannot change testType: Folder contains ${childCount} Question Set(s). Test type is fixed once Question Sets are created.`,
        });
      }
      folder.testType = testType;
    }

    await folder.save();
    await folder.populate('createdBy', 'name email');
    res.json({ folder });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /folders/:id ───────────────────────────────────────────────────────
const deleteFolder = async (req, res, next) => {
  try {
    const folder = await Folder.findById(req.params.id);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    // 1. Fetch all Question Sets in this folder
    const setsInFolder = await QuestionSet.find({ folderId: folder._id });
    const setIds = setsInFolder.map((s) => s._id);

    // 2. Query all Tests referencing this folder OR any of its contained question sets
    // Check both folderId/questionSetPoolId and legacy questionSetId fallback paths across all test statuses
    const queryConditions = [
      { folderId: folder._id },
      { questionSetPoolId: folder._id },
      { questionSetPoolId: folder._id.toString() },
    ];
    if (setIds.length > 0) {
      queryConditions.push({ questionSetId: { $in: setIds } });
    }

    const referencingTests = await Test.find(
      { $or: queryConditions },
      'title status testType'
    ).lean();

    // 3. If any Test references this folder or its sets, block deletion entirely
    if (referencingTests.length > 0) {
      const testList = referencingTests
        .map((t) => `"${t.title}" (${t.status || 'DRAFT'})`)
        .join(', ');
      return res.status(400).json({
        error: `Cannot delete Folder: Contained question set(s) or folder are currently referenced by Test(s): ${testList}. Please remove or reassign those tests' question source first.`,
        referencingTests: referencingTests.map((t) => ({
          _id: t._id,
          title: t.title,
          status: t.status,
        })),
      });
    }

    // 4. If no references exist: proceed with cascading delete
    let deletedQuestionsCount = 0;
    if (setIds.length > 0) {
      // Find all questions belonging to these sets to check and clean associated PDF files
      const questions = await Question.find({ questionSetId: { $in: setIds } });
      deletedQuestionsCount = questions.length;
      const questionIds = questions.map((q) => q._id);

      // Collect all PDF file names
      const pdfFileNames = [
        ...new Set(questions.map((q) => q.pdfFileName).filter(Boolean)),
      ];

      // Clean up PDF assets that are not referenced by any question outside this folder
      for (const pdfFileName of pdfFileNames) {
        const otherQuestionsUsingPdf = await Question.countDocuments({
          pdfFileName,
          _id: { $nin: questionIds },
        });
        if (otherQuestionsUsingPdf === 0) {
          await pdfStorageService.deletePdfAsset(pdfFileName);
        }
      }

      // Delete all questions associated with these sets
      await Question.deleteMany({ questionSetId: { $in: setIds } });

      // Delete all question sets in the folder
      await QuestionSet.deleteMany({ folderId: folder._id });
    }

    // Delete the Folder document itself
    await Folder.findByIdAndDelete(folder._id);

    res.json({
      success: true,
      message: `Folder "${folder.name}" and all ${setsInFolder.length} question set(s) deleted successfully`,
      deletedSetsCount: setsInFolder.length,
      deletedQuestionsCount,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getFolders,
  createFolder,
  getFolder,
  updateFolder,
  deleteFolder,
};
