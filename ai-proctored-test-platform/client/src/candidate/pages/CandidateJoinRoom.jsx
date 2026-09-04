import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/apiClient';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuthContext';
import globussoftLogo from '../../assets/globussoft-logo.png';
import { onLateJoinApproved, offLateJoinApproved, onLateJoinDismissed, offLateJoinDismissed } from '../../services/socketClient';

export default function CandidateJoinRoom() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ roomCode: '', roomPassword: '' });
  const [loading, setLoading] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [error, setError] = useState('');
  const [targetRoomId, setTargetRoomId] = useState(null);
  const [isLateJoinRequested, setIsLateJoinRequested] = useState(false);
  const [manualOverrideGranted, setManualOverrideGranted] = useState(false);

  // Check persistent late-join status on mount (Requirement 2)
  useEffect(() => {
    if (!user?.id) return;
    api.getLateJoinStatus(user.id)
      .then(({ data }) => {
        if (data.lateJoinRequestedAt && !data.manualJoinOverride) {
          setIsLateJoinRequested(true);
          if (data.lateJoinRoomId) setTargetRoomId(data.lateJoinRoomId);
        }
        if (data.manualJoinOverride) {
          setManualOverrideGranted(true);
        }
      })
      .catch(() => {});
  }, [user?.id]);

  // Listen for admin decisions in real time (Requirement 4)
  useEffect(() => {
    const handleApproved = (data) => {
      toast.success('🎉 Proctor approved your entry! You can now join the room.', { duration: 6000 });
      setIsLateJoinRequested(false);
      setManualOverrideGranted(true);
      setError('');
    };

    const handleDismissed = (data) => {
      toast.error('Proctor dismissed your late-join request. You may request again if needed.');
      setIsLateJoinRequested(false);
    };

    onLateJoinApproved(handleApproved);
    onLateJoinDismissed(handleDismissed);

    return () => {
      offLateJoinApproved(handleApproved);
      offLateJoinDismissed(handleDismissed);
    };
  }, []);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value.toUpperCase() }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.joinRoom(form);
      // Store join data in sessionStorage for the instructions page
      sessionStorage.setItem('joinData', JSON.stringify(data));
      navigate('/candidate/instructions');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to join room';
      setError(msg);

      if (err.response?.data?.roomId) {
        setTargetRoomId(err.response.data.roomId);
      }
      if (err.response?.data?.lateJoinRequestedAt) {
        setIsLateJoinRequested(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNotifyAdmin = async () => {
    if (!targetRoomId) {
      toast.error('Please attempt to enter the room once so we can verify the room ID.');
      return;
    }
    if (!user?.id) return;

    setNotifying(true);
    try {
      await api.requestLateJoin(targetRoomId, user.id);
      setIsLateJoinRequested(true);
      toast.success('Admin has been notified. Please wait for approval.');
    } catch (err) {
      if (err.response?.status === 409) {
        setIsLateJoinRequested(true);
        toast('Admin is already notified and reviewing your request.', { icon: '⏳' });
      } else {
        toast.error(err.response?.data?.error || 'Failed to notify admin');
      }
    } finally {
      setNotifying(false);
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

        <h1 className="auth-title">Join Test Room</h1>
        <p className="auth-subtitle">
          Welcome, <strong>{user?.name}</strong>!<br />
          Enter the Room ID and password provided by your proctor.
        </p>

        {error && (
          <div className="alert alert-danger">
            {error.includes('expired') || error.includes('Expired')
              ? '🔒 Room access window has closed. Contact your proctor for assistance.'
              : error}
          </div>
        )}

        {isLateJoinRequested && !manualOverrideGranted && !error && (
          <div className="alert alert-warning" style={{ marginBottom: 16 }}>
            ⏳ You have a pending late-entry request with the proctor. Please wait for approval.
          </div>
        )}

        {manualOverrideGranted && (
          <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span>✅ Proctor has granted permission! Click <strong>Enter Test Room</strong> to join.</span>
          </div>
        )}

        {/* Late Join Notification Button (Requirement 2 & 4) */}
        {(error?.toLowerCase().includes('expired') || isLateJoinRequested) && !manualOverrideGranted && (
          <div style={{ marginBottom: 16 }}>
            {isLateJoinRequested ? (
              <button
                type="button"
                id="late-join-btn-disabled"
                disabled
                className="btn"
                style={{
                  width: '100%',
                  backgroundColor: '#94a3b8',
                  color: '#ffffff',
                  cursor: 'not-allowed',
                  opacity: 0.85,
                  fontWeight: 600,
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                ⏳ Admin Notified — Waiting for Approval
              </button>
            ) : (
              <button
                type="button"
                id="late-join-btn"
                onClick={handleNotifyAdmin}
                disabled={notifying}
                className="btn btn-warning"
                style={{
                  width: '100%',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                {notifying ? (
                  <>
                    <span className="spinner" /> Notifying Admin...
                  </>
                ) : (
                  "📢 Notify Admin I'm Trying to Join"
                )}
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="roomCode">Room Code</label>
            <input
              id="roomCode"
              name="roomCode"
              type="text"
              className="form-input"
              value={form.roomCode}
              onChange={handleChange}
              placeholder="e.g., A3K9MQ"
              required
              maxLength={10}
              autoComplete="off"
              style={{ fontFamily: 'monospace', fontSize: '1.2rem', letterSpacing: '0.15em', textAlign: 'center' }}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="roomPassword">Room Password</label>
            <input
              id="roomPassword"
              name="roomPassword"
              type="text"
              className="form-input"
              value={form.roomPassword}
              onChange={handleChange}
              placeholder="Provided by proctor"
              required
              autoComplete="off"
              style={{ fontFamily: 'monospace', fontSize: '1.2rem', letterSpacing: '0.15em', textAlign: 'center' }}
            />
          </div>

          <button
            type="submit"
            id="join-room-btn"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginTop: 8 }}
            disabled={loading}
          >
            {loading ? <><span className="spinner" /> Joining...</> : '→ Enter Test Room'}
          </button>
        </form>

        <div className="alert alert-warning" style={{ marginTop: 16, marginBottom: 0 }}>
          <div>
            <strong>Before you start:</strong>
            <ul style={{ marginTop: 8, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>Allow webcam and microphone access when prompted</li>
              <li>Ensure you are in a well-lit, quiet environment</li>
              <li>Close all other browser tabs and applications</li>
              <li>Use only <strong>Chrome</strong> or <strong>Edge</strong> browser</li>
            </ul>
          </div>
        </div>

        {/* Secondary Sign Out Action (BUG-07) */}
        <div
          style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid #E5E7EB',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <button
            type="button"
            onClick={() => {
              logout();
              navigate('/candidate/login');
            }}
            style={{
              background: 'transparent',
              border: '1px solid transparent',
              color: '#64748B',
              fontSize: '0.84rem',
              fontWeight: 500,
              cursor: 'pointer',
              padding: '6px 14px',
              borderRadius: 6,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = '#1E293B';
              e.currentTarget.style.background = '#F1F5F9';
              e.currentTarget.style.borderColor = '#E2E8F0';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = '#64748B';
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'transparent';
            }}
            title="Sign out of candidate session"
          >
            <span style={{ fontSize: '0.9rem' }}>🚪</span>
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
