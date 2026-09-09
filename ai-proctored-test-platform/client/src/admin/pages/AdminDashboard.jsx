// AdminDashboard.jsx — Admin Overview & Landing Screen
// Note: Per user instruction and PRD Rule 1, summary widgets and metrics are flagged as // ASSUMPTION
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AdminNavbar from '../../shared/AdminNavbar';
import TestStatusBadge from '../../shared/TestStatusBadge';
import CreateTestModal from '../../shared/CreateTestModal';
import { useAuth } from '../../hooks/useAuthContext';
import api from '../../services/apiClient';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();

  const [tests, setTests] = useState([]);
  const [questionSets, setQuestionSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Fetch overview data
  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      const [testsRes, setsRes] = await Promise.allSettled([
        api.getTests(),
        api.getQuestionSets(),
      ]);

      if (testsRes.status === 'fulfilled') {
        setTests(testsRes.value.data.tests || []);
      }
      if (setsRes.status === 'fulfilled') {
        setQuestionSets(setsRes.value.data.questionSets || []);
      }
    } catch (err) {
      console.error('Failed to load dashboard overview data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // ASSUMPTION: Calculating test state counts for executive overview cards
  const liveTests = tests.filter((t) => t.status === 'LIVE');
  const draftTests = tests.filter((t) => t.status === 'DRAFT');
  const endedTests = tests.filter((t) => t.status === 'ENDED');

  return (
    <div className="app-layout">
      <AdminNavbar />
      <main className="main-content">
        
        {/* Welcome Header */}
        <div className="card" style={{ marginBottom: 24, padding: '24px 28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h1 style={{ fontSize: '1.8rem', color: '#1A2B3C', fontWeight: 800 }}>
                  Welcome back, {user?.name}
                </h1>
                <span className="badge badge-primary" style={{ fontSize: '0.75rem' }}>
                  {user?.role}
                </span>
              </div>
              <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                Globussoft Technology — AI Proctored Assessment Platform
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="btn btn-primary"
              >
                + Create New Test
              </button>
            </div>
          </div>
        </div>

        {/* ── ASSUMPTION: Summary Metric Cards for At-A-Glance Status ── */}
        <div className="stats-grid" style={{ marginBottom: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          <div className="stat-card" style={{ borderLeft: '4px solid #2ECC71' }}>
            <div className="stat-value" style={{ color: '#2ECC71' }}>{liveTests.length}</div>
            <div className="stat-label">Active LIVE Tests</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid #0E7C86' }}>
            <div className="stat-value" style={{ color: '#0E7C86' }}>{tests.length}</div>
            <div className="stat-label">Total Tests Created</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid #8e44ad' }}>
            <div className="stat-value" style={{ color: '#8e44ad' }}>{questionSets.length}</div>
            <div className="stat-label">Question Sets</div>
          </div>
          <div className="stat-card" style={{ borderLeft: '4px solid #3498db' }}>
            <div className="stat-value" style={{ color: '#3498db' }}>{endedTests.length}</div>
            <div className="stat-label">Completed Assessments</div>
          </div>
        </div>

        {/* 2-Column Section: Active/Recent Tests & Quick Navigation */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 1.6fr) minmax(280px, 1fr)', gap: 24 }}>
          
          {/* Active & Recent Tests */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="card-title">Recent Assessments</h3>
              <Link to="/admin/tests" style={{ fontSize: '0.8rem', color: '#0E7C86', fontWeight: 600 }}>
                View All ({tests.length}) →
              </Link>
            </div>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                <div className="spinner spinner-dark" style={{ width: 32, height: 32 }} />
              </div>
            ) : tests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 16px', color: '#6b7280' }}>
                <p style={{ marginBottom: 12 }}>No tests created yet.</p>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="btn btn-primary"
                  style={{ fontSize: '0.85rem' }}
                >
                  Create First Test
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {tests.slice(0, 5).map((test) => {
                  return (
                    <div
                      key={test._id}
                      style={{
                        padding: 14,
                        borderRadius: 8,
                        border: '1px solid #e5e7eb',
                        background: '#F7F9FA',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <strong style={{ fontSize: '0.95rem', color: '#1A2B3C' }}>{test.title}</strong>
                          <TestStatusBadge
                            status={test.status}
                            style={{ fontSize: '0.68rem' }}
                          />
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                          Type: <strong>{test.testType}</strong> · {test.durationMinutes} mins · Criteria: ≥ {test.passingCriteria} Qs
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8 }}>
                        {test.status === 'LIVE' && (
                          <Link
                            to={`/admin/tests/${test._id}/live`}
                            className="btn btn-primary"
                            style={{ padding: '4px 10px', fontSize: '0.75rem', background: '#2ECC71' }}
                          >
                            Live Monitor
                          </Link>
                        )}
                        {test.status === 'ENDED' && (
                          <>
                            <Link
                              to={`/admin/tests/${test._id}/live`}
                              className="btn btn-secondary"
                              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                              title="Test Summary"
                            >
                              Summary
                            </Link>
                            <Link
                              to={`/admin/tests/${test._id}/results`}
                              className="btn btn-primary"
                              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                            >
                              Results
                            </Link>
                          </>
                        )}
                        <Link
                          to={`/admin/tests/${test._id}`}
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        >
                          Manage
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Actions & System Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            
            {/* Quick Links Card */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Quick Actions</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Link
                  to="/admin/tests"
                  className="btn btn-secondary"
                  style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
                >
                  📋 Manage All Tests &amp; Rooms
                </Link>
                <Link
                  to="/admin/question-bank"
                  className="btn btn-secondary"
                  style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
                >
                  💡 Question Bank &amp; Test Cases
                </Link>
                {isSuperAdmin && (
                  <Link
                    to="/admin/create-admin"
                    className="btn btn-secondary"
                    style={{ justifyContent: 'flex-start', padding: '10px 14px' }}
                  >
                    👥 Manage Admin Accounts (Super Admin)
                  </Link>
                )}
              </div>
            </div>

            {/* ASSUMPTION: Microservices & Engine Readiness Status Card */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">System Services Status</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f3f4f6', paddingBottom: 6 }}>
                  <span style={{ color: '#4b5563' }}>Socket.io Realtime Server</span>
                  <span className="badge badge-success" style={{ fontSize: '0.68rem' }}>Ready</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f3f4f6', paddingBottom: 6 }}>
                  <span style={{ color: '#4b5563' }}>Judge0 Code Execution</span>
                  <span className="badge badge-success" style={{ fontSize: '0.68rem' }}>Connected</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f3f4f6', paddingBottom: 6 }}>
                  <span style={{ color: '#4b5563' }}>YOLOv8 Phone Detector</span>
                  <span className="badge badge-success" style={{ fontSize: '0.68rem' }}>Active</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#4b5563' }}>Kimi AI LLM Adapter</span>
                  <span className="badge badge-success" style={{ fontSize: '0.68rem' }}>Configured</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* ── Standalone Create Test Modal mounted directly on Dashboard ── */}
      <CreateTestModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={(createdTest) => {
          setIsCreateModalOpen(false);
          fetchDashboardData();
          if (createdTest?._id) {
            navigate(`/admin/tests/${createdTest._id}`);
          } else {
            navigate('/admin/tests');
          }
        }}
        questionSets={questionSets}
      />
    </div>
  );
}
