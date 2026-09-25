// test_bug109_pdf_binary_type_hydration.js — QA verification for BUG-109
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { syncAllPdfAssets, getPdfAsset, toBuffer } = require('../../services/pdfStorageService');
const PdfAsset = require('../../models/PdfAsset');
const { BSON } = require('mongodb');

async function runTest() {
  console.log('--- [BUG-109] Starting QA Verification for PDF Binary Hydration ---');

  // Test 1: toBuffer converts raw BSON Binary
  const testPayload = Buffer.from('%PDF-1.4 Mock Header Data for QA');
  const bsonBin = new BSON.Binary(testPayload);
  const convertedBuf = toBuffer(bsonBin);
  assert(Buffer.isBuffer(convertedBuf), 'toBuffer returns a native Node Buffer from BSON Binary');
  assert.strictEqual(convertedBuf.toString(), testPayload.toString(), 'Buffer content matches original binary payload');
  console.log('✓ Test 1: toBuffer correctly converts BSON.Binary to Buffer');

  // Connect to live MongoDB
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✓ Connected to MongoDB');

  // Test 2: Verify all DB assets in PdfAsset collection are convertible and valid
  const dbAssets = await PdfAsset.find({}, { fileName: 1, originalName: 1, data: 1 }).lean();
  console.log(`✓ Fetched ${dbAssets.length} documents from MongoDB PdfAsset collection`);
  assert(dbAssets.length > 0, 'Database contains PdfAsset documents');

  let validConversions = 0;
  for (const asset of dbAssets) {
    const buf = toBuffer(asset.data);
    assert(Buffer.isBuffer(buf), `Asset ${asset.fileName} data successfully converts to Buffer`);
    assert(buf.length > 0, `Asset ${asset.fileName} has non-zero byte length`);
    validConversions++;
  }
  console.log(`✓ Test 2: All ${validConversions} DB documents converted to valid Node Buffers with 0 type errors`);

  // Test 3: Test named files from log (set_1.pdf, set_4.pdf, QA_Algorithm_Problem_Set_1.pdf, globussoft_programming_questions.pdf)
  const targetNamedFiles = [
    '1789553769949_05679d7b_set_1.pdf',
    '1789555358929_a414d312_set_4.pdf',
    '1789452487420_f9e38a0b_QA_Algorithm_Problem_Set_1.pdf',
    '1789455926390_4f60b4a5_globussoft_programming_questions.pdf'
  ];

  for (const fileName of targetNamedFiles) {
    const res = await getPdfAsset(fileName);
    assert(res !== null, `getPdfAsset retrieved ${fileName}`);
    assert(fs.existsSync(res.filePath), `File exists on disk at ${res.filePath}`);
    const stat = fs.statSync(res.filePath);
    assert(stat.size > 0, `Hydrated file ${fileName} has valid size on disk: ${stat.size} bytes`);
    console.log(`✓ Test 3: Verified retrieval and on-disk validity for ${fileName} (${stat.size} bytes)`);
  }

  // Test 4: Simulate full container sync
  console.log('--- Testing syncAllPdfAssets ---');
  await syncAllPdfAssets();
  console.log('✓ Test 4: syncAllPdfAssets executed with 0 unhandled exceptions or Binary type errors');

  console.log('--- [BUG-109] ALL VERIFICATIONS PASSED ---');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('QA Test Failure:', err);
  process.exit(1);
});
