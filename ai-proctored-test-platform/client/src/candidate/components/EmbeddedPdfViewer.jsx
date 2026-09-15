// EmbeddedPdfViewer.jsx — Candidate-Facing Embedded PDF Problem Statement Viewer
// Implements FEATURE-009: Displays original PDF page(s) replacing structured text boxes
import React, { useState, useEffect } from 'react';
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

  // Reset active page whenever the selected question or page range changes
  useEffect(() => {
    setCurrentPage(startPage);
  }, [question?._id, startPage]);

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

  const pdfUrl = api.getPdfAssetUrl(activeFileName);
  const iframeSrc = `${pdfUrl}#page=${currentPage}&view=${zoomFit ? 'FitH' : 'Fit'}&toolbar=0&navpanes=0`;

  const pageNumbers = [];
  for (let p = startPage; p <= endPage; p++) {
    pageNumbers.push(p);
  }

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

      {/* ── PDF Embed Frame ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#1c1e2f' }}>
        <iframe
          key={`${question._id}_page_${currentPage}_${zoomFit}`}
          src={iframeSrc}
          title={`Problem Statement PDF - Q${questionIndex + 1}`}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            background: '#ffffff',
          }}
        />
      </div>
    </div>
  );
}
