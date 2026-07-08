// sw.js — caches the app shell so paluwagan works offline and is installable.
// Same-origin only: it never touches the network for cross-origin URLs, matching
// the app's connect-src 'none' privacy posture. Failure to cache is non-fatal —
// the app runs fully without a service worker.

const CACHE = 'paluwagan-shell-v1';

// Relative to the SW scope so it works under a project subpath (GitHub Pages).
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/style.css',
  './src/app.js',
  './src/model.js',
  './src/settlement.js',
  './src/store.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only handle same-origin requests; leave anything else to the browser.
  if (url.origin !== self.location.origin) return;

  // Cache-first for the shell, falling back to network, then to the cached
  // index.html for navigations (SPA offline).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'Offline' });
        });
    }),
  );
});
