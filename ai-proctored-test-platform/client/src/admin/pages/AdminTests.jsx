// AdminTests.jsx — Test Management Page
// Implements PRD Section 9.2, Section 11.2 (FR-2.1, FR-2.2, FR-2.3), Section 12.1
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminNavbar from '../../shared/AdminNavbar';
import TestStatusBadge from '../../shared/TestStatusBadge';
import CreateTestModal from '../../shared/CreateTestModal';
import api from '../../services/apiClient';

const TEST_TYPES = [
  { value: 'SPOJ', label: 'SPOJ (DSA / Competitive Coding)' },
  { value: 'JAVASCRIPT', label: 'JavaScript' },
  { value: 'REACT', label: 'React.js' },
  { value: 'AI_TEST', label: 'AI Test (Kimi Assisted)' },
];

export default function AdminTests() {
  const navigate = useNavigate();
  const [tests, setTests] = useState([]);
  const [questionSets, setQuestionSets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [filterType, setFilterType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Create Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Delete Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchTests = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getTests();
      setTests(res.data.tests || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to fetch tests');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchQuestionSets = useCallback(async () => {
    try {
      const res = await api.getQuestionSets();
      setQuestionSets(res.data.questionSets || []);
    } catch (err) {
      console.error('Failed to fetch question sets:', err);
    }
  }, []);

  useEffect(() => {
    fetchTests();
    fetchQuestionSets();
  }, [fetchTests, fetchQuestionSets]);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await api.deleteTest(deleteTarget._id);
      toast.success(`Deleted test "${deleteTarget.title}"`);
      setDeleteTarget(null);
      fetchTests();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete test');
    } finally {
      setDeleting(false);
    }
  };

  // Filtered list
  const filteredTests = tests.filter((t) => {
    const matchesType = filterType === 'ALL' || t.testType === filterType;
    const matchesStatus = filterStatus === 'ALL' || t.status === filterStatus;
    const matchesSearch =
      !searchQuery.trim() ||
      t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.questionSetId?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesStatus && matchesSearch;
  });

  return (
    <div className="app-layout">
      <AdminNavbar />
      <main className="main-content">
        {/* Page Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: '1.8rem', color: '#1A2B3C', fontWeight: 800 }}>Test Management</h1>
            <p style={{ color: '#6b7280', fontSize: '0.9rem', marginTop: 4 }}>
              Create, configure, and manage proctored coding assessments and rooms.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</span> Create New Test
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="card" style={{ padding: '16px 20px', marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, alignItems: 'center' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: 6 }}>Search Tests</label>
              <input
                type="text"
                className="form-control"
                placeholder="Search by test title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: 6 }}>Filter by Type</label>
              <select
                className="form-select"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="ALL">All Test Types</option>
                {TEST_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.8rem', marginBottom: 6 }}>Filter by Status</label>
              <select
                className="form-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="DRAFT">DRAFT</option>
                <option value="LIVE">LIVE (Active)</option>
                <option value="ENDED">ENDED (Completed)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tests Table */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 250 }}>
            <div className="spinner spinner-dark" style={{ width: 36, height: 36, borderWidth: 3 }} />
          </div>
        ) : filteredTests.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📋</div>
            <h3 style={{ color: '#1A2B3C', marginBottom: 8 }}>No tests found</h3>
            <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: 20 }}>
              {searchQuery || filterType !== 'ALL' || filterStatus !== 'ALL'
                ? 'Try adjusting your search or filters'
                : 'Get started by creating your first proctored test'}
            </p>
            <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
              + Create New Test
            </button>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Test Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Passing Criteria</th>
                  <th>Question Set</th>
                  <th>Created</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTests.map((test) => {
                  let typeBadgeColor = '#0E7C86';
                  if (test.testType === 'AI_TEST') typeBadgeColor = '#8e44ad';
                  if (test.testType === 'REACT') typeBadgeColor = '#2980b9';
                  if (test.testType === 'JAVASCRIPT') typeBadgeColor = '#d35400';

                  return (
                    <tr key={test._id}>
                      <td style={{ fontWeight: 600 }}>
                        <Link
                          to={`/admin/tests/${test._id}`}
                          style={{ color: '#1A2B3C', textDecoration: 'none' }}
                          className="hover-underline"
                        >
                          {test.title}
                        </Link>
                      </td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: `${typeBadgeColor}15`,
                            color: typeBadgeColor,
                            border: `1px solid ${typeBadgeColor}40`,
                            fontSize: '0.75rem',
                          }}
                        >
                          {test.testType}
                        </span>
                      </td>
                      <td>
                        <TestStatusBadge
                          status={test.status}
                          style={{ fontSize: '0.75rem' }}
                        />
                      </td>
                      <td style={{ color: '#4b5563', fontSize: '0.85rem' }}>
                        {test.durationMinutes} mins
                      </td>
                      <td style={{ color: '#4b5563', fontSize: '0.85rem' }}>
                        ≥ {test.passingCriteria} Qs
                      </td>
                      <td style={{ color: '#4b5563', fontSize: '0.85rem' }}>
                        {test.questionSetId?.name || '—'}
                      </td>
                      <td style={{ color: '#9ca3af', fontSize: '0.8rem' }}>
                        {new Date(test.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                          <Link
                            to={`/admin/tests/${test._id}`}
                            className="btn btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                          >
                            Manage &amp; Rooms
                          </Link>
                          {test.status === 'LIVE' && (
                            <Link
                              to={`/admin/tests/${test._id}/live`}
                              className="btn btn-primary"
                              style={{ padding: '6px 12px', fontSize: '0.78rem', background: '#2ECC71' }}
                            >
                              Live Monitor
                            </Link>
                          )}
                          {test.status === 'ENDED' && (
                            <>
                              <Link
                                to={`/admin/tests/${test._id}/live`}
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                                title="View frozen post-test operational summary"
                              >
                                Test Summary
                              </Link>
                              <Link
                                to={`/admin/tests/${test._id}/results`}
                                className="btn btn-primary"
                                style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                              >
                                Results
                              </Link>
                            </>
                          )}
                          {test.status === 'DRAFT' && (
                            <button
                              onClick={() => setDeleteTarget(test)}
                              className="btn btn-danger"
                              style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                              title="Delete Test"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Standalone Create Test Modal (FR-2.1, Section 12.1) ── */}
        <CreateTestModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={(createdTest) => {
            setShowCreateModal(false);
            fetchTests();
            if (createdTest?._id) {
              navigate(`/admin/tests/${createdTest._id}`);
            }
          }}
          questionSets={questionSets}
        />

        {/* ── Delete Confirmation Modal ── */}
        {deleteTarget && (
          <div className="modal-backdrop" onClick={() => !deleting && setDeleteTarget(null)}>
            <div className="modal-container" style={{ maxWidth: 450 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title" style={{ color: '#E74C3C' }}>Delete Test</h3>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <p style={{ color: '#374151', fontSize: '0.9rem' }}>
                  Are you sure you want to delete test <strong>"{deleteTarget.title}"</strong>? This action cannot be undone.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="btn btn-secondary"
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  className="btn btn-danger"
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
