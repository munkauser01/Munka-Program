// Generated into the mobile release root. Only known static app-shell assets.
const CACHE_NAME = __CACHE_NAME__;
const APP_SHELL = __APP_SHELL__;
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  // Update waits until old windows close; never interrupt an unsaved draft.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('munka-shell-') && key !== CACHE_NAME) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  // Never intercept account, AI, third-party or mutation requests.
  if (request.method !== 'GET' || url.origin !== self.location.origin || !APP_SHELL.includes(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url.pathname);
    return cached || fetch(request);
  })());
});
