// AdminLiveDashboard.jsx — Live Monitoring Dashboard & Seat Map
// Implements PRD Section 9.8, Section 10 (Exact Socket.io Events), Section 11.7 (FR-7.3 persistent malpractice counter, FR-7.4), Section 11.8 (FR-8.1, FR-8.2, FR-8.3), Section 13 (NFR: 200ms debounce, React.memo, react-window virtualization for >50 items)
import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { List } from 'react-window';
import AdminNavbar from '../../shared/AdminNavbar';
import TestStatusBadge from '../../shared/TestStatusBadge';
import api from '../../services/apiClient';
import { useAuth } from '../../hooks/useAuthContext';
import {
  initSocket, disconnectSocket, emitAdminJoin,
  onDashboardUpdate, offDashboardUpdate,
  onSeatmapStatus, offSeatmapStatus,
  onMalpracticeAlert, offMalpracticeAlert,
  onCandidateSubmitted, offCandidateSubmitted,
  onRoomUpdated, offRoomUpdated,
  onTestEnded, offTestEnded,
  onLateJoinRequest, offLateJoinRequest,
  onLateJoinProcessed, offLateJoinProcessed,
  onRoomTentativeTime, offRoomTentativeTime,
} from '../../services/socketClient';

// Exact Section 14 colors
const STATUS_COLORS = {
  GREEN: '#2ECC71',
  YELLOW: '#F1C40F',
  RED: '#E74C3C',
  WHITE: '#e5e7eb',
};

// ── Candidate Color Status Helper (BUG-44: GREEN = SUBMITTED, YELLOW = IN_PROGRESS, RED = DISQUALIFIED, WHITE = NOT_STARTED)
const getCandidateColorStatus = (candidate) => {
  if (!candidate) return 'WHITE';
  if (candidate.status === 'DISQUALIFIED' || candidate.colorStatus === 'RED' || candidate.isDisqualified) {
    return 'RED';
  }
  if (candidate.status === 'SUBMITTED' || candidate.status === 'AUTO_SUBMITTED_TIME_UP' || candidate.colorStatus === 'GREEN') {
    return 'GREEN';
  }
  if (candidate.status === 'IN_PROGRESS' || candidate.candidateStartTime) {
    return 'YELLOW';
  }
  return 'WHITE';
};

// ── Candidate Session Remaining Time Helper (Pure client-side countdown) ──────
const getCandidateRemainingMs = (candidate, currentNow) => {
  if (!candidate) return 0;
  // BUG-24: Only candidates genuinely IN_PROGRESS have active remaining time.
  // Terminal/completed states (SUBMITTED, DISQUALIFIED, etc.) or NOT_STARTED immediately yield 0.
  if (candidate.status !== 'IN_PROGRESS' || !candidate.candidateStartTime) {
    return 0;
  }
  if (candidate.candidateEndTime) {
    return Math.max(0, new Date(candidate.candidateEndTime).getTime() - currentNow);
  }
  if (typeof candidate.timeRemaining === 'number') {
    const elapsed = candidate.lastSyncedAt ? Math.max(0, currentNow - candidate.lastSyncedAt) : 0;
    return Math.max(0, candidate.timeRemaining - elapsed);
  }
  return 0;
};

// ── Memoized Seat Tile (FR-7.3: Persistent Malpractice counter beside name) ────
const SeatTile = memo(({ candidate, roomName, onClick, now }) => {
  const isCandidateInProgress = candidate.status === 'IN_PROGRESS';
  const colorStatus = getCandidateColorStatus(candidate);
  const color = STATUS_COLORS[colorStatus];
  const isWhite = colorStatus === 'WHITE';
  const isYellowDot = color === STATUS_COLORS.YELLOW;
  const malpracticeCount = candidate.malpracticeCount || 0;

  const remainingMs = getCandidateRemainingMs(candidate, now);
  const formattedTimer = useMemo(() => {
    if (candidate.status === 'SUBMITTED' || candidate.status === 'AUTO_SUBMITTED_TIME_UP') {
      return 'Submitted';
    }
    if (candidate.status === 'DISQUALIFIED') {
      return 'Disqualified';
    }
    if (candidate.status === 'NOT_STARTED' || (!candidate.candidateStartTime && !isCandidateInProgress && (candidate.colorStatus === 'WHITE' || !candidate.colorStatus))) {
      return 'Not started';
    }
    if (remainingMs <= 0 && candidate.candidateEndTime) {
      return 'Time up';
    }
    if (remainingMs > 0) {
      const totalSec = Math.floor(remainingMs / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      return `${mins}m ${secs < 10 ? '0' : ''}${secs}s left`;
    }
    return isCandidateInProgress ? 'In Progress' : 'Not started';
  }, [candidate.status, candidate.candidateStartTime, candidate.candidateEndTime, candidate.colorStatus, remainingMs, isCandidateInProgress]);

  return (
    <div
      onClick={() => onClick(candidate)}
      style={{
        background: isWhite ? '#ffffff' : `${color}15`,
        border: `2px solid ${isWhite ? '#111827' : color}`,
        borderRadius: 10,
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'all 180ms ease-in-out',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 115,
        boxShadow: isWhite ? '0 1px 4px rgba(0,0,0,0.06)' : `0 2px 8px ${color}20`,
        position: 'relative',
        overflow: 'hidden',
        opacity: 1,
      }}
      className="seat-tile-hover"
    >
      {/* Top Header: Candidate Name + Persistent Malpractice Counter (FR-7.3) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
          <strong
            style={{
              fontSize: '0.85rem',
              color: '#1A2B3C',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={candidate.name || candidate.candidateName}
          >
            {candidate.name || candidate.candidateName || 'Candidate'}
          </strong>

          {/* FR-7.3: Persistent Malpractice Counter directly beside candidate name */}
          <span
            className={`badge ${malpracticeCount > 0 ? 'badge-danger' : 'badge-secondary'}`}
            style={{
              fontSize: '0.65rem',
              padding: '1px 5px',
              fontWeight: 700,
              flexShrink: 0,
              backgroundColor: malpracticeCount > 0 ? '#E74C3C' : '#f3f4f6',
              color: malpracticeCount > 0 ? '#ffffff' : '#6b7280',
              border: malpracticeCount > 0 ? 'none' : '1px solid #e5e7eb',
            }}
            title={`Persistent Malpractice Counter: ${malpracticeCount} violations`}
          >
            ⚠️ {malpracticeCount}
          </span>
        </div>

        {/* Status dot / badge (BUG-32: clearly visible on all tile backgrounds; BUG-43, BUG-45: high-visibility pulse for in-progress yellow dot) */}
        <span
          className={isYellowDot ? 'seat-tile-dot-pulse' : ''}
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: isWhite ? '#94A3B8' : color,
            border: isWhite ? '1.5px solid #111827' : `1px solid ${color}`,
            display: 'inline-block',
            boxShadow: isWhite ? 'none' : `0 0 6px ${color}`,
            flexShrink: 0,
            transformOrigin: 'center',
            animation: isYellowDot ? 'seatTileDotPulse 1.8s ease-in-out infinite' : 'none',
            willChange: isYellowDot ? 'opacity, transform' : 'auto',
          }}
          title={`Status: ${candidate.status || (isCandidateInProgress ? 'IN_PROGRESS' : 'NOT_STARTED')}`}
        />
      </div>

      {/* Room and progress */}
      <div style={{ margin: '6px 0', fontSize: '0.75rem', color: '#6b7280' }}>
        <div>{roomName || candidate.roomName || 'Room'}</div>
        <div style={{ fontWeight: 600, color: '#374151', marginTop: 2 }}>
          {candidate.status === 'NOT_STARTED'
            ? 'Not started'
            : `${candidate.questionsCompleted ?? 0} Qs Solved`}
        </div>
      </div>

      {/* Bottom Footer: Live Countdown Timer / Status (BUG-32: redundant color label removed) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', marginTop: 4 }}>
        <span style={{ color: '#4b5563', fontFamily: 'monospace', fontWeight: 600 }}>
          {formattedTimer}
        </span>
      </div>
    </div>
  );
});

// ── Memoized Table Row Component (FR-7.3: Persistent Malpractice counter beside name) ──
const CandidateRowItem = memo(({ candidate, roomName, onSelect, onWarn, onDisqualify, style, now }) => {
  const isCandidateInProgress = candidate.status === 'IN_PROGRESS';
  const colorStatus = getCandidateColorStatus(candidate);
  const color = STATUS_COLORS[colorStatus];
  const isWhite = colorStatus === 'WHITE';
  const isYellowDot = colorStatus === 'YELLOW';
  const malpracticeCount = candidate.malpracticeCount || 0;

  const remainingMs = getCandidateRemainingMs(candidate, now);
  const formattedTimer = useMemo(() => {
    if (candidate.status === 'SUBMITTED' || candidate.status === 'AUTO_SUBMITTED_TIME_UP') {
      return 'Submitted';
    }
    if (candidate.status === 'DISQUALIFIED') {
      return 'Disqualified';
    }
    if (candidate.status === 'NOT_STARTED' || (!candidate.candidateStartTime && !isCandidateInProgress && (candidate.colorStatus === 'WHITE' || !candidate.colorStatus))) {
      return 'Not started';
    }
    if (remainingMs <= 0 && candidate.candidateEndTime) {
      return '00m 00s (Time up)';
    }
    if (remainingMs > 0) {
      const totalSec = Math.floor(remainingMs / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
    }
    return isCandidateInProgress ? 'In Progress' : 'Not started';
  }, [candidate.status, candidate.candidateStartTime, candidate.candidateEndTime, candidate.colorStatus, remainingMs, isCandidateInProgress]);

  return (
    <div
      style={{
        ...style,
        display: 'grid',
        gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr 1.2fr 1.2fr 1.5fr',
        alignItems: 'center',
        padding: '8px 16px',
        borderBottom: '1px solid #f3f4f6',
        fontSize: '0.85rem',
        background: 'white',
        opacity: 1,
      }}
    >
      {/* Candidate Name + Persistent Malpractice Counter (FR-7.3) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
        <span
          className={isYellowDot ? 'seat-tile-dot-pulse' : ''}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: isWhite ? '#94A3B8' : color,
            border: isWhite ? '1.5px solid #111827' : `1px solid ${color}`,
            flexShrink: 0,
            boxShadow: isCandidateInProgress ? `0 0 6px ${color}` : 'none',
            transformOrigin: 'center',
            animation: isYellowDot ? 'seatTileDotPulse 1.8s ease-in-out infinite' : 'none',
            willChange: isYellowDot ? 'opacity, transform' : 'auto',
          }}
        />
        <strong style={{ color: '#1A2B3C', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {candidate.name || candidate.candidateName || 'Candidate'}
        </strong>
        {/* FR-7.3: Persistent Malpractice counter directly beside name */}
        <span
          className={`badge ${malpracticeCount > 0 ? 'badge-danger' : 'badge-secondary'}`}
          style={{
            fontSize: '0.65rem',
            padding: '1px 5px',
            fontWeight: 700,
            flexShrink: 0,
            backgroundColor: malpracticeCount > 0 ? '#E74C3C' : '#f3f4f6',
            color: malpracticeCount > 0 ? '#ffffff' : '#6b7280',
            border: malpracticeCount > 0 ? 'none' : '1px solid #e5e7eb',
          }}
          title={`Persistent Malpractice Counter: ${malpracticeCount}`}
        >
          ⚠️ {malpracticeCount}
        </span>
      </div>

      <div style={{ color: '#4b5563' }}>{roomName || candidate.roomName || 'Room'}</div>

      <div>
        <span
          className="badge"
          style={{
            background: `${color}20`,
            color: color === '#F1C40F' ? '#b45309' : (color === '#E0E0E0' ? '#6b7280' : color),
            border: `1px solid ${color}60`,
            fontSize: '0.72rem',
            fontWeight: 600,
          }}
        >
          {candidate.status === 'AUTO_SUBMITTED_TIME_UP'
            ? 'SUBMITTED (TIME UP)'
            : (candidate.status || (isCandidateInProgress ? 'IN_PROGRESS' : colorStatus) || 'IN_PROGRESS')}
        </span>
      </div>

      <div style={{ color: '#1A2B3C', fontWeight: 600 }}>
        {candidate.status === 'NOT_STARTED' ? '—' : (candidate.questionsCompleted ?? 0)}
      </div>

      <div>
        {malpracticeCount > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(candidate);
            }}
            className="badge badge-danger"
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              cursor: 'pointer',
              border: 'none',
              padding: '3px 8px',
              borderRadius: 4,
            }}
            title="Click to view violation proof screenshots"
          >
            ⚠️ {malpracticeCount} Violations
          </button>
        ) : (
          <span style={{ color: '#2ECC71', fontSize: '0.75rem' }}>✓ Clean (0)</span>
        )}
      </div>

      {/* Live countdown timer for roster (Requirement 2d) */}
      <div style={{ color: '#6b7280', fontFamily: 'monospace', fontSize: '0.8rem' }}>
        {formattedTimer}
      </div>

      <div style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button
          onClick={() => onSelect(candidate)}
          className="btn btn-secondary"
          style={{ padding: '3px 8px', fontSize: '0.72rem' }}
        >
          Inspect
        </button>
        {candidate.status !== 'DISQUALIFIED' && (
          <>
            <button
              onClick={() => onWarn(candidate)}
              className="btn btn-secondary"
              style={{ padding: '3px 6px', fontSize: '0.72rem', color: '#d97706' }}
              title="Send Warning"
            >
              Warn
            </button>
            <button
              onClick={() => onDisqualify(candidate)}
              className="btn btn-danger"
              style={{ padding: '3px 6px', fontSize: '0.72rem' }}
              title="Disqualify Candidate (FR-7.4)"
            >
              Disqualify
            </button>
          </>
        )}
      </div>
    </div>
  );
});

export default function AdminLiveDashboard() {
  const { testId } = useParams();
  const { user } = useAuth();

  const [test, setTest] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [selectedRoomId, setSelectedRoomId] = useState('ALL'); // FR-8.2: defaults to All Rooms
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Audio Voice Announcement Toggle (FR-8.3)
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Candidate Data Store: candidateId -> candidateObj
  const [candidatesMap, setCandidatesMap] = useState({});

  // Late Join Requests Queue (Requirements 4 & 5)
  const [lateJoinRequests, setLateJoinRequests] = useState([]);

  // Live Alerts Queue (FR-7.3)
  const [activeAlert, setActiveAlert] = useState(null);
  const [alertQueue, setAlertQueue] = useState([]);

  // Selected candidate for inspect drawer
  const [inspectCandidate, setInspectCandidate] = useState(null);
  const [candidateLogs, setCandidateLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // BUG-24: Derive fresh candidate state from candidatesMap to guarantee real-time updates while modal is open
  const activeInspectCandidate = useMemo(() => {
    if (!inspectCandidate) return null;
    const cid = inspectCandidate.candidateId || inspectCandidate.id || inspectCandidate._id;
    const fromMap = cid ? candidatesMap[cid] : null;
    return fromMap ? { ...inspectCandidate, ...fromMap } : inspectCandidate;
  }, [inspectCandidate, candidatesMap]);

  // Fetch candidate malpractice logs whenever inspect modal opens
  useEffect(() => {
    const targetCid = inspectCandidate?.candidateId || inspectCandidate?.id || inspectCandidate?._id;
    if (!targetCid) {
      setCandidateLogs([]);
      return;
    }
    setLoadingLogs(true);
    api.getCandidateMalpracticeLogs(testId, targetCid)
      .then((res) => {
        setCandidateLogs(res.data.malpracticeLogs || []);
      })
      .catch((err) => {
        console.error('Failed to fetch candidate malpractice logs:', err);
        setCandidateLogs([]);
      })
      .finally(() => setLoadingLogs(false));
  }, [inspectCandidate, testId]);

  // Zoom proof screenshot modal
  const [zoomScreenshotUrl, setZoomScreenshotUrl] = useState(null);

  // NFR: Debounce buffer for socket events (max 1 re-render per 200ms)
  const debounceBufferRef = useRef({});
  const debounceTimerRef = useRef(null);

  // Load Test, Rooms, & Initial Active Candidates
  useEffect(() => {
    let isMounted = true;
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        const [testRes, roomsRes, liveRes, lateJoinRes] = await Promise.all([
          api.getTest(testId),
          api.getRooms(testId),
          api.getLiveCandidates(testId).catch(() => ({ data: { candidates: {} } })),
          api.getPendingLateJoins(testId).catch(() => ({ data: { requests: [] } })),
        ]);
        if (!isMounted) return;
        setTest(testRes.data.test);
        setRooms(roomsRes.data.rooms || []);
        if (liveRes.data?.candidates) {
          const initialMap = {};
          const initialNow = Date.now();
          for (const [cid, cand] of Object.entries(liveRes.data.candidates)) {
            initialMap[cid] = {
              ...cand,
              candidateId: cid,
              candidateEndTime: cand.candidateEndTime || (cand.timeRemaining ? new Date(initialNow + cand.timeRemaining).toISOString() : null),
              candidateStartTime: cand.candidateStartTime || null,
              lastSyncedAt: initialNow,
            };
          }
          setCandidatesMap(initialMap);
        }
        if (lateJoinRes.data?.requests) {
          setLateJoinRequests(lateJoinRes.data.requests);
        }
      } catch (err) {
        const errorMsg = err.response?.data?.error || err.message || 'Failed to initialize live dashboard';
        toast.error(errorMsg);
        if (isMounted) setLoadError(errorMsg);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchInitialData();
    return () => { isMounted = false; };
  }, [testId]);

  // Periodic background refresh to keep candidate roster in sync with DB
  useEffect(() => {
    const interval = setInterval(() => {
      api.getLiveCandidates(testId).then((res) => {
        if (res.data?.candidates) {
          setCandidatesMap((prev) => {
            const updated = { ...prev };
            for (const [cid, cand] of Object.entries(res.data.candidates)) {
              updated[cid] = {
                ...(updated[cid] || {}),
                ...cand,
                candidateId: cid,
              };
            }
            return updated;
          });
        }
      }).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [testId]);

  // Flush debounced socket updates to React state
  const flushDebounceBuffer = useCallback(() => {
    if (Object.keys(debounceBufferRef.current).length === 0) return;

    setCandidatesMap((prev) => {
      const updated = { ...prev };
      const currentNow = Date.now();
      for (const [cid, data] of Object.entries(debounceBufferRef.current)) {
        const existing = updated[cid] || {};
        const cleanedData = {};
        for (const [k, v] of Object.entries(data)) {
          if (v !== undefined && v !== null) {
            cleanedData[k] = v;
          }
        }
        const endTime = cleanedData.candidateEndTime || existing.candidateEndTime || (cleanedData.timeRemaining ? new Date(currentNow + cleanedData.timeRemaining).toISOString() : null);
        updated[cid] = {
          ...existing,
          ...cleanedData,
          candidateId: cid,
          candidateEndTime: endTime,
          candidateStartTime: cleanedData.candidateStartTime || existing.candidateStartTime || null,
          lastSyncedAt: currentNow,
        };
      }
      return updated;
    });

    debounceBufferRef.current = {};
  }, []);

  // Voice Announcement helper (FR-8.3)
  const announceCandidateSubmission = useCallback((name) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(`${name} has submitted the test.`);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('Speech synthesis error:', e);
    }
  }, [voiceEnabled]);

  // Handle Allow Late Entry (Requirement 4)
  const handleAllowLateEntry = useCallback(async (roomId, candidateId) => {
    try {
      await api.allowLateJoin(roomId, candidateId);
      setLateJoinRequests((prev) => prev.filter((r) => r.candidateId !== candidateId));
      toast.success('Late entry approved. Candidate can now enter the room.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to allow late entry');
    }
  }, []);

  // Handle Dismiss Late Join (Requirement 4)
  const handleDismissLateJoin = useCallback(async (roomId, candidateId) => {
    try {
      await api.dismissLateJoin(roomId, candidateId);
      setLateJoinRequests((prev) => prev.filter((r) => r.candidateId !== candidateId));
      toast('Late join request dismissed.', { icon: '🗑️' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to dismiss request');
    }
  }, []);

  // ── Socket.io Connections & Event Subscriptions (Section 10) ──────────────────
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !user?.id) return;

    initSocket(token);

    // Section 10.1: admin:join
    emitAdminJoin({ adminId: user.id, testId });

    // Section 10.2: dashboard:update
    const handleDashboardUpdate = (data) => {
      const cid = data.candidateId;
      if (!cid) return;

      debounceBufferRef.current[cid] = {
        ...(debounceBufferRef.current[cid] || {}),
        ...data,
      };

      if (!debounceTimerRef.current) {
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null;
          flushDebounceBuffer();
        }, 200); // 200ms NFR debounce
      }
    };

    // Section 10.2: seatmap:status
    const handleSeatmapStatus = (data) => {
      const cid = data.candidateId;
      if (!cid) return;

      debounceBufferRef.current[cid] = {
        ...(debounceBufferRef.current[cid] || {}),
        colorStatus: data.colorStatus,
        roomId: data.roomId,
      };

      if (!debounceTimerRef.current) {
        debounceTimerRef.current = setTimeout(() => {
          debounceTimerRef.current = null;
          flushDebounceBuffer();
        }, 200);
      }
    };

    // Section 10.2: malpractice:alert (FR-7.3)
    const handleMalpracticeAlert = (alertData) => {
      console.log('[Socket] Malpractice Alert received:', alertData);
      
      // Update candidate's persistent malpractice counter in map (FR-7.3)
      if (alertData.candidateId) {
        const cid = alertData.candidateId;
        setCandidatesMap((prev) => {
          const current = prev[cid] || {};
          return {
            ...prev,
            [cid]: {
              ...current,
              candidateId: cid,
              name: current.name || alertData.candidateName,
              email: current.email || alertData.candidateEmail,
              roomId: current.roomId || alertData.roomId,
              roomName: current.roomName || alertData.roomName,
              status: current.status || 'IN_PROGRESS',
              colorStatus: current.colorStatus || 'YELLOW',
              malpracticeCount: alertData.currentCount || (current.malpracticeCount || 0) + 1,
            },
          };
        });

        // Also update inspectCandidate if currently inspecting this candidate
        setInspectCandidate((prev) => {
          if (!prev) return prev;
          const prevId = prev.candidateId || prev.id || prev._id;
          if (prevId === cid) {
            return {
              ...prev,
              malpracticeCount: alertData.currentCount || (prev.malpracticeCount || 0) + 1,
            };
          }
          return prev;
        });

        // Background sync to ensure all candidate details from server DB
        api.getLiveCandidates(testId).then((res) => {
          if (res.data?.candidates) {
            setCandidatesMap((prev) => {
              const updated = { ...prev };
              for (const [id, cand] of Object.entries(res.data.candidates)) {
                updated[id] = {
                  ...(updated[id] || {}),
                  ...cand,
                  candidateId: id,
                };
              }
              return updated;
            });
          }
        }).catch(() => {});
      }

      toast.error(`⚠️ Malpractice: ${alertData.candidateName || 'Candidate'} (${alertData.violationType})`, {
        duration: 5000,
      });

      setAlertQueue((q) => [...q, alertData]);
    };

    // Section 10.2: candidate:submitted (FR-8.3)
    const handleCandidateSubmitted = (subData) => {
      toast.success(`🎉 ${subData.candidateName || 'A candidate'} just submitted!`);
      announceCandidateSubmission(subData.candidateName || 'A candidate');

      if (subData.candidateId) {
        setCandidatesMap((prev) => {
          const current = prev[subData.candidateId];
          if (!current) return prev;
          return {
            ...prev,
            [subData.candidateId]: {
              ...current,
              status: 'SUBMITTED',
              colorStatus: 'GREEN',
              timeRemaining: 0,
              candidateEndTime: new Date().toISOString(),
            },
          };
        });

        // BUG-24: Also update inspectCandidate state if admin is currently inspecting this candidate
        setInspectCandidate((prev) => {
          if (!prev) return prev;
          const prevId = prev.candidateId || prev.id || prev._id;
          if (String(prevId) === String(subData.candidateId)) {
            return {
              ...prev,
              status: 'SUBMITTED',
              colorStatus: 'GREEN',
              timeRemaining: 0,
              candidateEndTime: new Date().toISOString(),
            };
          }
          return prev;
        });
      }
    };

    // Section 10.2: room:updated
    const handleRoomUpdated = () => {
      api.getRooms(testId).then((res) => setRooms(res.data.rooms || [])).catch(() => {});
      api.getLiveCandidates(testId).then((res) => {
        if (res.data?.candidates) {
          setCandidatesMap((prev) => {
            const updated = { ...prev };
            for (const [cid, cand] of Object.entries(res.data.candidates)) {
              updated[cid] = {
                ...(updated[cid] || {}),
                ...cand,
                candidateId: cid,
              };
            }
            return updated;
          });
        }
      }).catch(() => {});
    };

    // Section 10.2: test:ended
    const handleTestEnded = () => {
      toast('Test has ENDED.', { icon: '⏹' });
      setTest((t) => (t ? { ...t, status: 'ENDED' } : t));
    };

    // Section 10.2: late join request (Requirements 4 & 5)
    const handleLateJoinReq = (reqData) => {
      // Requirement 5: De-duplicate by candidateId
      setLateJoinRequests((prev) => {
        if (prev.some((r) => r.candidateId === reqData.candidateId)) {
          return prev;
        }
        return [...prev, reqData];
      });

      toast(
        (t) => (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 260 }}>
            <div style={{ fontWeight: 700, color: '#1A2B3C' }}>
              📢 Late Join Request
            </div>
            <div style={{ fontSize: '0.85rem', color: '#4b5563' }}>
              <strong>{reqData.candidateName}</strong> wants to join <strong>{reqData.roomName || reqData.roomCode}</strong>.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button
                className="btn btn-sm btn-success"
                style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600 }}
                onClick={async () => {
                  toast.dismiss(t.id);
                  await handleAllowLateEntry(reqData.roomId, reqData.candidateId);
                }}
              >
                ✓ Allow Entry
              </button>
              <button
                className="btn btn-sm btn-danger"
                style={{ padding: '4px 10px', fontSize: '0.75rem', fontWeight: 600 }}
                onClick={async () => {
                  toast.dismiss(t.id);
                  await handleDismissLateJoin(reqData.roomId, reqData.candidateId);
                }}
              >
                ✕ Dismiss
              </button>
            </div>
          </div>
        ),
        { duration: 15000, id: `late-join-toast-${reqData.candidateId}` }
      );
    };

    const handleLateJoinProc = (procData) => {
      setLateJoinRequests((prev) => prev.filter((r) => r.candidateId !== procData.candidateId));
    };

    // Section 10.2: room:tentative-time (BUG-21)
    const handleRoomTentativeTime = () => {
      api.getLiveCandidates(testId).then((res) => {
        if (res.data?.candidates) {
          setCandidatesMap((prev) => {
            const updated = { ...prev };
            for (const [cid, cand] of Object.entries(res.data.candidates)) {
              updated[cid] = {
                ...(updated[cid] || {}),
                ...cand,
                candidateId: cid,
              };
            }
            return updated;
          });
        }
      }).catch(() => {});
    };

    onDashboardUpdate(handleDashboardUpdate);
    onSeatmapStatus(handleSeatmapStatus);
    onMalpracticeAlert(handleMalpracticeAlert);
    onCandidateSubmitted(handleCandidateSubmitted);
    onRoomUpdated(handleRoomUpdated);
    onTestEnded(handleTestEnded);
    onLateJoinRequest(handleLateJoinReq);
    onLateJoinProcessed(handleLateJoinProc);
    onRoomTentativeTime(handleRoomTentativeTime);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      offDashboardUpdate(handleDashboardUpdate);
      offSeatmapStatus(handleSeatmapStatus);
      offMalpracticeAlert(handleMalpracticeAlert);
      offCandidateSubmitted(handleCandidateSubmitted);
      offRoomUpdated(handleRoomUpdated);
      offTestEnded(handleTestEnded);
      offLateJoinRequest(handleLateJoinReq);
      offLateJoinProcessed(handleLateJoinProc);
      offRoomTentativeTime(handleRoomTentativeTime);
      disconnectSocket();
    };
  }, [testId, user?.id, flushDebounceBuffer, announceCandidateSubmission, handleAllowLateEntry, handleDismissLateJoin]);

  // Manage Active Alert Popup from Queue
  useEffect(() => {
    if (!activeAlert && alertQueue.length > 0) {
      setActiveAlert(alertQueue[0]);
      setAlertQueue((q) => q.slice(1));
    }
  }, [activeAlert, alertQueue]);

  // Review Malpractice Action (FR-7.4)
  const handleReviewMalpractice = async (logId, action) => {
    try {
      await api.reviewMalpractice(logId, { adminAction: action });
      toast.success(`Candidate marked as ${action}`);

      // Update candidateLogs state locally in inspect modal
      setCandidateLogs((prev) =>
        prev.map((l) => (l._id === logId ? { ...l, adminAction: action, adminReviewed: true } : l))
      );

      const targetCandidateId = inspectCandidate?.candidateId || activeAlert?.candidateId;
      if (action === 'DISQUALIFIED' && targetCandidateId) {
        setCandidatesMap((prev) => ({
          ...prev,
          [targetCandidateId]: {
            ...prev[targetCandidateId],
            status: 'DISQUALIFIED',
            colorStatus: 'RED',
          },
        }));
        if (inspectCandidate && inspectCandidate.candidateId === targetCandidateId) {
          setInspectCandidate((prev) => ({
            ...prev,
            status: 'DISQUALIFIED',
            colorStatus: 'RED',
          }));
        }
      }
      if (activeAlert?.malpracticeLogId === logId) {
        setActiveAlert(null);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to review violation');
    }
  };

  const handleManualWarn = (candidate) => {
    toast(`Sent warning to ${candidate.name}`, { icon: '⚠️' });
  };

  const handleManualDisqualify = async (candidate) => {
    if (!window.confirm(`Are you sure you want to DISQUALIFY ${candidate.name}?`)) return;
    try {
      setCandidatesMap((prev) => ({
        ...prev,
        [candidate.candidateId]: {
          ...prev[candidate.candidateId],
          status: 'DISQUALIFIED',
          colorStatus: 'RED',
        },
      }));
      toast.success(`${candidate.name} has been disqualified.`);
    } catch {
      toast.error('Failed to disqualify candidate');
    }
  };

  const roomsById = useMemo(() => {
    const map = {};
    rooms.forEach((r) => { map[String(r._id)] = r.roomName; });
    return map;
  }, [rooms]);

  // Filter candidates
  const candidateList = useMemo(() => {
    return Object.values(candidatesMap).filter((c) => {
      const cRoomId = typeof c.roomId === 'object' ? (c.roomId?._id || c.roomId?.id) : c.roomId;
      const matchesRoom = selectedRoomId === 'ALL' || String(cRoomId) === String(selectedRoomId);
      const cColorStatus = getCandidateColorStatus(c);
      const matchesStatus =
        filterStatus === 'ALL' ||
        cColorStatus === filterStatus ||
        (filterStatus === 'GREEN' && (c.status === 'SUBMITTED' || c.status === 'AUTO_SUBMITTED_TIME_UP')) ||
        c.status === filterStatus;
      const matchesSearch = !searchQuery.trim() || c.name?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesRoom && matchesStatus && matchesSearch;
    });
  }, [candidatesMap, selectedRoomId, filterStatus, searchQuery]);

  // Aggregated Stats
  const stats = useMemo(() => {
    let submitted = 0, yellow = 0, red = 0, white = 0, passing = 0, totalMalpractice = 0;
    const passingThreshold = test?.passingCriteria || 1;
    Object.values(candidatesMap).forEach((c) => {
      const cColorStatus = getCandidateColorStatus(c);
      if (cColorStatus === 'GREEN') submitted++;
      else if (cColorStatus === 'YELLOW') yellow++;
      else if (cColorStatus === 'RED') red++;
      else white++;

      if ((c.questionsCompleted ?? 0) >= passingThreshold) {
        passing++;
      }

      if (c.malpracticeCount) totalMalpractice += c.malpracticeCount;
    });
    return {
      total: Object.keys(candidatesMap).length,
      green: submitted,
      submitted,
      yellow,
      red,
      white,
      passing,
      totalMalpractice,
    };
  }, [candidatesMap, test?.passingCriteria]);

  // Aggregate / Tentative Timer Calculation (BUG-21: MAXIMUM remaining time among IN_PROGRESS candidates)
  const [now, setNow] = useState(Date.now());

  // 1-second client-side ticker for smooth countdown (Requirement 2c)
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const tentativeTimer = useMemo(() => {
    // ASSUMPTION: If test is not loaded or status is not live, show appropriate fallback
    if (!test) return { formatted: '—', rawMs: 0, hasActive: false };
    if (test.status === 'ENDED') {
      return { formatted: '00:00 (Concluded)', rawMs: 0, hasActive: false };
    }

    // Filter in-progress candidates in current view (matching selectedRoomId or ALL rooms combined)
    const inProgressCandidates = Object.values(candidatesMap).filter((c) => {
      const cRoomId = typeof c.roomId === 'object' ? (c.roomId?._id || c.roomId?.id) : c.roomId;
      const matchesRoom = selectedRoomId === 'ALL' || String(cRoomId) === String(selectedRoomId);
      if (!matchesRoom) return false;

      // Only candidates who have actively started and are IN_PROGRESS (not submitted/disqualified/time-up)
      if (c.status !== 'IN_PROGRESS' || !c.candidateStartTime) {
        return false;
      }

      const remaining = getCandidateRemainingMs(c, now);
      return remaining > 0;
    });

    // BUG-30 Part B: Distinguish between "no candidate has ever joined/started yet" vs "all candidates finished/reached terminal state"
    if (inProgressCandidates.length === 0) {
      const candidatesInScope = Object.values(candidatesMap).filter((c) => {
        const cRoomId = typeof c.roomId === 'object' ? (c.roomId?._id || c.roomId?.id) : c.roomId;
        return selectedRoomId === 'ALL' || String(cRoomId) === String(selectedRoomId);
      });

      // Scenario 1: Zero candidates have ever joined this test / room
      if (candidatesInScope.length === 0) {
        return {
          formatted: 'Not started',
          rawMs: 0,
          hasActive: false,
        };
      }

      // Check if any candidate has started at all (or is in an active/finished state)
      const anyCandidateStarted = candidatesInScope.some(
        (c) => c.candidateStartTime || c.status === 'IN_PROGRESS' || c.status === 'SUBMITTED' || c.status === 'AUTO_SUBMITTED_TIME_UP'
      );

      // Scenario 1b: Candidates joined a room, but none have clicked "Start Test" yet
      if (!anyCandidateStarted) {
        return {
          formatted: 'Not started',
          rawMs: 0,
          hasActive: false,
        };
      }

      // Scenario 2: Candidates DID join and have all reached a terminal state
      // (all SUBMITTED, AUTO_SUBMITTED_TIME_UP, DISQUALIFIED, or timer expired)
      // ASSUMPTION (BUG-30 Part B): Show "Session concluded" to clearly indicate session completion.
      return {
        formatted: 'Session concluded',
        rawMs: 0,
        hasActive: false,
      };
    }

    // BUG-21: Tentative Time = MAX remaining time (candidateEndTime - now) among candidates currently IN_PROGRESS
    const remainingTimes = inProgressCandidates.map((c) => getCandidateRemainingMs(c, now));
    const maxRemainingMs = Math.max(...remainingTimes);

    const formatMs = (ms) => {
      const totalSec = Math.max(0, Math.floor(ms / 1000));
      const hours = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;
      const secStr = secs < 10 ? `0${secs}` : `${secs}`;
      if (hours > 0) {
        return `${hours}h ${mins < 10 ? '0' : ''}${mins}m ${secStr}s`;
      }
      return `${mins}m ${secStr}s`;
    };

    return {
      formatted: formatMs(maxRemainingMs),
      rawMs: maxRemainingMs,
      hasActive: true,
    };
  }, [candidatesMap, selectedRoomId, test, now]);

  // Section 13 NFR Virtualized Row Renderer for >50 items
  const VirtualizedRow = useCallback(({ index, style }) => {
    const candidate = candidateList[index];
    if (!candidate) return null;
    return (
      <CandidateRowItem
        candidate={candidate}
        roomName={roomsById[candidate.roomId] || 'Room'}
        onSelect={setInspectCandidate}
        onWarn={handleManualWarn}
        onDisqualify={handleManualDisqualify}
        style={style}
        now={now}
      />
    );
  }, [candidateList, roomsById, now]);

  if (loading) {
    return (
      <div className="app-layout">
        <AdminNavbar />
        <main className="main-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <div className="spinner spinner-dark" style={{ width: 40, height: 40, borderWidth: 3 }} />
        </main>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="app-layout">
        <AdminNavbar />
        <main className="main-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: '2.5rem' }}>⚠️</div>
          <h3 style={{ color: '#1A2B3C', fontWeight: 700 }}>Unable to Load Live Monitoring</h3>
          <p style={{ color: '#64748B', maxWidth: 460, textAlign: 'center', fontSize: '0.9rem' }}>{loadError}</p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn btn-primary"
              style={{ padding: '8px 20px', fontSize: '0.85rem' }}
            >
              Retry
            </button>
            <Link
              to="/admin/tests"
              className="btn btn-secondary"
              style={{ padding: '8px 20px', fontSize: '0.85rem' }}
            >
              Back to Tests
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!test) {
    return (
      <div className="app-layout">
        <AdminNavbar />
        <main className="main-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: '2.5rem' }}>🔍</div>
          <h3 style={{ color: '#1A2B3C', fontWeight: 700 }}>Test Not Found</h3>
          <p style={{ color: '#64748B', maxWidth: 460, textAlign: 'center', fontSize: '0.9rem' }}>
            The requested test could not be found or has been removed.
          </p>
          <Link
            to="/admin/tests"
            className="btn btn-primary"
            style={{ padding: '8px 20px', fontSize: '0.85rem' }}
          >
            Return to Tests
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout">
      <AdminNavbar />
      <main className="main-content">
        {/* Breadcrumb Navigation */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
          <Link to="/admin/tests" style={{ color: '#0E7C86', fontWeight: 500 }}>
            ← Tests
          </Link>
          <span style={{ color: '#9ca3af' }}>/</span>
          <Link to={`/admin/tests/${testId}`} style={{ color: '#0E7C86', fontWeight: 500 }}>
            {test?.title || 'Test Details'}
          </Link>
          <span style={{ color: '#9ca3af' }}>/</span>
          <span style={{ color: '#4b5563', fontWeight: 600 }}>Live Monitoring</span>
        </div>

        {/* Live Top Header */}
        <div className="card" style={{ marginBottom: 20, padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h1 style={{ fontSize: '1.6rem', color: '#1A2B3C', fontWeight: 800 }}>
                  {test?.title}
                </h1>
                <TestStatusBadge
                  status={test?.status || 'LIVE'}
                  style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                />
                <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                  {test?.testType}
                </span>

                {/* Tentative Time Badge (BUG-21: Maximum remaining time indicating when the session concludes) */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 12px',
                    background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                    borderRadius: 8,
                    border: '1px solid #334155',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                  }}
                  title={
                    tentativeTimer.hasActive
                      ? `Tentative Time: Session concludes when the last candidate finishes in ${tentativeTimer.formatted}`
                      : tentativeTimer.formatted === 'Session concluded'
                      ? 'Tentative Time: All candidates have finished or reached terminal states'
                      : 'Tentative Time: No candidates have started yet'
                  }
                >
                  <span style={{ fontSize: '1rem' }}>⏱️</span>
                  <div>
                    <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', fontWeight: 700 }}>
                      Tentative Time
                    </div>
                    <div style={{
                      fontFamily: tentativeTimer.hasActive ? 'monospace' : 'inherit',
                      fontSize: tentativeTimer.hasActive ? '0.95rem' : '0.82rem',
                      fontWeight: 800,
                      color: tentativeTimer.hasActive ? '#38BDF8' : '#94A3B8',
                      letterSpacing: tentativeTimer.hasActive ? '0.03em' : 'normal',
                      lineHeight: 1.1
                    }}>
                      {tentativeTimer.formatted}
                    </div>
                  </div>
                </div>
              </div>
              <p style={{ color: '#6b7280', fontSize: '0.85rem', marginTop: 4 }}>
                Real-time multi-room monitoring · Passing Threshold: <strong>≥ {test?.passingCriteria} Qs</strong>
              </p>
            </div>

            {/* Header Controls: Room Filter, Voice TTS, Links */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Voice Announcement Toggle (FR-8.3) */}
              <button
                onClick={() => {
                  setVoiceEnabled(!voiceEnabled);
                  toast.success(voiceEnabled ? 'Voice announcements muted' : 'Voice announcements enabled');
                }}
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                title="AI Voice announcement when candidates submit (FR-8.3)"
              >
                {voiceEnabled ? '🔊 Voice TTS: ON' : '🔇 Voice TTS: OFF'}
              </button>

              {/* Room Filter Dropdown (FR-8.2) */}
              <select
                className="form-select"
                style={{ width: 180, fontSize: '0.85rem' }}
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
              >
                <option value="ALL">All Rooms (Combined)</option>
                {rooms.map((r) => (
                  <option key={r._id} value={r._id}>{r.roomName}</option>
                ))}
              </select>

              <Link
                to={`/admin/tests/${testId}/results`}
                className="btn btn-primary"
                style={{ fontSize: '0.85rem', padding: '8px 16px' }}
              >
                View Shortlist &amp; Results →
              </Link>
            </div>
          </div>
        </div>

        {/* ── Pending Late-Join Requests Banner (Requirements 4 & 5) ── */}
        {lateJoinRequests.length > 0 && (
          <div
            className="card"
            style={{
              marginBottom: 20,
              padding: '16px 20px',
              border: '1.5px solid #F59E0B',
              background: '#FFFBEB',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.3rem' }}>🔔</span>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#92400E', margin: 0 }}>
                    Late Join Requests ({lateJoinRequests.length})
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: '#B45309', margin: 0 }}>
                    The following candidates are requesting entry after the room access window closed.
                  </p>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {lateJoinRequests.map((req) => (
                <div
                  key={req.candidateId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    background: '#FFFFFF',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid #FDE68A',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: '#1A2B3C', fontSize: '0.95rem' }}>
                      {req.candidateName}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                      {req.candidateEmail} {req.candidatePhone ? `· ${req.candidatePhone}` : ''}
                      {' · '}Target: <strong>{req.roomName || req.roomCode}</strong>
                      {req.requestedAt && (
                        <span> · {new Date(req.requestedAt).toLocaleTimeString()}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="btn btn-sm btn-success"
                      onClick={() => handleAllowLateEntry(req.roomId, req.candidateId)}
                      style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      ✓ Allow Entry
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDismissLateJoin(req.roomId, req.candidateId)}
                      style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      ✕ Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Real-Time Metrics Bar ── */}
        <div className="stats-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div className="stat-card">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Active Candidates</div>
          </div>
          <div className="stat-card" style={{ borderLeft: `4px solid ${STATUS_COLORS.GREEN}` }}>
            <div className="stat-value" style={{ color: STATUS_COLORS.GREEN }}>{stats.submitted}</div>
            <div className="stat-label">Submitted</div>
          </div>
          <div className="stat-card" style={{ borderLeft: `4px solid ${STATUS_COLORS.YELLOW}` }}>
            <div className="stat-value" style={{ color: '#d97706' }}>{stats.yellow}</div>
            <div className="stat-label">In Progress</div>
          </div>
          <div className="stat-card" style={{ borderLeft: `4px solid ${STATUS_COLORS.RED}` }}>
            <div className="stat-value" style={{ color: STATUS_COLORS.RED }}>{stats.red}</div>
            <div className="stat-label">Disqualified</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid #10B981' }}>
            <div className="stat-value" style={{ color: '#10B981' }}>{stats.passing}</div>
            <div className="stat-label">Meeting Criteria (≥ {test?.passingCriteria || 1} Qs)</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid #8e44ad' }}>
            <div className="stat-value" style={{ color: '#8e44ad' }}>{stats.totalMalpractice}</div>
            <div className="stat-label">Total Violations</div>
          </div>
        </div>

        {/* ── Section 11.8: Seat Map Visualization (FR-7.3 Persistent Counter) ── */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 className="card-title">Live Physical Seat Map (FR-8.1, FR-8.2)</h3>
              <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2 }}>
                Persistent violation counters (<code>⚠️ count</code>) visible directly on each seat tile (FR-7.3).
              </p>
            </div>

            {/* Seat Map Legend (Section 14, BUG-44: GREEN = Submitted) */}
            <div style={{ display: 'flex', gap: 14, fontSize: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: STATUS_COLORS.GREEN }} />
                <span>Submitted</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: STATUS_COLORS.YELLOW }} />
                <span>In Progress</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: STATUS_COLORS.RED }} />
                <span>Disqualified</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: '#ffffff', border: '2px solid #111827' }} />
                <span>Not Started</span>
              </div>
            </div>
          </div>

          {candidateList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#6b7280' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📡</div>
              <h4 style={{ color: '#1A2B3C', marginBottom: 4 }}>Waiting for candidates to connect...</h4>
              <p style={{ fontSize: '0.85rem' }}>
                As candidates join physical rooms and send heartbeats, their seats will appear here in real time.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 14,
                padding: '8px 0',
              }}
            >
              {candidateList.map((c) => (
                <SeatTile
                  key={c.candidateId}
                  candidate={c}
                  roomName={roomsById[c.roomId] || 'Room'}
                  onClick={setInspectCandidate}
                  now={now}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Candidate Roster & Proctoring Table (Section 13: react-window Virtualization) ── */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 className="card-title">Candidate Live Proctoring Roster</h3>
              <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2 }}>
                {candidateList.length > 50
                  ? `⚡ Virtualized View Active (${candidateList.length} candidates — 60fps steady)`
                  : `Showing ${candidateList.length} connected candidate(s)`}
              </p>
            </div>

            {/* Table Filters */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Search candidate..."
                style={{ width: 200, fontSize: '0.8rem', padding: '6px 12px' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              <select
                className="form-select"
                style={{ width: 140, fontSize: '0.8rem', padding: '6px 10px' }}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="GREEN">Submitted</option>
                <option value="YELLOW">In Progress</option>
                <option value="RED">Disqualified</option>
              </select>
            </div>
          </div>

          {/* Table Header Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr 1.2fr 1.2fr 1.5fr',
              padding: '10px 16px',
              background: '#f9fafb',
              borderBottom: '1.5px solid #e5e7eb',
              fontWeight: 700,
              fontSize: '0.8rem',
              color: '#374151',
            }}
          >
            <div>Candidate (FR-7.3 Counter)</div>
            <div>Room</div>
            <div>Status</div>
            <div>Qs Solved</div>
            <div>Malpractice</div>
            <div>Time Left</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {/* Table Body: Virtualized with react-window when > 50 candidates, standard when <= 50 */}
          {candidateList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#6b7280', fontSize: '0.85rem' }}>
              No matching candidates connected.
            </div>
          ) : candidateList.length > 50 ? (
            // Section 13 NFR: react-window List Virtualization for > 50 candidates
            <List
              rowComponent={VirtualizedRow}
              rowCount={candidateList.length}
              rowHeight={48}
              style={{ height: 450 }}
            />
          ) : (
            // Standard render for <= 50 candidates
            <div>
              {candidateList.map((c) => (
                <CandidateRowItem
                  key={c.candidateId}
                  candidate={c}
                  roomName={roomsById[c.roomId] || 'Room'}
                  onSelect={setInspectCandidate}
                  onWarn={handleManualWarn}
                  onDisqualify={handleManualDisqualify}
                  now={now}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Live Malpractice Alert Modal (FR-7.3, FR-7.4) ── */}
        {activeAlert && (
          <div className="modal-backdrop" style={{ zIndex: 1100 }}>
            <div className="modal-container" style={{ maxWidth: 560, border: '2px solid #E74C3C' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header" style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.4rem' }}>🚨</span>
                  <h3 className="modal-title" style={{ color: '#E74C3C' }}>
                    Malpractice Alert (FR-7.3)
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveAlert(null)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: '#6b7280' }}>Candidate:</span>
                    <strong style={{ display: 'block', color: '#1A2B3C' }}>{activeAlert.candidateName}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280' }}>Violation Type:</span>
                    <span className="badge badge-danger" style={{ display: 'inline-block', marginTop: 2 }}>
                      {activeAlert.violationType}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280' }}>Violation Count:</span>
                    <strong style={{ display: 'block', color: '#E74C3C' }}>
                      Incident #{activeAlert.currentCount || 1}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280' }}>Timestamp:</span>
                    <span style={{ display: 'block', color: '#4b5563' }}>
                      {new Date().toLocaleTimeString()}
                    </span>
                  </div>
                  {activeAlert.violationType === 'CAMERA_DISCONNECTED' && (
                    <div style={{ gridColumn: 'span 2', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px' }}>
                      <span style={{ fontWeight: 700, color: '#b91c1c', display: 'block', fontSize: '0.85rem' }}>
                        📷 Camera Disconnected Security Alert
                      </span>
                      <span style={{ color: '#7f1d1d', fontSize: '0.78rem' }}>
                        Candidate camera was disconnected. Fullscreen opaque blackout overlay and editor lock are active.
                      </span>
                      {activeAlert.durationSeconds !== null && activeAlert.durationSeconds !== undefined && (
                        <div style={{ marginTop: 4, fontWeight: 700, color: '#15803d', fontSize: '0.82rem' }}>
                          Total Disconnect Duration: {activeAlert.durationSeconds}s
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Proof Screenshot Image */}
                {activeAlert.proofScreenshotUrl ? (
                  <div>
                    <span style={{ fontSize: '0.8rem', color: '#6b7280', display: 'block', marginBottom: 6 }}>
                      📸 Captured Proof Frame:
                    </span>
                    <div
                      style={{
                        position: 'relative',
                        border: '1.5px solid #e5e7eb',
                        borderRadius: 8,
                        overflow: 'hidden',
                        cursor: 'zoom-in',
                      }}
                      onClick={() => setZoomScreenshotUrl(activeAlert.proofScreenshotUrl)}
                    >
                      <img
                        src={activeAlert.proofScreenshotUrl}
                        alt="Violation Proof"
                        style={{ width: '100%', maxHeight: 240, objectFit: 'contain', background: '#000' }}
                      />
                      <div style={{ position: 'absolute', bottom: 6, right: 8, background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '0.7rem', padding: '2px 6px', borderRadius: 4 }}>
                        🔍 Click to Enlarge
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: '#f3f4f6', padding: 16, borderRadius: 6, textAlign: 'center', color: '#6b7280', fontSize: '0.8rem' }}>
                    No frame capture available.
                  </div>
                )}

                <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 6, padding: 10, fontSize: '0.78rem', color: '#92400e' }}>
                  ℹ️ <strong>FR-7.4:</strong> Malpractice does not auto-disqualify during live test. Review proof above and select an admin action.
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button
                  type="button"
                  onClick={() => setActiveAlert(null)}
                  className="btn btn-secondary"
                >
                  Dismiss
                </button>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => handleReviewMalpractice(activeAlert.malpracticeLogId, 'WARNED')}
                    className="btn btn-secondary"
                    style={{ color: '#d97706', border: '1.5px solid #d97706' }}
                  >
                    ⚠️ Issue Warning
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReviewMalpractice(activeAlert.malpracticeLogId, 'DISQUALIFIED')}
                    className="btn btn-danger"
                  >
                    🚫 Disqualify Candidate
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Candidate Inspect Modal with Malpractice Proof & Evidence History (FR-7.3, FR-7.4) ── */}
        {activeInspectCandidate && (
          <div className="modal-backdrop" onClick={() => setInspectCandidate(null)}>
            <div className="modal-container" style={{ maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3 className="modal-title" style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    🔍 Candidate Inspection &amp; Evidence
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                    Live Proctoring &amp; Malpractice Review
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectCandidate(null)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingRight: 4 }}>
                {/* Top Info Card */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <div>
                    <h4 style={{ fontSize: '1.15rem', color: '#1A2B3C', fontWeight: 800, margin: 0 }}>
                      {activeInspectCandidate.name || activeInspectCandidate.candidateName || 'Candidate'}
                    </h4>
                    <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                      {activeInspectCandidate.email || activeInspectCandidate.candidateEmail || ''} {activeInspectCandidate.email || activeInspectCandidate.candidateEmail ? '·' : ''} Room: <strong>{roomsById[activeInspectCandidate.roomId] || activeInspectCandidate.roomName || 'Assigned Room'}</strong>
                    </span>
                  </div>
                  {(() => {
                    const inspectColorStatus = getCandidateColorStatus(activeInspectCandidate);
                    const inspectColor = STATUS_COLORS[inspectColorStatus] || '#9ca3af';
                    return (
                      <span
                        className="badge"
                        style={{
                          background: `${inspectColor}20`,
                          color: inspectColor === '#F1C40F' ? '#b45309' : inspectColor,
                          border: `1.5px solid ${inspectColor}`,
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          padding: '4px 10px',
                        }}
                      >
                        {activeInspectCandidate.status === 'AUTO_SUBMITTED_TIME_UP'
                          ? 'SUBMITTED (TIME UP)'
                          : (activeInspectCandidate.status || inspectColorStatus || 'ACTIVE')}
                      </span>
                    );
                  })()}
                </div>

                {/* Key Metrics Grid */}
                <div style={{ background: '#ffffff', padding: 12, borderRadius: 8, border: '1px solid #e5e7eb', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: '0.85rem' }}>
                  <div>
                    <span style={{ color: '#6b7280', fontSize: '0.78rem' }}>Questions Solved:</span>
                    <strong style={{ display: 'block', color: '#1A2B3C', fontSize: '1.1rem', marginTop: 2 }}>
                      {activeInspectCandidate.status === 'NOT_STARTED' ? '—' : (activeInspectCandidate.questionsCompleted ?? 0)}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280', fontSize: '0.78rem' }}>Total Violations:</span>
                    <strong style={{ display: 'block', color: (activeInspectCandidate.malpracticeCount || candidateLogs.length) > 0 ? '#E74C3C' : '#2ECC71', fontSize: '1.1rem', marginTop: 2 }}>
                      {Math.max(activeInspectCandidate.malpracticeCount || 0, candidateLogs.length)}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#6b7280', fontSize: '0.78rem' }}>Time Remaining:</span>
                    <span style={{ display: 'block', fontFamily: 'monospace', fontWeight: 700, color: '#374151', fontSize: '0.95rem', marginTop: 2 }}>
                      {(() => {
                        // BUG-24: Only candidates actively IN_PROGRESS have a live countdown.
                        // Terminal or completed states (SUBMITTED, DISQUALIFIED, etc.) or NOT_STARTED show '—'.
                        if (activeInspectCandidate.status !== 'IN_PROGRESS') {
                          return '—';
                        }
                        const rem = getCandidateRemainingMs(activeInspectCandidate, now);
                        if (rem > 0) {
                          const mins = Math.floor(rem / 60000);
                          const secs = Math.floor((rem % 60000) / 1000);
                          return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
                        }
                        if (activeInspectCandidate.candidateEndTime) {
                          return '00m 00s (Time up)';
                        }
                        return '—';
                      })()}
                    </span>
                  </div>
                </div>

                {/* Malpractice Logs & Evidence Section */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1A2B3C', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                      <span>📸</span> Malpractice Violation History &amp; Proof Screenshots
                    </h4>
                    <span className="badge badge-secondary" style={{ fontSize: '0.72rem' }}>
                      {candidateLogs.length} {candidateLogs.length === 1 ? 'Incident' : 'Incidents'}
                    </span>
                  </div>

                  {loadingLogs ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>
                      <div className="spinner spinner-dark" style={{ width: 24, height: 24, margin: '0 auto 8px auto' }} />
                      Loading violation proof history...
                    </div>
                  ) : candidateLogs.length === 0 ? (
                    (activeInspectCandidate.malpracticeCount || 0) > 0 ? (
                      <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', color: '#b45309', padding: '16px', borderRadius: 8, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: '1.4rem' }}>⚠️</span>
                        <div>
                          <strong>Violations Recorded:</strong> {activeInspectCandidate.malpracticeCount} violation(s) registered for this candidate. Loading incident history...
                        </div>
                      </div>
                    ) : (
                      <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '16px', borderRadius: 8, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: '1.4rem' }}>✓</span>
                        <div>
                          <strong>Clean Record:</strong> No malpractice violations or suspicious events have been logged for this candidate.
                        </div>
                      </div>
                    )
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
                      {candidateLogs.map((log, index) => {
                        const isDisqualified = log.adminAction === 'DISQUALIFIED';
                        const isWarned = log.adminAction === 'WARNED';
                        const isUnreviewed = !log.adminReviewed || log.adminAction === 'NONE';

                        return (
                          <div
                            key={log._id || index}
                            style={{
                              background: '#f8fafc',
                              border: `1.5px solid ${isDisqualified ? '#fca5a5' : isWarned ? '#fcd34d' : '#cbd5e1'}`,
                              borderRadius: 8,
                              padding: 14,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 10,
                            }}
                          >
                            {/* Log Header Row */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span
                                  className={`badge ${
                                    log.violationType === 'PHONE_DETECTED' || log.violationType === 'MULTIPLE_FACES' || log.violationType === 'CAMERA_DISCONNECTED'
                                      ? 'badge-danger'
                                      : 'badge-warning'
                                  }`}
                                  style={{ fontWeight: 700, fontSize: '0.75rem', padding: '3px 8px' }}
                                >
                                  {log.violationType === 'PHONE_DETECTED' && '📱 Phone Detected'}
                                  {log.violationType === 'MULTIPLE_FACES' && '👥 Multiple Faces'}
                                  {log.violationType === 'NO_FACE_15MIN' && '👤 No Face (15+ min)'}
                                  {log.violationType === 'TAB_SWITCH' && '🔄 Tab Switch'}
                                  {log.violationType === 'FULLSCREEN_EXIT' && '⛶ Fullscreen Exit'}
                                  {log.violationType === 'CAMERA_DISCONNECTED' && '📷 Camera Disconnected'}
                                  {!['PHONE_DETECTED', 'MULTIPLE_FACES', 'NO_FACE_15MIN', 'TAB_SWITCH', 'FULLSCREEN_EXIT', 'CAMERA_DISCONNECTED'].includes(log.violationType) && (log.violationType || 'Violation')}
                                </span>
                                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                  🕒 {new Date(log.detectedAt).toLocaleTimeString()} · {new Date(log.detectedAt).toLocaleDateString()}
                                </span>
                              </div>

                              <div>
                                {isDisqualified && (
                                  <span className="badge badge-danger" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                                    🚫 Disqualified
                                  </span>
                                )}
                                {isWarned && (
                                  <span className="badge badge-warning" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                                    ⚠️ Warning Issued
                                  </span>
                                )}
                                {isUnreviewed && (
                                  <span className="badge badge-secondary" style={{ fontSize: '0.72rem', padding: '2px 8px', background: '#e2e8f0', color: '#475569' }}>
                                    ⏳ Unreviewed
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Camera Disconnect Specific Details */}
                            {log.violationType === 'CAMERA_DISCONNECTED' && (
                              <div style={{
                                background: log.reconnectAt ? '#ecfdf5' : '#fef2f2',
                                border: `1px solid ${log.reconnectAt ? '#a7f3d0' : '#fecaca'}`,
                                borderRadius: 6,
                                padding: '8px 12px',
                                fontSize: '0.8rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4,
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                  <span style={{ fontWeight: 700, color: log.reconnectAt ? '#065f46' : '#991b1b' }}>
                                    {log.reconnectAt ? '🟢 Resolved (Camera Reconnected & Face Verified)' : '🔴 Camera Disconnected — Opaque Overlay & Lock Active'}
                                  </span>
                                  {log.durationSeconds !== null && log.durationSeconds !== undefined && (
                                    <span style={{ fontWeight: 800, color: '#0f172a', background: log.reconnectAt ? '#d1fae5' : '#fee2e2', padding: '2px 8px', borderRadius: 4, fontSize: '0.78rem' }}>
                                      Duration: {log.durationSeconds}s {log.durationSeconds >= 60 ? `(${Math.floor(log.durationSeconds / 60)}m ${log.durationSeconds % 60}s)` : ''}
                                    </span>
                                  )}
                                </div>
                                <div style={{ color: '#475569', fontSize: '0.75rem' }}>
                                  Disconnected at: <strong>{new Date(log.disconnectAt || log.detectedAt).toLocaleTimeString()}</strong>
                                  {log.reconnectAt && (
                                    <span> · Reconnected at: <strong>{new Date(log.reconnectAt).toLocaleTimeString()}</strong></span>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Proof Screenshot Frame */}
                            {log.proofScreenshotUrl ? (
                              <div>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: 4 }}>
                                  Captured Proof Evidence:
                                </span>
                                <div
                                  style={{
                                    position: 'relative',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: 6,
                                    overflow: 'hidden',
                                    cursor: 'zoom-in',
                                    background: '#000',
                                    maxHeight: 180,
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                  }}
                                  onClick={() => setZoomScreenshotUrl(log.proofScreenshotUrl)}
                                  title="Click to zoom in full-resolution screenshot"
                                >
                                  <img
                                    src={log.proofScreenshotUrl}
                                    alt="Violation Proof"
                                    style={{ maxWidth: '100%', maxHeight: 180, objectFit: 'contain' }}
                                  />
                                  <div style={{
                                    position: 'absolute', bottom: 6, right: 8,
                                    background: 'rgba(0,0,0,0.7)', color: 'white',
                                    fontSize: '0.68rem', padding: '2px 8px', borderRadius: 4,
                                    fontWeight: 600,
                                  }}>
                                    🔍 Click to Enlarge
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div style={{ background: '#f1f5f9', padding: '8px 12px', borderRadius: 6, color: '#64748b', fontSize: '0.78rem' }}>
                                📷 No image frame captured for this event.
                              </div>
                            )}

                            {/* Review Action Buttons */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid #e2e8f0' }}>
                              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                {log.reviewedBy ? `Reviewed by ${log.reviewedBy.name || 'Admin'}` : 'Admin Review Action:'}
                              </span>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                  type="button"
                                  onClick={() => handleReviewMalpractice(log._id, 'WARNED')}
                                  className="btn btn-secondary"
                                  style={{
                                    padding: '3px 10px', fontSize: '0.72rem',
                                    color: '#d97706', borderColor: '#d97706',
                                    background: isWarned ? '#fef3c7' : 'transparent',
                                  }}
                                  disabled={isDisqualified}
                                >
                                  ⚠️ {isWarned ? 'Warned' : 'Issue Warning'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReviewMalpractice(log._id, 'DISQUALIFIED')}
                                  className="btn btn-danger"
                                  style={{
                                    padding: '3px 10px', fontSize: '0.72rem',
                                    background: isDisqualified ? '#dc2626' : undefined,
                                  }}
                                  disabled={isDisqualified}
                                >
                                  🚫 {isDisqualified ? 'Disqualified' : 'Disqualify'}
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Proctoring Decision Logs (FR-7.3, FR-7.4)
                </div>
                <button
                  type="button"
                  onClick={() => setInspectCandidate(null)}
                  className="btn btn-secondary"
                  style={{ padding: '6px 16px' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Zoom Screenshot Modal ── */}
        {zoomScreenshotUrl && (
          <div className="modal-backdrop" onClick={() => setZoomScreenshotUrl(null)} style={{ zIndex: 1200 }}>
            <div style={{ maxWidth: '90vw', maxHeight: '90vh', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
              <img
                src={zoomScreenshotUrl}
                alt="Enlarged Proof Frame"
                style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
              />
              <button
                onClick={() => setZoomScreenshotUrl(null)}
                style={{
                  position: 'absolute',
                  top: -12,
                  right: -12,
                  background: '#1A2B3C',
                  color: 'white',
                  border: '2px solid white',
                  borderRadius: '50%',
                  width: 32,
                  height: 32,
                  fontSize: '1rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
