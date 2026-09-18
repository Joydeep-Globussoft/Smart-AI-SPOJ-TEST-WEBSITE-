// Candidate Login page
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuthContext';
import api from '../../services/apiClient';
import toast from 'react-hot-toast';
import globussoftLogo from '../../assets/globussoft-logo.png';
import PasswordInput from '../../shared/PasswordInput';

export default function CandidateLogin() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const initialMountRef = useRef(false);

  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inviteInfo, setInviteInfo] = useState(null);

  // BUG-80 / BUG-81: On INITIAL mount only, if opened via invite link, purge stale prior candidate session
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
    setLoading(true);
    try {
      const { data } = await api.candidateLogin(form);
      const candidate = { ...data.candidate, type: 'candidate' };
      const activeInvite = inviteToken || sessionStorage.getItem('pendingInviteToken');

      login(candidate, data.token, data.refreshToken);
      toast.success(`Welcome back, ${data.candidate.name}!`);

      // FEATURE-015 / BUG-81: Auto-join room via opaque invite token and route straight to instructions
      if (activeInvite) {
        try {
          const { data: joinData } = await api.joinRoom({ inviteToken: activeInvite });
          sessionStorage.removeItem('pendingInviteToken');
          sessionStorage.setItem('joinData', JSON.stringify(joinData));
          navigate('/candidate/instructions', { replace: true });
          return;
        } catch (joinErr) {
          console.warn('[Login auto-join error]', joinErr);
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
      // FR-1.2: 401 if account expired
      const msg = err.response?.data?.error || 'Login failed';
      setError(msg);
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

        <h1 className="auth-title">Sign In</h1>
        <p className="auth-subtitle">Enter your credentials to access the test</p>

        {inviteInfo && (
          <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span>🎯 Joining: <strong>{inviteInfo.testTitle}</strong> ({inviteInfo.roomName})</span>
          </div>
        )}

        {error && (
          <div className="alert alert-danger">
            {error.includes('expired')
              ? '⏰ Your account has expired (3-day window). Please register again.'
              : error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              className="form-input"
              value={form.email}
              onChange={handleChange}
              placeholder="your@email.com"
              required
              autoComplete="email"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <PasswordInput
              id="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          <button
            type="submit"
            id="candidate-login-btn"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: 8 }}
            disabled={loading}
          >
            {loading ? <><span className="spinner" /> Signing in...</> : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.875rem', color: '#6b7280' }}>
          New candidate? <Link to={`/candidate/register${location.search}`}>Create an account</Link>
        </p>
      </div>
    </div>
  );
}
