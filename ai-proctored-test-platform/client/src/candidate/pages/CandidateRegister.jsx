// Candidate Register page
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuthContext';
import api from '../../services/apiClient';
import toast from 'react-hot-toast';
import globussoftLogo from '../../assets/globussoft-logo.png';
import LoadingDots from '../../shared/LoadingDots';

export default function CandidateRegister() {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const initialMountRef = useRef(false);

  const [form, setForm] = useState({
    name: '',
    fatherName: '',
    email: '',
    phone: '',
    qualification: '',
    stream: '',
    instituteName: '',
    address: '',
  });
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
    setLoading(true);
    try {
      const { data } = await api.candidateRegister({
        name: form.name,
        fatherName: form.fatherName,
        email: form.email,
        phone: form.phone,
        qualification: form.qualification,
        stream: form.stream,
        instituteName: form.instituteName,
        address: form.address,
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
        <p className="auth-subtitle">Register to join the test.</p>

        {inviteInfo && (
          <div className="alert alert-info" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span>🎯 Joining: <strong>{inviteInfo.testTitle}</strong> ({inviteInfo.roomName})</span>
          </div>
        )}

        {error && (
          <div className="alert alert-danger">
            {error.includes('take another test yet') ? `⏳ ${error}` : error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* 1. Full Name */}
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

          {/* 2. Father's Name */}
          <div className="form-group">
            <label className="form-label" htmlFor="fatherName">Father's Name</label>
            <input
              id="fatherName"
              name="fatherName"
              type="text"
              className="form-input"
              value={form.fatherName}
              onChange={handleChange}
              placeholder="Father's Full Name"
              autoComplete="off"
            />
          </div>

          {/* 3. Email */}
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

          {/* 4. Phone */}
          <div className="form-group">
            <label className="form-label" htmlFor="phone">Phone</label>
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

          {/* 5. Qualification + Stream (side-by-side two-column row) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="qualification">Qualification</label>
              <input
                id="qualification"
                name="qualification"
                type="text"
                className="form-input"
                value={form.qualification}
                onChange={handleChange}
                placeholder="e.g. B.Tech / BCA"
              />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="stream">Stream</label>
              <input
                id="stream"
                name="stream"
                type="text"
                className="form-input"
                value={form.stream}
                onChange={handleChange}
                placeholder="e.g. Computer Science"
              />
            </div>
          </div>

          {/* 6. Institute Name */}
          <div className="form-group">
            <label className="form-label" htmlFor="instituteName">Institute Name</label>
            <input
              id="instituteName"
              name="instituteName"
              type="text"
              className="form-input"
              value={form.instituteName}
              onChange={handleChange}
              placeholder="e.g. ABC Institute of Technology"
              autoComplete="organization"
            />
          </div>

          {/* 7. Address */}
          <div className="form-group">
            <label className="form-label" htmlFor="address">Address</label>
            <input
              id="address"
              name="address"
              type="text"
              className="form-input"
              value={form.address}
              onChange={handleChange}
              placeholder="e.g. City, State"
              autoComplete="street-address"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 8 }} disabled={loading}>
            {loading ? <><LoadingDots size="sm" color="white" /> Creating account...</> : 'Create Account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: '0.875rem', color: '#6b7280' }}>
          Already registered? <Link to={`/candidate/login${location.search}`}>Login instead</Link>
        </p>
      </div>
    </div>
  );
}
