import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// EMERGENCY FIX FOR WHITE SCREEN - Unregister all service workers and clear caches
// This forces fresh load and fixes Customers tab white screen caused by old cached broken JS
if ('serviceWorker' in navigator) {
  // Unregister all existing service workers immediately
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => {
      console.log('Unregistering old SW:', reg.scope);
      reg.unregister();
    });
  });
  // Clear all caches
  if ('caches' in window) {
    caches.keys().then(keys => {
      keys.forEach(key => {
        console.log('Deleting cache:', key);
        caches.delete(key);
      });
    });
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// NO service worker registration for now - to prevent caching old broken versions
// Once customers tab is confirmed fixed, we can re-enable offline caching
console.log('Asphalt Assistant v2 - Service workers disabled for debugging white screen fix');
