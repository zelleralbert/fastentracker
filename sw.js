// Bei jeder Veröffentlichung VERSION erhöhen, damit Geräte die neuen Dateien laden.
const VERSION = 'tagwerk-2.8';
const FILES = [
  './', './index.html', './manifest.json', './icon.svg', './css/app.css',
  './js/app.js', './js/store.js', './js/ui.js', './js/merge.js', './js/logic.js', './js/summary.js', './js/drift.js',
  './js/fast.js', './js/sleep.js', './js/train.js', './js/weight.js', './js/sync.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Nur eigene Dateien aus dem Cache; Anfragen an GitHub laufen immer übers Netz.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
