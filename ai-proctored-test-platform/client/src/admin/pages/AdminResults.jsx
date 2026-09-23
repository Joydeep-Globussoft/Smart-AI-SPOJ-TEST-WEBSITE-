// AdminResults.jsx — Results, Evaluation Breakdown, Shortlisting & PDF Export
// Implements PRD Section 9.7, Section 11.9 (FR-9.1-9.4), Section 11.10 (FR-10.1, FR-10.2), Section 14 (Globussoft Branding), FEATURE-021
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminNavbar from '../../shared/AdminNavbar';
import TestStatusBadge from '../../shared/TestStatusBadge';
import LoadingDots from '../../shared/LoadingDots';
import CandidateDetailEvaluationModal from '../../shared/CandidateDetailEvaluationModal';
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
  const [totalCandidates, setTotalCandidates] = useState(0);

  // Export PDF loading state (FR-10.2)
  const [exportingPdf, setExportingPdf] = useState(false);

  // FEATURE-023 / FEATURE-024: Selected candidate for shared Detail Evaluation modal
  const [selectedCandidate, setSelectedCandidate] = useState(null);

  // Copy-paste audit log modal
  const [selectedAuditSubmission, setSelectedAuditSubmission] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // FEATURE-023 / FEATURE-024: Open candidate detail evaluation modal
  const handleOpenCandidateDetail = (candidate) => {
    setSelectedCandidate(candidate);
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
        if (typeof resultsRes.value.data.totalCandidates === 'number') {
          setTotalCandidates(resultsRes.value.data.totalCandidates);
        }
      }

      if (shortlistRes.status === 'fulfilled') {
        const slData = shortlistRes.value.data;
        setShortlist(slData.shortlist);
        if (typeof slData.totalCandidates === 'number') {
          setTotalCandidates(slData.totalCandidates);
        }
      } else {
        // If shortlist hasn't been generated yet, try generating it
        try {
          const genRes = await api.regenerateShortlist(testId);
          setShortlist(genRes.data.shortlist);
          if (typeof genRes.data.totalCandidates === 'number') {
            setTotalCandidates(genRes.data.totalCandidates);
          }
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
      if (typeof res.data.totalCandidates === 'number') {
        setTotalCandidates(res.data.totalCandidates);
      }
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
      if (typeof res.data.totalCandidates === 'number') {
        setTotalCandidates(res.data.totalCandidates);
      }
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

  // Requirement 6: Compare candidate count from roster vs count used in shortlist
  const hasIntegrityMismatch = totalCandidates > 0 && totalShortlisted > totalCandidates;

  useEffect(() => {
    if (hasIntegrityMismatch) {
      console.error(
        `[Results Data Integrity Alert] Shortlist candidate count (${totalShortlisted}) exceeds test candidate roster (${totalCandidates}) for test ${testId}`
      );
    }
  }, [hasIntegrityMismatch, totalCandidates, totalShortlisted, testId]);

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

        {/* ── Data Integrity Alert Banner (Requirement 6) ── */}
        {hasIntegrityMismatch && (
          <div
            style={{
              background: '#450a0a',
              border: '1px solid #ef4444',
              color: '#fecaca',
              padding: '12px 18px',
              borderRadius: 8,
              marginBottom: 20,
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.2rem' }}>⚠️</span>
              <div>
                <strong>Data Integrity Alert:</strong> Shortlisted candidate count ({totalShortlisted}) exceeds the test candidate roster ({totalCandidates}).
              </div>
            </div>
            <button
              onClick={handleRegenerateShortlist}
              className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              disabled={updatingThresholds}
            >
              🔄 Re-sync Roster
            </button>
          </div>
        )}

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

        {/* ── FEATURE-023 / FEATURE-024: Candidate Detail Evaluation & Code Inspection Modal ── */}
        {selectedCandidate && (
          <CandidateDetailEvaluationModal
            testId={testId}
            candidate={selectedCandidate}
            testType={test?.testType}
            onClose={() => setSelectedCandidate(null)}
          />
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
