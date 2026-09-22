import { useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * useScrollRestoration
 * Platform-wide hook for preserving and restoring scroll positions across navigation (FEATURE-021).
 *
 * Saves scroll coordinates to sessionStorage and restores them once loading completes.
 *
 * @param {Object} options
 * @param {React.RefObject|string|null} [options.containerRef] - Ref to scrollable container or CSS selector (defaults to window / .main-content)
 * @param {boolean} [options.loading=false] - Async loading flag; scroll is restored when loading becomes false
 * @param {string} [options.key] - Optional custom storage key suffix (defaults to container selector or 'main')
 * @param {Array} [options.dependencies=[]] - Additional dependencies that trigger scroll restoration after DOM renders
 */
export function useScrollRestoration({
  containerRef = null,
  loading = false,
  key = 'main',
  dependencies = [],
} = {}) {
  const location = useLocation();
  const pagePath = location.pathname;
  const storageKey = `admin_scroll_${pagePath}_${key}`;
  const isRestoredRef = useRef(false);
  const saveTimeoutRef = useRef(null);

  // Helper to get target DOM element
  const getElement = useCallback(() => {
    if (containerRef && typeof containerRef === 'object' && containerRef.current) {
      return containerRef.current;
    }
    if (typeof containerRef === 'string') {
      return document.querySelector(containerRef);
    }
    return document.querySelector('.main-content') || window;
  }, [containerRef]);

  // 1. Save scroll position on scroll
  useEffect(() => {
    const el = getElement();
    if (!el) return;

    const handleScroll = () => {
      if (loading) return; // Don't record accidental resets during loading states
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

      saveTimeoutRef.current = setTimeout(() => {
        try {
          const top = el === window ? window.scrollY : el.scrollTop;
          const left = el === window ? window.scrollX : el.scrollLeft;
          if (top >= 0 || left >= 0) {
            sessionStorage.setItem(storageKey, JSON.stringify({ top, left }));
          }
        } catch (_) { }
      }, 100);
    };

    const target = el === window ? window : el;
    target.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      target.removeEventListener('scroll', handleScroll);
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [getElement, loading, storageKey]);

  // 2. Restore scroll position when loading completes
  useEffect(() => {
    if (loading) {
      isRestoredRef.current = false;
      return;
    }

    // Attempt restoration after DOM paint
    const timer = setTimeout(() => {
      const el = getElement();
      if (!el) return;

      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          const { top = 0, left = 0 } = JSON.parse(saved);
          if (top > 0 || left > 0) {
            requestAnimationFrame(() => {
              if (el === window) {
                window.scrollTo({ top, left, behavior: 'instant' });
              } else {
                el.scrollTop = top;
                el.scrollLeft = left;
              }
              isRestoredRef.current = true;
            });
          }
        }
      } catch (_) { }
    }, 60);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, storageKey, getElement, ...dependencies]);

  return {
    clearSavedScroll: () => {
      try {
        sessionStorage.removeItem(storageKey);
      } catch (_) { }
    },
  };
}

export default useScrollRestoration;
