// AdminTests.jsx — Test Management Page
// Implements PRD Section 9.2, Section 11.2 (FR-2.1, FR-2.2, FR-2.3), Section 12.1
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminNavbar from '../../shared/AdminNavbar';
import TestStatusBadge from '../../shared/TestStatusBadge';
import api from '../../services/apiClient';

const TEST_TYPES = [
  { value: 'SPOJ', label: 'SPOJ (DSA / Competitive Coding)' },
  { value: 'JAVASCRIPT', label: 'JavaScript' },
  { value: 'REACT', label: 'React.js' },
  { value: 'AI_TEST', label: 'AI Test (Kimi Assisted)' },
];

const PROGRAMMING_LANGUAGES = ['python', 'java', 'cpp', 'c', 'javascript', 'react'];

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
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    testType: 'SPOJ',
    questionSetId: '',
    durationMinutes: 90,
    totalQuestions: 0,
    passingCriteria: 0,
    startTestWindowMinutes: 10,
    supportedLanguages: ['python', 'java', 'cpp', 'javascript'],
    instructions: '1. Maintain full-screen mode throughout the test.\n2. Do not switch tabs or use secondary monitors.\n3. Keep your webcam on and ensure your face is clearly visible.\n4. Mobile phones and electronic gadgets are strictly prohibited.',
  });

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

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? (value === '' ? '' : Number(value)) : value,
    }));
  };

  const handleLanguageToggle = (lang) => {
    setFormData((prev) => {
      const exists = prev.supportedLanguages.includes(lang);
      const updated = exists
        ? prev.supportedLanguages.filter((l) => l !== lang)
        : [...prev.supportedLanguages, lang];
      return { ...prev, supportedLanguages: updated };
    });
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      return toast.error('Test title is required');
    }
    if (!formData.questionSetId) {
      return toast.error('Please select a Question Set');
    }
    const selectedQs = questionSets.find((qs) => qs._id === formData.questionSetId);
    const qCount = selectedQs ? (selectedQs.questionCount ?? selectedQs.questionIds?.length ?? 0) : formData.totalQuestions;
    if (qCount <= 0) {
      return toast.error('Selected Question Set contains 0 questions. Please add questions before creating a test.');
    }
    if (!formData.durationMinutes || formData.durationMinutes <= 0) {
      return toast.error('Duration must be greater than 0');
    }
    if (formData.passingCriteria < 0) {
      return toast.error('Passing criteria cannot be negative');
    }
    if (formData.passingCriteria > qCount) {
      return toast.error(`Passing criteria (${formData.passingCriteria}) cannot exceed Total Questions (${qCount})`);
    }

    try {
      setCreating(true);
      const res = await api.createTest(formData);
      toast.success('Test created successfully (Status: DRAFT)');
      setShowCreateModal(false);
      // Reset form
      setFormData({
        title: '',
        testType: 'SPOJ',
        questionSetId: '',
        durationMinutes: 90,
        totalQuestions: 0,
        passingCriteria: 0,
        startTestWindowMinutes: 10,
        supportedLanguages: ['python', 'java', 'cpp', 'javascript'],
        instructions: '1. Maintain full-screen mode throughout the test.\n2. Do not switch tabs or use secondary monitors.\n3. Keep your webcam on and ensure your face is clearly visible.\n4. Mobile phones and electronic gadgets are strictly prohibited.',
      });
      fetchTests();
      if (res.data.test?._id) {
        navigate(`/admin/tests/${res.data.test._id}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create test');
    } finally {
      setCreating(false);
    }
  };

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

  // Filter question sets by selected test type in modal
  const filteredQuestionSets = questionSets.filter(
    (qs) => !formData.testType || qs.testType === formData.testType
  );

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
                            <Link
                              to={`/admin/tests/${test._id}/results`}
                              className="btn btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                            >
                              Results
                            </Link>
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

        {/* ── Create Test Modal (FR-2.1, Section 12.1) ── */}
        {showCreateModal && (
          <div className="modal-backdrop" onClick={() => !creating && setShowCreateModal(false)}>
            <div className="modal-container" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Create New Test</h3>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#6b7280' }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateSubmit}>
                <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Test Title *</label>
                    <input
                      type="text"
                      name="title"
                      className="form-control"
                      placeholder="e.g. SDE-1 Hiring Drive Round 1"
                      value={formData.title}
                      onChange={handleInputChange}
                      required
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="form-group">
                      <label className="form-label">Test Type *</label>
                      <select
                        name="testType"
                        className="form-select"
                        value={formData.testType}
                        onChange={(e) => {
                          const newType = e.target.value;
                          setFormData((prev) => ({
                            ...prev,
                            testType: newType,
                            questionSetId: '',
                            totalQuestions: 0,
                            passingCriteria: 0,
                          }));
                        }}
                        required
                      >
                        {TEST_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Question Set *</label>
                      <select
                        name="questionSetId"
                        className="form-select"
                        value={formData.questionSetId}
                        onChange={(e) => {
                          const newSetId = e.target.value;
                          const selectedQs = questionSets.find((qs) => qs._id === newSetId);
                          const qCount = selectedQs ? (selectedQs.questionCount ?? selectedQs.questionIds?.length ?? 0) : 0;
                          setFormData((prev) => ({
                            ...prev,
                            questionSetId: newSetId,
                            totalQuestions: qCount,
                            passingCriteria: prev.passingCriteria > qCount ? qCount : prev.passingCriteria,
                          }));
                        }}
                        required
                      >
                        <option value="">Select a Question Set...</option>
                        {filteredQuestionSets.map((qs) => {
                          const qCount = qs.questionCount ?? qs.questionIds?.length ?? 0;
                          return (
                            <option key={qs._id} value={qs._id}>
                              {qs.name} ({qs.testType}) — {qCount} Qs
                            </option>
                          );
                        })}
                      </select>
                      {filteredQuestionSets.length === 0 ? (
                        <p style={{ fontSize: '0.75rem', color: '#E74C3C', marginTop: 4 }}>
                          No question sets found for {formData.testType}. Create one in Question Bank first.
                        </p>
                      ) : formData.questionSetId && formData.totalQuestions === 0 ? (
                        <p style={{ fontSize: '0.75rem', color: '#E74C3C', marginTop: 4 }}>
                          Warning: This Question Set contains 0 questions. Add questions in Question Bank before creating a test.
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    <div className="form-group">
                      <label className="form-label">Duration (Minutes) *</label>
                      <input
                        type="number"
                        name="durationMinutes"
                        className="form-control"
                        min="5"
                        max="360"
                        value={formData.durationMinutes}
                        onChange={handleInputChange}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <label className="form-label" style={{ marginBottom: 0 }}>Total Questions</label>
                        <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>
                          (Auto-derived)
                        </span>
                      </div>
                      <input
                        type="number"
                        name="totalQuestions"
                        className="form-control"
                        value={formData.totalQuestions}
                        disabled
                        readOnly
                        style={{
                          backgroundColor: '#f3f4f6',
                          cursor: 'not-allowed',
                          color: '#374151',
                          fontWeight: 600,
                        }}
                      />
                      <small style={{ color: '#6b7280', fontSize: '0.72rem', display: 'block', marginTop: 2 }}>
                        Locked to Question Set's count ({formData.totalQuestions} Qs).
                      </small>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Passing Criteria (Min Qs) *</label>
                      <input
                        type="number"
                        name="passingCriteria"
                        className="form-control"
                        min="0"
                        max={formData.totalQuestions || 50}
                        value={formData.passingCriteria}
                        onChange={handleInputChange}
                        required
                      />
                      {formData.passingCriteria > formData.totalQuestions && formData.totalQuestions > 0 && (
                        <small style={{ color: '#E74C3C', fontSize: '0.75rem', display: 'block', marginTop: 2 }}>
                          Cannot exceed Total Questions ({formData.totalQuestions}).
                        </small>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Join Window / Password Validity (Minutes)</label>
                    <input
                      type="number"
                      name="startTestWindowMinutes"
                      className="form-control"
                      min="1"
                      max="120"
                      value={formData.startTestWindowMinutes}
                      onChange={handleInputChange}
                    />
                    <small style={{ color: '#6b7280', fontSize: '0.75rem' }}>
                      Room passwords expire after this window from room creation (FR-3.3).
                    </small>
                  </div>

                  {formData.testType === 'SPOJ' && (
                    <div className="form-group">
                      <label className="form-label">Supported Languages</label>
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
                        {PROGRAMMING_LANGUAGES.map((lang) => (
                          <label
                            key={lang}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                              padding: '6px 12px',
                              borderRadius: 6,
                              border: formData.supportedLanguages.includes(lang)
                                ? '1.5px solid #0E7C86'
                                : '1.5px solid #e5e7eb',
                              background: formData.supportedLanguages.includes(lang)
                                ? 'rgba(14, 124, 134, 0.08)'
                                : 'white',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={formData.supportedLanguages.includes(lang)}
                              onChange={() => handleLanguageToggle(lang)}
                            />
                            {lang.toUpperCase()}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">Candidate Instructions *</label>
                    <textarea
                      name="instructions"
                      className="form-control"
                      rows={4}
                      value={formData.instructions}
                      onChange={handleInputChange}
                      required
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn btn-secondary"
                    disabled={creating}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={creating}
                  >
                    {creating ? 'Creating...' : 'Create Test (Draft)'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

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
