import React from 'react';
import toast from 'react-hot-toast';
import FooterViolationCounter from './FooterViolationCounter';

/**
 * TestFooter — FEATURE-004
 * Shared persistent bottom status & proctoring footer bar across all candidate assessment interfaces
 * (SPOJ, JavaScript, React, AI_TEST).
 *
 * @param {Object} props
 * @param {Object} props.proctoring - useProctoring hook return object ({ videoRef, faceCount, ... })
 * @param {number} props.violationCount - live count of malpractice logs recorded for this candidate
 * @param {Function} [props.onReportIssue] - Optional custom handler for Report Issue button
 */
export default function TestFooter({ proctoring, violationCount = 0, onReportIssue }) {
  const handleReportIssue = () => {
    if (onReportIssue) {
      onReportIssue();
    } else {
      toast('Proctoring support notified. An admin is monitoring your session.', { icon: 'ℹ️' });
    }
  };

  const isFaceDetected = proctoring?.faceCount === 1;

  return (
    <div
      id="candidate-test-footer"
      style={{
        height: 46,
        background: '#0b1120',
        borderTop: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        fontSize: '0.8rem',
        color: '#94a3b8',
        flexShrink: 0,
        zIndex: 50,
        gap: 12,
        userSelect: 'none',
      }}
    >
      {/* ── Left Section: Webcam mini feed, Face status, Proctored badge, Live Violation Counter ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {/* Webcam mini feed */}
        <div
          style={{
            position: 'relative',
            width: 58,
            height: 36,
            background: '#000',
            borderRadius: 4,
            overflow: 'hidden',
            border: '1px solid #334155',
          }}
        >
          {proctoring?.videoRef && (
            <video
              ref={proctoring.videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          <div
            style={{
              position: 'absolute',
              top: 2,
              left: 2,
              background: 'rgba(0,0,0,0.75)',
              color: '#ef4444',
              fontSize: '0.55rem',
              padding: '1px 3px',
              borderRadius: 2,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 2,
            }}
          >
            ● REC
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: 2,
              left: 2,
              background: 'rgba(0,0,0,0.75)',
              color: isFaceDetected ? '#22c55e' : '#ef4444',
              fontSize: '0.5rem',
              padding: '1px 3px',
              borderRadius: 2,
              fontWeight: 600,
            }}
          >
            {isFaceDetected ? '✓ Face' : '✗ No Face'}
          </div>
        </div>

        <span style={{ color: '#cbd5e1', fontWeight: 600, fontSize: '0.8rem' }}>Proctored</span>

        {/* Live Violation Counter (FEATURE-003, FEATURE-004) */}
        <FooterViolationCounter count={violationCount} />
      </div>

      {/* ── Center Section: Monitored Assessment Advisory ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: '#f59e0b',
          fontSize: '0.78rem',
          textAlign: 'center',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        <span>⚠️</span>
        <span>Do not switch tabs or open other applications. Violations are monitored.</span>
      </div>

      {/* ── Right Section: System health status & Report Issue action ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#22c55e', fontSize: '0.78rem' }}>
          <span>●</span>
          <span style={{ color: '#cbd5e1' }}>All systems normal</span>
          <span style={{ color: '#64748b' }}>📶</span>
        </div>
        <button
          id="test-footer-report-issue-btn"
          type="button"
          onClick={handleReportIssue}
          style={{
            background: 'transparent',
            border: '1px solid #334155',
            color: '#cbd5e1',
            padding: '4px 10px',
            borderRadius: 4,
            fontSize: '0.75rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            transition: 'background 0.2s, border-color 0.2s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(51, 65, 85, 0.4)';
            e.currentTarget.style.borderColor = '#475569';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = '#334155';
          }}
        >
          🚨 Report Issue
        </button>
      </div>
    </div>
  );
}
