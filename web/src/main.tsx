import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { frameState } from '@/features/tracking/frameState';
import { useSession } from '@/stores/sessionStore';
import { useSettings } from '@/stores/settingsStore';

// Read-only hook for automated browser tests (?e2e). Never sent anywhere.
if (new URLSearchParams(window.location.search).has('e2e')) {
  (window as unknown as Record<string, unknown>).__xray = { frameState, useSession, useSettings };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
