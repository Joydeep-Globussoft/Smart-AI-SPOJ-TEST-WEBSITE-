import React from 'react';

/**
 * Shared SearchIcon Component (FEATURE-051)
 * Renders a modern search icon glyph: a magnifying glass inside a subtle rounded-square outline.
 * Theme-aware and responsive via props.
 */
export default function SearchIcon({
  size = 15,
  color = 'currentColor',
  strokeWidth = 2,
  className = '',
  style = {},
  ...props
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style,
      }}
      aria-hidden="true"
      {...props}
    >
      {/* Rounded-square outline box */}
      <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
      {/* Magnifying glass circle */}
      <circle cx="10.8" cy="10.8" r="3.8" />
      {/* Magnifying glass handle */}
      <line x1="13.6" y1="13.6" x2="16.8" y2="16.8" />
    </svg>
  );
}
