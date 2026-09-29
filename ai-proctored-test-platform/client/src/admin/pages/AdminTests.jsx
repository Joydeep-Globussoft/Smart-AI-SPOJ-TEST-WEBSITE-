// AdminTests.jsx — Test Management Page
// Implements PRD Section 9.2, Section 11.2 (FR-2.1, FR-2.2, FR-2.3), Section 12.1, FEATURE-021, BUG-86
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminNavbar from '../../shared/AdminNavbar';
import TestStatusBadge from '../../shared/TestStatusBadge';
import CreateTestModal from '../../shared/CreateTestModal';
import LoadingDots from '../../shared/LoadingDots';
import api from '../../services/apiClient';
import useAdminFilterState from '../../hooks/useAdminFilterState';
import useScrollRestoration from '../../hooks/useScrollRestoration';

const TEST_TYPES = [
  { value: 'SPOJ', label: 'SPOJ (DSA / Competitive Coding)' },
  { value: 'JAVASCRIPT', label: 'JavaScript' },
  { value: 'REACT', label: 'React.js' },
  { value: 'AI_TEST', label: 'AI Test (Kimi Assisted)' },
];

const SORT_FIELDS = [
  { id: 'name', label: 'Name' },
  { id: 'date', label: 'Timeline' },
  { id: 'duration', label: 'Duration' },
  { id: 'type', label: 'Type' },
  { id: 'status', label: 'Status' },
  { id: 'passing', label: 'Passing Criteria' },
  { id: 'participants', label: 'Submissions' },
  { id: 'shortlisted', label: 'Shortlisted' },
  { id: 'rooms', label: 'Total Rooms' },
];

const SORT_DIRS = [
  { id: 'asc', label: 'Ascending' },
  { id: 'desc', label: 'Descending' },
];

const DEFAULT_FILTERS = {
  search: '',
  type: 'ALL',
  status: 'ALL',
  sort: 'NEWEST',
  sortField: 'date',
  sortDir: 'desc',
  dateCreated: 'ALL',
  dateFrom: '',
  dateTo: '',
  duration: 'ALL',
  passingCriteria: 'ALL',
  folderId: 'ALL',
  language: 'ALL',
  roomStatus: 'ALL',
  candidateActivity: 'ALL',
  violations: 'ALL',
};

// FEATURE-039 / FEATURE-027: Format Live-For duration matching Test Summary Dashboard header
export const formatLiveFor = (test, currentNow = Date.now()) => {
  if (!test) return '—';
  if (test.status === 'DRAFT' || !test.liveStartedAt) {
    return '—';
  }
  const start = new Date(test.liveStartedAt);
  if (isNaN(start.getTime())) return '—';

  const end = test.status === 'ENDED' && test.endedAt ? new Date(test.endedAt) : new Date(currentNow);
  if (isNaN(end.getTime())) return '—';

  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) return '< 1 Second';

  const totalSeconds = Math.floor(diffMs / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'Hour' : 'Hours'}`);
  if (minutes > 0) parts.push(`${minutes} ${minutes === 1 ? 'Minute' : 'Minutes'}`);
  if (parts.length > 0) return parts.join(' ');
  if (seconds > 0) return `${seconds} ${seconds === 1 ? 'Second' : 'Seconds'}`;
  return '< 1 Second';
};

const TIMELINE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatTimelineDate = (d, includeYear = false) => {
  if (!d || isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = TIMELINE_MONTHS[d.getMonth()];
  if (includeYear) {
    return `${day} ${month} ${d.getFullYear()}`;
  }
  return `${day} ${month}`;
};

const formatTimelineDateTime = (d) => {
  if (!d || isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = TIMELINE_MONTHS[d.getMonth()];
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
};

const isSameTimelineDay = (d1, d2) => {
  if (!d1 || !d2) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
};

// FEATURE-031: Smart Timeline calculation (Created & Live dates)
export const getTestTimelineInfo = (test) => {
  if (!test) return { display: '—', tooltip: '', isRange: false };

  const createdDate = test.createdAt ? new Date(test.createdAt) : null;
  const isCreatedValid = createdDate && !isNaN(createdDate.getTime());

  const liveRaw = test.liveStartedAt || test.scheduledStartTime || test.startTime;
  const liveDate = liveRaw ? new Date(liveRaw) : null;
  const isLiveValid = liveDate && !isNaN(liveDate.getTime());

  if (!isCreatedValid && !isLiveValid) {
    return { display: '—', tooltip: '', isRange: false };
  }

  if (!isCreatedValid) {
    const liveDisplay = formatTimelineDate(liveDate, true);
    return {
      display: liveDisplay,
      tooltip: `Live: ${formatTimelineDateTime(liveDate)}`,
      isRange: false,
    };
  }

  // Case 1: No live date (e.g. DRAFT not started) OR Created Date = Live Date (Same Day)
  if (!isLiveValid || isSameTimelineDay(createdDate, liveDate)) {
    const singleDisplay = formatTimelineDate(createdDate, true);
    const createdTooltip = `Created: ${formatTimelineDateTime(createdDate)}`;
    const liveTooltip = isLiveValid
      ? `Live: ${formatTimelineDateTime(liveDate)}`
      : test.status === 'DRAFT'
        ? 'Live: Not started (Draft)'
        : '';
    const tooltip = liveTooltip ? `${createdTooltip}\n${liveTooltip}` : createdTooltip;

    return {
      display: singleDisplay,
      tooltip,
      isRange: false,
      createdStr: singleDisplay,
    };
  }

  // Case 2: Created Date ≠ Live Date (Different Days)
  const isSameYear = createdDate.getFullYear() === liveDate.getFullYear();
  let createdPart = '';
  let livePart = '';

  if (isSameYear) {
    createdPart = formatTimelineDate(createdDate, false);
    livePart = formatTimelineDate(liveDate, false);
  } else {
    createdPart = formatTimelineDate(createdDate, true);
    livePart = formatTimelineDate(liveDate, true);
  }

  const tooltip = `Created: ${formatTimelineDateTime(createdDate)}\nLive: ${formatTimelineDateTime(liveDate)}`;

  return {
    display: `${createdPart} → ${livePart}`,
    createdPart,
    livePart,
    tooltip,
    isRange: true,
  };
};

// FEATURE-032: Smart Submissions calculation (Submitted / Total Candidates)
export const getSubmissionsInfo = (test) => {
  const total = Number(test?.totalParticipants ?? test?.candidateCount ?? 0) || 0;
  const submitted = Math.min(Number(test?.submittedCount ?? 0) || 0, total);
  const notSubmitted = Math.max(0, total - submitted);

  if (total === 0) {
    return {
      display: '0 / 0',
      submitted: 0,
      total: 0,
      notSubmitted: 0,
      rate: 0,
      tooltip: 'Submitted: 0\nTotal Candidates: 0',
      statusColor: 'var(--color-text-muted)',
    };
  }

  const rate = Math.round((submitted / total) * 100);
  const tooltip = `Submitted: ${submitted}\nTotal Candidates: ${total}\nNot Submitted: ${notSubmitted}\nSubmission Rate: ${rate}%`;

  let statusColor = 'var(--color-text-muted)'; // 0%
  if (rate === 100) {
    statusColor = '#10b981'; // Green
  } else if (rate >= 50) {
    statusColor = 'var(--color-primary, #0E7C86)'; // Blue/Teal
  } else if (rate > 0) {
    statusColor = '#f59e0b'; // Amber
  }

  return {
    display: `${submitted} / ${total}`,
    submitted,
    total,
    notSubmitted,
    rate,
    tooltip,
    statusColor,
  };
};

// FEATURE-039: Smart Shortlisted calculation (Official Shortlist Candidates Count)
export const getShortlistedInfo = (test) => {
  if (!test) {
    return {
      display: '—',
      count: 0,
      tooltip: '',
      isAvailable: false,
      color: 'var(--color-text-muted)',
    };
  }

  const hasCount = test.shortlistedCount !== null && test.shortlistedCount !== undefined;

  if (!hasCount) {
    if (test.status === 'DRAFT' || test.status === 'LIVE') {
      return {
        display: '—',
        count: null,
        tooltip: test.status === 'LIVE' ? 'Results not yet generated (Test is Live)' : 'Not started (Draft)',
        isAvailable: false,
        color: 'var(--color-text-muted)',
      };
    }
  }

  const count = Number(test.shortlistedCount) || 0;
  const total = Number(test.totalParticipants ?? test.candidateCount ?? 0) || 0;
  const submitted = Math.min(Number(test.submittedCount ?? 0) || 0, total);

  const lines = [
    `Shortlisted: ${count}`,
    `Submitted: ${submitted}`,
    `Total Candidates: ${total}`,
  ];

  if (submitted > 0) {
    const rate = ((count / submitted) * 100).toFixed(1);
    lines.push(`Shortlist Rate: ${rate}%`);
  }

  const tooltip = lines.join('\n');
  const color = count > 0 ? '#10b981' : 'var(--color-text-muted)';

  return {
    display: String(count),
    count,
    tooltip,
    isAvailable: true,
    color,
  };
};

export default function AdminTests() {
  const navigate = useNavigate();
  const [tests, setTests] = useState([]);
  const [questionSets, setQuestionSets] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [isScrolledLeft, setIsScrolledLeft] = useState(false);

  // Real-time 1s ticker for live-updating elapsed duration on LIVE tests
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const handleTableScroll = (e) => {
    const scrolled = e.target.scrollLeft > 2;
    setIsScrolledLeft((prev) => (prev !== scrolled ? scrolled : prev));
  };

  // FEATURE-021 & FEATURE-022: Preserved Filters & Search via URL parameters
  const [filters, updateFilter, setFilters] = useAdminFilterState(DEFAULT_FILTERS);
  const searchQuery = filters.search;
  const filterType = filters.type;
  const filterStatus = filters.status;

  // Compute number of active advanced filters for badge
  const advancedFilterKeys = [
    'dateCreated',
    'duration',
    'passingCriteria',
    'folderId',
    'language',
    'roomStatus',
    'candidateActivity',
    'violations',
  ];
  const advancedActiveCount = advancedFilterKeys.filter((key) => {
    const val = filters[key];
    return val && val !== 'ALL';
  }).length;

  // FEATURE-022 / FEATURE-029: Sort by Menu State & Derivations
  const [showSortMenu, setShowSortMenu] = useState(false);
  const sortMenuRef = useRef(null);
  const sortBtnRef = useRef(null);

  // Derive active sortField and sortDir from URL filter state with backwards-compatible fallbacks
  const activeSortField = useMemo(() => {
    if (filters.sortField) return filters.sortField;
    const s = filters.sort;
    if (s === 'TITLE_AZ' || s === 'name_asc' || s === 'name_desc') return 'name';
    if (s === 'DURATION' || s === 'duration_asc' || s === 'duration_desc') return 'duration';
    if (s === 'type_asc' || s === 'type_desc') return 'type';
    if (s === 'status_asc' || s === 'status_desc') return 'status';
    if (s === 'passing_asc' || s === 'passing_desc') return 'passing';
    if (s === 'participants_asc' || s === 'participants_desc') return 'participants';
    if (s === 'shortlisted_asc' || s === 'shortlisted_desc') return 'shortlisted';
    if (s === 'rooms_asc' || s === 'rooms_desc') return 'rooms';
    return 'date';
  }, [filters.sortField, filters.sort]);

  const activeSortDir = useMemo(() => {
    if (filters.sortDir) return filters.sortDir;
    const s = filters.sort;
    if (s === 'OLDEST' || s === 'TITLE_AZ' || s?.endsWith('_asc')) return 'asc';
    return 'desc';
  }, [filters.sortDir, filters.sort]);

  // Close Sort Menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!showSortMenu) return;
    const handleClickOutside = (e) => {
      if (
        sortMenuRef.current &&
        !sortMenuRef.current.contains(e.target) &&
        sortBtnRef.current &&
        !sortBtnRef.current.contains(e.target)
      ) {
        setShowSortMenu(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setShowSortMenu(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showSortMenu]);

  const handleSelectSortField = (fieldId) => {
    setFilters((prev) => {
      const currentDir = prev.sortDir || activeSortDir || (fieldId === 'name' || fieldId === 'type' || fieldId === 'status' ? 'asc' : 'desc');
      let legacy = 'NEWEST';
      if (fieldId === 'date') legacy = currentDir === 'asc' ? 'OLDEST' : 'NEWEST';
      else if (fieldId === 'duration') legacy = 'DURATION';
      else if (fieldId === 'name') legacy = currentDir === 'asc' ? 'TITLE_AZ' : 'name_desc';
      else legacy = `${fieldId}_${currentDir}`;
      return { ...prev, sortField: fieldId, sortDir: currentDir, sort: legacy };
    });
  };

  const handleSelectSortDir = (dirId) => {
    setFilters((prev) => {
      const currentField = prev.sortField || activeSortField || 'date';
      let legacy = 'NEWEST';
      if (currentField === 'date') legacy = dirId === 'asc' ? 'OLDEST' : 'NEWEST';
      else if (currentField === 'duration') legacy = 'DURATION';
      else if (currentField === 'name') legacy = dirId === 'asc' ? 'TITLE_AZ' : 'name_desc';
      else legacy = `${currentField}_${dirId}`;
      return { ...prev, sortDir: dirId, sort: legacy };
    });
  };

  const currentSortSummaryLabel = useMemo(() => {
    const fieldObj = SORT_FIELDS.find((f) => f.id === activeSortField);
    const fieldName = fieldObj ? fieldObj.label : 'Timeline';
    if (activeSortField === 'date') {
      return `Timeline (${activeSortDir === 'desc' ? 'Newest first' : 'Oldest first'})`;
    }
    if (activeSortField === 'name') {
      return `Name (${activeSortDir === 'asc' ? 'Alphabetical (A-Z)' : 'Z-A'})`;
    }
    if (activeSortField === 'duration') {
      return `Duration (${activeSortDir === 'desc' ? 'Longest' : 'Shortest'})`;
    }
    if (activeSortField === 'type') {
      return `Type (${activeSortDir === 'asc' ? 'A-Z' : 'Z-A'})`;
    }
    if (activeSortField === 'status') {
      return `Status (${activeSortDir === 'asc' ? 'A-Z' : 'Z-A'})`;
    }
    if (activeSortField === 'passing') {
      return `Passing Criteria (${activeSortDir === 'desc' ? 'Highest' : 'Lowest'})`;
    }
    if (activeSortField === 'participants') {
      return `Submissions (${activeSortDir === 'desc' ? 'Highest' : 'Lowest'})`;
    }
    if (activeSortField === 'shortlisted') {
      return `Shortlisted (${activeSortDir === 'desc' ? 'Highest' : 'Lowest'})`;
    }
    if (activeSortField === 'rooms') {
      return `Total Rooms (${activeSortDir === 'desc' ? 'Highest' : 'Lowest'})`;
    }
    return `${fieldName} (${activeSortDir === 'asc' ? 'Ascending' : 'Descending'})`;
  }, [activeSortField, activeSortDir]);

  // FEATURE-021: Preserved scroll position for Test Management table
  const tableContainerRef = useRef(null);
  useScrollRestoration({
    containerRef: tableContainerRef,
    loading,
    key: 'tests_table',
    dependencies: [tests.length, searchQuery, filterType, filterStatus, filters.sort, filters.sortField, filters.sortDir, advancedActiveCount],
  });

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

  const fetchFolders = useCallback(async () => {
    try {
      const res = await api.getFolders();
      setFolders(res.data.folders || []);
    } catch (err) {
      console.error('Failed to fetch folders:', err);
    }
  }, []);

  useEffect(() => {
    fetchTests();
    fetchQuestionSets();
    fetchFolders();
  }, [fetchTests, fetchQuestionSets, fetchFolders]);

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

  // Filtered and sorted list (combines all 11 criteria using AND logic + sorts by chosen preference)
  const filteredTests = useMemo(() => {
    const list = tests.filter((t) => {
      const matchesType = filterType === 'ALL' || t.testType === filterType;
      const matchesStatus = filterStatus === 'ALL' || t.status === filterStatus;
      const matchesSearch =
        !searchQuery.trim() ||
        t.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.questionSetId?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.folderId?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.questionSetPoolName?.toLowerCase().includes(searchQuery.toLowerCase());

      // Timing: Date Created
      let matchesDate = true;
      if (filters.dateCreated && filters.dateCreated !== 'ALL') {
        const testDate = new Date(t.createdAt).getTime();
        const now = Date.now();
        if (filters.dateCreated === 'TODAY') {
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);
          matchesDate = testDate >= startOfToday.getTime();
        } else if (filters.dateCreated === 'LAST_7_DAYS') {
          matchesDate = testDate >= now - 7 * 24 * 60 * 60 * 1000;
        } else if (filters.dateCreated === 'LAST_30_DAYS') {
          matchesDate = testDate >= now - 30 * 24 * 60 * 60 * 1000;
        } else if (filters.dateCreated === 'CUSTOM') {
          if (filters.dateFrom) {
            const fromTime = new Date(filters.dateFrom).setHours(0, 0, 0, 0);
            matchesDate = matchesDate && testDate >= fromTime;
          }
          if (filters.dateTo) {
            const toTime = new Date(filters.dateTo).setHours(23, 59, 59, 999);
            matchesDate = matchesDate && testDate <= toTime;
          }
        }
      }

      // Timing: Duration
      let matchesDuration = true;
      if (filters.duration && filters.duration !== 'ALL') {
        const dur = Number(t.durationMinutes) || 0;
        if (filters.duration === 'LE_30') matchesDuration = dur <= 30;
        else if (filters.duration === '31_60') matchesDuration = dur >= 31 && dur <= 60;
        else if (filters.duration === '61_90') matchesDuration = dur >= 61 && dur <= 90;
        else if (filters.duration === 'GT_90') matchesDuration = dur > 90;
      }

      // Content: Passing Criteria
      let matchesPassing = true;
      if (filters.passingCriteria && filters.passingCriteria !== 'ALL') {
        const crit = Number(t.passingCriteria) || 0;
        if (filters.passingCriteria === 'NO_MIN') matchesPassing = crit <= 0;
        else if (filters.passingCriteria === 'HAS_MIN') matchesPassing = crit >= 1;
      }

      // Content: Question Set / Folder
      let matchesFolder = true;
      if (filters.folderId && filters.folderId !== 'ALL') {
        const targetFolderId = String(filters.folderId);
        const tFolderId = t.folderId?._id || t.folderId || t.questionSetPoolId;
        const qSetFolderId = t.questionSetId?.folderId?._id || t.questionSetId?.folderId;
        matchesFolder =
          (tFolderId && String(tFolderId) === targetFolderId) ||
          (qSetFolderId && String(qSetFolderId) === targetFolderId);
      }

      // Content: Language
      let matchesLang = true;
      if (filters.language && filters.language !== 'ALL') {
        const targetLang = filters.language.toLowerCase();
        const testLangs = Array.isArray(t.supportedLanguages)
          ? t.supportedLanguages.map((l) => l.toLowerCase())
          : [];
        if (targetLang === 'python') matchesLang = testLangs.includes('python');
        else if (targetLang === 'java') matchesLang = testLangs.includes('java');
        else if (targetLang === 'c++' || targetLang === 'cpp') matchesLang = testLangs.includes('cpp') || testLangs.includes('c++');
        else if (targetLang === 'c') matchesLang = testLangs.includes('c');
        else if (targetLang === 'javascript') matchesLang = testLangs.includes('javascript') || t.testType === 'JAVASCRIPT';
        else if (targetLang === 'react') matchesLang = testLangs.includes('react') || t.testType === 'REACT';
        else matchesLang = testLangs.includes(targetLang);
      }

      // Activity: Room Status
      let matchesRoom = true;
      if (filters.roomStatus && filters.roomStatus !== 'ALL') {
        if (filters.roomStatus === 'HAS_ACTIVE') {
          matchesRoom = Boolean(t.hasActiveRooms || t.activeRoomsCount > 0);
        } else if (filters.roomStatus === 'NO_ACTIVE') {
          matchesRoom = !t.hasActiveRooms && (!t.activeRoomsCount || t.activeRoomsCount === 0);
        }
      }

      // Activity: Candidate Activity
      let matchesCandidate = true;
      if (filters.candidateActivity && filters.candidateActivity !== 'ALL') {
        if (filters.candidateActivity === 'HAS_CANDIDATES') {
          matchesCandidate = Boolean(t.hasCandidates || t.candidateCount > 0);
        } else if (filters.candidateActivity === 'NO_CANDIDATES') {
          matchesCandidate = !t.hasCandidates && (!t.candidateCount || t.candidateCount === 0);
        }
      }

      // Activity: Violations Present
      let matchesViolation = true;
      if (filters.violations && filters.violations !== 'ALL') {
        if (filters.violations === 'HAS_VIOLATIONS') {
          matchesViolation = Boolean(t.hasViolations || t.violationsCount > 0);
        }
      }

      return (
        matchesType &&
        matchesStatus &&
        matchesSearch &&
        matchesDate &&
        matchesDuration &&
        matchesPassing &&
        matchesFolder &&
        matchesLang &&
        matchesRoom &&
        matchesCandidate &&
        matchesViolation
      );
    });

    // Apply Sorting (FEATURE-022 & FEATURE-029: Name, Date, Duration, Type, Status, Passing Criteria)
    return list.sort((a, b) => {
      let comparison = 0;
      switch (activeSortField) {
        case 'name':
          comparison = (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' });
          break;
        case 'date':
          comparison = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
          break;
        case 'duration':
          comparison = (Number(a.durationMinutes) || 0) - (Number(b.durationMinutes) || 0);
          break;
        case 'type':
          comparison = (a.testType || '').localeCompare(b.testType || '', undefined, { sensitivity: 'base' });
          break;
        case 'status':
          comparison = (a.status || '').localeCompare(b.status || '', undefined, { sensitivity: 'base' });
          break;
        case 'passing':
          comparison = (Number(a.passingCriteriaQuestions || a.passingCriteria) || 0) - (Number(b.passingCriteriaQuestions || b.passingCriteria) || 0);
          break;
        case 'participants':
          comparison = (Number(a.totalParticipants ?? a.candidateCount) || 0) - (Number(b.totalParticipants ?? b.candidateCount) || 0);
          break;
        case 'shortlisted':
          comparison = (Number(a.shortlistedCount ?? -1)) - (Number(b.shortlistedCount ?? -1));
          break;
        case 'rooms':
          comparison = (Number(a.totalRooms ?? a.roomCount) || 0) - (Number(b.totalRooms ?? b.roomCount) || 0);
          break;
        default:
          comparison = new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      }
      return activeSortDir === 'asc' ? comparison : -comparison;
    });
  }, [tests, filterType, filterStatus, searchQuery, filters, activeSortField, activeSortDir]);

  // Active filter chips list for both primary and advanced filters
  const activeChips = useMemo(() => {
    const chips = [];

    // Primary 1: Search
    if (searchQuery && searchQuery.trim()) {
      chips.push({
        key: 'search',
        label: `Search: "${searchQuery}"`,
        onRemove: () => updateFilter('search', ''),
      });
    }
    // Primary 2: Type
    if (filterType && filterType !== 'ALL') {
      const typeObj = TEST_TYPES.find((t) => t.value === filterType);
      chips.push({
        key: 'type',
        label: `Type: ${typeObj ? typeObj.label.split(' ')[0] : filterType}`,
        onRemove: () => updateFilter('type', 'ALL'),
      });
    }
    // Primary 3: Status
    if (filterStatus && filterStatus !== 'ALL') {
      chips.push({
        key: 'status',
        label: `Status: ${filterStatus}`,
        onRemove: () => updateFilter('status', 'ALL'),
      });
    }

    // Advanced: Date Created
    if (filters.dateCreated && filters.dateCreated !== 'ALL') {
      let dateLabel = 'Date: ';
      if (filters.dateCreated === 'TODAY') dateLabel += 'Today';
      else if (filters.dateCreated === 'LAST_7_DAYS') dateLabel += 'Last 7 days';
      else if (filters.dateCreated === 'LAST_30_DAYS') dateLabel += 'Last 30 days';
      else if (filters.dateCreated === 'CUSTOM') {
        dateLabel += filters.dateFrom && filters.dateTo
          ? `${filters.dateFrom} to ${filters.dateTo}`
          : 'Custom range';
      }
      chips.push({
        key: 'dateCreated',
        label: dateLabel,
        onRemove: () => setFilters({ dateCreated: 'ALL', dateFrom: '', dateTo: '' }),
      });
    }

    // Advanced: Duration
    if (filters.duration && filters.duration !== 'ALL') {
      let durLabel = 'Duration: ';
      if (filters.duration === 'LE_30') durLabel += '≤30 min';
      else if (filters.duration === '31_60') durLabel += '31-60 min';
      else if (filters.duration === '61_90') durLabel += '61-90 min';
      else if (filters.duration === 'GT_90') durLabel += '90+ min';
      chips.push({
        key: 'duration',
        label: durLabel,
        onRemove: () => updateFilter('duration', 'ALL'),
      });
    }

    // Advanced: Passing Criteria
    if (filters.passingCriteria && filters.passingCriteria !== 'ALL') {
      const passLabel = filters.passingCriteria === 'NO_MIN'
        ? 'Passing: No min (≥0 Qs)'
        : 'Passing: Has min (≥1 Qs)';
      chips.push({
        key: 'passingCriteria',
        label: passLabel,
        onRemove: () => updateFilter('passingCriteria', 'ALL'),
      });
    }

    // Advanced: Folder
    if (filters.folderId && filters.folderId !== 'ALL') {
      const folderObj = folders.find((f) => f._id === filters.folderId);
      chips.push({
        key: 'folderId',
        label: `Folder: ${folderObj ? folderObj.name : 'Selected Folder'}`,
        onRemove: () => updateFilter('folderId', 'ALL'),
      });
    }

    // Advanced: Language
    if (filters.language && filters.language !== 'ALL') {
      chips.push({
        key: 'language',
        label: `Language: ${filters.language}`,
        onRemove: () => updateFilter('language', 'ALL'),
      });
    }

    // Advanced: Room Status
    if (filters.roomStatus && filters.roomStatus !== 'ALL') {
      const roomLabel = filters.roomStatus === 'HAS_ACTIVE'
        ? 'Rooms: Has active rooms'
        : 'Rooms: No active rooms';
      chips.push({
        key: 'roomStatus',
        label: roomLabel,
        onRemove: () => updateFilter('roomStatus', 'ALL'),
      });
    }

    // Advanced: Candidate Activity
    if (filters.candidateActivity && filters.candidateActivity !== 'ALL') {
      const candLabel = filters.candidateActivity === 'HAS_CANDIDATES'
        ? 'Candidates: Has candidates'
        : 'Candidates: No candidates';
      chips.push({
        key: 'candidateActivity',
        label: candLabel,
        onRemove: () => updateFilter('candidateActivity', 'ALL'),
      });
    }

    // Advanced: Violations
    if (filters.violations && filters.violations !== 'ALL') {
      chips.push({
        key: 'violations',
        label: 'Has Violations',
        onRemove: () => updateFilter('violations', 'ALL'),
      });
    }

    return chips;
  }, [searchQuery, filterType, filterStatus, filters, folders, updateFilter, setFilters]);

  const handleClearAll = () => {
    setFilters(DEFAULT_FILTERS);
  };

  return (
    <div className="app-layout" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--admin-canvas-bg, #EEF2FF)' }}>
      <AdminNavbar />
      <main
        className="main-content"
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 64px)',
          boxSizing: 'border-box',
          overflow: 'hidden',
          padding: '16px 24px 20px 24px',
          background: 'var(--admin-canvas-bg, #EEF2FF)',
        }}
      >
        {/* Page Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 12, flexShrink: 0 }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', color: 'var(--color-navy)', fontWeight: 800, margin: 0 }}>Test Management</h1>
            <p style={{ color: 'var(--admin-label, #5B6B8A)', fontSize: '0.875rem', marginTop: 3, marginBottom: 0 }}>
              Create, configure, and manage proctored coding assessments and rooms.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--admin-indigo, #3E63DD)',
              borderColor: 'var(--admin-indigo, #3E63DD)',
              color: '#ffffff',
              borderRadius: 8,
              boxShadow: '0 2px 4px rgba(62, 99, 221, 0.25)',
            }}
          >
            <span style={{ fontSize: '1.2rem', lineHeight: 1 }}>+</span> Create New Test
          </button>
        </div>

        {/* Filter & Search Bar (White lifted card on lavender canvas) */}
        <div
          style={{
            background: 'var(--admin-card-bg, #FFFFFF)',
            border: '1px solid var(--admin-card-border, #E0E7FF)',
            borderRadius: 12,
            padding: '14px 18px',
            marginBottom: 14,
            flexShrink: 0,
            boxShadow: 'var(--admin-card-shadow)',
          }}
        >
          {/* Main Filter Bar Row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
            {/* 1. Search Tests */}
            <div style={{ flex: '0 1 260px', minWidth: 180, maxWidth: 300 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--admin-label, #5B6B8A)', marginBottom: 6, display: 'block' }}>
                Search Tests
              </label>
              <div style={{ position: 'relative', width: '100%' }}>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--admin-indigo, #3E63DD)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    opacity: 0.9,
                  }}
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="form-control"
                  style={{
                    paddingLeft: 36,
                    background: 'var(--filterbar-bg, #F4F6FF)',
                    borderColor: 'var(--admin-card-border, #E0E7FF)',
                    color: 'var(--color-text)',
                    borderRadius: 8,
                    height: 38,
                    fontSize: '0.84rem',
                  }}
                  placeholder="Search by test title or pool..."
                  value={searchQuery}
                  onChange={(e) => updateFilter('search', e.target.value)}
                />
              </div>
            </div>

            {/* Divider 1: Between Search and Type */}
            <div
              style={{
                width: 1,
                height: 32,
                background: 'var(--admin-card-border, #E0E7FF)',
                margin: '0 2px',
                alignSelf: 'flex-end',
                marginBottom: 3,
                flexShrink: 0,
              }}
            />

            {/* 2. Filter by Type */}
            <div style={{ flex: '0 1 180px', minWidth: 150 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--admin-label, #5B6B8A)', marginBottom: 6, display: 'block' }}>
                Filter by Type
              </label>
              <div style={{ position: 'relative', width: '100%' }}>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--admin-indigo, #3E63DD)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                  }}
                >
                  <rect x="3" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="3" width="7" height="7" rx="1.5" />
                  <rect x="14" y="14" width="7" height="7" rx="1.5" />
                  <rect x="3" y="14" width="7" height="7" rx="1.5" />
                </svg>
                <select
                  className="form-select"
                  style={{
                    paddingLeft: 34,
                    paddingRight: 32,
                    background: 'var(--filterbar-bg, #F4F6FF)',
                    borderColor: 'var(--admin-card-border, #E0E7FF)',
                    color: 'var(--color-text)',
                    borderRadius: 8,
                    height: 38,
                    fontSize: '0.84rem',
                    fontWeight: 500,
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    cursor: 'pointer',
                  }}
                  value={filterType}
                  onChange={(e) => updateFilter('type', e.target.value)}
                >
                  <option value="ALL">All Test Types</option>
                  {TEST_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--admin-indigo, #3E63DD)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>

            {/* Divider 2: Between Type and Status */}
            <div
              style={{
                width: 1,
                height: 32,
                background: 'var(--admin-card-border, #E0E7FF)',
                margin: '0 2px',
                alignSelf: 'flex-end',
                marginBottom: 3,
                flexShrink: 0,
              }}
            />

            {/* 3. Filter by Status */}
            <div style={{ flex: '0 1 150px', minWidth: 130 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--admin-label, #5B6B8A)', marginBottom: 6, display: 'block' }}>
                Filter by Status
              </label>
              <div style={{ position: 'relative', width: '100%' }}>
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--admin-indigo, #3E63DD)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                  }}
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
                <select
                  className="form-select"
                  style={{
                    paddingLeft: 34,
                    paddingRight: 32,
                    background: 'var(--filterbar-bg, #F4F6FF)',
                    borderColor: 'var(--admin-card-border, #E0E7FF)',
                    color: 'var(--color-text)',
                    borderRadius: 8,
                    height: 38,
                    fontSize: '0.84rem',
                    fontWeight: 500,
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    cursor: 'pointer',
                  }}
                  value={filterStatus}
                  onChange={(e) => updateFilter('status', e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="DRAFT">DRAFT</option>
                  <option value="LIVE">LIVE (Active)</option>
                  <option value="ENDED">ENDED (Completed)</option>
                </select>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--admin-indigo, #3E63DD)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>

            {/* Divider 3: Between Status and More Filters */}
            <div
              style={{
                width: 1,
                height: 32,
                background: 'var(--admin-card-border, #E0E7FF)',
                margin: '0 2px',
                alignSelf: 'flex-end',
                marginBottom: 3,
                flexShrink: 0,
              }}
            />

            {/* 4. More Filters Button */}
            <div style={{ flex: '0 0 auto', alignSelf: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowMoreFilters((prev) => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '0 14px',
                  height: 38,
                  borderRadius: 8,
                  border: '1px solid',
                  borderColor: showMoreFilters || advancedActiveCount > 0 ? 'var(--admin-indigo, #3E63DD)' : 'var(--admin-card-border, #E0E7FF)',
                  background: showMoreFilters || advancedActiveCount > 0 ? 'var(--admin-indigo, #3E63DD)' : 'var(--filterbar-bg, #F4F6FF)',
                  color: showMoreFilters || advancedActiveCount > 0 ? '#ffffff' : 'var(--admin-indigo, #3E63DD)',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  transition: 'all var(--transition)',
                }}
                title="Toggle advanced filters"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                <span>More Filters</span>
                {advancedActiveCount > 0 && (
                  <span
                    style={{
                      background: showMoreFilters || advancedActiveCount > 0 ? '#FFFFFF' : 'var(--admin-indigo, #3E63DD)',
                      color: showMoreFilters || advancedActiveCount > 0 ? 'var(--admin-indigo, #3E63DD)' : '#FFFFFF',
                      borderRadius: 10,
                      padding: '1px 6px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      lineHeight: 1.2,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    ({advancedActiveCount})
                  </span>
                )}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transform: showMoreFilters ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>

            {/* Divider 4: Vertical Divider Line before Sort (Pushed to the right) */}
            <div
              style={{
                width: 1,
                height: 32,
                background: 'var(--admin-card-border, #E0E7FF)',
                marginLeft: 'auto',
                marginRight: 4,
                alignSelf: 'flex-end',
                marginBottom: 3,
                flexShrink: 0,
              }}
            />

            {/* 5. Sort Control (Pill Button without label per BUG-114 / FEATURE-047) */}
            <div style={{ position: 'relative', flex: '0 0 auto', alignSelf: 'flex-end' }}>
              <button
                type="button"
                ref={sortBtnRef}
                onClick={() => setShowSortMenu((prev) => !prev)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '0 14px',
                  height: 38,
                  borderRadius: 8,
                  background: 'var(--filterbar-bg, #F4F6FF)',
                  border: '1px solid',
                  borderColor: showSortMenu ? 'var(--admin-indigo, #3E63DD)' : 'var(--admin-card-border, #E0E7FF)',
                  color: 'var(--filterbar-button-text, #1E293B)',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  minWidth: 95,
                  outline: 'none',
                  transition: 'all var(--transition)',
                }}
                aria-haspopup="true"
                aria-expanded={showSortMenu}
                title={`Sort tests (${SORT_FIELDS.find(f => f.id === activeSortField)?.label || 'Date'}, ${activeSortDir === 'asc' ? 'Ascending' : 'Descending'})`}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--admin-indigo, #3E63DD)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 16V4M7 4L3 8M7 4L11 8" />
                    <path d="M17 8V20M17 20L21 16M17 20L13 16" />
                  </svg>
                  <span>Sort</span>
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--admin-indigo, #3E63DD)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transform: showSortMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {showSortMenu && (
                <div
                  ref={sortMenuRef}
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    right: 0,
                    zIndex: 1000,
                    background: 'var(--admin-card-bg, #FFFFFF)',
                    border: '1px solid var(--admin-card-border, #E0E7FF)',
                    borderRadius: 8,
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.14)',
                    minWidth: 190,
                    padding: '6px 4px',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  {/* Sortable Field Items */}
                  {SORT_FIELDS.map((f) => {
                    const isSelected = activeSortField === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => handleSelectSortField(f.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          width: '100%',
                          padding: '7px 10px',
                          border: 'none',
                          background: isSelected ? 'var(--filterbar-bg, #F4F6FF)' : 'transparent',
                          color: isSelected ? 'var(--admin-indigo, #3E63DD)' : 'var(--color-navy, #1A2B3C)',
                          borderRadius: 5,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontWeight: isSelected ? 600 : 400,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--filterbar-bg, #F4F6FF)'; }}
                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{ width: 14, textAlign: 'center', fontSize: '0.85rem', color: 'var(--admin-indigo, #3E63DD)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isSelected ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : ''}
                        </span>
                        <span>{f.label}</span>
                      </button>
                    );
                  })}

                  {/* Divider */}
                  <div style={{ height: 1, background: 'var(--admin-card-border, #E0E7FF)', margin: '5px 4px' }} />

                  {/* Direction Items */}
                  {SORT_DIRS.map((d) => {
                    const isSelected = activeSortDir === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => handleSelectSortDir(d.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          width: '100%',
                          padding: '7px 10px',
                          border: 'none',
                          background: isSelected ? 'var(--filterbar-bg, #F4F6FF)' : 'transparent',
                          color: isSelected ? 'var(--admin-indigo, #3E63DD)' : 'var(--color-navy, #1A2B3C)',
                          borderRadius: 5,
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontWeight: isSelected ? 600 : 400,
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--filterbar-bg, #F4F6FF)'; }}
                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{ width: 14, textAlign: 'center', fontSize: '0.85rem', color: 'var(--admin-indigo, #3E63DD)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isSelected ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : ''}
                        </span>
                        <span>{d.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* More Filters Panel (Slide-out/Dropdown Card with 3 Sections) */}
          {showMoreFilters && (
            <div
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTop: '1px solid var(--admin-card-border, #E0E7FF)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: 16,
                }}
              >
                {/* SECTION 1: TIMING */}
                <div
                  style={{
                    background: 'var(--filterbar-bg, #F4F6FF)',
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--admin-card-border, #E0E7FF)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--admin-indigo, #3E63DD)' }}>
                      ⏱️ Timing
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 4, color: 'var(--admin-label, #5B6B8A)', fontWeight: 600 }}>Date Created</label>
                      <select
                        className="form-select"
                        style={{ fontSize: '0.82rem', padding: '6px 10px', background: 'var(--admin-card-bg, #FFFFFF)', borderColor: 'var(--admin-card-border, #E0E7FF)', color: 'var(--color-text)', borderRadius: 6 }}
                        value={filters.dateCreated || 'ALL'}
                        onChange={(e) => updateFilter('dateCreated', e.target.value)}
                      >
                        <option value="ALL">All Time</option>
                        <option value="TODAY">Today</option>
                        <option value="LAST_7_DAYS">Last 7 days</option>
                        <option value="LAST_30_DAYS">Last 30 days</option>
                        <option value="CUSTOM">Custom range</option>
                      </select>
                    </div>
                    {filters.dateCreated === 'CUSTOM' && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--admin-label, #5B6B8A)' }}>From:</span>
                          <input
                            type="date"
                            className="form-control"
                            style={{ fontSize: '0.78rem', padding: '4px 8px', background: 'var(--admin-card-bg, #FFFFFF)', borderColor: 'var(--admin-card-border, #E0E7FF)', color: 'var(--color-text)', borderRadius: 6 }}
                            value={filters.dateFrom || ''}
                            onChange={(e) => updateFilter('dateFrom', e.target.value)}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--admin-label, #5B6B8A)' }}>To:</span>
                          <input
                            type="date"
                            className="form-control"
                            style={{ fontSize: '0.78rem', padding: '4px 8px', background: 'var(--admin-card-bg, #FFFFFF)', borderColor: 'var(--admin-card-border, #E0E7FF)', color: 'var(--color-text)', borderRadius: 6 }}
                            value={filters.dateTo || ''}
                            onChange={(e) => updateFilter('dateTo', e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 4, color: 'var(--admin-label, #5B6B8A)', fontWeight: 600 }}>Duration</label>
                      <select
                        className="form-select"
                        style={{ fontSize: '0.82rem', padding: '6px 10px', background: 'var(--admin-card-bg, #FFFFFF)', borderColor: 'var(--admin-card-border, #E0E7FF)', color: 'var(--color-text)', borderRadius: 6 }}
                        value={filters.duration || 'ALL'}
                        onChange={(e) => updateFilter('duration', e.target.value)}
                      >
                        <option value="ALL">All Durations</option>
                        <option value="LE_30">≤30 min</option>
                        <option value="31_60">31-60 min</option>
                        <option value="61_90">61-90 min</option>
                        <option value="GT_90">90+ min</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* SECTION 2: CONTENT */}
                <div
                  style={{
                    background: 'var(--filterbar-bg, #F4F6FF)',
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--admin-card-border, #E0E7FF)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--admin-indigo, #3E63DD)' }}>
                      📚 Content
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 4, color: 'var(--admin-label, #5B6B8A)', fontWeight: 600 }}>Passing Criteria</label>
                      <select
                        className="form-select"
                        style={{ fontSize: '0.82rem', padding: '6px 10px', background: 'var(--admin-card-bg, #FFFFFF)', borderColor: 'var(--admin-card-border, #E0E7FF)', color: 'var(--color-text)', borderRadius: 6 }}
                        value={filters.passingCriteria || 'ALL'}
                        onChange={(e) => updateFilter('passingCriteria', e.target.value)}
                      >
                        <option value="ALL">All Passing Criteria</option>
                        <option value="NO_MIN">No minimum (≥0 Qs)</option>
                        <option value="HAS_MIN">Has minimum (≥1 Qs)</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 4, color: 'var(--admin-label, #5B6B8A)', fontWeight: 600 }}>Question Set / Folder</label>
                      <select
                        className="form-select"
                        style={{ fontSize: '0.82rem', padding: '6px 10px', maxWidth: '100%', background: 'var(--admin-card-bg, #FFFFFF)', borderColor: 'var(--admin-card-border, #E0E7FF)', color: 'var(--color-text)', borderRadius: 6 }}
                        value={filters.folderId || 'ALL'}
                        onChange={(e) => updateFilter('folderId', e.target.value)}
                      >
                        <option value="ALL">All Folders / Pools</option>
                        {folders.map((f) => (
                          <option key={f._id} value={f._id} title={f.name}>
                            {f.name.length > 35 ? `${f.name.substring(0, 35)}...` : f.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 4, color: 'var(--admin-label, #5B6B8A)', fontWeight: 600 }}>Language</label>
                      <select
                        className="form-select"
                        style={{ fontSize: '0.82rem', padding: '6px 10px', background: 'var(--admin-card-bg, #FFFFFF)', borderColor: 'var(--admin-card-border, #E0E7FF)', color: 'var(--color-text)', borderRadius: 6 }}
                        value={filters.language || 'ALL'}
                        onChange={(e) => updateFilter('language', e.target.value)}
                      >
                        <option value="ALL">All Languages</option>
                        <option value="Python">Python</option>
                        <option value="Java">Java</option>
                        <option value="C++">C++</option>
                        <option value="JavaScript">JavaScript</option>
                        <option value="C">C</option>
                        <option value="React">React</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* SECTION 3: ACTIVITY */}
                <div
                  style={{
                    background: 'var(--filterbar-bg, #F4F6FF)',
                    padding: '12px 14px',
                    borderRadius: 8,
                    border: '1px solid var(--admin-card-border, #E0E7FF)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--admin-indigo, #3E63DD)' }}>
                      ⚡ Activity
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 4, color: 'var(--admin-label, #5B6B8A)', fontWeight: 600 }}>Room Status</label>
                      <select
                        className="form-select"
                        style={{ fontSize: '0.82rem', padding: '6px 10px', background: 'var(--admin-card-bg, #FFFFFF)', borderColor: 'var(--admin-card-border, #E0E7FF)', color: 'var(--color-text)', borderRadius: 6 }}
                        value={filters.roomStatus || 'ALL'}
                        onChange={(e) => updateFilter('roomStatus', e.target.value)}
                      >
                        <option value="ALL">All Room Statuses</option>
                        <option value="HAS_ACTIVE">Has active rooms</option>
                        <option value="NO_ACTIVE">No active rooms / all closed</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 4, color: 'var(--admin-label, #5B6B8A)', fontWeight: 600 }}>Candidate Activity</label>
                      <select
                        className="form-select"
                        style={{ fontSize: '0.82rem', padding: '6px 10px', background: 'var(--admin-card-bg, #FFFFFF)', borderColor: 'var(--admin-card-border, #E0E7FF)', color: 'var(--color-text)', borderRadius: 6 }}
                        value={filters.candidateActivity || 'ALL'}
                        onChange={(e) => updateFilter('candidateActivity', e.target.value)}
                      >
                        <option value="ALL">All Activity</option>
                        <option value="HAS_CANDIDATES">Has candidates</option>
                        <option value="NO_CANDIDATES">No candidates yet</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 4, color: 'var(--admin-label, #5B6B8A)', fontWeight: 600 }}>Violations Present</label>
                      <select
                        className="form-select"
                        style={{ fontSize: '0.82rem', padding: '6px 10px', background: 'var(--admin-card-bg, #FFFFFF)', borderColor: 'var(--admin-card-border, #E0E7FF)', color: 'var(--color-text)', borderRadius: 6 }}
                        value={filters.violations || 'ALL'}
                        onChange={(e) => updateFilter('violations', e.target.value)}
                      >
                        <option value="ALL">All Tests</option>
                        <option value="HAS_VIOLATIONS">Has flagged/disqualified candidates</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Panel Footer Controls */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                {advancedActiveCount > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '5px 10px', background: 'var(--admin-card-bg, #FFFFFF)', borderColor: 'var(--admin-card-border, #E0E7FF)', color: 'var(--filterbar-button-text, #1E293B)', borderRadius: 6 }}
                    onClick={() => {
                      setFilters({
                        dateCreated: 'ALL',
                        dateFrom: '',
                        dateTo: '',
                        duration: 'ALL',
                        passingCriteria: 'ALL',
                        folderId: 'ALL',
                        language: 'ALL',
                        roomStatus: 'ALL',
                        candidateActivity: 'ALL',
                        violations: 'ALL',
                      });
                    }}
                  >
                    Reset Advanced Filters
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: '0.78rem', padding: '5px 10px', background: 'var(--admin-card-bg, #FFFFFF)', borderColor: 'var(--admin-card-border, #E0E7FF)', color: 'var(--filterbar-button-text, #1E293B)', borderRadius: 6 }}
                  onClick={() => setShowMoreFilters(false)}
                >
                  Close Panel
                </button>
              </div>
            </div>
          )}

          {/* Active Filter Chips Row */}
          {activeChips.length > 0 && (
            <div
              style={{
                marginTop: 12,
                paddingTop: 10,
                borderTop: '1px solid var(--admin-card-border, #E0E7FF)',
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--admin-label, #5B6B8A)' }}>
                Active Filters:
              </span>
              {activeChips.map((chip) => (
                <span
                  key={chip.key}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'rgba(62, 99, 221, 0.1)',
                    color: 'var(--admin-indigo, #3E63DD)',
                    border: '1px solid rgba(62, 99, 221, 0.25)',
                    borderRadius: 16,
                    padding: '3px 10px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                  }}
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--admin-indigo, #3E63DD)',
                      cursor: 'pointer',
                      padding: 0,
                      fontSize: '0.85rem',
                      lineHeight: 1,
                      marginLeft: 2,
                      display: 'inline-flex',
                      alignItems: 'center',
                      opacity: 0.8,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.8')}
                    title="Remove filter"
                  >
                    ✕
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={handleClearAll}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#E74C3C',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  padding: '3px 6px',
                  textDecoration: 'underline',
                }}
                title="Reset all filters"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Tests Table */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 250 }}>
            <LoadingDots size="md" />
          </div>
        ) : tests.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '60px 20px', flexShrink: 0, background: 'var(--admin-card-bg, #FFFFFF)', border: '1px solid var(--admin-card-border, #E0E7FF)', borderRadius: 12, boxShadow: 'var(--admin-card-shadow)' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📋</div>
            <h3 style={{ color: 'var(--color-navy)', marginBottom: 8 }}>
              No tests found
            </h3>
            <p style={{ color: 'var(--admin-label, #5B6B8A)', fontSize: '0.9rem', marginBottom: 20 }}>
              Get started by creating your first proctored test
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn btn-primary"
              style={{ background: 'var(--admin-indigo, #3E63DD)', borderColor: 'var(--admin-indigo, #3E63DD)', color: '#ffffff', borderRadius: 8 }}
            >
              + Create New Test
            </button>
          </div>
        ) : (
          <div
            ref={tableContainerRef}
            className={`table-container test-table-scroll-container ${isScrolledLeft ? 'is-scrolled-x' : ''}`}
            onScroll={handleTableScroll}
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              background: 'var(--admin-card-bg, #FFFFFF)',
              border: '1px solid var(--admin-card-border, #E0E7FF)',
              borderRadius: 12,
              boxShadow: 'var(--admin-card-shadow)',
            }}
          >
            <table className="table" style={{ width: '100%', minWidth: 1480 }}>
              <thead>
                <tr>
                  {/* FEATURE-040 / FEATURE-029: Dual-axis sticky row index column (blank header) */}
                  <th className="sticky-col-index" style={{ width: 36, minWidth: 36, maxWidth: 36, textAlign: 'center' }}></th>
                  {/* BUG-103 / FEATURE-040: Dual-axis sticky 1-line Test Title column with badge */}
                  <th className="sticky-col-title" style={{ width: 215, minWidth: 210, maxWidth: 225, textAlign: 'left' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                      <span>Test Title</span>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: 'rgba(255, 255, 255, 0.15)',
                          color: '#ffffff',
                          letterSpacing: 'normal',
                          textTransform: 'none',
                          whiteSpace: 'nowrap',
                        }}
                        title={`Filtered result count: ${filteredTests.length}`}
                      >
                        {filteredTests.length} {filteredTests.length === 1 ? 'result' : 'results'}
                      </span>
                    </div>
                  </th>
                  <th style={{ width: 85, minWidth: 80, textAlign: 'center' }}>Type</th>
                  <th style={{ width: 80, minWidth: 75, textAlign: 'center' }}>Status</th>
                  {/* FEATURE-031: Smart Timeline column (Created & Live dates) */}
                  <th style={{ width: 115, minWidth: 105, textAlign: 'center' }}>Timeline</th>
                  <th style={{ width: 75, minWidth: 70, textAlign: 'center' }}>Duration</th>
                  {/* FEATURE-039: Live For Column */}
                  <th style={{ width: 95, minWidth: 90, textAlign: 'center' }}>Live For</th>
                  <th style={{ width: 95, minWidth: 90, textAlign: 'center' }}>Passing Criteria</th>
                  {/* FEATURE-032: Smart Submissions column (Submitted / Total Candidates) */}
                  <th style={{ width: 105, minWidth: 95, textAlign: 'center' }}>Submissions</th>
                  {/* FEATURE-039: Shortlisted Column */}
                  <th style={{ width: 95, minWidth: 85, textAlign: 'center' }}>Shortlisted</th>
                  {/* FEATURE-040 / FEATURE-038: Total Rooms column moved immediately after Submissions/Shortlisted */}
                  <th style={{ width: 75, minWidth: 70, textAlign: 'center' }}>Total Rooms</th>
                  <th style={{ width: 140, minWidth: 125, maxWidth: 160, textAlign: 'center' }}>Question Set</th>
                  {/* BUG-104 / BUG-103: Fixed Actions column width with 3-button slot grid */}
                  <th style={{ width: 290, minWidth: 285, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTests.length === 0 ? (
                  <tr>
                    <td colSpan={13} style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--admin-card-bg, #FFFFFF)' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔍</div>
                      <h3 style={{ color: 'var(--color-navy)', marginBottom: 8, fontSize: '1.1rem' }}>
                        No tests match your filter criteria
                      </h3>
                      <p style={{ color: 'var(--admin-label, #5B6B8A)', fontSize: '0.875rem', marginBottom: 16 }}>
                        Try adjusting or clearing your filters to see available tests
                      </p>
                      <button
                        onClick={handleClearAll}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.85rem', background: 'var(--filterbar-bg, #F4F6FF)', borderColor: 'var(--admin-card-border, #E0E7FF)', color: 'var(--filterbar-button-text, #1E293B)', borderRadius: 8 }}
                      >
                        Clear All Filters
                      </button>
                    </td>
                  </tr>
                ) : (
                  filteredTests.map((test, index) => {
                    let typeBadgeColor = 'var(--admin-indigo, #3E63DD)';
                    if (test.testType === 'AI_TEST') typeBadgeColor = '#8e44ad';
                    if (test.testType === 'REACT') typeBadgeColor = '#2563eb';
                    if (test.testType === 'JAVASCRIPT') typeBadgeColor = '#d97706';
                    if (test.testType === 'SPOJ') typeBadgeColor = 'var(--admin-indigo, #3E63DD)';

                    const questionSetName = test.questionSetPoolName || test.folderId?.name || test.questionSetId?.name || '—';

                    return (
                      <tr key={test._id}>
                        {/* FEATURE-040 / FEATURE-029: Position-based row index (1, 2, 3...) with frozen left-alignment */}
                        <td className="sticky-col-index" style={{ textAlign: 'center', color: 'var(--admin-label, #5B6B8A)', fontSize: '0.82rem', fontWeight: 600, width: 36, minWidth: 36, maxWidth: 36 }}>
                          {index + 1}
                        </td>
                        {/* FEATURE-040: Frozen Test Title with single-line ellipsis truncation and hover tooltip */}
                        <td className="sticky-col-title" style={{ width: 215, minWidth: 210, maxWidth: 225, fontWeight: 600, textAlign: 'left' }}>
                          <div
                            title={test.title}
                            style={{
                              maxWidth: 195,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <Link
                              to={`/admin/tests/${test._id}`}
                              style={{ color: 'var(--color-navy)', textDecoration: 'none' }}
                              className="hover-underline"
                            >
                              {test.title}
                            </Link>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span
                            className="badge"
                            style={{
                              background: `${typeBadgeColor}15`,
                              color: typeBadgeColor,
                              border: `1px solid ${typeBadgeColor}40`,
                              fontSize: '0.75rem',
                              whiteSpace: 'nowrap',
                              borderRadius: 6,
                            }}
                          >
                            {test.testType}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <TestStatusBadge
                            status={test.status}
                            style={{ fontSize: '0.75rem' }}
                          />
                        </td>
                        {/* FEATURE-031: Smart Timeline Column (Created & Live Dates) */}
                        {(() => {
                          const timelineInfo = getTestTimelineInfo(test);
                          return (
                            <td
                              style={{
                                color: 'var(--color-text)',
                                fontSize: '0.8rem',
                                whiteSpace: 'nowrap',
                                textAlign: 'center',
                                cursor: 'default',
                              }}
                              title={timelineInfo.tooltip}
                            >
                              {timelineInfo.isRange ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                  <span style={{ color: 'var(--admin-label, #5B6B8A)' }}>{timelineInfo.createdPart}</span>
                                  <span style={{ color: 'var(--admin-indigo, #3E63DD)', fontWeight: 600, fontSize: '0.8rem' }}>→</span>
                                  <span style={{ color: 'var(--color-navy)', fontWeight: 600 }}>{timelineInfo.livePart}</span>
                                </span>
                              ) : (
                                <span style={{ color: 'var(--admin-label, #5B6B8A)', fontWeight: 500 }}>
                                  {timelineInfo.display}
                                </span>
                              )}
                            </td>
                          );
                        })()}
                        <td style={{ color: 'var(--color-text)', fontSize: '0.85rem', whiteSpace: 'nowrap', textAlign: 'center' }}>
                          {test.durationMinutes} mins
                        </td>
                        {/* FEATURE-039: Live For Column */}
                        <td style={{ color: 'var(--color-text)', fontSize: '0.85rem', whiteSpace: 'nowrap', textAlign: 'center' }}>
                          {formatLiveFor(test, now)}
                        </td>
                        <td style={{ color: 'var(--color-text)', fontSize: '0.85rem', whiteSpace: 'nowrap', textAlign: 'center' }}>
                          ≥ {test.passingCriteria} Qs
                        </td>
                        {/* FEATURE-032: Smart Submissions Column (Submitted / Total Candidates) */}
                        {(() => {
                          const subInfo = getSubmissionsInfo(test);
                          return (
                            <td
                              style={{
                                fontSize: '0.85rem',
                                whiteSpace: 'nowrap',
                                textAlign: 'center',
                                cursor: 'default',
                              }}
                              title={subInfo.tooltip}
                            >
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 4,
                                  fontWeight: 600,
                                  color: 'var(--color-text)',
                                }}
                              >
                                <span style={{ color: subInfo.submitted > 0 ? subInfo.statusColor : 'var(--admin-label, #5B6B8A)' }}>
                                  {subInfo.submitted}
                                </span>
                                <span style={{ color: 'var(--admin-label, #5B6B8A)', fontWeight: 400 }}>/</span>
                                <span style={{ color: 'var(--color-text)' }}>
                                  {subInfo.total}
                                </span>
                              </span>
                            </td>
                          );
                        })()}
                        {/* FEATURE-039: Shortlisted Column */}
                        {(() => {
                          const slInfo = getShortlistedInfo(test);
                          return (
                            <td
                              style={{
                                fontSize: '0.85rem',
                                whiteSpace: 'nowrap',
                                textAlign: 'center',
                                cursor: slInfo.tooltip ? 'default' : 'inherit',
                                color: slInfo.color,
                                fontWeight: slInfo.count > 0 ? 600 : 500,
                              }}
                              title={slInfo.tooltip}
                            >
                              {slInfo.display}
                            </td>
                          );
                        })()}
                        {/* FEATURE-040 / FEATURE-038: Total Rooms Column immediately after Submissions/Shortlisted */}
                        <td style={{ color: 'var(--color-text)', fontSize: '0.85rem', whiteSpace: 'nowrap', textAlign: 'center' }}>
                          {test.totalRooms ?? test.roomCount ?? 0}
                        </td>
                        {/* BUG-87 & FOLLOW-UP: Truncate long question sets with ellipsis and hover tooltip */}
                        <td style={{ color: 'var(--color-text)', fontSize: '0.85rem', maxWidth: 160, textAlign: 'center' }}>
                          <div
                            title={questionSetName}
                            style={{
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: 150,
                              margin: '0 auto',
                            }}
                          >
                            {questionSetName}
                          </div>
                        </td>
                        {/* BUG-104 / BUG-103: Deterministic 3-slot fixed button grid for Actions column */}
                        <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '112px 94px 66px',
                              gap: 6,
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {/* Slot 1: Manage & Rooms (Always Present) */}
                            <Link
                              to={`/admin/tests/${test._id}`}
                              className="btn btn-secondary"
                              style={{
                                padding: '5px 8px',
                                fontSize: '0.78rem',
                                textAlign: 'center',
                                whiteSpace: 'nowrap',
                                background: 'var(--filterbar-bg, #F4F6FF)',
                                borderColor: 'var(--admin-card-border, #E0E7FF)',
                                color: 'var(--filterbar-button-text, #1E293B)',
                                borderRadius: 6,
                              }}
                            >
                              Manage &amp; Rooms
                            </Link>

                            {/* Slot 2: Live Monitor (LIVE) OR Test Summary (ENDED) OR Empty (DRAFT) */}
                            {test.status === 'LIVE' ? (
                              <Link
                                to={`/admin/tests/${test._id}/live`}
                                className="btn btn-primary"
                                style={{
                                  padding: '5px 8px',
                                  fontSize: '0.78rem',
                                  background: '#16a34a',
                                  borderColor: '#15803d',
                                  color: '#ffffff',
                                  textAlign: 'center',
                                  whiteSpace: 'nowrap',
                                  borderRadius: 6,
                                }}
                              >
                                Live Monitor
                              </Link>
                            ) : test.status === 'ENDED' ? (
                              <Link
                                to={`/admin/tests/${test._id}/live`}
                                className="btn btn-secondary"
                                style={{
                                  padding: '5px 8px',
                                  fontSize: '0.78rem',
                                  textAlign: 'center',
                                  whiteSpace: 'nowrap',
                                  background: 'var(--filterbar-bg, #F4F6FF)',
                                  borderColor: 'var(--admin-card-border, #E0E7FF)',
                                  color: 'var(--filterbar-button-text, #1E293B)',
                                  borderRadius: 6,
                                }}
                                title="View frozen post-test operational summary"
                              >
                                Test Summary
                              </Link>
                            ) : (
                              <div />
                            )}

                            {/* Slot 3: Results (ENDED) OR Delete 🗑️ (DRAFT) OR Empty (LIVE) */}
                            {test.status === 'ENDED' ? (
                              <Link
                                to={`/admin/tests/${test._id}/results`}
                                className="btn btn-primary"
                                style={{
                                  padding: '5px 8px',
                                  fontSize: '0.78rem',
                                  textAlign: 'center',
                                  whiteSpace: 'nowrap',
                                  background: 'var(--admin-indigo, #3E63DD)',
                                  borderColor: 'var(--admin-indigo, #3E63DD)',
                                  color: '#ffffff',
                                  borderRadius: 6,
                                }}
                              >
                                Results
                              </Link>
                            ) : test.status === 'DRAFT' ? (
                              <button
                                onClick={() => setDeleteTarget(test)}
                                className="btn btn-danger"
                                style={{
                                  padding: '5px 8px',
                                  fontSize: '0.78rem',
                                  textAlign: 'center',
                                  width: '100%',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: '#dc2626',
                                  borderColor: '#b91c1c',
                                  color: '#ffffff',
                                  borderRadius: 6,
                                }}
                                title="Delete Test"
                              >
                                🗑️
                              </button>
                            ) : (
                              <div />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  }))}
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
            <div className="modal-container" style={{ maxWidth: 450, background: 'var(--admin-card-bg, #FFFFFF)', border: '1px solid var(--admin-card-border, #E0E7FF)', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)', borderRadius: 14, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header" style={{ padding: '16px 20px', background: 'var(--filterbar-bg, #F4F6FF)', borderBottom: '1px solid var(--admin-card-border, #E0E7FF)' }}>
                <h3 className="modal-title" style={{ color: '#dc2626', margin: 0, fontWeight: 700 }}>Delete Test</h3>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--admin-label, #5B6B8A)' }}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body" style={{ padding: '20px 24px', background: 'var(--admin-card-bg, #FFFFFF)' }}>
                <p style={{ color: 'var(--color-text)', fontSize: '0.9rem', margin: 0 }}>
                  Are you sure you want to delete test <strong>"{deleteTarget.title}"</strong>? This action cannot be undone.
                </p>
              </div>
              <div className="modal-footer" style={{ padding: '14px 20px', background: 'var(--filterbar-bg, #F4F6FF)', borderTop: '1px solid var(--admin-card-border, #E0E7FF)', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="btn btn-secondary"
                  style={{ background: 'var(--admin-card-bg, #FFFFFF)', borderColor: 'var(--admin-card-border, #E0E7FF)', color: 'var(--filterbar-button-text, #1E293B)', borderRadius: 8 }}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  className="btn btn-danger"
                  style={{ background: '#dc2626', borderColor: '#b91c1c', color: '#ffffff', borderRadius: 8 }}
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
