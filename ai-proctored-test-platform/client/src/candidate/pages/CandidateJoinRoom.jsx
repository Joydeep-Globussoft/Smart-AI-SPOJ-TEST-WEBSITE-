import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import api from '../../services/apiClient';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuthContext';
import logoLight from '../../assets/logo-light.png';
import LoadingDots from '../../shared/LoadingDots';
import {
  onLateJoinApproved,
  offLateJoinApproved,
  onLateJoinDismissed,
  offLateJoinDismissed,
  onTestStarted,
  offTestStarted,
} from '../../services/socketClient';

export default function CandidateJoinRoom() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');

  // BUG-97: Persistent invite token context across session, query params, and navigation state
  const activeInviteToken =
    inviteToken ||
    location.state?.inviteToken ||
    sessionStorage.getItem('pendingInviteToken') ||
    localStorage.getItem('lastInviteToken') ||
    '';

  const [form, setForm] = useState({ roomCode: '', roomPassword: '' });
  const [loading, setLoading] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [isAutoJoining, setIsAutoJoining] = useState(false);
  const [error, setError] = useState(location.state?.error || '');
  const [targetRoomId, setTargetRoomId] = useState(location.state?.roomId || null);
  const [targetTestId, setTargetTestId] = useState(location.state?.testId || null);
  const [inviteDetails, setInviteDetails] = useState(null);
  const [isLateJoinRequested, setIsLateJoinRequested] = useState(false);
  const [manualOverrideGranted, setManualOverrideGranted] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const autoJoinLockRef = useRef(false);

  // If unauthenticated candidate visits /candidate/join with an invite token, forward to /candidate/register
  useEffect(() => {
    if (inviteToken && !user) {
      navigate(`/candidate/register?invite=${inviteToken}`, { replace: true });
    }
  }, [inviteToken, user, navigate]);

  // Sync active invite token into persistent storage whenever available
  useEffect(() => {
    if (activeInviteToken) {
      sessionStorage.setItem('pendingInviteToken', activeInviteToken);
      localStorage.setItem('lastInviteToken', activeInviteToken);
    }
  }, [activeInviteToken]);

  // Receive error state if forwarded from failed auto-join
  useEffect(() => {
    if (location.state?.error) {
      setError(location.state.error);
      if (location.state?.roomId) {
        setTargetRoomId(location.state.roomId);
      }
      if (location.state?.testId) {
        setTargetTestId(location.state.testId);
      }
    }
  }, [location.state]);

  // BUG-82 / BUG-97: Auto-join helper executed upon approval event, test:started event, polling, or on-mount
  const performAutoJoin = useCallback(async (approvedData = {}) => {
    if (autoJoinLockRef.current) return;
    const activeInvite =
      inviteToken ||
      sessionStorage.getItem('pendingInviteToken') ||
      localStorage.getItem('lastInviteToken') ||
      approvedData?.inviteToken ||
      location.state?.inviteToken;
    const roomIdToUse = approvedData?.roomId || targetRoomId;

    let payload = null;
    if (activeInvite) {
      payload = { inviteToken: activeInvite };
    } else if (roomIdToUse) {
      payload = { roomId: roomIdToUse, roomCode: form.roomCode, roomPassword: form.roomPassword };
    } else if (form.roomCode && form.roomPassword) {
      payload = { roomCode: form.roomCode, roomPassword: form.roomPassword };
    } else if (approvedData?.roomCode) {
      payload = { roomCode: approvedData.roomCode };
    }

    if (!payload) {
      console.warn('[CandidateJoinRoom] No payload available to auto-join');
      return;
    }

    autoJoinLockRef.current = true;
    setIsAutoJoining(true);
    setError('');

    try {
      const { data } = await api.joinRoom(payload);
      sessionStorage.removeItem('pendingInviteToken');
      // Store join data in sessionStorage for instructions/permissions page
      sessionStorage.setItem('joinData', JSON.stringify(data));
      toast.success('🎉 Entering test room...', { duration: 4000 });
      navigate('/candidate/instructions', { replace: true });
    } catch (err) {
      console.error('[CandidateJoinRoom] Auto-join failed:', err);
      autoJoinLockRef.current = false;
      setIsAutoJoining(false);
      const msg = err.response?.data?.error || 'Failed to enter test room';
      setError(msg);
      if (err.response?.data?.code === 'TEST_NOT_STARTED' || msg.toLowerCase().includes('not started')) {
        // Preserved in waiting state
      } else {
        toast.error(msg);
      }
      if (err.response?.data?.roomId) {
        setTargetRoomId(err.response.data.roomId);
      }
      if (err.response?.data?.testId) {
        setTargetTestId(err.response.data.testId);
      }
    }
  }, [inviteToken, location.state?.inviteToken, targetRoomId, form, navigate]);

  // Load invite metadata and probe status on mount if invite token is present
  useEffect(() => {
    if (!activeInviteToken || !user) return;
    let isCancelled = false;

    api.getInviteInfo(activeInviteToken)
      .then(({ data }) => {
        if (isCancelled) return;
        setInviteDetails(data);
        if (data.roomId) setTargetRoomId(data.roomId);
        if (data.testId) setTargetTestId(data.testId);

        if (data.isLive) {
          performAutoJoin({ inviteToken: activeInviteToken });
        } else if (data.isExpired) {
          setError('Room code expired');
        } else if (data.testStatus === 'ENDED') {
          setError('This test is no longer active');
        }
      })
      .catch((err) => {
        if (isCancelled) return;
        console.warn('[CandidateJoinRoom] getInviteInfo error:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [activeInviteToken, user, performAutoJoin]);

  // BUG-97: Polling mechanism while waiting for test to start with preserved invite token
  useEffect(() => {
    if (!activeInviteToken || !user || isAutoJoining || manualOverrideGranted) return;

    const interval = setInterval(async () => {
      if (autoJoinLockRef.current) return;
      try {
        const { data } = await api.getInviteInfo(activeInviteToken);
        setInviteDetails(data);
        if (data.roomId) setTargetRoomId(data.roomId);
        if (data.testId) setTargetTestId(data.testId);

        if (data.isLive) {
          clearInterval(interval);
          performAutoJoin({ inviteToken: activeInviteToken });
        } else if (data.isExpired) {
          setError('Room code expired');
        } else if (data.testStatus === 'ENDED') {
          setError('This test is no longer active');
        }
      } catch (err) {
        console.warn('[CandidateJoinRoom] Polling error:', err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeInviteToken, user, isAutoJoining, manualOverrideGranted, performAutoJoin]);

  // Check persistent late-join status on mount (Requirement 2 / Reload Race Condition recovery)
  useEffect(() => {
    if (!user?.id) return;
    api.getLateJoinStatus(user.id)
      .then(({ data }) => {
        if (data.manualJoinOverride) {
          setError('');
          setIsLateJoinRequested(false);
          setManualOverrideGranted(true);
          if (data.lateJoinRoomId) setTargetRoomId(data.lateJoinRoomId);
          performAutoJoin({ roomId: data.lateJoinRoomId });
        } else if (data.lateJoinRequestedAt) {
          setIsLateJoinRequested(true);
          if (data.lateJoinRoomId) setTargetRoomId(data.lateJoinRoomId);
        }
      })
      .catch(() => {});
  }, [user?.id, performAutoJoin]);

  // Listen for admin decisions & live test start in real time (BUG-82 / BUG-97)
  useEffect(() => {
    const handleApproved = (data) => {
      if (data?.candidateId && user?.id && String(data.candidateId) !== String(user.id)) {
        return;
      }
      setIsLateJoinRequested(false);
      setManualOverrideGranted(true);
      setError('');
      performAutoJoin(data);
    };

    const handleDismissed = (data) => {
      if (data?.candidateId && user?.id && String(data.candidateId) !== String(user.id)) {
        return;
      }
      toast.error('Proctor denied your late-entry request. You may contact your proctor if needed.', { duration: 5000 });
      setIsLateJoinRequested(false);
      setManualOverrideGranted(false);
      setError('Room code expired');
    };

    const handleTestStarted = (data) => {
      if (data?.testId && targetTestId && String(data.testId) !== String(targetTestId)) {
        return;
      }
      if (activeInviteToken || targetRoomId) {
        toast.success('🎉 Test is now LIVE! Connecting you...', { duration: 3000 });
        performAutoJoin(data);
      }
    };

    onLateJoinApproved(handleApproved);
    onLateJoinDismissed(handleDismissed);
    onTestStarted(handleTestStarted);

    return () => {
      offLateJoinApproved(handleApproved);
      offLateJoinDismissed(handleDismissed);
      offTestStarted(handleTestStarted);
    };
  }, [user?.id, activeInviteToken, targetTestId, targetRoomId, performAutoJoin]);

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value.toUpperCase() }));
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const activeInvite = inviteToken || sessionStorage.getItem('pendingInviteToken') || localStorage.getItem('lastInviteToken');
      const payload = (form.roomCode && form.roomPassword)
        ? form
        : (activeInvite ? { inviteToken: activeInvite } : (targetRoomId ? { roomId: targetRoomId } : form));
      const { data } = await api.joinRoom(payload);
      sessionStorage.removeItem('pendingInviteToken');
      // Store join data in sessionStorage for the instructions page
      sessionStorage.setItem('joinData', JSON.stringify(data));
      navigate('/candidate/instructions', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to join room';
      setError(msg);

      if (err.response?.data?.code !== 'ACTIVE_SESSION_EXISTS_OTHER_TEST') {
        if (err.response?.data?.roomId) {
          setTargetRoomId(err.response.data.roomId);
        }
        if (err.response?.data?.testId) {
          setTargetTestId(err.response.data.testId);
        }
        if (err.response?.data?.lateJoinRequestedAt) {
          setIsLateJoinRequested(true);
        }
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

  const handleManualCheckStatus = async () => {
    if (!activeInviteToken) return;
    setCheckingStatus(true);
    try {
      const { data } = await api.getInviteInfo(activeInviteToken);
      setInviteDetails(data);
      if (data.isLive) {
        toast.success('Test is LIVE! Entering room...');
        performAutoJoin({ inviteToken: activeInviteToken });
      } else if (data.isExpired) {
        setError('Room code expired');
        toast.error('Room code has expired. You can notify your proctor for entry.');
      } else {
        toast('Test has not started yet. We will auto-connect you the moment it starts.', { icon: '⏳' });
      }
    } catch (err) {
      toast.error('Could not check test status');
    } finally {
      setCheckingStatus(false);
    }
  };

  // Determine if candidate is in the invite-link waiting room state
  const isWaitingForTest =
    Boolean(activeInviteToken) &&
    !showManualForm &&
    !manualOverrideGranted &&
    !isAutoJoining &&
    !error?.toLowerCase().includes('expired') &&
    !isLateJoinRequested &&
    (error?.toLowerCase().includes('not started') ||
      location.state?.code === 'TEST_NOT_STARTED' ||
      (inviteDetails && !inviteDetails.isLive && inviteDetails.testStatus !== 'ENDED'));

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

        <h1 className="auth-title">
          {isWaitingForTest ? 'Waiting for Test to Start' : 'Join Test Room'}
        </h1>
        <p className="auth-subtitle">
          Welcome, <strong>{user?.name}</strong>!<br />
          {isWaitingForTest
            ? 'You are registered and connected to this test.'
            : 'Enter the Room ID and password provided by your proctor.'}
        </p>

        {isAutoJoining ? (
          <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <LoadingDots size="sm" />
            <span>🎉 <strong>Connecting to test room...</strong> Starting test setup...</span>
          </div>
        ) : manualOverrideGranted ? (
          <div className="alert alert-success" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <span>✅ Proctor has granted permission! Entering test room...</span>
          </div>
        ) : isLateJoinRequested ? (
          <div className="alert alert-warning" style={{ marginBottom: 16 }}>
            ⏳ You have a pending late-entry request with the proctor. Please wait for approval.
          </div>
        ) : error && !isWaitingForTest ? (
          <div className="alert alert-danger" id="join-room-error-alert" style={{ lineHeight: 1.5 }}>
            {error.includes('active exam') || error.includes('active session')
              ? `⚠️ ${error}`
              : (error.includes('expired') || error.includes('Expired')
                  ? '🔒 Room access window has closed. Contact your proctor for assistance.'
                  : error)}
          </div>
        ) : null}

        {/* Late Join Notification Button (Requirement 2 & 4 & BUG-82) */}
        {!manualOverrideGranted && !isAutoJoining && (error?.toLowerCase().includes('expired') || isLateJoinRequested) && (
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
                    <LoadingDots size="sm" color="white" /> Notifying Admin...
                  </>
                ) : (
                  "📢 Notify Admin I'm Trying to Join"
                )}
              </button>
            )}
          </div>
        )}

        {/* BUG-97: Dedicated Waiting Screen View for Invite-Link Candidates */}
        {isWaitingForTest ? (
          <div style={{ marginTop: 8 }}>
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(99, 102, 241, 0.08) 100%)',
                border: '1.5px solid #93c5fd',
                borderRadius: 12,
                padding: '20px 18px',
                marginBottom: 20,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 12px',
                  background: '#dbeafe',
                  borderRadius: 999,
                  color: '#1e40af',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    backgroundColor: '#2563eb',
                  }}
                />
                <span>PROCTOR PREPARING TEST</span>
              </div>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '1.08rem', fontWeight: 700, color: '#1e293b' }}>
                This test has not started yet
              </h3>
              <p style={{ margin: 0, fontSize: '0.875rem', color: '#475569', lineHeight: 1.5 }}>
                You will be <strong>automatically admitted</strong> into the test setup the moment your proctor starts the test.
              </p>
              <p style={{ margin: '10px 0 0 0', fontSize: '0.8rem', color: '#64748b', fontWeight: 500 }}>
                ⚡ Please keep this tab open — no manual code entry or refresh required.
              </p>
            </div>

            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '14px 16px',
                marginBottom: 20,
                fontSize: '0.875rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#64748b' }}>Test:</span>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>
                  {inviteDetails?.testTitle || location.state?.testTitle || 'Scheduled Test'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#64748b' }}>Room:</span>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>
                  {inviteDetails?.roomName || location.state?.roomName || 'Assigned Test Room'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Auto-Connection:</span>
                <span style={{ color: '#16a34a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a' }} />
                  Listening for proctor
                </span>
              </div>
            </div>

            <button
              type="button"
              id="check-status-btn"
              onClick={handleManualCheckStatus}
              disabled={checkingStatus}
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              {checkingStatus ? (
                <>
                  <LoadingDots size="sm" color="white" /> Checking status...
                </>
              ) : (
                '🔄 Check Status Now'
              )}
            </button>

            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <button
                type="button"
                onClick={() => setShowManualForm(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#6366f1',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Have a room code & password? Enter manually
              </button>
            </div>
          </div>
        ) : (
          /* Standard Manual Room Code & Password Form */
          <>
            {activeInviteToken && showManualForm && (
              <div style={{ textAlign: 'center', marginBottom: 14 }}>
                <button
                  type="button"
                  onClick={() => setShowManualForm(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563eb',
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  ← Return to Invite Waiting Screen
                </button>
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
                {loading ? <><LoadingDots size="sm" color="white" /> Joining...</> : '→ Enter Test Room'}
              </button>
            </form>
          </>
        )}

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
              sessionStorage.removeItem('pendingInviteToken');
              localStorage.removeItem('lastInviteToken');
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
