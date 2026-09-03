// AdminQuestionBank.jsx — Question Bank & Question Set Management
// Implements PRD Section 8.2 (aiTestBriefFiles), Section 9.4, Section 11.4 (FR-4.1, FR-4.2)
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import AdminNavbar from '../../shared/AdminNavbar';
import api from '../../services/apiClient';

const TEST_TYPES = [
  { value: 'SPOJ', label: 'SPOJ (DSA / Competitive)' },
  { value: 'JAVASCRIPT', label: 'JavaScript' },
  { value: 'REACT', label: 'React.js' },
  { value: 'AI_TEST', label: 'AI Test (Kimi Assisted)' },
];

export default function AdminQuestionBank() {
  const [questionSets, setQuestionSets] = useState([]);
  const [selectedSet, setSelectedSet] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loadingSets, setLoadingSets] = useState(true);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // Filter question sets by type
  const [filterType, setFilterType] = useState('ALL');

  // New Question Set Modal State
  const [showNewSetModal, setShowNewSetModal] = useState(false);
  const [creatingSet, setCreatingSet] = useState(false);
  const [newSetData, setNewSetData] = useState({
    name: '',
    testType: 'SPOJ',
  });

  // Edit Question Set Modal State (BUG-XX)
  const [showEditSetModal, setShowEditSetModal] = useState(false);
  const [editingSet, setEditingSet] = useState(false);
  const [editSetData, setEditSetData] = useState({
    name: '',
    testType: 'SPOJ',
  });

  // Question Modal State (Create / Edit)
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [questionForm, setQuestionForm] = useState({
    title: '',
    description: '',
    difficulty: 'MEDIUM',
    inputFormat: '',
    outputFormat: '',
    constraints: '',
    visibleTestCases: [{ input: '', expectedOutput: '' }],
    hiddenTestCases: [{ input: '', expectedOutput: '' }],
    aiTestBriefFiles: [{ fileName: 'index.html' }, { fileName: 'style.css' }, { fileName: 'app.js' }],
  });

  // Expanded Question Details
  const [expandedQuestionId, setExpandedQuestionId] = useState(null);

  // Delete Question Target
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Fetch all Question Sets
  const fetchQuestionSets = useCallback(async () => {
    try {
      setLoadingSets(true);
      const res = await api.getQuestionSets();
      const sets = res.data.questionSets || [];
      setQuestionSets(sets);
      if (sets.length > 0 && !selectedSet) {
        setSelectedSet(sets[0]);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to fetch question sets');
    } finally {
      setLoadingSets(false);
    }
  }, [selectedSet]);

  useEffect(() => {
    fetchQuestionSets();
  }, [fetchQuestionSets]);

  // Fetch Questions for the Selected Set
  const fetchQuestions = useCallback(async (setId) => {
    if (!setId) return;
    try {
      setLoadingQuestions(true);
      const res = await api.getQuestions(setId);
      setQuestions(res.data.questions || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to fetch questions');
    } finally {
      setLoadingQuestions(false);
    }
  }, []);

  useEffect(() => {
    if (selectedSet?._id) {
      fetchQuestions(selectedSet._id);
    } else {
      setQuestions([]);
    }
  }, [selectedSet, fetchQuestions]);

  // Handle Create Question Set
  const handleCreateSetSubmit = async (e) => {
    e.preventDefault();
    if (!newSetData.name.trim()) {
      return toast.error('Question Set name is required');
    }
    try {
      setCreatingSet(true);
      const res = await api.createQuestionSet({
        name: newSetData.name.trim(),
        testType: newSetData.testType,
      });
      toast.success(`Created Question Set "${res.data.questionSet?.name}"`);
      setShowNewSetModal(false);
      setNewSetData({ name: '', testType: 'SPOJ' });
      const updatedSetsRes = await api.getQuestionSets();
      const sets = updatedSetsRes.data.questionSets || [];
      setQuestionSets(sets);
      const created = sets.find((s) => s._id === res.data.questionSet?._id) || sets[0];
      setSelectedSet(created);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create question set');
    } finally {
      setCreatingSet(false);
    }
  };

  // Open Edit Question Set Modal (BUG-XX)
  const handleOpenEditSet = () => {
    if (!selectedSet) return;
    setEditSetData({
      name: selectedSet.name || '',
      testType: selectedSet.testType || 'SPOJ',
    });
    setShowEditSetModal(true);
  };

  // Handle Edit Question Set Submit (BUG-XX)
  const handleEditSetSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSet?._id) return;
    const trimmedName = editSetData.name.trim();
    if (!trimmedName) {
      return toast.error('Question Set name is required');
    }

    try {
      setEditingSet(true);
      const res = await api.updateQuestionSet(selectedSet._id, {
        name: trimmedName,
        testType: editSetData.testType,
      });

      const updatedSet = res.data.questionSet;
      toast.success(`Updated Question Set "${updatedSet.name}"`);
      setShowEditSetModal(false);

      // Update state in place immediately
      setSelectedSet(updatedSet);
      setQuestionSets((prev) =>
        prev.map((s) => (s._id === updatedSet._id ? updatedSet : s))
      );
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update question set');
    } finally {
      setEditingSet(false);
    }
  };

  // Open Create Question Modal
  const handleOpenCreateQuestion = () => {
    if (!selectedSet) {
      return toast.error('Please select or create a Question Set first');
    }
    setEditingQuestionId(null);
    setQuestionForm({
      title: '',
      description: '',
      difficulty: 'MEDIUM',
      inputFormat: '',
      outputFormat: '',
      constraints: '',
      visibleTestCases: [{ input: '', expectedOutput: '' }],
      hiddenTestCases: [{ input: '', expectedOutput: '' }],
      aiTestBriefFiles: selectedSet.testType === 'AI_TEST'
        ? [{ fileName: 'index.html' }, { fileName: 'style.css' }, { fileName: 'app.js' }]
        : [],
    });
    setShowQuestionModal(true);
  };

  // Open Edit Question Modal
  const handleOpenEditQuestion = (q) => {
    setEditingQuestionId(q._id);
    setQuestionForm({
      title: q.title || '',
      description: q.description || '',
      difficulty: q.difficulty || 'MEDIUM',
      inputFormat: q.inputFormat || '',
      outputFormat: q.outputFormat || '',
      constraints: q.constraints || '',
      visibleTestCases: q.visibleTestCases?.length > 0 ? q.visibleTestCases : [{ input: '', expectedOutput: '' }],
      hiddenTestCases: q.hiddenTestCases?.length > 0 ? q.hiddenTestCases : [{ input: '', expectedOutput: '' }],
      aiTestBriefFiles: q.aiTestBriefFiles?.length > 0 ? q.aiTestBriefFiles : [],
    });
    setShowQuestionModal(true);
  };

  // Dynamic Test Case Handlers
  const handleTestCaseChange = (type, index, field, value) => {
    setQuestionForm((prev) => {
      const list = [...prev[type]];
      list[index] = { ...list[index], [field]: value };
      return { ...prev, [type]: list };
    });
  };

  const handleAddTestCase = (type) => {
    setQuestionForm((prev) => ({
      ...prev,
      [type]: [...prev[type], { input: '', expectedOutput: '' }],
    }));
  };

  const handleRemoveTestCase = (type, index) => {
    setQuestionForm((prev) => {
      const list = prev[type].filter((_, i) => i !== index);
      return { ...prev, [type]: list.length > 0 ? list : [{ input: '', expectedOutput: '' }] };
    });
  };

  // AI Test Brief Files Handlers
  const handleAddBriefFile = () => {
    setQuestionForm((prev) => ({
      ...prev,
      aiTestBriefFiles: [...prev.aiTestBriefFiles, { fileName: '' }],
    }));
  };

  const handleBriefFileChange = (index, value) => {
    setQuestionForm((prev) => {
      const files = [...prev.aiTestBriefFiles];
      files[index] = { fileName: value };
      return { ...prev, aiTestBriefFiles: files };
    });
  };

  const handleRemoveBriefFile = (index) => {
    setQuestionForm((prev) => ({
      ...prev,
      aiTestBriefFiles: prev.aiTestBriefFiles.filter((_, i) => i !== index),
    }));
  };

  // Submit Question (Create or Edit)
  const handleQuestionSubmit = async (e) => {
    e.preventDefault();

    if (!questionForm.title.trim() || !questionForm.description.trim()) {
      return toast.error('Title and description are required');
    }

    // FR-4.1: Must have at least 1 visible AND 1 hidden test case
    const validVisible = questionForm.visibleTestCases.filter((tc) => tc.input.trim() || tc.expectedOutput.trim());
    const validHidden = questionForm.hiddenTestCases.filter((tc) => tc.input.trim() || tc.expectedOutput.trim());

    if (validVisible.length === 0) {
      return toast.error('At least 1 visible test case is required (FR-4.1)');
    }
    if (validHidden.length === 0) {
      return toast.error('At least 1 hidden test case is required (FR-4.1)');
    }

    const payload = {
      ...questionForm,
      visibleTestCases: validVisible,
      hiddenTestCases: validHidden,
      aiTestBriefFiles: selectedSet.testType === 'AI_TEST' ? questionForm.aiTestBriefFiles.filter((f) => f.fileName.trim()) : undefined,
    };

    try {
      setSavingQuestion(true);
      if (editingQuestionId) {
        await api.updateQuestion(editingQuestionId, payload);
        toast.success('Question updated successfully');
      } else {
        await api.createQuestion(selectedSet._id, payload);
        toast.success('Question added to question set (FR-4.1 verified)');
      }
      setShowQuestionModal(false);
      fetchQuestions(selectedSet._id);
      fetchQuestionSets(); // refresh question count in sets
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save question');
    } finally {
      setSavingQuestion(false);
    }
  };

  // Delete Question
  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await api.deleteQuestion(deleteTarget._id);
      toast.success(`Deleted question "${deleteTarget.title}"`);
      setDeleteTarget(null);
      fetchQuestions(selectedSet._id);
      fetchQuestionSets();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete question');
    } finally {
      setDeleting(false);
    }
  };

  const filteredSets = questionSets.filter(
    (s) => filterType === 'ALL' || s.testType === filterType
  );

  return (
    <div className="app-layout">
      <AdminNavbar />
      <main className="main-content">
        {/* Page Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: '1.8rem', color: '#1A2B3C', fontWeight: 800 }}>Question Bank</h1>
            <p style={{ color: '#6b7280', fontSize: '0.9rem', marginTop: 4 }}>
              Manage reusable Question Sets, problem statements, and visible/hidden test cases (PRD §9.4, §11.4).
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => setShowNewSetModal(true)}
              className="btn btn-secondary"
            >
              + New Question Set
            </button>
            <button
              onClick={handleOpenCreateQuestion}
              className="btn btn-primary"
              disabled={!selectedSet}
            >
              + Add Question
            </button>
          </div>
        </div>

        {/* 2-Column Split: Question Sets (Sidebar) and Questions Roster */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, alignItems: 'start' }}>
          
          {/* ── Left Column: Question Sets ── */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: '1rem', color: '#1A2B3C', fontWeight: 700 }}>Question Sets</h3>
              <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                {questionSets.length} Sets
              </span>
            </div>

            {/* Filter Sets by Type */}
            <div style={{ marginBottom: 12 }}>
              <select
                className="form-select"
                style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="ALL">All Types</option>
                {TEST_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {loadingSets ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                <div className="spinner spinner-dark" style={{ width: 28, height: 28 }} />
              </div>
            ) : filteredSets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 12px', color: '#6b7280', fontSize: '0.85rem' }}>
                No question sets found.
                <button
                  onClick={() => setShowNewSetModal(true)}
                  className="btn btn-primary"
                  style={{ marginTop: 12, width: '100%', fontSize: '0.8rem' }}
                >
                  + Create First Set
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                {filteredSets.map((qs) => {
                  const isSelected = selectedSet?._id === qs._id;
                  const qCount = qs.questionIds?.length || 0;

                  return (
                    <button
                      key={qs._id}
                      onClick={() => setSelectedSet(qs)}
                      style={{
                        textAlign: 'left',
                        padding: '12px 14px',
                        borderRadius: 8,
                        border: isSelected ? '1.5px solid #0E7C86' : '1px solid #e5e7eb',
                        background: isSelected ? 'rgba(14, 124, 134, 0.08)' : 'white',
                        cursor: 'pointer',
                        transition: 'all 150ms',
                        fontFamily: 'inherit',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <strong style={{ fontSize: '0.875rem', color: isSelected ? '#0E7C86' : '#1A2B3C' }}>
                          {qs.name}
                        </strong>
                        <span className="badge badge-secondary" style={{ fontSize: '0.65rem' }}>
                          {qCount} Qs
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#6b7280' }}>
                        <span>{qs.testType}</span>
                        <span>{new Date(qs.createdAt).toLocaleDateString()}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Right Column: Questions in Selected Set ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {selectedSet ? (
              <>
                {/* Selected Set Header Card */}
                <div className="card" style={{ padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <h2 style={{ fontSize: '1.3rem', color: '#1A2B3C', margin: 0 }}>{selectedSet.name}</h2>
                      <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                        {selectedSet.testType}
                      </span>
                      <button
                        type="button"
                        id="edit-question-set-btn"
                        onClick={handleOpenEditSet}
                        className="btn btn-secondary btn-sm"
                        style={{
                          fontSize: '0.75rem',
                          padding: '3px 10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          cursor: 'pointer',
                        }}
                        title="Edit Question Set Name and Type"
                      >
                        ✏ Edit Set
                      </button>
                    </div>
                    <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: 4 }}>
                      Contains {questions.length} question(s) · Created by {selectedSet.createdBy?.name || 'Admin'}
                    </p>
                  </div>
                  <button
                    onClick={handleOpenCreateQuestion}
                    className="btn btn-primary"
                    style={{ fontSize: '0.85rem' }}
                  >
                    + Add Question to Set
                  </button>
                </div>

                {/* Questions List */}
                {loadingQuestions ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                    <div className="spinner spinner-dark" style={{ width: 36, height: 36 }} />
                  </div>
                ) : questions.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>💡</div>
                    <h3 style={{ color: '#1A2B3C', marginBottom: 6 }}>No questions in this set yet</h3>
                    <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: 20 }}>
                      Every question must have at least 1 visible and 1 hidden test case before being added (FR-4.1).
                    </p>
                    <button onClick={handleOpenCreateQuestion} className="btn btn-primary">
                      + Add First Question
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {questions.map((q, idx) => {
                      const isExpanded = expandedQuestionId === q._id;
                      let diffBadge = 'badge-secondary';
                      if (q.difficulty === 'HARD') diffBadge = 'badge-danger';
                      if (q.difficulty === 'MEDIUM') diffBadge = 'badge-warning';
                      if (q.difficulty === 'EASY') diffBadge = 'badge-success';

                      return (
                        <div
                          key={q._id}
                          className="card"
                          style={{
                            padding: 20,
                            borderLeft: isExpanded ? '4px solid #0E7C86' : '1px solid #e5e7eb',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 260 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                                <span style={{ fontWeight: 700, color: '#0E7C86', fontSize: '0.9rem' }}>
                                  Q{idx + 1}.
                                </span>
                                <h4 style={{ fontSize: '1.05rem', color: '#1A2B3C', margin: 0 }}>
                                  {q.title}
                                </h4>
                                {q.difficulty && (
                                  <span className={`badge ${diffBadge}`} style={{ fontSize: '0.65rem' }}>
                                    {q.difficulty}
                                  </span>
                                )}
                              </div>
                              <p
                                style={{
                                  color: '#4b5563',
                                  fontSize: '0.85rem',
                                  lineHeight: 1.5,
                                  display: isExpanded ? 'block' : '-webkit-box',
                                  WebkitLineClamp: isExpanded ? 'none' : 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: isExpanded ? 'visible' : 'hidden',
                                  whiteSpace: isExpanded ? 'pre-line' : 'normal',
                                }}
                              >
                                {q.description}
                              </p>
                            </div>

                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <button
                                onClick={() => setExpandedQuestionId(isExpanded ? null : q._id)}
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                              >
                                {isExpanded ? 'Collapse Details' : 'View Details'}
                              </button>
                              <button
                                onClick={() => handleOpenEditQuestion(q)}
                                className="btn btn-secondary"
                                style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setDeleteTarget(q)}
                                className="btn btn-danger"
                                style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                                title="Delete Question"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>

                          {/* Test Cases Count summary */}
                          <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6', fontSize: '0.78rem', color: '#6b7280' }}>
                            <span>
                              👁️ Visible Cases: <strong>{q.visibleTestCases?.length || 0}</strong>
                            </span>
                            <span>
                              🔒 Hidden Cases: <strong>{q.hiddenTestCases?.length || 0}</strong> (FR-4.1)
                            </span>
                            {q.constraints && (
                              <span>
                                📏 Constraints: <code>{q.constraints}</code>
                              </span>
                            )}
                          </div>

                          {/* Expanded Full Details */}
                          {isExpanded && (
                            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: 16 }}>
                              {q.inputFormat && (
                                <div>
                                  <strong style={{ fontSize: '0.8rem', color: '#1A2B3C' }}>Input Format:</strong>
                                  <div style={{ background: '#f9fafb', padding: 10, borderRadius: 6, fontSize: '0.8rem', marginTop: 4, color: '#374151' }}>
                                    {q.inputFormat}
                                  </div>
                                </div>
                              )}
                              {q.outputFormat && (
                                <div>
                                  <strong style={{ fontSize: '0.8rem', color: '#1A2B3C' }}>Output Format:</strong>
                                  <div style={{ background: '#f9fafb', padding: 10, borderRadius: 6, fontSize: '0.8rem', marginTop: 4, color: '#374151' }}>
                                    {q.outputFormat}
                                  </div>
                                </div>
                              )}

                              {/* Visible Test Cases */}
                              <div>
                                <strong style={{ fontSize: '0.8rem', color: '#1A2B3C' }}>
                                  👁️ Visible Test Cases (Shown to Candidate):
                                </strong>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 6 }}>
                                  {q.visibleTestCases?.map((tc, tcIdx) => (
                                    <div key={tcIdx} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: 10, fontSize: '0.78rem' }}>
                                      <div style={{ fontWeight: 600, color: '#0E7C86', marginBottom: 4 }}>Case #{tcIdx + 1}</div>
                                      <div style={{ marginBottom: 4 }}>
                                        <span style={{ color: '#6b7280' }}>Input: </span>
                                        <code>{tc.input || '(empty)'}</code>
                                      </div>
                                      <div>
                                        <span style={{ color: '#6b7280' }}>Output: </span>
                                        <code>{tc.expectedOutput || '(empty)'}</code>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Hidden Test Cases (FR-4.2) */}
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <strong style={{ fontSize: '0.8rem', color: '#1A2B3C' }}>
                                    🔒 Hidden Test Cases (Scoring Only - FR-4.2):
                                  </strong>
                                  <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>
                                    Admin Only
                                  </span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 6 }}>
                                  {q.hiddenTestCases?.map((tc, tcIdx) => (
                                    <div key={tcIdx} style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 6, padding: 10, fontSize: '0.78rem' }}>
                                      <div style={{ fontWeight: 600, color: '#d97706', marginBottom: 4 }}>Hidden #{tcIdx + 1}</div>
                                      <div style={{ marginBottom: 4 }}>
                                        <span style={{ color: '#6b7280' }}>Input: </span>
                                        <code>{tc.input || '(empty)'}</code>
                                      </div>
                                      <div>
                                        <span style={{ color: '#6b7280' }}>Output: </span>
                                        <code>{tc.expectedOutput || '(empty)'}</code>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* AI Test Brief Files */}
                              {q.aiTestBriefFiles?.length > 0 && (
                                <div>
                                  <strong style={{ fontSize: '0.8rem', color: '#1A2B3C' }}>AI Test Starter Files:</strong>
                                  <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                                    {q.aiTestBriefFiles.map((f, fIdx) => (
                                      <span key={fIdx} className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>
                                        📄 {f.fileName}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="card" style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📁</div>
                <h3 style={{ color: '#1A2B3C', marginBottom: 6 }}>No Question Set Selected</h3>
                <p style={{ fontSize: '0.85rem' }}>
                  Please select a question set from the left panel or create a new set.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Create Question Set Modal ── */}
        {showNewSetModal && (
          <div className="modal-backdrop" onClick={() => !creatingSet && setShowNewSetModal(false)}>
            <div className="modal-container" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Create Question Set</h3>
                <button
                  type="button"
                  onClick={() => setShowNewSetModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleCreateSetSubmit}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Question Set Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. SDE-1 Core DSA Problem Set"
                      value={newSetData.name}
                      onChange={(e) => setNewSetData((p) => ({ ...p, name: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Test Type *</label>
                    <select
                      className="form-select"
                      value={newSetData.testType}
                      onChange={(e) => setNewSetData((p) => ({ ...p, testType: e.target.value }))}
                      required
                    >
                      {TEST_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    onClick={() => setShowNewSetModal(false)}
                    className="btn btn-secondary"
                    disabled={creatingSet}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={creatingSet}
                  >
                    {creatingSet ? 'Creating...' : 'Create Set'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Edit Question Set Modal (BUG-XX) ── */}
        {showEditSetModal && (
          <div className="modal-backdrop" onClick={() => !editingSet && setShowEditSetModal(false)}>
            <div className="modal-container" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Edit Question Set</h3>
                <button
                  type="button"
                  id="close-edit-set-modal-btn"
                  onClick={() => setShowEditSetModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleEditSetSubmit}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Question Set Name *</label>
                    <input
                      type="text"
                      id="edit-set-name-input"
                      className="form-control"
                      placeholder="e.g. SDE-1 Core DSA Problem Set"
                      value={editSetData.name}
                      onChange={(e) => setEditSetData((p) => ({ ...p, name: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Test Type *</label>
                    <select
                      id="edit-set-type-select"
                      className="form-select"
                      value={editSetData.testType}
                      onChange={(e) => setEditSetData((p) => ({ ...p, testType: e.target.value }))}
                      disabled={questions.length > 0}
                      required
                    >
                      {TEST_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    {questions.length > 0 && (
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: 4 }}>
                        ℹ Test Type cannot be changed while this set contains {questions.length} question(s).
                      </p>
                    )}
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    id="cancel-edit-set-btn"
                    onClick={() => setShowEditSetModal(false)}
                    className="btn btn-secondary"
                    disabled={editingSet}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="save-edit-set-btn"
                    className="btn btn-primary"
                    disabled={editingSet}
                  >
                    {editingSet ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Add / Edit Question Modal (FR-4.1) ── */}
        {showQuestionModal && (
          <div className="modal-backdrop" onClick={() => !savingQuestion && setShowQuestionModal(false)}>
            <div className="modal-container" style={{ maxWidth: 780 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">
                  {editingQuestionId ? 'Edit Question' : `Add Question to ${selectedSet?.name}`}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowQuestionModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleQuestionSubmit}>
                <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  
                  {/* Basic Info */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                    <div className="form-group">
                      <label className="form-label">Question Title *</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Reverse Linked List II"
                        value={questionForm.title}
                        onChange={(e) => setQuestionForm((p) => ({ ...p, title: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Difficulty</label>
                      <select
                        className="form-select"
                        value={questionForm.difficulty}
                        onChange={(e) => setQuestionForm((p) => ({ ...p, difficulty: e.target.value }))}
                      >
                        <option value="EASY">EASY</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HARD">HARD</option>
                      </select>
                    </div>
                  </div>

                  {/* Problem Description */}
                  <div className="form-group">
                    <label className="form-label">
                      {selectedSet?.testType === 'AI_TEST' ? 'Project Brief / Objective *' : 'Problem Description *'}
                    </label>
                    <textarea
                      className="form-control"
                      rows={5}
                      placeholder="Write the complete problem statement..."
                      value={questionForm.description}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, description: e.target.value }))}
                      required
                    />
                  </div>

                  {/* Input / Output Formats & Constraints */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="form-group">
                      <label className="form-label">Input Format</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. First line contains integer N"
                        value={questionForm.inputFormat}
                        onChange={(e) => setQuestionForm((p) => ({ ...p, inputFormat: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Output Format</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. Return modified array"
                        value={questionForm.outputFormat}
                        onChange={(e) => setQuestionForm((p) => ({ ...p, outputFormat: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Constraints</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. 1 <= N <= 10^5, -1000 <= val <= 1000"
                      value={questionForm.constraints}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, constraints: e.target.value }))}
                    />
                  </div>

                  {/* AI Test Starter Files (AI_TEST only) */}
                  {selectedSet?.testType === 'AI_TEST' && (
                    <div className="form-group">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label className="form-label" style={{ margin: 0 }}>Starter File Tree (AI Test)</label>
                        <button
                          type="button"
                          onClick={handleAddBriefFile}
                          className="btn btn-secondary"
                          style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                        >
                          + Add File
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {questionForm.aiTestBriefFiles.map((file, fIdx) => (
                          <div key={fIdx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="e.g. index.html"
                              value={file.fileName}
                              onChange={(e) => handleBriefFileChange(fIdx, e.target.value)}
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveBriefFile(fIdx)}
                              className="btn btn-danger"
                              style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Visible Test Cases (FR-4.1: At least 1 required) ── */}
                  <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: '#1A2B3C' }}>
                          👁️ Visible Test Cases * (FR-4.1)
                        </strong>
                        <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                          Displayed to candidates during the test for code verification. (Minimum 1 required).
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddTestCase('visibleTestCases')}
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      >
                        + Add Visible Case
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {questionForm.visibleTestCases.map((tc, idx) => (
                        <div key={idx} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, padding: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.78rem', fontWeight: 600, color: '#0E7C86' }}>
                            <span>Visible Case #{idx + 1}</span>
                            {questionForm.visibleTestCases.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveTestCase('visibleTestCases', idx)}
                                style={{ background: 'none', border: 'none', color: '#E74C3C', cursor: 'pointer', fontSize: '0.75rem' }}
                              >
                                Remove Case
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                              <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: 4 }}>
                                Standard Input (stdin)
                              </label>
                              <textarea
                                className="form-control"
                                rows={2}
                                placeholder="Input..."
                                value={tc.input}
                                onChange={(e) => handleTestCaseChange('visibleTestCases', idx, 'input', e.target.value)}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: 4 }}>
                                Expected Output (stdout)
                              </label>
                              <textarea
                                className="form-control"
                                rows={2}
                                placeholder="Expected output..."
                                value={tc.expectedOutput}
                                onChange={(e) => handleTestCaseChange('visibleTestCases', idx, 'expectedOutput', e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* ── Hidden Test Cases (FR-4.1, FR-4.2: At least 1 required) ── */}
                  <div style={{ background: '#fffbeb', border: '1.5px solid #fef3c7', borderRadius: 8, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: '#92400e' }}>
                          🔒 Hidden Test Cases * (FR-4.1, FR-4.2)
                        </strong>
                        <div style={{ fontSize: '0.75rem', color: '#b45309' }}>
                          Used exclusively for Judge0 final scoring. Never returned to candidates. (Minimum 1 required).
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleAddTestCase('hiddenTestCases')}
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                      >
                        + Add Hidden Case
                      </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {questionForm.hiddenTestCases.map((tc, idx) => (
                        <div key={idx} style={{ background: 'white', border: '1px solid #fde68a', borderRadius: 6, padding: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.78rem', fontWeight: 600, color: '#d97706' }}>
                            <span>Hidden Case #{idx + 1}</span>
                            {questionForm.hiddenTestCases.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveTestCase('hiddenTestCases', idx)}
                                style={{ background: 'none', border: 'none', color: '#E74C3C', cursor: 'pointer', fontSize: '0.75rem' }}
                              >
                                Remove Case
                              </button>
                            )}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div>
                              <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: 4 }}>
                                Standard Input (stdin)
                              </label>
                              <textarea
                                className="form-control"
                                rows={2}
                                placeholder="Hidden input..."
                                value={tc.input}
                                onChange={(e) => handleTestCaseChange('hiddenTestCases', idx, 'input', e.target.value)}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: 4 }}>
                                Expected Output (stdout)
                              </label>
                              <textarea
                                className="form-control"
                                rows={2}
                                placeholder="Hidden expected output..."
                                value={tc.expectedOutput}
                                onChange={(e) => handleTestCaseChange('hiddenTestCases', idx, 'expectedOutput', e.target.value)}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    onClick={() => setShowQuestionModal(false)}
                    className="btn btn-secondary"
                    disabled={savingQuestion}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={savingQuestion}
                  >
                    {savingQuestion ? 'Saving...' : editingQuestionId ? 'Update Question' : 'Save Question'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Delete Question Confirmation Modal ── */}
        {deleteTarget && (
          <div className="modal-backdrop" onClick={() => !deleting && setDeleteTarget(null)}>
            <div className="modal-container" style={{ maxWidth: 450 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title" style={{ color: '#E74C3C' }}>Delete Question</h3>
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
                  Are you sure you want to delete question <strong>"{deleteTarget.title}"</strong> from this set?
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
