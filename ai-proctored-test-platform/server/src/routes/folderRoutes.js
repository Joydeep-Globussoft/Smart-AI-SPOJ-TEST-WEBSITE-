const express = require('express');
const router = express.Router();
const {
  getFolders,
  createFolder,
  getFolder,
  updateFolder,
  deleteFolder,
} = require('../controllers/folderController');
const { verifyToken, requireAdmin } = require('../middleware/authMiddleware');

router.get('/folders', verifyToken, requireAdmin, getFolders);
router.post('/folders', verifyToken, requireAdmin, createFolder);
router.get('/folders/:id', verifyToken, requireAdmin, getFolder);
router.patch('/folders/:id', verifyToken, requireAdmin, updateFolder);
router.delete('/folders/:id', verifyToken, requireAdmin, deleteFolder);

module.exports = router;
