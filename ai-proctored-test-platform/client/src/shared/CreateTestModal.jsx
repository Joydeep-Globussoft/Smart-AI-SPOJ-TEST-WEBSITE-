// CreateTestModal.jsx — Standalone Reusable Create Test Modal
// Implements PRD Section 9.2, Section 11.2 (FR-2.1, FR-2.2, FR-2.3), Section 12.1, FEATURE-012/013 Consolidation
// Preserves BUG-60 (auto-derived read-only Total Questions & passing criteria validation)
// FEATURE-025: Searchable combobox for Question Folder selection with live filtering & keyboard navigation
import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import api from '../services/apiClient';

const TEST_TYPES = [
  { value: 'SPOJ', label: 'SPOJ (DSA / Competitive Coding)' },
  { value: 'JAVASCRIPT', label: 'JavaScript' },
  { value: 'REACT', label: 'React.js' },
  { value: 'AI_TEST', label: 'AI Test (Kimi Assisted)' },
];

const PROGRAMMING_LANGUAGES = ['python', 'java', 'cpp', 'c', 'javascript', 'react'];

const INITIAL_FORM_STATE = {
  title: '',
  testType: 'SPOJ',
  folderId: '',
  durationMinutes: 90,
  totalQuestions: 0,
  passingCriteria: 0,
  startTestWindowMinutes: 10,
  supportedLanguages: ['python', 'java', 'cpp', 'javascript'],
  instructions:
    '1. Carefully read problem instructions, and code using the specified language.\n' +
    '2. Thoroughly test your code with sample cases before submitting.\n' +
    '3. Avoid plagiarism and unauthorized collaboration; maintain integrity.\n' +
    '4. Manage your time wisely among questions and monitor the clock.\n' +
    '5. Ensure you answer the respective Set that will be assigned to you.\n' +
    '6. Submit your solutions before the deadline, and remember to follow any offline instructions provided.',
};

export default function CreateTestModal({
  isOpen,
  onClose,
  onSuccess,
}) {
  const [folders, setFolders] = useState([]);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);

  // FEATURE-025: Searchable combobox state
  const [folderSearchText, setFolderSearchText] = useState('');
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const [highlightedFolderIndex, setHighlightedFolderIndex] = useState(-1);
  const folderComboboxRef = useRef(null);
  const folderInputRef = useRef(null);
  const dropdownListRef = useRef(null);

  const fetchFolderData = useCallback(async () => {
    try {
      const poolRes = await api.getQuestionPools().catch(() => ({ data: { pools: [] } }));
      setFolders(poolRes.data?.pools || []);
    } catch (err) {
      console.error('Failed to fetch folders in CreateTestModal:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchFolderData();
    }
  }, [isOpen, fetchFolderData]);

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

  const handleClose = () => {
    if (creating) return;
    setFormData(INITIAL_FORM_STATE);
    setFolderSearchText('');
    setIsFolderDropdownOpen(false);
    setHighlightedFolderIndex(-1);
    if (onClose) onClose();
  };

  const filteredFolders = folders.filter(
    (f) => !formData.testType || f.testType === formData.testType
  );

  const selectedFolder = folders.find((f) => f.poolId === formData.folderId);

  // Synchronize input display text with selected folder
  useEffect(() => {
    if (selectedFolder) {
      setFolderSearchText(selectedFolder.poolName);
    } else if (!formData.folderId) {
      setFolderSearchText('');
    }
  }, [formData.folderId, selectedFolder]);

  // FEATURE-025: Close dropdown and revert on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (folderComboboxRef.current && !folderComboboxRef.current.contains(e.target)) {
        setIsFolderDropdownOpen(false);
        setHighlightedFolderIndex(-1);
        if (selectedFolder) {
          setFolderSearchText(selectedFolder.poolName);
        } else {
          setFolderSearchText('');
        }
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, selectedFolder]);

  // FEATURE-025: Live search filter
  const searchedFolders = filteredFolders.filter((f) => {
    if (!folderSearchText.trim()) return true;
    if (selectedFolder && folderSearchText === selectedFolder.poolName) return true;
    return f.poolName.toLowerCase().includes(folderSearchText.trim().toLowerCase());
  });

  const handleSelectFolder = (folder) => {
    const qCount = folder && folder.isValid ? (folder.questionCount || 0) : 0;
    setFormData((prev) => ({
      ...prev,
      folderId: folder.poolId,
      totalQuestions: qCount,
      passingCriteria: prev.passingCriteria > qCount ? qCount : prev.passingCriteria,
    }));
    setFolderSearchText(folder.poolName);
    setIsFolderDropdownOpen(false);
    setHighlightedFolderIndex(-1);
  };

  const handleClearFolder = (e) => {
    e.stopPropagation();
    setFormData((prev) => ({
      ...prev,
      folderId: '',
      totalQuestions: 0,
      passingCriteria: 0,
    }));
    setFolderSearchText('');
    setIsFolderDropdownOpen(true);
    setHighlightedFolderIndex(-1);
    if (folderInputRef.current) {
      folderInputRef.current.focus();
    }
  };

  const handleFolderKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isFolderDropdownOpen) {
        setIsFolderDropdownOpen(true);
        setHighlightedFolderIndex(0);
      } else if (searchedFolders.length > 0) {
        setHighlightedFolderIndex((prev) => (prev < searchedFolders.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isFolderDropdownOpen && searchedFolders.length > 0) {
        setHighlightedFolderIndex((prev) => (prev > 0 ? prev - 1 : searchedFolders.length - 1));
      }
    } else if (e.key === 'Enter') {
      if (isFolderDropdownOpen) {
        e.preventDefault();
        if (highlightedFolderIndex >= 0 && searchedFolders[highlightedFolderIndex]) {
          handleSelectFolder(searchedFolders[highlightedFolderIndex]);
        } else if (searchedFolders.length === 1) {
          handleSelectFolder(searchedFolders[0]);
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsFolderDropdownOpen(false);
      setHighlightedFolderIndex(-1);
      if (selectedFolder) {
        setFolderSearchText(selectedFolder.poolName);
      } else {
        setFolderSearchText('');
      }
    } else if (e.key === 'Tab') {
      setIsFolderDropdownOpen(false);
      setHighlightedFolderIndex(-1);
      if (selectedFolder) {
        setFolderSearchText(selectedFolder.poolName);
      } else {
        setFolderSearchText('');
      }
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (isFolderDropdownOpen && dropdownListRef.current && highlightedFolderIndex >= 0) {
      const activeEl = dropdownListRef.current.children[highlightedFolderIndex];
      if (activeEl && typeof activeEl.scrollIntoView === 'function') {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedFolderIndex, isFolderDropdownOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      return toast.error('Test title is required');
    }

    if (!formData.folderId) {
      return toast.error('Please select a Question Folder');
    }
    if (!selectedFolder || !selectedFolder.isValid) {
      return toast.error(selectedFolder?.validationError || 'Selected Question Folder is invalid');
    }
    if (!formData.totalQuestions || formData.totalQuestions <= 0) {
      return toast.error('Selected folder contains 0 questions per set');
    }

    if (!formData.durationMinutes || formData.durationMinutes <= 0) {
      return toast.error('Duration must be greater than 0');
    }
    if (formData.passingCriteria < 0) {
      return toast.error('Passing criteria cannot be negative');
    }
    if (formData.passingCriteria > formData.totalQuestions) {
      return toast.error(`Passing criteria (${formData.passingCriteria}) cannot exceed Total Questions (${formData.totalQuestions})`);
    }

    try {
      setCreating(true);
      const payload = {
        ...formData,
        folderId: formData.folderId,
        questionSetPoolId: formData.folderId, // Backward compatibility alias
      };

      const res = await api.createTest(payload);
      toast.success('Test created successfully (Status: DRAFT)');
      const createdTest = res.data.test;
      setFormData(INITIAL_FORM_STATE);
      if (onSuccess) {
        onSuccess(createdTest);
      } else if (onClose) {
        onClose();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create test');
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal-container" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Create New Test</h3>
          <button
            type="button"
            onClick={handleClose}
            style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--color-text-muted)' }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
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

            {/* Test Type & Question Folder Selection */}
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
                      folderId: '',
                      totalQuestions: 0,
                      passingCriteria: 0,
                    }));
                    setFolderSearchText('');
                    setIsFolderDropdownOpen(false);
                    setHighlightedFolderIndex(-1);
                  }}
                  required
                >
                  {TEST_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              {/* FEATURE-025: Searchable Combobox for Question Folder */}
              <div className="form-group" ref={folderComboboxRef} style={{ position: 'relative' }}>
                <label className="form-label" htmlFor="create-test-folder-input">Question Folder *</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="create-test-folder-input"
                    ref={folderInputRef}
                    type="text"
                    className="form-control"
                    placeholder="Select a Question Folder..."
                    value={folderSearchText}
                    onFocus={() => setIsFolderDropdownOpen(true)}
                    onClick={() => setIsFolderDropdownOpen(true)}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFolderSearchText(val);
                      setIsFolderDropdownOpen(true);
                      setHighlightedFolderIndex(0);
                      if (val === '') {
                        setFormData((prev) => ({
                          ...prev,
                          folderId: '',
                          totalQuestions: 0,
                          passingCriteria: 0,
                        }));
                      }
                    }}
                    onKeyDown={handleFolderKeyDown}
                    autoComplete="off"
                    style={{
                      paddingRight: formData.folderId || folderSearchText ? '60px' : '36px',
                      cursor: 'text',
                    }}
                  />

                  {/* Combobox Action Icons (Clear + Toggle) */}
                  <div
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {(formData.folderId || folderSearchText) && (
                      <button
                        type="button"
                        onClick={handleClearFolder}
                        title="Clear selection"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--color-text-muted, #94a3b8)',
                          cursor: 'pointer',
                          padding: '2px 4px',
                          fontSize: '0.85rem',
                          lineHeight: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '4px',
                        }}
                      >
                        ✕
                      </button>
                    )}
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsFolderDropdownOpen((prev) => !prev);
                        if (!isFolderDropdownOpen && folderInputRef.current) {
                          folderInputRef.current.focus();
                        }
                      }}
                      title={isFolderDropdownOpen ? 'Close list' : 'Open list'}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-text-muted, #64748b)',
                        cursor: 'pointer',
                        padding: '2px 4px',
                        fontSize: '0.75rem',
                        lineHeight: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isFolderDropdownOpen ? '▲' : '▼'}
                    </button>
                  </div>
                </div>

                {/* Dropdown Menu */}
                {isFolderDropdownOpen && (
                  <div
                    ref={dropdownListRef}
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      right: 0,
                      zIndex: 1050,
                      background: 'var(--color-bg-card, #ffffff)',
                      border: '1.5px solid var(--color-border, #cbd5e1)',
                      borderRadius: '8px',
                      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                      maxHeight: '240px',
                      overflowY: 'auto',
                    }}
                  >
                    {filteredFolders.length === 0 ? (
                      <div style={{ padding: '12px 14px', fontSize: '0.85rem', color: '#e74c3c' }}>
                        No Folders found for {formData.testType}. Create a folder in Question Bank first.
                      </div>
                    ) : searchedFolders.length === 0 ? (
                      <div style={{ padding: '12px 14px', fontSize: '0.85rem', color: 'var(--color-text-muted, #64748b)', textAlign: 'center' }}>
                        🔍 No folders found matching "{folderSearchText}"
                      </div>
                    ) : (
                      searchedFolders.map((f, index) => {
                        const isSelected = f.poolId === formData.folderId;
                        const isHighlighted = index === highlightedFolderIndex;
                        return (
                          <div
                            key={f.poolId}
                            onClick={() => handleSelectFolder(f)}
                            onMouseEnter={() => setHighlightedFolderIndex(index)}
                            style={{
                              padding: '10px 12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              background: isSelected
                                ? 'rgba(14, 124, 134, 0.12)'
                                : isHighlighted
                                ? 'var(--color-bg-subtle, #f8fafc)'
                                : 'transparent',
                              borderBottom: index < searchedFolders.length - 1 ? '1px solid #f1f5f9' : 'none',
                              transition: 'background 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: '1rem', flexShrink: 0 }}>📁</span>
                              <span
                                style={{
                                  fontSize: '0.875rem',
                                  fontWeight: isSelected ? 600 : 500,
                                  color: isSelected ? 'var(--color-primary, #0e7c86)' : 'var(--color-navy, #1e293b)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                title={f.poolName}
                              >
                                {f.poolName}
                              </span>
                            </div>
                            <span
                              style={{
                                fontSize: '0.75rem',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                flexShrink: 0,
                                fontWeight: 500,
                                background: f.isValid ? 'rgba(14, 124, 134, 0.08)' : '#fee2e2',
                                color: f.isValid ? 'var(--color-primary, #0e7c86)' : '#991b1b',
                                border: f.isValid ? '1px solid rgba(14, 124, 134, 0.2)' : '1px solid #fca5a5',
                              }}
                            >
                              {f.setCount} {f.setCount === 1 ? 'Set' : 'Sets'}
                              {f.isValid ? `, ${f.questionCount} Qs each` : ' — Mismatched Counts'}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {filteredFolders.length === 0 ? (
                  <p style={{ fontSize: '0.75rem', color: '#E74C3C', marginTop: 4 }}>
                    No Folders found for {formData.testType}. Create a folder in Question Bank first.
                  </p>
                ) : selectedFolder && !selectedFolder.isValid ? (
                  <div style={{ marginTop: 6, padding: '8px 10px', background: '#fee2e2', border: '1px solid #ef4444', borderRadius: 6 }}>
                    <p style={{ fontSize: '0.75rem', color: '#991b1b', margin: 0, lineHeight: 1.4 }}>
                      ⚠️ {selectedFolder.validationError}
                    </p>
                  </div>
                ) : selectedFolder && selectedFolder.isValid ? (
                  <div style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(14, 124, 134, 0.12)', border: '1px solid var(--color-primary)', borderRadius: 6 }}>
                    {selectedFolder.setCount === 1 ? (
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-primary)', margin: 0, fontWeight: 600 }}>
                        ✓ Folder contains 1 Question Set ({selectedFolder.questionCount} Qs).
                      </p>
                    ) : (
                      <p style={{ fontSize: '0.75rem', color: 'var(--color-primary)', margin: 0, fontWeight: 600 }}>
                        ✓ Folder contains {selectedFolder.setCount} Question Sets ({selectedFolder.questionCount} Qs each).
                      </p>
                    )}
                  </div>
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

                </div>
                <input
                  type="number"
                  name="totalQuestions"
                  className="form-control"
                  value={formData.totalQuestions}
                  disabled
                  readOnly
                  style={{
                    backgroundColor: 'var(--color-bg-subtle)',
                    cursor: 'not-allowed',
                    color: 'var(--color-text-muted)',
                    fontWeight: 600,
                  }}
                />

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
              <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                Room passwords expire after this window from room creation.
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
                          ? '1.5px solid var(--color-primary)'
                          : '1.5px solid var(--color-border)',
                        background: formData.supportedLanguages.includes(lang)
                          ? 'rgba(14, 124, 134, 0.15)'
                          : 'var(--color-bg-card)',
                        color: 'var(--color-text)',
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
              onClick={handleClose}
              className="btn btn-secondary"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={creating || (selectedFolder && !selectedFolder.isValid) || !formData.folderId}
            >
              {creating ? 'Creating...' : 'Create Test (Draft)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
