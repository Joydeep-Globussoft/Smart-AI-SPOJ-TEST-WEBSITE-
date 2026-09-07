// AdminProfile.jsx — Dedicated Admin Profile Page (BUG-05)
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminNavbar from '../../shared/AdminNavbar';
import api from '../../services/apiClient';
import { useAuth } from '../../hooks/useAuthContext';

export default function AdminProfile() {
  const { user, updateUser } = useAuth();

  const [profile, setProfile] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: '',
    role: user?.role || 'ADMIN',
    createdAt: null,
  });

  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);

  // Fetch current user's profile details
  useEffect(() => {
    let isMounted = true;
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await api.getMyProfile();
        if (isMounted && res.data.admin) {
          const adm = res.data.admin;
          setProfile({
            name: adm.name || '',
            email: adm.email || '',
            phone: adm.phone || '',
            role: adm.role || 'ADMIN',
            createdAt: adm.createdAt || null,
          });
          setEditForm({
            name: adm.name || '',
            phone: adm.phone || '',
          });
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
        toast.error('Failed to load profile details');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleStartEdit = () => {
    setEditForm({
      name: profile.name,
      phone: profile.phone,
    });
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditForm({
      name: profile.name,
      phone: profile.phone,
    });
    setEditing(false);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();

    if (!editForm.name.trim()) {
      return toast.error('Full Name cannot be empty');
    }

    try {
      setSaving(true);
      const res = await api.updateMyProfile({
        name: editForm.name.trim(),
        phone: editForm.phone.trim() || null,
      });

      const updated = res.data.admin;
      setProfile((prev) => ({
        ...prev,
        name: updated.name,
        phone: updated.phone || '',
      }));

      updateUser({
        name: updated.name,
        phone: updated.phone || null,
      });

      toast.success('Profile updated successfully');
      setEditing(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-layout">
      <AdminNavbar />
      <main className="main-content">
        {/* Breadcrumbs */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
          <Link to="/admin" style={{ color: '#0E7C86', fontWeight: 500 }}>
            ← Dashboard
          </Link>
          <span style={{ color: '#9ca3af' }}>/</span>
          <span style={{ color: '#4b5563', fontWeight: 600 }}>My Profile</span>
        </div>

        {/* Header card */}
        <div className="card" style={{ marginBottom: 24, padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <h1 style={{ fontSize: '1.6rem', color: '#1A2B3C', fontWeight: 800 }}>
                Administrator Profile
              </h1>
              <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: 4 }}>
                View and manage your personal administrator account details.
              </p>
            </div>
            {!editing && (
              <button
                type="button"
                onClick={handleStartEdit}
                className="btn btn-primary"
                style={{ padding: '8px 18px', fontSize: '0.85rem' }}
              >
                ✏️ Edit Profile
              </button>
            )}
          </div>
        </div>

        {/* Profile Card */}
        <div className="card" style={{ maxWidth: 720, margin: '0 auto', padding: '32px 36px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280' }}>
              <div className="spinner spinner-dark" style={{ width: 32, height: 32, borderWidth: 3, margin: '0 auto 12px' }} />
              <p style={{ fontSize: '0.85rem' }}>Loading profile information...</p>
            </div>
          ) : !editing ? (
            /* ── Read-Only Display View ── */
            <div>
              {/* Avatar & Name Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  paddingBottom: 24,
                  borderBottom: '1px solid #E2E8F0',
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    width: 68,
                    height: 68,
                    borderRadius: '50%',
                    background: '#0E7C86',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.8rem',
                    fontWeight: 700,
                    boxShadow: '0 4px 12px rgba(14, 124, 134, 0.25)',
                    border: '3px solid #E6F4F5',
                  }}
                >
                  {profile.name ? profile.name.charAt(0).toUpperCase() : 'A'}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h2 style={{ fontSize: '1.4rem', color: '#1A2B3C', fontWeight: 700, margin: 0 }}>
                      {profile.name}
                    </h2>
                    {profile.role === 'SUPER_ADMIN' ? (
                      <span className="badge badge-primary" style={{ fontSize: '0.72rem' }}>
                        SUPER_ADMIN
                      </span>
                    ) : (
                      <span className="badge badge-secondary" style={{ fontSize: '0.72rem' }}>
                        ADMIN
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.85rem', color: '#64748B', display: 'block', marginTop: 4 }}>
                    {profile.email}
                  </span>
                </div>
              </div>

              {/* Detail Rows */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
                <div style={{ background: '#F8FAFC', padding: '16px 20px', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748B', fontWeight: 600 }}>
                    Full Name
                  </span>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1A2B3C', marginTop: 4 }}>
                    {profile.name}
                  </div>
                </div>

                <div style={{ background: '#F8FAFC', padding: '16px 20px', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748B', fontWeight: 600 }}>
                      Email Address
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#64748B' }}>🔒 Read-only</span>
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1A2B3C', marginTop: 4 }}>
                    <code>{profile.email}</code>
                  </div>
                </div>

                <div style={{ background: '#F8FAFC', padding: '16px 20px', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748B', fontWeight: 600 }}>
                    Phone Number
                  </span>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: profile.phone ? '#1A2B3C' : '#94A3B8', marginTop: 4 }}>
                    {profile.phone || 'Not provided'}
                  </div>
                </div>

                <div style={{ background: '#F8FAFC', padding: '16px 20px', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748B', fontWeight: 600 }}>
                    Role & Permissions
                  </span>
                  <div style={{ marginTop: 6 }}>
                    {profile.role === 'SUPER_ADMIN' ? (
                      <span
                        className="badge badge-primary"
                        style={{
                          fontSize: '0.72rem',
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                          maxWidth: '100%',
                          display: 'inline-block',
                          lineHeight: 1.4,
                          padding: '4px 10px',
                          borderRadius: 6,
                          textAlign: 'left',
                        }}
                      >
                        SUPER_ADMIN — Full Platform Control
                      </span>
                    ) : (
                      <span
                        className="badge badge-secondary"
                        style={{
                          fontSize: '0.72rem',
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                          maxWidth: '100%',
                          display: 'inline-block',
                          lineHeight: 1.4,
                          padding: '4px 10px',
                          borderRadius: 6,
                          textAlign: 'left',
                        }}
                      >
                        ADMIN — Standard Access
                      </span>
                    )}
                  </div>
                </div>

                {profile.createdAt && (
                  <div style={{ background: '#F8FAFC', padding: '16px 20px', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748B', fontWeight: 600 }}>
                      Account Created
                    </span>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1A2B3C', marginTop: 4 }}>
                      {new Date(profile.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Navigation hint */}
              <div
                style={{
                  marginTop: 28,
                  padding: '14px 18px',
                  background: '#E6F4F5',
                  border: '1px solid #B2DFDB',
                  borderRadius: 8,
                  fontSize: '0.85rem',
                  color: '#004D40',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  Looking to update your account password? Visit your account settings.
                </span>
                <Link
                  to="/admin/settings"
                  style={{
                    color: '#0E7C86',
                    fontWeight: 700,
                    textDecoration: 'underline',
                    whiteSpace: 'nowrap',
                    marginLeft: 12,
                  }}
                >
                  Go to Settings →
                </Link>
              </div>
            </div>
          ) : (
            /* ── Edit Mode Form ── */
            <form onSubmit={handleSaveProfile}>
              <h2 style={{ fontSize: '1.25rem', color: '#1A2B3C', fontWeight: 700, marginBottom: 6 }}>
                Edit Personal Information
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: 20 }}>
                Update your display name and contact phone number.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Full Name */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Full Name *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="e.g. Priya Sharma"
                    required
                  />
                </div>

                {/* Phone Number */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    className="form-control"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    placeholder="e.g. +91 98765 43210"
                  />
                  <small style={{ color: '#64748B', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                    Optional contact number for emergency test operations.
                  </small>
                </div>

                {/* Email (Read-only) */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      Email Address
                    </label>
                    <span style={{ fontSize: '0.72rem', color: '#64748B' }}>🔒 Cannot be changed</span>
                  </div>
                  <input
                    type="email"
                    className="form-control"
                    value={profile.email}
                    disabled
                    style={{ background: '#F8FAFC', color: '#64748B', cursor: 'not-allowed' }}
                  />
                </div>

                {/* Role (Read-only) */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" style={{ fontWeight: 600 }}>
                      Role Assignment
                    </label>
                    <span style={{ fontSize: '0.72rem', color: '#64748B' }}>🔒 Super Admin managed</span>
                  </div>
                  <div>
                    {profile.role === 'SUPER_ADMIN' ? (
                      <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                        SUPER_ADMIN
                      </span>
                    ) : (
                      <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                        ADMIN
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={saving}
                    className="btn btn-secondary"
                    style={{ padding: '8px 20px', fontSize: '0.85rem' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="btn btn-primary"
                    style={{ padding: '8px 22px', fontSize: '0.85rem' }}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
