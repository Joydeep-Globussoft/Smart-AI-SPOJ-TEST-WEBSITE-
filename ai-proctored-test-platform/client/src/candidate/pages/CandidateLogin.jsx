// Candidate Login page
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuthContext';
import api from '../../services/apiClient';
import toast from 'react-hot-toast';
import logoLight from '../../assets/logo-light.png';
import LoadingDots from '../../shared/LoadingDots';

export default function CandidateLogin() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const initialMountRef = useRef(false);

  const [form, setForm] = useState({ email: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inviteInfo, setInviteInfo] = useState(null);

  // BUG-80 / BUG-81 / BUG-97 / BUG-100: On INITIAL mount only, handle invite link
  useEffect(() => {
    if (!initialMountRef.current) {
      initialMountRef.current = true;
      if (inviteToken) {
        sessionStorage.setItem('pendingInviteToken', inviteToken);
        localStorage.setItem('lastInviteToken', inviteToken);

        // Fetch invite metadata first to identify target testId and room details
        api.getInviteInfo(inviteToken)
          .then(({ data: inviteData }) => {
            setInviteInfo(inviteData);

            // BUG-100: Check if stored session belongs to THIS EXACT test
            let storedTestId = null;
            try {
              const rawJoin = sessionStorage.getItem('joinData');
              if (rawJoin) {
                const parsedJoin = JSON.parse(rawJoin);
                storedTestId = parsedJoin?.test?._id || parsedJoin?.testId;
              }
              if (!storedTestId) {
                const rawActive = sessionStorage.getItem('activeSession');
                if (rawActive) {
                  const parsedActive = JSON.parse(rawActive);
                  storedTestId = parsedActive?.testId;
                }
              }
            } catch (e) {
              console.warn('[Session check parse error]', e);
            }

            const isMatchingTestSession =
              storedTestId && inviteData?.testId && String(storedTestId) === String(inviteData.testId);

            // BUG-97 / BUG-100: ONLY auto-join if already authenticated AND the session matches this exact test
            if (user && user.type === 'candidate' && localStorage.getItem('token') && isMatchingTestSession) {
              api.joinRoom({ inviteToken })
                .then(({ data: joinData }) => {
                  sessionStorage.removeItem('pendingInviteToken');
                  sessionStorage.setItem('joinData', JSON.stringify(joinData));
                  navigate('/candidate/instructions', { replace: true });
                })
                .catch((joinErr) => {
                  console.warn('[Login existing session auto-join]', joinErr);
                  const joinErrMsg = joinErr.response?.data?.error || 'Failed to auto-join test room';
                  navigate(`/candidate/join?invite=${inviteToken}`, {
                    state: {
                      error: joinErrMsg,
                      code: joinErr.response?.data?.code || (joinErrMsg.includes('not started') ? 'TEST_NOT_STARTED' : undefined),
                      roomId: joinErr.response?.data?.roomId || inviteData.roomId,
                      roomName: joinErr.response?.data?.roomName || inviteData.roomName,
                      testTitle: joinErr.response?.data?.testTitle || inviteData.testTitle,
                      inviteToken,
                    },
                    replace: true,
                  });
                });
            }
            // Fresh / unauthenticated candidate or stale invalid token cleanup
            if (!user && localStorage.getItem('token')) {
              logout();
            }
          })
          .catch((err) => {
            console.warn('[Invite info fetch error]', err);
          });
      }
    }
  }, [inviteToken, user, logout, navigate]);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.candidateLogin({ email: form.email });
      const candidate = { ...data.candidate, type: 'candidate' };
      const activeInvite = inviteToken || sessionStorage.getItem('pendingInviteToken') || localStorage.getItem('lastInviteToken');

      login(candidate, data.token, data.refreshToken);
      toast.success(`Welcome back, ${data.candidate.name}!`);

      // FEATURE-015 / BUG-81 / BUG-97: Auto-join room via opaque invite token and route straight to instructions
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
          toast(joinErrMsg, { icon: '⏳' });
          navigate(`/candidate/join?invite=${activeInvite}`, {
            state: {
              error: joinErrMsg,
              code: joinErr.response?.data?.code || (joinErrMsg.includes('not started') ? 'TEST_NOT_STARTED' : undefined),
              roomId: joinErr.response?.data?.roomId,
              roomName: joinErr.response?.data?.roomName,
              testTitle: joinErr.response?.data?.testTitle || inviteInfo?.testTitle,
              inviteToken: activeInvite,
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
            src={logoLight}
            alt="Globussoft Technology"
            style={{ height: 46, width: 'auto', objectFit: 'contain', display: 'block' }}
          />
        </div>

        <h1 className="auth-title">Sign In</h1>
        <p className="auth-subtitle">Enter your email to access the test</p>

        {inviteInfo && (
          <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span>🎯 Joining: <strong>{inviteInfo.testTitle}</strong> ({inviteInfo.roomName})</span>
          </div>
        )}

        {error && (
          <div className="alert alert-danger">
            {error.includes('expired')
              ? '⏰ Your account has expired (3-day window). Please register again.'
              : error.includes('take another test yet')
              ? `⏳ ${error}`
              : error.toLowerCase().includes('full') || error.includes('Capacity')
              ? `🔒 ${error}`
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

          <button
            type="submit"
            id="candidate-login-btn"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: 8 }}
            disabled={loading}
          >
            {loading ? <><LoadingDots size="sm" color="white" /> Signing in...</> : 'Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.875rem', color: '#6b7280' }}>
          New candidate? <Link to={`/candidate/register${location.search}`}>Create an account</Link>
        </p>
      </div>
    </div>
  );
}
