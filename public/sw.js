importScripts('./import-storage.js');
const CACHE = 'rejseflex-public-v3-import';
const SCOPE = self.registration.scope;
const SHELL = [SCOPE, `${SCOPE}manifest.webmanifest`, `${SCOPE}import-storage.js`];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.method === 'POST' && event.request.url === `${SCOPE}share-target`) {
    event.respondWith(RejseFlexImports.receiveShare(event.request, SCOPE));
    return;
  }
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok && new URL(event.request.url).pathname === new URL(SCOPE).pathname) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(event.request, copy)));
      }
      return response;
    }).catch(async () => (await caches.match(event.request)) ?? caches.match(SCOPE)));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const path = new URL(event.request.url).pathname;
    const basePath = new URL(SCOPE).pathname;
    const isPublicAsset = path === basePath || path.startsWith(`${basePath}assets/`) || /\/(import-storage\.js|manifest\.webmanifest|icon-(192|512)\.png)$/.test(path);
    if (response.ok && isPublicAsset) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  })));
});
