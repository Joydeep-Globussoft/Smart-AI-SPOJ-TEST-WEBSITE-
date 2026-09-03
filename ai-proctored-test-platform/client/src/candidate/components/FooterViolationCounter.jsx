import React from 'react';

/**
 * FooterViolationCounter — FEATURE-003
 * Real-time malpractice/violation counter badge for Candidate Assessment Footers.
 *
 * @param {Object} props
 * @param {number} props.count - Total malpractice logs recorded for this candidate in active test
 */
export default function FooterViolationCounter({ count = 0 }) {
  const safeCount = Math.max(0, Number(count) || 0);

  // Severity color calculation
  let color = '#22c55e'; // Green for 0
  let bg = 'rgba(34, 197, 94, 0.12)';
  let borderColor = 'rgba(34, 197, 94, 0.35)';

  if (safeCount >= 3) {
    color = '#f87171'; // Red for 3+
    bg = 'rgba(239, 68, 68, 0.22)';
    borderColor = 'rgba(239, 68, 68, 0.5)';
  } else if (safeCount >= 1) {
    color = '#facc15'; // Yellow for 1-2
    bg = 'rgba(245, 158, 11, 0.18)';
    borderColor = 'rgba(245, 158, 11, 0.45)';
  }

  return (
    <div
      id="ai-violation-counter"
      role="status"
      aria-label={`Malpractice violations: ${safeCount}`}
      title="Total malpractice events recorded during this test session."
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 6,
        fontSize: '0.78rem',
        fontWeight: 700,
        letterSpacing: '0.02em',
        background: bg,
        color: color,
        border: `1px solid ${borderColor}`,
        cursor: 'help',
        userSelect: 'none',
        transition: 'all 0.25s ease-in-out',
        boxShadow: safeCount >= 3 ? '0 0 10px rgba(239, 68, 68, 0.25)' : 'none',
      }}
    >
      <span style={{ fontSize: '0.85rem', lineHeight: 1 }}>⚠️</span>
      <span>Violations: {safeCount}</span>
    </div>
  );
}
