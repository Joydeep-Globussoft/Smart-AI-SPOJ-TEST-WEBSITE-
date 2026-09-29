// AdminDashboard.jsx — Admin Overview & Landing Screen
// Note: Per user instruction and PRD Rule 1, summary widgets and metrics are flagged as // ASSUMPTION, FEATURE-021
import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AdminNavbar from '../../shared/AdminNavbar';
import TestStatusBadge from '../../shared/TestStatusBadge';
import CreateTestModal from '../../shared/CreateTestModal';
import LoadingDots from '../../shared/LoadingDots';
import { useAuth } from '../../hooks/useAuthContext';
import api from '../../services/apiClient';
import useScrollRestoration from '../../hooks/useScrollRestoration';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, isSuperAdmin } = useAuth();

  const [tests, setTests] = useState([]);
  const [questionSets, setQuestionSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // FEATURE-021: Preserved scroll position for Dashboard overview
  useScrollRestoration({
    loading,
    key: 'dashboard_overview',
    dependencies: [tests.length, questionSets.length],
  });

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
    <div
      className="app-layout"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--admin-canvas-bg, #EEF2FF)',
      }}
    >
      <AdminNavbar />
      <main
        className="main-content"
        style={{
          maxWidth: 1440,
          width: '100%',
          margin: '0 auto',
          padding: '24px 28px',
          flex: 1,
          background: 'var(--admin-canvas-bg, #EEF2FF)',
        }}
      >
        {/* Welcome Header */}
        <div
          className="admin-welcome-card"
          style={{
            marginBottom: 24,
            padding: '24px 28px',
            backgroundColor: 'var(--admin-card-bg, #FFFFFF)',
            border: '1px solid var(--admin-card-border, #E0E7FF)',
            borderRadius: '14px',
            boxShadow: 'var(--admin-card-shadow)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <h1 style={{ fontSize: '1.75rem', color: 'var(--color-navy, #1E293B)', fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>
                  Welcome back, {user?.name || 'Super Admin'}
                </h1>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    background: 'rgba(62, 99, 221, 0.1)',
                    color: 'var(--admin-indigo, #3E63DD)',
                    border: '1px solid rgba(62, 99, 221, 0.25)',
                    textTransform: 'uppercase',
                  }}
                >
                  {user?.role || 'SUPER_ADMIN'}
                </span>
              </div>
              <p style={{ color: 'var(--color-text-muted, #64748B)', fontSize: '0.92rem', margin: 0 }}>
                Globussoft Technology — AI Proctored Assessment Platform
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="btn btn-primary"
                style={{
                  background: 'var(--admin-indigo, #3E63DD)',
                  borderColor: 'var(--admin-indigo, #3E63DD)',
                  color: '#ffffff',
                  padding: '10px 22px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  boxShadow: '0 2px 6px rgba(62, 99, 221, 0.25)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>+</span> Create New Test
              </button>
            </div>
          </div>
        </div>

        {/* ── FEATURE-028: Clickable Summary Metric Cards with Filtered Navigation ── */}
        <div
          className="stats-grid"
          style={{
            marginBottom: 24,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 16,
          }}
        >
          <Link
            to="/admin/tests?status=LIVE"
            className="stat-card stat-card-clickable"
            style={{
              backgroundColor: 'var(--admin-card-bg, #FFFFFF)',
              border: '1px solid var(--admin-card-border, #E0E7FF)',
              borderTop: '3.5px solid #16a34a',
              borderRadius: '12px',
              boxShadow: 'var(--admin-card-shadow)',
              padding: '20px 22px',
              textDecoration: 'none',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'all 0.18s ease',
            }}
            title="View Active LIVE Tests"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#16a34a', lineHeight: 1, letterSpacing: '-0.02em' }}>
                {liveTests.length}
              </div>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '3px 8px',
                  borderRadius: '9999px',
                  background: 'rgba(22, 163, 74, 0.12)',
                  color: '#16a34a',
                  border: '1px solid rgba(22, 163, 74, 0.25)',
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#16a34a' }} />
                LIVE
              </span>
            </div>
            <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--color-text-muted, #64748B)', marginTop: 12 }}>
              Active LIVE Tests
            </div>
          </Link>

          <Link
            to="/admin/tests"
            className="stat-card stat-card-clickable"
            style={{
              backgroundColor: 'var(--admin-card-bg, #FFFFFF)',
              border: '1px solid var(--admin-card-border, #E0E7FF)',
              borderTop: '3.5px solid var(--admin-indigo, #3E63DD)',
              borderRadius: '12px',
              boxShadow: 'var(--admin-card-shadow)',
              padding: '20px 22px',
              textDecoration: 'none',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'all 0.18s ease',
            }}
            title="View All Tests"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: 'var(--admin-indigo, #3E63DD)', lineHeight: 1, letterSpacing: '-0.02em' }}>
                {tests.length}
              </div>
              <span style={{ fontSize: '1.25rem' }}>📋</span>
            </div>
            <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--color-text-muted, #64748B)', marginTop: 12 }}>
              Total Tests Created
            </div>
          </Link>

          <Link
            to="/admin/question-bank"
            className="stat-card stat-card-clickable"
            style={{
              backgroundColor: 'var(--admin-card-bg, #FFFFFF)',
              border: '1px solid var(--admin-card-border, #E0E7FF)',
              borderTop: '3.5px solid #8B5CF6',
              borderRadius: '12px',
              boxShadow: 'var(--admin-card-shadow)',
              padding: '20px 22px',
              textDecoration: 'none',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'all 0.18s ease',
            }}
            title="View Question Bank"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#8B5CF6', lineHeight: 1, letterSpacing: '-0.02em' }}>
                {questionSets.length}
              </div>
              <span style={{ fontSize: '1.25rem' }}>💡</span>
            </div>
            <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--color-text-muted, #64748B)', marginTop: 12 }}>
              Question Sets
            </div>
          </Link>

          <Link
            to="/admin/tests?status=ENDED"
            className="stat-card stat-card-clickable"
            style={{
              backgroundColor: 'var(--admin-card-bg, #FFFFFF)',
              border: '1px solid var(--admin-card-border, #E0E7FF)',
              borderTop: '3.5px solid #0EA5E9',
              borderRadius: '12px',
              boxShadow: 'var(--admin-card-shadow)',
              padding: '20px 22px',
              textDecoration: 'none',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'all 0.18s ease',
            }}
            title="View Completed Assessments"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#0EA5E9', lineHeight: 1, letterSpacing: '-0.02em' }}>
                {endedTests.length}
              </div>
              <span style={{ fontSize: '1.25rem' }}>🏁</span>
            </div>
            <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--color-text-muted, #64748B)', marginTop: 12 }}>
              Completed Assessments
            </div>
          </Link>
        </div>

        {/* 2-Column Section: Active/Recent Tests & Quick Navigation */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 1.6fr) minmax(280px, 1fr)', gap: 24 }}>
          
          {/* Active & Recent Tests */}
          <div
            className="card"
            style={{
              backgroundColor: 'var(--admin-card-bg, #FFFFFF)',
              border: '1px solid var(--admin-card-border, #E0E7FF)',
              borderRadius: '14px',
              boxShadow: 'var(--admin-card-shadow)',
              padding: '24px 26px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-navy, #1E293B)', margin: 0 }}>
                Recent Assessments
              </h3>
              <Link
                to="/admin/tests"
                style={{
                  fontSize: '0.875rem',
                  color: 'var(--admin-indigo, #3E63DD)',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                View All ({tests.length}) →
              </Link>
            </div>

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                <LoadingDots size="md" />
              </div>
            ) : tests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--color-text-muted, #64748B)' }}>
                <p style={{ marginBottom: 14 }}>No tests created yet.</p>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="btn btn-primary"
                  style={{
                    fontSize: '0.85rem',
                    background: 'var(--admin-indigo, #3E63DD)',
                    borderColor: 'var(--admin-indigo, #3E63DD)',
                    color: '#ffffff',
                    padding: '8px 18px',
                    borderRadius: '8px',
                    fontWeight: 600,
                  }}
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
                        padding: '14px 18px',
                        borderRadius: '10px',
                        border: '1px solid var(--admin-card-border, #E0E7FF)',
                        background: 'var(--filterbar-bg, #F4F6FF)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 14,
                        flexWrap: 'wrap',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ minWidth: '220px', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                          <strong style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-navy, #1E293B)' }}>
                            {test.title}
                          </strong>
                          <TestStatusBadge
                            status={test.status}
                            style={{ fontSize: '0.68rem' }}
                          />
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748B)' }}>
                          Type: <strong style={{ color: 'var(--color-navy, #1E293B)' }}>{test.testType}</strong> · {test.durationMinutes} mins · Criteria: ≥ {test.passingCriteria} Qs
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {test.status === 'LIVE' && (
                          <Link
                            to={`/admin/tests/${test._id}/live`}
                            style={{
                              padding: '6px 14px',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              background: '#16a34a',
                              color: '#ffffff',
                              borderRadius: '6px',
                              border: '1px solid #15803d',
                              textDecoration: 'none',
                              boxShadow: '0 1px 3px rgba(22, 163, 74, 0.2)',
                            }}
                          >
                            Live Monitor
                          </Link>
                        )}
                        {test.status === 'ENDED' && (
                          <>
                            <Link
                              to={`/admin/tests/${test._id}/live`}
                              style={{
                                padding: '6px 12px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                background: 'var(--admin-card-bg, #FFFFFF)',
                                color: 'var(--filterbar-button-text, #1E293B)',
                                borderRadius: '6px',
                                border: '1px solid var(--admin-card-border, #E0E7FF)',
                                textDecoration: 'none',
                              }}
                              title="Test Summary"
                            >
                              Summary
                            </Link>
                            <Link
                              to={`/admin/tests/${test._id}/results`}
                              style={{
                                padding: '6px 14px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                background: 'var(--admin-indigo, #3E63DD)',
                                color: '#ffffff',
                                borderRadius: '6px',
                                border: '1px solid var(--admin-indigo, #3E63DD)',
                                textDecoration: 'none',
                                boxShadow: '0 1px 3px rgba(62, 99, 221, 0.2)',
                              }}
                            >
                              Results
                            </Link>
                          </>
                        )}
                        <Link
                          to={`/admin/tests/${test._id}`}
                          style={{
                            padding: '6px 12px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            background: 'var(--admin-card-bg, #FFFFFF)',
                            color: 'var(--filterbar-button-text, #1E293B)',
                            borderRadius: '6px',
                            border: '1px solid var(--admin-card-border, #E0E7FF)',
                            textDecoration: 'none',
                          }}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            
            {/* Quick Links Card */}
            <div
              className="card"
              style={{
                backgroundColor: 'var(--admin-card-bg, #FFFFFF)',
                border: '1px solid var(--admin-card-border, #E0E7FF)',
                borderRadius: '14px',
                boxShadow: 'var(--admin-card-shadow)',
                padding: '24px 26px',
              }}
            >
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-navy, #1E293B)', margin: '0 0 16px 0' }}>
                Quick Actions
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Link
                  to="/admin/tests"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    background: 'var(--filterbar-bg, #F4F6FF)',
                    border: '1px solid var(--admin-card-border, #E0E7FF)',
                    borderRadius: '10px',
                    color: 'var(--color-navy, #1E293B)',
                    textDecoration: 'none',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>📋</span> Manage All Tests &amp; Rooms
                </Link>
                <Link
                  to="/admin/question-bank"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    background: 'var(--filterbar-bg, #F4F6FF)',
                    border: '1px solid var(--admin-card-border, #E0E7FF)',
                    borderRadius: '10px',
                    color: 'var(--color-navy, #1E293B)',
                    textDecoration: 'none',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>💡</span> Question Bank &amp; Test Cases
                </Link>
                {isSuperAdmin && (
                  <Link
                    to="/admin/create-admin"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 16px',
                      background: 'var(--filterbar-bg, #F4F6FF)',
                      border: '1px solid var(--admin-card-border, #E0E7FF)',
                      borderRadius: '10px',
                      color: 'var(--color-navy, #1E293B)',
                      textDecoration: 'none',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span style={{ fontSize: '1.1rem' }}>👥</span> Manage Admin Accounts (Super Admin)
                  </Link>
                )}
              </div>
            </div>

            {/* ASSUMPTION: Microservices & Engine Readiness Status Card */}
            <div
              className="card"
              style={{
                backgroundColor: 'var(--admin-card-bg, #FFFFFF)',
                border: '1px solid var(--admin-card-border, #E0E7FF)',
                borderRadius: '14px',
                boxShadow: 'var(--admin-card-shadow)',
                padding: '24px 26px',
              }}
            >
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-navy, #1E293B)', margin: '0 0 16px 0' }}>
                System Services Status
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--admin-card-border, #E0E7FF)',
                    paddingBottom: 10,
                  }}
                >
                  <span style={{ color: 'var(--color-navy, #1E293B)', fontWeight: 500, fontSize: '0.86rem' }}>
                    Socket.io Realtime Server
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      letterSpacing: '0.03em',
                      background: 'rgba(22, 163, 74, 0.1)',
                      color: '#16a34a',
                      border: '1px solid rgba(22, 163, 74, 0.25)',
                      textTransform: 'uppercase',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#16a34a' }} />
                    Ready
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--admin-card-border, #E0E7FF)',
                    paddingBottom: 10,
                  }}
                >
                  <span style={{ color: 'var(--color-navy, #1E293B)', fontWeight: 500, fontSize: '0.86rem' }}>
                    Judge0 Code Execution
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      letterSpacing: '0.03em',
                      background: 'rgba(22, 163, 74, 0.1)',
                      color: '#16a34a',
                      border: '1px solid rgba(22, 163, 74, 0.25)',
                      textTransform: 'uppercase',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#16a34a' }} />
                    Connected
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 2 }}>
                  <span style={{ color: 'var(--color-navy, #1E293B)', fontWeight: 500, fontSize: '0.86rem' }}>
                    Kimi AI LLM Adapter
                  </span>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      letterSpacing: '0.03em',
                      background: 'rgba(22, 163, 74, 0.1)',
                      color: '#16a34a',
                      border: '1px solid rgba(22, 163, 74, 0.25)',
                      textTransform: 'uppercase',
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#16a34a' }} />
                    Configured
                  </span>
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
