import React from 'react';

/**
 * Shared SearchIcon Component (FEATURE-051 / BUG-117)
 * Renders a plain, standard magnifying glass search icon glyph.
 * Theme-aware and responsive via props, with no surrounding box/border.
 */
export default function SearchIcon({
  size = 15,
  color = 'var(--admin-indigo, #3E63DD)',
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
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
