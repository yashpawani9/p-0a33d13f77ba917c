/* Auctova PWA v2 service worker */
const CACHE = 'auctova-v2-4';
const SHELL = [
  '/p-0a33d13f77ba917c/app/',
  '/p-0a33d13f77ba917c/app/index.html',
  '/p-0a33d13f77ba917c/app/manifest.json',
  '/p-0a33d13f77ba917c/app/vapid_public.txt',
  '/p-0a33d13f77ba917c/icon.png',
  '/p-0a33d13f77ba917c/app/icon-180.png',
  '/p-0a33d13f77ba917c/app/icon-192.png',
  '/p-0a33d13f77ba917c/app/icon-512.png',
];
const NTFY_HOST = 'ntfy.sh';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return; // commands (POST) go straight to the network
  // Network-first for ntfy (live data)
  if (url.hostname === NTFY_HOST) {
    e.respondWith(
      fetch(e.request).then(resp => {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return resp;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first for shell
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        if (resp && resp.status === 200) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
    })
  );
});

// Push notifications
self.addEventListener('push', e => {
  let data = { title: 'Auctova', body: 'New update' };
  try { data = e.data.json(); } catch (_) { try { data.body = e.data.text(); } catch (_) {} }
  e.waitUntil(Promise.all([
    self.clients.matchAll({ includeUncontrolled: true }).then(cs => cs.forEach(c => c.postMessage({ type: 'push', data }))),
    self.registration.showNotification(data.title || 'Auctova', {
      body: data.body || '',
      icon: '/p-0a33d13f77ba917c/icon.png',
      badge: '/p-0a33d13f77ba917c/icon.png',
      tag: 'auctova-push',
      renotify: true,
    })
  ]));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/p-0a33d13f77ba917c/app/'));
});

// Expose VAPID public key to page on request
self.addEventListener('message', e => {
  if (e.data === 'get-vapid') {
    // Read from cache (fetched at install time)
    caches.open(CACHE).then(c => c.match('/p-0a33d13f77ba917c/app/vapid_public.txt'))
      .then(r => r ? r.text() : fetch('/p-0a33d13f77ba917c/app/vapid_public.txt').then(r => r.text()))
      .then(key => e.source.postMessage({ type: 'vapid', key: key.trim() }))
      .catch(() => {});
  }
});
