const CACHE = 'rejseflex-public-v1';
const SCOPE = self.registration.scope;
const SHELL = [SCOPE, `${SCOPE}manifest.webmanifest`];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const path = new URL(event.request.url).pathname;
    const basePath = new URL(SCOPE).pathname;
    const isPublicAsset = path === basePath || path.startsWith(`${basePath}assets/`) || /\/(manifest\.webmanifest|icon-(192|512)\.png)$/.test(path);
    if (response.ok && isPublicAsset) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  })));
});
