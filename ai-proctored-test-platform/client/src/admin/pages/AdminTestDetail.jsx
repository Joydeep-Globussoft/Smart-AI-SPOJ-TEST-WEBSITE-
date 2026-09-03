// AdminTestDetail.jsx — Test Detail, Configuration & Room Management
// Implements PRD Section 9.2, 9.3, 11.2 (FR-2.1, FR-2.2, FR-2.3), 11.3 (FR-3.1, FR-3.2, FR-3.3)
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminNavbar from '../../shared/AdminNavbar';
import TestStatusBadge from '../../shared/TestStatusBadge';
import api from '../../services/apiClient';
import {
  initSocket,
  emitAdminJoin,
  onCandidateSubmitted,
  offCandidateSubmitted,
  onDashboardUpdate,
  offDashboardUpdate,
  onRoomUpdated,
  offRoomUpdated,
} from '../../services/socketClient';

const TEST_TYPES = [
  { value: 'SPOJ', label: 'SPOJ (DSA / Competitive Coding)' },
  { value: 'JAVASCRIPT', label: 'JavaScript' },
  { value: 'REACT', label: 'React.js' },
  { value: 'AI_TEST', label: 'AI Test (Kimi Assisted)' },
];

const PROGRAMMING_LANGUAGES = ['python', 'java', 'cpp', 'c', 'javascript', 'react'];

// Helper: format date and time (e.g. "3/9/2026 at 10:46 AM")
const formatDateTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const datePart = d.toLocaleDateString();
  const timePart = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${datePart} at ${timePart}`;
};

// Helper: calculate and format live duration (e.g. "1h 23m" or "45m")
const formatLiveDuration = (startDateStr, endDateStr) => {
  if (!startDateStr || !endDateStr) return null;
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  const diffMs = end - start;
  if (diffMs <= 0 || isNaN(diffMs)) return null;
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return '< 1m';
};

// BUG-35: Date-deduplication helpers for Live session header line
const isSameCalendarDay = (d1, d2) => {
  if (!d1 || !d2) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

const formatTimeOnly = (dateObj) => {
  return dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
};

const formatDateOnly = (dateObj) => {
  return dateObj.toLocaleDateString();
};

const getLiveSessionText = (test) => {
  if (!test?.liveStartedAt) return null;

  const startDate = new Date(test.liveStartedAt);
  const createdDate = new Date(test.createdAt);
  const isLive = test.status === 'LIVE';
  const isEnded = test.status === 'ENDED';

  if (!isLive && !isEnded) return null;

  if (isEnded) {
    if (!test.endedAt) return null;
    const endDate = new Date(test.endedAt);

    const sameDayLive = isSameCalendarDay(startDate, endDate);
    const sameDayCreated = isSameCalendarDay(startDate, createdDate);

    if (sameDayLive) {
      if (sameDayCreated) {
        // RULE A: Live session started and ended on same calendar day, AND same as created date
        return `Live: ${formatTimeOnly(startDate)} – ${formatTimeOnly(endDate)}`;
      } else {
        // RULE B: Live session started and ended on same calendar day, but DIFFERENT from created date
        return `Live: ${formatDateOnly(startDate)} | ${formatTimeOnly(startDate)} – ${formatTimeOnly(endDate)}`;
      }
    } else {
      // RULE C: Live session spans midnight / different calendar days
      return `Live: ${formatDateOnly(startDate)} | ${formatTimeOnly(startDate)} – ${formatDateOnly(endDate)} | ${formatTimeOnly(endDate)}`;
    }
  }

  if (isLive) {
    const sameDayCreated = isSameCalendarDay(startDate, createdDate);
    if (sameDayCreated) {
      return `Live: ${formatTimeOnly(startDate)} – now`;
    } else {
      return `Live: ${formatDateOnly(startDate)} | ${formatTimeOnly(startDate)} – now`;
    }
  }

  return null;
};

export default function AdminTestDetail() {
  const { testId } = useParams();
  const navigate = useNavigate();

  const [test, setTest] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dynamic Threshold States (FR-2.2, FR-2.3)
  const [passingCriteria, setPassingCriteria] = useState(3);
  const [updatingPassing, setUpdatingPassing] = useState(false);
  const [malpracticeThreshold, setMalpracticeThreshold] = useState('');
  const [updatingMalpractice, setUpdatingMalpractice] = useState(false);

  // Status Action Modals (Start / End Test)
  const [showStartModal, setShowStartModal] = useState(false);
  const [starting, setStarting] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [ending, setEnding] = useState(false);

  // Add Room Modal State (FR-3.1)
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [addingRoom, setAddingRoom] = useState(false);
  const [roomFormData, setRoomFormData] = useState({
    roomName: '',
    capacity: 50,
  });

  // Room Candidates View Modal
  const [selectedRoomCandidates, setSelectedRoomCandidates] = useState(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // Edit Configuration Modal State (BUG-36, BUG-38)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingConfig, setEditingConfig] = useState(false);
  const [questionSets, setQuestionSets] = useState([]);
  const [editFormData, setEditFormData] = useState({
    title: '',
    testType: 'SPOJ',
    questionSetId: '',
    durationMinutes: 90,
    totalQuestions: 5,
    startTestWindowMinutes: 10,
    supportedLanguages: ['python', 'java', 'cpp', 'javascript'],
    instructions: '',
  });

  // Fetch Test Details & Rooms
  const fetchTestAndRooms = useCallback(async () => {
    try {
      setLoading(true);
      const [testRes, roomsRes, qsRes] = await Promise.all([
        api.getTest(testId),
        api.getRooms(testId),
        api.getQuestionSets().catch(() => ({ data: { questionSets: [] } })),
      ]);
      const fetchedTest = testRes.data.test;
      setTest(fetchedTest);
      setPassingCriteria(fetchedTest.passingCriteria || 0);
      setMalpracticeThreshold(
        fetchedTest.malpracticeDisqualifyThreshold !== null &&
        fetchedTest.malpracticeDisqualifyThreshold !== undefined
          ? fetchedTest.malpracticeDisqualifyThreshold
          : ''
      );
      setRooms(roomsRes.data.rooms || []);
      setQuestionSets(qsRes.data?.questionSets || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load test details');
    } finally {
      setLoading(false);
    }
  }, [testId]);

  useEffect(() => {
    fetchTestAndRooms();
  }, [fetchTestAndRooms]);

  // Real-time Socket sync & live refresh for Room Candidates Modal
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !testId) return;

    initSocket(token);
    emitAdminJoin({ testId });

    const refreshRoster = () => {
      if (selectedRoomCandidates?.room?._id) {
        api.getRoomCandidates(selectedRoomCandidates.room._id)
          .then((res) => {
            setSelectedRoomCandidates((prev) => (prev ? { ...prev, list: res.data.candidates || [] } : prev));
          })
          .catch(() => {});
      }
    };

    onCandidateSubmitted(refreshRoster);
    onDashboardUpdate(refreshRoster);
    onRoomUpdated(() => {
      fetchTestAndRooms();
      refreshRoster();
    });

    return () => {
      offCandidateSubmitted(refreshRoster);
      offDashboardUpdate(refreshRoster);
      offRoomUpdated();
    };
  }, [testId, selectedRoomCandidates?.room?._id, fetchTestAndRooms]);

  // Polling fallback when Room Candidates Modal is open (3s interval)
  useEffect(() => {
    if (!selectedRoomCandidates?.room?._id) return;
    const interval = setInterval(async () => {
      try {
        const res = await api.getRoomCandidates(selectedRoomCandidates.room._id);
        setSelectedRoomCandidates((prev) => (prev ? { ...prev, list: res.data.candidates || [] } : prev));
      } catch (_) {}
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedRoomCandidates?.room?._id]);

  // Handle Start Test (DRAFT -> LIVE)
  const handleStartTest = async () => {
    try {
      setStarting(true);
      const res = await api.startTest(testId);
      setTest(res.data.test);
      // Immediately refresh rooms to reflect the newly started passwordValidUntil windows
      const roomsRes = await api.getRooms(testId);
      setRooms(roomsRes.data.rooms || []);
      toast.success('Test is now LIVE! Candidates can join with room codes.');
      setShowStartModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start test');
    } finally {
      setStarting(false);
    }
  };

  // Handle End Test (LIVE -> ENDED)
  const handleEndTest = async () => {
    try {
      setEnding(true);
      const res = await api.endTest(testId);
      setTest(res.data.test);
      toast.success('Test ENDED. Final evaluation worker triggered.');
      setShowEndModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to end test');
    } finally {
      setEnding(false);
    }
  };

  // Handle Passing Criteria Update (FR-2.2)
  const handleUpdatePassingCriteria = async (e) => {
    e.preventDefault();
    if (passingCriteria < 0) {
      return toast.error('Passing criteria cannot be negative');
    }
    try {
      setUpdatingPassing(true);
      const res = await api.updatePassingCriteria(testId, { passingCriteria: Number(passingCriteria) });
      setTest(res.data.test);
      toast.success('Passing criteria updated (Shortlist auto-recalculated)');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update passing criteria');
    } finally {
      setUpdatingPassing(false);
    }
  };

  // Handle Malpractice Threshold Update (FR-2.3, FR-7.5)
  const handleUpdateMalpracticeThreshold = async (e) => {
    e.preventDefault();
    if (test?.status !== 'ENDED') {
      return toast.error('Malpractice threshold can only be set after test has ENDED');
    }
    try {
      setUpdatingMalpractice(true);
      const val = malpracticeThreshold === '' ? null : Number(malpracticeThreshold);
      const res = await api.updateMalpracticeThreshold(testId, {
        malpracticeDisqualifyThreshold: val,
      });
      setTest(res.data.test);
      toast.success('Malpractice threshold updated & shortlist re-filtered');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update malpractice threshold');
    } finally {
      setUpdatingMalpractice(false);
    }
  };

  // Handle Add Room (FR-3.1)
  const handleAddRoomSubmit = async (e) => {
    e.preventDefault();
    if (!roomFormData.roomName.trim()) {
      return toast.error('Room name is required');
    }
    try {
      setAddingRoom(true);
      const res = await api.createRoom(testId, {
        roomName: roomFormData.roomName.trim(),
        capacity: roomFormData.capacity ? Number(roomFormData.capacity) : undefined,
      });
      toast.success(`Created room "${res.data.room?.roomName}"`);
      setShowAddRoomModal(false);
      setRoomFormData({ roomName: '', capacity: 50 });
      // Refresh rooms list
      const roomsRes = await api.getRooms(testId);
      setRooms(roomsRes.data.rooms || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create room');
    } finally {
      setAddingRoom(false);
    }
  };

  // Handle Delete / Close Room (FR-3.2)
  const handleDeleteRoom = async (roomId, roomName) => {
    if (!window.confirm(`Are you sure you want to close "${roomName}"? New candidates won't be able to join, but active candidates will continue.`)) {
      return;
    }
    try {
      await api.deleteRoom(roomId);
      toast.success(`Closed room "${roomName}"`);
      const roomsRes = await api.getRooms(testId);
      setRooms(roomsRes.data.rooms || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to close room');
    }
  };

  // ── BUG-36, BUG-38, BUG-39: Edit Configuration Handlers ───────────────────
  const handleOpenEditModal = async () => {
    if (test?.status !== 'DRAFT') return;
    const qsId = test?.questionSetId?._id || test?.questionSetId || '';
    setEditFormData({
      title: test?.title || '',
      testType: test?.testType || 'SPOJ',
      questionSetId: qsId,
      durationMinutes: test?.durationMinutes ?? 90,
      totalQuestions: test?.totalQuestions ?? 5,
      startTestWindowMinutes: test?.startTestWindowMinutes ?? 10,
      supportedLanguages: Array.isArray(test?.supportedLanguages) && test.supportedLanguages.length > 0
        ? [...test.supportedLanguages]
        : ['python', 'java', 'cpp', 'javascript'],
      instructions: test?.instructions || '',
    });
    setShowEditModal(true);
    if (questionSets.length === 0) {
      try {
        const res = await api.getQuestionSets();
        setQuestionSets(res.data?.questionSets || []);
      } catch (err) {
        console.error('Failed to load question sets:', err);
      }
    }
  };

  const handleEditTestTypeChange = (e) => {
    if (test?.status !== 'DRAFT') return;
    const newType = e.target.value;
    setEditFormData((prev) => ({
      ...prev,
      testType: newType,
      questionSetId: '', // Reset question set because old set is not valid for new testType
    }));
  };

  const handleEditLanguageToggle = (lang) => {
    if (test?.status !== 'DRAFT') return;
    setEditFormData((prev) => {
      const exists = prev.supportedLanguages.includes(lang);
      const updated = exists
        ? prev.supportedLanguages.filter((l) => l !== lang)
        : [...prev.supportedLanguages, lang];
      return { ...prev, supportedLanguages: updated };
    });
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    if (test?.status !== 'DRAFT') {
      return toast.error('Editing is only allowed while the test is in DRAFT status');
    }
    if (!editFormData.title.trim()) {
      return toast.error('Test title is required');
    }
    if (!editFormData.questionSetId) {
      return toast.error('Please select a Question Set');
    }
    if (!editFormData.durationMinutes || Number(editFormData.durationMinutes) <= 0) {
      return toast.error('Duration must be greater than 0');
    }
    if (editFormData.totalQuestions && Number(editFormData.totalQuestions) <= 0) {
      return toast.error('Total questions must be greater than 0');
    }
    if (!editFormData.startTestWindowMinutes || Number(editFormData.startTestWindowMinutes) <= 0) {
      return toast.error('Join window must be greater than 0');
    }
    if (!editFormData.supportedLanguages || editFormData.supportedLanguages.length === 0) {
      return toast.error('Please select at least one supported language');
    }
    if (!editFormData.instructions.trim()) {
      return toast.error('Candidate instructions are required');
    }

    try {
      setEditingConfig(true);
      const payload = {
        title: editFormData.title.trim(),
        testType: editFormData.testType,
        questionSetId: editFormData.questionSetId,
        durationMinutes: Number(editFormData.durationMinutes),
        totalQuestions: editFormData.totalQuestions ? Number(editFormData.totalQuestions) : 5,
        startTestWindowMinutes: Number(editFormData.startTestWindowMinutes),
        supportedLanguages: editFormData.supportedLanguages,
        instructions: editFormData.instructions.trim(),
      };

      const res = await api.updateTest(testId, payload);
      setTest(res.data.test);
      toast.success('Test configuration updated successfully');
      setShowEditModal(false);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update test configuration');
    } finally {
      setEditingConfig(false);
    }
  };

  // View Candidates in Room
  const handleViewRoomCandidates = async (room) => {
    try {
      setSelectedRoomCandidates({ room, list: [] });
      setLoadingCandidates(true);
      const res = await api.getRoomCandidates(room._id);
      setSelectedRoomCandidates({ room, list: res.data.candidates || [] });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to fetch candidates');
      setSelectedRoomCandidates(null);
    } finally {
      setLoadingCandidates(false);
    }
  };

  // Copy helper
  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

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

  if (!test) {
    return (
      <div className="app-layout">
        <AdminNavbar />
        <main className="main-content">
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <h3>Test not found</h3>
            <Link to="/admin/tests" className="btn btn-primary" style={{ marginTop: 16 }}>
              Back to Tests
            </Link>
          </div>
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
          <span style={{ color: '#4b5563', fontWeight: 600 }}>{test.title}</span>
        </div>

        {/* Top Header Card */}
        <div className="card" style={{ marginBottom: 24, padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.7rem', color: '#1A2B3C', fontWeight: 800 }}>{test.title}</h1>
                <TestStatusBadge
                  status={test.status}
                  style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                />
                <span
                  className="badge"
                  style={{
                    background: 'rgba(14, 124, 134, 0.1)',
                    color: '#0E7C86',
                    border: '1px solid rgba(14, 124, 134, 0.3)',
                    fontSize: '0.8rem',
                    padding: '4px 10px',
                  }}
                >
                  {test.testType}
                </span>
              </div>
              <div style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div>
                  Created by <strong>{test.createdBy?.name || 'Admin'}</strong> on{' '}
                  {new Date(test.createdAt).toLocaleDateString()}
                </div>

                {(test.status === 'LIVE' || test.status === 'ENDED') && getLiveSessionText(test) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span>{getLiveSessionText(test)}</span>

                    {test.status === 'ENDED' && formatLiveDuration(test.liveStartedAt, test.endedAt) && (
                      <span
                        className="badge"
                        style={{
                          background: '#f1f5f9',
                          color: '#475569',
                          border: '1px solid #e2e8f0',
                          fontSize: '0.75rem',
                          padding: '2px 8px',
                          fontWeight: 600,
                        }}
                      >
                        ⏱️ Live for {formatLiveDuration(test.liveStartedAt, test.endedAt)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Status Control Actions */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              {test.status === 'DRAFT' && (
                <button
                  onClick={() => setShowStartModal(true)}
                  className="btn btn-primary"
                  style={{ background: '#2ECC71', border: 'none' }}
                >
                  🚀 Start Test (Make LIVE)
                </button>
              )}

              {test.status === 'LIVE' && (
                <>
                  <Link
                    to={`/admin/tests/${test._id}/live`}
                    className="btn btn-primary"
                    style={{ background: '#0E7C86' }}
                  >
                    📊 Open Live Dashboard
                  </Link>
                  <button
                    onClick={() => setShowEndModal(true)}
                    className="btn btn-danger"
                  >
                    ⏹ End Test
                  </button>
                </>
              )}

              {test.status === 'ENDED' && (
                <Link
                  to={`/admin/tests/${test._id}/results`}
                  className="btn btn-primary"
                >
                  🏆 View Results &amp; Shortlist
                </Link>
              )}
            </div>
          </div>
        </div>



        {/* 2-Column Grid: Config / Dynamic Thresholds & Room Management */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(360px, 1.3fr)', gap: 24 }}>
          
          {/* Column 1: Test Config & Dynamic Thresholds */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            
            {/* Dynamic Passing Criteria Card (FR-2.2) */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Passing Criteria (FR-2.2)</h3>
                <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>Editable Anytime</span>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: 16 }}>
                Number of questions a candidate must solve to pass. Changing this will <strong>automatically recalculate the shortlist</strong>.
              </p>
              <form onSubmit={handleUpdatePassingCriteria} style={{ display: 'flex', gap: 12 }}>
                <input
                  type="number"
                  className="form-control"
                  style={{ width: 100 }}
                  min="0"
                  max="50"
                  value={passingCriteria}
                  onChange={(e) => setPassingCriteria(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="btn btn-secondary"
                  disabled={updatingPassing}
                >
                  {updatingPassing ? 'Updating...' : 'Update Criteria'}
                </button>
              </form>
            </div>

            {/* Dynamic Malpractice Threshold Card (FR-2.3, FR-7.5) */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Malpractice Disqualification Threshold (FR-2.3)</h3>
                <span className={`badge ${test.status === 'ENDED' ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '0.7rem' }}>
                  {test.status === 'ENDED' ? 'Active' : 'Post-Test Only'}
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: 16 }}>
                Candidates with malpractice counts strictly exceeding this threshold will be excluded from the shortlist.
                <em> (Can only be set after test is ENDED).</em>
              </p>
              <form onSubmit={handleUpdateMalpracticeThreshold} style={{ display: 'flex', gap: 12 }}>
                <input
                  type="number"
                  className="form-control"
                  style={{ width: 100 }}
                  min="0"
                  placeholder="None"
                  disabled={test.status !== 'ENDED'}
                  value={malpracticeThreshold}
                  onChange={(e) => setMalpracticeThreshold(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn-secondary"
                  disabled={test.status !== 'ENDED' || updatingMalpractice}
                >
                  {updatingMalpractice ? 'Updating...' : 'Set Threshold'}
                </button>
              </form>
              {test.status !== 'ENDED' && (
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: 8 }}>
                  🔒 Available when test status changes to ENDED.
                </p>
              )}
            </div>

            {/* Test Configuration Summary */}
            <div className="card">
              <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="card-title">Configuration Details</h3>
                {test?.status === 'DRAFT' && (
                  <button
                    type="button"
                    id="edit-config-btn"
                    onClick={handleOpenEditModal}
                    className="btn btn-secondary"
                    style={{
                      padding: '4px 12px',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      borderColor: '#cbd5e1',
                      fontWeight: 600,
                    }}
                  >
                    ✏️ Edit
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: 8 }}>
                  <span style={{ color: '#6b7280' }}>Question Set</span>
                  <span style={{ fontWeight: 600, color: '#1A2B3C' }}>
                    {test.questionSetId?.name || '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: 8 }}>
                  <span style={{ color: '#6b7280' }}>Duration</span>
                  <span style={{ fontWeight: 600, color: '#1A2B3C' }}>{test.durationMinutes} Minutes</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: 8 }}>
                  <span style={{ color: '#6b7280' }}>Total Questions</span>
                  <span style={{ fontWeight: 600, color: '#1A2B3C' }}>{test.totalQuestions}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: 8 }}>
                  <span style={{ color: '#6b7280' }}>Start Window</span>
                  <span style={{ fontWeight: 600, color: '#1A2B3C' }}>{test.startTestWindowMinutes} Minutes</span>
                </div>
                {test.supportedLanguages?.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f3f4f6', paddingBottom: 8 }}>
                    <span style={{ color: '#6b7280' }}>Languages</span>
                    <span style={{ fontWeight: 600, color: '#1A2B3C' }}>
                      {test.supportedLanguages.join(', ').toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <span style={{ color: '#6b7280', display: 'block', marginBottom: 6 }}>Instructions:</span>
                  <div
                    style={{
                      background: '#f9fafb',
                      padding: 12,
                      borderRadius: 6,
                      fontSize: '0.8rem',
                      whiteSpace: 'pre-line',
                      color: '#374151',
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    {test.instructions}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Physical Test Rooms Management (Section 9.3, 11.3) */}
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Physical Rooms ({rooms.length})</h3>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 2 }}>
                  Generate secure room codes &amp; passwords for physical test centers.
                </p>
              </div>
              {test?.status !== 'ENDED' && (
                <button
                  onClick={() => setShowAddRoomModal(true)}
                  className="btn btn-primary"
                  style={{ padding: '8px 14px', fontSize: '0.8rem' }}
                >
                  + Add Room
                </button>
              )}
            </div>

            {rooms.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: '#6b7280' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🏢</div>
                <h4 style={{ color: '#1A2B3C', marginBottom: 4 }}>No rooms added yet</h4>
                <p style={{ fontSize: '0.85rem', marginBottom: 16 }}>
                  Add physical test rooms to generate unique Room Codes and Passwords for candidates.
                </p>
                {test?.status !== 'ENDED' && (
                  <button
                    onClick={() => setShowAddRoomModal(true)}
                    className="btn btn-primary"
                    style={{ fontSize: '0.85rem' }}
                  >
                    + Add First Room
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {rooms.map((room) => {
                  const isLive = test?.status === 'LIVE';
                  const isEnded = test?.status === 'ENDED';
                  // BUG-22: Rooms in an ENDED test are closed by definition
                  const isClosed = room.status === 'CLOSED' || isEnded;
                  const isExpired = isLive && room.passwordValidUntil && new Date(room.passwordValidUntil) < new Date();

                  return (
                    <div
                      key={room._id}
                      style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: 10,
                        padding: 16,
                        background: isClosed ? '#f9fafb' : 'white',
                        opacity: isClosed ? 0.75 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div>
                          <strong style={{ fontSize: '1rem', color: '#1A2B3C' }}>{room.roomName}</strong>
                          {room.capacity && (
                            <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: 8 }}>
                              (Cap: {room.capacity})
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span
                            className={`badge ${isClosed ? 'badge-danger' : 'badge-success'}`}
                            style={{ fontSize: '0.7rem' }}
                          >
                            {isClosed ? 'CLOSED' : room.status}
                          </span>
                          {isLive && isExpired && !isClosed && (
                            <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>
                              Password Expired
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Credentials Box */}
                      <div
                        style={{
                          background: '#F7F9FA',
                          border: '1px solid #e5e7eb',
                          borderRadius: 8,
                          padding: 12,
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 12,
                          marginBottom: 12,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
                            Room Code
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <code style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0E7C86' }}>
                              {room.roomCode}
                            </code>
                            <button
                              onClick={() => copyToClipboard(room.roomCode, 'Room Code')}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                              title="Copy Code"
                            >
                              📋
                            </button>
                          </div>
                        </div>

                        <div>
                          <div style={{ fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', fontWeight: 600 }}>
                            Room Password
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <code style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1A2B3C' }}>
                              {room.roomPassword}
                            </code>
                            <button
                              onClick={() => copyToClipboard(room.roomPassword, 'Room Password')}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}
                              title="Copy Password"
                            >
                              📋
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Expiry Timestamp / Window Indicator (Requirement 3) */}
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: 12 }}>
                        {isLive && room.passwordValidUntil ? (
                          <>
                            Valid Until: {new Date(room.passwordValidUntil).toLocaleTimeString()} (
                            {new Date(room.passwordValidUntil).toLocaleDateString()})
                          </>
                        ) : isEnded ? (
                          <span>Test concluded</span>
                        ) : (
                          <span style={{ color: '#0E7C86', fontWeight: 600 }}>
                            ⏳ Window starts when test goes LIVE
                          </span>
                        )}
                      </div>

                      {/* Action Bar */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                        <button
                          onClick={() => {
                            const details = isLive && room.passwordValidUntil
                              ? `Globussoft Test: ${test.title}\nRoom: ${room.roomName}\nRoom Code: ${room.roomCode}\nPassword: ${room.roomPassword}\nValid Until: ${new Date(room.passwordValidUntil).toLocaleTimeString()}`
                              : `Globussoft Test: ${test.title}\nRoom: ${room.roomName}\nRoom Code: ${room.roomCode}\nPassword: ${room.roomPassword}\nAccess Window: Starts when test goes LIVE (${test?.startTestWindowMinutes || 10} mins validity)`;
                            copyToClipboard(details, 'Room Invite Credentials');
                          }}
                          className="btn btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                        >
                          📋 Copy Full Invite
                        </button>

                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            onClick={() => handleViewRoomCandidates(room)}
                            className="btn btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                          >
                            👥 Candidates
                          </button>
                          {!isClosed && (
                            <button
                              onClick={() => handleDeleteRoom(room._id, room.roomName)}
                              className="btn btn-danger"
                              style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                              title="Close Room (FR-3.2)"
                            >
                              Close Room
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Start Test Modal ── */}
        {showStartModal && (
          <div className="modal-backdrop" onClick={() => !starting && setShowStartModal(false)}>
            <div className="modal-container" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Start Test (Go LIVE)</h3>
                <button
                  type="button"
                  onClick={() => setShowStartModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <p style={{ color: '#374151', fontSize: '0.9rem', marginBottom: 12 }}>
                  Are you ready to make <strong>"{test.title}"</strong> LIVE?
                </p>
                <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, padding: 12, fontSize: '0.8rem', color: '#92400e' }}>
                  ⚠️ Candidates with valid room codes will be able to join and start their proctored test session immediately.
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowStartModal(false)}
                  className="btn btn-secondary"
                  disabled={starting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleStartTest}
                  className="btn btn-primary"
                  style={{ background: '#2ECC71' }}
                  disabled={starting}
                >
                  {starting ? 'Starting...' : 'Confirm & Start Test'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── End Test Modal ── */}
        {showEndModal && (
          <div className="modal-backdrop" onClick={() => !ending && setShowEndModal(false)}>
            <div className="modal-container" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title" style={{ color: '#E74C3C' }}>End Test</h3>
                <button
                  type="button"
                  onClick={() => setShowEndModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <p style={{ color: '#374151', fontSize: '0.9rem', marginBottom: 12 }}>
                  Are you sure you want to end <strong>"{test.title}"</strong>?
                </p>
                <div style={{ background: '#fee2e2', border: '1px solid #ef4444', borderRadius: 8, padding: 12, fontSize: '0.8rem', color: '#991b1b' }}>
                  ⚠️ Ending the test will broadcast a <code>test:ended</code> event to all candidate browsers, forcing immediate auto-submission and triggering the final evaluation pass.
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowEndModal(false)}
                  className="btn btn-secondary"
                  disabled={ending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEndTest}
                  className="btn btn-danger"
                  disabled={ending}
                >
                  {ending ? 'Ending...' : 'Confirm & End Test'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Add Room Modal (FR-3.1) ── */}
        {showAddRoomModal && (
          <div className="modal-backdrop" onClick={() => !addingRoom && setShowAddRoomModal(false)}>
            <div className="modal-container" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3 className="modal-title">Add Physical Room</h3>
                <button
                  type="button"
                  onClick={() => setShowAddRoomModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleAddRoomSubmit}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="form-group">
                    <label className="form-label">Room Name *</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Lab 201 — Ground Floor"
                      value={roomFormData.roomName}
                      onChange={(e) => setRoomFormData((p) => ({ ...p, roomName: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Room Capacity (Optional)</label>
                    <input
                      type="number"
                      className="form-control"
                      min="1"
                      placeholder="e.g. 50"
                      value={roomFormData.capacity}
                      onChange={(e) => setRoomFormData((p) => ({ ...p, capacity: e.target.value }))}
                    />
                  </div>

                  <p style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                    💡 A cryptographic 6-character Room Code and Password will be automatically generated.
                  </p>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    onClick={() => setShowAddRoomModal(false)}
                    className="btn btn-secondary"
                    disabled={addingRoom}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={addingRoom}
                  >
                    {addingRoom ? 'Creating Room...' : 'Create Room'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Room Candidates Modal with Real-time Status Sync (FR-3.3, FR-8.3) ── */}
        {selectedRoomCandidates && (
          <div className="modal-backdrop" onClick={() => setSelectedRoomCandidates(null)}>
            <div className="modal-container" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                    Candidates in Room {selectedRoomCandidates.room.roomName || selectedRoomCandidates.room.roomCode}
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span className="badge badge-teal" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>
                      Code: {selectedRoomCandidates.room.roomCode}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                      Live Sync Active
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedRoomCandidates(null)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body" style={{ maxHeight: 420, overflowY: 'auto' }}>
                {loadingCandidates ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                    <div className="spinner spinner-dark" style={{ width: 28, height: 28 }} />
                  </div>
                ) : selectedRoomCandidates.list.length === 0 ? (
                  <p style={{ color: '#6b7280', textAlign: 'center', padding: 28 }}>
                    No candidates have joined this room yet.
                  </p>
                ) : (
                  <table className="table" style={{ fontSize: '0.85rem' }}>
                    <thead>
                      <tr>
                        <th>Candidate Name</th>
                        <th>Email</th>
                        <th>Questions</th>
                        <th>Violations</th>
                        <th>Status</th>
                        <th>Submitted At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRoomCandidates.list.map((c) => (
                        <tr key={c._id || c.candidateId}>
                          <td style={{ fontWeight: 600, color: '#1A2B3C' }}>{c.name}</td>
                          <td style={{ color: '#4b5563', fontSize: '0.8rem' }}>{c.email}</td>
                          <td style={{ fontWeight: 600, color: '#0E7C86' }}>
                            {c.questionsCompleted ?? 0}
                          </td>
                          <td>
                            {(c.malpracticeCount || 0) > 0 ? (
                              <span className="badge badge-danger" style={{ fontSize: '0.72rem', padding: '2px 6px' }}>
                                ⚠️ {c.malpracticeCount}
                              </span>
                            ) : (
                              <span style={{ color: '#2ECC71', fontSize: '0.75rem' }}>✓ Clean</span>
                            )}
                          </td>
                          <td>
                            {c.isDisqualified || c.status === 'DISQUALIFIED' ? (
                              <span
                                className="badge badge-danger"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
                              >
                                <span style={{ fontSize: '0.85em', lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>🚫</span>
                                <span>Disqualified</span>
                              </span>
                            ) : c.status === 'SUBMITTED' ? (
                              <span
                                className="badge badge-success"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
                              >
                                <span style={{ fontSize: '0.9em', lineHeight: 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center' }}>✓</span>
                                <span>Submitted</span>
                              </span>
                            ) : c.status === 'AUTO_SUBMITTED_TIME_UP' ? (
                              <span
                                className="badge badge-teal"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
                              >
                                <span style={{ fontSize: '0.85em', lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>⏱</span>
                                <span>Auto-Submitted</span>
                              </span>
                            ) : (
                              <span
                                className="badge badge-primary"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
                              >
                                <span style={{ fontSize: '0.85em', lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}>⏳</span>
                                <span>In Progress</span>
                              </span>
                            )}
                          </td>
                          <td style={{ color: '#6b7280', fontSize: '0.78rem' }}>
                            {c.submittedAt ? new Date(c.submittedAt).toLocaleTimeString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                  Total: <strong>{selectedRoomCandidates.list.length}</strong> candidate{selectedRoomCandidates.list.length === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedRoomCandidates(null)}
                  className="btn btn-secondary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Edit Configuration Modal (BUG-36, BUG-38, BUG-39) ── */}
        {showEditModal && (
          <div className="modal-backdrop" onClick={() => !editingConfig && setShowEditModal(false)}>
            <div
              className="modal-container"
              style={{ maxWidth: 650, maxHeight: '90vh', overflowY: 'auto' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h3 className="modal-title">Edit Test Configuration</h3>
                  <span className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>DRAFT</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer' }}
                  disabled={editingConfig}
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveConfig}>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Test Title / Name */}
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>Test Title *</label>
                    <input
                      type="text"
                      id="edit-test-title"
                      className="form-control"
                      placeholder="e.g. SDE-1 Hiring Drive Round 1"
                      value={editFormData.title}
                      onChange={(e) => setEditFormData((p) => ({ ...p, title: e.target.value }))}
                      required
                    />
                  </div>

                  {/* Row 2: Test Type & Question Set (2-column grid matching Create modal) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>Test Type *</label>
                      <select
                        id="edit-test-type"
                        className="form-select"
                        value={editFormData.testType}
                        onChange={handleEditTestTypeChange}
                        required
                      >
                        {TEST_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>Question Set *</label>
                      <select
                        id="edit-question-set"
                        className="form-select"
                        value={editFormData.questionSetId}
                        onChange={(e) => setEditFormData((p) => ({ ...p, questionSetId: e.target.value }))}
                        required
                      >
                        <option value="">Select a Question Set...</option>
                        {(() => {
                          const filtered = questionSets.filter((qs) => qs.testType === editFormData.testType);
                          const cur = test?.questionSetId && typeof test.questionSetId === 'object' ? test.questionSetId : null;
                          const displayList = cur && cur.testType === editFormData.testType && !filtered.some((qs) => qs._id === cur._id)
                            ? [cur, ...filtered]
                            : filtered;
                          return displayList.map((qs) => (
                            <option key={qs._id} value={qs._id}>
                              {qs.name} ({qs.testType})
                            </option>
                          ));
                        })()}
                      </select>
                      {questionSets.filter((qs) => qs.testType === editFormData.testType).length === 0 && (
                        <p style={{ fontSize: '0.75rem', color: '#E74C3C', marginTop: 4 }}>
                          No question sets found for {editFormData.testType}. Create one in Question Bank first.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Duration (Minutes) * & Total Questions (2-column grid matching Create modal) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>Duration (Minutes) *</label>
                      <input
                        type="number"
                        id="edit-duration-minutes"
                        className="form-control"
                        min="5"
                        max="360"
                        value={editFormData.durationMinutes}
                        onChange={(e) => setEditFormData((p) => ({ ...p, durationMinutes: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>Total Questions</label>
                      <input
                        type="number"
                        id="edit-total-questions"
                        className="form-control"
                        min="1"
                        max="50"
                        value={editFormData.totalQuestions}
                        onChange={(e) => setEditFormData((p) => ({ ...p, totalQuestions: e.target.value }))}
                      />
                    </div>
                  </div>

                  {/* Row 4: Join Window / Password Validity (Minutes) with helper subtext */}
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>Join Window / Password Validity (Minutes)</label>
                    <input
                      type="number"
                      id="edit-start-window"
                      className="form-control"
                      min="1"
                      max="120"
                      value={editFormData.startTestWindowMinutes}
                      onChange={(e) => setEditFormData((p) => ({ ...p, startTestWindowMinutes: e.target.value }))}
                      required
                    />
                    <small style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 4, display: 'block' }}>
                      Room passwords expire after this window from room creation (FR-3.3).
                    </small>
                  </div>

                  {/* Row 5: Supported Languages */}
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600, marginBottom: 0 }}>Supported Languages</label>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                      {PROGRAMMING_LANGUAGES.map((lang) => {
                        const isChecked = editFormData.supportedLanguages?.includes(lang);
                        return (
                          <label
                            key={lang}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              fontSize: '0.85rem',
                              cursor: 'pointer',
                              padding: '5px 12px',
                              borderRadius: 6,
                              border: isChecked ? '1.5px solid #0E7C86' : '1.5px solid #e5e7eb',
                              background: isChecked ? 'rgba(14, 124, 134, 0.08)' : 'white',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleEditLanguageToggle(lang)}
                            />
                            {lang.toUpperCase()}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Row 6: Candidate Instructions */}
                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>Candidate Instructions *</label>
                    <textarea
                      id="edit-instructions"
                      className="form-control"
                      rows={5}
                      value={editFormData.instructions}
                      onChange={(e) => setEditFormData((p) => ({ ...p, instructions: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                <div className="modal-footer">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="btn btn-secondary"
                    disabled={editingConfig}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    id="save-config-btn"
                    className="btn btn-primary"
                    disabled={editingConfig}
                  >
                    {editingConfig ? 'Saving Changes...' : 'Save Configuration'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
