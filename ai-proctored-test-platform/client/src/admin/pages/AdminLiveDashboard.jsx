// AdminLiveDashboard.jsx — Live Monitoring Dashboard & Seat Map
// Implements PRD Section 9.8, Section 10 (Exact Socket.io Events), Section 11.7 (FR-7.3 persistent malpractice counter, FR-7.4), Section 11.8 (FR-8.1, FR-8.2, FR-8.3), Section 13 (NFR: 200ms debounce, React.memo, react-window virtualization for >50 items), FEATURE-021
import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useParams, Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { List } from 'react-window';
import AdminNavbar from '../../shared/AdminNavbar';
import TestStatusBadge from '../../shared/TestStatusBadge';
import LoadingDots from '../../shared/LoadingDots';
import CandidateDetailEvaluationModal from '../../shared/CandidateDetailEvaluationModal';
import api from '../../services/apiClient';
import { useAuth } from '../../hooks/useAuthContext';
import useAdminFilterState from '../../hooks/useAdminFilterState';
import useScrollRestoration from '../../hooks/useScrollRestoration';
import {
  initSocket, disconnectSocket, emitAdminJoin,
  onDashboardUpdate, offDashboardUpdate,
  onSeatmapStatus, offSeatmapStatus,
  onMalpracticeAlert, offMalpracticeAlert,
  onMalpracticeEvidenceUpdated, offMalpracticeEvidenceUpdated,
  onCandidateSubmitted, offCandidateSubmitted,
  onRoomUpdated, offRoomUpdated,
  onTestEnded, offTestEnded,
  onLateJoinRequest, offLateJoinRequest,
  onLateJoinProcessed, offLateJoinProcessed,
  onRoomTentativeTime, offRoomTentativeTime,
} from '../../services/socketClient';

const DEFAULT_FILTERS = {
  room: 'ALL',
  search: '',
  status: 'ALL',
};

// Exact Section 14 colors
const STATUS_COLORS = {
  GREEN: '#2ECC71',
  YELLOW: '#F1C40F',
  RED: '#E74C3C',
  WHITE: '#e5e7eb',
};

// ── FEATURE-027: Live duration & session formatting helpers (matching AdminTestDetail) ──
const formatLiveDuration = (startDateStr, endDateStr) => {
  if (!startDateStr || !endDateStr) return null;
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const diffMs = end - start;
  if (diffMs <= 0 || isNaN(diffMs)) return null;
  const totalSeconds = Math.floor(diffMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'Hour' : 'Hours'}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'Minute' : 'Minutes'}`);
  if (parts.length > 0) return parts.join(' ');
  if (seconds > 0) return `${seconds} ${seconds === 1 ? 'Second' : 'Seconds'}`;
  return '< 1 Second';
};

// BUG-35 / UX-XX: Date-deduplication, day names, and exact time formatting helpers
const getDayName = (dateObj) => {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dateObj.getDay()];
};

const formatFullDate = (dateObj) => {
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  return `${day}/${month}/${year}`;
};

const formatTimeOnly = (dateObj) => {
  let hours = dateObj.getHours();
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
};

const isSameCalendarDay = (d1, d2) => {
  if (!d1 || !d2) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

const formatDateOnly = (dateObj) => {
  return formatFullDate(dateObj);
};

const formatCreationDateText = (dateInput) => {
  if (!dateInput) return '—';
  const dateObj = new Date(dateInput);
  if (isNaN(dateObj.getTime())) return '—';
  return `${getDayName(dateObj)}, ${formatFullDate(dateObj)} at ${formatTimeOnly(dateObj)}`;
};

const getLiveSessionText = (test) => {
  if (!test?.liveStartedAt) return null;

  const startDate = new Date(test.liveStartedAt);
  if (isNaN(startDate.getTime())) return null;

  const createdDate = test.createdAt ? new Date(test.createdAt) : null;
  const isLive = test.status === 'LIVE';
  const isEnded = test.status === 'ENDED';

  if (!isLive && !isEnded) return null;

  // Check if live start date is on a different calendar day than creation date
  const isDifferentDayFromCreation = createdDate && !isNaN(createdDate.getTime())
    ? !isSameCalendarDay(startDate, createdDate)
    : false;

  const differentDaySuffix = isDifferentDayFromCreation
    ? ` | ${getDayName(startDate)} | ${formatFullDate(startDate)}`
    : '';

  if (isEnded) {
    if (!test.endedAt) return null;
    const endDate = new Date(test.endedAt);
    if (isNaN(endDate.getTime())) return null;

    const sameDayLive = isSameCalendarDay(startDate, endDate);

    if (sameDayLive) {
      return `Live: ${formatTimeOnly(startDate)} – ${formatTimeOnly(endDate)}${differentDaySuffix}`;
    } else {
      return `Live: ${formatTimeOnly(startDate)} | ${getDayName(startDate)} | ${formatFullDate(startDate)} – ${formatTimeOnly(endDate)} | ${getDayName(endDate)} | ${formatFullDate(endDate)}`;
    }
  }

  if (isLive) {
    return `Live: ${formatTimeOnly(startDate)} – now${differentDaySuffix}`;
  }

  return null;
};

// ── Helper to check if a candidate has completed/submitted the test (FEATURE-024) ──
export const isCandidateSubmitted = (candidate, isTestEnded = false) => {
  if (!candidate) return false;
  const status = candidate.status;
  if (
    status === 'SUBMITTED' ||
    status === 'AUTO_SUBMITTED_TIME_UP' ||
    status === 'AUTO_SUBMITTED_DISQUALIFIED' ||
    status === 'DISQUALIFIED' ||
    Boolean(candidate.isDisqualified)
  ) {
    return true;
  }
  if (isTestEnded && candidate.candidateStartTime && status !== 'NOT_STARTED') {
    return true;
  }
  return false;
};

// ── Candidate Color Status Helper (BUG-44: GREEN = SUBMITTED, YELLOW = IN_PROGRESS, RED = DISQUALIFIED, WHITE = NOT_STARTED)
const getCandidateColorStatus = (candidate, isTestEnded = false) => {
  if (!candidate) return 'WHITE';
  if (candidate.status === 'DISQUALIFIED' || candidate.colorStatus === 'RED' || candidate.isDisqualified) {
    return 'RED';
  }
  if (isTestEnded) {
    // When test is ENDED, candidates who never started/joined remain NOT_STARTED (WHITE)
    if (
      candidate.status === 'NOT_STARTED' ||
      (!candidate.candidateStartTime &&
        !candidate.status &&
        (candidate.questionsAttempted === undefined || candidate.questionsAttempted === 0) &&
        (candidate.questionsCompleted === undefined || candidate.questionsCompleted === 0))
    ) {
      return 'WHITE';
    }
    // All other candidates who joined / in-progress / submitted show as SUBMITTED (GREEN)
    return 'GREEN';
  }
  if (candidate.status === 'SUBMITTED' || candidate.status === 'AUTO_SUBMITTED_TIME_UP' || candidate.colorStatus === 'GREEN') {
    return 'GREEN';
  }
  // BUG-83: A candidate is ONLY YELLOW/In Progress if they are actively IN_PROGRESS with a valid candidateStartTime
  if ((candidate.status === 'IN_PROGRESS' || candidate.colorStatus === 'YELLOW') && candidate.candidateStartTime) {
    return 'YELLOW';
  }
  return 'WHITE';
};

// ── Candidate Session Remaining Time Helper (Pure client-side countdown) ──────
const getCandidateRemainingMs = (candidate, currentNow, testDurationMinutes) => {
  if (!candidate) return 0;
  // BUG-24, BUG-78, BUG-83: Only candidates genuinely IN_PROGRESS with active candidateStartTime have active remaining time.
  // Terminal/completed states (SUBMITTED, DISQUALIFIED, etc.) or NOT_STARTED immediately yield 0.
  const isTerminal =
    candidate.status === 'SUBMITTED' ||
    candidate.status === 'AUTO_SUBMITTED' ||
    candidate.status === 'AUTO_SUBMITTED_TIME_UP' ||
    candidate.status === 'AUTO_SUBMITTED_DISQUALIFIED' ||
    candidate.status === 'DISQUALIFIED' ||
    candidate.isDisqualified ||
    Boolean(candidate.submittedAt);

  if (isTerminal || candidate.status === 'NOT_STARTED') {
    return 0;
  }

  const startRaw = candidate.candidateStartTime || candidate.startedAt;
  if (!startRaw) {
    return 0;
  }

  if (candidate.candidateEndTime) {
    const endMs = new Date(candidate.candidateEndTime).getTime();
    if (!isNaN(endMs) && endMs > 0) {
      return Math.max(0, endMs - currentNow);
    }
  }

  if (typeof testDurationMinutes === 'number' && testDurationMinutes > 0 && startRaw) {
    const startMs = new Date(startRaw).getTime();
    if (!isNaN(startMs) && startMs > 0) {
      const endMs = startMs + testDurationMinutes * 60 * 1000;
      return Math.max(0, endMs - currentNow);
    }
  }

  if (typeof candidate.timeRemaining === 'number' && candidate.timeRemaining > 0) {
    const elapsed = candidate.lastSyncedAt ? Math.max(0, currentNow - candidate.lastSyncedAt) : 0;
    return Math.max(0, candidate.timeRemaining - elapsed);
  }
  return 0;
};

// ── Format Remaining Time Helper ─────────────────────────────────────────────
const formatCandidateRemainingTime = (remainingMs) => {
  if (typeof remainingMs !== 'number' || isNaN(remainingMs) || remainingMs <= 0) {
    return '0s';
  }
  const totalSeconds = Math.floor(remainingMs / 1000);
  if (totalSeconds <= 0) {
    return '0s';
  }
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${mins < 10 ? '0' : ''}${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  }
  return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
};

// ── Candidate Inspection Time Info (BUG/UX-XX: Time Remaining during LIVE, Time Spent after completion) ──
const getCandidateInspectionTimeInfo = (candidate, currentNow, isTestEnded, testDurationMinutes) => {
  if (!candidate) {
    return { label: 'Time Spent:', value: '—' };
  }

  const isDisqualified = candidate.status === 'DISQUALIFIED' || candidate.isDisqualified || candidate.colorStatus === 'RED';
  const isSubmitted =
    candidate.status === 'SUBMITTED' ||
    candidate.status === 'AUTO_SUBMITTED' ||
    candidate.status === 'AUTO_SUBMITTED_TIME_UP' ||
    candidate.status === 'AUTO_SUBMITTED_DISQUALIFIED' ||
    Boolean(candidate.submittedAt) ||
    candidate.colorStatus === 'GREEN';

  // 1. If candidate never started test (strictly check candidateStartTime / startedAt)
  const startRaw = candidate.candidateStartTime || candidate.startedAt;
  const hasStarted = Boolean(startRaw);

  if (candidate.status === 'NOT_STARTED' || (!hasStarted && !isSubmitted && !isDisqualified)) {
    return { label: 'Time Spent:', value: '—' };
  }

  // 2. If test has ended OR candidate already submitted OR candidate is disqualified -> Show "Time Spent"
  if (isTestEnded || isSubmitted || isDisqualified) {
    return {
      label: 'Time Spent:',
      value: getCandidateTimeSpent(candidate, currentNow, isTestEnded),
    };
  }

  // 3. Candidate is actively attempting during a LIVE test -> Show "Time Remaining" ONLY IF candidate has actually started
  if (hasStarted && (candidate.status === 'IN_PROGRESS' || candidate.colorStatus === 'YELLOW')) {
    const remainingMs = getCandidateRemainingMs(candidate, currentNow, testDurationMinutes);
    return {
      label: 'Time Remaining:',
      value: formatCandidateRemainingTime(remainingMs),
    };
  }

  return {
    label: 'Time Spent:',
    value: getCandidateTimeSpent(candidate, currentNow, isTestEnded),
  };
};

// ── Candidate Session Time Spent Helper (Actual Participation Duration) ──────
const getCandidateTimeSpent = (candidate, currentNow, isTestEnded) => {
  if (!candidate) return '—';

  const isDisqualified = candidate.status === 'DISQUALIFIED' || candidate.isDisqualified || candidate.colorStatus === 'RED';
  const isSubmitted =
    candidate.status === 'SUBMITTED' ||
    candidate.status === 'AUTO_SUBMITTED' ||
    candidate.status === 'AUTO_SUBMITTED_TIME_UP' ||
    candidate.status === 'AUTO_SUBMITTED_DISQUALIFIED' ||
    candidate.colorStatus === 'GREEN';

  // 1. If candidate never started test
  if (candidate.status === 'NOT_STARTED' || (!candidate.candidateStartTime && !candidate.startedAt && !isSubmitted && !isDisqualified)) {
    return '—';
  }

  // 2. Resolve session start timestamp
  const startRaw = candidate.candidateStartTime || candidate.startedAt || candidate.sessionStartTime;
  if (!startRaw) {
    return 'Unavailable';
  }
  const startTime = new Date(startRaw).getTime();
  if (isNaN(startTime) || startTime <= 0) {
    return 'Unavailable';
  }

  // 3. Resolve session end timestamp
  let endTime;
  if (isSubmitted || candidate.submittedAt) {
    const endRaw = candidate.submittedAt || candidate.submissionTime || candidate.candidateEndTime;
    endTime = endRaw ? new Date(endRaw).getTime() : NaN;
  } else if (isDisqualified) {
    const endRaw = candidate.disqualifiedAt || candidate.submittedAt || candidate.candidateEndTime || candidate.lastMalpracticeAt;
    endTime = endRaw ? new Date(endRaw).getTime() : (candidate.candidateEndTime ? new Date(candidate.candidateEndTime).getTime() : currentNow);
  } else if (candidate.status === 'IN_PROGRESS' || Boolean(candidate.candidateStartTime)) {
    if (isTestEnded) {
      const endRaw = candidate.submittedAt || candidate.candidateEndTime;
      endTime = endRaw ? Math.min(new Date(endRaw).getTime(), currentNow) : currentNow;
    } else {
      endTime = currentNow;
      if (candidate.candidateEndTime) {
        const maxEnd = new Date(candidate.candidateEndTime).getTime();
        if (!isNaN(maxEnd) && endTime > maxEnd) {
          endTime = maxEnd;
        }
      }
    }
  } else if (isTestEnded) {
    const endRaw = candidate.submittedAt || candidate.candidateEndTime;
    endTime = endRaw ? new Date(endRaw).getTime() : currentNow;
  } else {
    endTime = currentNow;
  }

  if (isNaN(endTime) || endTime <= 0) {
    return 'Unavailable';
  }

  const durationMs = Math.max(0, endTime - startTime);
  if (isNaN(durationMs)) {
    return 'Unavailable';
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${mins < 10 ? '0' : ''}${mins}m`;
  }
  return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
};

// ── FEATURE-021: Candidate Inspection Timeline Helpers ───────────────────────
const formatInspectTimestamp = (dateInput) => {
  if (!dateInput) return 'Unavailable';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'Unavailable';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
};

const getInspectRoomJoinedText = (candidate) => {
  if (!candidate) return 'Unavailable';
  const rawJoin = candidate.roomJoinedAt || candidate.joinedAt || candidate.candidateJoinedAt;
  const rawCreatedAt = candidate.createdAt;
  const rawStart = candidate.testStartedAt || candidate.candidateStartTime || candidate.startedAt;

  let resolvedJoin = rawJoin || rawCreatedAt || null;
  if (rawJoin && rawCreatedAt) {
    const dJoin = new Date(rawJoin);
    const dCreated = new Date(rawCreatedAt);
    if (!isNaN(dJoin.getTime()) && !isNaN(dCreated.getTime())) {
      resolvedJoin = dJoin.getTime() <= dCreated.getTime() ? rawJoin : rawCreatedAt;
    }
  }

  // BUG-022 Chronological validation: Room Joined must not be after Test Start
  if (resolvedJoin && rawStart) {
    const dJoin = new Date(resolvedJoin);
    const dStart = new Date(rawStart);
    if (!isNaN(dJoin.getTime()) && !isNaN(dStart.getTime()) && dJoin.getTime() > dStart.getTime()) {
      resolvedJoin = (rawCreatedAt && new Date(rawCreatedAt).getTime() <= dStart.getTime()) ? rawCreatedAt : rawStart;
    }
  }

  if (!resolvedJoin) return 'Unavailable';
  return formatInspectTimestamp(resolvedJoin);
};

const getInspectTestStartText = (candidate) => {
  if (!candidate) return 'Unavailable';
  const raw = candidate.testStartedAt || candidate.candidateStartTime || candidate.startedAt;
  const isStarted = Boolean(raw);
  if (candidate.status === 'NOT_STARTED' || (!isStarted && candidate.status !== 'SUBMITTED' && candidate.status !== 'IN_PROGRESS')) {
    return 'Not Started';
  }
  if (!raw) return 'Unavailable';
  return formatInspectTimestamp(raw);
};

const getInspectTestEndText = (candidate) => {
  if (!candidate) return 'Unavailable';
  const startRaw = candidate.testStartedAt || candidate.candidateStartTime || candidate.startedAt;
  const isStarted = Boolean(startRaw);

  if (candidate.status === 'NOT_STARTED' || (!isStarted && candidate.status !== 'SUBMITTED' && candidate.status !== 'IN_PROGRESS')) {
    return '—';
  }

  const isSubmitted =
    candidate.status === 'SUBMITTED' ||
    candidate.status === 'AUTO_SUBMITTED' ||
    candidate.status === 'AUTO_SUBMITTED_TIME_UP' ||
    candidate.status === 'AUTO_SUBMITTED_DISQUALIFIED' ||
    Boolean(candidate.submittedAt) ||
    candidate.colorStatus === 'GREEN';

  const isDisqualified = candidate.status === 'DISQUALIFIED' || candidate.isDisqualified || candidate.colorStatus === 'RED';

  if (isSubmitted || candidate.submittedAt || candidate.testEndedAt) {
    const raw = candidate.testEndedAt || candidate.submittedAt || candidate.candidateEndTime;
    if (!raw) return 'Unavailable';
    return formatInspectTimestamp(raw);
  }

  if (isDisqualified) {
    const raw = candidate.testEndedAt || candidate.submittedAt || candidate.disqualifiedAt || candidate.candidateEndTime || candidate.lastMalpracticeAt;
    if (!raw) return 'Unavailable';
    return formatInspectTimestamp(raw);
  }

  if (candidate.status === 'IN_PROGRESS' || isStarted) {
    return 'In Progress';
  }

  return '—';
};

// ── Candidate Status Badge Renderer for Proctoring Roster (BUG-018) ───────────
const renderCandidateStatusBadge = (candidate, isCandidateInProgress, colorStatus, isTestEnded) => {
  let statusKey = 'NOT_STARTED';
  let label = 'NOT STARTED';
  let bg = 'rgba(100, 116, 139, 0.14)';
  let color = 'var(--color-navy, #334155)';
  let border = '1px solid rgba(100, 116, 139, 0.35)';

  if (candidate.status === 'DISQUALIFIED' || candidate.isDisqualified || colorStatus === 'RED') {
    statusKey = 'DISQUALIFIED';
    label = 'DISQUALIFIED';
    bg = 'rgba(239, 68, 68, 0.14)';
    color = '#dc2626';
    border = '1px solid rgba(239, 68, 68, 0.4)';
  } else if (candidate.status === 'AUTO_SUBMITTED_TIME_UP' || candidate.status === 'AUTO_SUBMITTED') {
    statusKey = 'AUTO_SUBMITTED';
    label = 'AUTO SUBMITTED';
    bg = 'rgba(2, 132, 199, 0.14)';
    color = '#0284c7';
    border = '1px solid rgba(2, 132, 199, 0.4)';
  } else if (candidate.status === 'SUBMITTED' || colorStatus === 'GREEN' || (isTestEnded && candidate.candidateStartTime)) {
    statusKey = 'SUBMITTED';
    label = 'SUBMITTED';
    bg = 'rgba(16, 185, 129, 0.14)';
    color = '#059669';
    border = '1px solid rgba(16, 185, 129, 0.4)';
  } else if (candidate.status === 'IN_PROGRESS' || isCandidateInProgress || colorStatus === 'YELLOW') {
    statusKey = 'IN_PROGRESS';
    label = 'IN PROGRESS';
    bg = 'rgba(245, 158, 11, 0.14)';
    color = '#b45309';
    border = '1px solid rgba(245, 158, 11, 0.4)';
  } else {
    statusKey = 'NOT_STARTED';
    label = 'NOT STARTED';
    bg = 'rgba(100, 116, 139, 0.14)';
    color = 'var(--color-navy, #334155)';
    border = '1px solid rgba(100, 116, 139, 0.35)';
  }

  return (
    <span
      className={`badge status-badge-${statusKey.toLowerCase()}`}
      style={{
        background: bg,
        color,
        border,
        fontSize: '0.72rem',
        fontWeight: 700,
        padding: '3px 8px',
        borderRadius: 4,
        display: 'inline-flex',
        alignItems: 'center',
        letterSpacing: '0.3px',
      }}
    >
      {label}
    </span>
  );
};

// ── Memoized Seat Tile (FR-7.3: Persistent Malpractice counter beside name) ────
const SeatTile = memo(({ candidate, roomName, onClick, now, isTestEnded }) => {
  const isCandidateInProgress = !isTestEnded && candidate.status === 'IN_PROGRESS' && Boolean(candidate.candidateStartTime);
  const colorStatus = getCandidateColorStatus(candidate, isTestEnded);
  const color = STATUS_COLORS[colorStatus];
  const isWhite = colorStatus === 'WHITE';
  const isYellowDot = !isTestEnded && color === STATUS_COLORS.YELLOW;
  const malpracticeCount = candidate.malpracticeCount || 0;

  const remainingMs = getCandidateRemainingMs(candidate, now);
  const formattedTimer = useMemo(() => {
    if (candidate.status === 'DISQUALIFIED' || candidate.isDisqualified || candidate.colorStatus === 'RED') {
      return 'Disqualified';
    }
    if (isTestEnded) {
      if (candidate.status === 'NOT_STARTED' || (!candidate.candidateStartTime && (candidate.colorStatus === 'WHITE' || !candidate.colorStatus))) {
        return 'Awaiting attempt';
      }
      return 'Submitted';
    }
    if (candidate.status === 'SUBMITTED' || candidate.status === 'AUTO_SUBMITTED_TIME_UP') {
      return 'Submitted';
    }
    if (!candidate.candidateStartTime || candidate.status === 'NOT_STARTED' || (!isCandidateInProgress && (candidate.colorStatus === 'WHITE' || !candidate.colorStatus))) {
      return 'Awaiting attempt';
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
    return isCandidateInProgress ? 'In Progress' : 'Awaiting attempt';
  }, [candidate.status, candidate.candidateStartTime, candidate.candidateEndTime, candidate.colorStatus, candidate.isDisqualified, remainingMs, isCandidateInProgress, isTestEnded]);

  return (
    <div
      onClick={() => onClick(candidate)}
      style={{
        background: isWhite ? 'var(--color-bg-card)' : `${color}18`,
        border: `2px solid ${isWhite ? 'var(--color-seat-not-started-border, #cbd5e1)' : color}`,
        borderRadius: 10,
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'all 180ms ease-in-out',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 115,
        boxShadow: isWhite ? '0 2px 6px rgba(0,0,0,0.06)' : `0 2px 8px ${color}25`,
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
              fontSize: '0.88rem',
              fontWeight: 700,
              color: 'var(--color-navy)',
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
              backgroundColor: malpracticeCount > 0 ? '#E74C3C' : 'var(--color-bg-subtle, #f1f5f9)',
              color: malpracticeCount > 0 ? '#ffffff' : 'var(--color-navy, #334155)',
              border: malpracticeCount > 0 ? 'none' : '1px solid var(--color-border, #cbd5e1)',
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
            border: isWhite ? '1.5px solid var(--color-seat-not-started-border, #cbd5e1)' : `1px solid ${color}`,
            display: 'inline-block',
            boxShadow: isWhite ? 'none' : `0 0 6px ${color}`,
            flexShrink: 0,
            transformOrigin: 'center',
            animation: isYellowDot ? 'seatTileDotPulse 1.8s ease-in-out infinite' : 'none',
            willChange: isYellowDot ? 'opacity, transform' : 'auto',
          }}
          title={`Status: ${isTestEnded ? (colorStatus === 'RED' ? 'DISQUALIFIED' : colorStatus === 'WHITE' ? 'NOT_STARTED' : 'SUBMITTED') : (candidate.status || (isCandidateInProgress ? 'IN_PROGRESS' : 'NOT_STARTED'))}`}
        />
      </div>

      {/* Room and progress */}
      <div style={{ margin: '6px 0', fontSize: '0.78rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, color: 'var(--color-text-muted, #475569)' }}>{roomName || candidate.roomName || 'Room'}</span>
          {(candidate.assignedQuestionSetName || candidate.assignedSetIndex) && (
            <span
              style={{
                fontSize: '0.68rem',
                padding: '1px 6px',
                fontWeight: 700,
                backgroundColor: 'rgba(99, 102, 241, 0.12)',
                color: '#4338ca',
                border: '1px solid rgba(99, 102, 241, 0.35)',
                borderRadius: 4,
                whiteSpace: 'nowrap',
                maxWidth: 90,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={`Assigned Question Set: ${candidate.assignedQuestionSetName || `Set ${candidate.assignedSetIndex}`}`}
            >
              🎲 {candidate.assignedSetIndex ? `Set ${candidate.assignedSetIndex}` : candidate.assignedQuestionSetName}
            </span>
          )}
        </div>
        <div style={{ fontWeight: 700, color: 'var(--color-navy)', marginTop: 3, fontSize: '0.82rem' }}>
          {candidate.status === 'SUBMITTED' || candidate.status === 'AUTO_SUBMITTED_TIME_UP' || (isTestEnded && candidate.candidateStartTime)
            ? `${candidate.questionsCompleted ?? 0} Qs Solved`
            : candidate.status === 'NOT_STARTED' || (!candidate.candidateStartTime && !isCandidateInProgress)
              ? 'Not started'
              : isCandidateInProgress
                ? `Attempted ${candidate.questionsAttempted ?? 0}/${candidate.totalQuestions || 5}`
                : `${candidate.questionsCompleted ?? 0} Qs Solved`}
        </div>
      </div>

      {/* Bottom Footer: Live Countdown Timer / Status (BUG-32: redundant color label removed) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', marginTop: 4 }}>
        <span style={{
          color: colorStatus === 'GREEN' ? '#059669' : colorStatus === 'YELLOW' ? '#b45309' : colorStatus === 'RED' ? '#dc2626' : 'var(--color-text-muted, #64748b)',
          fontFamily: 'monospace',
          fontWeight: 700
        }}>
          {formattedTimer}
        </span>
      </div>
    </div>
  );
});

// ── Memoized Table Row Component (Persistent Malpractice counter beside name, FEATURE-007: Highlight inspected candidate, FEATURE-024: View Result) ──
const CandidateRowItem = memo(({ candidate, roomName, onSelect, onWarn, onDisqualify, onOpenEvaluationDetail, style, now, isTestEnded, isActive }) => {
  const isCandidateInProgress = !isTestEnded && candidate.status === 'IN_PROGRESS' && Boolean(candidate.candidateStartTime);
  const colorStatus = getCandidateColorStatus(candidate, isTestEnded);
  const color = STATUS_COLORS[colorStatus];
  const isWhite = colorStatus === 'WHITE';
  const isYellowDot = !isTestEnded && colorStatus === 'YELLOW';
  const malpracticeCount = candidate.malpracticeCount || 0;

  const remainingMs = getCandidateRemainingMs(candidate, now);
  const formattedTimer = useMemo(() => {
    if (candidate.status === 'DISQUALIFIED' || candidate.isDisqualified || candidate.colorStatus === 'RED') {
      return 'Disqualified';
    }
    if (isTestEnded) {
      if (candidate.status === 'NOT_STARTED' || (!candidate.candidateStartTime && (candidate.colorStatus === 'WHITE' || !candidate.colorStatus))) {
        return 'Not started';
      }
      return 'Test Ended';
    }
    if (candidate.status === 'SUBMITTED' || candidate.status === 'AUTO_SUBMITTED_TIME_UP') {
      return 'Submitted';
    }
    if (!candidate.candidateStartTime || candidate.status === 'NOT_STARTED' || (!isCandidateInProgress && (candidate.colorStatus === 'WHITE' || !candidate.colorStatus))) {
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
  }, [candidate.status, candidate.candidateStartTime, candidate.candidateEndTime, candidate.colorStatus, candidate.isDisqualified, remainingMs, isCandidateInProgress, isTestEnded]);

  return (
    <div
      id={`candidate-row-${candidate.candidateId || candidate._id}`}
      style={{
        ...style,
        display: 'grid',
        gridTemplateColumns: '2fr 1.1fr 1.1fr 1fr 1.1fr 1.1fr 2fr',
        alignItems: 'center',
        padding: '8px 16px',
        borderBottom: '1px solid var(--color-border)',
        borderLeft: isActive ? '4px solid var(--color-primary, #0e7c86)' : '4px solid transparent',
        fontSize: '0.85rem',
        background: isActive ? 'var(--color-bg-subtle, rgba(14, 124, 134, 0.08))' : 'var(--color-bg-card)',
        opacity: 1,
        transition: 'background 0.2s ease, border-left 0.2s ease',
      }}
    >
      {/* Candidate Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
        <span
          className={isYellowDot ? 'seat-tile-dot-pulse' : ''}
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: isWhite ? '#94A3B8' : color,
            border: isWhite ? '1.5px solid var(--color-border)' : `1px solid ${color}`,
            flexShrink: 0,
            boxShadow: isCandidateInProgress ? `0 0 6px ${color}` : 'none',
            transformOrigin: 'center',
            animation: isYellowDot ? 'seatTileDotPulse 1.8s ease-in-out infinite' : 'none',
            willChange: isYellowDot ? 'opacity, transform' : 'auto',
          }}
        />
        <strong style={{ color: 'var(--color-navy)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {candidate.name || candidate.candidateName || 'Candidate'}
        </strong>
      </div>

      {/* Room and Question Set Grouping (BUG-018) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong style={{ color: 'var(--color-navy)', fontSize: '0.84rem' }}>
          {roomName || candidate.roomName || 'Room'}
        </strong>
        {(candidate.assignedQuestionSetName || candidate.assignedSetIndex) && (
          <span
            style={{
              fontSize: '0.7rem',
              padding: '2px 6px',
              fontWeight: 700,
              backgroundColor: 'rgba(99, 102, 241, 0.12)',
              color: '#4338ca',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: 4,
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
            }}
            title={`Assigned Question Set: ${candidate.assignedQuestionSetName || `Set ${candidate.assignedSetIndex}`}`}
          >
            🎲 {candidate.assignedSetIndex ? `Set ${candidate.assignedSetIndex}` : candidate.assignedQuestionSetName}
          </span>
        )}
      </div>

      {/* Candidate Status Badge (BUG-018) */}
      <div>
        {renderCandidateStatusBadge(candidate, isCandidateInProgress, colorStatus, isTestEnded)}
      </div>

      <div style={{ color: 'var(--color-navy)', fontWeight: 600 }}>
        {candidate.status === 'NOT_STARTED' || (!candidate.candidateStartTime && isTestEnded && candidate.questionsCompleted === undefined && candidate.questionsAttempted === undefined)
          ? '—'
          : isTestEnded || candidate.status === 'SUBMITTED' || candidate.status === 'AUTO_SUBMITTED_TIME_UP'
            ? `${candidate.questionsCompleted ?? 0} Qs Solved`
            : candidate.status === 'IN_PROGRESS' || isCandidateInProgress
              ? `Attempted ${candidate.questionsAttempted ?? 0}/${candidate.totalQuestions || 5}`
              : `${candidate.questionsCompleted ?? 0} Qs Solved`}
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
          <span style={{ color: '#059669', fontWeight: 600, fontSize: '0.78rem' }}>✓ Clean (0)</span>
        )}
      </div>

      {/* Countdown timer / Status for roster (BUG-018: High contrast & readability) */}
      <div style={{
        color: formattedTimer === 'Not started'
          ? 'var(--color-navy, #334155)'
          : formattedTimer === 'Submitted'
            ? '#059669'
            : formattedTimer === 'Disqualified'
              ? '#dc2626'
              : 'var(--color-navy, #0f172a)',
        fontFamily: formattedTimer.includes('m') || formattedTimer.includes('s') ? 'monospace' : 'inherit',
        fontSize: '0.82rem',
        fontWeight: 600,
      }}>
        {formattedTimer}
      </div>

      {/* Action Buttons (BUG/UX-XX: High contrast in light & dark modes) */}
      <div style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
        <button
          onClick={() => onSelect(candidate)}
          className="btn roster-action-btn roster-action-btn-inspect"
          title="Inspect Candidate Live Status & Evidence"
        >
          Inspect
        </button>
        {/* FEATURE-024: View Result button in roster Actions column */}
        <button
          onClick={() => onOpenEvaluationDetail && onOpenEvaluationDetail(candidate)}
          disabled={!isCandidateSubmitted(candidate, isTestEnded)}
          className={`btn roster-action-btn ${
            isCandidateSubmitted(candidate, isTestEnded)
              ? 'roster-action-btn-result-enabled'
              : 'roster-action-btn-disabled'
          }`}
          title={
            isCandidateSubmitted(candidate, isTestEnded)
              ? 'View detailed per-question test evaluation & code'
              : 'Candidate has not yet submitted the test'
          }
        >
          View Result
        </button>
        {candidate.status !== 'DISQUALIFIED' && !candidate.isDisqualified && colorStatus !== 'RED' && (
          <>
            {!isTestEnded && (
              <button
                onClick={() => onWarn(candidate)}
                disabled={malpracticeCount < 1}
                className={`btn roster-action-btn ${
                  malpracticeCount > 0
                    ? 'roster-action-btn-warn-enabled'
                    : 'roster-action-btn-disabled'
                }`}
                title={malpracticeCount > 0 ? 'Send Warning' : 'No violations recorded'}
              >
                Warn
              </button>
            )}
            <button
              onClick={() => onDisqualify(candidate)}
              className="btn roster-action-btn roster-action-btn-danger"
              title={isTestEnded ? 'Retroactively Disqualify Candidate' : 'Disqualify Candidate'}
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
  const { testId, candidateId: routeCandidateId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkCandidateId = routeCandidateId || searchParams.get('candidateId');
  const deepLinkRoomId = searchParams.get('roomId');
  const { user } = useAuth();

  const [test, setTest] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // FEATURE-021: Preserved Room, Search query, and Status Filter via URL parameters
  const [filters, updateFilter] = useAdminFilterState(DEFAULT_FILTERS);
  const selectedRoomId = filters.room;
  const searchQuery = filters.search;
  const filterStatus = filters.status;
  const setSelectedRoomId = (r) => updateFilter('room', r);
  const setSearchQuery = (s) => updateFilter('search', s);
  const setFilterStatus = (st) => updateFilter('status', st);

  // FEATURE-021: Audio Voice Announcement Toggle (FR-8.3) - persisted in localStorage per user direction
  const [voiceEnabled, setVoiceEnabledState] = useState(() => {
    try {
      const stored = localStorage.getItem('admin_voice_announcements_enabled');
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });

  const setVoiceEnabled = useCallback((valOrFn) => {
    setVoiceEnabledState((prev) => {
      const next = typeof valOrFn === 'function' ? valOrFn(prev) : valOrFn;
      try {
        localStorage.setItem('admin_voice_announcements_enabled', String(next));
      } catch (_) { }
      return next;
    });
  }, []);

  // FEATURE-021: Preserved scroll position for Live Monitor / Summary
  useScrollRestoration({
    loading,
    key: `live_${selectedRoomId}_${filterStatus}`,
    dependencies: [selectedRoomId, filterStatus, searchQuery],
  });

  // Candidate Data Store: candidateId -> candidateObj
  const [candidatesMap, setCandidatesMap] = useState({});

  // Late Join Requests Queue (Requirements 4 & 5)
  const [lateJoinRequests, setLateJoinRequests] = useState([]);

  // Live Alerts Queue (FR-7.3)
  const [activeAlert, setActiveAlert] = useState(null);
  const [alertQueue, setAlertQueue] = useState([]);
  const activeAlertRef = useRef(activeAlert);

  useEffect(() => {
    activeAlertRef.current = activeAlert;
  }, [activeAlert]);

  // Track recent alerts and dismissed alerts to prevent duplicate modals and spam toasts
  const recentAlertsRef = useRef(new Map()); // key -> { timestamp, alertData }
  const recentDismissedAlertsRef = useRef(new Map()); // key -> timestamp
  const pendingDelayedEvidenceRef = useRef(new Map()); // key -> { timeoutId, alertData }

  const closeActiveAlert = useCallback(() => {
    if (activeAlertRef.current) {
      const current = activeAlertRef.current;
      const key = current.malpracticeLogId
        ? String(current.malpracticeLogId)
        : `${current.candidateId}_${current.violationType}`;
      recentDismissedAlertsRef.current.set(key, Date.now());
      if (current.candidateId) {
        recentDismissedAlertsRef.current.set(`${current.candidateId}_${current.violationType}`, Date.now());
      }
    }
    setActiveAlert(null);
  }, []);

  // Selected candidate for inspect drawer
  const [inspectCandidate, setInspectCandidate] = useState(null);
  const [candidateLogs, setCandidateLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [hasMoreLogs, setHasMoreLogs] = useState(false);
  const [loadingMoreLogs, setLoadingMoreLogs] = useState(false);
  const [totalLogsCount, setTotalLogsCount] = useState(0);
  const inspectCandidateRef = useRef(inspectCandidate);

  useEffect(() => {
    inspectCandidateRef.current = inspectCandidate;
  }, [inspectCandidate]);

  // FEATURE-024: Candidate Detail Evaluation Modal State & Handlers
  const [evaluationDetailCandidate, setEvaluationDetailCandidate] = useState(null);

  const handleOpenEvaluationDetail = useCallback((cand) => {
    if (!cand) return;
    setEvaluationDetailCandidate(cand);
  }, []);

  const handleCloseEvaluationDetail = useCallback(() => {
    setEvaluationDetailCandidate(null);
  }, []);

  // BUG-24: Derive fresh candidate state from candidatesMap to guarantee real-time updates while modal is open
  const activeInspectCandidate = useMemo(() => {
    if (!inspectCandidate) return null;
    const cid = inspectCandidate.candidateId || inspectCandidate.id || inspectCandidate._id;
    const fromMap = cid ? candidatesMap[cid] : null;
    return fromMap ? { ...inspectCandidate, ...fromMap } : inspectCandidate;
  }, [inspectCandidate, candidatesMap]);

  // BUG-91: Target candidate ID stabilized to avoid re-fetch loops on live status updates
  const targetInspectCandidateId = inspectCandidate?.candidateId || inspectCandidate?.id || inspectCandidate?._id;

  // FEATURE-007: Track handled deep-links and explicitly dismissed candidates to prevent modal reopening loops
  const deepLinkHandledRef = useRef(null);
  const dismissedCandidateIdRef = useRef(null);

  // FEATURE-007: Open Candidate Inspection modal and sync candidateId in URL
  const handleOpenInspectCandidate = useCallback((cand) => {
    if (!cand) return;
    const cid = cand.candidateId || cand.id || cand._id;
    if (cid) {
      dismissedCandidateIdRef.current = null;
      deepLinkHandledRef.current = String(cid);
    }
    const isStarted = Boolean(cand.candidateStartTime || cand.startedAt || cand.testStartedAt);
    const isSubmitted = cand.status === 'SUBMITTED' || cand.status === 'AUTO_SUBMITTED' || cand.status === 'AUTO_SUBMITTED_TIME_UP' || Boolean(cand.submittedAt) || Boolean(cand.testEndedAt) || cand.colorStatus === 'GREEN';
    const isDisqualified = cand.status === 'DISQUALIFIED' || cand.isDisqualified || cand.colorStatus === 'RED';
    const status = isDisqualified ? 'DISQUALIFIED' : isSubmitted ? (cand.status || 'SUBMITTED') : isStarted ? (cand.status || 'IN_PROGRESS') : 'NOT_STARTED';
    const normalized = {
      ...cand,
      candidateId: cid,
      status,
      candidateStartTime: isStarted ? (cand.candidateStartTime || cand.startedAt || cand.testStartedAt) : null,
      testStartedAt: isStarted ? (cand.testStartedAt || cand.candidateStartTime || cand.startedAt) : null,
      candidateEndTime: isStarted ? (cand.candidateEndTime || cand.testEndedAt) : null,
      submittedAt: cand.submittedAt || cand.testEndedAt || null,
      testEndedAt: cand.testEndedAt || cand.submittedAt || null,
      roomJoinedAt: cand.roomJoinedAt || cand.joinedAt || cand.candidateJoinedAt || null,
    };
    setInspectCandidate(normalized);
    if (cid && !routeCandidateId) {
      const nextParams = new URLSearchParams(searchParams);
      if (nextParams.get('candidateId') !== String(cid)) {
        nextParams.set('candidateId', String(cid));
        if (cand.roomId) nextParams.set('roomId', String(cand.roomId));
        setSearchParams(nextParams, { replace: true });
      }
    }
  }, [routeCandidateId, searchParams, setSearchParams]);

  // FEATURE-007 / Return-to-source: Close Candidate Inspection modal and return to origin if opened from room candidates
  const handleCloseInspectModal = useCallback(() => {
    const cid = inspectCandidate?.candidateId || inspectCandidate?.id || inspectCandidate?._id || deepLinkCandidateId;
    if (cid) {
      dismissedCandidateIdRef.current = String(cid);
    }
    setInspectCandidate(null);

    const fromRoom = searchParams.get('from') === 'roomCandidates' || location.state?.fromRoomCandidates;
    const returnRoomId = searchParams.get('roomId') || location.state?.roomId;
    const searchQ = searchParams.get('q') || location.state?.q;

    if (fromRoom) {
      if (returnRoomId) {
        navigate(`/admin/tests/${testId}?openRoomId=${returnRoomId}${searchQ ? `&q=${encodeURIComponent(searchQ)}` : ''}`);
      } else {
        navigate(`/admin/tests/${testId}`);
      }
      return;
    }

    if (routeCandidateId) {
      navigate(`/admin/tests/${testId}/live`, { replace: true });
    } else if (searchParams.has('candidateId') || searchParams.has('roomId')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('candidateId');
      nextParams.delete('roomId');
      nextParams.delete('from');
      nextParams.delete('q');
      setSearchParams(nextParams, { replace: true });
    }
  }, [inspectCandidate, deepLinkCandidateId, routeCandidateId, searchParams, setSearchParams, navigate, testId, location]);

  // FEATURE-007: Automatically open candidate inspection when navigated via deep link
  useEffect(() => {
    if (!deepLinkCandidateId) {
      deepLinkHandledRef.current = null;
      dismissedCandidateIdRef.current = null;
      return;
    }
    if (loading) return;

    // Prevent re-opening if candidate was explicitly closed/dismissed by admin
    if (dismissedCandidateIdRef.current === String(deepLinkCandidateId)) return;

    // Prevent repeated re-opening if this deep link was already handled
    if (deepLinkHandledRef.current === String(deepLinkCandidateId)) return;

    const targetCandidate = candidatesMap[deepLinkCandidateId];
    if (targetCandidate) {
      deepLinkHandledRef.current = String(deepLinkCandidateId);
      setInspectCandidate(targetCandidate);
      return;
    }

    // Fallback if not yet in candidatesMap (e.g. joined room but no submissions yet)
    if (deepLinkRoomId) {
      api.getRoomCandidates(deepLinkRoomId)
        .then((res) => {
          const matched = (res.data?.candidates || []).find(
            (c) => (c.candidateId || c._id)?.toString() === deepLinkCandidateId.toString()
          );
          if (matched) {
            const enriched = {
              ...matched,
              candidateId: deepLinkCandidateId,
              roomId: deepLinkRoomId,
            };
            setCandidatesMap((prev) => ({
              ...prev,
              [deepLinkCandidateId]: enriched,
            }));
            deepLinkHandledRef.current = String(deepLinkCandidateId);
            setInspectCandidate(enriched);
          } else {
            deepLinkHandledRef.current = String(deepLinkCandidateId);
            toast.error('Candidate record not found.');
          }
        })
        .catch(() => {
          deepLinkHandledRef.current = String(deepLinkCandidateId);
          toast.error('Candidate record not found.');
        });
    } else {
      deepLinkHandledRef.current = String(deepLinkCandidateId);
      toast.error('Candidate record not found.');
    }
  }, [deepLinkCandidateId, deepLinkRoomId, loading, candidatesMap]);

  // FEATURE-007: Scroll to inspected candidate row in roster when modal opens
  useEffect(() => {
    if (inspectCandidate) {
      const cid = inspectCandidate.candidateId || inspectCandidate.id || inspectCandidate._id;
      if (cid) {
        const el = document.getElementById(`candidate-row-${cid}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }
  }, [inspectCandidate]);

  // BUG-91: Fetch candidate malpractice logs whenever inspect modal opens with pagination support
  useEffect(() => {
    if (!targetInspectCandidateId) {
      setCandidateLogs([]);
      setLogsPage(1);
      setHasMoreLogs(false);
      setTotalLogsCount(0);
      setLoadingLogs(false);
      return;
    }
    setLogsPage(1);
    setLoadingLogs(true);
    api.getCandidateMalpracticeLogs(testId, targetInspectCandidateId, { page: 1, limit: 6 })
      .then((res) => {
        setCandidateLogs(res.data.malpracticeLogs || []);
        setHasMoreLogs(Boolean(res.data.hasMore));
        setTotalLogsCount(res.data.totalCount || res.data.malpracticeLogs?.length || 0);
        if (res.data.sessionTimestamps || res.data.roomJoinedAt || res.data.testStartedAt || res.data.testEndedAt) {
          const session = res.data.sessionTimestamps || {};
          setCandidatesMap((prev) => {
            const cur = prev[targetInspectCandidateId] || {};
            const startTime = session.candidateStartTime || res.data.testStartedAt || session.testStartedAt || cur.candidateStartTime || null;
            const hasStarted = Boolean(startTime);
            const status = session.status || (hasStarted ? (cur.status || 'IN_PROGRESS') : (cur.isDisqualified ? 'DISQUALIFIED' : 'NOT_STARTED'));
            const roomJoinedAt = res.data.roomJoinedAt || session.roomJoinedAt || cur.roomJoinedAt || cur.joinedAt || null;
            const testStartedAt = res.data.testStartedAt || session.testStartedAt || startTime;
            const testEndedAt = res.data.testEndedAt || session.testEndedAt || session.submittedAt || cur.submittedAt || null;
            return {
              ...prev,
              [targetInspectCandidateId]: {
                ...cur,
                ...session,
                status,
                candidateStartTime: startTime,
                testStartedAt,
                candidateEndTime: hasStarted ? (session.candidateEndTime || cur.candidateEndTime || null) : null,
                submittedAt: testEndedAt || session.submittedAt || cur.submittedAt || null,
                testEndedAt,
                roomJoinedAt,
              },
            };
          });
        }
      })
      .catch((err) => {
        console.error('Failed to fetch candidate malpractice logs:', err);
        setCandidateLogs([]);
        setHasMoreLogs(false);
        setTotalLogsCount(0);
      })
      .finally(() => setLoadingLogs(false));
  }, [targetInspectCandidateId, testId]);

  // BUG-91: Load more violation proof records on demand without multi-second freezes
  const handleLoadMoreLogs = useCallback(async () => {
    if (loadingMoreLogs || !hasMoreLogs || !targetInspectCandidateId) return;
    setLoadingMoreLogs(true);
    try {
      const nextPage = logsPage + 1;
      const res = await api.getCandidateMalpracticeLogs(testId, targetInspectCandidateId, { page: nextPage, limit: 6 });
      const newLogs = res.data.malpracticeLogs || [];
      setCandidateLogs((prev) => {
        const existingIds = new Set(prev.map((l) => String(l._id)));
        const filtered = newLogs.filter((l) => !existingIds.has(String(l._id)));
        return [...prev, ...filtered];
      });
      setLogsPage(nextPage);
      setHasMoreLogs(Boolean(res.data.hasMore));
      if (res.data.totalCount) {
        setTotalLogsCount(res.data.totalCount);
      }
    } catch (err) {
      console.error('Failed to load more malpractice logs:', err);
    } finally {
      setLoadingMoreLogs(false);
    }
  }, [loadingMoreLogs, hasMoreLogs, targetInspectCandidateId, logsPage, testId]);

  // Zoom proof screenshot modal
  const [zoomScreenshotUrl, setZoomScreenshotUrl] = useState(null);

  // FEATURE-030: Expand/Fullscreen Seat Map View State
  const [isSeatMapExpanded, setIsSeatMapExpanded] = useState(false);

  // Close expanded seat map on Escape key
  useEffect(() => {
    if (!isSeatMapExpanded) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (inspectCandidate || zoomScreenshotUrl || evaluationDetailCandidate) return;
        setIsSeatMapExpanded(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSeatMapExpanded, inspectCandidate, zoomScreenshotUrl, evaluationDetailCandidate]);

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
            const hasStarted = Boolean(cand.candidateStartTime);
            const endTime = hasStarted ? (cand.candidateEndTime || (cand.timeRemaining ? new Date(initialNow + cand.timeRemaining).toISOString() : null)) : null;
            initialMap[cid] = {
              ...cand,
              candidateId: cid,
              candidateEndTime: endTime,
              candidateStartTime: cand.candidateStartTime || null,
              submittedAt: cand.submittedAt || null,
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
            const refreshNow = Date.now();
            for (const [cid, cand] of Object.entries(res.data.candidates)) {
              const existing = updated[cid] || {};
              const startTime = cand.candidateStartTime || existing.candidateStartTime || null;
              const hasStarted = Boolean(startTime);
              const endTime = hasStarted ? (cand.candidateEndTime || existing.candidateEndTime || (cand.timeRemaining ? new Date(refreshNow + cand.timeRemaining).toISOString() : null)) : null;
              updated[cid] = {
                ...existing,
                ...cand,
                candidateId: cid,
                candidateEndTime: endTime,
                candidateStartTime: startTime,
                submittedAt: cand.submittedAt || existing.submittedAt || null,
                lastSyncedAt: refreshNow,
              };
            }
            return updated;
          });
        }
      }).catch(() => { });
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
        const startTime = cleanedData.candidateStartTime || existing.candidateStartTime || null;
        const hasStarted = Boolean(startTime);
        const endTime = hasStarted ? (cleanedData.candidateEndTime || existing.candidateEndTime || (cleanedData.timeRemaining ? new Date(currentNow + cleanedData.timeRemaining).toISOString() : null)) : null;
        updated[cid] = {
          ...existing,
          ...cleanedData,
          candidateId: cid,
          candidateEndTime: endTime,
          candidateStartTime: startTime,
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
    const adminId = user?.id || user?._id;
    if (!token || !adminId) return;

    initSocket(token);

    // Section 10.1: admin:join
    emitAdminJoin({ adminId, testId });

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

    // Section 10.2: malpractice:alert & malpractice:evidence-updated (FR-7.3)
    const handleMalpracticeAlert = (alertData) => {
      console.log('[Socket] Malpractice Alert received:', alertData);
      if (!alertData) return;

      const cid = alertData.candidateId;
      const logId = alertData.malpracticeLogId ? String(alertData.malpracticeLogId) : null;
      const violationKey = `${cid}_${alertData.violationType}`;
      const now = Date.now();

      // Clean up stale cache entries (> 30s)
      for (const [k, time] of recentDismissedAlertsRef.current.entries()) {
        if (now - time > 30000) recentDismissedAlertsRef.current.delete(k);
      }
      for (const [k, entry] of recentAlertsRef.current.entries()) {
        if (now - entry.timestamp > 30000) recentAlertsRef.current.delete(k);
      }

      // 1. Update candidate's persistent malpractice counter in map (FR-7.3)
      if (cid) {
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
          if (String(prevId) === String(cid)) {
            return {
              ...prev,
              malpracticeCount: alertData.currentCount || (prev.malpracticeCount || 0) + 1,
            };
          }
          return prev;
        });

        // Live update candidateLogs in open modal
        const currentInspectId = inspectCandidateRef.current?.candidateId || inspectCandidateRef.current?.id || inspectCandidateRef.current?._id;
        if (currentInspectId && String(currentInspectId) === String(cid)) {
          setCandidateLogs((prev) => {
            const exists = prev.some((l) => String(l._id) === String(alertData.malpracticeLogId));
            if (exists) {
              return prev.map((l) =>
                String(l._id) === String(alertData.malpracticeLogId)
                  ? { ...l, proofScreenshotUrl: alertData.proofScreenshotUrl || l.proofScreenshotUrl }
                  : l
              );
            }
            const newLog = {
              _id: alertData.malpracticeLogId || `temp_${Date.now()}`,
              candidateId: cid,
              testId,
              roomId: alertData.roomId,
              violationType: alertData.violationType,
              proofScreenshotUrl: alertData.proofScreenshotUrl || null,
              detectedAt: alertData.detectedAt || new Date().toISOString(),
              adminReviewed: false,
              adminAction: 'NONE',
            };
            return [newLog, ...prev];
          });

          // Background sync to ensure latest logs with proof images from DB
          api.getCandidateMalpracticeLogs(testId, cid, { page: 1, limit: 6 })
            .then((res) => {
              if (res.data?.malpracticeLogs) {
                setCandidateLogs((prev) => {
                  const incoming = res.data.malpracticeLogs;
                  const incomingMap = new Map(incoming.map((l) => [String(l._id), l]));
                  const updatedPrev = prev.map((l) => incomingMap.get(String(l._id)) || l);
                  const existingIds = new Set(prev.map((l) => String(l._id)));
                  const newlyAdded = incoming.filter((l) => !existingIds.has(String(l._id)));
                  return [...newlyAdded, ...updatedPrev];
                });
                if (res.data.totalCount) {
                  setTotalLogsCount(res.data.totalCount);
                }
              }
            })
            .catch(() => { });
        }

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
        }).catch(() => { });
      }

      // Check if this alert was already dismissed by admin within last 15s
      const wasDismissed = (logId && recentDismissedAlertsRef.current.has(logId)) ||
        recentDismissedAlertsRef.current.has(violationKey);
      if (wasDismissed) {
        return; // Do not re-open dismissed popup
      }

      // 2. Check if this alert matches the currently active alert on screen
      const currentActive = activeAlertRef.current;
      const isCurrentlyActive = currentActive && (
        (logId && String(currentActive.malpracticeLogId) === logId) ||
        (String(currentActive.candidateId) === String(cid) && currentActive.violationType === alertData.violationType)
      );

      if (isCurrentlyActive) {
        // Update active alert with proofScreenshotUrl live if newly arrived
        if (alertData.proofScreenshotUrl && !currentActive.proofScreenshotUrl) {
          setActiveAlert((prev) => (prev ? {
            ...prev,
            proofScreenshotUrl: alertData.proofScreenshotUrl,
            malpracticeLogId: logId || prev.malpracticeLogId,
            hasPendingProof: false,
          } : null));
        }
        return; // Suppress duplicate modal & toast
      }

      // 3. Check if this alert matches an item already in alertQueue
      let alreadyInQueue = false;
      setAlertQueue((prevQueue) => {
        const idx = prevQueue.findIndex((item) =>
          (logId && String(item.malpracticeLogId) === logId) ||
          (String(item.candidateId) === String(cid) && item.violationType === alertData.violationType)
        );
        if (idx !== -1) {
          alreadyInQueue = true;
          const copy = [...prevQueue];
          copy[idx] = {
            ...copy[idx],
            ...alertData,
            proofScreenshotUrl: alertData.proofScreenshotUrl || copy[idx].proofScreenshotUrl,
            hasPendingProof: false,
          };
          return copy;
        }
        return prevQueue;
      });

      if (alreadyInQueue) {
        return;
      }

      // 4. Handle Pending Evidence for Delayed-Capture Violations (FULLSCREEN_EXIT & TAB_SWITCH)
      const isDelayedCaptureType = alertData.violationType === 'FULLSCREEN_EXIT' || alertData.violationType === 'TAB_SWITCH';
      const hasProof = Boolean(alertData.proofScreenshotUrl);
      const pendingKey = logId || violationKey;

      // Check if this incoming alert fulfills an existing pending capture buffer
      if (pendingDelayedEvidenceRef.current.has(pendingKey) || pendingDelayedEvidenceRef.current.has(violationKey)) {
        const lookupKey = pendingDelayedEvidenceRef.current.has(pendingKey) ? pendingKey : violationKey;
        const pending = pendingDelayedEvidenceRef.current.get(lookupKey);
        clearTimeout(pending.timeoutId);
        pendingDelayedEvidenceRef.current.delete(lookupKey);

        const mergedAlert = {
          ...pending.alertData,
          ...alertData,
          proofScreenshotUrl: alertData.proofScreenshotUrl || pending.alertData.proofScreenshotUrl,
          hasPendingProof: false,
        };

        recentAlertsRef.current.set(pendingKey, { timestamp: now, alertData: mergedAlert });
        recentAlertsRef.current.set(violationKey, { timestamp: now, alertData: mergedAlert });
        setAlertQueue((q) => [...q, mergedAlert]);
        return;
      }

      // If it's a delayed-capture violation without proof yet, buffer it for 1200ms to allow screenshot to arrive
      if (isDelayedCaptureType && !hasProof) {
        toast.error(`⚠️ Malpractice: ${alertData.candidateName || 'Candidate'} (${alertData.violationType})`, {
          duration: 5000,
          id: `malpractice-${violationKey}`,
        });

        const timeoutId = setTimeout(() => {
          if (pendingDelayedEvidenceRef.current.has(pendingKey)) {
            const entry = pendingDelayedEvidenceRef.current.get(pendingKey);
            pendingDelayedEvidenceRef.current.delete(pendingKey);
            recentAlertsRef.current.set(pendingKey, { timestamp: Date.now(), alertData: entry.alertData });
            recentAlertsRef.current.set(violationKey, { timestamp: Date.now(), alertData: entry.alertData });
            setAlertQueue((q) => [...q, entry.alertData]);
          }
        }, 1200);

        pendingDelayedEvidenceRef.current.set(pendingKey, { timeoutId, alertData });
        return;
      }

      // 5. Suppress duplicate within 5 seconds
      const recent = recentAlertsRef.current.get(pendingKey) || recentAlertsRef.current.get(violationKey);
      if (recent && now - recent.timestamp < 5000) {
        return;
      }

      recentAlertsRef.current.set(pendingKey, { timestamp: now, alertData });
      recentAlertsRef.current.set(violationKey, { timestamp: now, alertData });

      toast.error(`⚠️ Malpractice: ${alertData.candidateName || 'Candidate'} (${alertData.violationType})`, {
        duration: 5000,
        id: `malpractice-${violationKey}`,
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
      api.getRooms(testId).then((res) => setRooms(res.data.rooms || [])).catch(() => { });
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
      }).catch(() => { });
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
      }).catch(() => { });
    };

    onDashboardUpdate(handleDashboardUpdate);
    onSeatmapStatus(handleSeatmapStatus);
    onMalpracticeAlert(handleMalpracticeAlert);
    onMalpracticeEvidenceUpdated(handleMalpracticeAlert);
    onCandidateSubmitted(handleCandidateSubmitted);
    onRoomUpdated(handleRoomUpdated);
    onTestEnded(handleTestEnded);
    onLateJoinRequest(handleLateJoinReq);
    onLateJoinProcessed(handleLateJoinProc);
    onRoomTentativeTime(handleRoomTentativeTime);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      for (const entry of pendingDelayedEvidenceRef.current.values()) {
        if (entry.timeoutId) clearTimeout(entry.timeoutId);
      }
      pendingDelayedEvidenceRef.current.clear();

      offDashboardUpdate(handleDashboardUpdate);
      offSeatmapStatus(handleSeatmapStatus);
      offMalpracticeAlert(handleMalpracticeAlert);
      offMalpracticeEvidenceUpdated(handleMalpracticeAlert);
      offCandidateSubmitted(handleCandidateSubmitted);
      offRoomUpdated(handleRoomUpdated);
      offTestEnded(handleTestEnded);
      offLateJoinRequest(handleLateJoinReq);
      offLateJoinProcessed(handleLateJoinProc);
      offRoomTentativeTime(handleRoomTentativeTime);
      disconnectSocket();
    };
  }, [testId, user?.id, user?._id, flushDebounceBuffer, announceCandidateSubmission, handleAllowLateEntry, handleDismissLateJoin]);

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
        closeActiveAlert();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to review violation');
    }
  };

  const isTestEnded = test?.status === 'ENDED';

  const handleManualWarn = async (candidate) => {
    const cid = candidate.candidateId || candidate.id || candidate._id;
    const name = candidate.name || candidate.candidateName || 'Candidate';
    const count = candidate.malpracticeCount || 0;
    if (count < 1) {
      toast.error(`Cannot warn ${name}: No violations recorded`);
      return;
    }
    try {
      const res = await api.warnCandidate(cid, { testId });
      const violationLabel = res.data?.violationType ? res.data.violationType.replace(/_/g, ' ') : 'malpractice';
      toast.success(`Official warning delivered to ${name} (${violationLabel})`, { icon: '⚠️' });
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to deliver warning to ${name}`);
    }
  };

  const handleManualDisqualify = async (candidate) => {
    const cid = candidate.candidateId || candidate.id || candidate._id;
    const name = candidate.name || candidate.candidateName || 'this candidate';
    if (!window.confirm(`Are you sure you want to DISQUALIFY ${name}?`)) return;
    try {
      await api.disqualifyCandidate(cid, { testId });
      setCandidatesMap((prev) => ({
        ...prev,
        [cid]: {
          ...prev[cid],
          status: 'DISQUALIFIED',
          colorStatus: 'RED',
          isDisqualified: true,
        },
      }));
      if (inspectCandidate && (inspectCandidate.candidateId === cid || inspectCandidate._id === cid || inspectCandidate.id === cid)) {
        setInspectCandidate((prev) => ({
          ...prev,
          status: 'DISQUALIFIED',
          colorStatus: 'RED',
          isDisqualified: true,
        }));
      }
      toast.success(`${name} has been disqualified.`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to disqualify candidate');
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
      const cColorStatus = getCandidateColorStatus(c, isTestEnded);
      const matchesStatus =
        filterStatus === 'ALL' ||
        cColorStatus === filterStatus ||
        (filterStatus === 'GREEN' && (c.status === 'SUBMITTED' || c.status === 'AUTO_SUBMITTED_TIME_UP' || isTestEnded)) ||
        c.status === filterStatus;
      const matchesSearch = !searchQuery.trim() || (c.name || c.candidateName)?.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesRoom && matchesStatus && matchesSearch;
    });
  }, [candidatesMap, selectedRoomId, filterStatus, searchQuery, isTestEnded]);

  // Aggregated Stats
  const stats = useMemo(() => {
    let submitted = 0, yellow = 0, red = 0, white = 0, passing = 0, totalMalpractice = 0;
    const passingThreshold = test?.passingCriteria || 1;
    Object.values(candidatesMap).forEach((c) => {
      const cColorStatus = getCandidateColorStatus(c, isTestEnded);
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
  }, [candidatesMap, test?.passingCriteria, isTestEnded]);

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
    // If test is not loaded or status is not live, show appropriate fallback
    if (!test) return { formatted: '—', rawMs: 0, hasActive: false };
    if (test.status === 'ENDED' || isTestEnded) {
      return { formatted: 'Test Concluded', rawMs: 0, hasActive: false };
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

    // Calculate overall test session remaining time based on test live start & duration
    const testDurationMs = (test.durationMinutes || 60) * 60 * 1000;
    const testStartTime = test.liveStartedAt
      ? new Date(test.liveStartedAt).getTime()
      : (test.createdAt ? new Date(test.createdAt).getTime() : now);
    const testEndMs = testStartTime + testDurationMs;
    const overallTestRemainingMs = Math.max(0, testEndMs - now);

    // If there are candidates actively IN_PROGRESS, tentative time is MAX remaining time among them
    if (inProgressCandidates.length > 0) {
      const remainingTimes = inProgressCandidates.map((c) => getCandidateRemainingMs(c, now));
      const maxRemainingMs = Math.max(...remainingTimes);
      return {
        formatted: formatMs(maxRemainingMs),
        rawMs: maxRemainingMs,
        hasActive: true,
      };
    }

    // If no candidate is currently IN_PROGRESS (e.g. all submitted or none started yet):
    // If the test itself is LIVE and has remaining duration in its window, show the test countdown!
    if (overallTestRemainingMs > 0) {
      return {
        formatted: formatMs(overallTestRemainingMs),
        rawMs: overallTestRemainingMs,
        hasActive: true,
      };
    }

    // If overall test session duration has fully expired:
    const candidatesInScope = Object.values(candidatesMap).filter((c) => {
      const cRoomId = typeof c.roomId === 'object' ? (c.roomId?._id || c.roomId?.id) : c.roomId;
      return selectedRoomId === 'ALL' || String(cRoomId) === String(selectedRoomId);
    });

    const anyCandidateStarted = candidatesInScope.some(
      (c) => c.candidateStartTime || c.status === 'IN_PROGRESS' || c.status === 'SUBMITTED' || c.status === 'AUTO_SUBMITTED_TIME_UP'
    );

    if (anyCandidateStarted || candidatesInScope.length > 0) {
      return {
        formatted: 'Session concluded',
        rawMs: 0,
        hasActive: false,
      };
    }

    return {
      formatted: 'Not started',
      rawMs: 0,
      hasActive: false,
    };
  }, [candidatesMap, selectedRoomId, test, now, isTestEnded]);

  // Section 13 NFR Virtualized Row Renderer for >50 items
  const VirtualizedRow = useCallback(({ index, style }) => {
    const candidate = candidateList[index];
    if (!candidate) return null;
    return (
      <CandidateRowItem
        candidate={candidate}
        roomName={roomsById[candidate.roomId] || 'Room'}
        onSelect={handleOpenInspectCandidate}
        onWarn={handleManualWarn}
        onDisqualify={handleManualDisqualify}
        onOpenEvaluationDetail={handleOpenEvaluationDetail}
        style={style}
        now={now}
        isTestEnded={isTestEnded}
        isActive={candidate.candidateId === targetInspectCandidateId}
      />
    );
  }, [candidateList, roomsById, now, isTestEnded, handleOpenInspectCandidate, handleManualWarn, handleManualDisqualify, handleOpenEvaluationDetail, targetInspectCandidateId]);

  if (loading) {
    return (
      <div className="app-layout">
        <AdminNavbar />
        <main className="main-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <LoadingDots size="lg" />
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
        {/* Breadcrumb Navigation (FEATURE-008: Dynamically rename post-test) */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
          <Link to="/admin/tests" style={{ color: 'var(--color-primary)', fontWeight: 500 }}>
            ← Tests
          </Link>
          <span style={{ color: 'var(--color-text-muted)' }}>/</span>
          <Link to={`/admin/tests/${testId}`} style={{ color: 'var(--color-primary)', fontWeight: 500 }}>
            {test?.title || 'Test Details'}
          </Link>
          <span style={{ color: 'var(--color-text-muted)' }}>/</span>
          <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>
            {isTestEnded ? 'Test Summary' : 'Live Monitoring'}
          </span>
        </div>

        {/* Top Header Card */}
        <div className="card" style={{ marginBottom: 20, padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h1 style={{ fontSize: '1.6rem', color: 'var(--color-navy)', fontWeight: 800 }}>
                  {test?.title}
                </h1>
                <TestStatusBadge
                  status={test?.status || 'LIVE'}
                  style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                />
                <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                  {test?.testType}
                </span>

                {/* Tentative Time / Status Badge (BUG-21, FEATURE-008: Frozen state post-test) */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '4px 12px',
                    background: 'linear-gradient(135deg, #2d4c95ff 0%, #1E293B 100%)',
                    borderRadius: 8,
                    border: '1px solid #334155',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                  }}
                  title={
                    isTestEnded
                      ? 'Test Concluded: Operational summary and malpractice review'
                      : tentativeTimer.hasActive
                        ? `Tentative Time: ${tentativeTimer.formatted} remaining in test session`
                        : tentativeTimer.formatted === 'Session concluded'
                          ? 'Tentative Time: Test session duration has completed'
                          : 'Tentative Time: No candidates have started yet'
                  }
                >
                  {!isTestEnded && <span style={{ fontSize: '1rem' }}>⏱️</span>}
                  <div>
                    <div style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#94A3B8', fontWeight: 700 }}>
                      {isTestEnded ? 'Test Status' : 'Tentative Time'}
                    </div>
                    <div style={{
                      fontFamily: isTestEnded || !tentativeTimer.hasActive ? 'inherit' : 'monospace',
                      fontSize: isTestEnded ? '0.85rem' : tentativeTimer.hasActive ? '0.95rem' : '0.82rem',
                      fontWeight: 800,
                      color: isTestEnded ? '#10B981' : tentativeTimer.hasActive ? '#38BDF8' : '#94A3B8',
                      letterSpacing: !isTestEnded && tentativeTimer.hasActive ? '0.03em' : 'normal',
                      lineHeight: 1.1
                    }}>
                      {isTestEnded ? 'Test Concluded' : tentativeTimer.formatted}
                    </div>
                  </div>
                </div>
              </div>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: 6, marginBottom: 0 }}>
                {isTestEnded
                  ? 'Post-test operational summary & malpractice review'
                  : 'Real-time multi-room monitoring & candidate proctoring'}
              </p>
            </div>

            {/* Header Controls: Room Filter, Voice TTS, Links */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Voice Announcement Toggle (FR-8.3, removed post-test per FEATURE-008) */}
              {!isTestEnded && (
                <button
                  onClick={() => {
                    setVoiceEnabled(!voiceEnabled);
                    toast.success(voiceEnabled ? 'Voice announcements muted' : 'Voice announcements enabled');
                  }}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                  title="AI Voice announcement when candidates submit"
                >
                  {voiceEnabled ? '🔊 Voice TTS: ON' : '🔇 Voice TTS: OFF'}
                </button>
              )}

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
                style={{ fontSize: '0.85rem', padding: '8px 16px', color: '#ffffff' }}
              >
                View Shortlist &amp; Results →
              </Link>
            </div>
          </div>

          {/* FEATURE-027: Header Metadata Stat Blocks (Duration, Passing Criteria, Question Set, Created, Live Session) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginTop: 18,
              paddingTop: 16,
              borderTop: '1px solid var(--color-border)',
            }}
          >
            {/* 1. Duration */}
            <div
              style={{
                background: 'var(--color-bg-subtle, #F8FAFC)',
                border: '1px solid var(--color-border, #E2E8F0)',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>⏱️</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Duration
                </span>
              </div>
              <div
                style={{
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  color: 'var(--color-navy, #0F172A)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={test?.durationMinutes ? `${test.durationMinutes} Minutes` : '—'}
              >
                {test?.durationMinutes ? `${test.durationMinutes} Minutes` : '—'}
              </div>
            </div>

            {/* 2. Passing Criteria (Renamed from Passing Threshold per FEATURE-027) */}
            <div
              style={{
                background: 'var(--color-bg-subtle, #F8FAFC)',
                border: '1px solid var(--color-border, #E2E8F0)',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>✅</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Passing Criteria
                </span>
              </div>
              <div
                style={{
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  color: 'var(--color-navy, #0F172A)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                ≥ {test?.passingCriteria !== undefined && test?.passingCriteria !== null ? test.passingCriteria : 1} Qs
              </div>
            </div>

            {/* 3. Question Set / Folder */}
            <div
              style={{
                background: 'var(--color-bg-subtle, #F8FAFC)',
                border: '1px solid var(--color-border, #E2E8F0)',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>📁</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Question Set
                </span>
              </div>
              <div
                style={{
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  color: 'var(--color-navy, #0F172A)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={
                  test?.questionSetPoolName || test?.folderId?.name
                    ? `📁 ${test.questionSetPoolName || test.folderId?.name}${test.poolSetCount ? ` (${test.poolSetCount} ${test.poolSetCount === 1 ? 'Set' : 'Sets'})` : ''}`
                    : (test?.questionSetId?.name || '—')
                }
              >
                {test?.questionSetPoolName || test?.folderId?.name
                  ? `${test.questionSetPoolName || test.folderId?.name}${test.poolSetCount ? ` (${test.poolSetCount} ${test.poolSetCount === 1 ? 'Set' : 'Sets'})` : ''}`
                  : (test?.questionSetId?.name || '—')}
              </div>
            </div>

            {/* 4. Created */}
            <div
              style={{
                background: 'var(--color-bg-subtle, #F8FAFC)',
                border: '1px solid var(--color-border, #E2E8F0)',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>📅</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Created
                </span>
              </div>
              <div
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  color: 'var(--color-navy, #0F172A)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={`Created by ${test?.createdBy?.name || 'Admin'} on ${formatCreationDateText(test?.createdAt)}`}
              >
                {test?.createdAt
                  ? `By ${test?.createdBy?.name || 'Admin'} on ${formatCreationDateText(test.createdAt)}`
                  : '—'}
              </div>
            </div>

            {/* 5. Live Session / Live for */}
            <div
              style={{
                background: 'var(--color-bg-subtle, #F8FAFC)',
                border: '1px solid var(--color-border, #E2E8F0)',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                minWidth: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '1rem', lineHeight: 1 }}>🕐</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Live Session
                </span>
              </div>
              <div
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  color: 'var(--color-navy, #0F172A)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  wordBreak: 'break-word',
                }}
                title={
                  test?.liveStartedAt
                    ? `${getLiveSessionText(test) || ''}${test?.status === 'ENDED' && formatLiveDuration(test.liveStartedAt, test.endedAt) ? ` (Live for ${formatLiveDuration(test.liveStartedAt, test.endedAt)})` : ''}`
                    : 'Not yet live'
                }
              >
                {test?.liveStartedAt ? (
                  <>
                    <span style={{ lineHeight: 1.35 }}>{getLiveSessionText(test)}</span>
                    {test?.status === 'ENDED' && formatLiveDuration(test.liveStartedAt, test.endedAt) && (
                      <span
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          color: 'var(--color-primary, #0e7c86)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        ⏱️ Live for {formatLiveDuration(test.liveStartedAt, test.endedAt)}
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ color: 'var(--color-text-muted)' }}>Not yet live</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Pending Late-Join Requests Banner (Requirements 4 & 5, hidden post-test) ── */}
        {!isTestEnded && lateJoinRequests.length > 0 && (
          <div
            className="card"
            style={{
              marginBottom: 20,
              padding: '16px 20px',
              border: '1.5px solid #F59E0B',
              background: 'var(--color-bg-card)',
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.3rem' }}>🔔</span>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#d97706', margin: 0 }}>
                    Late Join Requests ({lateJoinRequests.length})
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0 }}>
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
                    background: 'var(--color-bg-subtle)',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--color-navy)', fontSize: '0.95rem' }}>
                      {req.candidateName}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
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

        {/* ── Real-Time Metrics Bar (FEATURE-008: Clear post-test summary metrics) ── */}
        <div className="stats-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div className="stat-card" style={{ borderLeft: '4px solid #3B82F6' }}>
            <div className="stat-value" style={{ color: '#3B82F6' }}>{stats.total}</div>
            <div className="stat-label">{isTestEnded ? 'Total Candidates' : 'Active Candidates'}</div>
          </div>
          <div className="stat-card" style={{ borderLeft: `4px solid ${STATUS_COLORS.GREEN}` }}>
            <div className="stat-value" style={{ color: STATUS_COLORS.GREEN }}>{stats.submitted}</div>
            <div className="stat-label">Submitted</div>
          </div>
          <div className="stat-card" style={{ borderLeft: `4px solid ${STATUS_COLORS.YELLOW}` }}>
            <div className="stat-value" style={{ color: '#d97706' }}>{isTestEnded ? 0 : stats.yellow}</div>
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

        {/* ── Section 11.8: Seat Map Visualization (FR-7.3 Persistent Counter, FEATURE-008 Post-Test Summary) ── */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h3 className="card-title" style={{ margin: 0 }}>
                {isTestEnded ? 'Physical Seat Map Summary' : 'Live Physical Seat Map'}
              </h3>
              {/* BUG-011: Total Candidate Count Badge */}
              <span
                id="seat-map-total-count-badge"
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 6,
                  background: 'var(--color-bg-subtle, #f1f5f9)',
                  color: 'var(--color-navy, #0f172a)',
                  border: '1px solid var(--color-border, #cbd5e1)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span>👥</span>
                <span>
                  {selectedRoomId && selectedRoomId !== 'ALL'
                    ? `Showing ${candidateList.length} of ${Object.keys(candidatesMap).length} Candidates`
                    : `Total Candidates: ${Object.keys(candidatesMap).length}`}
                </span>
              </span>
            </div>

            {/* Seat Map Legend & Expand Button (FEATURE-030, BUG-011) */}
            <div style={{ display: 'flex', gap: 14, fontSize: '0.78rem', alignItems: 'center', flexWrap: 'wrap', color: 'var(--color-navy, #0f172a)', fontWeight: 600 }}>
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
                <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--color-bg-card, #ffffff)', border: '2px solid var(--color-seat-not-started-border, #cbd5e1)' }} />
                <span>Not Started</span>
              </div>

              {/* FEATURE-030 / BUG-011: Expand/Fullscreen Seat Map Toggle */}
              <button
                id="expand-seat-map-btn"
                type="button"
                onClick={() => setIsSeatMapExpanded(true)}
                title="Expand Seat Map (Full-screen view)"
                aria-label="Expand Seat Map to fullscreen"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'var(--color-bg-subtle, #f1f5f9)',
                  border: '1.5px solid var(--color-border, #cbd5e1)',
                  color: 'var(--color-navy, #0f172a)',
                  padding: '6px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  transition: 'all 0.15s ease',
                  marginLeft: 8,
                  boxShadow: 'var(--shadow-sm)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--color-bg-hover, #e2e8f0)';
                  e.currentTarget.style.borderColor = 'var(--color-primary, #0E7C86)';
                  e.currentTarget.style.color = 'var(--color-primary, #0E7C86)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--color-bg-subtle, #f1f5f9)';
                  e.currentTarget.style.borderColor = 'var(--color-border, #cbd5e1)';
                  e.currentTarget.style.color = 'var(--color-navy, #0f172a)';
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
                <span>Expand</span>
              </button>
            </div>
          </div>

          {candidateList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--color-text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📡</div>
              <h4 style={{ color: 'var(--color-navy)', marginBottom: 4 }}>
                {isTestEnded ? 'No candidates recorded for this test.' : 'Waiting for candidates to connect...'}
              </h4>
              <p style={{ fontSize: '0.85rem' }}>
                {isTestEnded
                  ? 'Candidate records will appear here once candidates have taken the test.'
                  : 'As candidates join physical rooms and send heartbeats, their seats will appear here in real time.'}
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
                  onClick={handleOpenInspectCandidate}
                  now={now}
                  isTestEnded={isTestEnded}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Candidate Roster & Proctoring Table (Section 13: react-window Virtualization) ── */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 className="card-title">
                {isTestEnded ? 'Candidate Proctoring Summary Roster' : 'Candidate Live Proctoring Roster'}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                {candidateList.length > 50
                  ? `⚡ Virtualized View Active (${candidateList.length} candidates — 60fps steady)`
                  : `Showing ${candidateList.length} ${isTestEnded ? 'candidate(s) in summary' : 'connected candidate(s)'}`}
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

          {/* Table Header Bar (BUG-018: Clean label "Candidate Name") */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1.1fr 1.1fr 1fr 1.1fr 1.1fr 2fr',
              padding: '10px 16px',
              background: 'var(--color-table-header-bg)',
              borderBottom: '1.5px solid var(--color-border)',
              fontWeight: 700,
              fontSize: '0.8rem',
              color: 'var(--color-table-header-text)',
            }}
          >
            <div>Candidate Name</div>
            <div>Room</div>
            <div>Status</div>
            <div>Qs Solved</div>
            <div>Malpractice</div>
            <div>{isTestEnded ? 'Status / Time' : 'Time Left'}</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {/* Table Body: Virtualized with react-window when > 50 candidates, standard when <= 50 */}
          {candidateList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
              {isTestEnded ? 'No candidates recorded for this test.' : 'No matching candidates connected.'}
            </div>
          ) : candidateList.length > 50 ? (
            // Section 13 NFR: react-window List Virtualization for > 50 candidates
            <List
              rowComponent={({ index, style }) => {
                const c = candidateList[index];
                if (!c) return null;
                return (
                  <CandidateRowItem
                    candidate={c}
                    roomName={roomsById[c.roomId] || 'Room'}
                    onSelect={handleOpenInspectCandidate}
                    onWarn={handleManualWarn}
                    onDisqualify={handleManualDisqualify}
                    onOpenEvaluationDetail={handleOpenEvaluationDetail}
                    style={style}
                    now={now}
                    isTestEnded={isTestEnded}
                    isActive={c.candidateId === targetInspectCandidateId}
                  />
                );
              }}
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
                  onSelect={handleOpenInspectCandidate}
                  onWarn={handleManualWarn}
                  onDisqualify={handleManualDisqualify}
                  onOpenEvaluationDetail={handleOpenEvaluationDetail}
                  now={now}
                  isTestEnded={isTestEnded}
                  isActive={c.candidateId === targetInspectCandidateId}
                />
              ))}
            </div>
          )}
        </div>



        {/* ── Candidate Inspect Modal with Malpractice Proof & Evidence History (FR-7.3, FR-7.4) ── */}
        {activeInspectCandidate && (
          <div className="modal-backdrop" onClick={handleCloseInspectModal}>
            <div id="candidate-inspection-modal" className="modal-container" style={{ maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3 className="modal-title" style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    🔍 Candidate Inspection &amp; Evidence
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    Live Proctoring &amp; Malpractice Review
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCloseInspectModal}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', paddingRight: 4 }}>
                {/* Top Info Card */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg-subtle)', padding: 14, borderRadius: 8, border: '1px solid var(--color-border)' }}>
                  <div>
                    <h4 style={{ fontSize: '1.15rem', color: 'var(--color-navy)', fontWeight: 800, margin: 0 }}>
                      {activeInspectCandidate.name || activeInspectCandidate.candidateName || 'Candidate'}
                    </h4>
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                      {activeInspectCandidate.email || activeInspectCandidate.candidateEmail || ''} {activeInspectCandidate.email || activeInspectCandidate.candidateEmail ? '·' : ''} Room: <strong>{roomsById[activeInspectCandidate.roomId] || activeInspectCandidate.roomName || 'Assigned Room'}</strong>
                      {(activeInspectCandidate.assignedQuestionSetName || activeInspectCandidate.assignedSetIndex) && (
                        <span style={{ marginLeft: 8 }}>
                          · Set: <strong>{activeInspectCandidate.assignedQuestionSetName ? `${activeInspectCandidate.assignedQuestionSetName}${activeInspectCandidate.assignedSetIndex ? ` (Set ${activeInspectCandidate.assignedSetIndex})` : ''}` : `Set ${activeInspectCandidate.assignedSetIndex}`}</strong>
                        </span>
                      )}
                    </span>
                  </div>
                  {(() => {
                    const isCandidateStarted = Boolean(activeInspectCandidate.candidateStartTime || activeInspectCandidate.startedAt);
                    const inspectColorStatus = getCandidateColorStatus(activeInspectCandidate, isTestEnded);
                    const inspectColor = STATUS_COLORS[inspectColorStatus] || '#9ca3af';

                    let displayStatus = activeInspectCandidate.status;
                    if (activeInspectCandidate.status === 'AUTO_SUBMITTED_TIME_UP') {
                      displayStatus = 'SUBMITTED (TIME UP)';
                    } else if (activeInspectCandidate.status === 'DISQUALIFIED' || activeInspectCandidate.isDisqualified || inspectColorStatus === 'RED') {
                      displayStatus = 'DISQUALIFIED';
                    } else if (activeInspectCandidate.status === 'SUBMITTED' || inspectColorStatus === 'GREEN') {
                      displayStatus = 'SUBMITTED';
                    } else if (activeInspectCandidate.status === 'IN_PROGRESS' && isCandidateStarted) {
                      displayStatus = 'IN_PROGRESS';
                    } else {
                      displayStatus = 'NOT_STARTED';
                    }

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
                        {displayStatus}
                      </span>
                    );
                  })()}
                </div>

                {/* Key Metrics Grid - 2 Rows (FEATURE-021) */}
                <div
                  id="inspect-candidate-key-metrics-grid"
                  style={{
                    background: 'var(--color-bg-card)',
                    padding: '14px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '12px 16px',
                    fontSize: '0.85rem',
                  }}
                >
                  {/* Row 1 - Existing Metrics (Preserved Unchanged) */}
                  <div>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>Questions Solved:</span>
                    <strong style={{ display: 'block', color: 'var(--color-navy)', fontSize: '1.1rem', marginTop: 2 }}>
                      {activeInspectCandidate.status === 'NOT_STARTED' || (!activeInspectCandidate.candidateStartTime && activeInspectCandidate.status !== 'SUBMITTED' && activeInspectCandidate.status !== 'IN_PROGRESS')
                        ? '—'
                        : (activeInspectCandidate.questionsCompleted ?? 0)}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>Total Violations:</span>
                    <strong style={{ display: 'block', color: (activeInspectCandidate.malpracticeCount || totalLogsCount || candidateLogs.length) > 0 ? '#E74C3C' : '#2ECC71', fontSize: '1.1rem', marginTop: 2 }}>
                      {Math.max(activeInspectCandidate.malpracticeCount || 0, totalLogsCount || 0, candidateLogs.length)}
                    </strong>
                  </div>
                  <div>
                    {(() => {
                      const timeInfo = getCandidateInspectionTimeInfo(
                        activeInspectCandidate,
                        now,
                        isTestEnded,
                        test?.durationMinutes || test?.duration
                      );
                      return (
                        <>
                          <span id="inspect-candidate-time-spent-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                            {timeInfo.label}
                          </span>
                          <strong id="inspect-candidate-time-spent-val" style={{ display: 'block', fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-navy)', fontSize: '1.1rem', marginTop: 2 }}>
                            {timeInfo.value}
                          </strong>
                        </>
                      );
                    })()}
                  </div>

                  {/* Row 2 - Timeline Metrics (FEATURE-021) */}
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                    <span id="inspect-candidate-room-joined-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                      Room Joined:
                    </span>
                    <strong id="inspect-candidate-room-joined-val" style={{ display: 'block', color: 'var(--color-navy)', fontSize: '1.05rem', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap' }}>
                      {getInspectRoomJoinedText(activeInspectCandidate)}
                    </strong>
                  </div>
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                    <span id="inspect-candidate-test-start-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                      Test Start:
                    </span>
                    <strong id="inspect-candidate-test-start-val" style={{ display: 'block', color: 'var(--color-navy)', fontSize: '1.05rem', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap' }}>
                      {getInspectTestStartText(activeInspectCandidate)}
                    </strong>
                  </div>
                  <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                    <span id="inspect-candidate-test-end-label" style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                      Test End:
                    </span>
                    <strong id="inspect-candidate-test-end-val" style={{ display: 'block', color: 'var(--color-navy)', fontSize: '1.05rem', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap' }}>
                      {getInspectTestEndText(activeInspectCandidate)}
                    </strong>
                  </div>
                </div>

                {/* Malpractice Logs & Evidence Section */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-navy)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                      <span>📸</span> Malpractice Violation History &amp; Proof Screenshots
                    </h4>
                    {(() => {
                      const totalIncidents = Math.max(activeInspectCandidate.malpracticeCount || 0, totalLogsCount || 0, candidateLogs.length);
                      return (
                        <span className="badge badge-secondary" style={{ fontSize: '0.72rem' }}>
                          {totalIncidents} {totalIncidents === 1 ? 'Incident' : 'Incidents'}
                        </span>
                      );
                    })()}
                  </div>

                  {loadingLogs ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '8px 0' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          padding: '12px 0',
                          color: 'var(--color-text-muted)',
                          fontSize: '0.85rem',
                        }}
                      >
                        <LoadingDots size="sm" />
                        <span>Loading violation proof history...</span>
                      </div>

                      {/* Skeleton loader cards simulating the incident rows */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[1, 2].map((i) => (
                          <div
                            key={i}
                            style={{
                              background: 'var(--color-bg-subtle)',
                              border: '1px solid var(--color-border)',
                              borderRadius: 8,
                              padding: 14,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 12,
                              animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                              opacity: i === 1 ? 0.8 : 0.45,
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 110, height: 20, background: 'var(--color-border)', borderRadius: 4 }} />
                                <div style={{ width: 130, height: 16, background: 'var(--color-border)', borderRadius: 4 }} />
                              </div>
                              <div style={{ width: 80, height: 20, background: 'var(--color-border)', borderRadius: 4 }} />
                            </div>
                            <div style={{ width: '100%', height: 44, background: 'var(--color-border)', borderRadius: 6, opacity: 0.6 }} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : candidateLogs.length === 0 ? (
                    (activeInspectCandidate.malpracticeCount || 0) > 0 ? (
                      <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', color: '#d97706', padding: '16px', borderRadius: 8, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: '1.4rem' }}>⚠️</span>
                        <div>
                          <strong>Violations Recorded:</strong> {activeInspectCandidate.malpracticeCount} violation(s) registered for this candidate. Loading incident history...
                        </div>
                      </div>
                    ) : (
                      <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid #10b98140', color: '#059669', padding: '16px', borderRadius: 8, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 10 }}>
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
                              background: 'var(--color-bg-subtle)',
                              border: `1.5px solid ${isDisqualified ? '#fca5a5' : isWarned ? '#fcd34d' : 'var(--color-border)'}`,
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
                                  className={`badge ${log.violationType === 'PHONE_DETECTED' || log.violationType === 'MULTIPLE_FACES' || log.violationType === 'CAMERA_DISCONNECTED'
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
                                <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
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
                                  <span
                                    className="badge"
                                    style={{
                                      fontSize: '0.72rem',
                                      fontWeight: 700,
                                      padding: '3px 8px',
                                      background: 'rgba(100, 116, 139, 0.15)',
                                      color: 'var(--color-navy, #334155)',
                                      border: '1px solid rgba(100, 116, 139, 0.35)',
                                      borderRadius: 4,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                    }}
                                  >
                                    ⏳ UNREVIEWED
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Camera Disconnect Specific Details */}
                            {log.violationType === 'CAMERA_DISCONNECTED' && (
                              <div style={{
                                background: 'var(--color-bg-card)',
                                border: `1px solid ${log.reconnectAt ? '#a7f3d0' : '#fecaca'}`,
                                borderRadius: 6,
                                padding: '8px 12px',
                                fontSize: '0.8rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 4,
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                  <span style={{ fontWeight: 700, color: log.reconnectAt ? '#065f46' : '#dc2626' }}>
                                    {log.reconnectAt ? '🟢 Resolved (Camera Reconnected & Face Verified)' : '🔴 Camera Disconnected — Opaque Overlay & Lock Active'}
                                  </span>
                                  {log.durationSeconds !== null && log.durationSeconds !== undefined && (
                                    <span style={{ fontWeight: 800, color: 'var(--color-text)', background: 'var(--color-bg-subtle)', padding: '2px 8px', borderRadius: 4, fontSize: '0.78rem' }}>
                                      Duration: {log.durationSeconds}s {log.durationSeconds >= 60 ? `(${Math.floor(log.durationSeconds / 60)}m ${log.durationSeconds % 60}s)` : ''}
                                    </span>
                                  )}
                                </div>
                                <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
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
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                                  Captured Proof Evidence:
                                </span>
                                <div
                                  style={{
                                    position: 'relative',
                                    border: '1px solid var(--color-border)',
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
                                    loading="lazy"
                                    decoding="async"
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
                              <div style={{ background: 'var(--color-bg-card)', padding: '8px 12px', borderRadius: 6, color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                                📷 No image frame captured for this event.
                              </div>
                            )}

                            {/* Review Action Buttons */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4, borderTop: '1px solid var(--color-border)' }}>
                              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                                {log.reviewedBy ? `Reviewed by ${log.reviewedBy.name || 'Admin'}` : 'Admin Review Action:'}
                              </span>
                              <div style={{ display: 'flex', gap: 8 }}>
                                {!isTestEnded && (
                                  <button
                                    type="button"
                                    onClick={() => handleReviewMalpractice(log._id, 'WARNED')}
                                    className="btn btn-secondary"
                                    style={{
                                      padding: '3px 10px', fontSize: '0.72rem',
                                      fontWeight: 600,
                                      color: isWarned ? '#ffffff' : '#f59e0b',
                                      borderColor: '#f59e0b',
                                      background: isWarned ? '#f59e0b' : 'transparent',
                                    }}
                                    disabled={isDisqualified}
                                  >
                                    ⚠️ {isWarned ? 'Warned' : 'Issue Warning'}
                                  </button>
                                )}
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

                      {/* BUG-91: Load more violation proof records pagination button */}
                      {hasMoreLogs && (
                        <div style={{ textAlign: 'center', padding: '10px 0 4px 0' }}>
                          <button
                            type="button"
                            onClick={handleLoadMoreLogs}
                            disabled={loadingMoreLogs}
                            className="btn btn-secondary"
                            style={{
                              fontSize: '0.8rem',
                              padding: '6px 16px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 8,
                              cursor: loadingMoreLogs ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {loadingMoreLogs ? (
                              <>
                                <LoadingDots size="sm" />
                                <span>Loading more incidents...</span>
                              </>
                            ) : (
                              <span>⬇ Load More Incidents ({candidateLogs.length} of {Math.max(activeInspectCandidate.malpracticeCount || 0, totalLogsCount || 0, candidateLogs.length)} shown)</span>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {/* FEATURE-024: View Result button on Candidate Inspection & Evidence modal */}
                <button
                  type="button"
                  onClick={() => handleOpenEvaluationDetail(activeInspectCandidate)}
                  disabled={!isCandidateSubmitted(activeInspectCandidate, isTestEnded)}
                  className="btn btn-primary"
                  style={{
                    background: isCandidateSubmitted(activeInspectCandidate, isTestEnded) ? '#0E7C86' : 'var(--color-bg-subtle)',
                    borderColor: isCandidateSubmitted(activeInspectCandidate, isTestEnded) ? '#0E7C86' : 'var(--color-border)',
                    color: isCandidateSubmitted(activeInspectCandidate, isTestEnded) ? '#ffffff' : 'var(--color-text-muted)',
                    opacity: isCandidateSubmitted(activeInspectCandidate, isTestEnded) ? 1 : 0.5,
                    cursor: isCandidateSubmitted(activeInspectCandidate, isTestEnded) ? 'pointer' : 'not-allowed',
                    padding: '6px 16px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  title={
                    isCandidateSubmitted(activeInspectCandidate, isTestEnded)
                      ? 'View detailed per-question test results and rubric evaluation'
                      : 'Candidate has not yet submitted the test'
                  }
                >
                  <span>📊</span> View Result
                </button>
                <button
                  type="button"
                  onClick={handleCloseInspectModal}
                  className="btn btn-secondary"
                  style={{ padding: '6px 16px' }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Real-Time Malpractice Alert Modal (FR-7.3) ── */}
        {activeAlert && (
          <div
            className="modal-backdrop"
            style={{
              zIndex: 1150,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              background: 'rgba(15, 23, 42, 0.75)',
            }}
          >
            <div
              className="modal-card"
              style={{
                maxWidth: 580,
                width: '100%',
                background: 'var(--color-modal-bg)',
                borderRadius: 12,
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.3)',
                overflow: 'hidden',
                border: '2px solid #ef4444',
                animation: 'modalSlideIn 0.25s ease-out',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  background: 'var(--color-modal-header-bg)',
                  borderBottom: '1px solid var(--color-border)',
                  padding: '16px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>⚠️</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#dc2626', fontWeight: 700 }}>
                      Real-Time Malpractice Alert
                    </h3>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      Automated violation flagged by proctoring engine
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeActiveAlert}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.25rem',
                    color: '#dc2626',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: 4,
                  }}
                  aria-label="Dismiss alert"
                >
                  ✕
                </button>
              </div>

              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 12,
                    background: 'var(--color-bg-subtle)',
                    padding: 14,
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Candidate
                    </div>
                    <div style={{ fontWeight: 700, color: 'var(--color-navy)', fontSize: '0.95rem' }}>
                      {activeAlert.candidateName || 'Candidate'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {activeAlert.candidateEmail || ''}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Assigned Room
                    </div>
                    <div style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.9rem' }}>
                      {activeAlert.roomName || 'Assigned Room'}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Violation Type
                    </div>
                    <span
                      className="badge badge-danger"
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        marginTop: 2,
                        display: 'inline-block',
                      }}
                    >
                      {activeAlert.violationType?.replace(/_/g, ' ') || 'MALPRACTICE'}
                    </span>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                      Total Violations
                    </div>
                    <div style={{ fontWeight: 800, color: '#dc2626', fontSize: '1rem' }}>
                      {activeAlert.currentCount || 1} {activeAlert.currentCount === 1 ? 'incident' : 'incidents'}
                    </div>
                  </div>
                </div>

                {/* Camera Disconnected Security Notification */}
                {activeAlert.violationType === 'CAMERA_DISCONNECTED' && (
                  <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '10px 14px' }}>
                    <span style={{ fontWeight: 700, color: '#dc2626', display: 'block', fontSize: '0.85rem' }}>
                      📷 Camera Disconnected Security Alert
                    </span>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                      Candidate camera was disconnected. Fullscreen opaque blackout overlay and editor lock are active.
                    </span>
                    {activeAlert.durationSeconds !== null && activeAlert.durationSeconds !== undefined && (
                      <div style={{ marginTop: 4, fontWeight: 700, color: '#15803d', fontSize: '0.82rem' }}>
                        Total Disconnect Duration: {activeAlert.durationSeconds}s
                      </div>
                    )}
                  </div>
                )}

                {/* Evidence Proof Frame */}
                {activeAlert.proofScreenshotUrl ? (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text)' }}>
                        Captured Proof Evidence:
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                        Click image to enlarge
                      </span>
                    </div>
                    <div
                      style={{
                        position: 'relative',
                        border: '1px solid var(--color-border)',
                        borderRadius: 8,
                        overflow: 'hidden',
                        cursor: 'zoom-in',
                        background: '#000',
                        maxHeight: 220,
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                      onClick={() => setZoomScreenshotUrl(activeAlert.proofScreenshotUrl)}
                      title="Click to view full-resolution screenshot"
                    >
                      <img
                        src={activeAlert.proofScreenshotUrl}
                        alt="Violation Proof"
                        style={{ maxWidth: '100%', maxHeight: 220, objectFit: 'contain' }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 6,
                          right: 8,
                          background: 'rgba(0,0,0,0.7)',
                          color: 'white',
                          fontSize: '0.7rem',
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontWeight: 600,
                        }}
                      >
                        🔍 Click to Enlarge
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      background: 'var(--color-bg-card)',
                      padding: '16px 14px',
                      borderRadius: 6,
                      color: 'var(--color-text-muted)',
                      fontSize: '0.82rem',
                      textAlign: 'center',
                    }}
                  >
                    {activeAlert.hasPendingProof ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#d97706', fontWeight: 600 }}>
                        <LoadingDots size="xs" color="#d97706" />
                        Capturing proof evidence screenshot...
                      </span>
                    ) : (
                      '📷 No image frame captured for this event.'
                    )}
                  </div>
                )}
              </div>

              <div
                style={{
                  background: 'var(--color-bg-subtle)',
                  borderTop: '1px solid var(--color-border)',
                  padding: '12px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    const cid = activeAlert.candidateId;
                    const cand = candidatesMap[cid] || {
                      candidateId: cid,
                      name: activeAlert.candidateName,
                      email: activeAlert.candidateEmail,
                      roomId: activeAlert.roomId,
                      roomName: activeAlert.roomName,
                      malpracticeCount: activeAlert.currentCount,
                    };
                    handleOpenInspectCandidate(cand);
                    closeActiveAlert();
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                >
                  🔍 Inspect Candidate
                </button>

                <div style={{ display: 'flex', gap: 8 }}>
                  {!isTestEnded && (
                    <button
                      type="button"
                      id="alert-warn-candidate-btn"
                      onClick={async () => {
                        if (activeAlert.malpracticeLogId) {
                          await handleReviewMalpractice(activeAlert.malpracticeLogId, 'WARNED');
                        } else {
                          const cand = candidatesMap[activeAlert.candidateId] || {
                            candidateId: activeAlert.candidateId,
                            name: activeAlert.candidateName,
                            malpracticeCount: activeAlert.currentCount || 1,
                          };
                          await handleManualWarn(cand);
                        }
                        closeActiveAlert();
                      }}
                      className="btn btn-warning"
                      style={{
                        padding: '6px 14px',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                      }}
                    >
                      ⚠️ Warn Candidate
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={async () => {
                      if (activeAlert.malpracticeLogId) {
                        await handleReviewMalpractice(activeAlert.malpracticeLogId, 'DISQUALIFIED');
                      } else {
                        const cand = candidatesMap[activeAlert.candidateId] || {
                          candidateId: activeAlert.candidateId,
                          name: activeAlert.candidateName,
                        };
                        await handleManualDisqualify(cand);
                      }
                      closeActiveAlert();
                    }}
                    className="btn btn-danger"
                    style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                  >
                    🚫 Disqualify
                  </button>

                  <button
                    type="button"
                    onClick={closeActiveAlert}
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.82rem' }}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Zoom Screenshot Modal (BUG-62) ── */}
        {zoomScreenshotUrl && (
          <div
            className="modal-backdrop"
            onClick={() => setZoomScreenshotUrl(null)}
            style={{
              zIndex: 1200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              background: 'rgba(0, 0, 0, 0.85)',
            }}
          >
            <div
              style={{
                maxWidth: '92vw',
                maxHeight: '90vh',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0f172a',
                borderRadius: 8,
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.7)',
                overflow: 'hidden',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={zoomScreenshotUrl}
                alt="Enlarged Proof Frame"
                style={{
                  maxWidth: '92vw',
                  maxHeight: '85vh',
                  objectFit: 'contain',
                  display: 'block',
                }}
              />
              <button
                type="button"
                onClick={() => setZoomScreenshotUrl(null)}
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  background: 'rgba(15, 23, 42, 0.85)',
                  color: 'white',
                  border: '1.5px solid rgba(255, 255, 255, 0.7)',
                  borderRadius: '50%',
                  width: 34,
                  height: 34,
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  zIndex: 20,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                }}
                aria-label="Close enlarged evidence"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── FEATURE-024: Candidate Detail Evaluation Modal ── */}
        {evaluationDetailCandidate && (
          <CandidateDetailEvaluationModal
            testId={testId}
            candidate={evaluationDetailCandidate}
            testType={test?.testType}
            onClose={handleCloseEvaluationDetail}
          />
        )}

        {/* ── FEATURE-030: Expanded Full-Viewport Live Physical Seat Map ── */}
        {isSeatMapExpanded && (
          <div
            id="seat-map-expanded-overlay"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              zIndex: 900,
              background: 'var(--color-bg, #0b0f19)',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              animation: 'modalFadeIn 0.18s ease-out',
            }}
          >
            {/* Expanded Header Bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 28px',
                background: 'var(--color-bg-card, #ffffff)',
                borderBottom: '1.5px solid var(--color-border, #cbd5e1)',
                flexShrink: 0,
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-navy, #0f172a)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{isTestEnded ? 'Physical Seat Map Summary' : 'Live Physical Seat Map'}</span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 12,
                      background: isTestEnded ? 'rgba(100, 116, 139, 0.12)' : 'rgba(16, 185, 129, 0.15)',
                      color: isTestEnded ? 'var(--color-text-muted, #475569)' : '#059669',
                      border: `1px solid ${isTestEnded ? 'rgba(100, 116, 139, 0.3)' : 'rgba(16, 185, 129, 0.35)'}`,
                    }}
                  >
                    {isTestEnded ? 'CONCLUDED' : 'LIVE'}
                  </span>
                </h3>
                {test?.testTitle && (
                  <span style={{ fontSize: '0.88rem', color: 'var(--color-text-muted, #64748b)', fontWeight: 600 }}>
                    · {test.testTitle}
                  </span>
                )}
                {/* BUG-011: Total Candidates Badge */}
                <span
                  id="expanded-seat-map-total-count-badge"
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 6,
                    background: 'var(--color-bg-subtle, #f1f5f9)',
                    color: 'var(--color-navy, #0f172a)',
                    border: '1px solid var(--color-border, #cbd5e1)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span>👥</span>
                  <span>
                    {selectedRoomId && selectedRoomId !== 'ALL'
                      ? `Showing ${candidateList.length} of ${Object.keys(candidatesMap).length} Candidates`
                      : `Total Candidates: ${Object.keys(candidatesMap).length}`}
                  </span>
                </span>
              </div>

              {/* Legend & Collapse Button */}
              <div style={{ display: 'flex', gap: 16, fontSize: '0.78rem', alignItems: 'center', flexWrap: 'wrap', color: 'var(--color-navy, #0f172a)', fontWeight: 600 }}>
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
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--color-bg-card, #ffffff)', border: '2px solid var(--color-seat-not-started-border, #cbd5e1)' }} />
                  <span>Not Started</span>
                </div>

                {/* Collapse Button */}
                <button
                  id="collapse-seat-map-btn"
                  type="button"
                  onClick={() => setIsSeatMapExpanded(false)}
                  title="Collapse Seat Map (Return to normal view)"
                  aria-label="Collapse Seat Map to normal view"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'var(--color-bg-subtle, #f1f5f9)',
                    border: '1.5px solid var(--color-border, #cbd5e1)',
                    color: 'var(--color-navy, #0f172a)',
                    padding: '6px 14px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    transition: 'all 0.15s ease',
                    marginLeft: 8,
                    boxShadow: 'var(--shadow-sm)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--color-bg-hover, #e2e8f0)';
                    e.currentTarget.style.borderColor = 'var(--color-primary, #0E7C86)';
                    e.currentTarget.style.color = 'var(--color-primary, #0E7C86)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--color-bg-subtle, #f1f5f9)';
                    e.currentTarget.style.borderColor = 'var(--color-border, #cbd5e1)';
                    e.currentTarget.style.color = 'var(--color-navy, #0f172a)';
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                  <span>Collapse</span>
                </button>
              </div>
            </div>

            {/* Scrollable Grid of Seats */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px 32px',
                boxSizing: 'border-box',
              }}
            >
              {candidateList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--color-text-muted)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 12 }}>📡</div>
                  <h4 style={{ color: 'var(--color-navy)', marginBottom: 6, fontSize: '1.2rem' }}>
                    {isTestEnded ? 'No candidates recorded for this test.' : 'Waiting for candidates to connect...'}
                  </h4>
                  <p style={{ fontSize: '0.9rem' }}>
                    {isTestEnded
                      ? 'Candidate records will appear here once candidates have taken the test.'
                      : 'As candidates join physical rooms and send heartbeats, their seats will appear here in real time.'}
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 16,
                    paddingBottom: 40,
                  }}
                >
                  {candidateList.map((c) => (
                    <SeatTile
                      key={`expanded-${c.candidateId}`}
                      candidate={c}
                      roomName={roomsById[c.roomId] || 'Room'}
                      onClick={handleOpenInspectCandidate}
                      now={now}
                      isTestEnded={isTestEnded}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
