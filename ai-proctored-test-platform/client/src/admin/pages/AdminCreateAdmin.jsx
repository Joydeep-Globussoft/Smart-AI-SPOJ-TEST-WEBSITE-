// AdminCreateAdmin.jsx — Super Admin Account Provisioning & Management
// Implements PRD Section 3 (Roles Matrix), Section 8.2 (Admin Schema), Section 9.1, Section 11.1 (FR-1.1), BUG-01, BUG-02
import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminNavbar from '../../shared/AdminNavbar';
import LoadingDots from '../../shared/LoadingDots';
import api from '../../services/apiClient';
import { useAuth } from '../../hooks/useAuthContext';
import PasswordInput from '../../shared/PasswordInput';

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

  // Existing Admins state (BUG-01, BUG-02)
  const [admins, setAdmins] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState(null);

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
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg-card)',
          transition: 'background 0.15s ease',
        }}
      >
        {/* Index (#) */}
        <td style={{ padding: '14px 16px', color: 'var(--color-text-muted)', fontWeight: 600, textAlign: 'center', fontSize: '0.82rem' }}>
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
            <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>
              SUPER_ADMIN
            </span>
          ) : (
            <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
              ADMIN
            </span>
          )}
        </td>

        {/* Status Badge */}
        <td style={{ padding: '14px 20px' }}>
          {adm.isActive ? (
            <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
              Active
            </span>
          ) : (
            <span
              className="badge badge-danger"
              style={{
                fontSize: '0.7rem',
              }}
            >
              Deactivated
            </span>
          )}
        </td>

        {/* Created Date */}
        <td style={{ padding: '14px 20px', color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
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
            <span style={{ color: 'var(--color-text-light)', fontStyle: 'italic' }}>System</span>
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
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
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
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
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
    <div className="app-layout">
      <AdminNavbar />
      <main className="main-content">
        {/* Breadcrumb Navigation */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
          <Link to="/admin" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>
            ← Dashboard
          </Link>
          <span style={{ color: 'var(--color-text-light)' }}>/</span>
          <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Manage Admins</span>
        </div>

        {/* Header */}
        <div className="card" style={{ marginBottom: 24, padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h1 style={{ fontSize: '1.7rem', color: 'var(--color-navy)', fontWeight: 800 }}>
                  Admin Account Management
                </h1>
                <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                  Super Admin Only
                </span>
              </div>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: 4 }}>
                Provision and manage organizational admin accounts with Role-Based Access Control (RBAC).
              </p>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              Logged in as: <strong>{user?.name}</strong> (<span style={{ color: '#2ECC71', fontWeight: 700 }}>{user?.role}</span>)
            </div>
          </div>
        </div>

        {/* 2-Column Grid: Form & Permissions Matrix */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1.2fr) minmax(300px, 1fr)', gap: 24, marginBottom: 24 }}>

          {/* Create Admin Form */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Create Admin Account</h3>
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="form-group">
                  <label className="form-label">Full Name *</label>
                  <input
                    type="text"
                    name="name"
                    className="form-control"
                    placeholder="e.g. Priya Sharma"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email Address *</label>
                  <input
                    type="email"
                    name="email"
                    className="form-control"
                    placeholder="e.g. priya.sharma@globussoft.in"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Temporary Password *</label>
                  <PasswordInput
                    name="password"
                    className="form-control"
                    placeholder="At least 6 characters"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                    minLength={6}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Role Assignment *</label>
                  <select
                    name="role"
                    className="form-select"
                    value={formData.role}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="ADMIN">ADMIN — Standard Access</option>
                    <option value="SUPER_ADMIN">SUPER_ADMIN — Full Control</option>
                  </select>
                  <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                    {formData.role === 'SUPER_ADMIN'
                      ? '⚠️ SUPER_ADMIN can create and manage other Admin accounts.'
                      : 'ℹ️ ADMIN can create tests, manage rooms, monitor live sessions, and view results.'}
                  </small>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                  style={{ marginTop: 8 }}
                >
                  {loading ? 'Provisioning Account...' : '+ Create Admin Account'}
                </button>
              </div>
            </form>
          </div>

          {/* Role Permissions Matrix (Section 3) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Role Based Permissions</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: '0.85rem' }}>
                <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>SUPER_ADMIN</span>
                    <strong style={{ color: 'var(--color-navy)' }}>Full Platform Control</strong>
                  </div>
                  <ul style={{ paddingLeft: 18, color: 'var(--color-text)', lineHeight: 1.6, fontSize: '0.8rem' }}>
                    <li>Create &amp; manage other Admin accounts</li>
                    <li>Create, configure, start, and end tests</li>
                    <li>Manage Question Sets &amp; Question Bank</li>
                    <li>Live proctoring monitoring, warnings, &amp; disqualifications</li>
                    <li>Recalculate passing criteria &amp; malpractice thresholds</li>
                    <li>Export branded shortlist PDFs</li>
                  </ul>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>ADMIN</span>
                    <strong style={{ color: 'var(--color-navy)' }}>Test Operations &amp; Proctoring</strong>
                  </div>
                  <ul style={{ paddingLeft: 18, color: 'var(--color-text)', lineHeight: 1.6, fontSize: '0.8rem' }}>
                    <li>Create &amp; manage tests and physical test rooms</li>
                    <li>Manage Question Sets &amp; Question Bank</li>
                    <li>Live proctoring monitoring &amp; malpractice review</li>
                    <li>Export shortlisted candidate PDFs</li>
                    <li style={{ color: '#E74C3C', fontWeight: 600 }}>Cannot create other Admin accounts (403 Forbidden)</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Session Created Admins List */}
            {createdAdmins.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Provisioned This Session ({createdAdmins.length})</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {createdAdmins.map((adm, i) => (
                    <div
                      key={adm.id || i}
                      style={{
                        background: 'var(--color-bg-subtle)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                        padding: 10,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.85rem',
                      }}
                    >
                      <div>
                        <strong style={{ color: 'var(--color-navy)' }}>{adm.name}</strong>
                        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>{adm.email}</div>
                      </div>
                      <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                        {adm.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Active Admins Section (BUG-03) ── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            className="card-header"
            style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <div>
              <h3 className="card-title" style={{ fontSize: '1.15rem' }}>
                Active Admins
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                Full listing of organizational administrators, active states, and role assignments.
              </p>
            </div>
          </div>

          {loadingList && admins.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-muted)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                <LoadingDots size="md" />
              </div>
              <p style={{ fontSize: '0.85rem' }}>Loading admin accounts...</p>
            </div>
          ) : displayedAdmins.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--color-text-muted)' }}>
              <div style={{ fontSize: '2.2rem', marginBottom: 8 }}>👥</div>
              <h4 style={{ color: 'var(--color-navy)', marginBottom: 4 }}>No other admin accounts yet</h4>
              <p style={{ fontSize: '0.85rem' }}>
                Use the form above to provision additional organizational administrators.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                <tbody>
                  {/* Group 1 Divider: Super Admins (BUG-03) */}
                  <tr style={{ background: 'var(--color-bg-subtle)', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
                    <td
                      colSpan={8}
                      style={{
                        padding: '11px 20px',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        color: 'var(--color-navy)',
                        borderLeft: '4px solid var(--color-primary)',
                      }}
                    >
                      Super Admins
                    </td>
                  </tr>

                  {/* Super Admins Column Header Row */}
                  <tr
                    style={{
                      background: 'var(--color-table-header-bg)',
                      borderBottom: '1px solid var(--color-border)',
                      color: 'var(--color-table-header-text)',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    <th style={{ padding: '10px 16px', fontWeight: 600, width: 44, textAlign: 'center' }}></th>
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
                          color: 'var(--color-text-muted)',
                          fontSize: '0.82rem',
                          fontStyle: 'italic',
                          background: 'var(--color-bg-card)',
                          borderBottom: '1px solid var(--color-border)',
                        }}
                      >
                        No other Super Admins
                      </td>
                    </tr>
                  ) : (
                    superAdmins.map((adm, idx) => renderAdminRow(adm, idx + 1))
                  )}

                  {/* Group 2 Divider: Admins (BUG-03) */}
                  <tr style={{ background: 'var(--color-bg-subtle)', borderTop: '2px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
                    <td
                      colSpan={8}
                      style={{
                        padding: '11px 20px',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        color: 'var(--color-navy)',
                        borderLeft: '4px solid var(--color-primary)',
                      }}
                    >
                      Admins
                    </td>
                  </tr>

                  {/* Admins Column Header Row */}
                  <tr
                    style={{
                      background: 'var(--color-table-header-bg)',
                      borderBottom: '1px solid var(--color-border)',
                      color: 'var(--color-table-header-text)',
                      fontSize: '0.75rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    <th style={{ padding: '10px 16px', fontWeight: 600, width: 44, textAlign: 'center' }}></th>
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
                          color: '#94A3B8',
                          fontSize: '0.82rem',
                          fontStyle: 'italic',
                          background: '#ffffff',
                          borderBottom: '1px solid #f1f5f9',
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

        {/* ── Edit Admin Modal ── */}
        {editAdmin && (
          <div className="modal-backdrop" onClick={() => !savingEdit && setEditAdmin(null)}>
            <div
              className="modal-container"
              style={{ maxWidth: 500 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3 className="modal-title">Edit Admin Account</h3>
                <button
                  type="button"
                  onClick={() => !savingEdit && setEditAdmin(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#64748b' }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveEdit}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Full Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editFormData.name}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Email Address *</label>
                    <input
                      type="email"
                      className="form-control"
                      value={editFormData.email}
                      onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Role Assignment *</label>
                    <select
                      className="form-select"
                      value={editFormData.role}
                      disabled={isCurrentUser(editAdmin)}
                      onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}
                    >
                      <option value="ADMIN">ADMIN — Standard Access</option>
                      <option value="SUPER_ADMIN">SUPER_ADMIN — Full Control</option>
                    </select>
                    {isCurrentUser(editAdmin) ? (
                      <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                        🔒 You cannot change your own Super Admin role.
                      </small>
                    ) : (
                      <small style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                        {editFormData.role === 'SUPER_ADMIN'
                          ? '⚠️ SUPER_ADMIN can create and manage other Admin accounts.'
                          : 'ℹ️ ADMIN can create tests, manage rooms, monitor live sessions, and view results.'}
                      </small>
                    )}
                  </div>
                </div>

                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={() => setEditAdmin(null)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="btn btn-primary"
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
              style={{ maxWidth: 460 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header" style={{ borderBottom: '1px solid #fecaca', background: '#fef2f2' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                  <h3 className="modal-title" style={{ color: '#dc2626' }}>Deactivate Admin Account</h3>
                </div>
                <button
                  type="button"
                  onClick={() => !deactivating && setDeactivateModalAdmin(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#64748b' }}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ fontSize: '0.9rem', color: '#334155', lineHeight: 1.6 }}>
                <p>
                  Are you sure you want to deactivate <strong>{deactivateModalAdmin.name}</strong> (<code>{deactivateModalAdmin.email}</code>)?
                </p>
                <p style={{ marginTop: 8, fontSize: '0.85rem', color: '#64748b' }}>
                  Their credentials will be immediately blocked from signing in until a Super Admin reactivates the account.
                </p>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  disabled={deactivating}
                  onClick={() => setDeactivateModalAdmin(null)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deactivating}
                  onClick={handleConfirmDeactivate}
                  className="btn btn-danger"
                  style={{ background: '#dc2626', borderColor: '#b91c1c' }}
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
              style={{ maxWidth: 460 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header" style={{ borderBottom: '1px solid #fecaca', background: '#fef2f2' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.2rem' }}>🗑️</span>
                  <h3 className="modal-title" style={{ color: '#dc2626' }}>Delete Admin Account</h3>
                </div>
                <button
                  type="button"
                  onClick={() => !deleting && setDeleteModalAdmin(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: '#64748b' }}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ fontSize: '0.9rem', color: '#334155', lineHeight: 1.6 }}>
                <p>
                  This will permanently remove the admin account for <strong>{deleteModalAdmin.name}</strong> (<code>{deleteModalAdmin.email}</code>). Continue?
                </p>
                <p style={{ marginTop: 8, fontSize: '0.82rem', color: '#ef4444', fontWeight: 600 }}>
                  ⚠️ This action cannot be undone. All access will be revoked permanently.
                </p>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => setDeleteModalAdmin(null)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleConfirmDelete}
                  className="btn btn-danger"
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
