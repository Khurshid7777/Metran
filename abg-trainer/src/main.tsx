import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Older iOS Safari (< 15.4) lacks Array.prototype.at, which a bundled library uses
if (!Array.prototype.at) {
  Object.defineProperty(Array.prototype, 'at', {
    value(this: unknown[], i: number) {
      const n = Math.trunc(i) || 0;
      return this[n < 0 ? this.length + n : n];
    },
    writable: true,
    configurable: true,
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
