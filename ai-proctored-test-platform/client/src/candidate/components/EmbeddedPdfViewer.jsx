// EmbeddedPdfViewer.jsx — Candidate-Facing Embedded PDF Problem Statement Viewer
// Implements FEATURE-009 & BUG-72: Displays original PDF page(s) with resilient in-app loading & retry
import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../services/apiClient';

export default function EmbeddedPdfViewer({
  question,
  questionIndex = 0,
  fileName,
  originalName,
  pageRange,
  questionNumber,
  style = {},
}) {
  const activeFileName = question?.pdfFileName || fileName;
  const activeOriginalName = question?.pdfOriginalName || originalName || activeFileName;
  const startPage = question?.pdfPageRange?.startPage || pageRange?.startPage || 1;
  const endPage = question?.pdfPageRange?.endPage || pageRange?.endPage || startPage;
  const qNum = questionNumber ?? (questionIndex + 1);

  const [currentPage, setCurrentPage] = useState(startPage);
  const [zoomFit, setZoomFit] = useState(true);
  const [loadState, setLoadState] = useState('loading'); // 'loading' | 'ready' | 'retrying' | 'error'
  const [retryCount, setRetryCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Loading problem statement...');

  const maxRetries = 3;
  const retryTimerRef = useRef(null);
  const probeAbortRef = useRef(null);

  // Reset active page whenever the selected question or page range changes
  useEffect(() => {
    setCurrentPage(startPage);
  }, [question?._id, startPage]);

  const pdfUrl = activeFileName ? api.getPdfAssetUrl(activeFileName) : '';
  const iframeSrc = pdfUrl ? `${pdfUrl}#page=${currentPage}&view=${zoomFit ? 'FitH' : 'Fit'}&toolbar=0&navpanes=0` : '';

  // Asset availability probe to gracefully catch cold-starts or network errors
  const probeAsset = useCallback(async (attempt = 1) => {
    if (!activeFileName) return;
    if (probeAbortRef.current) {
      probeAbortRef.current.abort();
    }
    const controller = new AbortController();
    probeAbortRef.current = controller;

    try {
      if (attempt > 1) {
        setLoadState('retrying');
        setStatusMessage(`Reconnecting to test server... (Attempt ${attempt} of ${maxRetries})`);
      } else {
        setLoadState('loading');
        setStatusMessage('Loading problem statement...');
      }

      // Probe asset endpoint with a 6-second timeout
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(pdfUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-1024' }, // Lightweight range probe
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok || res.status === 206 || res.status === 304) {
        setLoadState('ready');
        setRetryCount(0);
      } else if (res.status === 404) {
        console.warn('[EmbeddedPdfViewer] PDF asset not found (404):', {
          questionId: question?._id,
          fileName: activeFileName,
          pdfUrl,
          status: res.status,
        });
        setLoadState('error');
        setStatusMessage('The PDF problem statement for this question could not be found on the server.');
      } else {
        throw new Error(`Server returned status ${res.status}`);
      }
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        // Timeout or cancelled
      }
      if (attempt < maxRetries) {
        setRetryCount(attempt);
        const delay = Math.min(attempt * 1500, 4000);
        setStatusMessage(`Server is warming up. Retrying in ${Math.round(delay / 1000)}s... (Attempt ${attempt} of ${maxRetries})`);
        retryTimerRef.current = setTimeout(() => {
          probeAsset(attempt + 1);
        }, delay);
      } else {
        console.error('[EmbeddedPdfViewer] Probe retries exhausted for PDF asset:', {
          questionId: question?._id,
          fileName: activeFileName,
          pdfUrl,
          error: err.message,
        });
        setLoadState('error');
        setRetryCount(maxRetries);
        setStatusMessage('Problem statement is temporarily unreachable from the server.');
      }
    }
  }, [activeFileName, pdfUrl, question?._id]);

  useEffect(() => {
    if (activeFileName) {
      probeAsset(1);
    }
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      if (probeAbortRef.current) probeAbortRef.current.abort();
    };
  }, [activeFileName, probeAsset]);

  const handleManualRetry = () => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    setRetryCount(0);
    probeAsset(1);
  };

  if (!activeFileName) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: 280,
          background: '#0f172a',
          color: '#94a3b8',
          padding: 24,
          borderRadius: 8,
          textAlign: 'center',
          gap: 12,
        }}
      >
        <div style={{ fontSize: '2.5rem' }}>📄</div>
        <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.95rem' }}>
          PDF Problem Statement Unavailable
        </div>
        <div style={{ fontSize: '0.8rem', maxWidth: 360 }}>
          The PDF asset for this question could not be located.
        </div>
      </div>
    );
  }

  const pageNumbers = [];
  for (let p = startPage; p <= endPage; p++) {
    pageNumbers.push(p);
  }

  const fallbackDescription = question?.description || '';
  const fallbackTitle = question?.title || '';

  return (
    <div
      className="embedded-pdf-viewer-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: '#0d0f18',
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid #1e293b',
        ...style,
      }}
    >
      {/* ── Toolbar Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: '#131524',
          borderBottom: '1px solid rgba(139, 92, 246, 0.25)',
          gap: 10,
          flexWrap: 'wrap',
          minHeight: 40,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              background: '#8b5cf6',
              color: '#ffffff',
              fontSize: '0.72rem',
              fontWeight: 800,
              padding: '2px 7px',
              borderRadius: 4,
            }}
          >
            Q{qNum}
          </span>
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#e2e8f0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 240,
            }}
            title={activeOriginalName || 'Problem Statement PDF'}
          >
            {activeOriginalName || 'Problem Statement PDF'}
          </span>
          <span
            style={{
              fontSize: '0.7rem',
              color: '#a78bfa',
              background: 'rgba(139, 92, 246, 0.12)',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              borderRadius: 4,
              padding: '2px 6px',
            }}
          >
            {startPage === endPage ? `Page ${startPage}` : `Pages ${startPage}–${endPage}`}
          </span>
        </div>

        {/* Action controls: Page selection & zoom/open */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {pageNumbers.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Jump:</span>
              {pageNumbers.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCurrentPage(p)}
                  style={{
                    background: currentPage === p ? '#8b5cf6' : '#1e293b',
                    color: currentPage === p ? '#ffffff' : '#94a3b8',
                    border: 'none',
                    borderRadius: 3,
                    padding: '2px 6px',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 120ms',
                  }}
                  title={`Jump to Page ${p}`}
                >
                  P{p}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setZoomFit((prev) => !prev)}
            style={{
              background: '#1e293b',
              color: '#94a3b8',
              border: '1px solid #334155',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: '0.7rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
            title={zoomFit ? 'Toggle Fit Page' : 'Toggle Fit Width'}
          >
            🔍 {zoomFit ? 'Fit Width' : 'Fit Page'}
          </button>

          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: 'rgba(14, 124, 134, 0.2)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: 4,
              padding: '2px 8px',
              fontSize: '0.7rem',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              cursor: 'pointer',
            }}
            title="Open PDF in new tab"
          >
            ↗ Open PDF
          </a>
        </div>
      </div>

      {/* ── PDF Embed Frame & Graceful States ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#1c1e2f', overflowY: 'auto' }}>
        {loadState === 'error' ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 280,
              background: '#0d111c',
              color: '#e2e8f0',
              padding: 24,
              textAlign: 'center',
              gap: 14,
            }}
          >
            <div style={{ fontSize: '2.5rem' }}>⚠️</div>
            <div>
              <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '1rem', marginBottom: 4 }}>
                Problem Statement Loading Delayed
              </div>
              <div style={{ fontSize: '0.85rem', color: '#94a3b8', maxWidth: 420, lineHeight: 1.5 }}>
                {statusMessage}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
                Asset: {activeFileName}
              </div>
            </div>

            {/* Fallback problem statement description if available */}
            {fallbackDescription && (
              <div
                style={{
                  width: '100%',
                  maxWidth: 500,
                  textAlign: 'left',
                  background: '#16192b',
                  border: '1px solid #2d3748',
                  borderRadius: 6,
                  padding: 14,
                  fontSize: '0.85rem',
                  color: '#cbd5e1',
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.6,
                }}
              >
                {fallbackTitle && <strong style={{ color: '#f8fafc', display: 'block', marginBottom: 6 }}>{fallbackTitle}</strong>}
                {fallbackDescription}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={handleManualRetry}
                style={{
                  background: '#8b5cf6',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 18px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: '0 2px 8px rgba(139, 92, 246, 0.35)',
                }}
              >
                🔄 Retry Loading
              </button>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  background: '#1e293b',
                  color: '#38bdf8',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  padding: '8px 18px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                ↗ Open PDF Directly
              </a>
            </div>
          </div>
        ) : (
          <>
            {(loadState === 'loading' || loadState === 'retrying') && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  zIndex: 10,
                  background: 'rgba(15, 23, 42, 0.88)',
                  backdropFilter: 'blur(3px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 12,
                  color: '#e2e8f0',
                  padding: 20,
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    border: '3px solid rgba(139, 92, 246, 0.3)',
                    borderTopColor: '#8b5cf6',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>
                  {statusMessage}
                </div>
                {retryCount > 0 && (
                  <button
                    type="button"
                    onClick={handleManualRetry}
                    style={{
                      background: 'transparent',
                      color: '#a78bfa',
                      border: '1px solid rgba(167, 139, 250, 0.4)',
                      borderRadius: 4,
                      padding: '4px 10px',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      marginTop: 4,
                    }}
                  >
                    Retry Now
                  </button>
                )}
              </div>
            )}
            <iframe
              id="pdf-viewer-iframe"
              data-preview-iframe="true"
              data-pdf-iframe="true"
              key={`${question?._id || activeFileName}_page_${currentPage}_${zoomFit}`}
              src={iframeSrc}
              title={`Problem Statement PDF - Q${qNum}`}
              onLoad={() => {
                setLoadState('ready');
              }}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                display: 'block',
                background: '#ffffff',
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
