// sw.js — SkyluxMovies v4
// Strategy:
//   HTML pages  → network-first  (always fresh, cache as offline fallback)
//   JS / CSS    → stale-while-revalidate (instant load + background refresh)
//   API calls   → never cached, always live network
//   Ad scripts  → never intercepted (external origin)
//   On deploy   → auto-activates and reloads all open tabs immediately

const CACHE  = 'skylux-v5';
const ASSETS = ['/style.css', '/pwa.js', '/manifest.json'];

// ── Install ───────────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

// ── Activate ──────────────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept API calls
  if (url.pathname.startsWith('/api/')) return;

  // Never intercept external origins (fonts, CDN, ad networks)
  if (url.origin !== self.location.origin) return;

  // HTML / navigation → network-first
  if (e.request.mode === 'navigate' ||
      (e.request.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // JS / CSS / assets → stale-while-revalidate
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const network = fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        });
        return cached || network;
      })
    )
  );
});

// ── Background Sync ───────────────────────────────────────────────
// Retries failed requests automatically when connection is restored
self.addEventListener('sync', e => {
  if (e.tag === 'skylux-sync') {
    e.waitUntil(
      // Notify all open tabs that sync fired — they can refresh data
      self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client =>
          client.postMessage({ type: 'BACKGROUND_SYNC', tag: 'skylux-sync' })
        );
      })
    );
  }
});

// ── Periodic Background Sync ──────────────────────────────────────
// Fires once per day (when browser grants permission) to refresh
// trending/popular movie data so it's ready when user opens the app
self.addEventListener('periodicsync', e => {
  if (e.tag === 'skylux-refresh') {
    e.waitUntil(
      Promise.all([
        fetch('/api/trending').catch(() => {}),
        fetch('/api/new').catch(() => {}),
        fetch('/api/popular').catch(() => {}),
      ]).then(() => {
        // Notify open tabs that fresh data is available
        self.clients.matchAll({ type: 'window' }).then(clients => {
          clients.forEach(client =>
            client.postMessage({ type: 'PERIODIC_SYNC_DONE' })
          );
        });
      })
    );
  }
});

// ── Push Notifications ────────────────────────────────────────────
// Handles push events if/when a push server is connected in future
self.addEventListener('push', e => {
  if (!e.data) return;
  let payload;
  try { payload = e.data.json(); } catch { payload = { title: 'SkyluxMovies', body: e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(payload.title || 'SkyluxMovies', {
      body:    payload.body  || 'New movies available!',
      icon:    '/icons/icon-192.png',
      badge:   '/icons/icon-96.png',
      tag:     'skylux-push',
      vibrate: [100, 50, 100],
      data:    { url: payload.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const url = e.notification.data?.url || '/';
      for (const client of list) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── Manual skip message from page ─────────────────────────────────
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
