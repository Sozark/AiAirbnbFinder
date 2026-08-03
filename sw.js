// StayFinder AI — service worker (installable PWA + offline shell)
// Bump this on every deploy that changes main.js / main.css / index.html.
// The fetch handler is cache-first, so returning visitors keep running the
// previously cached bundle until the cache NAME changes — the activate
// handler below only purges caches that don't match the current one.
const CACHE = 'stayfinder-v2';
const SHELL = [
  '/', '/index.html', '/main.js', '/css/main.css',
  '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u)))) // tolerate any missing path
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;          // never touch POSTs (the /api/chat proxy)
  if (url.pathname.startsWith('/api/')) return;     // AI proxy is always live network
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return resp;
    }).catch(() => caches.match('/index.html')))
  );
});
