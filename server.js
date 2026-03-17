require('dotenv').config();
const express   = require('express');
const axios     = require('axios');
const rateLimit = require('express-rate-limit');
const helmet    = require('helmet');
const path      = require('path');

const app      = express();
app.set('trust proxy', 1); // Required for Render — fixes express-rate-limit ValidationError
const PORT     = process.env.PORT || 3000;
const API_KEY  = process.env.API_KEY || null;
const YTS_BASE     = (process.env.YTS_BASE     || 'https://movies-api.accel.li/api/v2').replace(/\/$/, '');
const YTS_FALLBACK = (process.env.YTS_FALLBACK || 'https://yts.bz/api/v2').replace(/\/$/, '');
const SITE_URL = (process.env.SITE_URL || 'https://skyluxmovies.onrender.com').replace(/\/$/, '');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
// Image proxy — no rate limit (24h cached, harmless)
// Search — tighter to prevent scraping
const searchLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: 'Too many searches.' });
// All other API routes — generous limit
const apiLimiter   = rateLimit({ windowMs: 15 * 60 * 1000, max: 600 });
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/', (req, res, next) => {
  if (req.path === '/img') return next(); // image proxy — no limit
  apiLimiter(req, res, next);
});

// ── Auth ───────────────────────────────────────────────────────────
const authApi = (req, res, next) => {
  if (!API_KEY) return next();
  const referer = req.headers['referer'] || '';
  const host    = req.headers['host']    || '';
  if (referer.includes(host)) return next();
  const key = req.query.key || req.headers['x-api-key'];
  if (key === API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized.' });
};

// ── HTTP client ────────────────────────────────────────────────────
const http = axios.create({
  timeout: 12000,
  headers: {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer':         'https://yts.bz/',
    'Origin':          'https://yts.bz',
    'Accept':          'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
  }
});

// ── Cache ──────────────────────────────────────────────────────────
const cache = new Map();
const TTL = {
  search:      10 * 60 * 1000,
  homeList:     2 * 60 * 60 * 1000,
  movieDetail:  6 * 60 * 60 * 1000,
  genre:        2 * 60 * 60 * 1000,
  suggestions:  4 * 60 * 60 * 1000,
  image:       24 * 60 * 60 * 1000,
};
const getCached = k => {
  const i = cache.get(k);
  if (!i || Date.now() > i.exp) { cache.delete(k); return null; }
  return i.data;
};
const setCache = (k, d, ttl = TTL.search) => cache.set(k, { data: d, exp: Date.now() + ttl });

// ── Image proxy rewriter ───────────────────────────────────────────
const IMG_FIELDS = [
  'background_image','background_image_original',
  'small_cover_image','medium_cover_image','large_cover_image'
];
function proxyImages(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(proxyImages);
  const out = { ...obj };
  for (const key of IMG_FIELDS) {
    if (out[key] && out[key].startsWith('https://'))
      out[key] = `/api/img?u=${encodeURIComponent(out[key])}`;
  }
  if (out.data)   out.data   = proxyImages(out.data);
  if (out.movies) out.movies = out.movies.map(proxyImages);
  if (out.movie)  out.movie  = proxyImages(out.movie);
  if (out.cast)   out.cast   = out.cast.map(c => ({
    ...c,
    url_small_image: c.url_small_image?.startsWith('https://')
      ? `/api/img?u=${encodeURIComponent(c.url_small_image)}`
      : c.url_small_image
  }));
  return out;
}

// ── YTS helper — tries new official API first, falls back to yts.bz ──
const yts = async (endpoint, params = {}) => {
  try {
    const { data } = await http.get(`${YTS_BASE}/${endpoint}`, { params });
    if (data.status === 'ok') return data;
  } catch (e) { /* primary unreachable — try fallback */ }
  const { data } = await http.get(`${YTS_FALLBACK}/${endpoint}`, { params });
  if (data.status !== 'ok') throw new Error('YTS error');
  return data;
};

// ── Image proxy ────────────────────────────────────────────────────
app.get('/api/img', async (req, res) => {
  const url = req.query.u;
  // Accept any https image URL — works regardless of which CDN the YTS API uses
  if (!url || !url.startsWith('https://')) return res.status(400).send('Bad request');
  const ck = `img:${url}`;
  const hit = getCached(ck);
  if (hit) {
    res.set('Content-Type', hit.ct);
    res.set('Cache-Control', `public, max-age=${TTL.image / 1000}`);
    return res.send(hit.buf);
  }
  try {
    const r   = await http.get(url, { responseType: 'arraybuffer' });
    const buf = Buffer.from(r.data);
    const ct  = r.headers['content-type'] || 'image/jpeg';
    setCache(ck, { buf, ct }, TTL.image);
    res.set('Content-Type', ct);
    res.set('Cache-Control', `public, max-age=${TTL.image / 1000}`);
    res.send(buf);
  } catch { res.status(502).send('Image unavailable'); }
});

// ── Search ─────────────────────────────────────────────────────────
app.get('/api/search', searchLimiter, authApi, async (req, res) => {
  const { q, sort = 'rating', genre = '', page = 1 } = req.query;
  if (!q?.trim()) return res.status(400).json({ error: 'Missing query.' });
  const ck = `search:${q.trim().toLowerCase()}:${sort}:${genre}:${page}`;
  const hit = getCached(ck);
  if (hit) return res.json(hit);
  try {
    const data = await yts('list_movies.json', {
      query_term: q.trim(), sort_by: sort,
      genre: genre || undefined, limit: 20, page
    });
    const out = proxyImages(data);
    setCache(ck, out);
    res.json(out);
  } catch { res.status(500).json({ error: 'Search failed.' }); }
});

// ── Movie detail ───────────────────────────────────────────────────
app.get('/api/movie/:id', authApi, async (req, res) => {
  const { id } = req.params;
  if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });
  const ck  = `movie:${id}`;
  const hit = getCached(ck);
  if (hit) return res.json(hit);
  try {
    const data = await yts('movie_details.json', { movie_id: id, with_images: true, with_cast: true });
    const out  = proxyImages(data);
    setCache(ck, out, TTL.movieDetail);
    res.json(out);
  } catch { res.status(500).json({ error: 'Failed to load movie.' }); }
});

// ── Reusable home-list factory ─────────────────────────────────────
const homeList = (sort, genre, opts = {}) => async (req, res) => {
  const ck  = `home:${sort}:${genre || ''}:${opts.minYear || 0}`;
  const hit = getCached(ck);
  if (hit) return res.json(hit);
  try {
    const params = {
      sort_by:        sort,
      limit:          opts.limit || 50,
      genre:          genre || undefined,
      minimum_rating: sort === 'rating' ? 6 : 0,
    };
    const data   = await yts('list_movies.json', params);
    let movies   = data.data?.movies || [];
    if (opts.minYear) movies = movies.filter(m => m.year >= opts.minYear);
    movies = movies.slice(0, opts.out || 20);
    const out = proxyImages({
      ...data,
      data: { ...data.data, movies, movie_count: movies.length }
    });
    setCache(ck, out, TTL.homeList);
    res.json(out);
  } catch { res.status(500).json({ error: 'Failed.' }); }
};

// ── Home rows ──────────────────────────────────────────────────────
// Hero + Trending  → highest like_count recent movies
app.get('/api/trending',  authApi, homeList('like_count',     '', { minYear: 2019, limit: 50, out: 20 }));
// Most Watched     → highest download_count all time
app.get('/api/watched',   authApi, homeList('download_count', '', { limit: 50, out: 20 }));
// New Releases     → most recently added, 2022+
app.get('/api/new',       authApi, homeList('date_added',     '', { minYear: 2022, limit: 50, out: 20 }));
// Box Office proxy → highest rated recent (2020+) as YTS equivalent of "in cinemas"
app.get('/api/boxoffice', authApi, homeList('rating',         '', { minYear: 2020, limit: 50, out: 20 }));
// Top Rated        → all-time highest rated
app.get('/api/toprated',  authApi, homeList('rating',         '', { limit: 50, out: 20 }));
// Most Downloaded  → raw download count
app.get('/api/popular',   authApi, homeList('download_count', '', { limit: 50, out: 20 }));
// Anticipated      → newest additions (latest year first)
app.get('/api/anticipated', authApi, homeList('date_added',   '', { minYear: 2023, limit: 50, out: 20 }));

// ── Genre rows ─────────────────────────────────────────────────────
app.get('/api/action',    authApi, homeList('download_count', 'Action'));
app.get('/api/comedy',    authApi, homeList('download_count', 'Comedy'));
app.get('/api/thriller',  authApi, homeList('download_count', 'Thriller'));
app.get('/api/horror',    authApi, homeList('download_count', 'Horror'));
app.get('/api/scifi',     authApi, homeList('download_count', 'Sci-Fi'));
app.get('/api/animation', authApi, homeList('download_count', 'Animation'));

// ── Genre tab (full browse view) ───────────────────────────────────
app.get('/api/genre/:name', authApi, async (req, res) => {
  const { name } = req.params;
  const { sort = 'download_count' } = req.query;
  const ck  = `genre:${name}:${sort}`;
  const hit = getCached(ck);
  if (hit) return res.json(hit);
  try {
    const data = await yts('list_movies.json', { genre: name, sort_by: sort, limit: 20 });
    const out  = proxyImages(data);
    setCache(ck, out, TTL.genre);
    res.json(out);
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

// ── Suggestions ────────────────────────────────────────────────────
app.get('/api/suggestions/:id', authApi, async (req, res) => {
  const ck  = `sug:${req.params.id}`;
  const hit = getCached(ck);
  if (hit) return res.json(hit);
  try {
    const data = await yts('movie_suggestions.json', { movie_id: req.params.id });
    const out  = proxyImages(data);
    setCache(ck, out, TTL.suggestions);
    res.json(out);
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

// ── Digital Asset Links (TWA URL bar fix) ─────────────────────────
app.get('/.well-known/assetlinks.json', (_, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json([{
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.onrender.skyluxmovies.twa",
      "sha256_cert_fingerprints": [
        "F0:72:69:C0:D9:0D:6D:95:EA:1D:8D:2D:FF:68:6C:62:10:01:13:8E:F0:F6:4F:E5:F5:1F:35:AD:A7:DB:2E:28"
      ]
    }
  }]);
});

// ── Sitemap ────────────────────────────────────────────────────────
app.get('/sitemap.xml', (_, res) => {
  const today = new Date().toISOString().split('T')[0];
  const pages = [
    { loc: '/',                                                          priority: '1.0', changefreq: 'daily'   },
    { loc: '/results.html',                                              priority: '0.7', changefreq: 'weekly'  },
    { loc: '/movie.html',                                                priority: '0.6', changefreq: 'monthly' },
    { loc: '/blog/',                                                     priority: '0.8', changefreq: 'weekly'  },
    { loc: '/blog/free-hd-movie-download-no-account.html',              priority: '0.7', changefreq: 'monthly' },
    { loc: '/blog/watch-movies-online-free-no-signup.html',             priority: '0.7', changefreq: 'monthly' },
    { loc: '/blog/how-to-download-movies-to-phone.html',                priority: '0.7', changefreq: 'monthly' },
    { loc: '/blog/download-4k-movies-free.html',                        priority: '0.7', changefreq: 'monthly' },
    { loc: '/blog/download-action-movies-free.html',                    priority: '0.7', changefreq: 'monthly' },
    { loc: '/blog/how-to-stream-movies-free-splayer.html',              priority: '0.7', changefreq: 'monthly' },
    { loc: '/blog/best-free-movie-download-site-2025.html',             priority: '0.7', changefreq: 'monthly' },
    { loc: '/blog/movie-download-not-working-fix.html',                 priority: '0.7', changefreq: 'monthly' },
  ];
  res.setHeader('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url>
    <loc>${SITE_URL}${p.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`);
});

// ── Favicon ────────────────────────────────────────────────────────
app.get('/favicon.ico', (_, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.sendFile(path.join(__dirname, 'public/icons/icon-192.png'));
});

// ── Health ─────────────────────────────────────────────────────────
app.get('/api/health', (_, res) =>
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()), cache: cache.size })
);

app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

app.listen(PORT, () => {
  console.log(`\n🎬  SkyluxMovies`);
  console.log(`📡  http://localhost:${PORT}`);
  console.log(`🗺️   ${SITE_URL}/sitemap.xml\n`);
});
