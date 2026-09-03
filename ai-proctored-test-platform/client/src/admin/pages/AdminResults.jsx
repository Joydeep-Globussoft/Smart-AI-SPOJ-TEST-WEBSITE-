// AdminResults.jsx — Results, Evaluation Breakdown, Shortlisting & PDF Export
// Implements PRD Section 9.7, Section 11.9 (FR-9.1-9.4), Section 11.10 (FR-10.1, FR-10.2), Section 14 (Globussoft Branding)
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminNavbar from '../../shared/AdminNavbar';
import TestStatusBadge from '../../shared/TestStatusBadge';
import api from '../../services/apiClient';

export default function AdminResults() {
  const { testId } = useParams();

  const [test, setTest] = useState(null);
  const [shortlist, setShortlist] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  // Active Tab: 'shortlist' | 'evaluations' | 'audit'
  const [activeTab, setActiveTab] = useState('shortlist');

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');

  // Threshold controls in Results view (FR-2.2, FR-2.3)
  const [passingCriteria, setPassingCriteria] = useState(3);
  const [malpracticeThreshold, setMalpracticeThreshold] = useState('');
  const [updatingThresholds, setUpdatingThresholds] = useState(false);

  // Export PDF loading state (FR-10.2)
  const [exportingPdf, setExportingPdf] = useState(false);

  // Candidate evaluation inspect modal
  const [selectedResult, setSelectedResult] = useState(null);

  // Copy-paste audit log modal
  const [selectedAuditSubmission, setSelectedAuditSubmission] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

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
        } catch (_) {}
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
          <div className="spinner spinner-dark" style={{ width: 40, height: 40, borderWidth: 3 }} />
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
          <span style={{ color: '#9ca3af' }}>/</span>
          <Link to={`/admin/tests/${testId}`} style={{ color: '#0E7C86', fontWeight: 500 }}>
            {test?.title || 'Test'}
          </Link>
          <span style={{ color: '#9ca3af' }}>/</span>
          <span style={{ color: '#4b5563', fontWeight: 600 }}>Results &amp; Shortlist</span>
        </div>

        {/* Top Header Card */}
        <div className="card" style={{ marginBottom: 24, padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <h1 style={{ fontSize: '1.7rem', color: '#1A2B3C', fontWeight: 800 }}>
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
              <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                Automated evaluation results, weighted scores, and official Globussoft shortlist (PRD §9.7, §11.10).
              </p>
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
                title="Export official shortlist PDF with Globussoft branding (FR-10.2)"
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
          <div className="stat-card">
            <div className="stat-value" style={{ fontSize: '1.4rem' }}>
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
                <strong style={{ fontSize: '0.9rem', color: '#1A2B3C', display: 'block' }}>
                  Adjust Shortlist Criteria
                </strong>
                <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                  Shortlist re-ranks dynamically on save (FR-10.1).
                </span>
              </div>

              {/* Passing Criteria Input (FR-2.2) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
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
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#374151' }}>
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

        {/* ── Navigation Tabs ── */}
        <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', marginBottom: 20, gap: 12 }}>
          <button
            onClick={() => setActiveTab('shortlist')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: 'pointer',
              color: activeTab === 'shortlist' ? '#0E7C86' : '#6b7280',
              borderBottom: activeTab === 'shortlist' ? '3px solid #0E7C86' : '3px solid transparent',
              marginBottom: -2,
            }}
          >
            🏆 Official Shortlist ({totalShortlisted})
          </button>
          <button
            onClick={() => setActiveTab('evaluations')}
            style={{
              padding: '10px 20px',
              border: 'none',
              background: 'none',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: 'pointer',
              color: activeTab === 'evaluations' ? '#0E7C86' : '#6b7280',
              borderBottom: activeTab === 'evaluations' ? '3px solid #0E7C86' : '3px solid transparent',
              marginBottom: -2,
            }}
          >
            📊 Detailed Evaluation Results ({results.length})
          </button>
        </div>

        {/* ── TAB 1: Ranked Shortlist (FR-10.1, FR-10.2) ── */}
        {activeTab === 'shortlist' && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 className="card-title">Ranked Shortlist (Rank Ascending = Score Descending)</h3>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2 }}>
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
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📋</div>
                <h4 style={{ color: '#1A2B3C', marginBottom: 4 }}>No candidates on the shortlist</h4>
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
                      <th style={{ textAlign: 'right' }}>Status</th>
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
                                color: c.rank <= 3 ? '#d97706' : '#1A2B3C',
                                fontSize: '0.9rem',
                              }}
                            >
                              {rankBadge}
                            </strong>
                          </td>
                          <td style={{ fontWeight: 600, color: '#1A2B3C' }}>{c.name}</td>
                          <td style={{ color: '#4b5563', fontSize: '0.85rem' }}>{c.email}</td>
                          <td>
                            <strong style={{ color: '#0E7C86', fontSize: '0.95rem' }}>
                              {(c.score || 0).toFixed(2)}
                            </strong>
                          </td>
                          <td style={{ color: '#374151', fontSize: '0.85rem' }}>
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
                          <td style={{ textAlign: 'right' }}>
                            <span className="badge badge-success" style={{ fontSize: '0.75rem' }}>
                              Shortlisted
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: Granular Evaluation Breakdown (FR-9.1 through FR-9.4) ── */}
        {activeTab === 'evaluations' && (
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 className="card-title">Per-Question Evaluation Scoring</h3>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2 }}>
                  Granular 10-parameter weighted rubric &amp; Judge0 hidden test case results (FR-9.1-9.4).
                </p>
              </div>

              <input
                type="text"
                className="form-control"
                placeholder="Search candidate name or email..."
                style={{ width: 260, fontSize: '0.8rem', padding: '6px 12px' }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {filteredResults.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>⚙️</div>
                <h4 style={{ color: '#1A2B3C', marginBottom: 4 }}>No evaluation results recorded yet</h4>
                <p style={{ fontSize: '0.85rem' }}>
                  Evaluations run automatically after candidates submit their test questions.
                </p>
              </div>
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Email</th>
                      <th>Final Weighted Score</th>
                      <th>Correctness (30%)</th>
                      <th>Complexity (25%)</th>
                      <th>Structure &amp; Approach</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map((r) => {
                      const breakdown = r.scoreBreakdown || {};
                      const correctness = (breakdown.codeCorrectness || 0).toFixed(1);
                      const complexity = (
                        ((breakdown.timeComplexity || 0) + (breakdown.spaceComplexity || 0)) /
                        2
                      ).toFixed(1);

                      return (
                        <tr key={r._id}>
                          <td>
                            <strong style={{ color: '#1A2B3C' }}>
                              {r.candidateId?.name || 'Candidate'}
                            </strong>
                          </td>
                          <td style={{ color: '#4b5563', fontSize: '0.85rem' }}>
                            {r.candidateId?.email || '—'}
                          </td>
                          <td>
                            <strong style={{ color: '#0E7C86', fontSize: '1rem' }}>
                              {(r.finalScorePerQuestion || 0).toFixed(2)} / 10
                            </strong>
                          </td>
                          <td style={{ color: '#374151', fontSize: '0.85rem' }}>
                            {correctness} / 10
                          </td>
                          <td style={{ color: '#374151', fontSize: '0.85rem' }}>
                            {complexity} / 10
                          </td>
                          <td style={{ color: '#6b7280', fontSize: '0.8rem' }}>
                            Opt: {(breakdown.codeOptimization || 0).toFixed(1)} · Exc: {(breakdown.exceptionHandling || 0).toFixed(1)}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              onClick={() => setSelectedResult(r)}
                              className="btn btn-secondary"
                              style={{ padding: '4px 12px', fontSize: '0.78rem' }}
                            >
                              Inspect Full Rubric
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
        )}

        {/* ── Candidate Rubric Inspection Modal (FR-9.4) ── */}
        {selectedResult && (
          <div className="modal-backdrop" onClick={() => setSelectedResult(null)}>
            <div className="modal-container" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3 className="modal-title">
                    Evaluation Breakdown: {selectedResult.candidateId?.name}
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                    Weighted Final Score: <strong>{(selectedResult.finalScorePerQuestion || 0).toFixed(2)} / 10.0</strong>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedResult(null)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* Rubric Score Grid (FR-9.4) */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                  {selectedResult.scoreBreakdown &&
                    Object.entries(selectedResult.scoreBreakdown).map(([param, score]) => (
                      <div
                        key={param}
                        style={{
                          background: '#f9fafb',
                          border: '1px solid #e5e7eb',
                          borderRadius: 8,
                          padding: 12,
                        }}
                      >
                        <span style={{ fontSize: '0.72rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600, display: 'block' }}>
                          {param.replace(/([A-Z])/g, ' $1')}
                        </span>
                        <strong style={{ fontSize: '1.1rem', color: '#0E7C86', marginTop: 2, display: 'block' }}>
                          {typeof score === 'number' ? score.toFixed(1) : score} <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>/ 10</span>
                        </strong>
                      </div>
                    ))}
                </div>

                {/* LLM Feedback & Rubric Notes */}
                {selectedResult.llmFeedback && (
                  <div>
                    <strong style={{ fontSize: '0.85rem', color: '#1A2B3C' }}>🤖 AI Evaluator Feedback:</strong>
                    <div
                      style={{
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: 8,
                        padding: 14,
                        fontSize: '0.85rem',
                        color: '#166534',
                        marginTop: 6,
                        whiteSpace: 'pre-line',
                        lineHeight: 1.5,
                      }}
                    >
                      {selectedResult.llmFeedback}
                    </div>
                  </div>
                )}

                {/* AI Test Prompt Log Inspection (FR-6.2, FR-9.3) */}
                {selectedResult.promptLog?.length > 0 && (
                  <div>
                    <strong style={{ fontSize: '0.85rem', color: '#1A2B3C' }}>
                      💬 AI Test Prompt Log ({selectedResult.promptLog.length} messages):
                    </strong>
                    <div
                      style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: 8,
                        padding: 12,
                        marginTop: 6,
                        maxHeight: 200,
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        fontSize: '0.8rem',
                      }}
                    >
                      {selectedResult.promptLog.map((log, lIdx) => (
                        <div
                          key={lIdx}
                          style={{
                            background: log.role === 'user' ? '#e0f2fe' : '#ffffff',
                            border: '1px solid #cbd5e1',
                            borderRadius: 6,
                            padding: 8,
                          }}
                        >
                          <span style={{ fontWeight: 700, color: log.role === 'user' ? '#0369a1' : '#475569' }}>
                            {log.role === 'user' ? 'Candidate Prompt:' : 'Kimi AI Reply:'}
                          </span>
                          <p style={{ margin: '4px 0 0 0', whiteSpace: 'pre-wrap' }}>{log.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setSelectedResult(null)}
                  className="btn btn-secondary"
                >
                  Close
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
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ maxHeight: 350, overflowY: 'auto' }}>
                {loadingAudit ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                    <div className="spinner spinner-dark" style={{ width: 28, height: 28 }} />
                  </div>
                ) : auditEvents.length === 0 ? (
                  <p style={{ color: '#6b7280', textAlign: 'center', padding: 24 }}>
                    No prohibited copy-paste events recorded for this candidate.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {auditEvents.map((evt, idx) => (
                      <div key={idx} style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 10, fontSize: '0.8rem' }}>
                        <div style={{ fontWeight: 600, color: '#b91c1c' }}>{evt.eventType || 'PASTE_ATTEMPT'}</div>
                        <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 2 }}>
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
