// AdminSettings.jsx — Dedicated Admin Settings & Change Password Page (BUG-05)
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminNavbar from '../../shared/AdminNavbar';
import api from '../../services/apiClient';
import { useAuth } from '../../hooks/useAuthContext';
import PasswordInput from '../../shared/PasswordInput';

export default function AdminSettings() {
  const { user } = useAuth();

  // Password Form state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState({ error: '', success: '' });

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPasswordMsg({ error: '', success: '' });

    const { currentPassword, newPassword, confirmPassword } = passwordData;

    if (!currentPassword || !newPassword || !confirmPassword) {
      const err = 'All password fields are required';
      setPasswordMsg({ error: err, success: '' });
      return toast.error(err);
    }

    if (newPassword.length < 6) {
      const err = 'New password must be at least 6 characters';
      setPasswordMsg({ error: err, success: '' });
      return toast.error(err);
    }

    if (newPassword !== confirmPassword) {
      const err = 'New password and confirmation do not match';
      setPasswordMsg({ error: err, success: '' });
      return toast.error(err);
    }

    try {
      setSavingPassword(true);
      await api.updateMyPassword({ currentPassword, newPassword });

      setPasswordMsg({ error: '', success: 'Password changed successfully!' });
      toast.success('Password changed successfully');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to change password';
      setPasswordMsg({ error: errorMsg, success: '' });
      toast.error(errorMsg);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="app-layout">
      <AdminNavbar />
      <main className="main-content">
        {/* Breadcrumbs */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
          <Link to="/admin" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>
            ← Dashboard
          </Link>
          <span style={{ color: 'var(--color-text-light)' }}>/</span>
          <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>Settings</span>
        </div>

        {/* Header */}
        <div className="card" style={{ marginBottom: 24, padding: '24px 28px' }}>
          <h1 style={{ fontSize: '1.6rem', color: 'var(--color-navy)', fontWeight: 800 }}>
            Account Settings
          </h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: 4 }}>
            Manage your account security credentials and security preferences.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1.2fr) minmax(280px, 0.8fr)', gap: 24 }}>
          {/* Security / Password Form Card */}
          <div className="card" style={{ padding: '28px 32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: '1.4rem' }}>🔐</span>
              <h2 style={{ fontSize: '1.25rem', color: 'var(--color-navy)', fontWeight: 700, margin: 0 }}>
                Change Password
              </h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 20 }}>
              Update your account password. Must be at least 6 characters long.
            </p>

            {/* Inline Error Banner */}
            {passwordMsg.error && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  padding: '10px 14px',
                  borderRadius: 6,
                  fontSize: '0.85rem',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>⚠️</span>
                <span>{passwordMsg.error}</span>
              </div>
            )}

            {/* Inline Success Banner */}
            {passwordMsg.success && (
              <div
                style={{
                  background: 'rgba(34, 197, 94, 0.12)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  color: '#22c55e',
                  padding: '10px 14px',
                  borderRadius: 6,
                  fontSize: '0.85rem',
                  marginBottom: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span>✓</span>
                <span>{passwordMsg.success}</span>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Current Password */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Current Password *
                  </label>
                  <PasswordInput
                    name="currentPassword"
                    className="form-control"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                    placeholder="Enter existing password"
                    required
                  />
                </div>

                {/* New Password */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    New Password *
                  </label>
                  <PasswordInput
                    name="newPassword"
                    className="form-control"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                    placeholder="At least 6 characters"
                    required
                    minLength={6}
                  />
                  <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                    Choose a strong password containing letters, numbers, and symbols.
                  </small>
                </div>

                {/* Confirm New Password */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Confirm New Password *
                  </label>
                  <PasswordInput
                    name="confirmPassword"
                    className="form-control"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                    placeholder="Re-enter new password"
                    required
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="btn btn-primary"
                    style={{ padding: '9px 24px', fontSize: '0.875rem' }}
                  >
                    {savingPassword ? 'Updating Password...' : 'Save New Password'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* Account Overview Card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '1.05rem', color: 'var(--color-navy)', fontWeight: 700, marginBottom: 12 }}>
                Account Security Overview
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Account:</span>
                  <strong style={{ color: 'var(--color-navy)' }}>{user?.name}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Role:</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{user?.role}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Session Status:</span>
                  <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Active</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Encryption:</span>
                  <span style={{ color: 'var(--color-navy)', fontSize: '0.8rem' }}>bcrypt (cost factor 12)</span>
                </div>
              </div>

              <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
                <Link
                  to="/admin/profile"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    color: 'var(--color-primary)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    textDecoration: 'none',
                  }}
                >
                  <span>Edit Personal Information</span>
                  <span>→</span>
                </Link>
              </div>
            </div>

            <div className="card" style={{ padding: '24px', background: 'var(--color-bg-subtle)' }}>
              <h4 style={{ fontSize: '0.9rem', color: 'var(--color-navy)', fontWeight: 700, marginBottom: 6 }}>
                💡 Password Best Practices
              </h4>
              <ul style={{ paddingLeft: 18, margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                <li>Do not reuse passwords across multiple systems.</li>
                <li>Avoid predictable dictionary words or birthdays.</li>
                <li>Use a unique passphrase with at least 8 characters.</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
