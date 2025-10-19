/* Buku Kas — Service Worker (PWA Full Offline) */
const VERSION = 'bk-v864';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './pwa-offline.js',
  './assets/logo-192.png',
  './assets/logo-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== VERSION).map(k => caches.delete(k))
    ))
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const method = req.method || 'GET';
  if (method !== 'GET') return;
  event.respondWith(
    fetch(req).then(res => {
      const clone = res.clone();
      caches.open(VERSION).then(cache => cache.put(req, clone)).catch(()=>{});
      return res;
    }).catch(() => caches.match(req))
  );
});
