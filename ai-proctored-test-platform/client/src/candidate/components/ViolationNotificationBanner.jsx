import React, { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';

const VIOLATION_TOAST_ID = 'proctor-violation-toast';
const DEFAULT_AUTO_DISMISS_MS = 6000;

/**
 * Display or update the candidate-facing violation toast in the top-right corner.
 * Uses a fixed toast ID so rapid successive violations update in-place with a refreshed
 * dismiss timer rather than stacking or persisting indefinitely.
 */
export const showViolationToast = (message, duration = DEFAULT_AUTO_DISMISS_MS) => {
  if (!message) return;

  toast.custom(
    (t) => (
      <div
        role="alert"
        aria-live="assertive"
        onClick={() => toast.dismiss(t.id)}
        style={{
          background: '#ffffff',
          color: '#1e293b',
          borderRadius: 8,
          padding: '10px 14px',
          boxShadow: '0 6px 20px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)',
          borderLeft: '4px solid #ef4444',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          maxWidth: 420,
          cursor: 'pointer',
          fontSize: '0.84rem',
          fontWeight: 600,
          transition: 'all 0.2s ease',
          opacity: t.visible ? 1 : 0,
          transform: t.visible ? 'scale(1)' : 'scale(0.95)',
        }}
      >
        <span
          style={{
            background: '#fee2e2',
            color: '#dc2626',
            borderRadius: '50%',
            width: 22,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.75rem',
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          ✕
        </span>
        <span style={{ flex: 1, color: '#1e293b', lineHeight: 1.35 }}>
          ⚠️ {message}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toast.dismiss(t.id);
          }}
          title="Dismiss notification"
          aria-label="Dismiss notification"
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            fontSize: '0.9rem',
            padding: '2px 4px',
            borderRadius: 4,
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>
    ),
    {
      id: VIOLATION_TOAST_ID,
      duration,
    }
  );
};

/**
 * Shared custom hook to manage candidate violation notifications (both top banner and toast).
 * Guarantees auto-dismiss after autoDismissMs (default 6s) while allowing immediate manual dismissal.
 * Re-triggering resets the auto-dismiss timer.
 */
export const useViolationNotification = (autoDismissMs = DEFAULT_AUTO_DISMISS_MS) => {
  const [warningMessage, setWarningMessage] = useState('');
  const timerRef = useRef(null);

  const dismissWarning = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setWarningMessage('');
    toast.dismiss(VIOLATION_TOAST_ID);
  }, []);

  const showWarning = useCallback(
    (msg) => {
      if (!msg) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setWarningMessage(msg);
      showViolationToast(msg, autoDismissMs);

      timerRef.current = setTimeout(() => {
        setWarningMessage('');
        timerRef.current = null;
      }, autoDismissMs);
    },
    [autoDismissMs]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    warningMessage,
    showWarning,
    dismissWarning,
    setWarningMessage,
  };
};

/**
 * Shared candidate-facing Violation Notification Banner component.
 * Appears across top of workspace upon violation and auto-dismisses after autoDismissMs.
 * Features an interactive "✕" button for immediate dismissal.
 */
export default function ViolationNotificationBanner({
  message,
  onDismiss,
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
}) {
  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(() => {
      onDismiss?.();
    }, autoDismissMs);

    return () => clearTimeout(timer);
  }, [message, onDismiss, autoDismissMs]);

  if (!message) return null;

  return (
    <div
      role="alert"
      className="violation-notification-banner"
      style={{
        background: '#E74C3C',
        color: '#ffffff',
        padding: '7px 20px',
        fontSize: '0.85rem',
        textAlign: 'center',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        position: 'relative',
        zIndex: 90,
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      }}
    >
      <span>⚠️ {message}</span>
      <button
        type="button"
        id="dismiss-violation-banner-btn"
        onClick={onDismiss}
        aria-label="Dismiss warning"
        title="Dismiss warning"
        style={{
          background: 'rgba(255, 255, 255, 0.2)',
          border: 'none',
          color: '#ffffff',
          cursor: 'pointer',
          borderRadius: 3,
          padding: '1px 7px',
          fontSize: '0.8rem',
          lineHeight: '1.2',
          fontWeight: 700,
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.35)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)')}
      >
        ✕
      </button>
    </div>
  );
}
