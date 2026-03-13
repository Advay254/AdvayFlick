// sw.js — SkyluxMovies
// Strategy (same proven pattern as AdvaySnapTik & PinSaver):
//   HTML pages  → network-first  (always fresh, cache as offline fallback)
//   JS / CSS    → stale-while-revalidate (instant load + background refresh)
//   API calls   → never cached, always live network
//   Ad scripts  → never intercepted (external origin)
//   On deploy   → auto-activates and reloads all open tabs immediately

const CACHE  = 'skylux-v3';
const ASSETS = ['/style.css', '/pwa.js', '/manifest.json'];

// ── Install: pre-cache static assets only (not HTML) ─────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

// ── Activate: wipe all old caches, claim tabs instantly ───────────
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

  // 1. Never intercept API calls
  if (url.pathname.startsWith('/api/')) return;

  // 2. Never intercept external origins (fonts, CDN, ad networks)
  if (url.origin !== self.location.origin) return;

  // 3. HTML / navigation → NETWORK FIRST
  //    Ad scripts fire on every visit because HTML is always fetched fresh.
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

  // 4. JS / CSS / images → stale-while-revalidate
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

// ── Manual skip message from page ────────────────────────────────
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
