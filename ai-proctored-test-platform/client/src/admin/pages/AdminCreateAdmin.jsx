// AdminCreateAdmin.jsx — Super Admin Account Provisioning & Management
// Implements PRD Section 3 (Roles Matrix), Section 8.2 (Admin Schema), Section 9.1, Section 11.1 (FR-1.1), BUG-01, BUG-02, FEATURE-021
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminNavbar from '../../shared/AdminNavbar';
import LoadingDots from '../../shared/LoadingDots';
import api from '../../services/apiClient';
import { useAuth } from '../../hooks/useAuthContext';
import PasswordInput from '../../shared/PasswordInput';
import useScrollRestoration from '../../hooks/useScrollRestoration';

export default function AdminCreateAdmin() {
  const { user } = useAuth();

  // Create Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'ADMIN',
  });
  const [loading, setLoading] = useState(false);
  const [createdAdmins, setCreatedAdmins] = useState([]);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Existing Admins state (BUG-01, BUG-02)
  const [admins, setAdmins] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  // FEATURE-021: Preserved scroll position for Manage Admins page
  useScrollRestoration({
    loading: loadingList,
    key: 'admins_roster',
    dependencies: [admins.length],
  });

  // Modals state
  const [editAdmin, setEditAdmin] = useState(null);
  const [editFormData, setEditFormData] = useState({ name: '', email: '', role: 'ADMIN' });
  const [savingEdit, setSavingEdit] = useState(false);

  const [deactivateModalAdmin, setDeactivateModalAdmin] = useState(null);
  const [deactivating, setDeactivating] = useState(false);

  const [deleteModalAdmin, setDeleteModalAdmin] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch all existing admins
  const fetchAdmins = useCallback(async () => {
    try {
      setLoadingList(true);
      const res = await api.getAdmins();
      setAdmins(res.data.admins || []);
    } catch (err) {
      console.error('Failed to fetch admins:', err);
      toast.error(err.response?.data?.error || 'Failed to load existing admins');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name.trim() || !formData.email.trim() || !formData.password.trim()) {
      return toast.error('All fields are required');
    }

    if (formData.password.length < 6) {
      return toast.error('Password must be at least 6 characters');
    }

    try {
      setLoading(true);
      // POST /api/v1/auth/admin/create (FR-1.1: Super Admin only)
      const res = await api.adminCreate({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        role: formData.role,
      });

      const newAdmin = res.data.admin;
      toast.success(`Admin account created for ${newAdmin.name} (${newAdmin.role})`);

      // Track newly created admins in current session
      setCreatedAdmins((prev) => [newAdmin, ...prev]);

      // Reset form
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'ADMIN',
      });

      // Close create modal (UI/UX RESTRUCTURE-038)
      setIsCreateModalOpen(false);

      // Refresh admin list in place
      await fetchAdmins();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create admin account');
    } finally {
      setLoading(false);
    }
  };

  // Helper to check if row represents currently logged-in Super Admin (BUG-02)
  const isCurrentUser = (adminItem) => {
    if (!user || !adminItem) return false;
    return (
      adminItem._id === user.id ||
      adminItem._id === user._id ||
      adminItem.email?.toLowerCase() === user.email?.toLowerCase()
    );
  };

  // ── Edit Actions ──────────────────────────────────────────────────────────
  const handleOpenEdit = (adminItem) => {
    setEditAdmin(adminItem);
    setEditFormData({
      name: adminItem.name || '',
      email: adminItem.email || '',
      role: adminItem.role || 'ADMIN',
    });
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editAdmin) return;

    if (!editFormData.name.trim() || !editFormData.email.trim()) {
      return toast.error('Name and email are required');
    }

    try {
      setSavingEdit(true);
      const res = await api.updateAdmin(editAdmin._id, {
        name: editFormData.name.trim(),
        email: editFormData.email.trim().toLowerCase(),
        role: editFormData.role,
      });

      toast.success(`Updated ${res.data.admin?.name || 'admin'}`);
      setEditAdmin(null);
      await fetchAdmins();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update admin account');
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Deactivate / Activate Actions ─────────────────────────────────────────
  const handleConfirmDeactivate = async () => {
    if (!deactivateModalAdmin) return;

    try {
      setDeactivating(true);
      await api.deactivateAdmin(deactivateModalAdmin._id);
      toast.success(`Deactivated ${deactivateModalAdmin.name}`);
      setDeactivateModalAdmin(null);
      await fetchAdmins();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to deactivate admin');
    } finally {
      setDeactivating(false);
    }
  };

  const handleActivate = async (adminItem) => {
    try {
      setActionLoadingId(adminItem._id);
      await api.activateAdmin(adminItem._id);
      toast.success(`Activated ${adminItem.name}`);
      await fetchAdmins();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to activate admin');
    } finally {
      setActionLoadingId(null);
    }
  };

  // ── Delete Action ─────────────────────────────────────────────────────────
  const handleConfirmDelete = async () => {
    if (!deleteModalAdmin) return;

    try {
      setDeleting(true);
      await api.deleteAdmin(deleteModalAdmin._id);
      toast.success(`Deleted ${deleteModalAdmin.name}`);
      setDeleteModalAdmin(null);
      await fetchAdmins();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete admin');
    } finally {
      setDeleting(false);
    }
  };

  // BUG-02: Exclude the logged-in Super Admin's own row from this table
  const displayedAdmins = admins.filter((a) => !isCurrentUser(a));
  const superAdmins = displayedAdmins.filter((a) => a.role === 'SUPER_ADMIN');
  const regularAdmins = displayedAdmins.filter((a) => a.role === 'ADMIN');

  // Render a single admin row in the table (BUG-03: with index column)
  const renderAdminRow = (adm, index) => {
    const isActionLoading = actionLoadingId === adm._id;

    return (
      <tr
        key={adm._id}
        style={{
          borderBottom: '1px solid var(--admin-card-border, #E0E7FF)',
          background: 'var(--admin-card-bg, #FFFFFF)',
          transition: 'background 0.15s ease',
        }}
      >
        {/* Index (#) */}
        <td style={{ padding: '14px 16px', color: 'var(--admin-label, #5B6B8A)', fontWeight: 600, textAlign: 'center', fontSize: '0.82rem' }}>
          {index}
        </td>

        {/* Name */}
        <td style={{ padding: '14px 20px', color: 'var(--color-navy)', fontWeight: 600 }}>
          {adm.name}
        </td>

        {/* Email */}
        <td style={{ padding: '14px 20px', color: 'var(--color-text)' }}>
          <code>{adm.email}</code>
        </td>

        {/* Role Badge */}
        <td style={{ padding: '14px 20px' }}>
          {adm.role === 'SUPER_ADMIN' ? (
            <span
              style={{
                display: 'inline-block',
                background: 'rgba(99, 102, 241, 0.12)',
                color: 'var(--admin-indigo, #3E63DD)',
                border: '1px solid rgba(99, 102, 241, 0.28)',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.03em',
              }}
            >
              SUPER_ADMIN
            </span>
          ) : (
            <span
              style={{
                display: 'inline-block',
                background: 'rgba(142, 157, 184, 0.15)',
                color: 'var(--admin-label, #5B6B8A)',
                border: '1px solid var(--admin-card-border, #E0E7FF)',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: '0.72rem',
                fontWeight: 600,
                letterSpacing: '0.03em',
              }}
            >
              ADMIN
            </span>
          )}
        </td>

        {/* Status Badge (Keep exact casing: 'Active' / 'Deactivated') */}
        <td style={{ padding: '14px 20px' }}>
          {adm.isActive ? (
            <span
              style={{
                display: 'inline-block',
                background: 'rgba(16, 185, 129, 0.12)',
                color: '#10B981',
                border: '1px solid rgba(16, 185, 129, 0.28)',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: '0.72rem',
                fontWeight: 600,
              }}
            >
              Active
            </span>
          ) : (
            <span
              style={{
                display: 'inline-block',
                background: 'rgba(239, 68, 68, 0.12)',
                color: '#EF4444',
                border: '1px solid rgba(239, 68, 68, 0.28)',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: '0.72rem',
                fontWeight: 600,
              }}
            >
              Deactivated
            </span>
          )}
        </td>

        {/* Created Date */}
        <td style={{ padding: '14px 20px', color: 'var(--admin-label, #5B6B8A)', fontSize: '0.82rem' }}>
          {adm.createdAt
            ? new Date(adm.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
            : '—'}
        </td>

        {/* Created By (BUG-02) */}
        <td style={{ padding: '14px 20px', color: 'var(--color-text)', fontSize: '0.82rem' }}>
          {adm.createdBy?.name ? (
            <span
              title={adm.createdBy.email ? `Created by ${adm.createdBy.name} (${adm.createdBy.email})` : ''}
              style={{ fontWeight: 500 }}
            >
              {adm.createdBy.name}
            </span>
          ) : (
            <span style={{ color: 'var(--admin-label, #5B6B8A)', fontStyle: 'italic' }}>System</span>
          )}
        </td>

        {/* Actions */}
        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {/* Edit */}
            <button
              type="button"
              onClick={() => handleOpenEdit(adm)}
              className="btn btn-secondary"
              style={{
                padding: '4px 10px',
                fontSize: '0.75rem',
                background: 'var(--admin-subcard-bg, #F8FAFC)',
                borderColor: 'var(--admin-subcard-border, #E2E8F0)',
                color: 'var(--filterbar-button-text, #1E293B)',
                borderRadius: 6,
              }}
              title="Edit admin name, email, or role"
            >
              Edit
            </button>

            {/* Deactivate / Activate */}
            {adm.isActive ? (
              <button
                type="button"
                onClick={() => setDeactivateModalAdmin(adm)}
                className="btn btn-secondary"
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  color: '#b45309',
                  borderColor: '#fcd34d',
                  borderRadius: 6,
                }}
                title="Deactivate account (blocks login)"
              >
                Deactivate
              </button>
            ) : (
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => handleActivate(adm)}
                className="btn btn-secondary"
                style={{
                  padding: '4px 10px',
                  fontSize: '0.75rem',
                  color: '#15803d',
                  borderColor: '#86efac',
                  borderRadius: 6,
                }}
                title="Reactivate account"
              >
                {isActionLoading ? 'Activating...' : 'Activate'}
              </button>
            )}

            {/* Delete */}
            <button
              type="button"
              onClick={() => setDeleteModalAdmin(adm)}
              className="btn btn-danger"
              style={{
                padding: '4px 10px',
                fontSize: '0.75rem',
                background: '#dc2626',
                borderColor: '#b91c1c',
                color: '#ffffff',
                borderRadius: 6,
              }}
              title="Permanently remove admin account"
            >
              Delete
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="app-layout" style={{ background: 'var(--admin-canvas-bg, #EEF2FF)', minHeight: '100vh' }}>
      <AdminNavbar />
      <main className="main-content" style={{ background: 'var(--admin-canvas-bg, #EEF2FF)' }}>
        {/* Breadcrumb Navigation */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
          <Link to="/admin" style={{ color: 'var(--admin-indigo, #3E63DD)', fontWeight: 500 }}>
            ← Dashboard
          </Link>
          <span style={{ color: 'var(--filterbar-divider, #D8DEF0)' }}>/</span>
          <span style={{ color: 'var(--admin-label, #5B6B8A)', fontWeight: 600 }}>Manage Admins</span>
        </div>

        {/* ── SECTION 1: Header Card ── */}
        <div
          className="card"
          style={{
            marginBottom: 24,
            padding: '24px 28px',
            background: 'var(--admin-card-bg, #FFFFFF)',
            border: '1px solid var(--admin-card-border, #E0E7FF)',
            boxShadow: 'var(--admin-card-shadow)',
            borderRadius: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ fontSize: '1.7rem', color: 'var(--color-navy)', fontWeight: 800 }}>
                  Admin Account Management
                </h1>
                <span
                  style={{
                    background: 'rgba(99, 102, 241, 0.12)',
                    color: 'var(--admin-indigo, #3E63DD)',
                    border: '1px solid rgba(99, 102, 241, 0.28)',
                    borderRadius: 20,
                    padding: '3px 10px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  Super Admin Only
                </span>
              </div>
              <p style={{ color: 'var(--admin-label, #5B6B8A)', fontSize: '0.875rem', marginTop: 4 }}>
                Provision and manage organizational admin accounts with Role-Based Access Control (RBAC).
              </p>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--admin-label, #5B6B8A)' }}>
              Logged in as: <strong style={{ color: 'var(--color-navy)' }}>{user?.name}</strong> (<span style={{ color: 'var(--admin-indigo, #3E63DD)', fontWeight: 700 }}>{user?.role}</span>)
            </div>
          </div>
        </div>

        {/* ── SECTION 2: Active Admins (UI/UX RESTRUCTURE-038: Primary Top Section with + Create Admin Button) ── */}
        <div
          className="card"
          style={{
            padding: 0,
            overflow: 'hidden',
            marginBottom: 24,
            background: 'var(--admin-card-bg, #FFFFFF)',
            border: '1px solid var(--admin-card-border, #E0E7FF)',
            boxShadow: 'var(--admin-card-shadow)',
            borderRadius: 12,
          }}
        >
          <div
            className="card-header"
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--admin-card-border, #E0E7FF)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 16,
            }}
          >
            <div>
              <h3 className="card-title" style={{ fontSize: '1.15rem', color: 'var(--color-navy)', margin: 0, fontWeight: 700 }}>
                Active Admins
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--admin-label, #5B6B8A)', marginTop: 2, marginBottom: 0 }}>
                Full listing of organizational administrators, active states, and role assignments.
              </p>
            </div>
            <button
              type="button"
              id="create-admin-btn"
              className="btn"
              onClick={() => setIsCreateModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontWeight: 600,
                padding: '8px 16px',
                fontSize: '0.85rem',
                borderRadius: 8,
                background: 'var(--admin-indigo, #3E63DD)',
                color: '#ffffff',
                border: '1px solid var(--admin-indigo, #3E63DD)',
                cursor: 'pointer',
              }}
            >
              <span>+</span> Create Admin Account
            </button>
          </div>

          {loadingList && admins.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--admin-label, #5B6B8A)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <LoadingDots size="md" />
              </div>
              <p style={{ fontSize: '0.85rem' }}>Loading admin accounts...</p>
            </div>
          ) : displayedAdmins.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--admin-label, #5B6B8A)' }}>
              <div style={{ fontSize: '2.2rem', marginBottom: 8 }}>👥</div>
              <h4 style={{ color: 'var(--color-navy)', marginBottom: 4 }}>No other admin accounts yet</h4>
              <p style={{ fontSize: '0.85rem', marginBottom: 16 }}>
                Click the "+ Create Admin Account" button above to provision organizational administrators.
              </p>
              <button
                type="button"
                className="btn"
                onClick={() => setIsCreateModalOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 8,
                  background: 'var(--admin-indigo, #3E63DD)',
                  color: '#ffffff',
                  border: '1px solid var(--admin-indigo, #3E63DD)',
                  cursor: 'pointer',
                  padding: '8px 16px',
                  fontWeight: 600,
                }}
              >
                <span>+</span> Create Admin Account
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <tbody>
                  {/* Group 1 Divider: Super Admins (BUG-03) */}
                  <tr style={{ background: 'var(--admin-section-bar-bg, #F1F4FD)', borderTop: '1px solid var(--admin-card-border, #E0E7FF)', borderBottom: '1px solid var(--admin-card-border, #E0E7FF)' }}>
                    <td
                      colSpan={8}
                      style={{
                        padding: '11px 20px',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        color: 'var(--color-navy)',
                        borderLeft: '4px solid var(--admin-indigo, #3E63DD)',
                      }}
                    >
                      Super Admins
                    </td>
                  </tr>

                  {/* Super Admins Column Header Row */}
                  <tr
                    style={{
                      background: 'var(--color-table-header-bg)',
                      borderBottom: '1px solid var(--admin-card-border, #E0E7FF)',
                      color: 'var(--color-table-header-text)',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    <th style={{ padding: '10px 16px', fontWeight: 600, width: 44, textAlign: 'center' }}> </th>
                    <th style={{ padding: '10px 20px', fontWeight: 600 }}>Name</th>
                    <th style={{ padding: '10px 20px', fontWeight: 600 }}>Email</th>
                    <th style={{ padding: '10px 20px', fontWeight: 600 }}>Role</th>
                    <th style={{ padding: '10px 20px', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '10px 20px', fontWeight: 600 }}>Created Date</th>
                    <th style={{ padding: '10px 20px', fontWeight: 600 }}>Created By</th>
                    <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                  </tr>

                  {/* Super Admins Rows */}
                  {superAdmins.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        style={{
                          padding: '16px 20px',
                          textAlign: 'center',
                          color: 'var(--admin-label, #5B6B8A)',
                          fontSize: '0.82rem',
                          fontStyle: 'italic',
                          background: 'var(--admin-card-bg, #FFFFFF)',
                          borderBottom: '1px solid var(--admin-card-border, #E0E7FF)',
                        }}
                      >
                        No other Super Admins
                      </td>
                    </tr>
                  ) : (
                    superAdmins.map((adm, idx) => renderAdminRow(adm, idx + 1))
                  )}

                  {/* Group 2 Divider: Admins (BUG-03) */}
                  <tr style={{ background: 'var(--admin-section-bar-bg, #F1F4FD)', borderTop: '2px solid var(--admin-card-border, #E0E7FF)', borderBottom: '1px solid var(--admin-card-border, #E0E7FF)' }}>
                    <td
                      colSpan={8}
                      style={{
                        padding: '11px 20px',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        color: 'var(--color-navy)',
                        borderLeft: '4px solid var(--admin-indigo, #3E63DD)',
                      }}
                    >
                      Admins
                    </td>
                  </tr>

                  {/* Admins Column Header Row */}
                  <tr
                    style={{
                      background: 'var(--color-table-header-bg)',
                      borderBottom: '1px solid var(--admin-card-border, #E0E7FF)',
                      color: 'var(--color-table-header-text)',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    <th style={{ padding: '10px 16px', fontWeight: 600, width: 44, textAlign: 'center' }}> </th>
                    <th style={{ padding: '10px 20px', fontWeight: 600 }}>Name</th>
                    <th style={{ padding: '10px 20px', fontWeight: 600 }}>Email</th>
                    <th style={{ padding: '10px 20px', fontWeight: 600 }}>Role</th>
                    <th style={{ padding: '10px 20px', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '10px 20px', fontWeight: 600 }}>Created Date</th>
                    <th style={{ padding: '10px 20px', fontWeight: 600 }}>Created By</th>
                    <th style={{ padding: '10px 20px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                  </tr>

                  {/* Admins Rows */}
                  {regularAdmins.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        style={{
                          padding: '16px 20px',
                          textAlign: 'center',
                          color: 'var(--admin-label, #5B6B8A)',
                          fontSize: '0.82rem',
                          fontStyle: 'italic',
                          background: 'var(--admin-card-bg, #FFFFFF)',
                          borderBottom: '1px solid var(--admin-card-border, #E0E7FF)',
                        }}
                      >
                        No Admins yet
                      </td>
                    </tr>
                  ) : (
                    regularAdmins.map((adm, idx) => renderAdminRow(adm, idx + 1))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── SECTION 3: Role Based Permissions (UI/UX RESTRUCTURE-038: 2-Column Equal Width Layout) ── */}
        <div
          className="card"
          style={{
            marginBottom: 24,
            padding: 0,
            overflow: 'hidden',
            background: 'var(--admin-card-bg, #FFFFFF)',
            border: '1px solid var(--admin-card-border, #E0E7FF)',
            boxShadow: 'var(--admin-card-shadow)',
            borderRadius: 12,
          }}
        >
          <div
            className="card-header"
            style={{
              padding: '18px 24px',
              borderBottom: '1px solid var(--admin-card-border, #E0E7FF)',
            }}
          >
            <h3 className="card-title" style={{ fontSize: '1.1rem', color: 'var(--color-navy)', margin: 0, fontWeight: 700 }}>
              Role Based Permissions
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--admin-label, #5B6B8A)', marginTop: 2, marginBottom: 0 }}>
              Overview of platform administrative roles, capabilities, and operational boundaries.
            </p>
          </div>

          <div style={{ padding: '20px 24px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: 20,
              }}
            >
              {/* Left Column: SUPER_ADMIN */}
              <div
                style={{
                  background: 'var(--admin-subcard-bg, #F8FAFC)',
                  border: '1px solid var(--admin-subcard-border, #E2E8F0)',
                  borderRadius: 8,
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      background: 'rgba(99, 102, 241, 0.12)',
                      color: 'var(--admin-indigo, #3E63DD)',
                      border: '1px solid rgba(99, 102, 241, 0.28)',
                      borderRadius: 6,
                      padding: '3px 8px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      letterSpacing: '0.03em',
                    }}
                  >
                    SUPER_ADMIN
                  </span>
                  <strong style={{ color: 'var(--color-navy)', fontSize: '0.92rem' }}>
                    Full Platform Control
                  </strong>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-navy)', marginBottom: 6 }}>
                    Permissions:
                  </div>
                  <ul style={{ paddingLeft: 18, margin: 0, color: 'var(--color-text)', lineHeight: 1.7, fontSize: '0.82rem' }}>
                    <li>Create &amp; manage other Admin accounts</li>
                    <li>Create, configure, start, and end tests</li>
                    <li>Manage Question Sets &amp; Question Bank</li>
                    <li>Live proctoring monitoring, warnings, &amp; disqualifications</li>
                    <li>Recalculate passing criteria &amp; malpractice thresholds</li>
                    <li>Export branded shortlist PDFs</li>
                  </ul>
                </div>
              </div>

              {/* Right Column: ADMIN */}
              <div
                style={{
                  background: 'var(--admin-subcard-bg, #F8FAFC)',
                  border: '1px solid var(--admin-subcard-border, #E2E8F0)',
                  borderRadius: 8,
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      background: 'rgba(142, 157, 184, 0.15)',
                      color: 'var(--admin-label, #5B6B8A)',
                      border: '1px solid var(--admin-card-border, #E0E7FF)',
                      borderRadius: 6,
                      padding: '3px 8px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      letterSpacing: '0.03em',
                    }}
                  >
                    ADMIN
                  </span>
                  <strong style={{ color: 'var(--color-navy)', fontSize: '0.92rem' }}>
                    Test Operations &amp; Proctoring
                  </strong>
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-navy)', marginBottom: 6 }}>
                    Permissions:
                  </div>
                  <ul style={{ paddingLeft: 18, margin: 0, color: 'var(--color-text)', lineHeight: 1.7, fontSize: '0.82rem' }}>
                    <li>Create &amp; manage tests and physical test rooms</li>
                    <li>Manage Question Sets &amp; Question Bank</li>
                    <li>Live proctoring monitoring &amp; malpractice review</li>
                    <li>Export shortlisted candidate PDFs</li>
                  </ul>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#EF4444', marginTop: 10, marginBottom: 4 }}>
                    Restrictions:
                  </div>
                  <ul style={{ paddingLeft: 18, margin: 0, color: '#EF4444', lineHeight: 1.7, fontSize: '0.82rem', fontWeight: 600 }}>
                    <li>Cannot create other Admin accounts (403 Forbidden)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 4: Create Admin Account Modal (UI/UX RESTRUCTURE-038) ── */}
        {isCreateModalOpen && (
          <div className="modal-backdrop" onClick={() => !loading && setIsCreateModalOpen(false)}>
            <div
              className="modal-container"
              style={{
                maxWidth: 520,
                width: '100%',
                background: 'var(--admin-card-bg, #FFFFFF)',
                border: '1px solid var(--admin-card-border, #E0E7FF)',
                borderRadius: 12,
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="modal-header"
                style={{
                  padding: '20px 24px',
                  borderBottom: '1px solid var(--admin-card-border, #E0E7FF)',
                }}
              >
                <div>
                  <h3 className="modal-title" style={{ margin: 0, color: 'var(--color-navy)' }}>Create Admin Account</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--admin-label, #5B6B8A)', marginTop: 2, marginBottom: 0 }}>
                    Provision a new organizational admin with role-based access.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => !loading && setIsCreateModalOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--admin-label, #5B6B8A)' }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateSubmit}>
                <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ color: 'var(--admin-label, #5B6B8A)', fontWeight: 600, fontSize: '0.82rem', marginBottom: 6, display: 'block' }}>
                      Full Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      className="form-control"
                      placeholder="e.g. Priya Sharma"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      autoFocus
                      style={{
                        background: 'var(--admin-subcard-bg, #F8FAFC)',
                        borderColor: 'var(--admin-subcard-border, #E2E8F0)',
                        color: 'var(--color-text)',
                        borderRadius: 8,
                      }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ color: 'var(--admin-label, #5B6B8A)', fontWeight: 600, fontSize: '0.82rem', marginBottom: 6, display: 'block' }}>
                      Email Address *
                    </label>
                    <input
                      type="email"
                      name="email"
                      className="form-control"
                      placeholder="e.g. priya.sharma@globussoft.in"
                      value={formData.email}
                      onChange={handleInputChange}
                      required
                      style={{
                        background: 'var(--admin-subcard-bg, #F8FAFC)',
                        borderColor: 'var(--admin-subcard-border, #E2E8F0)',
                        color: 'var(--color-text)',
                        borderRadius: 8,
                      }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ color: 'var(--admin-label, #5B6B8A)', fontWeight: 600, fontSize: '0.82rem', marginBottom: 6, display: 'block' }}>
                      Temporary Password *
                    </label>
                    <PasswordInput
                      name="password"
                      className="form-control"
                      placeholder="At least 6 characters"
                      value={formData.password}
                      onChange={handleInputChange}
                      required
                      minLength={6}
                      style={{
                        background: 'var(--admin-subcard-bg, #F8FAFC)',
                        borderColor: 'var(--admin-subcard-border, #E2E8F0)',
                        color: 'var(--color-text)',
                        borderRadius: 8,
                      }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ color: 'var(--admin-label, #5B6B8A)', fontWeight: 600, fontSize: '0.82rem', marginBottom: 6, display: 'block' }}>
                      Role Assignment *
                    </label>
                    <select
                      name="role"
                      className="form-select"
                      value={formData.role}
                      onChange={handleInputChange}
                      required
                      style={{
                        background: 'var(--admin-subcard-bg, #F8FAFC)',
                        borderColor: 'var(--admin-subcard-border, #E2E8F0)',
                        color: 'var(--color-text)',
                        borderRadius: 8,
                      }}
                    >
                      <option value="ADMIN">ADMIN — Standard Access</option>
                      <option value="SUPER_ADMIN">SUPER_ADMIN — Full Control</option>
                    </select>
                    <small style={{ color: 'var(--admin-label, #5B6B8A)', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                      {formData.role === 'SUPER_ADMIN'
                        ? '⚠️ SUPER_ADMIN can create and manage other Admin accounts.'
                        : 'ℹ️ ADMIN can create tests, manage rooms, monitor live sessions, and view results.'}
                    </small>
                  </div>
                </div>

                <div
                  className="modal-footer"
                  style={{
                    padding: '16px 24px',
                    borderTop: '1px solid var(--admin-card-border, #E0E7FF)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 10,
                  }}
                >
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setIsCreateModalOpen(false)}
                    className="btn btn-secondary"
                    style={{
                      background: 'var(--admin-subcard-bg, #F8FAFC)',
                      borderColor: 'var(--admin-subcard-border, #E2E8F0)',
                      color: 'var(--filterbar-button-text, #1E293B)',
                      borderRadius: 6,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn"
                    disabled={loading}
                    style={{
                      borderRadius: 6,
                      background: 'var(--admin-indigo, #3E63DD)',
                      color: '#ffffff',
                      border: '1px solid var(--admin-indigo, #3E63DD)',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      padding: '8px 16px',
                      fontWeight: 600,
                    }}
                  >
                    {loading ? 'Provisioning Account...' : '+ Create Admin Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Edit Admin Modal ── */}
        {editAdmin && (
          <div className="modal-backdrop" onClick={() => !savingEdit && setEditAdmin(null)}>
            <div
              className="modal-container"
              style={{
                maxWidth: 500,
                width: '100%',
                background: 'var(--admin-card-bg, #FFFFFF)',
                border: '1px solid var(--admin-card-border, #E0E7FF)',
                borderRadius: 12,
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="modal-header"
                style={{
                  padding: '20px 24px',
                  borderBottom: '1px solid var(--admin-card-border, #E0E7FF)',
                }}
              >
                <h3 className="modal-title" style={{ margin: 0, color: 'var(--color-navy)' }}>Edit Admin Account</h3>
                <button
                  type="button"
                  onClick={() => !savingEdit && setEditAdmin(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--admin-label, #5B6B8A)' }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveEdit}>
                <div className="modal-body" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label" style={{ color: 'var(--admin-label, #5B6B8A)', fontWeight: 600, fontSize: '0.82rem', marginBottom: 6, display: 'block' }}>
                      Full Name *
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      required
                      style={{
                        background: 'var(--admin-subcard-bg, #F8FAFC)',
                        borderColor: 'var(--admin-subcard-border, #E2E8F0)',
                        color: 'var(--color-text)',
                        borderRadius: 8,
                      }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ color: 'var(--admin-label, #5B6B8A)', fontWeight: 600, fontSize: '0.82rem', marginBottom: 6, display: 'block' }}>
                      Email Address *
                    </label>
                    <input
                      type="email"
                      className="form-control"
                      value={editFormData.email}
                      onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                      required
                      style={{
                        background: 'var(--admin-subcard-bg, #F8FAFC)',
                        borderColor: 'var(--admin-subcard-border, #E2E8F0)',
                        color: 'var(--color-text)',
                        borderRadius: 8,
                      }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ color: 'var(--admin-label, #5B6B8A)', fontWeight: 600, fontSize: '0.82rem', marginBottom: 6, display: 'block' }}>
                      Role Assignment *
                    </label>
                    <select
                      className="form-select"
                      value={editFormData.role}
                      disabled={isCurrentUser(editAdmin)}
                      onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                      style={{
                        background: 'var(--admin-subcard-bg, #F8FAFC)',
                        borderColor: 'var(--admin-subcard-border, #E2E8F0)',
                        color: 'var(--color-text)',
                        borderRadius: 8,
                      }}
                    >
                      <option value="ADMIN">ADMIN — Standard Access</option>
                      <option value="SUPER_ADMIN">SUPER_ADMIN — Full Control</option>
                    </select>
                    {isCurrentUser(editAdmin) ? (
                      <small style={{ color: 'var(--admin-label, #5B6B8A)', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                        🔒 You cannot change your own Super Admin role.
                      </small>
                    ) : (
                      <small style={{ color: 'var(--admin-label, #5B6B8A)', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                        {editFormData.role === 'SUPER_ADMIN'
                          ? '⚠️ SUPER_ADMIN can create and manage other Admin accounts.'
                          : 'ℹ️ ADMIN can create tests, manage rooms, monitor live sessions, and view results.'}
                      </small>
                    )}
                  </div>
                </div>

                <div
                  className="modal-footer"
                  style={{
                    padding: '16px 24px',
                    borderTop: '1px solid var(--admin-card-border, #E0E7FF)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 10,
                  }}
                >
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={() => setEditAdmin(null)}
                    className="btn btn-secondary"
                    style={{
                      background: 'var(--admin-subcard-bg, #F8FAFC)',
                      borderColor: 'var(--admin-subcard-border, #E2E8F0)',
                      color: 'var(--filterbar-button-text, #1E293B)',
                      borderRadius: 6,
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="btn"
                    style={{
                      borderRadius: 6,
                      background: 'var(--admin-indigo, #3E63DD)',
                      color: '#ffffff',
                      border: '1px solid var(--admin-indigo, #3E63DD)',
                      cursor: savingEdit ? 'not-allowed' : 'pointer',
                      padding: '8px 16px',
                      fontWeight: 600,
                    }}
                  >
                    {savingEdit ? 'Saving Changes...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Deactivate Confirmation Modal ── */}
        {deactivateModalAdmin && (
          <div className="modal-backdrop" onClick={() => !deactivating && setDeactivateModalAdmin(null)}>
            <div
              className="modal-container"
              style={{
                maxWidth: 460,
                width: '100%',
                background: 'var(--admin-card-bg, #FFFFFF)',
                border: '1px solid var(--admin-card-border, #E0E7FF)',
                borderRadius: 12,
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="modal-header"
                style={{
                  borderBottom: '1px solid rgba(239, 68, 68, 0.25)',
                  background: 'rgba(239, 68, 68, 0.08)',
                  padding: '16px 20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                  <h3 className="modal-title" style={{ color: '#dc2626', margin: 0 }}>Deactivate Admin Account</h3>
                </div>
                <button
                  type="button"
                  onClick={() => !deactivating && setDeactivateModalAdmin(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--admin-label, #5B6B8A)' }}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ padding: '20px', fontSize: '0.9rem', color: 'var(--color-text)', lineHeight: 1.6 }}>
                <p style={{ margin: 0 }}>
                  Are you sure you want to deactivate <strong>{deactivateModalAdmin.name}</strong> (<code>{deactivateModalAdmin.email}</code>)?
                </p>
                <p style={{ marginTop: 8, marginBottom: 0, fontSize: '0.85rem', color: 'var(--admin-label, #5B6B8A)' }}>
                  Their credentials will be immediately blocked from signing in until a Super Admin reactivates the account.
                </p>
              </div>

              <div
                className="modal-footer"
                style={{
                  padding: '14px 20px',
                  borderTop: '1px solid var(--admin-card-border, #E0E7FF)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  disabled={deactivating}
                  onClick={() => setDeactivateModalAdmin(null)}
                  className="btn btn-secondary"
                  style={{
                    background: 'var(--admin-subcard-bg, #F8FAFC)',
                    borderColor: 'var(--admin-subcard-border, #E2E8F0)',
                    color: 'var(--filterbar-button-text, #1E293B)',
                    borderRadius: 6,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deactivating}
                  onClick={handleConfirmDeactivate}
                  className="btn btn-danger"
                  style={{ background: '#dc2626', borderColor: '#b91c1c', borderRadius: 6 }}
                >
                  {deactivating ? 'Deactivating...' : 'Confirm Deactivation'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete Confirmation Modal ── */}
        {deleteModalAdmin && (
          <div className="modal-backdrop" onClick={() => !deleting && setDeleteModalAdmin(null)}>
            <div
              className="modal-container"
              style={{
                maxWidth: 460,
                width: '100%',
                background: 'var(--admin-card-bg, #FFFFFF)',
                border: '1px solid var(--admin-card-border, #E0E7FF)',
                borderRadius: 12,
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="modal-header"
                style={{
                  borderBottom: '1px solid rgba(239, 68, 68, 0.25)',
                  background: 'rgba(239, 68, 68, 0.08)',
                  padding: '16px 20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.2rem' }}>🗑️</span>
                  <h3 className="modal-title" style={{ color: '#dc2626', margin: 0 }}>Delete Admin Account</h3>
                </div>
                <button
                  type="button"
                  onClick={() => !deleting && setDeleteModalAdmin(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--admin-label, #5B6B8A)' }}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ padding: '20px', fontSize: '0.9rem', color: 'var(--color-text)', lineHeight: 1.6 }}>
                <p style={{ margin: 0 }}>
                  This will permanently remove the admin account for <strong>{deleteModalAdmin.name}</strong> (<code>{deleteModalAdmin.email}</code>). Continue?
                </p>
                <p style={{ marginTop: 8, marginBottom: 0, fontSize: '0.82rem', color: '#ef4444', fontWeight: 600 }}>
                  ⚠️ This action cannot be undone. All access will be revoked permanently.
                </p>
              </div>

              <div
                className="modal-footer"
                style={{
                  padding: '14px 20px',
                  borderTop: '1px solid var(--admin-card-border, #E0E7FF)',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteModalAdmin(null)}
                  className="btn btn-secondary"
                  style={{
                    background: 'var(--admin-subcard-bg, #F8FAFC)',
                    borderColor: 'var(--admin-subcard-border, #E2E8F0)',
                    color: 'var(--filterbar-button-text, #1E293B)',
                    borderRadius: 6,
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleConfirmDelete}
                  className="btn btn-danger"
                  style={{ background: '#dc2626', borderColor: '#b91c1c', borderRadius: 6 }}
                >
                  {deleting ? 'Deleting...' : 'Permanently Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
