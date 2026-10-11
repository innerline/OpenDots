import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';
import './editor.css';
import { watchSystemTheme } from './theme';

// MWP patch 2026-10-11: the app is served over plain HTTP on the tailnet,
// which is not a secure context — crypto.randomUUID is undefined there and
// message sending crashes. Polyfill it once for the whole client.
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (crypto as any).randomUUID = () => {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
}

watchSystemTheme();
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
