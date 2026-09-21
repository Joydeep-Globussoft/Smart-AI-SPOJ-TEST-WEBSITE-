import React from 'react';

/**
 * FEATURE-016: Custom 3-Dot Triangular Orbit Loading Animation
 * 
 * Replaces traditional circular spinners across the platform with a sleek,
 * pure-CSS triangular orbit animation rendered in brand tokens.
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
  // Size metrics: container dimension, dot diameter, orbit radius
  let containerSize = 18;
  let dotSize = 4;
  let orbitRadius = 5.5;

  if (typeof size === 'number') {
    containerSize = size;
    dotSize = Math.max(2.5, Math.round(size * 0.22 * 10) / 10);
    orbitRadius = Math.round(size * 0.30 * 10) / 10;
  } else {
    switch (size) {
      case 'xs':
        containerSize = 14;
        dotSize = 3;
        orbitRadius = 3.8;
        break;
      case 'sm':
        containerSize = 18;
        dotSize = 4;
        orbitRadius = 5.5;
        break;
      case 'md':
        containerSize = 28;
        dotSize = 5.5;
        orbitRadius = 8.5;
        break;
      case 'lg':
        containerSize = 44;
        dotSize = 8;
        orbitRadius = 13;
        break;
      default:
        containerSize = 18;
        dotSize = 4;
        orbitRadius = 5.5;
        break;
    }
  }

  // Resolve color
  let resolvedColor = 'var(--color-primary)';
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
    '--dot-size': `${dotSize}px`,
    '--orbit-radius': `${orbitRadius}px`,
    '--dot-color': resolvedColor,
    ...style
  };

  return (
    <span
      role="status"
      aria-label={label}
      className={`orbiting-dots-container ${className}`.trim()}
      style={containerStyle}
      {...restProps}
    >
      <span className="orbiting-dot" aria-hidden="true" />
      <span className="orbiting-dot" aria-hidden="true" />
      <span className="orbiting-dot" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

// Named alias for semantic flexibility
export const OrbitingDots = LoadingDots;

export default LoadingDots;
