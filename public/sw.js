const CACHE = 'skylux-v1';
const STATIC = ['/', '/index.html', '/results.html', '/movie.html', '/style.css', '/pwa.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()));
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
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(() => new Response(JSON.stringify({error:'Offline'}),{headers:{'Content-Type':'application/json'}})));
    return;
  }
  if (e.request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(fetch(e.request).then(res=>{const c=res.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));return res;}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(cached=>{const fresh=fetch(e.request).then(res=>{caches.open(CACHE).then(c=>c.put(e.request,res.clone()));return res;});return cached||fresh;}));
});
