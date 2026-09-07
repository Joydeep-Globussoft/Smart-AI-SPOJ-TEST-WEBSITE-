// Admin Controller — Super Admin CRUD & Admin Self-Profile Management
// Implements PRD Section 3 (Roles & Permissions), Section 8.2 (Admin Schema), BUG-01, BUG-04
const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');

/**
 * GET /admins
 * Query filter: ?isActive=true/false
 * Access: SUPER_ADMIN only
 * Returns: { admins: [...] } without passwordHash
 */
const getAdmins = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.isActive !== undefined) {
      filter.isActive = req.query.isActive === 'true';
    }

    const admins = await Admin.find(filter)
      .select('-passwordHash')
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 });

    res.json({ admins });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /admins/:adminId
 * Access: SUPER_ADMIN only
 * Returns: { admin } without passwordHash
 */
const getAdminById = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.params.adminId)
      .select('-passwordHash')
      .populate('createdBy', 'name email role');
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    res.json({ admin });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /admins/:adminId
 * Body: { name?, email?, role? }
 * Access: SUPER_ADMIN only
 * Returns: { admin } without passwordHash
 */
const updateAdmin = async (req, res, next) => {
  try {
    const { name, email, role } = req.body;
    const targetAdmin = await Admin.findById(req.params.adminId);
    if (!targetAdmin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ error: 'Name cannot be empty' });
      }
      targetAdmin.name = name.trim();
    }

    if (email !== undefined) {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail) {
        return res.status(400).json({ error: 'Email cannot be empty' });
      }
      // Check email uniqueness if changed
      if (cleanEmail !== targetAdmin.email) {
        const existing = await Admin.findOne({
          email: cleanEmail,
          _id: { $ne: targetAdmin._id },
        });
        if (existing) {
          return res.status(409).json({ error: 'Email is already in use by another admin' });
        }
        targetAdmin.email = cleanEmail;
      }
    }

    if (role !== undefined) {
      if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be SUPER_ADMIN or ADMIN' });
      }
      // Guard against demoting the last active Super Admin
      if (targetAdmin.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN') {
        const activeSuperAdminCount = await Admin.countDocuments({
          role: 'SUPER_ADMIN',
          isActive: true,
        });
        if (activeSuperAdminCount <= 1 && targetAdmin.isActive) {
          return res.status(400).json({
            error: 'Cannot change the role of the last remaining active Super Admin',
          });
        }
      }
      targetAdmin.role = role;
    }

    await targetAdmin.save();

    const updated = await Admin.findById(targetAdmin._id)
      .select('-passwordHash')
      .populate('createdBy', 'name email role');
    res.json({ admin: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /admins/:adminId/deactivate
 * Access: SUPER_ADMIN only
 * Returns: { admin } with isActive: false
 */
const deactivateAdmin = async (req, res, next) => {
  try {
    const { adminId } = req.params;

    // Self-lockout guard: Super Admin cannot deactivate own account
    if (adminId === req.user.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }

    const targetAdmin = await Admin.findById(adminId);
    if (!targetAdmin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // Last active Super Admin guard
    if (targetAdmin.role === 'SUPER_ADMIN' && targetAdmin.isActive) {
      const activeSuperAdminCount = await Admin.countDocuments({
        role: 'SUPER_ADMIN',
        isActive: true,
      });
      if (activeSuperAdminCount <= 1) {
        return res.status(400).json({
          error: 'Cannot deactivate the last remaining active Super Admin',
        });
      }
    }

    targetAdmin.isActive = false;
    await targetAdmin.save();

    const updated = await Admin.findById(targetAdmin._id)
      .select('-passwordHash')
      .populate('createdBy', 'name email role');
    res.json({ admin: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /admins/:adminId/activate
 * Access: SUPER_ADMIN only
 * Returns: { admin } with isActive: true
 */
const activateAdmin = async (req, res, next) => {
  try {
    const { adminId } = req.params;
    const targetAdmin = await Admin.findById(adminId);
    if (!targetAdmin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    targetAdmin.isActive = true;
    await targetAdmin.save();

    const updated = await Admin.findById(targetAdmin._id)
      .select('-passwordHash')
      .populate('createdBy', 'name email role');
    res.json({ admin: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /admins/:adminId
 * Access: SUPER_ADMIN only
 * Returns: { success: true }
 */
const deleteAdmin = async (req, res, next) => {
  try {
    const { adminId } = req.params;

    // Self-lockout guard: Super Admin cannot delete own account
    if (adminId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    const targetAdmin = await Admin.findById(adminId);
    if (!targetAdmin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // Last Super Admin guard
    if (targetAdmin.role === 'SUPER_ADMIN') {
      const totalSuperAdminCount = await Admin.countDocuments({ role: 'SUPER_ADMIN' });
      if (totalSuperAdminCount <= 1) {
        return res.status(400).json({
          error: 'Cannot delete the last remaining Super Admin',
        });
      }
    }

    await Admin.findByIdAndDelete(adminId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /admins/me or /me
 * Access: Any authenticated Admin (ADMIN or SUPER_ADMIN)
 * Returns: { admin: { _id, name, email, phone, role, isActive, createdAt } } without passwordHash
 */
const getMe = async (req, res, next) => {
  try {
    const admin = await Admin.findById(req.user.id).select('-passwordHash');
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }
    res.json({ admin });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /admins/me or /me
 * Body: { name?, phone? }
 * Access: Any authenticated Admin (ADMIN or SUPER_ADMIN)
 * Returns: { admin } without passwordHash
 */
const updateMe = async (req, res, next) => {
  try {
    const { name, phone } = req.body;
    const admin = await Admin.findById(req.user.id);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ error: 'Name cannot be empty' });
      }
      admin.name = name.trim();
    }

    if (phone !== undefined) {
      admin.phone = phone ? phone.trim() : null;
    }

    await admin.save();
    const updated = await Admin.findById(admin._id).select('-passwordHash');
    res.json({ admin: updated });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /admins/me/password or /me/password
 * Body: { currentPassword, newPassword }
 * Access: Any authenticated Admin (ADMIN or SUPER_ADMIN)
 * Returns: { success: true }
 */
const updateMyPassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const admin = await Admin.findById(req.user.id);
    if (!admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    const BCRYPT_SALT_ROUNDS = 12;
    admin.passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await admin.save();

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /candidates/:candidateId/disqualify
 * Access: ADMIN or SUPER_ADMIN
 * Disqualifies candidate, transitions submissions to AUTO_SUBMITTED_DISQUALIFIED, and recalculates evaluation (FEATURE-008)
 */
const disqualifyCandidate = async (req, res, next) => {
  try {
    const { candidateId } = req.params;
    const { testId } = req.body || {};
    const Candidate = require('../models/Candidate');
    const Submission = require('../models/Submission');

    const candidate = await Candidate.findByIdAndUpdate(candidateId, { isDisqualified: true }, { new: true });
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    if (testId) {
      await Submission.updateMany(
        { candidateId, testId },
        { status: 'AUTO_SUBMITTED_DISQUALIFIED', submittedAt: new Date() }
      );

      const io = req.app.get('io');
      if (io) {
        io.to(`candidate:${candidateId}`).emit('candidate:disqualified', { reason: 'MANUAL' });
        io.to(`test:${testId}:admin`).emit('seatmap:status', {
          candidateId,
          colorStatus: 'RED',
        });
        io.to(`test:${testId}:admin`).emit('dashboard:update', {
          candidateId: candidateId.toString(),
          status: 'DISQUALIFIED',
          colorStatus: 'RED',
        });
      }

      // Re-run evaluation & shortlist pass
      const evaluationService = require('../services/evaluationService');
      evaluationService.runFinalEvaluationPass(testId).catch(() => {});
    }

    res.json({ success: true, message: 'Candidate disqualified successfully', candidate });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /candidates/:candidateId/warn
 * Access: ADMIN or SUPER_ADMIN
 * Issues an official proctor warning to a candidate with active/past malpractice violations (BUG-64)
 */
const warnCandidate = async (req, res, next) => {
  try {
    const { candidateId } = req.params;
    const { testId, violationType: inputViolationType, logId } = req.body || {};
    const Candidate = require('../models/Candidate');
    const MalpracticeLog = require('../models/MalpracticeLog');

    const candidate = await Candidate.findById(candidateId);
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

    let targetLog = null;
    let violationType = inputViolationType;

    if (logId) {
      targetLog = await MalpracticeLog.findById(logId);
    } else if (testId) {
      targetLog = await MalpracticeLog.findOne({ candidateId, testId }).sort({ detectedAt: -1 });
    } else {
      targetLog = await MalpracticeLog.findOne({ candidateId }).sort({ detectedAt: -1 });
    }

    if (targetLog) {
      targetLog.adminAction = 'WARNED';
      targetLog.adminReviewed = true;
      targetLog.reviewedBy = req.user.id;
      targetLog.reviewedAt = new Date();
      await targetLog.save();
      if (!violationType) {
        violationType = targetLog.violationType;
      }
    }

    if (!violationType) {
      violationType = 'OTHER';
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`candidate:${candidateId}`).emit('candidate:warning-issued', {
        warningId: (targetLog?._id || new (require('mongoose').Types.ObjectId)()).toString(),
        violationType,
        issuedAt: new Date().toISOString(),
        adminName: req.user?.name || 'Proctor',
      });
    }

    res.json({
      success: true,
      message: 'Official proctor warning delivered to candidate',
      candidateId,
      violationType,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getAdmins,
  getAdminById,
  updateAdmin,
  deactivateAdmin,
  activateAdmin,
  deleteAdmin,
  getMe,
  updateMe,
  updateMyPassword,
  disqualifyCandidate,
  warnCandidate,
};
