// lazyWithRetry.js — Resilient dynamic import wrapper for Vite/React (BUG-65)
// Automatically handles stale chunk 404s when a new deployment is published while a candidate's session is active.
import { lazy } from 'react';

/**
 * Checks if an error is caused by a missing/stale code-split bundle chunk.
 */
export function isChunkLoadError(error) {
  if (!error) return false;
  const message = (error.message || error.toString() || '').toLowerCase();
  const name = (error.name || '').toLowerCase();

  return (
    name === 'chunkloaderror' ||
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('failed to load module script') ||
    message.includes('loading chunk') ||
    message.includes('loading css chunk')
  );
}

/**
 * Wraps dynamic component imports with automatic single-reload recovery.
 * If a chunk fails to load due to deployment hash mismatch:
 * 1. Checks if a reload was already attempted recently (within 15s) to avoid infinite loops.
 * 2. If not yet retried, records retry timestamp in sessionStorage and invokes window.location.reload()
 *    to fetch the updated index.html and current deployment chunks.
 * 3. Returns a pending promise so no broken UI or error boundary flashes while reloading.
 * 4. If already retried and still failing, rethrows so ErrorBoundary handles it gracefully.
 */
export function lazyWithRetry(componentImport) {
  return lazy(async () => {
    try {
      const component = await componentImport();
      // Clear reload retry timestamp on successful import
      sessionStorage.removeItem('chunk_load_retry_timestamp');
      return component;
    } catch (error) {
      console.warn('[lazyWithRetry] Dynamic import failed:', error);

      if (isChunkLoadError(error)) {
        const lastRetry = parseInt(sessionStorage.getItem('chunk_load_retry_timestamp') || '0', 10);
        const now = Date.now();

        // Allow 1 automatic reload attempt every 15 seconds
        if (now - lastRetry > 15000) {
          console.warn('[lazyWithRetry] Stale chunk detected after deployment. Auto-reloading page for fresh bundle...');
          sessionStorage.setItem('chunk_load_retry_timestamp', String(now));
          window.location.reload();
          // Return an unresolved promise to prevent ErrorBoundary from rendering before reload happens
          return new Promise(() => {});
        }
      }

      throw error;
    }
  });
}

export default lazyWithRetry;
