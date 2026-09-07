import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);

    // BUG-65: Auto-reload recovery on stale chunk mismatch if not caught earlier
    const message = (error?.message || '').toLowerCase();
    const name = (error?.name || '').toLowerCase();
    const isChunkError =
      name === 'chunkloaderror' ||
      message.includes('failed to fetch dynamically imported module') ||
      message.includes('importing a module script failed') ||
      message.includes('error loading dynamically imported module') ||
      message.includes('failed to load module script') ||
      message.includes('loading chunk');

    if (isChunkError) {
      const lastRetry = parseInt(sessionStorage.getItem('chunk_load_retry_timestamp') || '0', 10);
      const now = Date.now();
      if (now - lastRetry > 15000) {
        console.warn('[ErrorBoundary] Auto-reloading due to stale deployment chunk...');
        sessionStorage.setItem('chunk_load_retry_timestamp', String(now));
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      const message = (this.state.error?.message || '').toLowerCase();
      const isChunkError =
        message.includes('failed to fetch dynamically imported module') ||
        message.includes('importing a module script failed') ||
        message.includes('error loading dynamically imported module') ||
        message.includes('loading chunk');

      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 32, background: '#F8FAFC' }}>
          <div style={{ fontSize: '3rem' }}>⚠️</div>
          <h2 style={{ color: '#1A2B3C', fontSize: '1.4rem', fontWeight: 700 }}>
            {isChunkError ? 'Application Updated' : 'Something went wrong'}
          </h2>
          <p style={{ color: '#64748B', maxWidth: 500, textAlign: 'center', fontSize: '0.9rem' }}>
            {isChunkError
              ? 'A newer version of the application was deployed. Please reload the page to load the latest update.'
              : this.state.error?.message || 'An unexpected error occurred while rendering this page.'}
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              type="button"
              onClick={() => {
                sessionStorage.removeItem('chunk_load_retry_timestamp');
                window.location.reload();
              }}
              className="btn btn-primary"
              style={{ padding: '8px 20px', fontSize: '0.85rem' }}
            >
              Reload Page
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/'; }}
              className="btn btn-secondary"
              style={{ padding: '8px 20px', fontSize: '0.85rem' }}
            >
              Go to Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

