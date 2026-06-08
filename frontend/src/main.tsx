import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// StrictMode is off — it double-mounts effects and breaks the Spotify Web Playback SDK.
ReactDOM.createRoot(document.getElementById('app')!).render(<App />);

// Register the PWA service worker only in production builds — registering in
// dev interferes with Vite's HMR.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}