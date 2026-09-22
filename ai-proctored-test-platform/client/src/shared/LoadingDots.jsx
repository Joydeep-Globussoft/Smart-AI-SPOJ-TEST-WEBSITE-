import React from 'react';

/**
 * FEATURE-016: Exact Reference 3-Dot Orbit & Independent Breathe Loading Animation
 * 
 * Implements the exact 3-dot tumbling animation mechanism:
 * - Outer square container (scales per xs/sm/md/lg variants)
 * - Inner rotating spinner with continuous 360° linear orbit (2.4s)
 * - 3 dots positioned at fixed, asymmetric anchor points (12.5%, 12.5%), (65.625%, 25%), (28.125%, 65.625%)
 * - Each dot independently pulses (scale 0.7x -> 1.2x, opacity 45% -> 100%, 1.8s ease-in-out)
 * - Staggered negative delays: Dot 1 (0s), Dot 2 (-0.6s), Dot 3 (-1.2s)
 * - Accessibility: wrapped in role="status" and aria-live="polite", decorative spinner marked aria-hidden="true"
 * - Reduced motion: under prefers-reduced-motion: reduce, stops rotation and slows breathing to 3.2s
 *
 * @param {'xs'|'sm'|'md'|'lg'|number} size - Size variant or numeric pixel dimension
 * @param {'primary'|'white'|'currentColor'|string} color - Dot color token or custom CSS color
 * @param {string} className - Additional CSS classes
 * @param {React.CSSProperties} style - Custom inline styles
 * @param {string} label - Accessibility screen reader label
 */
export function LoadingDots({
  size = 'sm',
  color = 'primary',
  className = '',
  style = {},
  label = 'Loading...',
  ...restProps
}) {
  // Size metrics: container dimension (reference is 16px container with 4px dots)
  let containerSize = 16;

  if (typeof size === 'number') {
    containerSize = size;
  } else {
    switch (size) {
      case 'xs':
        containerSize = 14;
        break;
      case 'sm':
        containerSize = 16;
        break;
      case 'md':
        containerSize = 28;
        break;
      case 'lg':
        containerSize = 44;
        break;
      default:
        containerSize = 16;
        break;
    }
  }

  // Resolve color
  let resolvedColor = 'var(--color-primary, #0E7C86)';
  if (color === 'white') {
    resolvedColor = '#ffffff';
  } else if (color === 'currentColor') {
    resolvedColor = 'currentColor';
  } else if (color && color !== 'primary') {
    resolvedColor = color;
  }

  const containerStyle = {
    width: `${containerSize}px`,
    height: `${containerSize}px`,
    minWidth: `${containerSize}px`,
    minHeight: `${containerSize}px`,
    '--dot-color': resolvedColor,
    ...style
  };

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={label}
      className={`orbiting-dots-container ${className}`.trim()}
      style={containerStyle}
      {...restProps}
    >
      <span className="loading-dots-orbit" aria-hidden="true">
        <span className="orbiting-dot loading-dots-dot dot-1" />
        <span className="orbiting-dot loading-dots-dot dot-2" />
        <span className="orbiting-dot loading-dots-dot dot-3" />
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

// Named alias for semantic flexibility
export const OrbitingDots = LoadingDots;

export default LoadingDots;
