// Candidate Register page
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuthContext';
import api from '../../services/apiClient';
import toast from 'react-hot-toast';
import globussoftLogo from '../../assets/globussoft-logo.png';
import PasswordInput from '../../shared/PasswordInput';

export default function CandidateRegister() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const initialMountRef = useRef(false);

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inviteInfo, setInviteInfo] = useState(null);

  // BUG-80 / BUG-81: On INITIAL mount only, if opened via invite link, purge any stale prior candidate session
  useEffect(() => {
    if (!initialMountRef.current) {
      initialMountRef.current = true;
      if (inviteToken) {
        if (localStorage.getItem('token') || user) {
          logout();
        }
        sessionStorage.setItem('pendingInviteToken', inviteToken);
        api.getInviteInfo(inviteToken)
          .then(({ data }) => setInviteInfo(data))
          .catch(() => {});
      }
    }
  }, [inviteToken, logout]);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.candidateRegister({
        name: form.name,
        email: form.email,
        phone: form.phone,
        password: form.password,
      });
      // FR-1.2: account expires in 3 days
      const candidate = { ...data.candidate, type: 'candidate' };
      const activeInvite = inviteToken || sessionStorage.getItem('pendingInviteToken');

      login(candidate, data.token, data.refreshToken);
      toast.success(`Welcome, ${data.candidate.name}! Your account is active for 3 days.`);

      // FEATURE-015 / BUG-81: Auto-join room via opaque invite token and route straight to instructions
      if (activeInvite) {
        try {
          const { data: joinData } = await api.joinRoom({ inviteToken: activeInvite });
          sessionStorage.removeItem('pendingInviteToken');
          sessionStorage.setItem('joinData', JSON.stringify(joinData));
          navigate('/candidate/instructions', { replace: true });
          return;
        } catch (joinErr) {
          console.warn('[Register auto-join error]', joinErr);
          const joinErrMsg = joinErr.response?.data?.error || 'Failed to auto-join test room';
          toast.error(joinErrMsg);
          navigate('/candidate/join', {
            state: {
              error: joinErrMsg,
              roomId: joinErr.response?.data?.roomId,
              roomName: joinErr.response?.data?.roomName,
            },
            replace: true,
          });
          return;
        }
      }

      navigate('/candidate/join', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <img
            src={globussoftLogo}
            alt="Globussoft Technology"
            style={{ height: 46, width: 'auto', objectFit: 'contain', display: 'block' }}
          />
        </div>

        <h1 className="auth-title">Create Account</h1>
        <p className="auth-subtitle">Register to join the test. Your account is valid for 3 days.</p>

        {inviteInfo && (
          <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span>🎯 Joining: <strong>{inviteInfo.testTitle}</strong> ({inviteInfo.roomName})</span>
          </div>
        )}

        {error && <div className="alert alert-danger">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="name">Full Name</label>
            <input
              id="name"
              name="name"
              type="text"
              className="form-input"
              value={form.name}
              onChange={handleChange}
              placeholder="John Doe"
              required
              autoComplete="name"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              className="form-input"
              value={form.email}
              onChange={handleChange}
              placeholder="john@example.com"
              required
              autoComplete="email"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="phone">Phone (optional)</label>
            <input
              id="phone"
              name="phone"
              type="tel"
              className="form-input"
              value={form.phone}
              onChange={handleChange}
              placeholder="+91 9876543210"
              autoComplete="tel"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <PasswordInput
              id="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Create a strong password"
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="confirmPassword">Confirm Password</label>
            <PasswordInput
              id="confirmPassword"
              name="confirmPassword"
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="Repeat your password"
              required
              autoComplete="new-password"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
            {loading ? <><span className="spinner" /> Creating account...</> : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.875rem', color: '#6b7280' }}>
          Already registered? <Link to={`/candidate/login${location.search}`}>Login instead</Link>
        </p>

        <div className="alert alert-info" style={{ marginTop: 16, marginBottom: 0 }}>
          ⚠️ Use <strong>Chrome or Edge</strong> browser for the best test experience.
          This platform requires webcam access and fullscreen mode.
        </div>
      </div>
    </div>
  );
}
