// ProctorWarningModal.jsx — Official Candidate Proctor Warning Modal (BUG-64)
// Displays a prominent, distinct modal when an admin issues an official proctor warning for malpractice.
import React from 'react';

const VIOLATION_LABELS = {
  TAB_SWITCH: { label: 'TAB SWITCH', icon: '🔄', desc: 'Navigating away from the active exam tab or window.' },
  FULLSCREEN_EXIT: { label: 'FULLSCREEN EXIT', icon: '⛶', desc: 'Exiting full-screen examination mode.' },
  PHONE_DETECTED: { label: 'PHONE DETECTED', icon: '📱', desc: 'Mobile device or prohibited electronic device detected.' },
  MULTIPLE_FACES: { label: 'MULTIPLE FACES DETECTED', icon: '👥', desc: 'More than one face detected in the camera view.' },
  NO_FACE_15MIN: { label: 'NO FACE DETECTED', icon: '👤', desc: 'Candidate face was absent from camera frame for extended duration.' },
  CAMERA_DISCONNECTED: { label: 'CAMERA DISCONNECTED', icon: '📷', desc: 'Video stream or webcam feed was interrupted.' },
  OTHER: { label: 'SUSPICIOUS ACTIVITY', icon: '⚠️', desc: 'Proctor observed activity violating exam integrity guidelines.' },
};

export default function ProctorWarningModal({ warning, onAcknowledge, queueCount = 0 }) {
  if (!warning) return null;

  const violationType = warning.violationType || 'OTHER';
  const violationInfo = VIOLATION_LABELS[violationType] || {
    label: violationType.replace(/_/g, ' '),
    icon: '⚠️',
    desc: 'Activity violating examination integrity policies.',
  };

  const formattedTime = warning.issuedAt
    ? new Date(warning.issuedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : new Date().toLocaleTimeString();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="proctor-warning-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '540px',
          background: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(220, 38, 38, 0.35), 0 0 0 2px #EF4444',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Top Header Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
            padding: '20px 24px',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.2)',
              border: '2px solid rgba(255, 255, 255, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              flexShrink: 0,
            }}
          >
            🛡️
          </div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 800,
                color: '#FECACA',
                marginBottom: '2px',
              }}
            >
              Direct Proctor Intervention
            </div>
            <h2
              id="proctor-warning-title"
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: '#ffffff',
                margin: 0,
                letterSpacing: '0.02em',
              }}
            >
              OFFICIAL PROCTOR WARNING
            </h2>
          </div>
          {queueCount > 1 && (
            <span
              style={{
                background: 'rgba(255, 255, 255, 0.25)',
                color: '#ffffff',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              1 of {queueCount}
            </span>
          )}
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <p style={{ margin: 0, color: '#334155', fontSize: '0.95rem', lineHeight: 1.5 }}>
            A test administrator has issued an official warning regarding your active examination session.
          </p>

          {/* Highlighted Violation Card */}
          <div
            style={{
              background: '#FEF2F2',
              border: '1.5px solid #F87171',
              borderRadius: '10px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                color: '#991B1B',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Warning Triggered For:
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.3rem' }}>{violationInfo.icon}</span>
              <strong style={{ fontSize: '1.1rem', color: '#B91C1C', fontWeight: 800 }}>
                {violationInfo.label}
              </strong>
            </div>
            <div style={{ fontSize: '0.82rem', color: '#7F1D1D', marginTop: '2px' }}>
              {violationInfo.desc}
            </div>
          </div>

          {/* Rules & Consequences Notice */}
          <div
            style={{
              background: '#FFFBEB',
              border: '1px solid #FCD34D',
              borderRadius: '8px',
              padding: '12px 14px',
              fontSize: '0.82rem',
              color: '#92400E',
              lineHeight: 1.45,
            }}
          >
            ⚠️ <strong>Important:</strong> Please ensure you remain focused on the exam and refrain from further unauthorized actions. Continued infractions may lead to <strong>immediate disqualification</strong>.
          </div>

          {/* Metadata Footer info */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '0.78rem',
              color: '#64748B',
              paddingTop: '6px',
              borderTop: '1px solid #E2E8F0',
            }}
          >
            <span>
              Issued by: <strong>{warning.adminName || 'Exam Proctor'}</strong>
            </span>
            <span>
              Timestamp: <strong>{formattedTime}</strong>
            </span>
          </div>
        </div>

        {/* Modal Footer with Acknowledge Button */}
        <div
          style={{
            padding: '16px 24px 20px',
            background: '#F8FAFC',
            borderTop: '1px solid #E2E8F0',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onAcknowledge}
            style={{
              background: '#DC2626',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 28px',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)',
              transition: 'background 0.15s ease',
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = '#B91C1C'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = '#DC2626'; }}
          >
            ✓ I Acknowledge &amp; Understand
          </button>
        </div>
      </div>
    </div>
  );
}
