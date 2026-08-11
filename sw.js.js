const CACHE_NAME = 'chasse-pwa-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js',
  'https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css',
  'https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://unpkg.com/dexie@3.2.4/dist/dexie.js'
];

// Installation & Mettre en cache les fichiers
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Répondre depuis le cache si hors-ligne
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});