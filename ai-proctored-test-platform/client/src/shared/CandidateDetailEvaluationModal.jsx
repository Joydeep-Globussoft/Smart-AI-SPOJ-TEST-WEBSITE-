import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import Editor from '@monaco-editor/react';
import LoadingDots from './LoadingDots';
import SearchIcon from './SearchIcon';
import api from '../services/apiClient';
import { formatQuestionTitle } from '../admin/pages/AdminQuestionBank';

export default function CandidateDetailEvaluationModal({ testId, candidate, onClose, testType: fallbackTestType }) {
  const [candidateDetail, setCandidateDetail] = useState(null);
  const [candidateDetailLoading, setCandidateDetailLoading] = useState(true);
  const [inspectingQuestion, setInspectingQuestion] = useState(null);
  const [activeFile, setActiveFile] = useState(null);

  const candidateId = candidate?.candidateId?._id || candidate?.candidateId || candidate?._id || candidate?.id;

  useEffect(() => {
    if (!testId || !candidateId) return;

    let isMounted = true;
    setCandidateDetailLoading(true);
    setCandidateDetail(null);
    setInspectingQuestion(null);
    setActiveFile(null);

    api.getCandidateEvaluationDetail(testId, candidateId)
      .then((res) => {
        if (isMounted) {
          setCandidateDetail(res.data);
        }
      })
      .catch((err) => {
        if (isMounted) {
          toast.error(err.response?.data?.error || 'Failed to load candidate evaluation detail');
          if (onClose) onClose();
        }
      })
      .finally(() => {
        if (isMounted) {
          setCandidateDetailLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [testId, candidateId, onClose]);

  const handleInspectCode = (question) => {
    setInspectingQuestion(question);
    if (question.filesJson && typeof question.filesJson === 'object') {
      const keys = Object.keys(question.filesJson);
      if (keys.length > 0) setActiveFile(keys[0]);
    } else {
      setActiveFile(null);
    }
  };

  const handleCloseInspectCode = () => {
    setInspectingQuestion(null);
    setActiveFile(null);
  };

  const getMonacoLanguage = (lang, fileName) => {
    if (fileName) {
      if (fileName.endsWith('.html')) return 'html';
      if (fileName.endsWith('.css')) return 'css';
      if (fileName.endsWith('.js') || fileName.endsWith('.jsx')) return 'javascript';
      if (fileName.endsWith('.json')) return 'json';
      if (fileName.endsWith('.py')) return 'python';
      if (fileName.endsWith('.cpp') || fileName.endsWith('.h')) return 'cpp';
      if (fileName.endsWith('.java')) return 'java';
    }
    if (!lang) return 'javascript';
    const l = lang.toLowerCase();
    if (l.includes('python')) return 'python';
    if (l.includes('javascript') || l.includes('js')) return 'javascript';
    if (l.includes('react') || l.includes('jsx')) return 'javascript';
    if (l.includes('cpp') || l.includes('c++')) return 'cpp';
    if (l.includes('c')) return 'c';
    if (l.includes('java')) return 'java';
    return 'plaintext';
  };

  if (!candidate) return null;

  // Metadata resolution
  const candidateName = candidateDetail?.candidate?.name || candidate?.name || candidate?.candidateName || 'Candidate';
  const candidateEmail = candidateDetail?.candidate?.email || candidate?.email || candidate?.candidateEmail || '';
  const isDisqualified = Boolean(
    candidateDetail?.candidate?.isDisqualified ||
    candidate?.isDisqualified ||
    candidate?.status === 'DISQUALIFIED' ||
    candidate?.status === 'AUTO_SUBMITTED_DISQUALIFIED'
  );

  const testType = candidateDetail?.test?.testType || fallbackTestType || 'STANDARD';

  // Compute or format total score
  const totalScore = candidate?.score !== undefined && candidate?.score !== null
    ? Number(candidate.score).toFixed(2)
    : candidateDetail?.questions?.length
      ? (
        candidateDetail.questions.reduce((acc, q) => acc + (q.evaluation?.finalScorePerQuestion || 0), 0) /
        candidateDetail.questions.length
      ).toFixed(2)
      : '0.00';

  // Solved questions count
  const solvedCount = candidate?.questionsCompleted !== undefined && candidate?.questionsCompleted !== null
    ? candidate.questionsCompleted
    : candidateDetail?.questions?.filter((q) => q.isAttempted && q.evaluation?.isPassed)?.length ?? 0;

  // Malpractice count
  const malpracticeCount = candidate?.malpracticeCount ?? 0;

  return (
    <>
      {/* ── Candidate Detail Evaluation Modal ── */}
      {!inspectingQuestion && (
        <div className="modal-backdrop" style={{ zIndex: 1150, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
          <div
            id="candidate-detail-evaluation-modal"
            className="modal-container"
            style={{
              maxWidth: 960,
              width: '95vw',
              maxHeight: '88vh',
              background: 'var(--admin-card-bg, #FFFFFF)',
              borderRadius: 16,
              border: '1px solid var(--admin-card-border, #E0E7FF)',
              boxShadow: '0 20px 50px rgba(62, 99, 221, 0.15)',
              overflow: 'hidden',
              animation: 'modalSlideIn 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="modal-header"
              style={{
                background: 'var(--filterbar-bg, #F4F6FF)',
                borderBottom: '1px solid var(--admin-card-border, #E0E7FF)',
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3 className="modal-title" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-navy, #0F172A)', margin: 0 }}>
                    Candidate Evaluation: {candidateName}
                  </h3>
                  {isDisqualified && (
                    <span className="badge badge-danger" style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: 4 }}>
                      DISQUALIFIED
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {candidateEmail && (
                    <>
                      <span style={{ fontSize: '0.8rem', color: 'var(--admin-label, #5B6B8A)' }}>
                        {candidateEmail}
                      </span>
                      <span className="room-metric-divider" aria-hidden="true" style={{ color: 'var(--admin-card-border, #E0E7FF)' }}>|</span>
                    </>
                  )}
                  <span style={{ fontSize: '0.8rem', color: 'var(--admin-indigo, #3E63DD)', fontWeight: 700 }}>
                    Total Score: {totalScore} / 10.0
                  </span>
                  <span className="room-metric-divider" aria-hidden="true" style={{ color: 'var(--admin-card-border, #E0E7FF)' }}>|</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-navy, #0F172A)', fontWeight: 600 }}>
                    Solved: {solvedCount} Qs
                  </span>
                  <span className="room-metric-divider" aria-hidden="true" style={{ color: 'var(--admin-card-border, #E0E7FF)' }}>|</span>
                  {malpracticeCount > 0 ? (
                    (() => {
                      let severityClass = 'incident-badge-low';
                      let icon = '⚠️';
                      if (malpracticeCount >= 6) {
                        severityClass = 'incident-badge-high';
                        icon = '🚨';
                      } else if (malpracticeCount >= 3) {
                        severityClass = 'incident-badge-medium';
                        icon = '⚠️';
                      }
                      return (
                        <span className={`incident-badge ${severityClass}`} style={{ fontSize: '0.7rem', padding: '2px 8px' }}>
                          <span>{icon}</span> {malpracticeCount} {malpracticeCount === 1 ? 'Incident' : 'Incidents'}
                        </span>
                      );
                    })()
                  ) : (
                    <span style={{ color: '#059669', fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <span>✓</span> Clean (0)
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  color: 'var(--admin-label, #5B6B8A)',
                  padding: '4px 8px',
                  borderRadius: 6,
                  lineHeight: 1,
                }}
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ overflowY: 'auto', padding: '18px 20px' }}>
              {candidateDetailLoading ? (
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                  <LoadingDots size="md" />
                  <p style={{ color: 'var(--admin-label, #5B6B8A)', fontSize: '0.85rem', marginTop: 12 }}>
                    Loading question-level evaluation details...
                  </p>
                </div>
              ) : !candidateDetail?.questions || candidateDetail.questions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--admin-label, #5B6B8A)' }}>
                  <p>No question evaluation records found for this candidate.</p>
                </div>
              ) : (
                <div className="table-container" style={{ border: '1px solid var(--admin-card-border, #E0E7FF)', borderRadius: 10, overflow: 'hidden' }}>
                  <table className="table" style={{ width: '100%', marginBottom: 0 }}>
                    <thead>
                      <tr style={{ background: 'var(--color-table-header-bg, #111827)', color: 'var(--color-table-header-text, #F9FAFB)' }}>
                        <th style={{ background: 'inherit', color: 'inherit' }}>Question</th>
                        <th style={{ background: 'inherit', color: 'inherit' }}>Status</th>
                        <th style={{ background: 'inherit', color: 'inherit' }}>Final Weighted Score</th>
                        <th style={{ background: 'inherit', color: 'inherit' }}>Correctness (30%)</th>
                        <th style={{ background: 'inherit', color: 'inherit' }}>Complexity (25%)</th>
                        <th style={{ background: 'inherit', color: 'inherit' }}>Structure &amp; Approach</th>
                        <th style={{ textAlign: 'right', background: 'inherit', color: 'inherit' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidateDetail.questions.map((q, qIdx) => {
                        const ev = q.evaluation;
                        const breakdown = ev?.scoreBreakdown || {};
                        const hasEval = Boolean(ev);
                        const correctness = hasEval ? (breakdown.codeCorrectness || 0).toFixed(1) : '—';
                        const complexity = hasEval
                          ? (((breakdown.timeComplexity || 0) + (breakdown.spaceComplexity || 0)) / 2).toFixed(1)
                          : '—';
                        const finalScore = hasEval ? (ev.finalScorePerQuestion ?? 0).toFixed(2) : '—';

                        const isAttempted = q.isAttempted;
                        const hasCode = Boolean(q.code && q.code.trim().length > 0) || Boolean(q.filesJson);

                        return (
                          <tr key={q.questionId || q.questionIndex} style={{ borderBottom: '1px solid var(--admin-card-border, #E0E7FF)' }}>
                            <td>
                              <strong style={{ color: 'var(--color-navy, #0F172A)', display: 'block' }}>
                                {formatQuestionTitle(q, (q.questionIndex || (qIdx + 1)) - 1)}
                              </strong>
                              <span style={{ fontSize: '0.75rem', color: 'var(--admin-label, #5B6B8A)' }}>
                                {q.testType} · {q.difficulty}
                              </span>
                            </td>
                            <td>
                              {!isAttempted ? (
                                <span
                                  className="badge"
                                  style={{
                                    background: 'rgba(156, 163, 175, 0.15)',
                                    color: '#9ca3af',
                                    fontSize: '0.72rem',
                                  }}
                                >
                                  Not Attempted
                                </span>
                              ) : (
                                <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>
                                  {q.status === 'SUBMITTED' ? 'Submitted' : 'Auto-Submitted'}
                                </span>
                              )}
                            </td>
                            <td>
                              {hasEval ? (
                                <strong style={{ color: 'var(--admin-indigo, #3E63DD)', fontSize: '0.95rem' }}>
                                  {finalScore} / 10
                                </strong>
                              ) : (
                                <span style={{ color: 'var(--admin-label, #5B6B8A)' }}>—</span>
                              )}
                            </td>
                            <td style={{ color: 'var(--color-text)', fontSize: '0.85rem' }}>
                              {correctness !== '—' ? `${correctness} / 10` : '—'}
                            </td>
                            <td style={{ color: 'var(--color-text)', fontSize: '0.85rem' }}>
                              {complexity !== '—' ? `${complexity} / 10` : '—'}
                            </td>
                            <td style={{ color: 'var(--admin-label, #5B6B8A)', fontSize: '0.8rem' }}>
                              {hasEval
                                ? `Opt: ${(breakdown.codeOptimization || 0).toFixed(1)} · Exc: ${(breakdown.exceptionHandling || 0).toFixed(1)}`
                                : '—'}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                onClick={() => handleInspectCode(q)}
                                className="btn btn-primary"
                                style={{
                                  background: 'var(--admin-indigo, #3E63DD)',
                                  borderColor: 'var(--admin-indigo, #3E63DD)',
                                  padding: '5px 14px',
                                  fontSize: '0.78rem',
                                  fontWeight: 700,
                                  borderRadius: 6,
                                  opacity: hasCode || hasEval ? 1 : 0.6,
                                }}
                                disabled={!hasCode && !hasEval}
                                title={hasCode || hasEval ? 'Inspect submitted code and rubric' : 'No submission recorded'}
                              >
                                {hasCode || hasEval ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    <SearchIcon size={12} color="currentColor" strokeWidth={2} /> Inspect Code
                                  </span>
                                ) : (
                                  'No Submission'
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div
              className="modal-footer"
              style={{
                background: 'var(--filterbar-bg, #F4F6FF)',
                borderTop: '1px solid var(--admin-card-border, #E0E7FF)',
                padding: '14px 20px',
              }}
            >
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary"
                style={{
                  padding: '8px 18px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  background: 'var(--admin-card-bg, #FFFFFF)',
                  border: '1px solid var(--admin-card-border, #E0E7FF)',
                  borderRadius: 8,
                  color: 'var(--color-navy, #0F172A)',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Split-Screen Inspect Code Modal (Code Left, Rubric Right) ── */}
      {inspectingQuestion && (
        <div className="modal-backdrop" style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)' }} onClick={handleCloseInspectCode}>
          <div
            id="inspect-code-modal"
            className="modal-container"
            style={{
              maxWidth: 1150,
              width: '95vw',
              maxHeight: '90vh',
              background: 'var(--admin-card-bg, #FFFFFF)',
              borderRadius: 16,
              border: '1px solid var(--admin-card-border, #E0E7FF)',
              boxShadow: '0 20px 50px rgba(62, 99, 221, 0.15)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="modal-header"
              style={{
                background: 'var(--filterbar-bg, #F4F6FF)',
                borderBottom: '1px solid var(--admin-card-border, #E0E7FF)',
                padding: '16px 20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleCloseInspectCode}
                  className="btn btn-secondary"
                  style={{
                    padding: '5px 12px',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    background: 'var(--admin-card-bg, #FFFFFF)',
                    border: '1px solid var(--admin-card-border, #E0E7FF)',
                    borderRadius: 6,
                    color: 'var(--color-navy, #0F172A)',
                  }}
                >
                  ← Back to Question List
                </button>
                <h3 className="modal-title" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-navy, #0F172A)', margin: 0 }}>
                  Submission Report — {formatQuestionTitle(inspectingQuestion, (inspectingQuestion.questionIndex || 1) - 1)}
                </h3>
                <span
                  className="badge badge-primary"
                  style={{ fontSize: '0.75rem', textTransform: 'uppercase', background: 'var(--admin-indigo, #3E63DD)', borderRadius: 4 }}
                >
                  {inspectingQuestion.language || inspectingQuestion.testType}
                </span>
                {inspectingQuestion.evaluation && (
                  <span
                    style={{
                      background: 'rgba(62, 99, 221, 0.12)',
                      color: 'var(--admin-indigo, #3E63DD)',
                      padding: '3px 10px',
                      borderRadius: 12,
                      fontWeight: 700,
                      fontSize: '0.8rem',
                    }}
                  >
                    Score: {(inspectingQuestion.evaluation.finalScorePerQuestion ?? 0).toFixed(2)} / 10.0
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  color: 'var(--admin-label, #5B6B8A)',
                  padding: '4px 8px',
                  borderRadius: 6,
                  lineHeight: 1,
                }}
                title="Close Modal"
              >
                ✕
              </button>
            </div>

            <div className="modal-body" style={{ overflowY: 'auto', padding: 20 }}>
              <div className="inspect-split-screen">
                {/* ── LEFT PANE: Submitted Code ── */}
                <div className="inspect-split-left" style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <strong style={{ fontSize: '0.88rem', color: 'var(--color-navy, #0F172A)' }}>
                      📄 Submitted Code
                    </strong>
                    {inspectingQuestion.code && (
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            activeFile && inspectingQuestion.filesJson
                              ? inspectingQuestion.filesJson[activeFile]
                              : inspectingQuestion.code
                          );
                          toast.success('Code copied to clipboard!');
                        }}
                        className="btn btn-secondary"
                        style={{
                          padding: '3px 10px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          background: 'var(--filterbar-bg, #F4F6FF)',
                          border: '1px solid var(--admin-card-border, #E0E7FF)',
                          borderRadius: 4,
                          color: 'var(--color-navy, #0F172A)',
                        }}
                      >
                        📋 Copy Code
                      </button>
                    )}
                  </div>

                  {/* AI Test Multi-File Tab Selector */}
                  {inspectingQuestion.filesJson && typeof inspectingQuestion.filesJson === 'object' && (
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      {Object.keys(inspectingQuestion.filesJson).map((fileName) => (
                        <button
                          key={fileName}
                          type="button"
                          onClick={() => setActiveFile(fileName)}
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            borderRadius: 6,
                            border: activeFile === fileName ? '1.5px solid var(--admin-indigo, #3E63DD)' : '1px solid var(--admin-card-border, #E0E7FF)',
                            background: activeFile === fileName ? 'var(--admin-indigo, #3E63DD)' : 'var(--filterbar-bg, #F4F6FF)',
                            color: activeFile === fileName ? '#fff' : 'var(--color-navy, #0F172A)',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          {fileName}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Monaco Editor Read-Only Code Viewer */}
                  <div
                    style={{
                      border: '1px solid var(--admin-card-border, #E0E7FF)',
                      borderRadius: 8,
                      overflow: 'hidden',
                      height: 450,
                      background: '#1e1e1e',
                    }}
                  >
                    <Editor
                      height="450px"
                      language={getMonacoLanguage(inspectingQuestion.language, activeFile)}
                      value={
                        activeFile && inspectingQuestion.filesJson
                          ? inspectingQuestion.filesJson[activeFile] || '// Empty file'
                          : inspectingQuestion.code || '// No code submitted for this question'
                      }
                      theme="vs-dark"
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 13,
                        scrollBeyondLastLine: false,
                        lineNumbers: 'on',
                        wordWrap: 'on',
                        automaticLayout: true,
                      }}
                    />
                  </div>
                </div>

                {/* ── RIGHT PANE: Granular Rubric Breakdown ── */}
                <div className="inspect-split-right" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '0.88rem', color: 'var(--color-navy, #0F172A)' }}>
                      📊 Evaluation Rubric Breakdown
                    </strong>
                    {inspectingQuestion.evaluation && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--admin-label, #5B6B8A)' }}>
                        Final: <strong style={{ color: 'var(--color-navy, #0F172A)' }}>{(inspectingQuestion.evaluation.finalScorePerQuestion ?? 0).toFixed(2)} / 10.0</strong>
                      </span>
                    )}
                  </div>

                  {!inspectingQuestion.evaluation ? (
                    <div
                      style={{
                        background: 'var(--filterbar-bg, #F4F6FF)',
                        border: '1px solid var(--admin-card-border, #E0E7FF)',
                        borderRadius: 8,
                        padding: 24,
                        textAlign: 'center',
                        color: 'var(--admin-label, #5B6B8A)',
                      }}
                    >
                      <p style={{ margin: 0, fontSize: '0.88rem' }}>
                        No evaluation rubric recorded for this question.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* 10-Parameter Rubric Grid */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                          gap: 10,
                          maxHeight: 320,
                          overflowY: 'auto',
                          paddingRight: 4,
                        }}
                      >
                        {inspectingQuestion.evaluation.scoreBreakdown &&
                          Object.entries(inspectingQuestion.evaluation.scoreBreakdown)
                            .filter(([key]) => {
                              // Filter AI-only vs standard parameters appropriately
                              if (testType !== 'AI_TEST' && inspectingQuestion.testType !== 'AI_TEST' && (key === 'promptQuality' || key === 'outputCorrectnessDesign')) {
                                return false;
                              }
                              return true;
                            })
                            .map(([param, score]) => (
                              <div
                                key={param}
                                style={{
                                  background: 'var(--filterbar-bg, #F4F6FF)',
                                  border: '1px solid var(--admin-card-border, #E0E7FF)',
                                  borderRadius: 8,
                                  padding: 10,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: '0.7rem',
                                    color: 'var(--admin-label, #5B6B8A)',
                                    textTransform: 'uppercase',
                                    fontWeight: 700,
                                    display: 'block',
                                  }}
                                >
                                  {param.replace(/([A-Z])/g, ' $1')}
                                </span>
                                <strong
                                  style={{
                                    fontSize: '1.05rem',
                                    color: 'var(--admin-indigo, #3E63DD)',
                                    marginTop: 2,
                                    display: 'block',
                                    fontWeight: 800,
                                  }}
                                >
                                  {typeof score === 'number' ? score.toFixed(1) : score}{' '}
                                  <span style={{ fontSize: '0.72rem', color: 'var(--admin-label, #5B6B8A)' }}>
                                    / 10
                                  </span>
                                </strong>
                              </div>
                            ))}
                      </div>

                      {/* AI Test Evaluator Feedback / Prompt Log (Condition 3: AI_TEST only) */}
                      {(testType === 'AI_TEST' || inspectingQuestion.testType === 'AI_TEST') && (
                        <>
                          {inspectingQuestion.evaluation.llmFeedback && (
                            <div style={{ marginTop: 6 }}>
                              <strong style={{ fontSize: '0.82rem', color: 'var(--color-navy, #0F172A)' }}>
                                🤖 AI Evaluator Feedback:
                              </strong>
                              <div
                                style={{
                                  background: 'rgba(16, 185, 129, 0.1)',
                                  border: '1px solid rgba(16, 185, 129, 0.25)',
                                  borderRadius: 8,
                                  padding: 12,
                                  fontSize: '0.82rem',
                                  color: 'var(--color-text)',
                                  marginTop: 4,
                                  whiteSpace: 'pre-line',
                                  lineHeight: 1.4,
                                  maxHeight: 140,
                                  overflowY: 'auto',
                                }}
                              >
                                {inspectingQuestion.evaluation.llmFeedback}
                              </div>
                            </div>
                          )}

                          {inspectingQuestion.promptLog?.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                              <strong style={{ fontSize: '0.82rem', color: 'var(--color-navy, #0F172A)' }}>
                                💬 AI Test Prompt Log ({inspectingQuestion.promptLog.length} messages):
                              </strong>
                              <div
                                style={{
                                  background: 'var(--filterbar-bg, #F4F6FF)',
                                  border: '1px solid var(--admin-card-border, #E0E7FF)',
                                  borderRadius: 8,
                                  padding: 10,
                                  marginTop: 4,
                                  maxHeight: 150,
                                  overflowY: 'auto',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 6,
                                  fontSize: '0.78rem',
                                }}
                              >
                                {inspectingQuestion.promptLog.map((log, lIdx) => (
                                  <div
                                    key={lIdx}
                                    style={{
                                      background:
                                        log.role === 'user' || log.role === 'candidate'
                                          ? 'rgba(62, 99, 221, 0.12)'
                                          : 'var(--admin-card-bg, #FFFFFF)',
                                      border: '1px solid var(--admin-card-border, #E0E7FF)',
                                      borderRadius: 6,
                                      padding: 8,
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontWeight: 700,
                                        color:
                                          log.role === 'user' || log.role === 'candidate'
                                            ? 'var(--admin-indigo, #3E63DD)'
                                            : 'var(--color-navy, #0F172A)',
                                      }}
                                    >
                                      {log.role === 'user' || log.role === 'candidate'
                                        ? 'Candidate Prompt:'
                                        : 'AI Reply:'}
                                    </span>
                                    <p style={{ margin: '2px 0 0 0', whiteSpace: 'pre-wrap', color: 'var(--color-text)' }}>
                                      {log.content || log.message}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div
              className="modal-footer"
              style={{
                background: 'var(--filterbar-bg, #F4F6FF)',
                borderTop: '1px solid var(--admin-card-border, #E0E7FF)',
                padding: '14px 20px',
              }}
            >
              <button
                type="button"
                onClick={handleCloseInspectCode}
                className="btn btn-secondary"
                style={{
                  padding: '8px 18px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  background: 'var(--admin-card-bg, #FFFFFF)',
                  border: '1px solid var(--admin-card-border, #E0E7FF)',
                  borderRadius: 8,
                  color: 'var(--color-navy, #0F172A)',
                }}
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
