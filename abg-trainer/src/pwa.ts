/** Registers the offline service worker when the page is served over http(s) from a real site (not file://, not an artifact). */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(window.location.protocol)) return;
  // The artifact build has no manifest link: it must not try to register anything
  if (!document.querySelector('link[rel="manifest"]')) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        const announce = (w: ServiceWorker | null) => {
          if (w && navigator.serviceWorker.controller) window.dispatchEvent(new CustomEvent('pwa-update', { detail: w }));
        };
        announce(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w?.addEventListener('statechange', () => w.state === 'installed' && announce(w));
        });
      })
      .catch(() => {
        /* offline mode is optional */
      });
  });
}

/** True on iPhone and iPad (iPadOS reports itself as a Mac with a touch screen). */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}
