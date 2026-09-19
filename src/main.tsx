import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DicomErrorBoundary } from './components/DicomErrorBoundary';
import './index.css';

// Global Renderer Crash Shield: prevent any unhandled error from crashing the UI
window.addEventListener('error', (event) => {
  console.error('[CRASH SHIELD] Global Window Error intercepted:', event.error || event.message);
  event.preventDefault();
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('[CRASH SHIELD] Unhandled Promise Rejection intercepted:', event.reason);
  event.preventDefault();
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DicomErrorBoundary fallbackMessage="RadNode Application Protected">
      <App />
    </DicomErrorBoundary>
  </React.StrictMode>
);

