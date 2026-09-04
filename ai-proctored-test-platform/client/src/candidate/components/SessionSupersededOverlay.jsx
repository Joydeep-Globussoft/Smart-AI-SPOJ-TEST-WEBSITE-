import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * SessionSupersededOverlay (BUG-53)
 *
 * Full-screen blocking overlay rendered when a candidate opens/resumes their exam
 * in another tab or window. The previous session tab is invalidated to prevent
 * dual-session exploitation while preserving timer continuation and saved progress.
 */
export default function SessionSupersededOverlay({ isVisible, message }) {
  const navigate = useNavigate();

  if (!isVisible) return null;

  return (
    <div
      id="session-superseded-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 100000,
        background: 'rgba(15, 23, 42, 0.98)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          maxWidth: '520px',
          width: '100%',
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '16px',
          padding: '36px 32px',
          textAlign: 'center',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '2px solid rgba(239, 68, 68, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
          }}
        >
          🔒
        </div>

        <div>
          <h2
            style={{
              fontSize: '1.4rem',
              fontWeight: 700,
              color: '#ffffff',
              margin: '0 0 10px 0',
            }}
          >
            Session Resumed in Another Window
          </h2>
          <p
            style={{
              fontSize: '0.925rem',
              color: '#94a3b8',
              lineHeight: 1.6,
              margin: 0,
            }}
          >
            {message ||
              'You have opened or resumed this test in another browser tab or window. To ensure exam integrity, only one active session is allowed at a time. All your progress has been safely saved.'}
          </p>
        </div>

        <div
          style={{
            width: '100%',
            padding: '12px 16px',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            borderRadius: '8px',
            color: '#fbbf24',
            fontSize: '0.825rem',
            lineHeight: 1.5,
          }}
        >
          ⚠️ This window has been disabled. Please continue your assessment in the newest tab/window.
        </div>

        <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '8px' }}>
          <button
            type="button"
            id="session-superseded-close-btn"
            onClick={() => {
              try {
                window.close();
              } catch (_) {}
              navigate('/candidate/join', { replace: true });
            }}
            style={{
              flex: 1,
              padding: '12px 20px',
              background: '#0E7C86',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 150ms ease',
            }}
          >
            Close & Exit This Tab
          </button>
        </div>
      </div>
    </div>
  );
}
