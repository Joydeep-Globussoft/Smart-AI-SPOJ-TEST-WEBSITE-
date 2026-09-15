// PdfAsset.js — Persistent MongoDB storage for PDF problem statement files
// Implements BUG-005: Ensures PDF assets persist across Render container rebuilds and dyno restarts
const mongoose = require('mongoose');

const pdfAssetSchema = new mongoose.Schema({
  fileName: { type: String, required: true, unique: true, index: true },
  originalName: { type: String, required: true },
  data: { type: Buffer, required: true }, // Binary PDF data
  size: { type: Number },
  mimeType: { type: String, default: 'application/pdf' },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('PdfAsset', pdfAssetSchema);
