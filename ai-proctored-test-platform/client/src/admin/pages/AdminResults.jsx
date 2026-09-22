// AdminResults.jsx — Results, Evaluation Breakdown, Shortlisting & PDF Export
// Implements PRD Section 9.7, Section 11.9 (FR-9.1-9.4), Section 11.10 (FR-10.1, FR-10.2), Section 14 (Globussoft Branding), FEATURE-021
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Editor from '@monaco-editor/react';
import AdminNavbar from '../../shared/AdminNavbar';
import TestStatusBadge from '../../shared/TestStatusBadge';
import LoadingDots from '../../shared/LoadingDots';
import api from '../../services/apiClient';
import useAdminFilterState from '../../hooks/useAdminFilterState';
import useScrollRestoration from '../../hooks/useScrollRestoration';

const DEFAULT_FILTERS = {
  tab: 'shortlist',
  search: '',
};

export default function AdminResults() {
  const { testId } = useParams();

  const [test, setTest] = useState(null);
  const [shortlist, setShortlist] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  // FEATURE-021: Preserved Tab & Search query via URL parameters
  const [filters, updateFilter] = useAdminFilterState(DEFAULT_FILTERS);
  const activeTab = filters.tab;
  const searchQuery = filters.search;
  const setActiveTab = (tab) => updateFilter('tab', tab);
  const setSearchQuery = (search) => updateFilter('search', search);

  // FEATURE-021: Preserved scroll position for Results page
  useScrollRestoration({
    loading,
    key: `results_${activeTab}`,
    dependencies: [results.length, shortlist?.candidates?.length, activeTab, searchQuery],
  });

  // Threshold controls in Results view (FR-2.2, FR-2.3)
  const [passingCriteria, setPassingCriteria] = useState(3);
  const [malpracticeThreshold, setMalpracticeThreshold] = useState('');
  const [updatingThresholds, setUpdatingThresholds] = useState(false);

  // Export PDF loading state (FR-10.2)
  const [exportingPdf, setExportingPdf] = useState(false);

  // FEATURE-023: Per-candidate Detail Evaluation & Split-Screen Inspect Code modals
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [candidateDetail, setCandidateDetail] = useState(null);
  const [candidateDetailLoading, setCandidateDetailLoading] = useState(false);
  const [inspectingQuestion, setInspectingQuestion] = useState(null);
  const [activeFile, setActiveFile] = useState(null);

  // Copy-paste audit log modal
  const [selectedAuditSubmission, setSelectedAuditSubmission] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // FEATURE-023: Open candidate detail evaluation modal
  const handleOpenCandidateDetail = async (candidate) => {
    try {
      setSelectedCandidate(candidate);
      setCandidateDetailLoading(true);
      const cid = candidate.candidateId?._id || candidate.candidateId || candidate._id;
      const res = await api.getCandidateEvaluationDetail(testId, cid);
      setCandidateDetail(res.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load candidate evaluation detail');
      setSelectedCandidate(null);
    } finally {
      setCandidateDetailLoading(false);
    }
  };

  const handleCloseCandidateDetail = () => {
    setSelectedCandidate(null);
    setCandidateDetail(null);
    setInspectingQuestion(null);
    setActiveFile(null);
  };

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

  const fetchResultsAndShortlist = useCallback(async () => {
    try {
      setLoading(true);
      const [testRes, resultsRes, shortlistRes] = await Promise.allSettled([
        api.getTest(testId),
        api.getResults(testId),
        api.getShortlist(testId),
      ]);

      if (testRes.status === 'fulfilled') {
        const t = testRes.value.data.test;
        setTest(t);
        setPassingCriteria(t.passingCriteria || 0);
        setMalpracticeThreshold(
          t.malpracticeDisqualifyThreshold !== null && t.malpracticeDisqualifyThreshold !== undefined
            ? t.malpracticeDisqualifyThreshold
            : ''
        );
      }

      if (resultsRes.status === 'fulfilled') {
        setResults(resultsRes.value.data.results || []);
      }

      if (shortlistRes.status === 'fulfilled') {
        setShortlist(shortlistRes.value.data.shortlist);
      } else {
        // If shortlist hasn't been generated yet, try generating it
        try {
          const genRes = await api.regenerateShortlist(testId);
          setShortlist(genRes.data.shortlist);
        } catch (_) { }
      }
    } catch (err) {
      toast.error('Failed to load results and shortlist');
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => {
    fetchResultsAndShortlist();
  }, [fetchResultsAndShortlist]);

  // Handle Manual Regenerate Shortlist
  const handleRegenerateShortlist = async () => {
    try {
      setUpdatingThresholds(true);
      const res = await api.regenerateShortlist(testId);
      setShortlist(res.data.shortlist);
      toast.success('Shortlist regenerated successfully');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to regenerate shortlist');
    } finally {
      setUpdatingThresholds(false);
    }
  };

  // Handle Dynamic Threshold Updates (FR-2.2, FR-2.3)
  const handleUpdateThresholds = async (e) => {
    e.preventDefault();
    try {
      setUpdatingThresholds(true);
      // Update passing criteria
      await api.updatePassingCriteria(testId, { passingCriteria: Number(passingCriteria) });

      // Update malpractice threshold if test is ENDED (FR-2.3)
      if (test?.status === 'ENDED') {
        const val = malpracticeThreshold === '' ? null : Number(malpracticeThreshold);
        await api.updateMalpracticeThreshold(testId, { malpracticeDisqualifyThreshold: val });
      }

      // Refresh shortlist
      const res = await api.getShortlist(testId);
      setShortlist(res.data.shortlist);
      toast.success('Thresholds updated & shortlist re-calculated (FR-10.1)');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update thresholds');
    } finally {
      setUpdatingThresholds(false);
    }
  };

  // Export Shortlist as PDF with Globussoft Letterhead (FR-10.2, Section 14)
  const handleExportPdf = async () => {
    try {
      setExportingPdf(true);
      toast.loading('Generating branded shortlist PDF...', { id: 'pdf-toast' });
      const res = await api.exportShortlistPdf(testId);

      // Create blob link and trigger download
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Globussoft_Shortlist_${test?.title?.replace(/\s+/g, '_') || testId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Shortlist PDF downloaded!', { id: 'pdf-toast' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to export shortlist PDF', { id: 'pdf-toast' });
    } finally {
      setExportingPdf(false);
    }
  };

  // View Copy-Paste Audit Events
  const handleViewAuditLog = async (submissionId, candidateName) => {
    try {
      setSelectedAuditSubmission({ submissionId, candidateName });
      setLoadingAudit(true);
      const res = await api.getCopyPasteLog(submissionId);
      setAuditEvents(res.data.events || []);
    } catch (err) {
      setAuditEvents([]);
      toast.error('No copy-paste events recorded for this submission');
    } finally {
      setLoadingAudit(false);
    }
  };

  // Filtered Shortlist Candidates (FR-10.1: rank ascending = score descending)
  const shortlistCandidates = (shortlist?.candidates || []).filter((c) => {
    if (!searchQuery.trim()) return true;
    return (
      c.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Filtered Evaluation Results
  const filteredResults = results.filter((r) => {
    if (!searchQuery.trim()) return true;
    const name = r.candidateId?.name?.toLowerCase() || '';
    const email = r.candidateId?.email?.toLowerCase() || '';
    return name.includes(searchQuery.toLowerCase()) || email.includes(searchQuery.toLowerCase());
  });

  // Metrics (Defensively normalized to 0-10 scale)
  const totalShortlisted = shortlist?.candidates?.length || 0;

  const rawHighest = shortlist?.candidates?.[0]?.score;
  const highestScore = shortlist?.candidates?.length
    ? Math.min(10, Math.max(0, Number(rawHighest) || 0)).toFixed(1)
    : results.length
      ? Math.min(10, Math.max(0, Math.max(...results.map((r) => r.finalScorePerQuestion || 0)))).toFixed(1)
      : '0.0';

  const rawAvg = shortlist?.candidates?.length
    ? shortlist.candidates.reduce((acc, curr) => acc + (curr.score || 0), 0) / shortlist.candidates.length
    : results.length
      ? results.reduce((acc, r) => acc + (r.finalScorePerQuestion || 0), 0) / results.length
      : 0;

  const averageScore = Math.min(10, Math.max(0, Number(rawAvg) || 0)).toFixed(1);

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

  return (
    <div className="app-layout">
      <AdminNavbar />
      <main className="main-content">
        {/* Breadcrumb Navigation */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
          <Link to="/admin/tests" style={{ color: '#0E7C86', fontWeight: 500 }}>
            ← All Tests
          </Link>
          <span style={{ color: 'var(--color-text-light)' }}>/</span>
          <Link to={`/admin/tests/${testId}`} style={{ color: '#0E7C86', fontWeight: 500 }}>
            {test?.title || 'Test'}
          </Link>
          <span style={{ color: 'var(--color-text-light)' }}>/</span>
          <span style={{ color: 'var(--color-text)', fontWeight: 600 }}>Results &amp; Shortlist</span>
        </div>

        {/* Top Header Card */}
        <div className="card" style={{ marginBottom: 24, padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <h1 style={{ fontSize: '1.7rem', color: 'var(--color-navy)', fontWeight: 800 }}>
                  {test?.title} — Evaluation &amp; Shortlist
                </h1>
                <TestStatusBadge
                  status={test?.status}
                  style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                />
                <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                  {test?.testType}
                </span>
              </div>
            </div>

            {/* Top Actions: Export PDF & Regenerate */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={handleRegenerateShortlist}
                className="btn btn-secondary"
                disabled={updatingThresholds}
                title="Recalculate shortlist ranking from current scores"
              >
                🔄 {updatingThresholds ? 'Recalculating...' : 'Regenerate Shortlist'}
              </button>

              {/* FR-10.2: PDF Export with Globussoft Letterhead */}
              <button
                onClick={handleExportPdf}
                className="btn btn-primary"
                disabled={exportingPdf || totalShortlisted === 0}
                style={{ background: '#0E7C86' }}
                title="Download shortlisted PDF"
              >
                📄 {exportingPdf ? 'Generating PDF...' : 'Export Shortlist PDF'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Key Metrics Summary Bar ── */}
        <div className="stats-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="stat-card" style={{ borderLeft: '4px solid #0E7C86' }}>
            <div className="stat-value" style={{ color: '#0E7C86' }}>{totalShortlisted}</div>
            <div className="stat-label">Shortlisted Candidates</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid #2ECC71' }}>
            <div className="stat-value" style={{ color: '#2ECC71' }}>{highestScore}</div>
            <div className="stat-label">Top Score (Max 10.0)</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid #3498db' }}>
            <div className="stat-value" style={{ color: '#3498db' }}>{averageScore}</div>
            <div className="stat-label">Average Score</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid #8e44ad' }}>
            <div className="stat-value" style={{ fontSize: '1.4rem', color: '#8e44ad' }}>
              ≥ {shortlist?.passingCriteriaUsed ?? test?.passingCriteria} Qs
            </div>
            <div className="stat-label">Passing Criteria Used</div>
          </div>
        </div>

        {/* ── Dynamic Threshold Configuration Bar (FR-2.2, FR-2.3, FR-10.1) ── */}
        <div className="card" style={{ padding: '18px 24px', marginBottom: 24 }}>
          <form onSubmit={handleUpdateThresholds} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: '0.9rem', color: 'var(--color-navy)', display: 'block' }}>
                  Adjust Shortlist Criteria
                </strong>

              </div>

              {/* Passing Criteria Input (FR-2.2) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)' }}>
                  Passing Criteria (Min Qs):
                </label>
                <input
                  type="number"
                  className="form-control"
                  style={{ width: 80, padding: '4px 8px', fontSize: '0.85rem' }}
                  min="0"
                  max="50"
                  value={passingCriteria}
                  onChange={(e) => setPassingCriteria(e.target.value)}
                  required
                />
              </div>

              {/* Malpractice Threshold Input (FR-2.3, FR-7.5) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)' }}>
                  Max Malpractice Allowed:
                </label>
                <input
                  type="number"
                  className="form-control"
                  style={{ width: 80, padding: '4px 8px', fontSize: '0.85rem' }}
                  min="0"
                  placeholder="None"
                  disabled={test?.status !== 'ENDED'}
                  value={malpracticeThreshold}
                  onChange={(e) => setMalpracticeThreshold(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-secondary"
              disabled={updatingThresholds}
              style={{ fontSize: '0.85rem' }}
            >
              {updatingThresholds ? 'Applying...' : 'Apply & Recalculate Shortlist'}
            </button>
          </form>
        </div>

        {/* ── Official Shortlist Unified Table (FEATURE-023) ── */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 className="card-title">Official Shortlist ({totalShortlisted})</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                Generated on {shortlist?.generatedAt ? new Date(shortlist.generatedAt).toLocaleString() : '—'}
              </p>
            </div>

            <input
              type="text"
              className="form-control"
              placeholder="Search candidate in shortlist..."
              style={{ width: 260, fontSize: '0.8rem', padding: '6px 12px' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {shortlistCandidates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📋</div>
              <h4 style={{ color: 'var(--color-navy)', marginBottom: 4 }}>No candidates on the shortlist</h4>
              <p style={{ fontSize: '0.85rem' }}>
                {results.length === 0
                  ? 'Evaluations are still in progress or no submissions have been recorded.'
                  : 'Try lowering the Passing Criteria or adjusting the Malpractice Threshold.'}
              </p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 80 }}>Rank</th>
                    <th>Candidate Name</th>
                    <th>Email</th>
                    <th>Total Score (0–10)</th>
                    <th>Questions Solved</th>
                    <th>Malpractice Count</th>
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ textAlign: 'right' }}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {shortlistCandidates.map((c) => {
                    let rankBadge = `#${c.rank}`;
                    if (c.rank === 1) rankBadge = '🥇 #1';
                    if (c.rank === 2) rankBadge = '🥈 #2';
                    if (c.rank === 3) rankBadge = '🥉 #3';

                    return (
                      <tr key={c.candidateId || c.rank}>
                        <td>
                          <strong
                            style={{
                              color: c.rank <= 3 ? '#d97706' : 'var(--color-navy)',
                              fontSize: '0.9rem',
                            }}
                          >
                            {rankBadge}
                          </strong>
                        </td>
                        <td style={{ fontWeight: 600, color: 'var(--color-navy)' }}>{c.name}</td>
                        <td style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>{c.email}</td>
                        <td>
                          <strong style={{ color: 'var(--color-primary)', fontSize: '0.95rem' }}>
                            {(c.score || 0).toFixed(2)}
                          </strong>
                        </td>
                        <td style={{ color: 'var(--color-text)', fontSize: '0.85rem' }}>
                          {c.questionsCompleted} Qs
                        </td>
                        <td>
                          {c.malpracticeCount > 0 ? (
                            <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                              ⚠️ {c.malpracticeCount}
                            </span>
                          ) : (
                            <span style={{ color: '#2ECC71', fontSize: '0.8rem' }}>✓ Clean (0)</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                            Shortlisted
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            onClick={() => handleOpenCandidateDetail(c)}
                            className="btn btn-secondary"
                            style={{ padding: '5px 12px', fontSize: '0.8rem', fontWeight: 600 }}
                          >
                            Detail Evaluation
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

        {/* ── FEATURE-023: Candidate Detail Evaluation Modal ── */}
        {selectedCandidate && !inspectingQuestion && (
          <div className="modal-backdrop" onClick={handleCloseCandidateDetail}>
            <div
              className="modal-container"
              style={{ maxWidth: 960, width: '95vw', maxHeight: '88vh' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div>
                  <h3 className="modal-title" style={{ fontSize: '1.15rem' }}>
                    Candidate Evaluation: {selectedCandidate.name}
                  </h3>
                  <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      {selectedCandidate.email}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-border)' }}>•</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-primary)', fontWeight: 600 }}>
                      Total Score: {(selectedCandidate.score || 0).toFixed(2)} / 10.0
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-border)' }}>•</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text)' }}>
                      Solved: {selectedCandidate.questionsCompleted} Qs
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-border)' }}>•</span>
                    {selectedCandidate.malpracticeCount > 0 ? (
                      <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                        ⚠️ {selectedCandidate.malpracticeCount} Malpractice
                      </span>
                    ) : (
                      <span style={{ color: '#2ECC71', fontSize: '0.75rem', fontWeight: 600 }}>✓ Clean (0)</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCloseCandidateDetail}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ overflowY: 'auto', padding: '16px 20px' }}>
                {candidateDetailLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <LoadingDots size="md" />
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: 12 }}>
                      Loading question-level evaluation details...
                    </p>
                  </div>
                ) : !candidateDetail?.questions || candidateDetail.questions.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-text-muted)' }}>
                    <p>No question evaluation records found for this candidate.</p>
                  </div>
                ) : (
                  <div className="table-container">
                    <table className="table" style={{ width: '100%', marginBottom: 0 }}>
                      <thead>
                        <tr>
                          <th>Question</th>
                          <th>Status</th>
                          <th>Final Weighted Score</th>
                          <th>Correctness (30%)</th>
                          <th>Complexity (25%)</th>
                          <th>Structure &amp; Approach</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {candidateDetail.questions.map((q) => {
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
                            <tr key={q.questionId || q.questionIndex}>
                              <td>
                                <strong style={{ color: 'var(--color-navy)', display: 'block' }}>
                                  {q.title}
                                </strong>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
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
                                  <strong style={{ color: 'var(--color-primary)', fontSize: '0.95rem' }}>
                                    {finalScore} / 10
                                  </strong>
                                ) : (
                                  <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                                )}
                              </td>
                              <td style={{ color: 'var(--color-text)', fontSize: '0.85rem' }}>
                                {correctness !== '—' ? `${correctness} / 10` : '—'}
                              </td>
                              <td style={{ color: 'var(--color-text)', fontSize: '0.85rem' }}>
                                {complexity !== '—' ? `${complexity} / 10` : '—'}
                              </td>
                              <td style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                                {hasEval
                                  ? `Opt: ${(breakdown.codeOptimization || 0).toFixed(1)} · Exc: ${(breakdown.exceptionHandling || 0).toFixed(1)}`
                                  : '—'}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <button
                                  onClick={() => handleInspectCode(q)}
                                  className="btn btn-primary"
                                  style={{
                                    background: '#0E7C86',
                                    padding: '4px 12px',
                                    fontSize: '0.78rem',
                                    fontWeight: 600,
                                    opacity: hasCode || hasEval ? 1 : 0.6,
                                  }}
                                  disabled={!hasCode && !hasEval}
                                  title={hasCode || hasEval ? 'Inspect submitted code and rubric' : 'No submission recorded'}
                                >
                                  {hasCode || hasEval ? '🔍 Inspect Code' : 'No Submission'}
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

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={handleCloseCandidateDetail}
                  className="btn btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── FEATURE-023: Split-Screen Inspect Code Modal (Code Left, Rubric Right) ── */}
        {inspectingQuestion && (
          <div className="modal-backdrop" onClick={handleCloseInspectCode}>
            <div
              className="modal-container"
              style={{ maxWidth: 1150, width: '95vw', maxHeight: '90vh' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleCloseInspectCode}
                    className="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600 }}
                  >
                    ← Back to Question List
                  </button>
                  <h3 className="modal-title" style={{ fontSize: '1.1rem', margin: 0 }}>
                    Inspect Code — {inspectingQuestion.title}
                  </h3>
                  <span
                    className="badge badge-primary"
                    style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}
                  >
                    {inspectingQuestion.language || inspectingQuestion.testType}
                  </span>
                  {inspectingQuestion.evaluation && (
                    <span
                      style={{
                        background: 'rgba(14, 124, 134, 0.15)',
                        color: 'var(--color-primary)',
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
                  onClick={handleCloseCandidateDetail}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}
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
                      <strong style={{ fontSize: '0.88rem', color: 'var(--color-navy)' }}>
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
                          style={{ padding: '2px 8px', fontSize: '0.72rem' }}
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
                              borderRadius: 4,
                              border: activeFile === fileName ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                              background: activeFile === fileName ? 'var(--color-primary)' : 'var(--color-bg-subtle)',
                              color: activeFile === fileName ? '#fff' : 'var(--color-text)',
                              cursor: 'pointer',
                              fontWeight: 600,
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
                        border: '1px solid var(--color-border)',
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
                      <strong style={{ fontSize: '0.88rem', color: 'var(--color-navy)' }}>
                        📊 Evaluation Rubric Breakdown
                      </strong>
                      {inspectingQuestion.evaluation && (
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                          Final: <strong>{(inspectingQuestion.evaluation.finalScorePerQuestion ?? 0).toFixed(2)} / 10.0</strong>
                        </span>
                      )}
                    </div>

                    {!inspectingQuestion.evaluation ? (
                      <div
                        style={{
                          background: 'var(--color-bg-subtle)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 8,
                          padding: 24,
                          textAlign: 'center',
                          color: 'var(--color-text-muted)',
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
                                if (inspectingQuestion.testType !== 'AI_TEST' && (key === 'promptQuality' || key === 'outputCorrectnessDesign')) {
                                  return false;
                                }
                                return true;
                              })
                              .map(([param, score]) => (
                                <div
                                  key={param}
                                  style={{
                                    background: 'var(--color-bg-subtle)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 8,
                                    padding: 10,
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: '0.7rem',
                                      color: 'var(--color-text-muted)',
                                      textTransform: 'uppercase',
                                      fontWeight: 600,
                                      display: 'block',
                                    }}
                                  >
                                    {param.replace(/([A-Z])/g, ' $1')}
                                  </span>
                                  <strong
                                    style={{
                                      fontSize: '1.05rem',
                                      color: 'var(--color-primary)',
                                      marginTop: 2,
                                      display: 'block',
                                    }}
                                  >
                                    {typeof score === 'number' ? score.toFixed(1) : score}{' '}
                                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-light)' }}>
                                      / 10
                                    </span>
                                  </strong>
                                </div>
                              ))}
                        </div>

                        {/* AI Test Evaluator Feedback / Prompt Log (Condition 3: AI_TEST only) */}
                        {(test?.testType === 'AI_TEST' || inspectingQuestion.testType === 'AI_TEST') && (
                          <>
                            {inspectingQuestion.evaluation.llmFeedback && (
                              <div style={{ marginTop: 6 }}>
                                <strong style={{ fontSize: '0.82rem', color: 'var(--color-navy)' }}>
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
                                <strong style={{ fontSize: '0.82rem', color: 'var(--color-navy)' }}>
                                  💬 AI Test Prompt Log ({inspectingQuestion.promptLog.length} messages):
                                </strong>
                                <div
                                  style={{
                                    background: 'var(--color-bg-subtle)',
                                    border: '1px solid var(--color-border)',
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
                                            ? 'rgba(14, 124, 134, 0.15)'
                                            : 'var(--color-bg-card)',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: 6,
                                        padding: 6,
                                      }}
                                    >
                                      <span
                                        style={{
                                          fontWeight: 700,
                                          color:
                                            log.role === 'user' || log.role === 'candidate'
                                              ? 'var(--color-primary)'
                                              : 'var(--color-text)',
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

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={handleCloseInspectCode}
                  className="btn btn-secondary"
                >
                  Close Inspection
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Copy-Paste Audit Log Modal ── */}
        {selectedAuditSubmission && (
          <div className="modal-backdrop" onClick={() => setSelectedAuditSubmission(null)}>
            <div className="modal-container" style={{ maxWidth: 550 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">
                  Clipboard Audit: {selectedAuditSubmission.candidateName}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedAuditSubmission(null)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ maxHeight: 350, overflowY: 'auto' }}>
                {loadingAudit ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                    <LoadingDots size="md" />
                  </div>
                ) : auditEvents.length === 0 ? (
                  <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: 24 }}>
                    No prohibited copy-paste events recorded for this candidate.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {auditEvents.map((evt, idx) => (
                      <div key={idx} style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 6, padding: 10, fontSize: '0.8rem' }}>
                        <div style={{ fontWeight: 600, color: '#b91c1c' }}>{evt.eventType || 'PASTE_ATTEMPT'}</div>
                        <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', marginTop: 2 }}>
                          {new Date(evt.timestamp).toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setSelectedAuditSubmission(null)}
                  className="btn btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
