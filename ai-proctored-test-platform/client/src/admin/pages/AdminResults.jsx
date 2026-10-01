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
import SearchIcon from '../../shared/SearchIcon';

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
      toast.success('Applied Successfully');
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
      <div className="app-layout" style={{ minHeight: '100vh', background: 'var(--admin-canvas-bg, #EEF2FF)' }}>
        <AdminNavbar />
        <main className="main-content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
          <LoadingDots size="lg" />
        </main>
      </div>
    );
  }

  return (
    <div className="app-layout" style={{ minHeight: '100vh', background: 'var(--admin-canvas-bg, #EEF2FF)' }}>
      <AdminNavbar />
      <main className="main-content" style={{ padding: '24px 32px' }}>
        {/* Breadcrumb Navigation */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem' }}>
          <Link to="/admin/tests" style={{ color: 'var(--admin-indigo, #3E63DD)', fontWeight: 600, textDecoration: 'none' }}>
            ← All Tests
          </Link>
          <span style={{ color: 'var(--admin-card-border, #CBD5E1)' }}>/</span>
          <Link to={`/admin/tests/${testId}`} style={{ color: 'var(--admin-indigo, #3E63DD)', fontWeight: 600, textDecoration: 'none' }}>
            {test?.title || 'Test'}
          </Link>
          <span style={{ color: 'var(--admin-card-border, #CBD5E1)' }}>/</span>
          <span style={{ color: 'var(--color-navy, #0F172A)', fontWeight: 700 }}>Results &amp; Shortlist</span>
        </div>

        {/* Top Header Card */}
        <div
          className="card"
          style={{
            marginBottom: 24,
            padding: '24px 28px',
            background: 'var(--admin-card-bg, #FFFFFF)',
            border: '1px solid var(--admin-card-border, #E0E7FF)',
            borderRadius: 14,
            boxShadow: 'var(--admin-card-shadow)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.7rem', color: 'var(--color-navy, #0F172A)', fontWeight: 800, margin: 0 }}>
                  {test?.title} — Evaluation &amp; Shortlist
                </h1>
                <TestStatusBadge
                  status={test?.status}
                  style={{ fontSize: '0.8rem', padding: '4px 10px', borderRadius: 6 }}
                />
                <span
                  className="badge"
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 6,
                    background: 'rgba(62, 99, 221, 0.12)',
                    color: 'var(--admin-indigo, #3E63DD)',
                    border: '1px solid rgba(62, 99, 221, 0.25)',
                  }}
                >
                  {test?.testType}
                </span>
              </div>
            </div>

            {/* Top Actions: Test Summary Dashboard & Export PDF */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Link
                to={`/admin/tests/${testId}/live`}
                className="btn btn-secondary"
                style={{
                  padding: '8px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  background: 'var(--admin-card-bg, #FFFFFF)',
                  border: '1px solid var(--admin-card-border, #E0E7FF)',
                  borderRadius: 8,
                  color: 'var(--color-navy, #0F172A)',
                  boxShadow: 'var(--admin-card-shadow)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                title={test?.status === 'LIVE' ? 'Open Live Dashboard' : 'View test proctoring summary & candidate roster'}
              >
                <span>📋</span> Test Summary Dashboard
              </Link>

              {/* PDF Export with Globussoft Letterhead */}
              <button
                onClick={handleExportPdf}
                className="btn btn-primary"
                disabled={exportingPdf || totalShortlisted === 0}
                style={{
                  background: 'var(--admin-indigo, #3E63DD)',
                  borderColor: 'var(--admin-indigo, #3E63DD)',
                  color: '#FFFFFF',
                  padding: '8px 18px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  borderRadius: 8,
                  boxShadow: '0 2px 8px rgba(62, 99, 221, 0.35)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: (exportingPdf || totalShortlisted === 0) ? 'not-allowed' : 'pointer',
                  opacity: (exportingPdf || totalShortlisted === 0) ? 0.6 : 1,
                }}
                title="Download shortlisted PDF"
              >
                <span>📄</span> {exportingPdf ? 'Generating PDF...' : 'Export Shortlist PDF'}
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
              borderRadius: 10,
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
              style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: 6 }}
              disabled={updatingThresholds}
            >
              🔄 Re-sync Roster
            </button>
          </div>
        )}

        {/* ── Key Metrics Summary Bar (4 KPI Cards) ── */}
        <div className="stats-grid" style={{ marginBottom: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          <div
            className="stat-card"
            style={{
              background: 'var(--admin-card-bg, #FFFFFF)',
              border: '1px solid var(--admin-card-border, #E0E7FF)',
              borderLeft: '4px solid #0E7C86',
              borderRadius: 12,
              padding: '18px 20px',
              boxShadow: 'var(--admin-card-shadow)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div className="stat-value" style={{ color: '#0E7C86', fontSize: '1.75rem', fontWeight: 800, lineHeight: 1.2 }}>
              {totalShortlisted}
            </div>
            <div className="stat-label" style={{ color: 'var(--admin-label, #5B6B8A)', fontSize: '0.8rem', fontWeight: 600, marginTop: 4 }}>
              Shortlisted Candidates
            </div>
          </div>

          <div
            className="stat-card"
            style={{
              background: 'var(--admin-card-bg, #FFFFFF)',
              border: '1px solid var(--admin-card-border, #E0E7FF)',
              borderLeft: '4px solid #2ECC71',
              borderRadius: 12,
              padding: '18px 20px',
              boxShadow: 'var(--admin-card-shadow)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div className="stat-value" style={{ color: '#2ECC71', fontSize: '1.75rem', fontWeight: 800, lineHeight: 1.2 }}>
              {highestScore}
            </div>
            <div className="stat-label" style={{ color: 'var(--admin-label, #5B6B8A)', fontSize: '0.8rem', fontWeight: 600, marginTop: 4 }}>
              Top Score (Max 10.0)
            </div>
          </div>

          <div
            className="stat-card"
            style={{
              background: 'var(--admin-card-bg, #FFFFFF)',
              border: '1px solid var(--admin-card-border, #E0E7FF)',
              borderLeft: '4px solid #3498db',
              borderRadius: 12,
              padding: '18px 20px',
              boxShadow: 'var(--admin-card-shadow)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div className="stat-value" style={{ color: '#3498db', fontSize: '1.75rem', fontWeight: 800, lineHeight: 1.2 }}>
              {averageScore}
            </div>
            <div className="stat-label" style={{ color: 'var(--admin-label, #5B6B8A)', fontSize: '0.8rem', fontWeight: 600, marginTop: 4 }}>
              Average Score
            </div>
          </div>

          <div
            className="stat-card"
            style={{
              background: 'var(--admin-card-bg, #FFFFFF)',
              border: '1px solid var(--admin-card-border, #E0E7FF)',
              borderLeft: '4px solid #8e44ad',
              borderRadius: 12,
              padding: '18px 20px',
              boxShadow: 'var(--admin-card-shadow)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}
          >
            <div className="stat-value" style={{ fontSize: '1.5rem', color: '#8e44ad', fontWeight: 800, lineHeight: 1.2 }}>
              ≥ {shortlist?.passingCriteriaUsed ?? test?.passingCriteria} Qs
            </div>
            <div className="stat-label" style={{ color: 'var(--admin-label, #5B6B8A)', fontSize: '0.8rem', fontWeight: 600, marginTop: 4 }}>
              Passing Criteria Used
            </div>
          </div>
        </div>

        {/* ── Dynamic Threshold Configuration Bar (FR-2.2, FR-2.3, FR-10.1) ── */}
        <div
          className="card"
          style={{
            padding: '16px 24px',
            marginBottom: 24,
            background: 'var(--admin-card-bg, #FFFFFF)',
            border: '1px solid var(--admin-card-border, #E0E7FF)',
            borderRadius: 14,
            boxShadow: 'var(--admin-card-shadow)',
          }}
        >
          <form onSubmit={handleUpdateThresholds} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: '0.92rem', color: 'var(--color-navy, #0F172A)', fontWeight: 800, display: 'block' }}>
                  Adjust Shortlist Criteria
                </strong>
              </div>

              {/* Passing Criteria Input (FR-2.2) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--admin-label, #5B6B8A)' }}>
                  Passing Criteria (Min Qs):
                </label>
                <input
                  type="number"
                  className="form-control"
                  style={{
                    width: 75,
                    padding: '6px 10px',
                    fontSize: '0.85rem',
                    background: 'var(--filterbar-bg, #F4F6FF)',
                    border: '1px solid var(--admin-card-border, #E0E7FF)',
                    borderRadius: 8,
                    color: 'var(--color-text, #0F172A)',
                    fontWeight: 700,
                  }}
                  min="0"
                  max="50"
                  value={passingCriteria}
                  onChange={(e) => setPassingCriteria(e.target.value)}
                  required
                />
              </div>

              {/* Malpractice Threshold Input (FR-2.3, FR-7.5) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--admin-label, #5B6B8A)' }}>
                  Max Malpractice Allowed:
                </label>
                <input
                  type="number"
                  className="form-control"
                  style={{
                    width: 75,
                    padding: '6px 10px',
                    fontSize: '0.85rem',
                    background: 'var(--filterbar-bg, #F4F6FF)',
                    border: '1px solid var(--admin-card-border, #E0E7FF)',
                    borderRadius: 8,
                    color: 'var(--color-text, #0F172A)',
                    fontWeight: 700,
                  }}
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
              style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                padding: '8px 18px',
                background: 'var(--filterbar-bg, #F4F6FF)',
                border: '1px solid var(--admin-card-border, #E0E7FF)',
                borderRadius: 8,
                color: 'var(--color-navy, #0F172A)',
                cursor: updatingThresholds ? 'not-allowed' : 'pointer',
              }}
            >
              {updatingThresholds ? 'Applying...' : 'Apply & Regenerate Shortlist'}
            </button>
          </form>
        </div>

        {/* ── Official Shortlist Unified Table (FEATURE-023) ── */}
        <div
          className="card"
          style={{
            padding: 0,
            background: 'var(--admin-card-bg, #FFFFFF)',
            border: '1px solid var(--admin-card-border, #E0E7FF)',
            borderRadius: 14,
            boxShadow: 'var(--admin-card-shadow)',
            overflow: 'hidden',
          }}
        >
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '20px 24px' }}>
            <div>
              <h3 className="card-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-navy, #0F172A)' }}>
                Official Shortlist ({totalShortlisted})
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--admin-label, #5B6B8A)', marginTop: 4, marginBottom: 0 }}>
                Generated on {shortlist?.generatedAt ? new Date(shortlist.generatedAt).toLocaleString() : '—'}
              </p>
            </div>

            <div style={{ position: 'relative', width: 260 }}>
              <SearchIcon
                size={14}
                color="var(--admin-indigo, #3E63DD)"
                strokeWidth={2}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                className="form-control"
                placeholder="Search candidate in shortlist..."
                style={{
                  width: '100%',
                  fontSize: '0.85rem',
                  padding: '8px 14px 8px 30px',
                  background: 'var(--filterbar-bg, #F4F6FF)',
                  border: '1px solid var(--admin-card-border, #E0E7FF)',
                  borderRadius: 8,
                  color: 'var(--color-text, #0F172A)',
                }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {shortlistCandidates.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--admin-label, #5B6B8A)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>📋</div>
              <h4 style={{ color: 'var(--color-navy, #0F172A)', marginBottom: 4, fontWeight: 800 }}>No candidates on the shortlist</h4>
              <p style={{ fontSize: '0.85rem' }}>
                {results.length === 0
                  ? 'Evaluations are still in progress or no submissions have been recorded.'
                  : 'Try lowering the Passing Criteria or adjusting the Malpractice Threshold.'}
              </p>
            </div>
          ) : (
            <div className="table-container" style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', marginBottom: 0 }}>
                <thead>
                  <tr style={{ background: 'var(--color-table-header-bg, #111827)', color: 'var(--color-table-header-text, #F9FAFB)' }}>
                    <th style={{ width: 80, background: 'inherit', color: 'inherit' }}>Rank</th>
                    <th style={{ background: 'inherit', color: 'inherit' }}>Candidate Name</th>
                    <th style={{ background: 'inherit', color: 'inherit' }}>Email</th>
                    <th style={{ background: 'inherit', color: 'inherit' }}>Total Score (0–10)</th>
                    <th style={{ background: 'inherit', color: 'inherit' }}>Questions Solved</th>
                    <th style={{ background: 'inherit', color: 'inherit' }}>Malpractice Count</th>
                    <th style={{ textAlign: 'center', background: 'inherit', color: 'inherit' }}>Status</th>
                    <th style={{ textAlign: 'right', background: 'inherit', color: 'inherit' }}>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {shortlistCandidates.map((c) => {
                    let rankBadge = `#${c.rank}`;
                    if (c.rank === 1) rankBadge = '🥇 #1';
                    if (c.rank === 2) rankBadge = '🥈 #2';
                    if (c.rank === 3) rankBadge = '🥉 #3';

                    return (
                      <tr key={c.candidateId || c.rank} style={{ borderBottom: '1px solid var(--admin-card-border, #E0E7FF)' }}>
                        <td>
                          <strong
                            style={{
                              color: c.rank <= 3 ? '#d97706' : 'var(--color-navy, #0F172A)',
                              fontSize: '0.9rem',
                            }}
                          >
                            {rankBadge}
                          </strong>
                        </td>
                        <td style={{ fontWeight: 700, color: 'var(--color-navy, #0F172A)' }}>{c.name}</td>
                        <td style={{ color: 'var(--admin-label, #5B6B8A)', fontSize: '0.85rem' }}>{c.email}</td>
                        <td>
                          <strong style={{ color: 'var(--admin-indigo, #3E63DD)', fontSize: '0.95rem', fontWeight: 800 }}>
                            {(c.score || 0).toFixed(2)}
                          </strong>
                        </td>
                        <td style={{ color: 'var(--color-text)', fontSize: '0.85rem' }}>
                          {c.questionsCompleted} Qs
                        </td>
                        <td>
                          {c.malpracticeCount > 0 ? (
                            (() => {
                              let severityClass = 'incident-badge-low';
                              let icon = '⚠️';
                              if (c.malpracticeCount >= 6) {
                                severityClass = 'incident-badge-high';
                                icon = '🚨';
                              } else if (c.malpracticeCount >= 3) {
                                severityClass = 'incident-badge-medium';
                                icon = '⚠️';
                              }
                              return (
                                <span className={`incident-badge ${severityClass}`} style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                                  <span>{icon}</span> {c.malpracticeCount}
                                </span>
                              );
                            })()
                          ) : (
                            <span style={{ color: '#059669', fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <span>✓</span> Clean (0)
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className="badge badge-success" style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: 4 }}>
                            Shortlisted
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            onClick={() => handleOpenCandidateDetail(c)}
                            className="btn btn-secondary"
                            style={{
                              padding: '5px 12px',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              background: 'var(--filterbar-bg, #F4F6FF)',
                              border: '1px solid var(--admin-card-border, #E0E7FF)',
                              borderRadius: 6,
                              color: 'var(--color-navy, #0F172A)',
                            }}
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
          <div
            className="modal-backdrop"
            onClick={() => setSelectedAuditSubmission(null)}
            style={{
              zIndex: 1200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              background: 'rgba(15, 23, 42, 0.65)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <div
              className="modal-container"
              style={{
                maxWidth: 550,
                width: '100%',
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
                <h3 className="modal-title" style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-navy, #0F172A)', margin: 0 }}>
                  Clipboard Audit: {selectedAuditSubmission.candidateName}
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedAuditSubmission(null)}
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
                >
                  ✕
                </button>
              </div>

              <div className="modal-body" style={{ maxHeight: 350, overflowY: 'auto', padding: 20 }}>
                {loadingAudit ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                    <LoadingDots size="md" />
                  </div>
                ) : auditEvents.length === 0 ? (
                  <p style={{ color: 'var(--admin-label, #5B6B8A)', textAlign: 'center', padding: 24, margin: 0 }}>
                    No prohibited copy-paste events recorded for this candidate.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {auditEvents.map((evt, idx) => (
                      <div key={idx} style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 8, padding: 12, fontSize: '0.82rem' }}>
                        <div style={{ fontWeight: 700, color: '#b91c1c' }}>{evt.eventType || 'PASTE_ATTEMPT'}</div>
                        <div style={{ color: 'var(--admin-label, #5B6B8A)', fontSize: '0.75rem', marginTop: 2 }}>
                          {new Date(evt.timestamp).toLocaleString()}
                        </div>
                      </div>
                    ))}
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
                  onClick={() => setSelectedAuditSubmission(null)}
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
      </main>
    </div>
  );
}
