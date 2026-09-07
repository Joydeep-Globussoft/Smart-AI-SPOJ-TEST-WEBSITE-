import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

// BUG-65: Listen for Vite preload errors when stale chunks 404 after a new deployment
window.addEventListener('vite:preloadError', (event) => {
  const lastRetry = parseInt(sessionStorage.getItem('chunk_load_retry_timestamp') || '0', 10);
  const now = Date.now();
  if (now - lastRetry > 15000) {
    console.warn('[Vite] Preload error detected. Auto-reloading to fetch updated deployment chunks...');
    sessionStorage.setItem('chunk_load_retry_timestamp', String(now));
    window.location.reload();
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

