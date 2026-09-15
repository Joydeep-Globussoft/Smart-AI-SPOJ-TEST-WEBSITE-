// pdfStorageService.js — Persistent Hybrid Storage (Disk Cache + MongoDB Atlas)
// Implements BUG-005: Eliminates missing PDF 404 errors on ephemeral cloud instances (Render)
const fs = require('fs');
const path = require('path');
const PdfAsset = require('../models/PdfAsset');

const uploadDir = path.resolve(__dirname, '../../uploads/pdf_questions');

/**
 * Ensure the local upload directory exists
 */
function ensureUploadDir() {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
}

/**
 * Persist PDF file to both local disk cache and MongoDB Atlas
 * @param {string} fileName - Unique filename
 * @param {string} originalName - Original uploaded filename
 * @param {Buffer} buffer - Binary PDF content
 * @param {string} [uploadedBy] - Admin ID
 */
async function savePdfAsset(fileName, originalName, buffer, uploadedBy = null) {
  ensureUploadDir();
  const safeFilename = path.basename(fileName);
  const filePath = path.join(uploadDir, safeFilename);

  // 1. Write to local disk cache for high-throughput streaming
  fs.writeFileSync(filePath, buffer);

  // 2. Persist to MongoDB Atlas for cloud container persistence across restarts
  const asset = await PdfAsset.findOneAndUpdate(
    { fileName: safeFilename },
    {
      fileName: safeFilename,
      originalName: originalName || safeFilename,
      data: buffer,
      size: buffer.length,
      mimeType: 'application/pdf',
      uploadedBy,
    },
    { upsert: true, new: true }
  );

  return asset;
}

/**
 * Retrieve a PDF asset by filename, hydrating disk cache from MongoDB if missing on disk
 * @param {string} fileName - Unique filename
 * @returns {Promise<{ filePath: string, buffer: Buffer, originalName: string } | null>}
 */
async function getPdfAsset(fileName) {
  if (!fileName) return null;
  ensureUploadDir();
  const safeFilename = path.basename(fileName);
  const filePath = path.join(uploadDir, safeFilename);

  // Case 1: File is cached on local disk
  if (fs.existsSync(filePath)) {
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > 0) {
        return {
          filePath,
          buffer: null, // Can be streamed directly from filePath
          originalName: safeFilename,
        };
      }
    } catch (e) {
      console.warn(`[PdfStorage] Error checking disk cache for ${safeFilename}:`, e.message);
    }
  }

  // Case 2: File missing on ephemeral disk (Render restart/redeploy) -> Retrieve from MongoDB
  try {
    let asset = await PdfAsset.findOne({ fileName: safeFilename });

    // Fallback: Attempt match by original name or suffix if exact unique name changed
    if (!asset) {
      const parts = safeFilename.split('_');
      const baseName = parts.length > 2 ? parts.slice(2).join('_') : safeFilename;
      asset = await PdfAsset.findOne({
        $or: [
          { originalName: safeFilename },
          { originalName: baseName },
          { fileName: new RegExp(baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        ],
      });
    }

    if (asset && asset.data) {
      // Re-hydrate local disk cache
      try {
        fs.writeFileSync(filePath, asset.data);
      } catch (writeErr) {
        console.warn(`[PdfStorage] Failed writing disk cache for ${safeFilename}:`, writeErr.message);
      }

      return {
        filePath,
        buffer: asset.data,
        originalName: asset.originalName || safeFilename,
      };
    }
  } catch (dbErr) {
    console.error(`[PdfStorage] MongoDB retrieval error for ${safeFilename}:`, dbErr.message);
  }

  return null;
}

/**
 * Verify whether a PDF asset exists either on disk or in MongoDB
 * @param {string} fileName
 * @returns {Promise<boolean>}
 */
async function validateQuestionPdfExists(fileName) {
  if (!fileName) return false;
  ensureUploadDir();
  const safeFilename = path.basename(fileName);
  const filePath = path.join(uploadDir, safeFilename);

  if (fs.existsSync(filePath)) {
    return true;
  }

  const count = await PdfAsset.countDocuments({
    $or: [
      { fileName: safeFilename },
      { originalName: safeFilename },
    ],
  });

  return count > 0;
}

/**
 * Bi-directional startup synchronization between local disk and MongoDB Atlas
 */
async function syncAllPdfAssets() {
  ensureUploadDir();
  let syncedToDb = 0;
  let hydratedToDisk = 0;

  try {
    // 1. Sync any disk files into MongoDB if not already present
    if (fs.existsSync(uploadDir)) {
      const diskFiles = fs.readdirSync(uploadDir).filter((f) => f.endsWith('.pdf'));
      for (const file of diskFiles) {
        const filePath = path.join(uploadDir, file);
        try {
          const stats = fs.statSync(filePath);
          if (stats.isFile() && stats.size > 0) {
            const existsInDb = await PdfAsset.exists({ fileName: file });
            if (!existsInDb) {
              const buffer = fs.readFileSync(filePath);
              const parts = file.split('_');
              const origName = parts.length > 2 ? parts.slice(2).join('_') : file;
              await PdfAsset.create({
                fileName: file,
                originalName: origName,
                data: buffer,
                size: buffer.length,
                mimeType: 'application/pdf',
              });
              syncedToDb++;
            }
          }
        } catch (e) {
          console.warn(`[PdfStorage Sync] Error syncing ${file} to DB:`, e.message);
        }
      }
    }

    // 2. Hydrate all MongoDB assets to local disk if missing on disk
    const allDbAssets = await PdfAsset.find({}, { fileName: 1, data: 1 }).lean();
    for (const asset of allDbAssets) {
      if (asset.fileName && asset.data) {
        const targetPath = path.join(uploadDir, asset.fileName);
        if (!fs.existsSync(targetPath)) {
          try {
            fs.writeFileSync(targetPath, asset.data);
            hydratedToDisk++;
          } catch (e) {
            console.warn(`[PdfStorage Sync] Error hydrating ${asset.fileName} to disk:`, e.message);
          }
        }
      }
    }

    console.log(`[PdfStorage] Bi-directional sync complete: ${syncedToDb} disk files saved to DB, ${hydratedToDisk} DB assets hydrated to disk.`);
  } catch (err) {
    console.warn('[PdfStorage] Startup sync encountered non-fatal error:', err.message);
  }
}

module.exports = {
  savePdfAsset,
  getPdfAsset,
  validateQuestionPdfExists,
  syncAllPdfAssets,
};
