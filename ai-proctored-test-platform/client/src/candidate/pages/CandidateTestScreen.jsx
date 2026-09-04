// CandidateTestScreen — Standard Coding Test (SPOJ / JAVASCRIPT / REACT types)
// Implements FR-5.1 through FR-5.6 (§11.5)
// NFR: 60fps timer, autosave every 30s, debounced socket heartbeat
import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/apiClient';
import { useTimer } from '../../hooks/useTimer';
import { useAutosave } from '../../hooks/useAutosave';
import {
  initSocket, emitCandidateJoin, emitCandidateHeartbeat,
  emitTabSwitch, emitFullscreenExit,
  onCandidateWarning, offCandidateWarning,
  onCandidateViolationUpdated, offCandidateViolationUpdated,
  onCandidateDisqualified, offCandidateDisqualified,
  onTestEnded, offTestEnded,
  onSessionSuperseded, offSessionSuperseded,
} from '../../services/socketClient';
import { useAuth } from '../../hooks/useAuthContext';
import { useProctoring } from '../../hooks/useProctoring';
import DraggableWebcamPip from '../../shared/DraggableWebcamPip';
import CameraDisconnectedOverlay from '../components/CameraDisconnectedOverlay';
import SessionSupersededOverlay from '../components/SessionSupersededOverlay';
import ViolationNotificationBanner, { useViolationNotification } from '../components/ViolationNotificationBanner';
import TestFooter from '../components/TestFooter';
import globussoftLogo from '../../assets/globussoft-logo.png';

// ── Monaco Editor (lazy-loaded to avoid bundle bloat) ─────────────────────────
import Editor from '@monaco-editor/react';

const LANGUAGE_MAP = {
  python: 'python', java: 'java', cpp: 'cpp', c: 'c',
  javascript: 'javascript', react: 'javascript',
};

// ── Memoized question list item (NFR: React.memo for 60fps list updates, supports collapsed view) ──────
const QuestionTab = memo(({ question, index, isActive, visiblePassed, visibleTotal, isSubmitted, isCollapsed, onClick, disabled }) => {
  const progress = visibleTotal > 0 ? visiblePassed / visibleTotal : 0;
  const isFullyPassed = visibleTotal > 0 && visiblePassed === visibleTotal;

  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        title={`Q${index + 1}. ${question.title} (${question.difficulty || 'N/A'}) - ${visiblePassed}/${visibleTotal} passed${isSubmitted ? ' (Submitted)' : ''}`}
        style={{
          width: '100%',
          padding: '12px 4px',
          background: isActive ? 'rgba(124, 58, 237, 0.2)' : 'transparent',
          border: 'none',
          borderLeft: isActive ? '3px solid #8b5cf6' : '3px solid transparent',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          transition: 'background 150ms ease',
        }}
        onMouseEnter={(e) => {
          if (!isActive && !disabled) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
        }}
        onMouseLeave={(e) => {
          if (!isActive && !disabled) e.currentTarget.style.background = 'transparent';
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: '0.85rem',
            color: isActive ? '#a78bfa' : '#e2e8f0',
          }}
        >
          Q{index + 1}
        </span>
        {isSubmitted || isFullyPassed ? (
          <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 700 }}>✓</span>
        ) : visibleTotal > 0 ? (
          <span style={{ fontSize: '0.68rem', color: isActive ? '#c4b5fd' : '#cbd5e1', fontWeight: 600 }}>
            {visiblePassed}/{visibleTotal}
          </span>
        ) : (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: isActive ? '#8b5cf6' : '#94a3b8',
              display: 'inline-block',
            }}
          />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: '100%',
        textAlign: 'left',
        padding: '12px 16px',
        background: isActive ? 'rgba(124, 58, 237, 0.18)' : 'transparent',
        border: 'none',
        borderLeft: isActive ? '3px solid #8b5cf6' : '3px solid transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 200ms',
        fontFamily: 'Inter, sans-serif',
      }}
      onMouseEnter={(e) => {
        if (!isActive && !disabled) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
      }}
      onMouseLeave={(e) => {
        if (!isActive && !disabled) e.currentTarget.style.background = 'transparent';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: isActive ? '#f8fafc' : '#e2e8f0' }}>
          Q{index + 1}. {question.title}
        </span>
        <span
          className={`badge badge-${
            question.difficulty === 'HARD' ? 'danger' : question.difficulty === 'MEDIUM' ? 'warning' : 'success'
          }`}
          style={{ fontSize: '0.65rem' }}
        >
          {question.difficulty || 'N/A'}
        </span>
      </div>
      {visibleTotal > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="progress-bar-container" style={{ flex: 1, background: '#23253a' }}>
            <div className="progress-bar-fill" style={{ width: `${progress * 100}%`, background: '#8b5cf6' }} />
          </div>
          <span style={{ fontSize: '0.72rem', color: isActive ? '#c4b5fd' : '#cbd5e1', fontWeight: 500 }}>
            {visiblePassed}/{visibleTotal}
          </span>
        </div>
      )}
    </button>
  );
});
QuestionTab.displayName = 'QuestionTab';

// ── Main Test Screen ───────────────────────────────────────────────────────────
export default function CandidateTestScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [runResults, setRunResults] = useState([]);
  const [runOutput, setRunOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedQuestions, setSubmittedQuestions] = useState(new Set());
  const [questionProgress, setQuestionProgress] = useState({}); // { questionId: { passed, total } }
  const [disqualified, setDisqualified] = useState(false);
  const [isSuperseded, setIsSuperseded] = useState(false);
  const [supersededMessage, setSupersededMessage] = useState('');
  const { warningMessage, showWarning, dismissWarning } = useViolationNotification(6000);
  const [loadError, setLoadError] = useState('');
  const heartbeatRef = useRef(null);
  const isSubmittingAll = useRef(false);
  const saveStatusTimerRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const codeRef = useRef('');
  const languageRef = useRef('python');
  const activeQuestionRef = useRef(null);

  // ── FEATURE-006: Tabbed Testcase & Test Result State ────────────────────────
  const [selectedCaseTab, setSelectedCaseTab] = useState(0); // 0-indexed case tab
  const [selectedResultTab, setSelectedResultTab] = useState(0); // 0-indexed result tab
  const [customCasesByQuestion, setCustomCasesByQuestion] = useState({}); // { [qId]: string[][] }
  const [runtimeMs, setRuntimeMs] = useState(null);
  const [lastRunStatus, setLastRunStatus] = useState(null); // 'ACCEPTED' | 'WRONG_ANSWER' | 'RUNTIME_ERROR' | 'CUSTOM' | null

  // ── Resizable & Collapsible Questions Panel (BUG-10) ────────────────────────
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = sessionStorage.getItem('questions_panel_collapsed');
    return saved === 'true';
  });
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = sessionStorage.getItem('questions_panel_width');
    return saved ? Math.max(180, Math.min(480, parseInt(saved, 10))) : 260;
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(panelWidth);

  useEffect(() => {
    sessionStorage.setItem('questions_panel_collapsed', String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    sessionStorage.setItem('questions_panel_width', String(panelWidth));
  }, [panelWidth]);

  const handleMouseDown = useCallback((e) => {
    if (isCollapsed) return;
    setIsDragging(true);
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = panelWidth;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }, [isCollapsed, panelWidth]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const delta = e.clientX - dragStartXRef.current;
      const newWidth = Math.max(180, Math.min(480, dragStartWidthRef.current + delta));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging]);

  // ── Resizable Question Details Panel (Width) ───────────────────────────────
  const [questionDetailWidth, setQuestionDetailWidth] = useState(() => {
    const saved = sessionStorage.getItem('test_question_detail_width');
    return saved ? Math.max(300, Math.min(850, parseInt(saved, 10))) : 460;
  });
  const [isDraggingDetail, setIsDraggingDetail] = useState(false);
  const dragStartDetailXRef = useRef(0);
  const dragStartDetailWidthRef = useRef(questionDetailWidth);

  useEffect(() => {
    sessionStorage.setItem('test_question_detail_width', String(questionDetailWidth));
  }, [questionDetailWidth]);

  const handleDetailMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDraggingDetail(true);
    dragStartDetailXRef.current = e.clientX;
    dragStartDetailWidthRef.current = questionDetailWidth;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }, [questionDetailWidth]);

  useEffect(() => {
    if (!isDraggingDetail) return;

    const handleMouseMove = (e) => {
      const delta = e.clientX - dragStartDetailXRef.current;
      const newWidth = Math.max(300, Math.min(850, dragStartDetailWidthRef.current + delta));
      setQuestionDetailWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsDraggingDetail(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDraggingDetail]);

  // ── Resizable Bottom Panel (Height) (BUG-11) ────────────────────────────────
  const [bottomHeight, setBottomHeight] = useState(() => {
    const saved = sessionStorage.getItem('test_bottom_panel_height');
    return saved ? Math.max(90, Math.min(500, parseInt(saved, 10))) : 200;
  });
  const [isDraggingHeight, setIsDraggingHeight] = useState(false);
  const dragStartYRef = useRef(0);
  const dragStartHeightRef = useRef(bottomHeight);

  useEffect(() => {
    sessionStorage.setItem('test_bottom_panel_height', String(bottomHeight));
  }, [bottomHeight]);

  const handleHeightMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDraggingHeight(true);
    dragStartYRef.current = e.clientY;
    dragStartHeightRef.current = bottomHeight;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';
  }, [bottomHeight]);

  useEffect(() => {
    if (!isDraggingHeight) return;

    const handleMouseMove = (e) => {
      const deltaY = dragStartYRef.current - e.clientY;
      const newHeight = Math.max(90, Math.min(500, dragStartHeightRef.current + deltaY));
      setBottomHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsDraggingHeight(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDraggingHeight]);

  const bottomPanelRef = useRef(null);

  // Load session from sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('testSession');
      if (!stored) {
        setLoadError('No active test session found. Please rejoin the test room from the beginning.');
        return;
      }
      const s = JSON.parse(stored);
      if (s.completed || (s.submissions && s.submissions.length > 0 && s.submissions.every((sub) => sub.status === 'SUBMITTED'))) {
        navigate('/candidate/complete', { replace: true });
        return;
      }
      if (!s || !s.test || !s.room) {
        setLoadError('Incomplete test session data. Please rejoin the test room.');
        return;
      }
      setSession(s);
      setLanguage(s.test.supportedLanguages?.[0] || 'python');

      // BUG-25: Populate draft cache from stored submissions (if resuming / rejoining)
      if (s.submissions && Array.isArray(s.submissions)) {
        s.submissions.forEach((sub) => {
          if (sub.status === 'SUBMITTED' || sub.status === 'AUTO_SUBMITTED_TIME_UP') {
            setSubmittedQuestions((prev) => new Set([...prev, sub.questionId]));
          }
          if (sub.savedCodeByLanguage) {
            Object.entries(sub.savedCodeByLanguage).forEach(([lang, c]) => {
              sessionStorage.setItem(`draft_${s.test._id}_${sub.questionId}_${lang}`, c);
            });
          }
          if (sub.language && sub.code) {
            sessionStorage.setItem(`draft_${s.test._id}_${sub.questionId}_${sub.language}`, sub.code);
          }
        });
      }
    } catch (err) {
      console.error('Failed to parse test session:', err);
      setLoadError('Failed to read test session data. Please rejoin the room.');
    }
  }, []);

  const activeQuestion = session?.questions?.[activeQuestionIdx];
  activeQuestionRef.current = activeQuestion;
  codeRef.current = code;
  languageRef.current = language;

  const visibleCases = useMemo(() => activeQuestion?.visibleTestCases || [], [activeQuestion]);
  const customCases = useMemo(() => {
    return (activeQuestion?._id ? customCasesByQuestion[activeQuestion._id] : []) || [];
  }, [activeQuestion?._id, customCasesByQuestion]);
  const firstCaseLinesCount = useMemo(() => {
    const firstInput = visibleCases[0]?.input || '';
    return Math.max(1, firstInput.split('\n').length);
  }, [visibleCases]);

  // ── FR-5.6: Server-side auto-submit is already handled by server timer.
  // Client-side timer expiry triggers submit-all as backup.
  const handleTimerExpire = useCallback(async () => {
    if (isSubmittingAll.current) return;
    isSubmittingAll.current = true;
    setIsSubmittingAllState(true);
    toast('⏰ Time is up! Submitting your test...', { icon: '⏰' });
    try {
      if (session?.test?._id) {
        await api.submitAll(session.test._id);
      }
      try {
        const stored = sessionStorage.getItem('testSession');
        if (stored) {
          const s = JSON.parse(stored);
          s.completed = true;
          sessionStorage.setItem('testSession', JSON.stringify(s));
        }
      } catch (_) {}
    } catch (_) {}
    toast.dismiss();
    navigate('/candidate/complete', { replace: true });
  }, [session, navigate]);

  const { formatted: timerDisplay, urgency } = useTimer(
    session?.candidateEndTime,
    handleTimerExpire
  );

  // ── FR-5.1: Socket heartbeat every 5s (§12.2 loop)
  // NFR: throttled — max one emit per 5s
  useEffect(() => {
    if (!session || !user) return;
    const token = localStorage.getItem('token');
    initSocket(token);
    emitCandidateJoin({
      candidateId: user.id,
      testId: session.test._id,
      roomId: session.room._id,
    });

    heartbeatRef.current = setInterval(() => {
      // FR-5.5: questionsCompleted = sum of (visiblePassed/visibleTotal) per question, capped at 1.0
      const questionsCompleted = (session.questions || []).reduce((sum, q) => {
        const prog = questionProgress[q._id] || { passed: 0, total: q.visibleTestCases?.length || 0 };
        return sum + Math.min(1.0, prog.total > 0 ? prog.passed / prog.total : 0);
      }, 0);

      emitCandidateHeartbeat({
        candidateId: user.id,
        testId: session.test._id,
        currentQuestionId: activeQuestion?._id,
        questionsCompleted,
      });
    }, 5000);

    return () => clearInterval(heartbeatRef.current);
  }, [session, user, activeQuestion, questionProgress]);

  // ── Client-Side AI Proctoring (FR-5.2, FR-5.3, FR-5.4, FR-7.1, FR-7.2) ────────
  const handleProctorWarning = useCallback((msg) => {
    showWarning(msg);
  }, [showWarning]);

  const proctoring = useProctoring({
    testId: session?.test?._id,
    roomId: session?.room?._id,
    candidateId: user?.id || user?._id,
    enabled: Boolean(session && user && !disqualified),
    allowInternalCopyPaste: false,
    onWarning: handleProctorWarning,
  });

  // Fetch initial violation count on test load / session ready (FEATURE-004)
  useEffect(() => {
    if (!session?.test?._id) return;
    let isMounted = true;
    api
      .getViolationCount(session.test._id)
      .then((res) => {
        if (isMounted && typeof res.data?.violationCount === 'number') {
          console.log('[ViolationCounter] Coding Test initial violation count:', res.data.violationCount);
          setViolationCount(res.data.violationCount);
        }
      })
      .catch((err) => {
        console.warn('[ViolationCounter] Failed to fetch initial violation count:', err);
      });
    return () => {
      isMounted = false;
    };
  }, [session?.test?._id]);

  // ── Socket: candidate:warning + candidate:violation-updated + candidate:disqualified + test:ended ───────────
  useEffect(() => {
    const onWarning = ({ violationType, message, violationCount: count }) => {
      if (isSubmittingAll.current) return;
      if (typeof count === 'number') {
        setViolationCount(count);
      }
      if (violationType === 'CAMERA_DISCONNECTED') {
        // BUG-40: Camera disconnect is handled exclusively by the full-screen blocking overlay.
        // Do not display a separate, dismissible top banner or toast.
        return;
      }
      showWarning(message);
    };

    const onViolationUpdated = (data) => {
      if (typeof data?.violationCount === 'number') {
        console.log('[ViolationCounter] Real-time violation update:', data.violationCount);
        setViolationCount(data.violationCount);
      }
    };

    const onDisqualified = ({ reason }) => {
      setDisqualified(true);
      toast.error('🚫 You have been disqualified from this test.', { duration: 0 });
    };

    const onEnded = () => {
      toast('📢 Test has ended. Submitting...', { icon: '📢' });
      handleTimerExpire();
    };

    const onSuperseded = (data) => {
      if (
        data?.testId === session?.test?._id &&
        data?.newSessionId &&
        session?.submissionSessionId &&
        data.newSessionId !== session.submissionSessionId
      ) {
        console.warn('[Session] Exam session superseded by new session:', data.newSessionId);
        setIsSuperseded(true);
        if (data.message) setSupersededMessage(data.message);
      }
    };

    onCandidateWarning(onWarning);
    onCandidateViolationUpdated(onViolationUpdated);
    onCandidateDisqualified(onDisqualified);
    onTestEnded(onEnded);
    onSessionSuperseded(onSuperseded);

    return () => {
      toast.dismiss();
      offCandidateWarning(onWarning);
      offCandidateViolationUpdated(onViolationUpdated);
      offCandidateDisqualified(onDisqualified);
      offTestEnded(onEnded);
      offSessionSuperseded(onSuperseded);
    };
  }, [session?.test?._id, session?.submissionSessionId, handleTimerExpire, showWarning]);

  // ── FR-5.4: Copy-paste disabled in editor ─────────────────────────────────────
  // Monaco editor handles this via options; also prevent at DOM level for textarea/inputs
  const preventCopyPaste = useCallback((e) => {
    // FR-5.4: Ctrl+C, Ctrl+V, right-click all call preventDefault()
    e.preventDefault();
    toast('Copy-paste is disabled during the test.', { icon: '🚫', duration: 2000 });
  }, []);

  // ── Autosave Helper (Saves to both sessionStorage and Backend POST /submissions/:qId/save) ──
  const saveCodeToBackend = useCallback(async (qId, lang, codeToSave) => {
    if (!qId || codeToSave === undefined || isSubmittingAll.current) return;
    try {
      setSaveStatus('saving');
      // 1. Synchronously persist to sessionStorage under per-question per-language key
      if (session?.test?._id) {
        const key = `draft_${session.test._id}_${qId}_${lang}`;
        sessionStorage.setItem(key, codeToSave);
      }

      // 2. Call backend POST /submissions/:questionId/save (no evaluation)
      await api.saveCode(qId, { code: codeToSave, language: lang });

      setSaveStatus('saved');
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = setTimeout(() => {
        setSaveStatus('idle');
      }, 2500);
    } catch (err) {
      console.error('[Autosave] Error saving code:', err);
      setSaveStatus('error');
      if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
      saveStatusTimerRef.current = setTimeout(() => {
        setSaveStatus('idle');
      }, 3500);
    }
  }, [session?.test?._id]);

  // ── Question Switch Handler (Requirement 1: Autosave before navigating away) ──
  const handleSelectQuestion = useCallback((newIdx) => {
    if (proctoring?.isCameraDisconnected) return;
    if (newIdx === activeQuestionIdx) return;
    if (activeQuestionRef.current && codeRef.current !== undefined) {
      saveCodeToBackend(activeQuestionRef.current._id, languageRef.current, codeRef.current);
    }
    setActiveQuestionIdx(newIdx);
    setSelectedCaseTab(0);
    setSelectedResultTab(0);
  }, [activeQuestionIdx, saveCodeToBackend, proctoring?.isCameraDisconnected]);

  // ── Custom Test Case Handlers (FEATURE-006) ──────────────────────────────────
  const handleAddCustomCase = useCallback(() => {
    if (!activeQuestion?._id) return;
    const emptyLines = Array(firstCaseLinesCount).fill('');
    const curCustom = customCasesByQuestion[activeQuestion._id] || [];
    const nextCustom = [...curCustom, emptyLines];
    setCustomCasesByQuestion((prev) => ({
      ...prev,
      [activeQuestion._id]: nextCustom,
    }));
    setSelectedCaseTab(visibleCases.length + nextCustom.length - 1);
  }, [activeQuestion?._id, firstCaseLinesCount, visibleCases.length, customCasesByQuestion]);

  const handleCustomCaseLineChange = useCallback((customIdx, lineIdx, value) => {
    if (!activeQuestion?._id) return;
    setCustomCasesByQuestion((prev) => {
      const curCustom = prev[activeQuestion._id] || [];
      const updated = curCustom.map((c, idx) => {
        if (idx !== customIdx) return c;
        const copyLines = [...c];
        copyLines[lineIdx] = value;
        return copyLines;
      });
      return { ...prev, [activeQuestion._id]: updated };
    });
  }, [activeQuestion?._id]);

  // ── Language Change Handler (Requirement 2: Autosave code under current language before switching) ──
  const handleLanguageChange = useCallback((newLang) => {
    if (proctoring?.isCameraDisconnected) return;
    if (newLang === languageRef.current) return;
    if (activeQuestionRef.current && codeRef.current !== undefined) {
      saveCodeToBackend(activeQuestionRef.current._id, languageRef.current, codeRef.current);
    }
    setLanguage(newLang);
  }, [saveCodeToBackend, proctoring?.isCameraDisconnected]);

  // ── Code Change Handler (Debounced typing autosave + instant synchronous local persistence) ──
  const handleCodeChange = useCallback((val) => {
    if (proctoring?.isCameraDisconnected) return;
    const newCode = val || '';
    setCode(newCode);
    codeRef.current = newCode;

    // Instant local sync
    if (activeQuestionRef.current && session?.test?._id) {
      const key = `draft_${session.test._id}_${activeQuestionRef.current._id}_${languageRef.current}`;
      sessionStorage.setItem(key, newCode);
    }

    // Debounce background API save (after 2s of inactivity)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      if (activeQuestionRef.current && !disqualified) {
        saveCodeToBackend(activeQuestionRef.current._id, languageRef.current, newCode);
      }
    }, 2000);
  }, [session?.test?._id, disqualified, saveCodeToBackend]);

  // ── Periodic Autosave every 20s as Safety Net (Requirements 3 & 4) ────────────
  useAutosave(
    useCallback(async () => {
      if (!activeQuestionRef.current || codeRef.current === undefined || disqualified) return;
      saveCodeToBackend(activeQuestionRef.current._id, languageRef.current, codeRef.current);
    }, [disqualified, saveCodeToBackend]),
    20000,
    !!session && !disqualified
  );

  // ── Run code against visible test cases / custom testcase (FEATURE-006) ──────
  const handleRun = async () => {
    if (proctoring?.isCameraDisconnected) return;
    if (!activeQuestion || !code) return;
    saveCodeToBackend(activeQuestion._id, language, code);
    setIsRunning(true);
    setRunResults([]);
    setRunOutput('');
    setLastRunStatus(null);

    const isCustomSelected = selectedCaseTab >= visibleCases.length;
    let customInputString = null;
    if (isCustomSelected) {
      const customIdx = selectedCaseTab - visibleCases.length;
      const lines = customCases[customIdx] || [];
      customInputString = lines.join('\n');
    }

    try {
      const payload = {
        code,
        language,
        ...(customInputString !== null ? { customInput: customInputString } : {}),
      };

      const { data } = await api.runCode(activeQuestion._id, payload);
      const results = data.visibleTestResults || [];
      setRunOutput(data.output || '');
      setRunResults(results);
      setRuntimeMs(typeof data.runtimeMs === 'number' ? data.runtimeMs : 0);

      const hasError = results.some((r) => r.error);
      if (hasError) {
        setLastRunStatus('RUNTIME_ERROR');
      } else if (data.isCustom || isCustomSelected) {
        setLastRunStatus('CUSTOM');
      } else {
        const allPassed = results.length > 0 && results.every((r) => r.passed);
        setLastRunStatus(allPassed ? 'ACCEPTED' : 'WRONG_ANSWER');
      }

      setSelectedResultTab(selectedCaseTab);
    } catch (err) {
      setRunOutput(err.response?.data?.error || 'Execution failed');
      setLastRunStatus('RUNTIME_ERROR');
    } finally {
      setIsRunning(false);
    }
  };

  // ── Submit single question ────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (proctoring?.isCameraDisconnected) return;
    if (!activeQuestion || !code || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { data } = await api.submitCode(activeQuestion._id, { code, language });
      const sub = data.submission;
      setSubmittedQuestions((prev) => new Set([...prev, activeQuestion._id]));
      if (session?.test?._id) {
        const key = `draft_${session.test._id}_${activeQuestion._id}_${language}`;
        sessionStorage.setItem(key, code);
      }
      setQuestionProgress((prev) => ({
        ...prev,
        [activeQuestion._id]: {
          passed: sub.visibleTestCasesPassed,
          total: sub.visibleTestCasesTotal,
        },
      }));
      toast.success(`Q${activeQuestionIdx + 1} submitted! ${sub.visibleTestCasesPassed}/${sub.visibleTestCasesTotal} visible cases passed.`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Submit failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [isSubmittingAllState, setIsSubmittingAllState] = useState(false);
  const [violationCount, setViolationCount] = useState(0);

  // ── Submit all ────────────────────────────────────────────────────────────────
  const handleSubmitAll = async () => {
    if (isSubmittingAllState || isSubmittingAll.current) return;
    if (!window.confirm('Submit the entire test? This cannot be undone.')) return;

    setIsSubmittingAllState(true);
    isSubmittingAll.current = true;
    console.log('[SubmitAll] Starting final test submission flow...');

    try {
      // 1. Save current active question code draft before final submit
      if (activeQuestion?._id && code) {
        try {
          await saveCodeToBackend(activeQuestion._id, code, language);
        } catch (_) {}
      }

      // 2. Execute submitAll API request
      if (session?.test?._id) {
        console.log(`[SubmitAll] Calling POST /tests/${session.test._id}/submit-all...`);
        await api.submitAll(session.test._id);
        console.log('[SubmitAll] Final submitAll succeeded!');
      }

      // 3. Mark session completed in sessionStorage
      try {
        const stored = sessionStorage.getItem('testSession');
        if (stored) {
          const s = JSON.parse(stored);
          s.completed = true;
          sessionStorage.setItem('testSession', JSON.stringify(s));
        }
      } catch (_) {}

      // 4. Success feedback & redirect to completion page
      toast.dismiss();
      toast.success('Test submitted successfully!');
      navigate('/candidate/complete', { replace: true });
    } catch (err) {
      console.error('[SubmitAll] Final submission error:', err);
      const errMsg = err.response?.data?.error || err.message || 'Submit all failed';
      toast.error(`Submit failed: ${errMsg}. Please try again.`);
      setIsSubmittingAllState(false);
      isSubmittingAll.current = false;
    }
  };

  const defaultTemplates = useMemo(() => ({
    python: `# Q${activeQuestionIdx + 1}: ${activeQuestion?.title || 'Solution'}\nimport sys\n\ndef solve():\n    # Write your solution here\n    pass\n\nif __name__ == '__main__':\n    solve()\n`,
    javascript: `// Q${activeQuestionIdx + 1}: ${activeQuestion?.title || 'Solution'}\nfunction solve() {\n    // Write your solution here\n}\n`,
    cpp: `// Q${activeQuestionIdx + 1}: ${activeQuestion?.title || 'Solution'}\n#include <iostream>\n#include <vector>\n#include <string>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n`,
    c: `// Q${activeQuestionIdx + 1}: ${activeQuestion?.title || 'Solution'}\n#include <stdio.h>\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n`,
    java: `// Q${activeQuestionIdx + 1}: ${activeQuestion?.title || 'Solution'}\nimport java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        // Write your solution here\n        Scanner sc = new Scanner(System.in);\n    }\n}\n`,
    react: `// Q${activeQuestionIdx + 1}: ${activeQuestion?.title || 'Solution'}\nimport React from 'react';\n\nexport default function Solution() {\n    return (\n        <div>\n            {/* Write your React solution here */}\n        </div>\n    );\n}\n`,
  }), [activeQuestionIdx, activeQuestion?.title]);

  // Set starter code or restore saved draft when question or language changes
  useEffect(() => {
    if (!activeQuestion || !session?.test?._id) {
      setCode('');
      codeRef.current = '';
      return;
    }

    const key = `draft_${session.test._id}_${activeQuestion._id}_${language}`;
    const saved = sessionStorage.getItem(key);

    if (saved !== null) {
      setCode(saved);
      codeRef.current = saved;
      return;
    }

    // Restore from backend if not yet in local storage (e.g. reload / first open)
    let isMounted = true;
    api.getQuestion(session.test._id, activeQuestion._id)
      .then((res) => {
        if (!isMounted) return;
        const sub = res.data?.submission;
        let restoredCode = null;

        if (sub) {
          if (sub.status === 'SUBMITTED' || sub.status === 'AUTO_SUBMITTED_TIME_UP') {
            setSubmittedQuestions((prev) => new Set([...prev, activeQuestion._id]));
          }
          if (sub.savedCodeByLanguage && sub.savedCodeByLanguage[language]) {
            restoredCode = sub.savedCodeByLanguage[language];
          } else if (sub.language === language && sub.code) {
            restoredCode = sub.code;
          }
        }

        if (restoredCode !== null) {
          sessionStorage.setItem(key, restoredCode);
          setCode(restoredCode);
          codeRef.current = restoredCode;
        } else {
          const tmpl = defaultTemplates[language] || '// Write your solution here\n';
          sessionStorage.setItem(key, tmpl);
          setCode(tmpl);
          codeRef.current = tmpl;
        }
      })
      .catch(() => {
        if (!isMounted) return;
        const tmpl = defaultTemplates[language] || '// Write your solution here\n';
        sessionStorage.setItem(key, tmpl);
        setCode(tmpl);
        codeRef.current = tmpl;
      });

    return () => {
      isMounted = false;
    };
  }, [activeQuestion?._id, language, session?.test?._id, defaultTemplates]);

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 32, background: '#F8FAFC' }}>
        <div style={{ fontSize: '3rem' }}>⚠️</div>
        <h2 style={{ color: '#1A2B3C', fontSize: '1.4rem', fontWeight: 700 }}>Unable to Load Test Session</h2>
        <p style={{ color: '#64748B', maxWidth: 460, textAlign: 'center', fontSize: '0.9rem' }}>{loadError}</p>
        <button
          type="button"
          onClick={() => navigate('/candidate/join')}
          className="btn btn-primary"
          style={{ padding: '8px 20px', fontSize: '0.85rem' }}
        >
          Return to Join Room
        </button>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
        <div className="spinner spinner-dark" style={{ width: 40, height: 40, borderWidth: 3 }} />
        <p style={{ color: '#64748B', fontSize: '0.85rem' }}>Loading test environment...</p>
      </div>
    );
  }

  // ── Disqualified screen ───────────────────────────────────────────────────────
  if (disqualified) {
    return (
      <div style={{
        minHeight: '100vh', background: '#1A2B3C', display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 32,
      }}>
        <div style={{ fontSize: '4rem' }}>🚫</div>
        <h1 style={{ color: 'white', fontSize: '2rem' }}>Disqualified</h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', maxWidth: 480 }}>
          You have been disqualified from this test by the proctor.
          Please contact the exam coordinator for further instructions.
        </p>
      </div>
    );
  }

  const isGlowTheme = session?.test?.testType !== 'AI_TEST';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ── Fixed Stacked Header: (a) Test name + Room/ID row, then (b) Timer + Action row ── */}
      <div className="test-screen-header">
        {/* Row (a): Test Name & Room ID Badge */}
        <div className="test-header-top-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src={globussoftLogo}
              alt="Globussoft Technology"
              style={{ height: 28, width: 'auto', objectFit: 'contain', display: 'block' }}
            />
            <span style={{ color: 'white', fontWeight: 700, fontSize: '0.95rem', letterSpacing: '0.01em' }}>
              {session.test.title}
            </span>
            <span className="badge badge-teal" style={{ fontSize: '0.75rem', padding: '3px 10px' }}>
              {session.room.roomName || session.room.roomCode}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.7)' }}>
              Candidate: <strong style={{ color: 'white' }}>{user?.name || user?.email}</strong>
            </span>
          </div>
        </div>

        {/* Row (b): Timer & Actions */}
        <div className="timer-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', fontWeight: 500 }}>
              Progress:
            </span>
            <span style={{ color: 'white', fontWeight: 600, fontSize: '0.85rem' }}>
              {submittedQuestions.size}/{session.questions?.length || 0} Submitted
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', fontWeight: 600 }}>
              Time Remaining:
            </span>
            <span className={`timer-countdown ${urgency}`} aria-live="polite" aria-label="Time remaining">
              {timerDisplay}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              id="submit-all-btn"
              className="btn btn-danger btn-sm"
              onClick={handleSubmitAll}
              disabled={isSubmittingAll.current || disqualified}
              style={{ fontWeight: 700, padding: '6px 16px' }}
            >
              Submit All &amp; Finish
            </button>
          </div>
        </div>
      </div>

      {/* Warning banner with 6s auto-dismiss and interactive ✕ (BUG-49) */}
      <ViolationNotificationBanner
        message={warningMessage}
        onDismiss={dismissWarning}
        autoDismissMs={6000}
      />

      {/* ── Main Layout with Glowing Panels and Resizers (BUG-10, BUG-11, FEATURE-005) ── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          position: 'relative',
          background: '#0b0c16',
          padding: isGlowTheme ? '10px 14px' : 0,
          gap: isGlowTheme ? 12 : 0,
        }}
      >
        {/* ── Left Container: Questions List Sidebar + Resizer + Question Details (Purple Glow) ── */}
        <div
          className={isGlowTheme ? 'panel-glow-purple' : ''}
          style={{
            display: 'flex',
            borderRadius: isGlowTheme ? 10 : 0,
            background: '#13141f',
            overflow: 'hidden',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          {/* ── Question List sidebar ─────────────────────────────────────────── */}
          <div
            style={{
              width: isCollapsed ? 58 : panelWidth,
              minWidth: isCollapsed ? 58 : panelWidth,
              maxWidth: isCollapsed ? 58 : 480,
              flexShrink: 0,
              background: '#151624',
              borderRight: isGlowTheme ? '1px solid rgba(139, 92, 246, 0.45)' : '1px solid #23253a',
              boxShadow: isGlowTheme ? '1px 0 8px rgba(124, 58, 237, 0.25)' : 'none',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              transition: isDragging ? 'none' : 'width 200ms cubic-bezier(0.4, 0, 0.2, 1), min-width 200ms cubic-bezier(0.4, 0, 0.2, 1)',
              zIndex: 5,
            }}
          >
            {/* Header with Title + Toggle Button */}
            <div
              style={{
                padding: isCollapsed ? '12px 6px' : '12px 14px',
                borderBottom: isGlowTheme ? '1px solid rgba(139, 92, 246, 0.25)' : '1px solid #23253a',
                background: '#18192a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: isCollapsed ? 'center' : 'space-between',
                minHeight: 45,
              }}
            >
              {!isCollapsed && (
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Questions
                </div>
              )}
              <button
                type="button"
                onClick={() => setIsCollapsed((prev) => !prev)}
                title={isCollapsed ? 'Expand Questions Panel' : 'Collapse Questions Panel'}
                style={{
                  background: 'transparent',
                  border: '1px solid #333852',
                  borderRadius: 4,
                  cursor: 'pointer',
                  padding: '3px 6px',
                  fontSize: '0.72rem',
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#282b42';
                  e.currentTarget.style.color = '#f1f5f9';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.color = '#94a3b8';
                }}
              >
                {isCollapsed ? '▶' : '◀'}
              </button>
            </div>

            {(!session.questions || session.questions.length === 0) ? (
              <div style={{ padding: 16, textAlign: 'center', color: '#6b7280', fontSize: '0.8rem' }}>
                {!isCollapsed ? 'No questions found for this test session.' : '—'}
              </div>
            ) : (
              session.questions.map((q, idx) => (
                <QuestionTab
                  key={q._id}
                  question={q}
                  index={idx}
                  isActive={idx === activeQuestionIdx}
                  visiblePassed={questionProgress[q._id]?.passed || 0}
                  visibleTotal={questionProgress[q._id]?.total || q.visibleTestCases?.length || 0}
                  isSubmitted={submittedQuestions.has(q._id)}
                  isCollapsed={isCollapsed}
                  disabled={Boolean(proctoring?.isCameraDisconnected)}
                  onClick={() => handleSelectQuestion(idx)}
                />
              ))
            )}
          </div>

          {/* Resizable Divider Handle (when not collapsed) */}
          {!isCollapsed && (
            <div
              onMouseDown={handleMouseDown}
              style={{
                width: 6,
                cursor: 'col-resize',
                background: isDragging ? '#8b5cf6' : '#1c1e2f',
                borderRight: isDragging
                  ? '1px solid #8b5cf6'
                  : isGlowTheme
                  ? '1px solid rgba(139, 92, 246, 0.45)'
                  : '1px solid #23253a',
                boxShadow: isGlowTheme ? '1px 0 8px rgba(124, 58, 237, 0.25)' : 'none',
                flexShrink: 0,
                zIndex: 10,
                transition: 'background 150ms ease',
                position: 'relative',
              }}
              title="Drag to resize Questions panel"
              onMouseEnter={(e) => {
                if (!isDragging) e.currentTarget.style.background = 'rgba(139, 92, 246, 0.4)';
              }}
              onMouseLeave={(e) => {
                if (!isDragging) e.currentTarget.style.background = '#1c1e2f';
              }}
            />
          )}

          {/* Question panel */}
          <div
            className="test-question-panel"
            style={{
              width: questionDetailWidth,
              minWidth: 300,
              maxWidth: 850,
              flexShrink: 0,
              background: '#13141f',
              borderRight: 'none',
              overflowY: 'auto',
              transition: isDraggingDetail ? 'none' : 'width 150ms ease',
            }}
          >
            {activeQuestion && (
              <>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: '#f8fafc' }}>
                      Q{activeQuestionIdx + 1}. {activeQuestion.title}
                    </span>
                    {submittedQuestions.has(activeQuestion._id) && (
                      <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '0.9em', lineHeight: 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>✓</span>
                        <span>Submitted</span>
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {activeQuestion.difficulty && (
                      <span className={`badge badge-${activeQuestion.difficulty === 'HARD' ? 'danger' : activeQuestion.difficulty === 'MEDIUM' ? 'warning' : 'success'}`}>
                        {activeQuestion.difficulty}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ lineHeight: 1.7, color: '#cbd5e1', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                  {activeQuestion.description}
                </div>

                {activeQuestion.inputFormat && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#f8fafc', marginBottom: 4 }}>Input Format</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: '#191b2c', border: '1px solid #282a40', color: '#cbd5e1', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
                      {activeQuestion.inputFormat}
                    </div>
                  </div>
                )}

                {activeQuestion.outputFormat && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#f8fafc', marginBottom: 4 }}>Output Format</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: '#191b2c', border: '1px solid #282a40', color: '#cbd5e1', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
                      {activeQuestion.outputFormat}
                    </div>
                  </div>
                )}

                {activeQuestion.constraints && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#f8fafc', marginBottom: 4 }}>Constraints</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.35)', color: '#fef08a', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
                      {activeQuestion.constraints}
                    </div>
                  </div>
                )}

                {/* Visible test cases (FR-4.2: shown to candidate) */}
                {activeQuestion.visibleTestCases?.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#f8fafc', marginBottom: 8 }}>
                      Sample Test Cases
                    </div>
                    {activeQuestion.visibleTestCases.map((tc, i) => (
                      <div key={i} style={{ background: '#191b2c', borderRadius: 6, padding: 10, marginBottom: 8, border: '1px solid #282a40' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>
                          Example {i + 1}
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#e2e8f0' }}>
                          <div><strong>Input:</strong> {tc.input}</div>
                          <div><strong>Output:</strong> {tc.expectedOutput}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Question Detail Resizable Divider Handle */}
        <div
          onMouseDown={handleDetailMouseDown}
          style={{
            width: 8,
            cursor: 'col-resize',
            background: isDraggingDetail ? '#8b5cf6' : 'transparent',
            borderRight: isDraggingDetail ? '1px solid #8b5cf6' : 'none',
            flexShrink: 0,
            zIndex: 10,
            transition: 'background 150ms ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
          }}
          title="Drag to resize Question Details panel"
          onMouseEnter={(e) => {
            if (!isDraggingDetail) e.currentTarget.style.background = 'rgba(139, 92, 246, 0.3)';
          }}
          onMouseLeave={(e) => {
            if (!isDraggingDetail) e.currentTarget.style.background = 'transparent';
          }}
        >
          {/* Visual drag handle grip bar */}
          <div
            style={{
              width: 2,
              height: 32,
              borderRadius: 1,
              background: isDraggingDetail ? '#ffffff' : '#475569',
            }}
          />
        </div>

        {/* ── Right Column: Code Editor (Green Glow) + Resizer + Bottom Panel (Purple Glow) ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: isGlowTheme ? 8 : 0, overflow: 'hidden', minWidth: 350 }}>

          {/* ── Top Panel: Editor (Green Glow) ── */}
          <div
            className={isGlowTheme ? 'panel-glow-green' : ''}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: isGlowTheme ? 10 : 0,
              background: '#1e1e2e',
              overflow: 'hidden',
              minHeight: 160,
            }}
          >
            {/* Editor toolbar */}
            <div className="editor-toolbar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <select
                  id="language-select"
                  value={language}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  disabled={disqualified || proctoring?.isCameraDisconnected}
                  style={{
                    background: '#2d2d44', color: 'white', border: '1px solid #444',
                    borderRadius: 6, padding: '4px 10px', fontSize: '0.85rem',
                    fontFamily: 'monospace', cursor: proctoring?.isCameraDisconnected ? 'not-allowed' : 'pointer',
                  }}
                >
                  {(session.test.supportedLanguages || ['python']).map((lang) => (
                    <option key={lang} value={lang}>{lang.toUpperCase()}</option>
                  ))}
                </select>

                {/* Visual Autosave Status Indicator (Requirement 6) */}
                {saveStatus === 'saving' && (
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className="spinner" style={{ width: 10, height: 10, borderTopColor: '#94a3b8', display: 'inline-block' }} />
                    Saving...
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span style={{ fontSize: '0.75rem', color: '#2ECC71', fontWeight: 600 }}>
                    ✓ Saved
                  </span>
                )}
                {saveStatus === 'error' && (
                  <span style={{ fontSize: '0.75rem', color: '#E74C3C', fontWeight: 600 }}>
                    ⚠️ Save failed
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  id="run-code-btn"
                  className="btn btn-secondary btn-sm"
                  onClick={handleRun}
                  disabled={isRunning || !code || disqualified || proctoring?.isCameraDisconnected}
                  style={{ background: '#2d2d44', color: '#cdd6f4', border: '1px solid #444' }}
                >
                  {isRunning ? <><span className="spinner" style={{ borderTopColor: '#cdd6f4', width: 14, height: 14 }} /> Running...</> : '▶ Run'}
                </button>
                <button
                  id="submit-question-btn"
                  className="btn btn-primary btn-sm"
                  onClick={handleSubmit}
                  disabled={isSubmitting || !code || submittedQuestions.has(activeQuestion?._id) || disqualified || proctoring?.isCameraDisconnected}
                >
                  {isSubmitting ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Submitting...</>
                    : submittedQuestions.has(activeQuestion?._id) ? '✓ Submitted'
                    : 'Submit Question'}
                </button>
              </div>
            </div>

            {/* Monaco Editor — FR-5.4: copy-paste disabled */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <Editor
                height="100%"
                language={LANGUAGE_MAP[language] || 'python'}
                value={code}
                onChange={handleCodeChange}
                theme="vs-dark"
                options={{
                  fontSize: 14,
                  fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                  fontLigatures: true,
                  minimap: { enabled: false },
                  lineNumbers: 'on',
                  // FR-5.4: Disable copy-paste in editor + Lock to readOnly on CAMERA_DISCONNECTED
                  readOnly: Boolean(disqualified || proctoring?.isCameraDisconnected),
                  copyWithSyntaxHighlighting: false,
                  // Prevent paste from outside by catching events
                  contextmenu: false, // FR-5.4: disable right-click context menu
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  automaticLayout: true,
                }}
                onMount={(editor) => {
                  // FR-5.4: Intercept Ctrl+C / Ctrl+V at the Monaco level
                  editor.addCommand(
                    // Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.KeyC
                    2048 | 33,
                    () => toast('Copy is disabled during the test.', { icon: '🚫', duration: 1500 })
                  );
                  editor.addCommand(
                    // Monaco.KeyMod.CtrlCmd | Monaco.KeyCode.KeyV
                    2048 | 52,
                    () => toast('Paste is disabled during the test.', { icon: '🚫', duration: 1500 })
                  );
                  // Autosave on blur (Requirement 3)
                  editor.onDidBlurEditorText(() => {
                    if (activeQuestionRef.current && !disqualified && codeRef.current !== undefined) {
                      saveCodeToBackend(activeQuestionRef.current._id, languageRef.current, codeRef.current);
                    }
                  });
                }}
              />
            </div>
          </div>

          {/* Horizontal Resizer Divider between Editor and Bottom Panel (BUG-11) */}
          <div
            onMouseDown={handleHeightMouseDown}
            style={{
              height: 6,
              cursor: 'row-resize',
              background: isDraggingHeight ? '#8b5cf6' : 'transparent',
              borderTop: isDraggingHeight ? '1px solid #8b5cf6' : 'none',
              borderBottom: isDraggingHeight ? '1px solid #8b5cf6' : 'none',
              zIndex: 10,
              position: 'relative',
              flexShrink: 0,
              transition: 'background 150ms ease',
            }}
            title="Drag to resize Editor / Output panel height"
            onMouseEnter={(e) => {
              if (!isDraggingHeight) e.currentTarget.style.background = 'rgba(139, 92, 246, 0.4)';
            }}
            onMouseLeave={(e) => {
              if (!isDraggingHeight) e.currentTarget.style.background = 'transparent';
            }}
          />

          {/* ── Side-by-Side Testcase & Test Result Split Panel (FEATURE-006 ADDENDUM, Purple Glow) ── */}
          <div
            ref={bottomPanelRef}
            className={isGlowTheme ? 'panel-glow-purple' : ''}
            style={{
              height: bottomHeight,
              display: 'flex',
              flexDirection: 'row',
              borderRadius: isGlowTheme ? 10 : 0,
              background: '#1e1e2e',
              overflow: 'hidden',
              position: 'relative',
              flexShrink: 0,
            }}
          >
            {/* ── Left Column: Testcase Panel ── */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                borderRight: '1px solid #282a40',
                background: '#13141f',
              }}
            >
              {/* Left Header */}
              <div
                style={{
                  height: 38,
                  background: '#161726',
                  borderBottom: '1px solid #282a40',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 14px',
                  flexShrink: 0,
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f8fafc', fontWeight: 700, fontSize: '0.85rem' }}>
                  <span style={{ color: '#10b981', fontSize: '0.9rem' }}>☑</span>
                  <span>Testcase</span>
                </div>
              </div>

              {/* Left Body (Scrollable) */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Case Tabs Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  {/* Admin-defined Visible Cases */}
                  {visibleCases.map((vc, idx) => {
                    const isSelected = selectedCaseTab === idx;
                    return (
                      <button
                        key={`admin-case-${idx}`}
                        type="button"
                        onClick={() => setSelectedCaseTab(idx)}
                        style={{
                          background: isSelected ? '#25273d' : 'transparent',
                          border: isSelected ? '1px solid #3b3e5b' : '1px solid transparent',
                          color: isSelected ? '#f8fafc' : '#94a3b8',
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: '0.82rem',
                          padding: '5px 12px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          transition: 'all 150ms ease',
                        }}
                      >
                        Case {idx + 1}
                      </button>
                    );
                  })}

                  {/* Candidate-added Custom Cases */}
                  {customCases.map((cc, cIdx) => {
                    const tabIdx = visibleCases.length + cIdx;
                    const isSelected = selectedCaseTab === tabIdx;
                    return (
                      <button
                        key={`custom-case-${cIdx}`}
                        type="button"
                        onClick={() => setSelectedCaseTab(tabIdx)}
                        style={{
                          background: isSelected ? '#25273d' : 'transparent',
                          border: isSelected ? '1px solid #3b3e5b' : '1px solid transparent',
                          color: isSelected ? '#f8fafc' : '#94a3b8',
                          fontWeight: isSelected ? 700 : 500,
                          fontSize: '0.82rem',
                          padding: '5px 12px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          transition: 'all 150ms ease',
                        }}
                      >
                        Case {visibleCases.length + cIdx + 1}
                      </button>
                    );
                  })}

                  {/* Add Case (+) Button */}
                  <button
                    type="button"
                    onClick={handleAddCustomCase}
                    title="Add new custom test case"
                    style={{
                      background: 'transparent',
                      border: '1px solid #333852',
                      color: '#94a3b8',
                      fontSize: '1rem',
                      padding: '3px 10px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                      transition: 'all 150ms ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = '#8b5cf6';
                      e.currentTarget.style.color = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = '#333852';
                      e.currentTarget.style.color = '#94a3b8';
                    }}
                  >
                    +
                  </button>
                </div>

                {/* Case Content: Stacked Boxes for input lines */}
                {selectedCaseTab < visibleCases.length ? (
                  // Admin case: read-only stacked boxes
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {((visibleCases[selectedCaseTab]?.input || '').split('\n')).map((line, lIdx) => (
                      <div
                        key={`admin-line-${lIdx}`}
                        style={{
                          background: '#1a1b2c',
                          border: '1px solid #282a40',
                          borderRadius: 8,
                          padding: '8px 12px',
                          color: '#f1f5f9',
                          fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                          fontSize: '0.85rem',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-all',
                        }}
                      >
                        {line || ' '}
                      </div>
                    ))}
                  </div>
                ) : (
                  // Candidate-added custom case: editable stacked input boxes
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(() => {
                      const customIdx = selectedCaseTab - visibleCases.length;
                      const lines = customCases[customIdx] || Array(firstCaseLinesCount).fill('');
                      return lines.map((lineVal, lIdx) => (
                        <input
                          key={`custom-line-${lIdx}`}
                          type="text"
                          value={lineVal}
                          onChange={(e) => handleCustomCaseLineChange(customIdx, lIdx, e.target.value)}
                          placeholder={`Input line ${lIdx + 1}`}
                          disabled={disqualified || proctoring?.isCameraDisconnected}
                          style={{
                            background: '#1a1b2c',
                            border: '1px solid #3b3e5b',
                            borderRadius: 8,
                            padding: '8px 12px',
                            color: '#f1f5f9',
                            fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                            fontSize: '0.85rem',
                            outline: 'none',
                            transition: 'border-color 150ms ease',
                          }}
                          onFocus={(e) => {
                            e.currentTarget.style.borderColor = '#8b5cf6';
                          }}
                          onBlur={(e) => {
                            e.currentTarget.style.borderColor = '#3b3e5b';
                          }}
                        />
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>

            {/* ── Right Column: Test Result Panel ── */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minWidth: 0,
                background: '#13141f',
              }}
            >
              {/* Right Header */}
              <div
                style={{
                  height: 38,
                  background: '#161726',
                  borderBottom: '1px solid #282a40',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 14px',
                  flexShrink: 0,
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#f8fafc', fontWeight: 700, fontSize: '0.85rem' }}>
                  <span style={{ color: '#10b981', fontFamily: 'monospace', fontWeight: 800 }}>&gt;_</span>
                  <span>Test Result</span>
                </div>
              </div>

              {/* Right Body (Scrollable) */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {!lastRunStatus && runResults.length === 0 && !runOutput ? (
                  <div style={{ color: '#6b7280', fontSize: '0.85rem', padding: '20px 0', textAlign: 'center' }}>
                    Click &quot;▶ Run&quot; to execute your code against test cases.
                  </div>
                ) : (
                  <>
                    {/* Top Status Header + Runtime */}
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                      {lastRunStatus === 'ACCEPTED' && (
                        <span style={{ color: '#22c55e', fontWeight: 800, fontSize: '1.15rem' }}>Accepted</span>
                      )}
                      {lastRunStatus === 'WRONG_ANSWER' && (
                        <span style={{ color: '#ef4444', fontWeight: 800, fontSize: '1.15rem' }}>Wrong Answer</span>
                      )}
                      {lastRunStatus === 'RUNTIME_ERROR' && (
                        <span style={{ color: '#ef4444', fontWeight: 800, fontSize: '1.15rem' }}>Runtime Error</span>
                      )}
                      {lastRunStatus === 'CUSTOM' && (
                        <span style={{ color: '#38bdf8', fontWeight: 800, fontSize: '1.15rem' }}>Finished</span>
                      )}
                      {runtimeMs !== null && (
                        <span style={{ color: '#94a3b8', fontSize: '0.85rem', marginLeft: 8 }}>
                          Runtime: <strong style={{ color: '#e2e8f0' }}>{runtimeMs} ms</strong>
                        </span>
                      )}
                    </div>

                    {/* Result Case Tabs Strip */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                      {visibleCases.map((vc, idx) => {
                        const res = runResults[idx];
                        const isSelected = selectedResultTab === idx;
                        const isPassed = res?.passed;
                        const hasError = Boolean(res?.error);

                        return (
                          <button
                            key={`res-tab-${idx}`}
                            type="button"
                            onClick={() => setSelectedResultTab(idx)}
                            style={{
                              background: isSelected ? '#25273d' : 'transparent',
                              border: isSelected ? '1px solid #3b3e5b' : '1px solid transparent',
                              color: isSelected ? '#f8fafc' : '#94a3b8',
                              fontWeight: isSelected ? 700 : 500,
                              fontSize: '0.82rem',
                              padding: '5px 12px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              transition: 'all 150ms ease',
                            }}
                          >
                            {res && (
                              <span
                                style={{
                                  color: hasError || !isPassed ? '#ef4444' : '#22c55e',
                                  fontSize: '0.75rem',
                                  fontWeight: 800,
                                }}
                              >
                                {hasError || !isPassed ? '✕' : '✓'}
                              </span>
                            )}
                            <span>Case {idx + 1}</span>
                          </button>
                        );
                      })}

                      {customCases.map((cc, cIdx) => {
                        const tabIdx = visibleCases.length + cIdx;
                        const isSelected = selectedResultTab === tabIdx;
                        const isCustomRun = runResults.length === 1 && runResults[0]?.isCustom;

                        return (
                          <button
                            key={`res-custom-${cIdx}`}
                            type="button"
                            onClick={() => setSelectedResultTab(tabIdx)}
                            style={{
                              background: isSelected ? '#25273d' : 'transparent',
                              border: isSelected ? '1px solid #3b3e5b' : '1px solid transparent',
                              color: isSelected ? '#f8fafc' : '#94a3b8',
                              fontWeight: isSelected ? 700 : 500,
                              fontSize: '0.82rem',
                              padding: '5px 12px',
                              borderRadius: 6,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              transition: 'all 150ms ease',
                            }}
                          >
                            {isCustomRun && (
                              <span style={{ color: '#38bdf8', fontSize: '0.75rem', fontWeight: 800 }}>▶</span>
                            )}
                            <span>Case {visibleCases.length + cIdx + 1}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Detail breakdown for selectedResultTab */}
                    {(() => {
                      const isCustomCase = selectedResultTab >= visibleCases.length;
                      const currentResult = isCustomCase
                        ? (runResults[0]?.isCustom ? runResults[0] : null)
                        : runResults[selectedResultTab];
                      const inputLines = isCustomCase
                        ? customCases[selectedResultTab - visibleCases.length] || []
                        : (visibleCases[selectedResultTab]?.input || '').split('\n');
                      const expectedOutput = isCustomCase
                        ? null
                        : (currentResult?.expectedOutput || visibleCases[selectedResultTab]?.expectedOutput || '');

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {/* Input Section */}
                          <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
                              Input
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {inputLines.map((line, lIdx) => (
                                <div
                                  key={`res-input-${lIdx}`}
                                  style={{
                                    background: '#1a1b2c',
                                    border: '1px solid #282a40',
                                    borderRadius: 8,
                                    padding: '8px 12px',
                                    color: '#f1f5f9',
                                    fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                                    fontSize: '0.85rem',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-all',
                                  }}
                                >
                                  {line || ' '}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Output Section */}
                          <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
                              Output
                            </div>
                            <div
                              style={{
                                background: '#1a1b2c',
                                border: currentResult?.error ? '1px solid #7f1d1d' : '1px solid #282a40',
                                borderRadius: 8,
                                padding: '8px 12px',
                                color: currentResult?.error ? '#fca5a5' : currentResult?.passed ? '#34d399' : '#f87171',
                                fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                                fontSize: '0.85rem',
                                whiteSpace: 'pre-wrap',
                                minHeight: 36,
                                wordBreak: 'break-all',
                              }}
                            >
                              {currentResult?.error
                                ? currentResult.error
                                : currentResult?.actualOutput !== undefined && currentResult?.actualOutput !== null
                                ? currentResult.actualOutput || '(Empty output)'
                                : runOutput || 'No output recorded.'}
                            </div>
                          </div>

                          {/* Expected Section (only for admin cases) */}
                          {!isCustomCase && (
                            <div>
                              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: 4 }}>
                                Expected
                              </div>
                              <div
                                style={{
                                  background: '#1a1b2c',
                                  border: '1px solid #282a40',
                                  borderRadius: 8,
                                  padding: '8px 12px',
                                  color: '#34d399',
                                  fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                                  fontSize: '0.85rem',
                                  whiteSpace: 'pre-wrap',
                                  minHeight: 36,
                                  wordBreak: 'break-all',
                                }}
                              >
                                {expectedOutput || '(None)'}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Shared Bottom Proctoring Status & Violation Footer (FEATURE-004) ── */}
      <TestFooter proctoring={proctoring} violationCount={violationCount} />

      {/* ── Movable AI Proctoring PIP Feed (FR-5.2, FR-7.1, FR-7.2) ── */}
      <DraggableWebcamPip videoRef={proctoring.videoRef} faceCount={proctoring.faceCount} />

      {/* ── Fullscreen Enforcement Lock Overlay (FR-5.2, FR-5.3, BUG-34) ── */}
      {!proctoring.isFullscreen && !disqualified && (
        <div
          id="fullscreen-blocking-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.98)',
            zIndex: 99999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            backdropFilter: 'blur(8px)',
          }}
        >
          <div style={{ fontSize: '3.5rem', marginBottom: 12 }}>⚠️</div>
          <h2 style={{ color: '#fff', fontSize: '1.6rem', marginBottom: 8, fontWeight: 800 }}>
            Fullscreen Mode Required
          </h2>
          <p style={{ color: '#94a3b8', maxWidth: 480, textAlign: 'center', marginBottom: 24, lineHeight: 1.6, fontSize: '0.9rem' }}>
            You are currently outside full-screen mode. This proctored assessment strictly requires fullscreen operation throughout the entire session (FR-5.2). Exiting has been logged.
          </p>
          <button
            id="re-enter-fullscreen-btn"
            onClick={proctoring.requestFullscreen}
            className="btn btn-primary btn-lg"
            style={{ fontSize: '1rem', padding: '12px 28px', fontWeight: 700 }}
          >
            ⛶ Re-enter Fullscreen Mode
          </button>
        </div>
      )}

      {/* Camera Disconnected Full-Screen Blocking Overlay (BUG-29, BUG-002) */}
      <CameraDisconnectedOverlay
        isVisible={Boolean(proctoring?.isCameraDisconnected)}
        timerDisplay={timerDisplay}
        hasHardwareCamera={Boolean(proctoring?.hasHardwareCamera)}
        isVerifyingFace={Boolean(proctoring?.isVerifyingFace)}
        onRetry={proctoring?.reconnectCamera}
        onSubmitAll={handleSubmitAll}
        isSubmitting={isSubmittingAllState}
        videoRef={proctoring?.videoRef}
      />

      {/* Session Superseded Full-Screen Blocking Overlay (BUG-53) */}
      <SessionSupersededOverlay
        isVisible={isSuperseded}
        message={supersededMessage}
      />
    </div>
  );
}
