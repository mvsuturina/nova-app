const CACHE = 'nova-app-v1';

// Install: activate immediately without waiting for old tabs to close
self.addEventListener('install', () => self.skipWaiting());

// Activate: delete old caches, take control of all open tabs
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch: network-first for same-origin assets; skip external APIs
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Only handle GET requests to same origin (skip Supabase, Groq, fonts, CDN)
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request).then(cached => cached ?? new Response('Offline', { status: 503 }))
      )
  );
});
