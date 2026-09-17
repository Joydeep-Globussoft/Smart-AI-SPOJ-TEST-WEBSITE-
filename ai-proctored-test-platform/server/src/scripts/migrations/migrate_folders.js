/**
 * Idempotent Data Migration: FEATURE-013 Folder Hierarchy
 * Automatically wraps all unassigned QuestionSets into Folders.
 */
const mongoose = require('mongoose');
const Folder = require('../../models/Folder');
const QuestionSet = require('../../models/QuestionSet');
const Admin = require('../../models/Admin');
const Test = require('../../models/Test');

async function migrateFoldersToHierarchy() {
  try {
    const unassignedSets = await QuestionSet.find({
      $or: [{ folderId: null }, { folderId: { $exists: false } }],
    }).lean();

    if (!unassignedSets || unassignedSets.length === 0) {
      console.log('[Migration] All QuestionSets already assigned to Folders. Migration skipped.');
      return { migratedCount: 0, createdFoldersCount: 0 };
    }

    console.log(`[Migration] Found ${unassignedSets.length} QuestionSet(s) without folderId. Starting migration...`);

    let fallbackAdmin = await Admin.findOne({ role: 'SUPER_ADMIN' });
    if (!fallbackAdmin) {
      fallbackAdmin = await Admin.findOne();
    }
    const defaultAdminId = fallbackAdmin?._id || new mongoose.Types.ObjectId();

    let createdFoldersCount = 0;
    let migratedCount = 0;

    // Group 1: Sets that have a legacy uploadBatchId
    const batchMap = new Map();
    const standaloneSets = [];

    for (const qs of unassignedSets) {
      if (qs.uploadBatchId) {
        if (!batchMap.has(qs.uploadBatchId)) {
          batchMap.set(qs.uploadBatchId, []);
        }
        batchMap.get(qs.uploadBatchId).push(qs);
      } else {
        standaloneSets.push(qs);
      }
    }

    // Process batches
    for (const [batchId, sets] of batchMap.entries()) {
      const firstSet = sets[0];
      const folderName = firstSet.uploadBatchName || `PDF Batch - ${firstSet.name}`;
      const testType = firstSet.testType || 'SPOJ';
      const createdBy = firstSet.createdBy || defaultAdminId;

      const folder = await Folder.create({
        name: folderName,
        testType,
        description: `Auto-migrated folder for upload batch: ${batchId}`,
        createdBy,
      });
      createdFoldersCount++;

      const setIds = sets.map((s) => s._id);
      await QuestionSet.updateMany(
        { _id: { $in: setIds } },
        { $set: { folderId: folder._id } }
      );
      migratedCount += sets.length;

      // Also migrate any Tests that used this legacy questionSetPoolId
      await Test.updateMany(
        { questionSetPoolId: batchId, folderId: null },
        { $set: { folderId: folder._id, questionSetPoolId: folder._id.toString() } }
      );
    }

    // Process standalone sets
    for (const qs of standaloneSets) {
      const folderName = qs.name || 'Untitled Folder';
      const testType = qs.testType || 'SPOJ';
      const createdBy = qs.createdBy || defaultAdminId;

      const folder = await Folder.create({
        name: folderName,
        testType,
        description: `Auto-migrated folder for question set: ${qs.name}`,
        createdBy,
      });
      createdFoldersCount++;

      await QuestionSet.findByIdAndUpdate(qs._id, {
        $set: { folderId: folder._id },
      });
      migratedCount++;
    }

    console.log(`[Migration] Completed: Wrapped ${migratedCount} QuestionSet(s) into ${createdFoldersCount} new Folder(s).`);
    return { migratedCount, createdFoldersCount };
  } catch (err) {
    console.error('[Migration] Error migrating QuestionSets to Folders:', err);
    throw err;
  }
}

// Standalone execution support
if (require.main === module) {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spoj_test_platform';
  mongoose
    .connect(mongoUri)
    .then(async () => {
      console.log('[Migration Script] Connected to MongoDB:', mongoUri);
      await migrateFoldersToHierarchy();
      await mongoose.disconnect();
      console.log('[Migration Script] Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Migration Script] Fatal:', err);
      process.exit(1);
    });
}

module.exports = { migrateFoldersToHierarchy };
