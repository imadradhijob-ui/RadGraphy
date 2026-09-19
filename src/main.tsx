import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DicomErrorBoundary } from './components/DicomErrorBoundary';
import './index.css';

import { logger } from './services/logger';

// Initialize persistent error logger (intercepts global errors, rejections, console.error)
logger.init();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DicomErrorBoundary fallbackMessage="RadNode Application Protected">
      <App />
    </DicomErrorBoundary>
  </React.StrictMode>
);

