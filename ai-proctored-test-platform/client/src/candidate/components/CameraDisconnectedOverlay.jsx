import React, { useRef, useEffect, useState } from 'react';

/**
 * CameraDisconnectedOverlay (BUG-29)
 * 
 * Full-screen blocking overlay with blurred/dimmed background covering the test screen
 * when candidate's webcam is physically disconnected, unplugged, or permission revoked.
 * 
 * Requirements satisfied:
 * 1. Prominent full-screen blocking overlay (blurred/dimmed background).
 * 2. Prevents candidate from interacting with editor/questions while camera is disconnected.
 * 3. Clear message informing candidate to reconnect camera and stating timer continues running.
 * 4. Shows live countdown timer prominently so time is always visible.
 * 5. Reconnect / Retry button that triggers camera stream re-acquisition.
 * 6. Optional Submit All & Finish button so candidate can turn in test if camera failed permanently.
 * 7. Auto-dismisses immediately when camera stream is restored and verified.
 */
export default function CameraDisconnectedOverlay({
  isVisible,
  timerDisplay,
  hasHardwareCamera,
  isVerifyingFace,
  onRetry,
  onSubmitAll,
  isSubmitting = false,
  videoRef,
}) {
  const previewVideoRef = useRef(null);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    if (hasHardwareCamera && previewVideoRef.current && videoRef?.current?.srcObject) {
      previewVideoRef.current.srcObject = videoRef.current.srcObject;
      previewVideoRef.current.play().catch(() => {});
    }
  }, [hasHardwareCamera, videoRef]);

  if (!isVisible) return null;

  const handleRetryClick = async () => {
    if (isRetrying || !onRetry) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setTimeout(() => setIsRetrying(false), 1000);
    }
  };

  return (
    <div
      id="camera-disconnected-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 999999,
        background: 'rgba(11, 19, 30, 0.88)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        boxSizing: 'border-box',
        userSelect: 'none',
        pointerEvents: 'all',
      }}
    >
      <div
        style={{
          maxWidth: 620,
          width: '100%',
          background: '#15202b',
          border: '2px solid #ef4444',
          borderRadius: 16,
          boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.45)',
          padding: '36px 32px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
        }}
      >
        {/* Warning Icon */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '2px solid #ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2.2rem',
            animation: 'pulse 1.8s infinite',
          }}
        >
          ⚠️
        </div>

        {/* Title & Copy */}
        <div>
          <h2
            style={{
              color: '#f87171',
              fontSize: '1.6rem',
              fontWeight: 800,
              margin: '0 0 8px 0',
              letterSpacing: '-0.02em',
            }}
          >
            Webcam Disconnected
          </h2>
          <p
            style={{
              color: '#e2e8f0',
              fontSize: '1.05rem',
              fontWeight: 600,
              margin: '0 0 6px 0',
            }}
          >
            Reconnect your camera to continue your test.
          </p>
          <p
            style={{
              color: '#facc15',
              fontSize: '0.88rem',
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            ⏱️ Your test timer continues to run while disconnected. No code execution or question edits are permitted until the webcam is restored.
          </p>
        </div>

        {/* Prominent Active Test Timer */}
        {timerDisplay && (
          <div
            style={{
              background: '#0b131e',
              border: '1px solid #334155',
              borderRadius: 10,
              padding: '10px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ color: '#94a3b8', fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Test Time Remaining:
            </span>
            <span
              style={{
                color: '#facc15',
                fontFamily: 'monospace',
                fontSize: '1.4rem',
                fontWeight: 800,
                letterSpacing: '0.05em',
              }}
            >
              ⏱️ {timerDisplay}
            </span>
          </div>
        )}

        {/* Device & Face Verification Status */}
        <div
          style={{
            width: '100%',
            background: hasHardwareCamera ? 'rgba(59, 130, 246, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${hasHardwareCamera ? '#3b82f6' : '#ef4444'}`,
            borderRadius: 10,
            padding: '14px 18px',
            textAlign: 'left',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <span style={{ fontSize: '1.4rem' }}>
            {!hasHardwareCamera ? '🔌' : isVerifyingFace ? '👤' : '📷'}
          </span>
          <div style={{ flex: 1 }}>
            <div
              style={{
                color: !hasHardwareCamera ? '#f87171' : '#60a5fa',
                fontWeight: 700,
                fontSize: '0.92rem',
                marginBottom: 2,
              }}
            >
              {!hasHardwareCamera
                ? 'Camera Hardware Not Detected'
                : isVerifyingFace
                ? 'Camera Connected — Scanning for Face...'
                : 'Camera Stream Active'}
            </div>
            <div style={{ color: '#94a3b8', fontSize: '0.78rem', lineHeight: 1.4 }}>
              {!hasHardwareCamera
                ? 'Plug in your external USB webcam or ensure device access permissions are granted.'
                : 'Position your face in front of the camera. The test resumes automatically once verified.'}
            </div>
          </div>
        </div>

        {/* Live Camera Feed Preview */}
        {hasHardwareCamera && (
          <div
            style={{
              position: 'relative',
              width: 220,
              height: 140,
              background: '#000',
              borderRadius: 8,
              border: '2px solid #3b82f6',
              overflow: 'hidden',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}
          >
            <video
              ref={previewVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: 4,
                left: 6,
                right: 6,
                background: 'rgba(0,0,0,0.7)',
                color: '#60a5fa',
                fontSize: '0.68rem',
                padding: '2px 6px',
                borderRadius: 4,
                textAlign: 'center',
                fontWeight: 600,
              }}
            >
              Verifying Camera Feed...
            </div>
          </div>
        )}

        {/* Action Buttons: Retry / Reconnect and Submit Option */}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', width: '100%' }}>
          <button
            id="reconnect-camera-btn"
            type="button"
            onClick={handleRetryClick}
            disabled={isRetrying}
            style={{
              background: '#0E7C86',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              padding: '12px 26px',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: isRetrying ? 'not-allowed' : 'pointer',
              opacity: isRetrying ? 0.75 : 1,
              boxShadow: '0 4px 14px rgba(14, 124, 134, 0.4)',
              transition: 'background 0.2s',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
            onMouseOver={(e) => !isRetrying && (e.currentTarget.style.background = '#09575e')}
            onMouseOut={(e) => !isRetrying && (e.currentTarget.style.background = '#0E7C86')}
          >
            <span>{isRetrying ? '⌛' : '🔄'}</span>
            <span>{isRetrying ? 'Connecting...' : 'Reconnect Camera'}</span>
          </button>

          {onSubmitAll && (
            <button
              id="disconnected-submit-all-btn"
              type="button"
              onClick={onSubmitAll}
              disabled={isSubmitting}
              style={{
                background: isSubmitting ? 'rgba(239, 68, 68, 0.2)' : 'transparent',
                color: '#ef4444',
                border: '1px solid #ef4444',
                borderRadius: 8,
                padding: '12px 20px',
                fontSize: '0.88rem',
                fontWeight: 600,
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s, color 0.2s',
                opacity: isSubmitting ? 0.7 : 1,
              }}
              onMouseOver={(e) => {
                if (!isSubmitting) e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
              }}
              onMouseOut={(e) => {
                if (!isSubmitting) e.currentTarget.style.background = 'transparent';
              }}
            >
              {isSubmitting ? '⌛ Submitting Exam...' : 'Submit All & Finish Exam'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
