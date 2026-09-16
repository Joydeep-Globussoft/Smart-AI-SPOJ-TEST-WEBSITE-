import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import AdminNavbar from '../../shared/AdminNavbar';
import EmbeddedPdfViewer from '../../candidate/components/EmbeddedPdfViewer';
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

  // Bulk Upload PDFs State (FEATURE-009)
  const [showUploadPdfModal, setShowUploadPdfModal] = useState(false);
  const [uploadTestType, setUploadTestType] = useState('SPOJ');
  const [uploadFiles, setUploadFiles] = useState([]);
  const [isDraggingFolder, setIsDraggingFolder] = useState(false);
  const [isUploadingPdfs, setIsUploadingPdfs] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSummary, setUploadSummary] = useState(null);
  const folderInputRef = useRef(null);
  const fileInputRef = useRef(null);

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

  // Delete Question Set Modal State
  const [showDeleteSetModal, setShowDeleteSetModal] = useState(false);
  const [deletingSet, setDeletingSet] = useState(false);

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
    aiTestBriefFiles: [{ fileName: 'index.html' }, { fileName: 'style.css' }, { fileName: 'app.js' }],
    isPdfImported: false,
    pdfFileName: '',
    pdfOriginalName: '',
    pdfPageRange: { startPage: 1, endPage: 1 },
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
      const qList = res.data.questions || [];
      setQuestions(qList);
      // Immediately sync question count for the active set in questionSets state (BUG-59)
      setQuestionSets((prev) =>
        prev.map((s) =>
          s._id === setId
            ? { ...s, questionCount: qList.length, questionIds: qList.map((q) => q._id) }
            : s
        )
      );
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

  // Handle Delete Question Set Submit
  const handleDeleteSetSubmit = async () => {
    if (!selectedSet?._id) return;
    try {
      setDeletingSet(true);
      await api.deleteQuestionSet(selectedSet._id);
      toast.success(`Deleted Question Set "${selectedSet.name}"`);
      setShowDeleteSetModal(false);

      const res = await api.getQuestionSets();
      const sets = res.data.questionSets || [];
      setQuestionSets(sets);
      setSelectedSet(sets.length > 0 ? sets[0] : null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete question set');
    } finally {
      setDeletingSet(false);
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
      aiTestBriefFiles: q.aiTestBriefFiles?.length > 0 ? q.aiTestBriefFiles : [],
      isPdfImported: Boolean(q.isPdfImported),
      pdfFileName: q.pdfFileName || '',
      pdfOriginalName: q.pdfOriginalName || '',
      pdfPageRange: q.pdfPageRange || { startPage: 1, endPage: 1 },
    });
    setShowQuestionModal(true);
  };

  // ── PDF Bulk Upload Handlers (FEATURE-009) ──────────────────────────────────
  const handleFolderSelect = (e) => {
    const rawFiles = Array.from(e.target.files || []);
    const pdfFiles = rawFiles.filter((f) =>
      f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf'
    );
    if (pdfFiles.length === 0) {
      toast.error('No PDF files found in the selected folder.');
      return;
    }
    setUploadFiles(pdfFiles);
    setUploadSummary(null);
  };

  const handleFileSelect = (e) => {
    const rawFiles = Array.from(e.target.files || []);
    const pdfFiles = rawFiles.filter((f) =>
      f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf'
    );
    if (pdfFiles.length === 0) {
      toast.error('No PDF files selected.');
      return;
    }
    setUploadFiles(pdfFiles);
    setUploadSummary(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFolder(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFolder(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFolder(false);
    const items = e.dataTransfer.files;
    const pdfFiles = Array.from(items || []).filter((f) =>
      f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf'
    );
    if (pdfFiles.length === 0) {
      toast.error('No PDF files found in dropped item.');
      return;
    }
    setUploadFiles(pdfFiles);
    setUploadSummary(null);
  };

  const handleUploadPdfSubmit = async (e) => {
    e.preventDefault();
    if (!uploadTestType) {
      return toast.error('Please select a Test Type first');
    }
    if (uploadFiles.length === 0) {
      return toast.error('Please select or drop a folder containing PDF files');
    }

    const formData = new FormData();
    formData.append('testType', uploadTestType);
    uploadFiles.forEach((f) => formData.append('files', f));

    try {
      setIsUploadingPdfs(true);
      setUploadProgress(15);
      const res = await api.uploadPdfBatch(formData, (progressEvent) => {
        if (progressEvent.total) {
          const percent = Math.round((progressEvent.loaded * 90) / progressEvent.total);
          setUploadProgress(Math.max(15, percent));
        }
      });
      setUploadProgress(100);
      const summary = res.data.summary;
      setUploadSummary(summary);
      toast.success(res.data.message || 'PDF batch processed successfully!');

      // Immediately refresh question sets in sidebar (BUG-59)
      const updatedSetsRes = await api.getQuestionSets();
      const sets = updatedSetsRes.data.questionSets || [];
      setQuestionSets(sets);

      if (summary.createdSets?.length > 0) {
        const firstCreated = sets.find((s) => s._id === summary.createdSets[0]._id);
        if (firstCreated) {
          setSelectedSet(firstCreated);
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to upload and parse PDF batch');
    } finally {
      setIsUploadingPdfs(false);
    }
  };

  const handleCloseUploadModal = () => {
    if (isUploadingPdfs) return;
    setShowUploadPdfModal(false);
    setUploadFiles([]);
    setUploadSummary(null);
    setUploadProgress(0);
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

    if (!questionForm.isPdfImported) {
      if (!questionForm.title.trim() || !questionForm.description.trim()) {
        return toast.error('Title and description are required');
      }
    }

    // Filter valid visible test cases
    const validVisible = questionForm.visibleTestCases.filter((tc) => tc.input.trim() || tc.expectedOutput.trim());

    if (!questionForm.isPdfImported) {
      if (validVisible.length === 0) {
        return toast.error('At least 1 visible test case is required (FR-4.1)');
      }
    }

    const payload = {
      ...questionForm,
      title: questionForm.title.trim(),
      description: questionForm.description.trim(),
      visibleTestCases: validVisible,
      hiddenTestCases: [],
      aiTestBriefFiles: selectedSet.testType === 'AI_TEST' ? questionForm.aiTestBriefFiles.filter((f) => f.fileName.trim()) : undefined,
    };

    try {
      setSavingQuestion(true);
      if (editingQuestionId) {
        await api.updateQuestion(editingQuestionId, payload);
        toast.success('Question updated successfully');
      } else {
        const createRes = await api.createQuestion(selectedSet._id, payload);
        toast.success('Question added to question set (FR-4.1 verified)');
        if (createRes?.data?.question) {
          const newQ = createRes.data.question;
          setQuestionSets((prev) =>
            prev.map((s) =>
              s._id === selectedSet._id
                ? {
                  ...s,
                  questionCount: (s.questionCount ?? s.questionIds?.length ?? 0) + 1,
                  questionIds: [...(s.questionIds || []), newQ._id],
                }
                : s
            )
          );
        }
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
      setQuestionSets((prev) =>
        prev.map((s) =>
          s._id === selectedSet._id
            ? {
              ...s,
              questionCount: Math.max(0, (s.questionCount ?? s.questionIds?.length ?? 0) - 1),
              questionIds: (s.questionIds || []).filter((id) => (id?._id || id) !== deleteTarget._id),
            }
            : s
        )
      );
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
            <h1 style={{ fontSize: '1.8rem', color: 'var(--color-navy)', fontWeight: 800 }}>Question Bank</h1>

          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              id="upload-pdfs-btn"
              onClick={() => {
                setShowUploadPdfModal(true);
                setUploadFiles([]);
                setUploadSummary(null);
                setUploadProgress(0);
              }}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              📁 Upload PDFs
            </button>
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
              <h3 style={{ fontSize: '1rem', color: 'var(--color-navy)', fontWeight: 700 }}>Question Sets</h3>
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
              <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
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
                  const qCount = isSelected && questions !== null && questions !== undefined
                    ? questions.length
                    : (qs.questionCount ?? (qs.questionIds?.length || 0));

                  return (
                    <button
                      key={qs._id}
                      onClick={() => setSelectedSet(qs)}
                      style={{
                        textAlign: 'left',
                        padding: '12px 14px',
                        borderRadius: 8,
                        border: isSelected ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: isSelected ? 'rgba(14, 124, 134, 0.12)' : 'var(--color-bg-card)',
                        cursor: 'pointer',
                        transition: 'all 150ms',
                        fontFamily: 'inherit',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <strong style={{ fontSize: '0.875rem', color: isSelected ? 'var(--color-primary)' : 'var(--color-navy)' }}>
                          {qs.name}
                        </strong>
                        <span className="badge badge-secondary" style={{ fontSize: '0.65rem' }}>
                          {qCount} Qs
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
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
                      <h2 style={{ fontSize: '1.3rem', color: 'var(--color-navy)', margin: 0 }}>{selectedSet.name}</h2>
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
                      <button
                        type="button"
                        id="delete-question-set-btn"
                        onClick={() => setShowDeleteSetModal(true)}
                        className="btn btn-danger btn-sm"
                        style={{
                          fontSize: '0.75rem',
                          padding: '3px 10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          cursor: 'pointer',
                        }}
                        title="Delete Question Set"
                      >
                        🗑 Delete Set
                      </button>
                    </div>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginTop: 4 }}>
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
                    <h3 style={{ color: 'var(--color-navy)', marginBottom: 6 }}>No questions in this set yet</h3>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>
                      Every question must have at least 1 visible test case before being added (FR-4.1).
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
                            borderLeft: isExpanded ? '4px solid var(--color-primary)' : '1px solid var(--color-border)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 260 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '0.9rem' }}>
                                  Q{idx + 1}.
                                </span>
                                <h4 style={{ fontSize: '1.05rem', color: 'var(--color-navy)', margin: 0 }}>
                                  {q.title || (q.isPdfImported ? `${q.pdfOriginalName || q.pdfFileName} (Problem ${idx + 1})` : 'Untitled Question')}
                                </h4>
                                {q.difficulty && (
                                  <span className={`badge ${diffBadge}`} style={{ fontSize: '0.65rem' }}>
                                    {q.difficulty}
                                  </span>
                                )}
                                {q.isPdfImported && (
                                  <span
                                    className="badge badge-secondary"
                                    style={{
                                      fontSize: '0.68rem',
                                      background: 'rgba(13, 148, 136, 0.1)',
                                      color: 'var(--color-primary)',
                                      border: '1px solid rgba(13, 148, 136, 0.25)',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                    }}
                                  >
                                    📄 PDF: {q.pdfFileName} (pp. {q.pdfPageRange?.startPage || 1}–{q.pdfPageRange?.endPage || 1})
                                  </span>
                                )}
                                {q.exampleParsingStatus && q.exampleParsingStatus !== 'SUCCESS' && (
                                  <span
                                    className="badge"
                                    style={{
                                      fontSize: '0.68rem',
                                      background: '#fffbeb',
                                      color: '#b45309',
                                      border: '1px solid #fde68a',
                                    }}
                                  >
                                    {q.exampleParsingStatus === 'AMBIGUOUS' ? '⚠️ Ambiguous Test Cases' : '⚠️ No Examples Detected'}
                                  </span>
                                )}
                              </div>
                              {q.description ? (
                                <p
                                  style={{
                                    color: 'var(--color-text)',
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
                              ) : q.isPdfImported ? (
                                <p style={{ color: 'var(--color-primary)', fontSize: '0.82rem', fontStyle: 'italic', margin: '4px 0 0 0' }}>
                                  Rendered directly from original PDF (pp. {q.pdfPageRange?.startPage || 1}–{q.pdfPageRange?.endPage || 1})
                                </p>
                              ) : null}
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
                          <div style={{ display: 'flex', gap: 16, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)', fontSize: '0.78rem', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                            <span>
                              👁️ Visible Cases: <strong>{q.visibleTestCases?.length || 0}</strong>
                            </span>
                            {q.constraints && (
                              <span>
                                📏 Constraints: <code>{q.constraints}</code>
                              </span>
                            )}
                          </div>

                          {/* Expanded Full Details */}
                          {isExpanded && (
                            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 16 }}>
                              {/* PDF Problem Statement Preview for PDF-imported questions */}
                              {q.isPdfImported && (
                                <div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <strong style={{ fontSize: '0.82rem', color: 'var(--color-navy)' }}>
                                      📄 Candidate Problem Statement Preview (pp. {q.pdfPageRange?.startPage || 1}–{q.pdfPageRange?.endPage || 1}):
                                    </strong>
                                  </div>
                                  <div style={{ height: 440, borderRadius: 8, overflow: 'hidden', border: '1.5px solid var(--color-primary)' }}>
                                    <EmbeddedPdfViewer
                                      fileName={q.pdfFileName}
                                      originalName={q.pdfOriginalName}
                                      pageRange={q.pdfPageRange}
                                      questionNumber={idx + 1}
                                    />
                                  </div>
                                </div>
                              )}

                              {q.inputFormat && (
                                <div>
                                  <strong style={{ fontSize: '0.8rem', color: 'var(--color-navy)' }}>Input Format:</strong>
                                  <div style={{ background: 'var(--color-bg-subtle)', padding: 10, borderRadius: 6, fontSize: '0.8rem', marginTop: 4, color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
                                    {q.inputFormat}
                                  </div>
                                </div>
                              )}
                              {q.outputFormat && (
                                <div>
                                  <strong style={{ fontSize: '0.8rem', color: 'var(--color-navy)' }}>Output Format:</strong>
                                  <div style={{ background: 'var(--color-bg-subtle)', padding: 10, borderRadius: 6, fontSize: '0.8rem', marginTop: 4, color: 'var(--color-text)', border: '1px solid var(--color-border)' }}>
                                    {q.outputFormat}
                                  </div>
                                </div>
                              )}

                              {/* Visible Test Cases */}
                              <div>
                                <strong style={{ fontSize: '0.8rem', color: 'var(--color-navy)' }}>
                                  👁️ Visible Test Cases (Shown to Candidate):
                                </strong>
                                {q.visibleTestCases?.length > 0 ? (
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginTop: 6 }}>
                                    {q.visibleTestCases.map((tc, tcIdx) => (
                                      <div key={tcIdx} style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 6, padding: 10, fontSize: '0.78rem' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--color-primary)', marginBottom: 4 }}>Case #{tcIdx + 1}</div>
                                        <div style={{ marginBottom: 4 }}>
                                          <span style={{ color: 'var(--color-text-muted)' }}>Input: </span>
                                          <code>{tc.input || '(empty)'}</code>
                                        </div>
                                        <div>
                                          <span style={{ color: 'var(--color-text-muted)' }}>Output: </span>
                                          <code>{tc.expectedOutput || '(empty)'}</code>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{ padding: 10, background: 'var(--color-bg-subtle)', borderRadius: 6, fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 4, border: '1px solid var(--color-border)' }}>
                                    No visible test cases defined.
                                  </div>
                                )}
                              </div>

                              {/* AI Test Brief Files */}
                              {q.aiTestBriefFiles?.length > 0 && (
                                <div>
                                  <strong style={{ fontSize: '0.8rem', color: 'var(--color-navy)' }}>AI Test Starter Files:</strong>
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
              <div className="card" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-muted)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📁</div>
                <h3 style={{ color: 'var(--color-navy)', marginBottom: 6 }}>No Question Set Selected</h3>
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
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}
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
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}
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
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
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

        {/* ── Delete Question Set Modal ── */}
        {showDeleteSetModal && selectedSet && (
          <div className="modal-backdrop" onClick={() => !deletingSet && setShowDeleteSetModal(false)}>
            <div className="modal-container" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title" style={{ color: '#dc2626' }}>🗑 Delete Question Set</h3>
                <button
                  type="button"
                  onClick={() => setShowDeleteSetModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body" style={{ gap: 12 }}>
                <p style={{ fontSize: '0.95rem', color: 'var(--color-text)', margin: 0 }}>
                  Are you sure you want to delete Question Set <strong>"{selectedSet.name}"</strong>?
                </p>
                {questions.length > 0 && (
                  <p style={{ fontSize: '0.85rem', color: '#dc2626', background: '#fee2e2', padding: '8px 12px', borderRadius: 6, margin: 0 }}>
                    ⚠️ This will also delete all <strong>{questions.length}</strong> question(s) inside this set.
                  </p>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowDeleteSetModal(false)}
                  className="btn btn-secondary"
                  disabled={deletingSet}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSetSubmit}
                  className="btn btn-danger"
                  disabled={deletingSet}
                >
                  {deletingSet ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
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
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleQuestionSubmit}>
                <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

                  {/* PDF Imported Question Informational Banner */}
                  {questionForm.isPdfImported && (
                    <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, fontSize: '0.85rem', color: 'var(--color-primary)' }}>
                      <div style={{ fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>📄 PDF Imported Question</span>
                        <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                          {questionForm.pdfFileName} (pp. {questionForm.pdfPageRange?.startPage}–{questionForm.pdfPageRange?.endPage})
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', lineHeight: 1.4, color: 'var(--color-text)' }}>
                        The original PDF page is rendered directly to candidates as their problem statement. Title and Description are optional. Add at least 1 hidden test case below to mark this question complete for live tests.
                      </div>
                    </div>
                  )}

                  {/* Basic Info */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                    <div className="form-group">
                      <label className="form-label">
                        Question Title {questionForm.isPdfImported ? '(Optional)' : '*'}
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder={questionForm.isPdfImported ? "e.g. Problem 1 (or leave blank to use PDF name)" : "e.g. Reverse Linked List II"}
                        value={questionForm.title}
                        onChange={(e) => setQuestionForm((p) => ({ ...p, title: e.target.value }))}
                        required={!questionForm.isPdfImported}
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
                      {selectedSet?.testType === 'AI_TEST' ? 'Project Brief / Objective' : 'Problem Description'} {questionForm.isPdfImported ? '(Optional — Rendered from PDF)' : '*'}
                    </label>
                    <textarea
                      className="form-control"
                      rows={questionForm.isPdfImported ? 3 : 5}
                      placeholder={questionForm.isPdfImported ? "Optional additional notes (PDF page statement will be displayed to candidates)..." : "Write the complete problem statement..."}
                      value={questionForm.description}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, description: e.target.value }))}
                      required={!questionForm.isPdfImported}
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
                  <div style={{ background: 'var(--color-bg-subtle)', border: '1.5px solid var(--color-border)', borderRadius: 8, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--color-navy)' }}>
                          👁️ Visible Test Cases * (FR-4.1)
                        </strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          Displayed to candidates during the test for code verification.
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
                        <div key={idx} style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 6, padding: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-primary)' }}>
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
                              <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
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
                              <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
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
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <p style={{ color: 'var(--color-text)', fontSize: '0.9rem' }}>
                  Are you sure you want to delete question <strong>"{deleteTarget.title || deleteTarget.pdfFileName || 'this question'}"</strong> from this set?
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

        {/* ── Bulk Upload PDFs Modal (FEATURE-009) ── */}
        {showUploadPdfModal && (
          <div className="modal-backdrop" onClick={handleCloseUploadModal}>
            <div
              className="modal-container"
              style={{ maxWidth: uploadSummary ? 820 : 640 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.4rem' }}>📁</span>
                  <div>
                    <h3 className="modal-title" style={{ margin: 0 }}>
                      Bulk Upload PDFs to Question Bank
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      Upload a folder containing PDF files (or choose PDFs) to auto-create Question Sets & Questions
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCloseUploadModal}
                  disabled={isUploadingPdfs}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                >
                  ✕
                </button>
              </div>

              {!uploadSummary ? (
                <form onSubmit={handleUploadPdfSubmit}>
                  <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Step 1: Select Test Type */}
                    <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ background: 'var(--color-primary)', color: 'white', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>
                          1
                        </span>
                        <label className="form-label" style={{ margin: 0, fontWeight: 700, color: 'var(--color-navy)' }}>
                          Select Test Type for Batch *
                        </label>
                      </div>
                      <select
                        className="form-select"
                        value={uploadTestType}
                        onChange={(e) => setUploadTestType(e.target.value)}
                        disabled={isUploadingPdfs}
                        required
                      >
                        {TEST_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '6px 0 0 0' }}>
                        All uploaded PDFs in this batch will be assigned to this test type ({uploadTestType}).
                      </p>
                    </div>

                    {/* Step 2: Upload Folder / PDFs */}
                    <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <span style={{ background: 'var(--color-primary)', color: 'white', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>
                          2
                        </span>
                        <label className="form-label" style={{ margin: 0, fontWeight: 700, color: 'var(--color-navy)' }}>
                          Select Folder or PDF Files *
                        </label>
                      </div>

                      {/* Drag & Drop Zone */}
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        style={{
                          border: isDraggingFolder ? '2px dashed var(--color-primary)' : '2px dashed var(--color-border)',
                          background: isDraggingFolder ? 'rgba(14, 124, 134, 0.15)' : 'var(--color-bg-card)',
                          borderRadius: 10,
                          padding: '28px 20px',
                          textAlign: 'center',
                          transition: 'all 0.2s ease',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>
                          {isDraggingFolder ? '📥' : '📂'}
                        </div>
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: 'var(--color-navy)' }}>
                          {isDraggingFolder ? 'Drop folder here!' : 'Drag & drop a folder containing PDF files'}
                        </h4>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: '0 0 16px 0' }}>
                          Supports bulk folder upload (~100 PDFs) or individual PDF selection.
                        </p>

                        {/* Hidden Inputs */}
                        <input
                          type="file"
                          ref={folderInputRef}
                          webkitdirectory="true"
                          directory="true"
                          multiple
                          onChange={handleFolderSelect}
                          style={{ display: 'none' }}
                        />
                        <input
                          type="file"
                          ref={fileInputRef}
                          accept=".pdf,application/pdf"
                          multiple
                          onChange={handleFileSelect}
                          style={{ display: 'none' }}
                        />

                        {/* Buttons */}
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => folderInputRef.current?.click()}
                            className="btn btn-primary"
                            disabled={isUploadingPdfs}
                            style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            📁 Choose Folder
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="btn btn-secondary"
                            disabled={isUploadingPdfs}
                            style={{ fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            📄 Choose PDF Files
                          </button>
                        </div>
                      </div>

                      {/* Selected Files Preview */}
                      {uploadFiles.length > 0 && (
                        <div style={{ marginTop: 14, background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '1.1rem' }}>📄</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-navy)' }}>
                              {uploadFiles.length} PDF file(s) selected
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                              ({(uploadFiles.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024)).toFixed(2)} MB total)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setUploadFiles([])}
                            disabled={isUploadingPdfs}
                            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                          >
                            ✕ Clear
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Upload Progress Bar */}
                    {isUploadingPdfs && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 6 }}>
                          <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Parsing and uploading PDFs...</span>
                          <span style={{ color: 'var(--color-text-muted)' }}>{uploadProgress}%</span>
                        </div>
                        <div style={{ width: '100%', background: 'var(--color-bg-subtle)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                          <div
                            style={{
                              width: `${uploadProgress}%`,
                              background: 'var(--color-primary)',
                              height: '100%',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="modal-footer">
                    <button
                      type="button"
                      onClick={handleCloseUploadModal}
                      className="btn btn-secondary"
                      disabled={isUploadingPdfs}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isUploadingPdfs || uploadFiles.length === 0}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                    >
                      {isUploadingPdfs ? (
                        <>
                          <div className="spinner spinner-dark" style={{ width: 16, height: 16, borderTopColor: '#ffffff' }} />
                          Processing {uploadFiles.length} PDFs...
                        </>
                      ) : (
                        `Upload & Process ${uploadFiles.length > 0 ? `(${uploadFiles.length} PDFs)` : ''}`
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                /* Upload Summary Report */
                <div>
                  <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Stats Banner */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                      <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                          {uploadSummary?.totalPdfs ?? uploadSummary?.totalPdfsReceived ?? 0}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>PDFs Processed</div>
                      </div>
                      <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                          {uploadSummary?.questionSetsCreated ?? uploadSummary?.totalQuestionSetsCreated ?? 0}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Question Sets Created</div>
                      </div>
                      <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#15803d' }}>
                          {uploadSummary?.questionsCreated ?? uploadSummary?.totalQuestionsCreated ?? 0}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Questions Created</div>
                      </div>
                      <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#b91c1c' }}>
                          {uploadSummary?.incompleteQuestions ?? 0}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Incomplete (Need Hidden)</div>
                      </div>
                    </div>

                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 12, fontSize: '0.8rem', color: '#92400e' }}>
                      ℹ️ <strong>Next Step:</strong> All imported questions have visible test cases populated from PDF examples, but their <strong>Hidden Test Cases</strong> are empty. You must add at least 1 hidden test case to each question before creating a live test from these sets.
                    </div>

                    {/* Breakdown Table */}
                    <div>
                      <h4 style={{ fontSize: '0.9rem', color: 'var(--color-navy)', marginBottom: 8 }}>Per-File Processing Breakdown</h4>
                      <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                          <thead style={{ background: 'var(--color-table-header-bg)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-table-header-text)' }}>
                            <tr>
                              <th style={{ padding: '8px 12px' }}>File / Set Name</th>
                              <th style={{ padding: '8px 12px' }}>Questions</th>
                              <th style={{ padding: '8px 12px' }}>Visible Cases / Diagnostics</th>
                              <th style={{ padding: '8px 12px' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const reports = (uploadSummary?.fileReports && uploadSummary.fileReports.length > 0)
                                ? uploadSummary.fileReports
                                : [
                                  ...(uploadSummary?.createdSets || []).map((cs) => ({
                                    status: 'SUCCESS',
                                    setName: cs.name,
                                    originalName: cs.pdfFileName,
                                    questionCount: cs.questionCount,
                                    questions: [],
                                  })),
                                  ...(uploadSummary?.failedPdfs || []).map((fp) => ({
                                    status: 'FAILED',
                                    setName: fp.fileName || fp.originalName,
                                    originalName: fp.fileName || fp.originalName,
                                    questionCount: 0,
                                    reason: fp.reason || 'Failed to process PDF',
                                  })),
                                ];

                              if (reports.length === 0) {
                                return (
                                  <tr>
                                    <td colSpan="4" style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                                      No file reports available.
                                    </td>
                                  </tr>
                                );
                              }

                              return reports.map((r, rIdx) => {
                                const isSuccess = r.status === 'SUCCESS';
                                return (
                                  <tr key={rIdx} style={{ borderBottom: '1px solid var(--color-border)', background: isSuccess ? 'var(--color-bg-card)' : 'var(--color-bg-subtle)' }}>
                                    <td style={{ padding: '8px 12px' }}>
                                      <div style={{ fontWeight: 600, color: isSuccess ? 'var(--color-navy)' : '#b91c1c' }}>
                                        {r.setName || r.originalName || 'Unknown Set'}
                                      </div>
                                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{r.originalName || r.fileName}</div>
                                    </td>
                                    <td style={{ padding: '8px 12px' }}>
                                      <span
                                        className="badge"
                                        style={{
                                          fontSize: '0.75rem',
                                          background: isSuccess ? 'var(--color-bg-subtle)' : '#fee2e2',
                                          color: isSuccess ? 'var(--color-text)' : '#991b1b',
                                          border: `1px solid ${isSuccess ? 'var(--color-border)' : '#fecaca'}`,
                                        }}
                                      >
                                        {r.questionCount} question(s)
                                      </span>
                                    </td>
                                    <td style={{ padding: '8px 12px' }}>
                                      {isSuccess ? (
                                        r.questions && r.questions.length > 0 ? (
                                          r.questions.map((qInfo, qIdx) => (
                                            <div key={qIdx} style={{ fontSize: '0.75rem', marginBottom: 2 }}>
                                              Q{qInfo.questionNumber || qIdx + 1} (pp. {qInfo.pageRange?.startPage}–{qInfo.pageRange?.endPage}):{' '}
                                              <strong>{qInfo.visibleTestCasesCount} case(s)</strong>
                                              {qInfo.exampleParsingStatus === 'AMBIGUOUS' && (
                                                <span style={{ color: '#d97706', marginLeft: 4 }}>⚠️ Ambiguous Example</span>
                                              )}
                                              {qInfo.exampleParsingStatus === 'FAILED' && (
                                                <span style={{ color: '#dc2626', marginLeft: 4 }}>⚠️ Example Parse Failed</span>
                                              )}
                                            </div>
                                          ))
                                        ) : (
                                          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>No question details</span>
                                        )
                                      ) : (
                                        <div style={{ fontSize: '0.75rem', color: '#b91c1c', background: '#fee2e2', padding: '4px 8px', borderRadius: 4, border: '1px solid #fecaca' }}>
                                          ⚠️ <strong>Failure Reason:</strong> {r.reason || 'Could not parse question boundaries.'}
                                        </div>
                                      )}
                                    </td>
                                    <td style={{ padding: '8px 12px' }}>
                                      {isSuccess ? (
                                        <span
                                          className="badge"
                                          style={{
                                            fontSize: '0.7rem',
                                            background: '#fef2f2',
                                            color: '#b91c1c',
                                            border: '1px solid #fecaca',
                                          }}
                                        >
                                          Incomplete
                                        </span>
                                      ) : (
                                        <span
                                          className="badge"
                                          style={{
                                            fontSize: '0.7rem',
                                            background: '#fee2e2',
                                            color: '#991b1b',
                                            border: '1px solid #f87171',
                                            fontWeight: 700,
                                          }}
                                        >
                                          Failed
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              });
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="modal-footer">
                    <button
                      type="button"
                      onClick={handleCloseUploadModal}
                      className="btn btn-primary"
                    >
                      Done / View Question Sets
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
