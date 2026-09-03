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
  onCandidateDisqualified, offCandidateDisqualified,
  onTestEnded, offTestEnded,
} from '../../services/socketClient';
import { useAuth } from '../../hooks/useAuthContext';
import { useProctoring } from '../../hooks/useProctoring';
import DraggableWebcamPip from '../../shared/DraggableWebcamPip';
import CameraDisconnectedOverlay from '../components/CameraDisconnectedOverlay';
import ViolationNotificationBanner, { useViolationNotification } from '../components/ViolationNotificationBanner';
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
          background: isActive ? 'rgba(14, 124, 134, 0.12)' : 'transparent',
          border: 'none',
          borderLeft: isActive ? '3px solid #0E7C86' : '3px solid transparent',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          transition: 'background 150ms ease',
        }}
      >
        <span
          style={{
            fontWeight: 700,
            fontSize: '0.85rem',
            color: isActive ? '#0E7C86' : '#1A2B3C',
          }}
        >
          Q{index + 1}
        </span>
        {isSubmitted || isFullyPassed ? (
          <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700 }}>✓</span>
        ) : visibleTotal > 0 ? (
          <span style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>
            {visiblePassed}/{visibleTotal}
          </span>
        ) : (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: isActive ? '#0E7C86' : '#cbd5e1',
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
        background: isActive ? 'rgba(14, 124, 134, 0.1)' : 'transparent',
        border: 'none',
        borderLeft: isActive ? '3px solid #0E7C86' : '3px solid transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 200ms',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1A2B3C' }}>
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
          <div className="progress-bar-container" style={{ flex: 1 }}>
            <div className="progress-bar-fill" style={{ width: `${progress * 100}%` }} />
          </div>
          <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>
            {visiblePassed}/{visibleTotal}
          </span>
        </div>
      )}
    </button>
  );
});
QuestionTab.displayName = 'QuestionTab';

// ── Test Result row (memoized) ─────────────────────────────────────────────────
const TestCaseResult = memo(({ tc, index }) => (
  <div style={{
    padding: '8px 12px', borderRadius: 6, marginBottom: 6,
    background: tc.passed ? '#d1fae5' : '#fee2e2',
    border: `1px solid ${tc.passed ? '#6ee7b7' : '#fca5a5'}`,
    fontSize: '0.8rem',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <strong>Test {index + 1}</strong>
      <span style={{ color: tc.passed ? '#065f46' : '#991b1b', fontWeight: 700 }}>
        {tc.passed ? '✓ Passed' : '✗ Failed'}
      </span>
    </div>
    {tc.error && <div style={{ color: '#991b1b', fontFamily: 'monospace', fontSize: '0.75rem' }}>{tc.error}</div>}
    {!tc.passed && (
      <div style={{ color: '#374151', fontFamily: 'monospace', fontSize: '0.75rem', marginTop: 4 }}>
        Expected: <code style={{ background: 'rgba(0,0,0,0.05)', padding: '1px 4px', borderRadius: 3 }}>{tc.expectedOutput}</code>
        &nbsp;Got: <code style={{ background: 'rgba(0,0,0,0.05)', padding: '1px 4px', borderRadius: 3 }}>{tc.actualOutput}</code>
      </div>
    )}
  </div>
));
TestCaseResult.displayName = 'TestCaseResult';

// ── Main Test Screen ───────────────────────────────────────────────────────────
export default function CandidateTestScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('python');
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [customInput, setCustomInput] = useState('');
  const [runResults, setRunResults] = useState([]);
  const [runOutput, setRunOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedQuestions, setSubmittedQuestions] = useState(new Set());
  const [questionProgress, setQuestionProgress] = useState({}); // { questionId: { passed, total } }
  const [disqualified, setDisqualified] = useState(false);
  const { warningMessage, showWarning, dismissWarning } = useViolationNotification(6000);
  const [loadError, setLoadError] = useState('');
  const heartbeatRef = useRef(null);
  const isSubmittingAll = useRef(false);
  const saveStatusTimerRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const codeRef = useRef('');
  const languageRef = useRef('python');
  const activeQuestionRef = useRef(null);

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

  // ── Resizable Custom Input vs Output (Width) (BUG-11) ───────────────────────
  const [inputWidthPercent, setInputWidthPercent] = useState(() => {
    const saved = sessionStorage.getItem('test_custom_input_split');
    return saved ? Math.max(15, Math.min(85, parseFloat(saved))) : 50;
  });
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const bottomPanelRef = useRef(null);

  useEffect(() => {
    sessionStorage.setItem('test_custom_input_split', String(inputWidthPercent));
  }, [inputWidthPercent]);

  const handleSplitMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsDraggingSplit(true);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }, []);

  useEffect(() => {
    if (!isDraggingSplit) return;

    const handleMouseMove = (e) => {
      if (!bottomPanelRef.current) return;
      const rect = bottomPanelRef.current.getBoundingClientRect();
      if (rect.width > 0) {
        const percent = ((e.clientX - rect.left) / rect.width) * 100;
        setInputWidthPercent(Math.max(15, Math.min(85, percent)));
      }
    };

    const handleMouseUp = () => {
      setIsDraggingSplit(false);
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
  }, [isDraggingSplit]);

  // Load session from sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('testSession');
      if (!stored) {
        setLoadError('No active test session found. Please rejoin the test room from the beginning.');
        return;
      }
      const s = JSON.parse(stored);
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

  // ── FR-5.6: Server-side auto-submit is already handled by server timer.
  // Client-side timer expiry triggers submit-all as backup.
  const handleTimerExpire = useCallback(async () => {
    if (isSubmittingAll.current) return;
    isSubmittingAll.current = true;
    toast('⏰ Time is up! Submitting your test...', { icon: '⏰' });
    try {
      await api.submitAll(session.test._id);
    } catch (_) {}
    toast.dismiss();
    navigate('/candidate/complete');
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

  // ── Socket: candidate:warning + candidate:disqualified + test:ended ───────────
  useEffect(() => {
    const onWarning = ({ violationType, message }) => {
      if (isSubmittingAll.current) return;
      if (violationType === 'CAMERA_DISCONNECTED') {
        // BUG-40: Camera disconnect is handled exclusively by the full-screen blocking overlay.
        // Do not display a separate, dismissible top banner or toast.
        return;
      }
      showWarning(message);
    };

    const onDisqualified = ({ reason }) => {
      setDisqualified(true);
      toast.error('🚫 You have been disqualified from this test.', { duration: 0 });
    };

    const onEnded = () => {
      toast('📢 Test has ended. Submitting...', { icon: '📢' });
      handleTimerExpire();
    };

    onCandidateWarning(onWarning);
    onCandidateDisqualified(onDisqualified);
    onTestEnded(onEnded);

    return () => {
      toast.dismiss();
      offCandidateWarning(onWarning);
      offCandidateDisqualified(onDisqualified);
      offTestEnded(onEnded);
    };
  }, [handleTimerExpire]);

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
  }, [activeQuestionIdx, saveCodeToBackend, proctoring?.isCameraDisconnected]);

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

  // ── Run code against visible test cases ──────────────────────────────────────
  const handleRun = async () => {
    if (proctoring?.isCameraDisconnected) return;
    if (!activeQuestion || !code) return;
    saveCodeToBackend(activeQuestion._id, language, code);
    setIsRunning(true);
    setRunResults([]);
    setRunOutput('');
    try {
      const { data } = await api.runCode(activeQuestion._id, {
        code, language,
        ...(customInput ? { customInput } : {}),
      });
      setRunOutput(data.output || '');
      setRunResults(data.visibleTestResults || []);
    } catch (err) {
      setRunOutput(err.response?.data?.error || 'Execution failed');
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

  // ── Submit all ────────────────────────────────────────────────────────────────
  const handleSubmitAll = async () => {
    if (!confirm('Submit the entire test? This cannot be undone.')) return;
    isSubmittingAll.current = true;
    try {
      await api.submitAll(session.test._id);
      toast.dismiss();
      navigate('/candidate/complete');
    } catch (err) {
      toast.error('Submit failed');
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

      {/* ── Main Layout with Resizable & Collapsible Questions Panel (BUG-10) ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* ── Question List sidebar ─────────────────────────────────────────── */}
        <div
          style={{
            width: isCollapsed ? 58 : panelWidth,
            minWidth: isCollapsed ? 58 : panelWidth,
            maxWidth: isCollapsed ? 58 : 480,
            flexShrink: 0,
            background: 'white',
            borderRight: '1px solid #e5e7eb',
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
              borderBottom: '1px solid #e5e7eb',
              background: '#f9fafb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: isCollapsed ? 'center' : 'space-between',
              minHeight: 45,
            }}
          >
            {!isCollapsed && (
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Questions
              </div>
            )}
            <button
              type="button"
              onClick={() => setIsCollapsed((prev) => !prev)}
              title={isCollapsed ? 'Expand Questions Panel' : 'Collapse Questions Panel'}
              style={{
                background: 'transparent',
                border: '1px solid #e2e8f0',
                borderRadius: 4,
                cursor: 'pointer',
                padding: '3px 6px',
                fontSize: '0.72rem',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#e2e8f0';
                e.currentTarget.style.color = '#1e293b';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#64748b';
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
              background: isDragging ? '#0E7C86' : 'transparent',
              borderRight: isDragging ? '1px solid #0E7C86' : 'none',
              flexShrink: 0,
              zIndex: 10,
              transition: 'background 150ms ease',
              marginRight: -6,
              position: 'relative',
            }}
            title="Drag to resize Questions panel"
            onMouseEnter={(e) => {
              if (!isDragging) e.currentTarget.style.background = 'rgba(14, 124, 134, 0.3)';
            }}
            onMouseLeave={(e) => {
              if (!isDragging) e.currentTarget.style.background = 'transparent';
            }}
          />
        )}

        {/* ── Content area with resizable Question Details and Code Editor ── */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* Question panel */}
          <div
            className="test-question-panel"
            style={{
              width: questionDetailWidth,
              minWidth: 300,
              maxWidth: 850,
              flexShrink: 0,
              borderRight: '1px solid #e5e7eb',
              overflowY: 'auto',
              transition: isDraggingDetail ? 'none' : 'width 150ms ease',
            }}
          >
            {activeQuestion && (
              <>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: '#1A2B3C' }}>
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

                <div style={{ lineHeight: 1.7, color: '#374151', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>
                  {activeQuestion.description}
                </div>

                {activeQuestion.inputFormat && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#1A2B3C', marginBottom: 4 }}>Input Format</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: '#f8fafc', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
                      {activeQuestion.inputFormat}
                    </div>
                  </div>
                )}

                {activeQuestion.outputFormat && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#1A2B3C', marginBottom: 4 }}>Output Format</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: '#f8fafc', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
                      {activeQuestion.outputFormat}
                    </div>
                  </div>
                )}

                {activeQuestion.constraints && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#1A2B3C', marginBottom: 4 }}>Constraints</div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', background: '#fff3cd', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
                      {activeQuestion.constraints}
                    </div>
                  </div>
                )}

                {/* Visible test cases (FR-4.2: shown to candidate) */}
                {activeQuestion.visibleTestCases?.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#1A2B3C', marginBottom: 8 }}>
                      Sample Test Cases
                    </div>
                    {activeQuestion.visibleTestCases.map((tc, i) => (
                      <div key={i} style={{ background: '#f8fafc', borderRadius: 6, padding: 10, marginBottom: 8, border: '1px solid #e5e7eb' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', marginBottom: 4 }}>
                          Example {i + 1}
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
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

          {/* Question Detail Resizable Divider Handle */}
          <div
            onMouseDown={handleDetailMouseDown}
            style={{
              width: 8,
              cursor: 'col-resize',
              background: isDraggingDetail ? '#0E7C86' : '#f8fafc',
              borderRight: isDraggingDetail ? '1px solid #0E7C86' : '1px solid #e2e8f0',
              borderLeft: isDraggingDetail ? '1px solid #0E7C86' : '1px solid #e2e8f0',
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
              if (!isDraggingDetail) e.currentTarget.style.background = 'rgba(14, 124, 134, 0.25)';
            }}
            onMouseLeave={(e) => {
              if (!isDraggingDetail) e.currentTarget.style.background = '#f8fafc';
            }}
          >
            {/* Visual drag handle grip bar */}
            <div
              style={{
                width: 2,
                height: 32,
                borderRadius: 1,
                background: isDraggingDetail ? '#ffffff' : '#94a3b8',
              }}
            />
          </div>

          {/* ── Editor + Output panel ──────────────────────────────────────── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#1e1e2e', overflow: 'hidden', minWidth: 350 }}>

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

            {/* Horizontal Resizer Divider between Editor and Bottom Panel (BUG-11) */}
            <div
              onMouseDown={handleHeightMouseDown}
              style={{
                height: 6,
                cursor: 'row-resize',
                background: isDraggingHeight ? '#0E7C86' : '#2d2d44',
                borderTop: '1px solid #333',
                borderBottom: '1px solid #222',
                zIndex: 10,
                position: 'relative',
                flexShrink: 0,
                transition: 'background 150ms ease',
              }}
              title="Drag to resize Editor / Output panel height"
              onMouseEnter={(e) => {
                if (!isDraggingHeight) e.currentTarget.style.background = 'rgba(14, 124, 134, 0.5)';
              }}
              onMouseLeave={(e) => {
                if (!isDraggingHeight) e.currentTarget.style.background = '#2d2d44';
              }}
            />

            {/* Custom input + output panel (BUG-11) */}
            <div
              ref={bottomPanelRef}
              style={{
                height: bottomHeight,
                display: 'flex',
                background: '#1e1e2e',
                overflow: 'hidden',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              {/* Custom input */}
              <div
                style={{
                  width: `${inputWidthPercent}%`,
                  minWidth: 80,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                <div style={{ padding: '6px 12px', background: '#2d2d44', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>
                  Custom Input (optional)
                </div>
                <textarea
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onCopy={preventCopyPaste}
                  onPaste={preventCopyPaste}
                  onContextMenu={preventCopyPaste}
                  disabled={disqualified || proctoring?.isCameraDisconnected}
                  placeholder="Enter custom input here..."
                  style={{
                    flex: 1, resize: 'none', background: '#1e1e2e', color: '#cdd6f4',
                    border: 'none', padding: 12, fontFamily: 'monospace', fontSize: '0.8rem',
                    outline: 'none',
                    cursor: proctoring?.isCameraDisconnected ? 'not-allowed' : 'text',
                  }}
                />
              </div>

              {/* Vertical Resizer Divider between Custom Input and Output (BUG-11) */}
              <div
                onMouseDown={handleSplitMouseDown}
                style={{
                  width: 6,
                  cursor: 'col-resize',
                  background: isDraggingSplit ? '#0E7C86' : '#2d2d44',
                  borderLeft: '1px solid #333',
                  borderRight: '1px solid #222',
                  zIndex: 10,
                  position: 'relative',
                  flexShrink: 0,
                  transition: 'background 150ms ease',
                }}
                title="Drag to resize Custom Input / Output width"
                onMouseEnter={(e) => {
                  if (!isDraggingSplit) e.currentTarget.style.background = 'rgba(14, 124, 134, 0.5)';
                }}
                onMouseLeave={(e) => {
                  if (!isDraggingSplit) e.currentTarget.style.background = '#2d2d44';
                }}
              />

              {/* Output */}
              <div
                style={{
                  flex: 1,
                  minWidth: 80,
                  display: 'flex',
                  flexDirection: 'column',
                  overflowY: 'auto',
                }}
              >
                <div style={{ padding: '6px 12px', background: '#2d2d44', fontSize: '0.75rem', color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>
                  Output
                </div>
                <div style={{ flex: 1, padding: 12, overflowY: 'auto' }}>
                  {runOutput && (
                    <pre style={{ color: '#a6e3a1', fontFamily: 'monospace', fontSize: '0.8rem', margin: 0, whiteSpace: 'pre-wrap' }}>
                      {runOutput}
                    </pre>
                  )}
                  {runResults.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {runResults.map((r, i) => (
                        <TestCaseResult key={i} tc={r} index={i} />
                      ))}
                    </div>
                  )}
                  {!runOutput && runResults.length === 0 && (
                    <div style={{ color: '#6b7280', fontSize: '0.8rem' }}>
                      Click "▶ Run" to execute your code against test cases.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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

      {/* Camera Disconnected Full-Screen Blocking Overlay (BUG-29) */}
      <CameraDisconnectedOverlay
        isVisible={Boolean(proctoring?.isCameraDisconnected)}
        timerDisplay={timerDisplay}
        hasHardwareCamera={Boolean(proctoring?.hasHardwareCamera)}
        isVerifyingFace={Boolean(proctoring?.isVerifyingFace)}
        onRetry={proctoring?.reconnectCamera}
        onSubmitAll={handleSubmitAll}
        videoRef={proctoring?.videoRef}
      />
    </div>
  );
}
