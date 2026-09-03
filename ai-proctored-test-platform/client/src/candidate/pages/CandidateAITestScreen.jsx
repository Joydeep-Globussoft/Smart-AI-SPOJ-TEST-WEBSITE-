// CandidateAITestScreen — Module 4: AI Test (Sandpack + Kimi Chat)
// Implements FR-6.1 through FR-6.5 (§11.6)
// Multi-file editor + Sandpack live preview + Kimi chat interface with internal copy-paste support
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
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
} from '../../services/socketClient';
import { useAuth } from '../../hooks/useAuthContext';
import { useProctoring } from '../../hooks/useProctoring';
import DraggableWebcamPip from '../../shared/DraggableWebcamPip';
import CameraDisconnectedOverlay from '../components/CameraDisconnectedOverlay';
import ViolationNotificationBanner, { useViolationNotification } from '../components/ViolationNotificationBanner';
import TestFooter from '../components/TestFooter';
import Editor from '@monaco-editor/react';
import globussoftLogo from '../../assets/globussoft-logo.png';

// Default starter project templates if question doesn't have custom starter files
const DEFAULT_FILES = {
  'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Test Project</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">
    <h1>Welcome to your AI Test</h1>
    <p>Use the AI chat assistant on the right to design, code, and refine your application.</p>
  </div>
  <script src="script.js"></script>
</body>
</html>`,
  'style.css': `body {
  font-family: system-ui, -apple-system, sans-serif;
  margin: 0;
  padding: 24px;
  background: #f8fafc;
  color: #1e293b;
}

#app {
  max-width: 600px;
  margin: 40px auto;
  background: white;
  padding: 32px;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

h1 {
  color: #0E7C86;
  margin-top: 0;
}`,
  'script.js': `// Your JavaScript logic here
console.log('AI Test Project Initialized');
`
};

// ── Segmented View Mode Toggle Component (Split / Code / Preview) ────────────
const ViewModeSegmentedToggle = ({ viewMode, onChange, compact = false }) => {
  return (
    <div
      role="group"
      aria-label="Editor View Mode"
      className="view-mode-segmented-toggle"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: '#090d16',
        border: '1px solid #1e293b',
        borderRadius: 6,
        padding: 2,
        gap: 2,
        boxShadow: '0 2px 5px rgba(0,0,0,0.25)',
      }}
    >
      <button
        type="button"
        id={compact ? 'view-mode-split-compact-btn' : 'view-mode-split-btn'}
        onClick={() => onChange('split')}
        title="Split View (Code Editor & Preview side-by-side)"
        style={{
          background: viewMode === 'split' ? '#0E7C86' : 'transparent',
          color: viewMode === 'split' ? '#ffffff' : '#94a3b8',
          border: 'none',
          borderRadius: 4,
          padding: compact ? '2px 8px' : '4px 12px',
          fontSize: compact ? '0.7rem' : '0.75rem',
          fontWeight: viewMode === 'split' ? 700 : 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          transition: 'all 0.15s ease',
          lineHeight: 1.2,
        }}
      >
        <span style={{ fontSize: compact ? '0.75rem' : '0.8rem', lineHeight: 1 }}>◫</span>
        <span>Split</span>
      </button>

      <button
        type="button"
        id={compact ? 'view-mode-code-compact-btn' : 'view-mode-code-btn'}
        onClick={() => onChange('code')}
        title="Code View (Full-width Code Editor)"
        style={{
          background: viewMode === 'code' ? '#0E7C86' : 'transparent',
          color: viewMode === 'code' ? '#ffffff' : '#94a3b8',
          border: 'none',
          borderRadius: 4,
          padding: compact ? '2px 8px' : '4px 12px',
          fontSize: compact ? '0.7rem' : '0.75rem',
          fontWeight: viewMode === 'code' ? 700 : 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          transition: 'all 0.15s ease',
          lineHeight: 1.2,
        }}
      >
        <span style={{ fontSize: compact ? '0.75rem' : '0.8rem', lineHeight: 1 }}>💻</span>
        <span>Code</span>
      </button>

      <button
        type="button"
        id={compact ? 'view-mode-preview-compact-btn' : 'view-mode-preview-btn'}
        onClick={() => onChange('preview')}
        title="Preview View (Full-width Preview)"
        style={{
          background: viewMode === 'preview' ? '#0E7C86' : 'transparent',
          color: viewMode === 'preview' ? '#ffffff' : '#94a3b8',
          border: 'none',
          borderRadius: 4,
          padding: compact ? '2px 8px' : '4px 12px',
          fontSize: compact ? '0.7rem' : '0.75rem',
          fontWeight: viewMode === 'preview' ? 700 : 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          transition: 'all 0.15s ease',
          lineHeight: 1.2,
        }}
      >
        <span style={{ fontSize: compact ? '0.7rem' : '0.75rem', lineHeight: 1 }}>▶</span>
        <span>Preview</span>
      </button>
    </div>
  );
};

export default function CandidateAITestScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);

  // File management
  const [files, setFiles] = useState(DEFAULT_FILES);
  const [activeFile, setActiveFile] = useState('index.html');
  const [newFileName, setNewFileName] = useState('');
  const [showAddFile, setShowAddFile] = useState(false);

  // Per-question state cache (BUG-XX: Multi-question code & active file isolation)
  const questionFilesRef = useRef({}); // { [questionId]: { [fileName]: content } }
  const questionActiveFileRef = useRef({}); // { [questionId]: fileName }
  const filesRef = useRef(files);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // ── Panel Maximize & Resizable Workspace State ─────────────────────────────
  const [maximizedPanel, setMaximizedPanel] = useState(null); // null | 'question' | 'editor' | 'preview' | 'chat'

  // ── Split / Code / Preview View Mode State ────────────────────────────────
  const [viewMode, setViewMode] = useState(() => {
    const saved = sessionStorage.getItem('ai_test_view_mode');
    return saved === 'code' || saved === 'preview' ? saved : 'split';
  });

  const handleViewModeChange = useCallback((mode) => {
    setMaximizedPanel(null); // CRITICAL: Instantly dismiss any panel maximization so viewMode takes immediate full effect
    setViewMode(mode);
    sessionStorage.setItem('ai_test_view_mode', mode);
  }, []);

  useEffect(() => {
    // When switching view modes or maximizing panels, re-layout Monaco editor smoothly
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 60);
    return () => clearTimeout(timer);
  }, [viewMode, maximizedPanel]);

  // ── Single-Row 4-Panel Resizable Workspace State ──────────────────────────
  const [panelWidths, setPanelWidths] = useState(() => {
    const saved = sessionStorage.getItem('ai_test_panel_widths');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 4) {
          const sum = parsed.reduce((a, b) => a + b, 0);
          if (Math.abs(sum - 100) < 1) {
            return parsed;
          }
        }
      } catch {}
    }
    return [24, 30, 24, 22]; // Default percentages summing to 100
  });

  const [activeSplitter, setActiveSplitter] = useState(null); // null | 0 | 1 | 2
  const containerRef = useRef(null);
  const dragStartRef = useRef({ clientX: 0, widths: [24, 30, 24, 22], containerWidth: 1000 });

  const [previewKey, setPreviewKey] = useState(0);
  const [previewDevice, setPreviewDevice] = useState('desktop');

  useEffect(() => {
    sessionStorage.setItem('ai_test_panel_widths', JSON.stringify(panelWidths));
  }, [panelWidths]);

  const handleSplitterMouseDown = useCallback((e, index) => {
    e.preventDefault();
    if (!containerRef.current || maximizedPanel !== null) return;

    // Total width available for the panels excluding splitters and padding
    const containerWidth = Math.max(containerRef.current.clientWidth - 46, 500);
    dragStartRef.current = {
      clientX: e.clientX,
      widths: [...panelWidths],
      containerWidth,
    };
    setActiveSplitter(index);

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }, [panelWidths, maximizedPanel]);

  useEffect(() => {
    if (activeSplitter === null) return;

    const handleMouseMove = (e) => {
      const { clientX: startX, widths, containerWidth } = dragStartRef.current;
      const deltaPx = e.clientX - startX;
      const deltaPercent = (deltaPx / containerWidth) * 100;

      const idx = activeSplitter; // 0, 1, or 2

      if (viewMode === 'code' || viewMode === 'preview') {
        const combinedWidth12 = widths[1] + widths[2];
        const ratio1 = widths[1] / (combinedWidth12 || 1);

        if (idx === 0) {
          // Dragging Splitter 0 (Question vs expanded center panel)
          const min0 = (160 / containerWidth) * 100;
          const minCenter = (200 / containerWidth) * 100;
          const totalAvailable = widths[0] + combinedWidth12;

          let newWidth0 = Math.max(min0, Math.min(widths[0] + deltaPercent, totalAvailable - minCenter));
          let newCenterWidth = totalAvailable - newWidth0;

          setPanelWidths((prev) => [
            newWidth0,
            newCenterWidth * ratio1,
            newCenterWidth * (1 - ratio1),
            prev[3],
          ]);
          return;
        }

        if (idx === 2) {
          // Dragging Splitter 2 (expanded center panel vs AI Assistant)
          const minCenter = (200 / containerWidth) * 100;
          const min3 = (180 / containerWidth) * 100;
          const totalAvailable = combinedWidth12 + widths[3];

          let newWidth3 = Math.max(min3, Math.min(widths[3] - deltaPercent, totalAvailable - minCenter));
          let newCenterWidth = totalAvailable - newWidth3;

          setPanelWidths((prev) => [
            prev[0],
            newCenterWidth * ratio1,
            newCenterWidth * (1 - ratio1),
            newWidth3,
          ]);
          return;
        }
      }

      // Default Split mode dragging
      const minPixels = [160, 200, 180, 180];
      const minPercentA = (minPixels[idx] / containerWidth) * 100;
      const minPercentB = (minPixels[idx + 1] / containerWidth) * 100;

      let newWidthA = widths[idx] + deltaPercent;
      let newWidthB = widths[idx + 1] - deltaPercent;

      const combined = widths[idx] + widths[idx + 1];

      if (newWidthA < minPercentA) {
        newWidthA = minPercentA;
        newWidthB = combined - minPercentA;
      } else if (newWidthB < minPercentB) {
        newWidthB = minPercentB;
        newWidthA = combined - minPercentB;
      }

      setPanelWidths((prev) => {
        const next = [...prev];
        next[idx] = newWidthA;
        next[idx + 1] = newWidthB;
        return next;
      });
    };

    const handleMouseUp = () => {
      setActiveSplitter(null);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [activeSplitter, viewMode]);

  // AI Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const internalClipboard = useRef('');

  // Execution & Submission state
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedQuestions, setSubmittedQuestions] = useState(new Set());
  const [disqualified, setDisqualified] = useState(false);
  const { warningMessage, showWarning, dismissWarning } = useViolationNotification(6000);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  // Close in-page preview modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isPreviewModalOpen) {
        setIsPreviewModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewModalOpen]);

  const heartbeatRef = useRef(null);
  const isSubmittingAll = useRef(false);
  const [isSubmittingAllState, setIsSubmittingAllState] = useState(false);
  const [violationCount, setViolationCount] = useState(0);
  const chatEndRef = useRef(null);

  // Load session from sessionStorage and initialize per-question state
  useEffect(() => {
    const stored = sessionStorage.getItem('testSession');
    if (!stored) {
      navigate('/candidate/join');
      return;
    }
    const s = JSON.parse(stored);
    if (s.completed || (s.submissions && s.submissions.length > 0 && s.submissions.every((sub) => sub.status === 'SUBMITTED'))) {
      navigate('/candidate/complete', { replace: true });
      return;
    }
    setSession(s);

    // Restore submitted status for any previously submitted questions
    const initialSubmitted = new Set();
    (s.submissions || []).forEach((sub) => {
      if (sub.status === 'SUBMITTED') {
        const qIdStr = sub.questionId?._id?.toString() || sub.questionId?.toString() || sub.questionId;
        if (qIdStr) initialSubmitted.add(qIdStr);
      }
    });
    setSubmittedQuestions(initialSubmitted);

    // Pre-populate each question's file state from saved submission, brief files, or defaults
    (s.questions || []).forEach((q) => {
      const qIdStr = q._id.toString();
      const sub = (s.submissions || []).find(
        (item) => (item.questionId?._id?.toString() || item.questionId?.toString() || item.questionId) === qIdStr
      );
      if (sub?.filesJson && Object.keys(sub.filesJson).length > 0) {
        questionFilesRef.current[qIdStr] = sub.filesJson;
      } else if (q.aiTestBriefFiles && q.aiTestBriefFiles.length > 0) {
        const initial = {};
        q.aiTestBriefFiles.forEach((f) => {
          initial[f.fileName] = f.initialContent || '';
        });
        questionFilesRef.current[qIdStr] = initial;
      } else {
        questionFilesRef.current[qIdStr] = { ...DEFAULT_FILES };
      }
      questionActiveFileRef.current[qIdStr] = Object.keys(questionFilesRef.current[qIdStr])[0] || 'index.html';
    });

    const firstQ = s.questions?.[0];
    if (firstQ) {
      const firstQIdStr = firstQ._id.toString();
      const initialFiles = questionFilesRef.current[firstQIdStr] || DEFAULT_FILES;
      setFiles(initialFiles);
      filesRef.current = initialFiles;
      const initialActiveFile = questionActiveFileRef.current[firstQIdStr] || 'index.html';
      setActiveFile(initialActiveFile);
    }
  }, [navigate]);

  const activeQuestion = session?.questions?.[activeQuestionIdx];

  // ── Client-Side AI Proctoring (FR-5.2, FR-5.3, FR-5.4, FR-6.1, FR-7.1, FR-7.2) ──
  // Declared here (before handleSelectQuestion) to avoid TDZ — handleSelectQuestion references proctoring in its body and deps.
  // allowInternalCopyPaste: true allows candidate to copy code from Kimi Chat into Monaco files (FR-6.1)
  const handleProctorWarning = useCallback((msg) => {
    showWarning(msg);
  }, [showWarning]);

  const proctoring = useProctoring({
    testId: session?.test?._id,
    roomId: session?.room?._id,
    candidateId: user?.id || user?._id,
    enabled: Boolean(session && user && !disqualified),
    allowInternalCopyPaste: true,
    onWarning: handleProctorWarning,
  });

  // ── Question Switch Handler (Preserve code/preview per question & autosave) ──
  const handleSelectQuestion = useCallback((newIdx) => {
    if (!session?.questions || newIdx < 0 || newIdx >= session.questions.length) return;
    if (newIdx === activeQuestionIdx) return;
    if (proctoring?.isCameraDisconnected) return;

    // 1. Snapshot and cache current question files in memory
    const currentQ = session.questions[activeQuestionIdx];
    if (currentQ) {
      const currentQId = currentQ._id.toString();
      const currentFiles = filesRef.current;
      questionFilesRef.current[currentQId] = currentFiles;
      questionActiveFileRef.current[currentQId] = activeFile;

      // Asynchronously autosave current question files to backend
      api.saveFiles(currentQ._id, { filesJson: currentFiles }).catch(() => {});
    }

    // 2. Switch active question index
    const targetQ = session.questions[newIdx];
    const targetQId = targetQ._id.toString();
    setActiveQuestionIdx(newIdx);

    // 3. Load target question's files from cache
    const targetFiles = questionFilesRef.current[targetQId] || DEFAULT_FILES;
    setFiles(targetFiles);
    filesRef.current = targetFiles;
    const targetActiveFile = questionActiveFileRef.current[targetQId] || Object.keys(targetFiles)[0] || 'index.html';
    setActiveFile(targetActiveFile);

    // 4. Force preview refresh for newly selected question
    setPreviewKey((k) => k + 1);
  }, [session?.questions, activeQuestionIdx, activeFile, proctoring?.isCameraDisconnected]);

  // Scroll chat to bottom on update
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isAiTyping]);

  // Timer expiry handler
  const handleTimerExpire = useCallback(async () => {
    if (isSubmittingAll.current) return;
    isSubmittingAll.current = true;
    setIsSubmittingAllState(true);
    toast('⏰ Time is up! Submitting your AI test...', { icon: '⏰' });
    try {
      if (session?.questions && session.questions.length > 0) {
        for (const q of session.questions) {
          const qIdStr = q._id.toString();
          const filesToSubmit =
            q._id === activeQuestion?._id
              ? filesRef.current
              : questionFilesRef.current[qIdStr] || DEFAULT_FILES;
          try {
            await api.submitAiTest(q._id, { filesJson: filesToSubmit, promptLog: chatMessages });
          } catch (_) {}
        }
      }
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
  }, [session, activeQuestion, navigate, chatMessages]);

  const { formatted: timerDisplay, urgency } = useTimer(
    session?.candidateEndTime,
    handleTimerExpire
  );

  // Socket join + Heartbeat every 5s
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
      emitCandidateHeartbeat({
        candidateId: user.id,
        testId: session.test._id,
        currentQuestionId: activeQuestion?._id,
        questionsCompleted: submittedQuestions.size,
      });
    }, 5000);

    return () => clearInterval(heartbeatRef.current);
  }, [session, user, activeQuestion, submittedQuestions]);

  // (proctoring is now declared above handleSelectQuestion to avoid TDZ — see comment above handleSelectQuestion)

  // Fetch initial violation count on test load / session ready
  useEffect(() => {
    if (!session?.test?._id) return;
    let isMounted = true;
    api
      .getViolationCount(session.test._id)
      .then((res) => {
        if (isMounted && typeof res.data?.violationCount === 'number') {
          console.log('[ViolationCounter] Initial violation count:', res.data.violationCount);
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

  // Socket proctor warnings / disqualifications / real-time violation updates
  useEffect(() => {
    const onWarning = ({ violationType, message, violationCount: count }) => {
      if (isSubmittingAll.current) return;
      if (typeof count === 'number') {
        setViolationCount(count);
      }
      if (violationType === 'CAMERA_DISCONNECTED') {
        // BUG-40: Camera disconnect is handled exclusively by the full-screen blocking overlay.
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
    const onDisqualify = () => {
      setDisqualified(true);
      toast.error('🚫 You have been disqualified by the proctor.', { duration: 0 });
    };
    const onEnded = () => {
      toast('📢 Test ended. Submitting...', { icon: '📢' });
      handleTimerExpire();
    };

    onCandidateWarning(onWarning);
    onCandidateViolationUpdated(onViolationUpdated);
    onCandidateDisqualified(onDisqualify);
    onTestEnded(onEnded);

    return () => {
      toast.dismiss();
      offCandidateWarning(onWarning);
      offCandidateViolationUpdated(onViolationUpdated);
      offCandidateDisqualified(onDisqualify);
      offTestEnded(onEnded);
    };
  }, [handleTimerExpire, showWarning]);

  // Autosave files every 30s (NFR §13 Availability)
  useAutosave(
    useCallback(async () => {
      if (!activeQuestion || !files || disqualified || proctoring?.isCameraDisconnected) return;
      try {
        setIsSaving(true);
        await api.saveFiles(activeQuestion._id, { filesJson: files });
      } catch (_) {} finally {
        setIsSaving(false);
      }
    }, [activeQuestion, files, disqualified, proctoring?.isCameraDisconnected]),
    30000,
    !!session && !disqualified
  );

  // File operations
  const handleFileChange = (newContent) => {
    if (proctoring?.isCameraDisconnected) return;
    setFiles((prev) => {
      const updated = {
        ...prev,
        [activeFile]: newContent || '',
      };
      filesRef.current = updated;
      if (activeQuestion) {
        questionFilesRef.current[activeQuestion._id.toString()] = updated;
      }
      return updated;
    });
  };

  const handleAddFile = (e) => {
    e.preventDefault();
    if (proctoring?.isCameraDisconnected) return;
    const trimmed = newFileName.trim();
    if (!trimmed) return;
    if (files[trimmed]) {
      toast.error('File already exists');
      return;
    }
    setFiles((prev) => {
      const updated = { ...prev, [trimmed]: '' };
      filesRef.current = updated;
      if (activeQuestion) {
        questionFilesRef.current[activeQuestion._id.toString()] = updated;
      }
      return updated;
    });
    setActiveFile(trimmed);
    if (activeQuestion) {
      questionActiveFileRef.current[activeQuestion._id.toString()] = trimmed;
    }
    setNewFileName('');
    setShowAddFile(false);
    toast.success(`Created ${trimmed}`);
  };

  const handleDeleteFile = (fileName) => {
    if (proctoring?.isCameraDisconnected) return;
    if (Object.keys(files).length <= 1) {
      toast.error('Cannot delete the only file');
      return;
    }
    if (confirm(`Delete ${fileName}?`)) {
      const copy = { ...files };
      delete copy[fileName];
      setFiles(copy);
      filesRef.current = copy;
      if (activeQuestion) {
        questionFilesRef.current[activeQuestion._id.toString()] = copy;
      }
      if (activeFile === fileName) {
        const nextActive = Object.keys(copy)[0];
        setActiveFile(nextActive);
        if (activeQuestion) {
          questionActiveFileRef.current[activeQuestion._id.toString()] = nextActive;
        }
      }
    }
  };

  // ── FR-6.1 & FR-6.2: Send chat message to Kimi ───────────────────────────────
  const handleSendChat = async (e) => {
    e.preventDefault();
    if (proctoring?.isCameraDisconnected) return;
    const msg = chatInput.trim();
    if (!msg || isAiTyping || !activeQuestion) return;

    const userEntry = { role: 'candidate', message: msg, timestamp: new Date().toISOString() };
    setChatMessages((prev) => [...prev, userEntry]);
    setChatInput('');
    setIsAiTyping(true);

    try {
      const { data } = await api.kimiChat(activeQuestion._id, {
        message: msg,
        filesContext: files,
        chatHistory: chatMessages.slice(-6).map((m) => ({
          role: m.role === 'candidate' ? 'user' : 'assistant',
          content: m.message,
        })),
      });

      const reply = data?.reply || 'I am ready to help you build your project!';
      setChatMessages((prev) => [
        ...prev,
        { role: 'kimi', message: reply, timestamp: new Date().toISOString() },
      ]);
    } catch (err) {
      const errReply = err.response?.data?.error || 'AI assistant is currently unavailable. Please continue coding!';
      setChatMessages((prev) => [
        ...prev,
        { role: 'kimi', message: `⚠️ ${errReply}`, timestamp: new Date().toISOString() },
      ]);
    } finally {
      setIsAiTyping(false);
    }
  };

  // Copy AI response to internal clipboard (User decision: allow within-interface copy paste)
  const handleCopyFromChat = (text) => {
    if (proctoring?.isCameraDisconnected) return;
    internalClipboard.current = text;
    // Also copy to standard clipboard for user convenience
    navigator.clipboard?.writeText(text).catch(() => {});
    toast.success('Copied to editor clipboard! You can paste into your code files.');
  };

  // Submit AI Test question
  const handleSubmitQuestion = async () => {
    if (proctoring?.isCameraDisconnected) return;
    if (!activeQuestion || isSubmitting) return;
    const qIdStr = activeQuestion._id.toString();
    setIsSubmitting(true);
    try {
      questionFilesRef.current[qIdStr] = files;
      await api.submitAiTest(activeQuestion._id, {
        filesJson: files,
        promptLog: chatMessages,
      });
      setSubmittedQuestions(prev => new Set([...prev, qIdStr]));
      toast.success(`Q${activeQuestionIdx + 1} project submitted successfully!`);
    } catch (err) {
      console.error('Submit question error:', err);
      const errMsg = err.response?.data?.error || err.message || 'Submit failed';
      toast.error(`Submit error: ${errMsg}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit all
  const handleSubmitAll = async () => {
    if (isSubmittingAllState || isSubmittingAll.current) return;
    if (!window.confirm('Submit all questions and finalize your AI test?')) return;

    setIsSubmittingAllState(true);
    isSubmittingAll.current = true;
    console.log('[SubmitAll] Starting AI Test final submission flow...');

    try {
      // 1. Snapshot current active question files into ref
      if (activeQuestion) {
        const currentQId = activeQuestion._id.toString();
        questionFilesRef.current[currentQId] = filesRef.current;
      }

      // 2. Submit/save files & promptLog for all questions in the test
      if (session?.questions && session.questions.length > 0) {
        for (const q of session.questions) {
          const qIdStr = q._id.toString();
          const filesToSubmit =
            q._id === activeQuestion?._id
              ? filesRef.current
              : questionFilesRef.current[qIdStr] || DEFAULT_FILES;
          console.log(`[SubmitAll] Submitting AI question ${qIdStr}...`);
          try {
            await api.submitAiTest(q._id, { filesJson: filesToSubmit, promptLog: chatMessages });
          } catch (qErr) {
            console.warn(`[SubmitAll] AI question ${qIdStr} submit warning:`, qErr);
          }
        }
      }

      // 3. Trigger final submitAll API endpoint
      if (session?.test?._id) {
        console.log(`[SubmitAll] Calling POST /tests/${session.test._id}/submit-all...`);
        await api.submitAll(session.test._id);
        console.log('[SubmitAll] Final submitAll succeeded!');
      }

      // 4. Mark session completed in sessionStorage
      try {
        const stored = sessionStorage.getItem('testSession');
        if (stored) {
          const s = JSON.parse(stored);
          s.completed = true;
          sessionStorage.setItem('testSession', JSON.stringify(s));
        }
      } catch (_) {}

      // 5. Success toast and navigate to completion page
      toast.dismiss();
      toast.success('AI Test submitted successfully!');
      navigate('/candidate/complete', { replace: true });
    } catch (err) {
      console.error('[SubmitAll] Final submission error:', err);
      const errMsg = err.response?.data?.error || err.message || 'Submit all failed';
      toast.error(`Submit all failed: ${errMsg}. Please try again.`);
      setIsSubmittingAllState(false);
      isSubmittingAll.current = false;
    }
  };

  // Generate safe HTML bundle for live iframe preview (FR-6.3)
  const generatePreviewSrcDoc = () => {
    const html = files['index.html'] || files['index.htm'] || '<h1>No index.html found</h1>';
    const css = files['style.css'] || files['styles.css'] || files['app.css'] || '';
    const js = files['script.js'] || files['app.js'] || files['index.js'] || '';

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>${css}</style>
        </head>
        <body>
          ${html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '').replace(/<script[^>]*src=["'][^"']*["'][^>]*><\/script>/gi, '')}
          <script>
            try {
              ${js}
            } catch (err) {
              console.error('Preview runtime error:', err);
            }
          </script>
        </body>
      </html>
    `;
  };

  // Determine language for Monaco editor
  const getMonacoLanguage = (fileName) => {
    if (fileName.endsWith('.html') || fileName.endsWith('.htm')) return 'html';
    if (fileName.endsWith('.css')) return 'css';
    if (fileName.endsWith('.js') || fileName.endsWith('.jsx')) return 'javascript';
    if (fileName.endsWith('.json')) return 'json';
    return 'plaintext';
  };

  if (!session) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner spinner-dark" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

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
        </p>
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0f172a' }}>
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
              {session.test.title} <span style={{ color: '#38bdf8', fontSize: '0.85rem', fontWeight: 600 }}>(AI Test)</span>
            </span>
            <span className="badge badge-teal" style={{ fontSize: '0.75rem', padding: '3px 10px' }}>
              {session.room.roomName || session.room.roomCode}
            </span>
            {isSaving && <span style={{ color: '#38bdf8', fontSize: '0.75rem' }}>💾 Saving...</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.7)' }}>
              Candidate: <strong style={{ color: 'white' }}>{user?.name || user?.email}</strong>
            </span>
          </div>
        </div>

        {/* Row (b): Timer & Actions */}
        <div className="timer-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', fontWeight: 500 }}>
                Progress:
              </span>
              <span style={{ color: '#38bdf8', fontWeight: 700, fontSize: '0.85rem' }}>
                {submittedQuestions.size}/{session.questions?.length || 1} Submitted
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', fontWeight: 500 }}>
                Status:
              </span>
              <span style={{ color: 'white', fontWeight: 600, fontSize: '0.85rem' }}>
                {submittedQuestions.has(activeQuestion?._id?.toString()) || submittedQuestions.has(activeQuestion?._id)
                  ? `✓ Q${activeQuestionIdx + 1} Submitted`
                  : 'In Progress'}
              </span>
            </div>
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
              id="ai-submit-question-btn"
              className="btn btn-primary btn-sm"
              onClick={handleSubmitQuestion}
              disabled={isSubmitting || submittedQuestions.has(activeQuestion?._id?.toString()) || submittedQuestions.has(activeQuestion?._id) || disqualified || proctoring?.isCameraDisconnected}
              style={{ fontWeight: 600 }}
            >
              {isSubmitting
                ? 'Submitting...'
                : (submittedQuestions.has(activeQuestion?._id?.toString()) || submittedQuestions.has(activeQuestion?._id))
                ? '✓ Submitted'
                : 'Submit Project'}
            </button>
            <button
              id="ai-submit-all-btn"
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

      {/* ── Main Workspace: 4-Panel Single Row Resizable Layout ─────────────── */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          overflow: 'hidden',
          background: '#070b14',
          padding: '6px 8px',
          boxSizing: 'border-box',
          position: 'relative',
          userSelect: activeSplitter !== null ? 'none' : 'auto',
          gap: 0,
        }}
      >
        {/* Transparent Drag Shield across full window to ensure 60fps tracking over iframes and Monaco */}
        {activeSplitter !== null && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 999999,
              cursor: 'col-resize',
              userSelect: 'none',
              pointerEvents: 'all',
              background: 'transparent',
            }}
          />
        )}

        {/* ── PANEL 1: Question ── */}
        <div
          style={{
            flex: maximizedPanel === 'question' ? '1 1 100%' : `0 0 calc(${panelWidths[0]}% - 7.5px)`,
            minWidth: maximizedPanel === 'question' ? 'auto' : 160,
            display: !maximizedPanel || maximizedPanel === 'question' ? 'flex' : 'none',
            flexDirection: 'column',
            background: '#131b2e',
            border: '1.5px solid #7c3aed',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
            position: 'relative',
          }}
        >
          {/* Header */}
          <div
            style={{
              height: 38,
              background: '#0f172a',
              borderBottom: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 10px',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  background: '#7c3aed',
                  color: '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 4,
                  lineHeight: 1.2,
                }}
              >
                1
              </span>
              <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.82rem' }}>
                Question
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                title={maximizedPanel === 'question' ? 'Restore Panel' : 'Maximize Panel'}
                onClick={() => setMaximizedPanel((p) => (p === 'question' ? null : 'question'))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                {maximizedPanel === 'question' ? '🗗' : '⛶'}
              </button>
            </div>
          </div>

          {/* Question Navigation Tab Strip (BUG-XX: Multi-question tabs) */}
          {session?.questions && session.questions.length > 1 && (
            <div
              id="ai-question-nav-strip"
              style={{
                background: '#0a0f1d',
                borderBottom: '1px solid #1e293b',
                padding: '6px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                overflowX: 'auto',
                flexShrink: 0,
              }}
            >
              {session.questions.map((q, idx) => {
                const isActive = idx === activeQuestionIdx;
                const isSub = submittedQuestions.has(q._id?.toString()) || submittedQuestions.has(q._id);
                return (
                  <button
                    key={q._id}
                    type="button"
                    id={`ai-question-tab-${idx}`}
                    onClick={() => handleSelectQuestion(idx)}
                    disabled={Boolean(proctoring?.isCameraDisconnected)}
                    style={{
                      background: isActive ? '#7c3aed' : '#1e293b',
                      color: isActive ? '#ffffff' : '#94a3b8',
                      border: isActive ? '1px solid #a78bfa' : '1px solid #334155',
                      borderRadius: 4,
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      fontWeight: isActive ? 700 : 500,
                      cursor: Boolean(proctoring?.isCameraDisconnected) ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      transition: 'all 0.15s ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span>Q{idx + 1}</span>
                    {isSub && <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 800 }}>✓</span>}
                  </button>
                );
              })}
            </div>
          )}

          {/* Question Body (Scrollable) */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px 16px',
              color: '#e2e8f0',
              fontSize: '0.85rem',
              lineHeight: 1.6,
            }}
          >
            <div style={{ marginBottom: 12 }}>
              <span
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 12,
                  letterSpacing: '0.04em',
                }}
              >
                AI DEVELOPMENT TASK
              </span>
              <h2
                style={{
                  color: '#ffffff',
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  margin: '8px 0 8px 0',
                }}
              >
                Q{activeQuestionIdx + 1}. {activeQuestion?.title || 'Build an AI Task Manager'}
              </h2>
            </div>

            <div style={{ color: '#cbd5e1', whiteSpace: 'pre-wrap', marginBottom: 16 }}>
              {activeQuestion?.description}
            </div>

            <div
              style={{
                background: '#0a0f1d',
                padding: '10px 12px',
                borderRadius: 6,
                border: '1px solid #1e293b',
                marginTop: 12,
              }}
            >
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a78bfa', marginBottom: 4 }}>
                💡 Hint
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                Focus on clean UI/UX and efficient state management.
              </div>
            </div>

            {/* Question Prev / Next Navigation Controls (BUG-XX) */}
            {session?.questions && session.questions.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: 20,
                  paddingTop: 14,
                  borderTop: '1px solid #1e293b',
                }}
              >
                <button
                  type="button"
                  id="ai-prev-question-btn"
                  onClick={() => handleSelectQuestion(activeQuestionIdx - 1)}
                  disabled={activeQuestionIdx <= 0 || Boolean(proctoring?.isCameraDisconnected)}
                  style={{
                    background: activeQuestionIdx <= 0 ? '#1e293b' : '#334155',
                    color: activeQuestionIdx <= 0 ? '#64748b' : '#ffffff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '5px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: activeQuestionIdx <= 0 || Boolean(proctoring?.isCameraDisconnected) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    opacity: activeQuestionIdx <= 0 ? 0.5 : 1,
                    transition: 'background 0.15s ease',
                  }}
                >
                  ◀ Prev Question
                </button>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
                  Q{activeQuestionIdx + 1} of {session.questions.length}
                </span>
                <button
                  type="button"
                  id="ai-next-question-btn"
                  onClick={() => handleSelectQuestion(activeQuestionIdx + 1)}
                  disabled={activeQuestionIdx >= session.questions.length - 1 || Boolean(proctoring?.isCameraDisconnected)}
                  style={{
                    background: activeQuestionIdx >= session.questions.length - 1 ? '#1e293b' : '#7c3aed',
                    color: activeQuestionIdx >= session.questions.length - 1 ? '#64748b' : '#ffffff',
                    border: 'none',
                    borderRadius: 4,
                    padding: '5px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: activeQuestionIdx >= session.questions.length - 1 || Boolean(proctoring?.isCameraDisconnected) ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    opacity: activeQuestionIdx >= session.questions.length - 1 ? 0.5 : 1,
                    transition: 'background 0.15s ease',
                  }}
                >
                  Next Question ▶
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              height: 24,
              background: '#0f172a',
              borderTop: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
              fontSize: '0.7rem',
              color: '#64748b',
              flexShrink: 0,
            }}
          >
            <span>
              Lines: {activeQuestion?.description ? activeQuestion.description.split('\n').length : 38}{' '}
              &nbsp;|&nbsp; Words: {activeQuestion?.description ? activeQuestion.description.split(/\s+/).filter(Boolean).length : 201}
            </span>
            <span style={{ color: '#94a3b8' }}>Read Only</span>
          </div>
        </div>

        {/* ── SPLITTER 0: Question <-> Code Editor ── */}
        {!maximizedPanel && (
          <div
            onMouseDown={(e) => handleSplitterMouseDown(e, 0)}
            title="Drag horizontally to resize Question and Code Editor"
            style={{
              width: 10,
              flexShrink: 0,
              cursor: 'col-resize',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <div
              style={{
                width: 2,
                height: '100%',
                background: activeSplitter === 0 ? '#38bdf8' : '#334155',
                transition: 'background 0.15s ease',
              }}
            />
            <div
              style={{
                position: 'absolute',
                background: activeSplitter === 0 ? '#38bdf8' : '#1e293b',
                border: '1px solid ' + (activeSplitter === 0 ? '#ffffff' : '#475569'),
                color: activeSplitter === 0 ? '#0f172a' : '#94a3b8',
                borderRadius: 10,
                width: 14,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.65rem',
                fontWeight: 900,
                boxShadow: '0 2px 5px rgba(0,0,0,0.4)',
                userSelect: 'none',
              }}
            >
              ↔
            </div>
          </div>
        )}

        {/* ── PANEL 2: Code Editor ── */}
        <div
          style={{
            flex: maximizedPanel === 'editor'
              ? '1 1 100%'
              : viewMode === 'code'
              ? `0 0 calc(${panelWidths[1] + panelWidths[2]}% - 5px)`
              : `0 0 calc(${panelWidths[1]}% - 7.5px)`,
            minWidth: maximizedPanel === 'editor' ? 'auto' : 200,
            display: !maximizedPanel
              ? (viewMode === 'preview' ? 'none' : 'flex')
              : (maximizedPanel === 'editor' ? 'flex' : 'none'),
            flexDirection: 'column',
            background: '#0f172a',
            border: '1.5px solid #0284c7',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
            position: 'relative',
          }}
        >
          {/* Header */}
          <div
            style={{
              height: 38,
              background: '#0b1120',
              borderBottom: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 10px',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 4,
                  lineHeight: 1.2,
                }}
              >
                2
              </span>
              <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.82rem' }}>
                Code Editor
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* ASSUMPTION: Toggle remains accessible in Code Editor header during normal split/code modes or when editor is maximized */}
              {(!maximizedPanel ? (viewMode === 'split' || viewMode === 'code') : maximizedPanel === 'editor') && (
                <ViewModeSegmentedToggle viewMode={viewMode} onChange={handleViewModeChange} compact />
              )}
              <button
                type="button"
                id="ai-panel2-expand-btn"
                title={maximizedPanel === 'editor' ? 'Restore Panel' : 'Maximize Panel'}
                onClick={() => setMaximizedPanel((p) => (p === 'editor' ? null : 'editor'))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                {maximizedPanel === 'editor' ? '🗗' : '⛶'}
              </button>
            </div>
          </div>

          {/* Sub-header: File Tabs Bar */}
          <div
            style={{
              background: '#131b2e',
              borderBottom: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 8px',
              height: 34,
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, overflowX: 'auto', flex: 1 }}>
              {Object.keys(files).map((fileName) => (
                <div
                  key={fileName}
                  onClick={() => setActiveFile(fileName)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                    borderRadius: '4px 4px 0 0',
                    background: activeFile === fileName ? '#0f172a' : 'transparent',
                    color: activeFile === fileName ? '#38bdf8' : '#94a3b8',
                    borderBottom: activeFile === fileName ? '2px solid #38bdf8' : '2px solid transparent',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span>{fileName}</span>
                  {Object.keys(files).length > 1 && (
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFile(fileName);
                      }}
                      style={{ opacity: 0.6, fontSize: '0.65rem', cursor: 'pointer' }}
                    >
                      ✕
                    </span>
                  )}
                </div>
              ))}

              {showAddFile ? (
                <form onSubmit={handleAddFile} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <input
                    type="text"
                    placeholder="filename.ext"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    autoFocus
                    style={{
                      background: '#0f172a',
                      border: '1px solid #38bdf8',
                      color: 'white',
                      padding: '2px 6px',
                      fontSize: '0.72rem',
                      borderRadius: 4,
                      width: 90,
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      background: '#0E7C86',
                      color: 'white',
                      border: 'none',
                      borderRadius: 4,
                      padding: '2px 6px',
                      fontSize: '0.68rem',
                      cursor: 'pointer',
                    }}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddFile(false)}
                    style={{
                      background: 'none',
                      color: '#94a3b8',
                      border: 'none',
                      fontSize: '0.68rem',
                      cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                </form>
              ) : (
                <button
                  onClick={() => setShowAddFile(true)}
                  style={{
                    background: 'none',
                    border: '1px dashed #475569',
                    color: '#94a3b8',
                    borderRadius: 4,
                    padding: '2px 7px',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  +
                </button>
              )}
            </div>
          </div>

          {/* Monaco Editor Container */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <Editor
              height="100%"
              language={getMonacoLanguage(activeFile)}
              value={files[activeFile] || ''}
              onChange={handleFileChange}
              theme="vs-dark"
              options={{
                fontSize: 13,
                fontFamily: '"Fira Code", monospace',
                minimap: { enabled: false },
                lineNumbers: 'on',
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                tabSize: 2,
                automaticLayout: true,
                readOnly: Boolean(disqualified || proctoring?.isCameraDisconnected),
              }}
            />
          </div>

          {/* Footer */}
          <div
            style={{
              height: 24,
              background: '#0b1120',
              borderTop: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
              fontSize: '0.7rem',
              color: '#64748b',
              flexShrink: 0,
            }}
          >
            <span>Ln 1, Col 1 &nbsp;|&nbsp; Spaces: 2 &nbsp;|&nbsp; UTF-8</span>
            <span style={{ color: '#38bdf8' }}>{getMonacoLanguage(activeFile)} &nbsp;✓ Prettier</span>
          </div>
        </div>

        {/* ── SPLITTER 1: Code Editor <-> Preview ── */}
        {!maximizedPanel && viewMode === 'split' && (
          <div
            onMouseDown={(e) => handleSplitterMouseDown(e, 1)}
            title="Drag horizontally to resize Code Editor and Preview"
            style={{
              width: 10,
              flexShrink: 0,
              cursor: 'col-resize',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <div
              style={{
                width: 2,
                height: '100%',
                background: activeSplitter === 1 ? '#38bdf8' : '#334155',
                transition: 'background 0.15s ease',
              }}
            />
            <div
              style={{
                position: 'absolute',
                background: activeSplitter === 1 ? '#38bdf8' : '#1e293b',
                border: '1px solid ' + (activeSplitter === 1 ? '#ffffff' : '#475569'),
                color: activeSplitter === 1 ? '#0f172a' : '#94a3b8',
                borderRadius: 10,
                width: 14,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.65rem',
                fontWeight: 900,
                boxShadow: '0 2px 5px rgba(0,0,0,0.4)',
                userSelect: 'none',
              }}
            >
              ↔
            </div>
          </div>
        )}

        {/* ── PANEL 3: Preview ── */}
        <div
          style={{
            flex: maximizedPanel === 'preview'
              ? '1 1 100%'
              : viewMode === 'preview'
              ? `0 0 calc(${panelWidths[1] + panelWidths[2]}% - 5px)`
              : `0 0 calc(${panelWidths[2]}% - 7.5px)`,
            minWidth: maximizedPanel === 'preview' ? 'auto' : 180,
            display: !maximizedPanel
              ? (viewMode === 'code' ? 'none' : 'flex')
              : (maximizedPanel === 'preview' ? 'flex' : 'none'),
            flexDirection: 'column',
            background: '#ffffff',
            border: '1.5px solid #10b981',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
            position: 'relative',
          }}
        >
          {/* Header */}
          <div
            style={{
              height: 38,
              background: '#0f172a',
              borderBottom: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 10px',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  background: '#10b981',
                  color: '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 4,
                  lineHeight: 1.2,
                }}
              >
                3
              </span>
              <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.82rem' }}>
                Preview
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* ASSUMPTION: Toggle remains accessible in Preview header during normal preview mode or when preview is maximized */}
              {(!maximizedPanel ? viewMode === 'preview' : maximizedPanel === 'preview') && (
                <ViewModeSegmentedToggle viewMode={viewMode} onChange={handleViewModeChange} compact />
              )}
              <button
                type="button"
                id="ai-panel3-expand-btn"
                title={maximizedPanel === 'preview' ? 'Restore Panel' : 'Maximize Panel'}
                onClick={() => setMaximizedPanel((p) => (p === 'preview' ? null : 'preview'))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                {maximizedPanel === 'preview' ? '🗗' : '⛶'}
              </button>
            </div>
          </div>

          {/* Browser Address Bar Sub-header */}
          <div
            style={{
              height: 32,
              background: '#1e293b',
              borderBottom: '1px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 8px',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                flex: 1,
                background: '#0f172a',
                borderRadius: 4,
                padding: '2px 10px',
                fontSize: '0.72rem',
                color: '#94a3b8',
                fontFamily: 'monospace',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginRight: 8,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <span>http://localhost:3000</span>
              <span style={{ color: '#10b981', fontSize: '0.65rem', flexShrink: 0 }}>● LIVE</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button
                onClick={() => setPreviewKey((k) => k + 1)}
                title="Reload Preview"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#38bdf8',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  padding: '2px 4px',
                }}
              >
                ↻
              </button>
              <button
                type="button"
                id="ai-preview-popout-btn"
                onClick={() => setIsPreviewModalOpen(true)}
                title="Open full preview"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  padding: '2px 4px',
                }}
              >
                ↗
              </button>
            </div>
          </div>

          {/* Iframe Viewport Container */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              background: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <iframe
              id="ai-test-preview-iframe"
              data-preview-iframe="true"
              key={previewKey}
              title="Live Preview"
              srcDoc={generatePreviewSrcDoc()}
              sandbox="allow-scripts allow-modals allow-same-origin"
              style={{
                width: previewDevice === 'mobile' ? '375px' : previewDevice === 'tablet' ? '768px' : '100%',
                height: '100%',
                border: previewDevice !== 'desktop' ? '1px solid #cbd5e1' : 'none',
                background: 'white',
                boxShadow: previewDevice !== 'desktop' ? '0 0 16px rgba(0,0,0,0.1)' : 'none',
                transition: 'width 0.2s ease',
              }}
            />
          </div>

          {/* Footer */}
          <div
            style={{
              height: 24,
              background: '#0f172a',
              borderTop: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
              fontSize: '0.7rem',
              color: '#94a3b8',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#cbd5e1' }}>Responsive 100%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                onClick={() => setPreviewDevice('desktop')}
                title="Desktop View"
                style={{ cursor: 'pointer', opacity: previewDevice === 'desktop' ? 1 : 0.5 }}
              >
                🖥️
              </span>
              <span
                onClick={() => setPreviewDevice('tablet')}
                title="Tablet View"
                style={{ cursor: 'pointer', opacity: previewDevice === 'tablet' ? 1 : 0.5 }}
              >
                💻
              </span>
              <span
                onClick={() => setPreviewDevice('mobile')}
                title="Mobile View"
                style={{ cursor: 'pointer', opacity: previewDevice === 'mobile' ? 1 : 0.5 }}
              >
                📱
              </span>
            </div>
          </div>
        </div>

        {/* ── SPLITTER 2: Preview <-> AI Assistant ── */}
        {!maximizedPanel && (
          <div
            onMouseDown={(e) => handleSplitterMouseDown(e, 2)}
            title="Drag horizontally to resize Preview and AI Assistant"
            style={{
              width: 10,
              flexShrink: 0,
              cursor: 'col-resize',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}
          >
            <div
              style={{
                width: 2,
                height: '100%',
                background: activeSplitter === 2 ? '#38bdf8' : '#334155',
                transition: 'background 0.15s ease',
              }}
            />
            <div
              style={{
                position: 'absolute',
                background: activeSplitter === 2 ? '#38bdf8' : '#1e293b',
                border: '1px solid ' + (activeSplitter === 2 ? '#ffffff' : '#475569'),
                color: activeSplitter === 2 ? '#0f172a' : '#94a3b8',
                borderRadius: 10,
                width: 14,
                height: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.65rem',
                fontWeight: 900,
                boxShadow: '0 2px 5px rgba(0,0,0,0.4)',
                userSelect: 'none',
              }}
            >
              ↔
            </div>
          </div>
        )}

        {/* ── PANEL 4: AI Assistant ── */}
        <div
          style={{
            flex: maximizedPanel === 'chat' ? '1 1 100%' : `0 0 calc(${panelWidths[3]}% - 7.5px)`,
            minWidth: maximizedPanel === 'chat' ? 'auto' : 180,
            display: !maximizedPanel || maximizedPanel === 'chat' ? 'flex' : 'none',
            flexDirection: 'column',
            background: '#131b2e',
            border: '1.5px solid #ea580c',
            borderRadius: 8,
            overflow: 'hidden',
            boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
            position: 'relative',
          }}
        >
          {/* Header */}
          <div
            style={{
              height: 38,
              background: '#0f172a',
              borderBottom: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 10px',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  background: '#ea580c',
                  color: '#ffffff',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '2px 7px',
                  borderRadius: 4,
                  lineHeight: 1.2,
                }}
              >
                4
              </span>
              <span style={{ color: '#f8fafc', fontWeight: 700, fontSize: '0.82rem' }}>
                AI Assistant
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                title={maximizedPanel === 'chat' ? 'Restore Panel' : 'Maximize Panel'}
                onClick={() => setMaximizedPanel((p) => (p === 'chat' ? null : 'chat'))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                {maximizedPanel === 'chat' ? '🗗' : '⛶'}
              </button>
            </div>
          </div>

          {/* Sub-header: Kimi status */}
          <div
            style={{
              height: 32,
              background: '#0b1120',
              borderBottom: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '0 12px',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: '#0E7C86',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
              }}
            >
              🤖
            </div>
            <span style={{ color: '#ffffff', fontWeight: 700, fontSize: '0.78rem' }}>
              Kimi AI Assistant
            </span>
            <span style={{ color: '#22c55e', fontSize: '0.68rem' }}>● Connected</span>
          </div>

          {/* Chat Messages Stream (Scrollable) */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              minHeight: 0,
            }}
          >
            {chatMessages.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  color: '#64748b',
                  marginTop: 20,
                  fontSize: '0.8rem',
                  padding: '0 16px',
                }}
              >
                <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>💬</div>
                <div style={{ color: '#cbd5e1', fontWeight: 600 }}>Welcome to Kimi AI Assistant!</div>
                <div style={{ fontSize: '0.74rem', marginTop: 4, lineHeight: 1.5 }}>
                  Ask for code suggestions, debugging, design advice, or best practices.
                </div>
              </div>
            )}

            {chatMessages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  alignSelf: msg.role === 'candidate' ? 'flex-end' : 'flex-start',
                  maxWidth: '90%',
                  background: msg.role === 'candidate' ? '#4338ca' : '#1e293b',
                  color: 'white',
                  borderRadius: 8,
                  padding: '8px 10px',
                  fontSize: '0.82rem',
                  lineHeight: 1.45,
                  whiteSpace: 'pre-wrap',
                  border: msg.role === 'candidate' ? 'none' : '1px solid #334155',
                }}
              >
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '0.68rem',
                    color: msg.role === 'candidate' ? '#c7d2fe' : '#38bdf8',
                    marginBottom: 3,
                  }}
                >
                  {msg.role === 'candidate' ? 'You' : 'Kimi AI'}
                </div>
                <div>{msg.message}</div>
                {msg.role === 'ai' && (
                  <button
                    onClick={() => handleCopyFromChat(msg.message)}
                    style={{
                      marginTop: 6,
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      color: '#cbd5e1',
                      borderRadius: 4,
                      padding: '2px 7px',
                      fontSize: '0.68rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    📋 Copy Snippet
                  </button>
                )}
              </div>
            ))}

            {isAiTyping && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  background: '#1e293b',
                  borderRadius: 8,
                  padding: '6px 10px',
                  color: '#94a3b8',
                  fontSize: '0.78rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span className="spinner spinner-dark" style={{ width: 12, height: 12 }} />
                Kimi is writing...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input Form */}
          <form
            onSubmit={handleSendChat}
            style={{
              padding: '8px 10px',
              background: '#0f172a',
              borderTop: '1px solid #1e293b',
              display: 'flex',
              gap: 6,
              flexShrink: 0,
            }}
          >
            <input
              id="kimi-chat-input"
              type="text"
              placeholder="Ask Kimi anything..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              disabled={isAiTyping || disqualified || proctoring?.isCameraDisconnected}
              style={{
                flex: 1,
                background: '#1e293b',
                border: '1px solid #334155',
                color: 'white',
                padding: '6px 10px',
                borderRadius: 5,
                fontSize: '0.8rem',
                outline: 'none',
              }}
            />
            <button
              id="kimi-send-btn"
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={isAiTyping || !chatInput.trim() || disqualified || proctoring?.isCameraDisconnected}
              style={{ padding: '6px 12px', fontSize: '0.78rem' }}
            >
              Send
            </button>
          </form>
        </div>
      </div>

      {/* ── Shared Bottom Proctoring Status & Violation Footer (FEATURE-004) ── */}
      <TestFooter proctoring={proctoring} violationCount={violationCount} />

      {/* ── Movable AI Proctoring PIP Feed (FR-5.2, FR-7.1, FR-7.2) ── */}
      <DraggableWebcamPip videoRef={proctoring.videoRef} faceCount={proctoring.faceCount} />

      {/* ── Fullscreen Enforcement Lock Overlay (FR-5.2, FR-5.3, BUG-34) ── */}
      {!proctoring.isFullscreen && !disqualified && (
        <div
          id="ai-fullscreen-blocking-overlay"
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
            id="ai-re-enter-fullscreen-btn"
            onClick={proctoring.requestFullscreen}
            className="btn btn-primary btn-lg"
            style={{ fontSize: '1rem', padding: '12px 28px', fontWeight: 700 }}
          >
            ⛶ Re-enter Fullscreen Mode
          </button>
        </div>
      )}

      {/* In-Page Full Application Preview Modal (BUG-XX: Prevents external browser tab-switch violations) */}
      {isPreviewModalOpen && (
        <div
          id="ai-preview-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Application Live Preview"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 950,
            background: 'rgba(7, 11, 20, 0.92)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            flexDirection: 'column',
            padding: '16px 20px 20px',
            boxSizing: 'border-box',
          }}
        >
          {/* Modal Browser Navigation Header */}
          <div
            style={{
              background: '#0d1525',
              border: '1px solid #1e293b',
              borderBottom: 'none',
              borderRadius: '8px 8px 0 0',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ color: '#10b981' }}>●</span> Application Live Preview
              </span>
              <div
                style={{
                  background: '#111827',
                  border: '1px solid #1e293b',
                  borderRadius: 4,
                  padding: '3px 12px',
                  color: '#38bdf8',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                http://localhost:3000
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                id="ai-preview-modal-reload-btn"
                onClick={() => setPreviewKey((k) => k + 1)}
                title="Reload Preview"
                style={{
                  background: '#1e293b',
                  border: '1px solid #334155',
                  color: '#38bdf8',
                  padding: '5px 12px',
                  borderRadius: 4,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                ↻ Reload
              </button>
              <button
                type="button"
                id="ai-preview-modal-close-btn"
                onClick={() => setIsPreviewModalOpen(false)}
                title="Close Preview (Esc)"
                style={{
                  background: '#ef4444',
                  border: 'none',
                  color: '#ffffff',
                  padding: '5px 14px',
                  borderRadius: 4,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                ✕ Close Preview
              </button>
            </div>
          </div>

          {/* Modal Iframe Container */}
          <div
            style={{
              flex: 1,
              background: '#ffffff',
              border: '1px solid #1e293b',
              borderRadius: '0 0 8px 8px',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <iframe
              id="ai-test-preview-modal-iframe"
              data-preview-iframe="true"
              key={`modal-preview-${previewKey}`}
              title="Full Application Live Preview"
              srcDoc={generatePreviewSrcDoc()}
              sandbox="allow-scripts allow-modals"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                background: '#ffffff',
              }}
            />
          </div>
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
    </div>
  );
}
