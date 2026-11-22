/* Lightweight PWA Service Worker for installability ("Use web apps - Computer" & Mobile) */
const CACHE_NAME = 'erp-pwa-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(['/favicon/site.webmanifest', '/favicon/android-chrome-192x192.png']).catch(() => {})
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Nunca interceptar chamadas externas (Firebase, Mapbox, APIs)
  if (url.origin !== self.location.origin) return;

  // Network-first para navegação SPA (mantém sempre a versão mais recente do app)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
  }
});
