import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import AdminNavbar from '../../shared/AdminNavbar';
import EmbeddedPdfViewer from '../../candidate/components/EmbeddedPdfViewer';
import LoadingDots from '../../shared/LoadingDots';
import api from '../../services/apiClient';
import useAdminFilterState from '../../hooks/useAdminFilterState';
import useScrollRestoration from '../../hooks/useScrollRestoration';

const TEST_TYPES = [
  { value: 'SPOJ', label: 'SPOJ (DSA / Competitive)' },
  { value: 'JAVASCRIPT', label: 'JavaScript' },
  { value: 'REACT', label: 'React.js' },
  { value: 'AI_TEST', label: 'AI Test (Kimi Assisted)' },
];

const DEFAULT_FILTERS = {
  type: 'ALL',
  search: '',
  folder: '',
  set: '',
};

// ── Helper to format Date + Time (FEATURE-035) ──
export const formatDateTime = (dateVal) => {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString()}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}`;
};

// ── Helper to recursively extract all File objects from Drag-and-Drop DataTransfer (BUG-77) ──
export const extractFilesFromDataTransfer = async (dataTransfer) => {
  const files = [];
  if (!dataTransfer) return files;

  const readAllDirectoryEntries = async (dirReader) => {
    const entries = [];
    let batch;
    do {
      batch = await new Promise((resolve, reject) => {
        dirReader.readEntries(resolve, reject);
      });
      if (batch && batch.length > 0) {
        entries.push(...batch);
      }
    } while (batch && batch.length > 0);
    return entries;
  };

  const traverseEntry = async (entry) => {
    if (!entry) return;
    if (entry.isFile) {
      try {
        const file = await new Promise((resolve, reject) => {
          entry.file(resolve, reject);
        });
        if (file) files.push(file);
      } catch (err) {
        console.warn('[extractFilesFromDataTransfer] Could not read file entry:', entry.name, err);
      }
    } else if (entry.isDirectory) {
      try {
        const dirReader = entry.createReader();
        const entries = await readAllDirectoryEntries(dirReader);
        for (const child of entries) {
          await traverseEntry(child);
        }
      } catch (err) {
        console.warn('[extractFilesFromDataTransfer] Could not read directory entry:', entry.name, err);
      }
    }
  };

  if (dataTransfer.items && dataTransfer.items.length > 0) {
    const entryPromises = [];
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry
          ? item.webkitGetAsEntry()
          : (item.getAsEntry ? item.getAsEntry() : null);

        if (entry) {
          entryPromises.push(traverseEntry(entry));
        } else {
          const file = item.getAsFile ? item.getAsFile() : null;
          if (file) files.push(file);
        }
      }
    }
    if (entryPromises.length > 0) {
      await Promise.all(entryPromises);
    }
  }

  if (files.length === 0 && dataTransfer.files && dataTransfer.files.length > 0) {
    files.push(...Array.from(dataTransfer.files));
  }

  return files;
};

export default function AdminQuestionBank() {
  // Folders State (FEATURE-013 Hierarchy)
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [loadingFolders, setLoadingFolders] = useState(true);

  // Selected Question Set (STATE 2 when set, STATE 1 when null) and Questions
  const [selectedSet, setSelectedSet] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // FEATURE-021: Search and Filter State via URL parameters
  const [filters, updateFilter, setFilters] = useAdminFilterState(DEFAULT_FILTERS);
  const filterType = filters.type;
  const folderSearch = filters.search;

  // FEATURE-021: Scroll restoration for Question Bank
  useScrollRestoration({
    loading: loadingFolders || loadingQuestions,
    key: 'qbank',
    dependencies: [folders.length, questions.length, filters.folder, filters.set],
  });

  // ── Folder Modals State ──
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderData, setNewFolderData] = useState({
    name: '',
    testType: 'SPOJ',
    description: '',
  });

  const [showEditFolderModal, setShowEditFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState(false);
  const [editFolderData, setEditFolderData] = useState({
    name: '',
    description: '',
  });

  const [showDeleteFolderModal, setShowDeleteFolderModal] = useState(false);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [deleteFolderError, setDeleteFolderError] = useState(null);

  // ── Question Set Modals State ──
  const [showNewSetModal, setShowNewSetModal] = useState(false);
  const [creatingSet, setCreatingSet] = useState(false);
  const [newSetData, setNewSetData] = useState({
    name: '',
    folderId: '',
  });

  const [showEditSetModal, setShowEditSetModal] = useState(false);
  const [editingSet, setEditingSet] = useState(false);
  const [editSetData, setEditSetData] = useState({
    name: '',
    folderId: '',
  });

  const [showDeleteSetModal, setShowDeleteSetModal] = useState(false);
  const [deletingSet, setDeletingSet] = useState(false);

  // ── Question Modal State (Create / Edit) ──
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

  // Expanded Question Details & Delete Question Target
  const [expandedQuestionId, setExpandedQuestionId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingQuestion, setDeletingQuestion] = useState(false);

  // ── Bulk Upload PDFs Modal State (FEATURE-009 & FEATURE-013) ──
  const [showUploadPdfModal, setShowUploadPdfModal] = useState(false);
  const [uploadMode, setUploadMode] = useState('CREATE_NEW_FOLDER'); // 'CREATE_NEW_FOLDER' | 'EXISTING_FOLDER'
  const [uploadFolderName, setUploadFolderName] = useState('');
  const [uploadFolderId, setUploadFolderId] = useState('');
  const [uploadTestType, setUploadTestType] = useState('SPOJ');
  const [uploadFiles, setUploadFiles] = useState([]);
  const [isDraggingFolder, setIsDraggingFolder] = useState(false);
  const [isUploadingPdfs, setIsUploadingPdfs] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSummary, setUploadSummary] = useState(null);
  const folderInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── Fetch All Folders ──
  const fetchFolders = useCallback(async (preferredFolderId = null, preferredSetId = null) => {
    try {
      setLoadingFolders(true);
      const res = await api.getFolders();
      const folderList = res.data.folders || [];
      setFolders(folderList);

      if (folderList.length > 0) {
        const targetFolderId = preferredFolderId || filters.folder;
        const targetSetId = preferredSetId || filters.set;

        let targetFolder = null;
        if (targetFolderId) {
          targetFolder = folderList.find((f) => f._id === targetFolderId);
        } else if (selectedFolder) {
          targetFolder = folderList.find((f) => f._id === selectedFolder._id);
        }
        if (!targetFolder) {
          targetFolder = folderList[0];
        }
        setSelectedFolder(targetFolder);

        // If targetSetId is specified, switch to that set in STATE 2
        const sets = targetFolder.questionSets || [];
        if (targetSetId && sets.some((s) => s._id === targetSetId)) {
          setSelectedSet(sets.find((s) => s._id === targetSetId));
        } else if (selectedSet && sets.some((s) => s._id === selectedSet._id)) {
          setSelectedSet(sets.find((s) => s._id === selectedSet._id));
        } else {
          setSelectedSet(null);
        }
      } else {
        setSelectedFolder(null);
        setSelectedSet(null);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to fetch folders');
    } finally {
      setLoadingFolders(false);
    }
  }, [filters.folder, filters.set, selectedFolder, selectedSet]);

  useEffect(() => {
    fetchFolders();
  }, []);

  // ── Fetch Questions for Selected Set ──
  const fetchQuestions = useCallback(async (setId) => {
    if (!setId) {
      setQuestions([]);
      return;
    }
    try {
      setLoadingQuestions(true);
      const res = await api.getQuestions(setId);
      const qList = res.data.questions || [];
      setQuestions(qList);

      // Dynamically sync question count in local folders state (BUG-59)
      setFolders((prev) =>
        prev.map((f) => {
          if (!f.questionSets?.some((s) => s._id === setId)) return f;
          const updatedSets = f.questionSets.map((s) =>
            s._id === setId
              ? { ...s, questionCount: qList.length, questionIds: qList.map((q) => q._id) }
              : s
          );
          const totalQ = updatedSets.reduce((sum, s) => sum + (s.questionCount || 0), 0);
          return {
            ...f,
            questionSets: updatedSets,
            totalQuestions: totalQ,
          };
        })
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

  // FEATURE-036: Ref for sets list container to reset scroll position on folder selection
  const setListContainerRef = useRef(null);

  // ── Folder Selection Handler (Switches to STATE 1: Folder Sets List) ──
  const handleSelectFolder = (folder) => {
    setSelectedFolder(folder);
    setSelectedSet(null); // Reset to STATE 1 (Folder Overview & Sets List)
    setFilters((prev) => ({ ...prev, folder: folder._id, set: '' }));
    if (setListContainerRef.current) {
      setListContainerRef.current.scrollTop = 0;
    }
  };

  // ── Question Set Selection Handler (Switches to STATE 2) ──
  const handleSelectSet = (qs) => {
    setSelectedSet(qs);
    setFilters((prev) => ({ ...prev, folder: selectedFolder?._id || '', set: qs._id }));
  };

  // ── Back to Folder Sets List Handler ──
  const handleBackToSets = () => {
    setSelectedSet(null);
    updateFilter('set', '');
    if (setListContainerRef.current) {
      setListContainerRef.current.scrollTop = 0;
    }
  };

  // ── Filtered Folders ──
  const filteredFolders = useMemo(() => {
    return folders.filter((f) => {
      if (filterType !== 'ALL' && f.testType !== filterType) {
        return false;
      }
      if (folderSearch.trim()) {
        const query = folderSearch.toLowerCase();
        return f.name.toLowerCase().includes(query) || f.description?.toLowerCase().includes(query);
      }
      return true;
    });
  }, [folders, filterType, folderSearch]);

  // ── Create Folder Handler ──
  const handleCreateFolderSubmit = async (e) => {
    e.preventDefault();
    if (!newFolderData.name.trim()) {
      return toast.error('Folder name is required');
    }
    try {
      setCreatingFolder(true);
      const res = await api.createFolder({
        name: newFolderData.name.trim(),
        testType: newFolderData.testType,
        description: newFolderData.description?.trim(),
      });
      toast.success(`Created Folder "${res.data.folder?.name}"`);
      setShowNewFolderModal(false);
      setNewFolderData({ name: '', testType: 'SPOJ', description: '' });
      await fetchFolders(res.data.folder?._id, null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create folder');
    } finally {
      setCreatingFolder(false);
    }
  };

  // ── Open Edit Folder Modal ──
  const handleOpenEditFolder = () => {
    if (!selectedFolder) return;
    setEditFolderData({
      name: selectedFolder.name || '',
      description: selectedFolder.description || '',
    });
    setShowEditFolderModal(true);
  };

  // ── Edit Folder Submit ──
  const handleEditFolderSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFolder?._id) return;
    const trimmedName = editFolderData.name.trim();
    if (!trimmedName) {
      return toast.error('Folder name is required');
    }

    try {
      setEditingFolder(true);
      const res = await api.updateFolder(selectedFolder._id, {
        name: trimmedName,
        description: editFolderData.description?.trim(),
      });
      toast.success(`Updated Folder "${res.data.folder?.name}"`);
      setShowEditFolderModal(false);
      await fetchFolders(res.data.folder?._id, selectedSet?._id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update folder');
    } finally {
      setEditingFolder(false);
    }
  };

  // ── Delete Folder Submit (FEATURE-013 Cascading Deletion & Dependency Safeguard) ──
  const handleDeleteFolderSubmit = async () => {
    if (!selectedFolder?._id) return;
    setDeleteFolderError(null);

    try {
      setDeletingFolder(true);
      const res = await api.deleteFolder(selectedFolder._id);
      toast.success(res.data?.message || `Deleted Folder "${selectedFolder.name}"`);
      setShowDeleteFolderModal(false);
      setDeleteFolderError(null);
      await fetchFolders();
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed to delete folder';
      setDeleteFolderError(errMsg);
      toast.error(errMsg);
    } finally {
      setDeletingFolder(false);
    }
  };

  // ── Create Question Set Modal Open / Submit ──
  const handleOpenNewSet = (targetFolderId = null) => {
    const folderId = targetFolderId || selectedFolder?._id || (folders[0]?._id || '');
    if (!folderId) {
      return toast.error('Please create a Folder first');
    }
    setNewSetData({
      name: '',
      folderId,
    });
    setShowNewSetModal(true);
  };

  const handleCreateSetSubmit = async (e) => {
    e.preventDefault();
    if (!newSetData.name.trim()) {
      return toast.error('Question Set name is required');
    }
    if (!newSetData.folderId) {
      return toast.error('Please select a Folder');
    }

    try {
      setCreatingSet(true);
      const res = await api.createQuestionSet({
        name: newSetData.name.trim(),
        folderId: newSetData.folderId,
      });
      toast.success(`Created Question Set "${res.data.questionSet?.name}"`);
      setShowNewSetModal(false);
      setNewSetData({ name: '', folderId: '' });
      await fetchFolders(newSetData.folderId, res.data.questionSet?._id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create question set');
    } finally {
      setCreatingSet(false);
    }
  };

  // ── Edit Question Set Modal Open / Submit (Rename & Move) ──
  const handleOpenEditSet = (setObj = null) => {
    const targetSet = setObj || selectedSet;
    if (!targetSet) return;
    setEditSetData({
      name: targetSet.name || '',
      folderId: targetSet.folderId?._id || targetSet.folderId || selectedFolder?._id || '',
    });
    setShowEditSetModal(true);
  };

  const handleEditSetSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSet?._id && !editSetData.folderId) return;
    const targetSetId = selectedSet?._id || editSetData._id;
    const trimmedName = editSetData.name.trim();
    if (!trimmedName) {
      return toast.error('Question Set name is required');
    }

    try {
      setEditingSet(true);
      const res = await api.updateQuestionSet(targetSetId || selectedSet?._id, {
        name: trimmedName,
        folderId: editSetData.folderId,
      });
      const updatedSet = res.data.questionSet;
      toast.success(`Updated Question Set "${updatedSet.name}"`);
      setShowEditSetModal(false);
      if (selectedSet?._id === updatedSet._id) {
        setSelectedSet(updatedSet);
      }
      setFolders((prev) =>
        prev.map((f) => ({
          ...f,
          questionSets: (f.questionSets || []).map((s) => (s._id === updatedSet._id ? updatedSet : s)),
        }))
      );
      await fetchFolders(editSetData.folderId, updatedSet._id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update question set');
    } finally {
      setEditingSet(false);
    }
  };

  // ── Delete Question Set Submit ──
  const handleDeleteSetSubmit = async () => {
    const targetSet = selectedSet || editSetData?.targetDeleteSet;
    if (!targetSet?._id) return;
    try {
      setDeletingSet(true);
      await api.deleteQuestionSet(targetSet._id);
      toast.success(`Deleted Question Set "${targetSet.name}"`);
      setShowDeleteSetModal(false);
      setSelectedSet(null);
      await fetchFolders(selectedFolder?._id, null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete question set');
    } finally {
      setDeletingSet(false);
    }
  };

  // ── Question Modal Handlers (Create / Edit) ──
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
      isPdfImported: false,
      pdfFileName: '',
      pdfOriginalName: '',
      pdfPageRange: { startPage: 1, endPage: 1 },
    });
    setShowQuestionModal(true);
  };

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

  const handleQuestionSubmit = async (e) => {
    e.preventDefault();
    if (!questionForm.isPdfImported) {
      if (!questionForm.title.trim() || !questionForm.description.trim()) {
        return toast.error('Title and description are required');
      }
    }

    const validVisible = questionForm.visibleTestCases.filter(
      (tc) => tc.input.trim() || tc.expectedOutput.trim()
    );

    if (!questionForm.isPdfImported && validVisible.length === 0) {
      return toast.error('At least 1 visible test case is required (FR-4.1)');
    }

    const payload = {
      ...questionForm,
      title: questionForm.title.trim(),
      description: questionForm.description.trim(),
      visibleTestCases: validVisible,
      hiddenTestCases: [],
      aiTestBriefFiles: selectedSet.testType === 'AI_TEST'
        ? questionForm.aiTestBriefFiles.filter((f) => f.fileName.trim())
        : undefined,
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
          setFolders((prev) =>
            prev.map((f) => ({
              ...f,
              questionSets: (f.questionSets || []).map((s) =>
                s._id === selectedSet._id
                  ? {
                    ...s,
                    questionCount: (s.questionCount ?? s.questionIds?.length ?? 0) + 1,
                    questionIds: [...(s.questionIds || []), newQ._id],
                  }
                  : s
              ),
            }))
          );
        }
      }
      setShowQuestionModal(false);
      await fetchQuestions(selectedSet._id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save question');
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleDeleteQuestionConfirm = async () => {
    if (!deleteTarget) return;
    try {
      setDeletingQuestion(true);
      await api.deleteQuestion(deleteTarget._id);
      toast.success(`Deleted question "${deleteTarget.title || 'Question'}"`);
      setFolders((prev) =>
        prev.map((f) => ({
          ...f,
          questionSets: (f.questionSets || []).map((s) =>
            s._id === selectedSet._id
              ? {
                ...s,
                questionCount: Math.max(0, (s.questionCount ?? s.questionIds?.length ?? 0) - 1),
                questionIds: (s.questionIds || []).filter((id) => (id?._id || id) !== deleteTarget._id),
              }
              : s
          ),
        }))
      );
      setDeleteTarget(null);
      await fetchQuestions(selectedSet._id);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete question');
    } finally {
      setDeletingQuestion(false);
    }
  };

  // ── PDF Bulk Upload Handlers (FEATURE-009, BUG-77, FEATURE-013) ──
  const processSelectedPdfFiles = (rawFiles, source = 'drop') => {
    const pdfFiles = Array.from(rawFiles || []).filter(
      (f) => f && (f.name?.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf')
    );
    if (pdfFiles.length === 0) {
      if (source === 'folder') {
        toast.error('No PDF files found in the selected folder.');
      } else if (source === 'file') {
        toast.error('No PDF files selected.');
      } else {
        toast.error('No PDF files found in dropped item.');
      }
      return false;
    }
    setUploadFiles(pdfFiles);
    setUploadSummary(null);
    return true;
  };

  const handleFolderSelect = (e) => {
    const rawFiles = Array.from(e.target.files || []);
    processSelectedPdfFiles(rawFiles, 'folder');
  };

  const handleFileSelect = (e) => {
    const rawFiles = Array.from(e.target.files || []);
    processSelectedPdfFiles(rawFiles, 'file');
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

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFolder(false);
    try {
      const rawFiles = await extractFilesFromDataTransfer(e.dataTransfer);
      processSelectedPdfFiles(rawFiles, 'drop');
    } catch (err) {
      console.error('[BulkUpload] Error extracting dropped files:', err);
      const fallbackFiles = Array.from(e.dataTransfer?.files || []);
      processSelectedPdfFiles(fallbackFiles, 'drop');
    }
  };

  const handleOpenUploadModal = (preferredFolder = null) => {
    if (preferredFolder) {
      setUploadMode('EXISTING_FOLDER');
      setUploadFolderId(preferredFolder._id);
      setUploadTestType(preferredFolder.testType);
    } else if (selectedFolder) {
      setUploadMode('EXISTING_FOLDER');
      setUploadFolderId(selectedFolder._id);
      setUploadTestType(selectedFolder.testType);
    } else {
      setUploadMode('CREATE_NEW_FOLDER');
      setUploadFolderName('');
      setUploadTestType('SPOJ');
    }
    setUploadFiles([]);
    setUploadSummary(null);
    setUploadProgress(0);
    setShowUploadPdfModal(true);
  };

  const handleUploadPdfSubmit = async (e) => {
    e.preventDefault();
    if (uploadFiles.length === 0) {
      return toast.error('Please select or drop a folder containing PDF files');
    }

    const formData = new FormData();
    if (uploadMode === 'EXISTING_FOLDER') {
      if (!uploadFolderId) {
        return toast.error('Please select an existing Folder');
      }
      formData.append('folderId', uploadFolderId);
    } else {
      const targetName = uploadFolderName.trim() || 'Uploaded PDF Batch';
      formData.append('folderName', targetName);
      formData.append('testType', uploadTestType);
    }

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

      const targetFolderId = res.data.folder?._id || uploadFolderId;
      await fetchFolders(targetFolderId, null);
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

  // Helper for testType styling
  const getBadgeStyle = (testType) => {
    switch (testType) {
      case 'SPOJ':
        return { background: 'rgba(14, 124, 134, 0.12)', color: 'var(--color-primary, #0e7c86)', border: '1px solid rgba(14, 124, 134, 0.3)' };
      case 'JAVASCRIPT':
        return { background: 'rgba(234, 179, 8, 0.12)', color: '#ca8a04', border: '1px solid rgba(234, 179, 8, 0.3)' };
      case 'REACT':
        return { background: 'rgba(59, 130, 246, 0.12)', color: '#2563eb', border: '1px solid rgba(59, 130, 246, 0.3)' };
      case 'AI_TEST':
        return { background: 'rgba(168, 85, 247, 0.12)', color: '#9333ea', border: '1px solid rgba(168, 85, 247, 0.3)' };
      default:
        return { background: 'var(--color-bg-subtle)', color: 'var(--color-text)', border: '1px solid var(--color-border)' };
    }
  };

  return (
    <div className="app-layout" style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <AdminNavbar />
      <main className="main-content" style={{ maxWidth: 1440, width: '100%', margin: '0 auto', padding: '16px 20px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxSizing: 'border-box' }}>
        {/* Page Header (Fixed) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 16, flexShrink: 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: '1.75rem', color: 'var(--color-navy)', fontWeight: 800, margin: 0 }}>
                Question Bank
              </h1>
              <span className="badge badge-secondary" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                {folders.length} Folders
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              id="upload-pdfs-btn"
              onClick={() => handleOpenUploadModal()}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
            >
              📁 Upload PDFs
            </button>
            <button
              id="new-folder-btn"
              onClick={() => setShowNewFolderModal(true)}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
            >
              + New Folder
            </button>
            <button
              id="add-question-top-btn"
              onClick={() => {
                if (selectedSet) {
                  handleOpenCreateQuestion();
                } else if (selectedFolder) {
                  handleOpenNewSet(selectedFolder._id);
                } else {
                  setShowNewFolderModal(true);
                }
              }}
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
            >
              {selectedSet ? '+ Add Question' : '+ New Question Set'}
            </button>
          </div>
        </div>

        {/* 2-Panel Layout: Folders Sidebar (Left) + Dynamic Content Panel (Right) */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'stretch', flex: 1, minHeight: 0, overflow: 'hidden' }}>

          {/* ════════ LEFT PANEL: FOLDERS SIDEBAR ════════ */}
          <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '1.1rem' }}>📂</span>
                <h3 style={{ fontSize: '1rem', color: 'var(--color-navy)', fontWeight: 700, margin: 0 }}>
                  Folders
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewFolderModal(true)}
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                title="Create a new folder container"
              >
                + Folder
              </button>
            </div>

            {/* Folder Filters */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12, flexShrink: 0 }}>
              <input
                type="text"
                id="search-folder-input"
                className="form-control"
                placeholder="🔍 Search folders..."
                style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                value={folderSearch}
                onChange={(e) => updateFilter('search', e.target.value)}
              />
              <select
                id="filter-type-select"
                className="form-select"
                style={{ fontSize: '0.8rem', padding: '6px 10px' }}
                value={filterType}
                onChange={(e) => updateFilter('type', e.target.value)}
              >
                <option value="ALL">All Test Types</option>
                {TEST_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            {/* Folders List Container (scrolls independently) */}
            {loadingFolders ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24, flex: 1 }}>
                <LoadingDots size="md" />
              </div>
            ) : filteredFolders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                No folders match filter.
                <button
                  onClick={() => setShowNewFolderModal(true)}
                  className="btn btn-primary"
                  style={{ marginTop: 12, width: '100%', fontSize: '0.8rem' }}
                >
                  + Create First Folder
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
                {filteredFolders.map((f) => {
                  const isSelected = selectedFolder?._id === f._id;
                  const setCount = f.setCount ?? (f.questionSets?.length || 0);
                  const totalQ = f.totalQuestions ?? (f.questionSets?.reduce((acc, s) => acc + (s.questionCount || 0), 0) || 0);

                  return (
                    <button
                      key={f._id}
                      onClick={() => handleSelectFolder(f)}
                      style={{
                        textAlign: 'left',
                        padding: '12px',
                        borderRadius: 8,
                        border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        background: isSelected ? 'rgba(14, 124, 134, 0.08)' : 'var(--color-bg-card)',
                        cursor: 'pointer',
                        transition: 'all 150ms',
                        fontFamily: 'inherit',
                        width: '100%',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
                        <strong style={{ fontSize: '0.88rem', color: isSelected ? 'var(--color-primary)' : 'var(--color-navy)', wordBreak: 'break-word', flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span>📁</span> {f.name}
                        </strong>
                        <span
                          className="badge"
                          style={{
                            fontSize: '0.65rem',
                            flexShrink: 0,
                            ...getBadgeStyle(f.testType),
                          }}
                        >
                          {f.testType}
                        </span>
                      </div>

                      {f.description && (
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '0 0 6px 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.description}
                        </p>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                        <span style={{ fontWeight: 600 }}>
                          {setCount} {setCount === 1 ? 'Set' : 'Sets'} · {totalQ} Qs
                        </span>
                        {setCount > 1 && (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              padding: '1px 5px 2px',
                              borderRadius: 4,
                              background: f.isValidPool ? 'rgba(34, 197, 94, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                              color: f.isValidPool ? '#15803d' : '#b45309',
                              fontWeight: 600,
                            }}
                            title={f.isValidPool ? `Valid Pool (${f.questionCountPerSet} Qs/set)` : (f.poolError || 'Sets have unequal question counts')}
                          >
                            {f.isValidPool ? '🟢 Pool Ready' : '⚠️ Pool Alert'}
                          </span>
                        )}
                      </div>

                      {/* FEATURE-035: Folder Created Date + Time */}
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginTop: 4, opacity: 0.85 }}>
                        Created: {formatDateTime(f.createdAt)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ════════ RIGHT PANEL: DYNAMIC CONTENT AREA (STATE 1 OR STATE 2) ════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', minHeight: 0, overflow: 'hidden' }}>
            {!selectedFolder ? (
              <div className="card" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-muted)', flex: 1 }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📁</div>
                <h3 style={{ color: 'var(--color-navy)', marginBottom: 6 }}>No Folder Selected</h3>
                <p style={{ fontSize: '0.85rem' }}>
                  Please select a folder from the left sidebar to view its Question Sets.
                </p>
              </div>
            ) : !selectedSet ? (
              /* ════════ STATE 1: FOLDER OVERVIEW & QUESTION SETS LIST ════════ */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', minHeight: 0, overflow: 'hidden' }}>
                {/* Folder Header Card (UI/UX IMPROVEMENT-023) */}
                <div className="card" style={{ padding: '16px 20px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* TOP ROW: Folder Name & Language Badge (Left) + Actions (Right) */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 240, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '1.4rem' }}>📁</span>
                      <h2 style={{ fontSize: '1.35rem', color: 'var(--color-navy)', fontWeight: 800, margin: 0, wordBreak: 'break-word' }}>
                        {selectedFolder.name}
                      </h2>
                      <span className="badge" style={{ fontSize: '0.72rem', ...getBadgeStyle(selectedFolder.testType) }}>
                        {selectedFolder.testType}
                      </span>
                    </div>

                    {/* Action buttons inside folder (Fixed top right) */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
                      <button
                        type="button"
                        id="new-set-in-folder-btn"
                        onClick={() => handleOpenNewSet(selectedFolder._id)}
                        className="btn btn-primary"
                        style={{ fontSize: '0.82rem', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        + New Set
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenUploadModal(selectedFolder)}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.82rem', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        📁 Add PDFs
                      </button>
                      <button
                        type="button"
                        id="edit-folder-btn"
                        onClick={handleOpenEditFolder}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                        title="Edit Folder Name / Description"
                      >
                        ✏ Edit
                      </button>
                      <button
                        type="button"
                        id="delete-folder-btn"
                        onClick={() => {
                          setDeleteFolderError(null);
                          setShowDeleteFolderModal(true);
                        }}
                        className="btn btn-danger"
                        style={{ fontSize: '0.82rem', padding: '6px 10px' }}
                        title="Delete Folder"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  {/* SECOND ROW: Distributed Metadata Grid (Full Width, balanced left & right) */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', paddingTop: 2 }}>
                    {/* Left Column / Stats */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span
                        className="badge badge-secondary"
                        style={{
                          fontSize: '0.75rem',
                          padding: '4px 10px',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          background: 'var(--color-bg-subtle)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-navy)',
                        }}
                      >
                        <span>📑</span> {selectedFolder.setCount ?? (selectedFolder.questionSets?.length || 0)} Question Sets
                      </span>
                      <span
                        className="badge badge-secondary"
                        style={{
                          fontSize: '0.75rem',
                          padding: '4px 10px',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          background: 'var(--color-bg-subtle)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-navy)',
                        }}
                      >
                        <span>📝</span> {selectedFolder.totalQuestions ?? 0} Total Questions
                      </span>
                    </div>

                    {/* Right Column / Creation & Creator info */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.78rem', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span>🕒</span> Created: <strong style={{ color: 'var(--color-navy)', fontWeight: 600 }}>{formatDateTime(selectedFolder.createdAt)}</strong>
                      </span>
                      {selectedFolder.createdBy?.name && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span>👤</span> by <strong style={{ color: 'var(--color-navy)', fontWeight: 600 }}>{selectedFolder.createdBy.name}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* THIRD ROW: Folder Description (Full Width with tooltip & 2-line clamp) */}
                  {selectedFolder.description && (
                    <p
                      title={selectedFolder.description}
                      style={{
                        color: 'var(--color-text-muted)',
                        fontSize: '0.84rem',
                        margin: 0,
                        lineHeight: 1.45,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {selectedFolder.description}
                    </p>
                  )}

                  {/* FOURTH ROW: Valid Pool Banner (Prominent Standalone Full Width) */}
                  {(selectedFolder.setCount || selectedFolder.questionSets?.length || 0) > 1 && (
                    <div>
                      {selectedFolder.isValidPool ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', background: 'rgba(34, 197, 94, 0.12)', color: '#15803d', padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(34, 197, 94, 0.3)', fontWeight: 600, width: '100%', boxSizing: 'border-box' }}>
                          <span style={{ fontSize: '0.95rem' }}>🟢</span>
                          <span>Valid Pool: All sets contain {selectedFolder.questionCountPerSet} questions each.</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', background: '#fee2e2', color: '#991b1b', padding: '6px 12px', borderRadius: 6, border: '1px solid #fecaca', fontWeight: 600, width: '100%', boxSizing: 'border-box' }}>
                          <span style={{ fontSize: '0.95rem' }}>⚠️</span>
                          <span>Pool Alert: {selectedFolder.poolError || 'Sets have unequal question counts. Cannot be used as round-robin pool until balanced.'}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Question Sets Roster / Cards Header (Fixed) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px', flexShrink: 0 }}>
                  <h3 style={{ fontSize: '1rem', color: 'var(--color-navy)', fontWeight: 700, margin: 0 }}>
                    Question Sets in this Folder
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                    Click any Question Set to view and manage its questions
                  </span>
                </div>

                {/* Question Sets Roster Container (Scrolls independently) */}
                {(!selectedFolder.questionSets || selectedFolder.questionSets.length === 0) ? (
                  <div className="card" style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--color-text-muted)', flex: 1 }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📄</div>
                    <h3 style={{ color: 'var(--color-navy)', marginBottom: 6 }}>This folder is empty</h3>
                    <p style={{ fontSize: '0.85rem', marginBottom: 20 }}>
                      Create your first question set in this folder or upload a folder of PDFs.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                      <button
                        onClick={() => handleOpenNewSet(selectedFolder._id)}
                        className="btn btn-primary"
                        style={{ fontSize: '0.85rem' }}
                      >
                        + Create Question Set
                      </button>
                      <button
                        onClick={() => handleOpenUploadModal(selectedFolder)}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.85rem' }}
                      >
                        📁 Upload PDFs
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    ref={setListContainerRef}
                    style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}
                  >
                    {selectedFolder.questionSets.map((qs, idx) => {
                      const qCount = qs.questionCount ?? (qs.questionIds?.length || 0);

                      return (
                        <div
                          key={qs._id}
                          className="card"
                          style={{
                            padding: '16px 20px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            border: '1px solid var(--color-border)',
                            flexWrap: 'wrap',
                            gap: 12,
                          }}
                          onClick={() => handleSelectSet(qs)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 240 }}>
                            <span style={{ fontSize: '1.2rem', color: 'var(--color-primary)' }}>📄</span>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <h4 style={{ fontSize: '1rem', color: 'var(--color-navy)', margin: 0, fontWeight: 700 }}>
                                  {qs.name}
                                </h4>
                                <span className="badge badge-secondary" style={{ fontSize: '0.7rem', fontWeight: 600 }}>
                                  {qCount} {qCount === 1 ? 'Question' : 'Questions'}
                                </span>
                                <span className="badge" style={{ fontSize: '0.65rem', ...getBadgeStyle(qs.testType || selectedFolder.testType) }}>
                                  {qs.testType || selectedFolder.testType}
                                </span>
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                                Created: {formatDateTime(qs.createdAt)}
                                {qs.createdBy?.name && ` · by ${qs.createdBy.name}`}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              id={`edit-set-${idx}-btn`}
                              onClick={() => {
                                setSelectedSet(qs);
                                handleOpenEditSet(qs);
                              }}
                              className="btn btn-secondary btn-sm"
                              style={{ fontSize: '0.75rem', padding: '5px 10px' }}
                            >
                              ✏ Edit
                            </button>
                            <button
                              type="button"
                              id={`delete-set-${idx}-btn`}
                              onClick={() => {
                                setSelectedSet(qs);
                                setShowDeleteSetModal(true);
                              }}
                              className="btn btn-danger btn-sm"
                              style={{ fontSize: '0.75rem', padding: '5px 10px' }}
                            >
                              🗑 Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectSet(qs)}
                              className="btn btn-primary btn-sm"
                              style={{ fontSize: '0.78rem', padding: '5px 14px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                            >
                              View Questions →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* ════════ STATE 2: QUESTION SET DETAIL & QUESTIONS ROSTER ════════ */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', minHeight: 0, overflow: 'hidden' }}>
                {/* Back Navigation Bar & Set Header Card */}
                <div className="card" style={{ padding: '16px 20px', flexShrink: 0 }}>
                  {/* Breadcrumb / Back Button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, borderBottom: '1px solid var(--color-border)', paddingBottom: 10 }}>
                    <button
                      type="button"
                      onClick={handleBackToSets}
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', padding: '4px 10px', fontWeight: 600 }}
                    >
                      ← Back
                    </button>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      <span>📁 {selectedFolder.name}</span>
                      <span style={{ margin: '0 6px' }}>/</span>
                      <strong style={{ color: 'var(--color-navy)' }}>📄 {selectedSet.name}</strong>
                    </div>
                  </div>

                  {/* Set Header Info */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <h2 style={{ fontSize: '1.25rem', color: 'var(--color-navy)', margin: 0, fontWeight: 800 }}>
                          {selectedSet.name}
                        </h2>
                        <span className="badge" style={{ fontSize: '0.72rem', ...getBadgeStyle(selectedSet.testType) }}>
                          {selectedSet.testType}
                        </span>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            background: 'rgba(14, 124, 134, 0.08)',
                            color: 'var(--color-primary)',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontWeight: 600,
                          }}
                        >
                          📁 Folder: {selectedFolder.name}
                        </span>
                      </div>
                      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', marginTop: 4 }}>
                        Contains <strong>{questions.length}</strong> question(s) · Created: {formatDateTime(selectedSet.createdAt)}{selectedSet.createdBy?.name ? ` · by ${selectedSet.createdBy.name}` : ''}
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <button
                        type="button"
                        id="edit-question-set-btn"
                        onClick={() => handleOpenEditSet(selectedSet)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.78rem' }}
                      >
                        ✏ Edit Set
                      </button>
                      <button
                        type="button"
                        id="delete-question-set-btn"
                        onClick={() => setShowDeleteSetModal(true)}
                        className="btn btn-danger btn-sm"
                        style={{ fontSize: '0.78rem' }}
                      >
                        🗑 Delete Set
                      </button>
                      <button
                        type="button"
                        id="add-question-btn"
                        onClick={handleOpenCreateQuestion}
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: '0.78rem' }}
                      >
                        + Add Question
                      </button>
                    </div>
                  </div>
                </div>

                {/* Questions List (Scrolls independently) */}
                {loadingQuestions ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 48, flex: 1 }}>
                    <LoadingDots size="md" />
                  </div>
                ) : questions.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: '60px 20px', flex: 1 }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>💡</div>
                    <h3 style={{ color: 'var(--color-navy)', marginBottom: 6 }}>No questions in this set yet</h3>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginBottom: 20 }}>
                      Every question must have at least 1 visible test case before being added.
                    </p>
                    <button onClick={handleOpenCreateQuestion} className="btn btn-primary">
                      + Add First Question
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
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
                            padding: 18,
                            borderLeft: isExpanded ? '4px solid var(--color-primary)' : '1px solid var(--color-border)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 260 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: '0.9rem' }}>
                                  Q{idx + 1}.
                                </span>
                                <h4 style={{ fontSize: '1.02rem', color: 'var(--color-navy)', margin: 0 }}>
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

                            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                              <button
                                onClick={() => setExpandedQuestionId(isExpanded ? null : q._id)}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                              >
                                {isExpanded ? 'Collapse' : 'Details'}
                              </button>
                              <button
                                onClick={() => handleOpenEditQuestion(q)}
                                className="btn btn-secondary btn-sm"
                                style={{ padding: '5px 10px', fontSize: '0.78rem' }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setDeleteTarget(q)}
                                className="btn btn-danger btn-sm"
                                style={{ padding: '5px 8px', fontSize: '0.78rem' }}
                                title="Delete Question"
                              >
                                🗑
                              </button>
                            </div>
                          </div>

                          {/* Test Cases Count summary */}
                          <div style={{ display: 'flex', gap: 16, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border)', fontSize: '0.78rem', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
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
                                      📄 Problem Statement Preview :
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
              </div>
            )}
          </div>
        </div>

        {/* ════════ MODAL: CREATE FOLDER ════════ */}
        {showNewFolderModal && (
          <div className="modal-backdrop" onClick={() => !creatingFolder && setShowNewFolderModal(false)}>
            <div className="modal-container" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Create New Folder</h3>
                <button
                  type="button"
                  onClick={() => setShowNewFolderModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleCreateFolderSubmit}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Folder Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. SDE-1 Core DSA Problem Sets"
                      value={newFolderData.name}
                      onChange={(e) => setNewFolderData((p) => ({ ...p, name: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Test Type *</label>
                    <select
                      className="form-select"
                      value={newFolderData.testType}
                      onChange={(e) => setNewFolderData((p) => ({ ...p, testType: e.target.value }))}
                      required
                    >
                      {TEST_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                      All Question Sets created or added inside this folder will inherit this test type.
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Description (Optional)</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      placeholder="Brief note on intended round, difficulty, or pool usage..."
                      value={newFolderData.description}
                      onChange={(e) => setNewFolderData((p) => ({ ...p, description: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    onClick={() => setShowNewFolderModal(false)}
                    className="btn btn-secondary"
                    disabled={creatingFolder}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={creatingFolder}
                  >
                    {creatingFolder ? 'Creating...' : 'Create Folder'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ════════ MODAL: EDIT FOLDER ════════ */}
        {showEditFolderModal && selectedFolder && (
          <div className="modal-backdrop" onClick={() => !editingFolder && setShowEditFolderModal(false)}>
            <div className="modal-container" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Edit Folder</h3>
                <button
                  type="button"
                  onClick={() => setShowEditFolderModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleEditFolderSubmit}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Folder Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editFolderData.name}
                      onChange={(e) => setEditFolderData((p) => ({ ...p, name: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Test Type</label>
                    <input
                      type="text"
                      className="form-control"
                      value={selectedFolder.testType}
                      disabled
                      style={{ background: 'var(--color-bg-subtle)' }}
                    />
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                      Test type is locked to maintain set consistency.
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={editFolderData.description}
                      onChange={(e) => setEditFolderData((p) => ({ ...p, description: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    onClick={() => setShowEditFolderModal(false)}
                    className="btn btn-secondary"
                    disabled={editingFolder}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={editingFolder}
                  >
                    {editingFolder ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ════════ MODAL: DELETE FOLDER ════════ */}
        {showDeleteFolderModal && selectedFolder && (
          <div className="modal-backdrop" onClick={() => !deletingFolder && setShowDeleteFolderModal(false)}>
            <div className="modal-container" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title" style={{ color: '#dc2626' }}>🗑 Delete Folder</h3>
                <button
                  type="button"
                  onClick={() => setShowDeleteFolderModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: '0.92rem', color: 'var(--color-text)', margin: 0 }}>
                  Are you sure you want to delete Folder <strong>"{selectedFolder.name}"</strong>?
                </p>

                {deleteFolderError && (
                  <div style={{ fontSize: '0.85rem', color: '#b91c1c', background: '#fee2e2', padding: '10px 14px', borderRadius: 6, border: '1px solid #fecaca', lineHeight: 1.45 }}>
                    ⛔ <strong>Cannot Delete Folder:</strong>
                    <div style={{ marginTop: 4 }}>{deleteFolderError}</div>
                  </div>
                )}

                {(selectedFolder.setCount || selectedFolder.questionSets?.length || 0) > 0 ? (
                  <div style={{ fontSize: '0.85rem', color: '#92400e', background: '#fef3c7', padding: '10px 14px', borderRadius: 6, border: '1px solid #fde68a', lineHeight: 1.45 }}>
                    ⚠️ <strong>Warning:</strong> This folder contains <strong>{selectedFolder.setCount || selectedFolder.questionSets?.length}</strong> question set(s). Deleting this folder will permanently delete all contained questions. This action cannot be undone.
                  </div>
                ) : (
                  <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', margin: 0 }}>
                    This empty folder will be permanently deleted. This action cannot be undone.
                  </p>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowDeleteFolderModal(false)}
                  className="btn btn-secondary"
                  disabled={deletingFolder}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="confirm-delete-folder-btn"
                  onClick={handleDeleteFolderSubmit}
                  className="btn btn-danger"
                  disabled={deletingFolder}
                >
                  {deletingFolder ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════ MODAL: CREATE QUESTION SET ════════ */}
        {showNewSetModal && (
          <div className="modal-backdrop" onClick={() => !creatingSet && setShowNewSetModal(false)}>
            <div className="modal-container" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
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
                    <label className="form-label">Destination Folder *</label>
                    <select
                      className="form-select"
                      value={newSetData.folderId}
                      onChange={(e) => setNewSetData((p) => ({ ...p, folderId: e.target.value }))}
                      required
                    >
                      {folders.map((f) => (
                        <option key={f._id} value={f._id}>
                          📁 {f.name} ({f.testType})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Question Set Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Set 1 (Arrays & Strings)"
                      value={newSetData.name}
                      onChange={(e) => setNewSetData((p) => ({ ...p, name: e.target.value }))}
                      required
                    />
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

        {/* ════════ MODAL: EDIT QUESTION SET (RENAME & MOVE) ════════ */}
        {showEditSetModal && (
          <div className="modal-backdrop" onClick={() => !editingSet && setShowEditSetModal(false)}>
            <div className="modal-container" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
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
                      value={editSetData.name}
                      onChange={(e) => setEditSetData((p) => ({ ...p, name: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Test Type</label>
                    <select
                      id="edit-set-type-select"
                      className="form-select"
                      value={selectedSet?.testType || 'SPOJ'}
                      disabled={questions.length > 0}
                      readOnly
                    >
                      {TEST_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                    {questions.length > 0 && (
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                        ℹ Test Type is locked to parent folder ({selectedSet?.testType}).
                      </p>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Parent Folder</label>
                    <select
                      className="form-select"
                      value={editSetData.folderId}
                      onChange={(e) => setEditSetData((p) => ({ ...p, folderId: e.target.value }))}
                      required
                    >
                      {folders
                        .filter((f) => !selectedSet?.testType || f.testType === selectedSet.testType)
                        .map((f) => (
                          <option key={f._id} value={f._id}>
                            📁 {f.name} ({f.testType})
                          </option>
                        ))}
                    </select>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                      You can move this set to any other folder of the same test type ({selectedSet?.testType}).
                    </p>
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

        {/* ════════ MODAL: DELETE QUESTION SET ════════ */}
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
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: '0.92rem', color: 'var(--color-text)', margin: 0 }}>
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

        {/* ════════ MODAL: ADD / EDIT QUESTION (FR-4.1) ════════ */}
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
                  {/* PDF Imported Question Info Banner */}
                  {questionForm.isPdfImported && (
                    <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 12, fontSize: '0.85rem', color: 'var(--color-primary)' }}>
                      <div style={{ fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>📄 PDF Imported Question</span>
                        <span className="badge badge-secondary" style={{ fontSize: '0.7rem' }}>
                          {questionForm.pdfFileName} (pp. {questionForm.pdfPageRange?.startPage}–{questionForm.pdfPageRange?.endPage})
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8rem', lineHeight: 1.4, color: 'var(--color-text)' }}>
                        The original PDF page is rendered directly to candidates as their problem statement.
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
                      {selectedSet?.testType === 'AI_TEST' ? 'Project Brief / Objective' : 'Problem Description'} {questionForm.isPdfImported ? '(Optional)' : '*'}
                    </label>
                    <textarea
                      className="form-control"
                      rows={questionForm.isPdfImported ? 3 : 5}
                      placeholder="Write the complete problem statement..."
                      value={questionForm.description}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, description: e.target.value }))}
                      required={!questionForm.isPdfImported}
                    />
                  </div>

                  {/* Input / Output Formats & Constraints */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="form-group">
                      <label className="form-label">
                        Input Format {questionForm.isPdfImported ? '(Optional)' : '*'}
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. First line contains integer N"
                        value={questionForm.inputFormat}
                        onChange={(e) => setQuestionForm((p) => ({ ...p, inputFormat: e.target.value }))}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Output Format {questionForm.isPdfImported ? '(Optional)' : '*'}</label>
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
                    <label className="form-label">Constraints {questionForm.isPdfImported ? '(Optional)' : '*'}</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. 1 <= N <= 10^5 or -1000 <= val <= 1000"
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

                  {/* Visible Test Cases */}
                  <div style={{ background: 'var(--color-bg-subtle)', border: '1.5px solid var(--color-border)', borderRadius: 8, padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--color-navy)' }}>
                          👁️ Visible Test Cases *
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

        {/* ════════ MODAL: DELETE QUESTION ════════ */}
        {deleteTarget && (
          <div className="modal-backdrop" onClick={() => !deletingQuestion && setDeleteTarget(null)}>
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
                  disabled={deletingQuestion}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteQuestionConfirm}
                  className="btn btn-danger"
                  disabled={deletingQuestion}
                >
                  {deletingQuestion ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════ MODAL: BULK UPLOAD PDFS (FEATURE-009 & FEATURE-013) ════════ */}
        {showUploadPdfModal && (
          <div className="modal-backdrop" onClick={handleCloseUploadModal}>
            <div
              className="modal-container"
              style={{ maxWidth: uploadSummary ? 820 : 660 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.4rem' }}>📁</span>
                  <div>
                    <h3 className="modal-title" style={{ margin: 0 }}>
                      Bulk Upload PDFs to Folder
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                      Upload a folder containing PDF files to auto-create Question Sets inside a selected or new Folder.
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
                  <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    {/* Step 1: Destination Folder Selection */}
                    <div style={{ background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <span style={{ background: 'var(--color-primary)', color: 'white', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>
                          1
                        </span>
                        <label className="form-label" style={{ margin: 0, fontWeight: 700, color: 'var(--color-navy)' }}>
                          Destination Folder *
                        </label>
                      </div>

                      {/* Mode Toggle: Create New vs Existing */}
                      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer', fontWeight: uploadMode === 'CREATE_NEW_FOLDER' ? 700 : 400 }}>
                          <input
                            type="radio"
                            name="uploadMode"
                            value="CREATE_NEW_FOLDER"
                            checked={uploadMode === 'CREATE_NEW_FOLDER'}
                            onChange={() => setUploadMode('CREATE_NEW_FOLDER')}
                            disabled={isUploadingPdfs}
                          />
                          Create New Folder
                        </label>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer', fontWeight: uploadMode === 'EXISTING_FOLDER' ? 700 : 400 }}>
                          <input
                            type="radio"
                            name="uploadMode"
                            value="EXISTING_FOLDER"
                            checked={uploadMode === 'EXISTING_FOLDER'}
                            onChange={() => setUploadMode('EXISTING_FOLDER')}
                            disabled={isUploadingPdfs}
                          />
                          Add to Existing Folder
                        </label>
                      </div>

                      {uploadMode === 'CREATE_NEW_FOLDER' ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 12 }}>
                          <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                              New Folder Name *
                            </label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="e.g. SDE-1 Screening Batch A"
                              value={uploadFolderName}
                              onChange={(e) => setUploadFolderName(e.target.value)}
                              disabled={isUploadingPdfs}
                              required
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                              Test Type *
                            </label>
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
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'block', marginBottom: 4 }}>
                            Select Existing Folder *
                          </label>
                          <select
                            className="form-select"
                            value={uploadFolderId}
                            onChange={(e) => {
                              setUploadFolderId(e.target.value);
                              const f = folders.find((fol) => fol._id === e.target.value);
                              if (f) setUploadTestType(f.testType);
                            }}
                            disabled={isUploadingPdfs}
                            required
                          >
                            <option value="">-- Choose a Folder --</option>
                            {folders.map((f) => (
                              <option key={f._id} value={f._id}>
                                📁 {f.name} ({f.testType}) — {f.setCount ?? (f.questionSets?.length || 0)} sets
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
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
                          padding: '24px 20px',
                          textAlign: 'center',
                          transition: 'all 0.2s ease',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontSize: '2.2rem', marginBottom: 6 }}>
                          {isDraggingFolder ? '📥' : '📂'}
                        </div>
                        <h4 style={{ margin: '0 0 4px 0', fontSize: '0.95rem', color: 'var(--color-navy)' }}>
                          {isDraggingFolder ? 'Drop folder here!' : 'Drag & drop a folder containing PDF files'}
                        </h4>
                        <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', margin: '0 0 14px 0' }}>
                          Each PDF will become a Question Set in this Folder.
                        </p>

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

                        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => folderInputRef.current?.click()}
                            className="btn btn-primary"
                            disabled={isUploadingPdfs}
                            style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            📁 Choose Folder
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="btn btn-secondary"
                            disabled={isUploadingPdfs}
                            style={{ fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            📄 Choose PDF Files
                          </button>
                        </div>
                      </div>

                      {uploadFiles.length > 0 && (
                        <div style={{ marginTop: 12, background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 6, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
                          <LoadingDots size="sm" color="white" />
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
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Incomplete</div>
                      </div>
                    </div>

                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: 12, fontSize: '0.8rem', color: '#92400e' }}>
                      ℹ️ <strong>Note:</strong> Question sets were created in Folder <strong>"{uploadSummary?.folder?.name || selectedFolder?.name || 'Target Folder'}"</strong>.
                    </div>

                    <div>
                      <h4 style={{ fontSize: '0.9rem', color: 'var(--color-navy)', marginBottom: 8 }}>File Processing Breakdown</h4>
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
                                            background: '#f0fdf4',
                                            color: '#15803d',
                                            border: '1.5px solid #86efac',
                                            fontWeight: 700,
                                          }}
                                        >
                                          Success
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
                      Done
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
