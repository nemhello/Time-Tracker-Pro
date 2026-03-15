const CACHE_NAME = 'time-tracker-pro-v4.6.3';
const urlsToCache = [
  '/Time-Tracker-Pro/',
  '/Time-Tracker-Pro/index.html',
  '/Time-Tracker-Pro/styles.css',
  '/Time-Tracker-Pro/app.js',
  '/Time-Tracker-Pro/locations.js',
  '/Time-Tracker-Pro/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Network-first: try network, fall back to cache (for offline use)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache the fresh response for offline use
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
