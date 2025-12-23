const CACHE_NAME = 'time-tracker-pro-v4.0';
const urlsToCache = [
  '/time-tracker-pro/',
  '/time-tracker-pro/index.html',
  '/time-tracker-pro/styles.css',
  '/time-tracker-pro/app.js',
  '/time-tracker-pro/locations.js',
  '/time-tracker-pro/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
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
    })
  );
});