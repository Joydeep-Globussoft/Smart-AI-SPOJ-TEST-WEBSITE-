// CreateTestModal.jsx — Standalone Reusable Create Test Modal
// Implements PRD Section 9.2, Section 11.2 (FR-2.1, FR-2.2, FR-2.3), Section 12.1, FEATURE-012
// Preserves BUG-60 (auto-derived read-only Total Questions & passing criteria validation)
import React, { useState, useEffect, useCallback } from 'react';
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
  questionSetId: '',
  questionSetPoolId: '',
  durationMinutes: 90,
  totalQuestions: 0,
  passingCriteria: 0,
  startTestWindowMinutes: 10,
  supportedLanguages: ['python', 'java', 'cpp', 'javascript'],
  instructions: '1. Maintain full-screen mode throughout the test.\n2. Do not switch tabs or use secondary monitors.\n3. Keep your webcam on and ensure your face is clearly visible.\n4. Mobile phones and electronic gadgets are strictly prohibited.',
};

export default function CreateTestModal({
  isOpen,
  onClose,
  onSuccess,
  questionSets: propQuestionSets,
}) {
  const [internalQuestionSets, setInternalQuestionSets] = useState([]);
  const [pools, setPools] = useState([]);
  const [questionMode, setQuestionMode] = useState('SINGLE'); // 'SINGLE' | 'POOL' (FEATURE-012)
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);

  const fetchQuestionData = useCallback(async () => {
    try {
      const [qsRes, poolRes] = await Promise.all([
        api.getQuestionSets().catch(() => ({ data: { questionSets: [] } })),
        api.getQuestionPools().catch(() => ({ data: { pools: [] } })),
      ]);
      setInternalQuestionSets(qsRes.data?.questionSets || []);
      setPools(poolRes.data?.pools || []);
    } catch (err) {
      console.error('Failed to fetch question sets or pools in CreateTestModal:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchQuestionData();
    }
  }, [isOpen, fetchQuestionData]);

  const availableQuestionSets = (propQuestionSets && propQuestionSets.length > 0)
    ? propQuestionSets
    : internalQuestionSets;

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
    setQuestionMode('SINGLE');
    if (onClose) onClose();
  };

  const filteredPools = pools.filter(
    (p) => !formData.testType || p.testType === formData.testType
  );

  const selectedPool = pools.find((p) => p.poolId === formData.questionSetPoolId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      return toast.error('Test title is required');
    }

    if (questionMode === 'POOL') {
      if (!formData.questionSetPoolId) {
        return toast.error('Please select a Question Set Pool');
      }
      if (!selectedPool || !selectedPool.isValid) {
        return toast.error(selectedPool?.validationError || 'Selected Question Set Pool is invalid');
      }
      if (!formData.totalQuestions || formData.totalQuestions <= 0) {
        return toast.error('Selected pool contains 0 questions per set');
      }
    } else {
      if (!formData.questionSetId) {
        return toast.error('Please select a Question Set');
      }
      const selectedQs = availableQuestionSets.find((qs) => qs._id === formData.questionSetId);
      const qCount = selectedQs ? (selectedQs.questionCount ?? selectedQs.questionIds?.length ?? 0) : formData.totalQuestions;
      if (qCount <= 0) {
        return toast.error('Selected Question Set contains 0 questions. Please add questions before creating a test.');
      }
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
        questionSetId: questionMode === 'SINGLE' ? formData.questionSetId : null,
        questionSetPoolId: questionMode === 'POOL' ? formData.questionSetPoolId : null,
      };

      const res = await api.createTest(payload);
      toast.success('Test created successfully (Status: DRAFT)');
      const createdTest = res.data.test;
      setFormData(INITIAL_FORM_STATE);
      setQuestionMode('SINGLE');
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

  const filteredQuestionSets = availableQuestionSets.filter(
    (qs) => !formData.testType || qs.testType === formData.testType
  );

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

            {/* Test Type & Question Bank Selection */}
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
                      questionSetPoolId: '',
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
                {/* Question Set Mode Switcher (FEATURE-012) */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="form-label" style={{ marginBottom: 0 }}>
                    {questionMode === 'POOL' ? 'Question Set Pool *' : 'Question Set *'}
                  </label>
                  <div style={{ display: 'inline-flex', background: 'var(--color-bg-subtle)', borderRadius: 6, padding: 2 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setQuestionMode('SINGLE');
                        setFormData((p) => ({
                          ...p,
                          questionSetPoolId: '',
                          questionSetId: '',
                          totalQuestions: 0,
                          passingCriteria: 0,
                        }));
                      }}
                      style={{
                        padding: '2px 8px',
                        fontSize: '0.72rem',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontWeight: 600,
                        background: questionMode === 'SINGLE' ? 'var(--color-primary)' : 'transparent',
                        color: questionMode === 'SINGLE' ? '#ffffff' : 'var(--color-text-muted)',
                      }}
                    >
                      Single Set
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setQuestionMode('POOL');
                        setFormData((p) => ({
                          ...p,
                          questionSetId: '',
                          questionSetPoolId: '',
                          totalQuestions: 0,
                          passingCriteria: 0,
                        }));
                      }}
                      style={{
                        padding: '2px 8px',
                        fontSize: '0.72rem',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontWeight: 600,
                        background: questionMode === 'POOL' ? 'var(--color-primary)' : 'transparent',
                        color: questionMode === 'POOL' ? '#ffffff' : 'var(--color-text-muted)',
                      }}
                    >
                      Pool (Folder)
                    </button>
                  </div>
                </div>

                {questionMode === 'SINGLE' ? (
                  <>
                    <select
                      name="questionSetId"
                      className="form-select"
                      value={formData.questionSetId}
                      onChange={(e) => {
                        const newSetId = e.target.value;
                        const selectedQs = availableQuestionSets.find((qs) => qs._id === newSetId);
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
                  </>
                ) : (
                  <>
                    <select
                      name="questionSetPoolId"
                      className="form-select"
                      value={formData.questionSetPoolId}
                      onChange={(e) => {
                        const newPoolId = e.target.value;
                        const p = pools.find((item) => item.poolId === newPoolId);
                        const qCount = p && p.isValid ? (p.questionCount || 0) : 0;
                        setFormData((prev) => ({
                          ...prev,
                          questionSetPoolId: newPoolId,
                          totalQuestions: qCount,
                          passingCriteria: prev.passingCriteria > qCount ? qCount : prev.passingCriteria,
                        }));
                      }}
                      required
                    >
                      <option value="">Select Folder as Question Set Pool...</option>
                      {filteredPools.map((p) => (
                        <option key={p.poolId} value={p.poolId}>
                          📁 {p.poolName} ({p.setCount} Sets{p.isValid ? `, ${p.questionCount} Qs each` : ' — Mismatched Counts'})
                        </option>
                      ))}
                    </select>
                    {filteredPools.length === 0 ? (
                      <p style={{ fontSize: '0.75rem', color: '#E74C3C', marginTop: 4 }}>
                        No Folders found for {formData.testType}. Create a folder in Question Bank first.
                      </p>
                    ) : selectedPool && !selectedPool.isValid ? (
                      <div style={{ marginTop: 6, padding: '8px 10px', background: '#fee2e2', border: '1px solid #ef4444', borderRadius: 6 }}>
                        <p style={{ fontSize: '0.75rem', color: '#991b1b', margin: 0, lineHeight: 1.4 }}>
                          ⚠️ {selectedPool.validationError}
                        </p>
                      </div>
                    ) : selectedPool && selectedPool.isValid ? (
                      <div style={{ marginTop: 6, padding: '6px 10px', background: 'rgba(14, 124, 134, 0.12)', border: '1px solid var(--color-primary)', borderRadius: 6 }}>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-primary)', margin: 0, fontWeight: 600 }}>
                          ✓ Valid Pool: {selectedPool.setCount} Question Sets ({selectedPool.questionCount} Qs each) rotating round-robin per room.
                        </p>
                        {selectedPool.setCount === 1 && (
                          <p style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', margin: '4px 0 0 0' }}>
                            ℹ️ Note: Folder contains only 1 set. All candidates in each room will receive the same questions.
                          </p>
                        )}
                      </div>
                    ) : null}
                  </>
                )}
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
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
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
                    backgroundColor: 'var(--color-bg-subtle)',
                    cursor: 'not-allowed',
                    color: 'var(--color-text-muted)',
                    fontWeight: 600,
                  }}
                />
                <small style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem', display: 'block', marginTop: 2 }}>
                  {questionMode === 'POOL'
                    ? `Locked to Pool's shared count (${formData.totalQuestions} Qs).`
                    : `Locked to Question Set's count (${formData.totalQuestions} Qs).`}
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
              <small style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
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
              disabled={creating || (questionMode === 'POOL' && selectedPool && !selectedPool.isValid)}
            >
              {creating ? 'Creating...' : 'Create Test (Draft)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
