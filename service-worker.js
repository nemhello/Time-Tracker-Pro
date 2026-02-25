const CACHE_NAME = 'time-tracker-pro-v4.3';
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
      .then(() => self.skipWaiting())  // activate immediately, don't wait
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);  // purge old caches
          }
        })
      );
    }).then(() => self.clients.claim())  // take control of open tabs immediately
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
  );
});
