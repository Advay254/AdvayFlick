require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const rateLimit = require('express-rate-limit');
const helmet  = require('helmet');
const path    = require('path');

const app      = express();
const PORT     = process.env.PORT || 3000;
const API_KEY  = process.env.API_KEY  || null;
const TRAKT_ID = process.env.TRAKT_CLIENT_ID || null;
const YTS_BASE   = 'https://yts.bz/api/v2';
const TRAKT_BASE = 'https://api.trakt.tv';
const SITE_URL   = (process.env.SITE_URL || 'https://skyluxmovies.onrender.com').replace(/\/$/, '');

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
app.use(express.static(path.join(__dirname, 'public')));

const authApi = (req, res, next) => {
  if (!API_KEY) return next();
  const referer = req.headers['referer'] || '';
  const host    = req.headers['host']    || '';
  if (referer.includes(host)) return next();
  const key = req.query.key || req.headers['x-api-key'];
  if (key === API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized.' });
};

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

const traktHttp = axios.create({
  baseURL: TRAKT_BASE,
  timeout: 10000,
  headers: {
    'Content-Type':      'application/json',
    'trakt-api-version': '2',
    'trakt-api-key':     TRAKT_ID || '',
  }
});

const cache = new Map();
const TTL = {
  search:      10 * 60 * 1000,
  homeList:     2 * 60 * 60 * 1000,
  movieDetail:  6 * 60 * 60 * 1000,
  genre:        2 * 60 * 60 * 1000,
  suggestions:  4 * 60 * 60 * 1000,
  image:       24 * 60 * 60 * 1000,
  trakt:        2 * 60 * 60 * 1000,
};
const getCached = k => {
  const i = cache.get(k);
  if (!i || Date.now() > i.exp) { cache.delete(k); return null; }
  return i.data;
};
const setCache = (k, d, ttl = TTL.search) => cache.set(k, { data: d, exp: Date.now() + ttl });

const IMG_FIELDS = ['background_image','background_image_original','small_cover_image','medium_cover_image','large_cover_image'];
function proxyImages(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(proxyImages);
  const out = { ...obj };
  for (const key of IMG_FIELDS) {
    if (out[key] && typeof out[key] === 'string' && out[key].startsWith('https://yts.bz/')) {
      out[key] = `/api/img?u=${encodeURIComponent(out[key])}`;
    }
  }
  if (out.data)   out.data   = proxyImages(out.data);
  if (out.movies) out.movies = out.movies.map(proxyImages);
  if (out.movie)  out.movie  = proxyImages(out.movie);
  if (out.cast)   out.cast   = out.cast.map(c => ({
    ...c,
    url_small_image: c.url_small_image?.startsWith('https://yts.bz/')
      ? `/api/img?u=${encodeURIComponent(c.url_small_image)}`
      : c.url_small_image
  }));
  return out;
}

const yts = async (endpoint, params = {}) => {
  const { data } = await http.get(`${YTS_BASE}/${endpoint}`, { params });
  if (data.status !== 'ok') throw new Error('YTS error');
  return data;
};

function extractTraktMovies(raw) {
  return raw.map(item => item.movie || item).filter(m => m.title);
}

async function enrichWithYTS(traktMovies, targetCount = 20) {
  const results   = [];
  const batchSize = 8;
  for (let i = 0; i < traktMovies.length && results.length < targetCount; i += batchSize) {
    const batch   = traktMovies.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map(async movie => {
        const imdb  = movie.ids?.imdb;
        const title = movie.title;
        const year  = movie.year;
        if (!title) return null;
        try {
          const res  = await yts('list_movies.json', { query_term: imdb || title, limit: 5 });
          const list = res.data?.movies || [];
          let match  = imdb ? list.find(m => m.imdb_code === imdb) : null;
          if (!match && title && year)
            match = list.find(m => m.year === year && m.title.toLowerCase().trim() === title.toLowerCase().trim());
          if (!match) match = list[0];
          if (!match?.medium_cover_image) return null;
          const traktGenres = (movie.genres || []).map(g => g.charAt(0).toUpperCase() + g.slice(1).replace(/-/g,' '));
          return proxyImages({
            ...match,
            rating:            movie.rating != null ? parseFloat(movie.rating.toFixed(1)) : match.rating,
            genres:            match.genres?.length >= traktGenres.length ? match.genres : traktGenres,
            description_full:  movie.overview || match.description_full || '',
            description_intro: movie.overview ? movie.overview.slice(0,200)+(movie.overview.length>200?'…':'') : match.description_intro||'',
            trakt_votes:       movie.votes || 0,
          });
        } catch { return null; }
      })
    );
    for (const r of settled)
      if (r.status === 'fulfilled' && r.value && results.length < targetCount)
        results.push(r.value);
    if (results.length < targetCount && i + batchSize < traktMovies.length)
      await new Promise(res => setTimeout(res, 80));
  }
  return results;
}

const traktToResponse = movies => ({ status:'ok', data:{ movies, movie_count: movies.length } });

const traktEndpoint = (traktPath, cacheKey, opts = {}) => async (req, res) => {
  if (!TRAKT_ID) return res.json(traktToResponse([]));
  const ck = `trakt:${cacheKey}`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const params = { extended: 'full', limit: opts.fetchLimit || 40 };
    if (opts.genres) params.genres = opts.genres;
    const { data: raw } = await traktHttp.get(traktPath, { params });
    const movies  = await enrichWithYTS(extractTraktMovies(raw), opts.targetCount || 20);
    const result  = traktToResponse(movies);
    setCache(ck, result, TTL.trakt);
    res.json(result);
  } catch(e) {
    console.error(`Trakt ${traktPath}:`, e.message);
    res.json(traktToResponse([]));
  }
};

app.get('/api/img', async (req, res) => {
  const url = req.query.u;
  if (!url || !url.startsWith('https://yts.bz/')) return res.status(400).send('Bad request');
  const ck = `img:${url}`;
  const cached = getCached(ck);
  if (cached) {
    res.set('Content-Type', cached.ct);
    res.set('Cache-Control', `public, max-age=${TTL.image/1000}`);
    return res.send(cached.buf);
  }
  try {
    const response = await http.get(url, { responseType: 'arraybuffer' });
    const buf = Buffer.from(response.data);
    const ct  = response.headers['content-type'] || 'image/jpeg';
    setCache(ck, { buf, ct }, TTL.image);
    res.set('Content-Type', ct);
    res.set('Cache-Control', `public, max-age=${TTL.image/1000}`);
    res.send(buf);
  } catch { res.status(502).send('Image unavailable'); }
});

app.get('/api/search', authApi, async (req, res) => {
  const { q, sort='rating', genre='', page=1 } = req.query;
  if (!q?.trim()) return res.status(400).json({ error:'Missing query.' });
  const ck = `search:${q.trim().toLowerCase()}:${sort}:${genre}:${page}`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const data    = await yts('list_movies.json', { query_term: q.trim(), sort_by: sort, genre: genre||undefined, limit:20, page });
    const proxied = proxyImages(data);
    setCache(ck, proxied);
    res.json(proxied);
  } catch { res.status(500).json({ error:'Search failed.' }); }
});

app.get('/api/movie/:id', authApi, async (req, res) => {
  const { id } = req.params;
  if (!id || isNaN(id)) return res.status(400).json({ error:'Invalid ID.' });
  const ck = `movie:${id}`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const data    = await yts('movie_details.json', { movie_id: id, with_images: true, with_cast: true });
    const proxied = proxyImages(data);
    setCache(ck, proxied, TTL.movieDetail);
    res.json(proxied);
  } catch { res.status(500).json({ error:'Failed to load movie.' }); }
});

const homeList = (sort, genre, opts={}) => async (req, res) => {
  const ck = `home:${sort}:${genre||''}:v2`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const params = { sort_by: sort, limit: opts.limit||50, genre: genre||undefined, minimum_rating: sort==='rating'?6:0 };
    const data   = await yts('list_movies.json', params);
    let movies   = data.data?.movies || [];
    if (opts.minYear) movies = movies.filter(m => m.year >= opts.minYear);
    movies = movies.slice(0, opts.outputLimit||20);
    const result = proxyImages({ ...data, data: { ...data.data, movies, movie_count: movies.length } });
    setCache(ck, result, TTL.homeList);
    res.json(result);
  } catch { res.status(500).json({ error:'Failed.' }); }
};

// YTS-only rows (new, top rated, most downloaded — YTS is authoritative for these)
app.get('/api/popular',  authApi, homeList('download_count','',{ limit:50, outputLimit:20 }));
app.get('/api/new',      authApi, homeList('date_added',    '',{ minYear:2022, limit:50, outputLimit:20 }));
app.get('/api/toprated', authApi, homeList('rating',        '',{ limit:50, outputLimit:20 }));

// YTS genre (legacy + genre tab full view)
app.get('/api/action',    authApi, homeList('download_count','Action'));
app.get('/api/comedy',    authApi, homeList('download_count','Comedy'));
app.get('/api/thriller',  authApi, homeList('download_count','Thriller'));
app.get('/api/horror',    authApi, homeList('download_count','Horror'));
app.get('/api/scifi',     authApi, homeList('download_count','Sci-Fi'));
app.get('/api/animation', authApi, homeList('download_count','Animation'));

app.get('/api/genre/:name', authApi, async (req, res) => {
  const { name } = req.params;
  const { sort='download_count' } = req.query;
  const ck = `genre:${name}:${sort}`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const data    = await yts('list_movies.json', { genre: name, sort_by: sort, limit: 20 });
    const proxied = proxyImages(data);
    setCache(ck, proxied, TTL.genre);
    res.json(proxied);
  } catch { res.status(500).json({ error:'Failed.' }); }
});

app.get('/api/suggestions/:id', authApi, async (req, res) => {
  const ck = `sug:${req.params.id}`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const data    = await yts('movie_suggestions.json', { movie_id: req.params.id });
    const proxied = proxyImages(data);
    setCache(ck, proxied, TTL.suggestions);
    res.json(proxied);
  } catch { res.status(500).json({ error:'Failed.' }); }
});

// ══ TRAKT ENDPOINTS ═══════════════════════════════════════════════
// /api/trending now powered by Trakt (falls back to YTS if no key)
app.get('/api/trending', authApi, async (req, res) => {
  if (!TRAKT_ID) return homeList('like_count','',{ minYear:2020, limit:50, outputLimit:20 })(req, res);
  const ck = 'trakt:trending';
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const { data: raw } = await traktHttp.get('/movies/trending', { params:{ extended:'full', limit:40 } });
    const movies = await enrichWithYTS(extractTraktMovies(raw), 20);
    const result = traktToResponse(movies);
    setCache(ck, result, TTL.trakt);
    res.json(result);
  } catch(e) {
    console.error('Trakt trending:', e.message);
    homeList('like_count','',{ minYear:2020, limit:50, outputLimit:20 })(req, res);
  }
});

app.get('/api/trakt/trending',   authApi, traktEndpoint('/movies/trending',       'trendingv2',   { fetchLimit:40, targetCount:20 }));
app.get('/api/trakt/watched',    authApi, traktEndpoint('/movies/watched/weekly',  'watched',      { fetchLimit:40, targetCount:20 }));
app.get('/api/trakt/popular',    authApi, traktEndpoint('/movies/popular',         'traktpopular', { fetchLimit:40, targetCount:20 }));
app.get('/api/trakt/anticipated',authApi, traktEndpoint('/movies/anticipated',     'anticipated',  { fetchLimit:40, targetCount:20 }));
app.get('/api/trakt/boxoffice',  authApi, traktEndpoint('/movies/boxoffice',       'boxoffice',    { fetchLimit:20, targetCount:10 }));

app.get('/api/trakt/genre/:slug', authApi, async (req, res) => {
  if (!TRAKT_ID) return res.json(traktToResponse([]));
  const slug = req.params.slug;
  const ck   = `trakt:genre:${slug}`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const { data: raw } = await traktHttp.get('/movies/popular', { params:{ extended:'full', limit:40, genres:slug } });
    const movies = await enrichWithYTS(extractTraktMovies(raw), 20);
    const result = traktToResponse(movies);
    setCache(ck, result, TTL.trakt);
    res.json(result);
  } catch(e) {
    console.error(`Trakt genre ${slug}:`, e.message);
    res.json(traktToResponse([]));
  }
});

// ═════════════════════════════════════════════════════════════════

app.get('/sitemap.xml', (_, res) => {
  const today = new Date().toISOString().split('T')[0];
  const pages = [
    { loc:'/',             priority:'1.0', changefreq:'daily'   },
    { loc:'/results.html', priority:'0.7', changefreq:'weekly'  },
    { loc:'/movie.html',   priority:'0.6', changefreq:'monthly' },
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p=>`  <url>
    <loc>${SITE_URL}${p.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
  res.setHeader('Content-Type','application/xml');
  res.send(xml);
});

app.get('/favicon.ico', (_, res) => {
  res.setHeader('Content-Type','image/png');
  res.sendFile(path.join(__dirname,'public/icons/icon-192.png'));
});

app.get('/api/health', (req, res) => {
  res.json({ status:'ok', uptime: Math.floor(process.uptime()), cache: cache.size, trakt: !!TRAKT_ID });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname,'public','index.html')));

app.listen(PORT, () => {
  console.log(`\n🎬  SkyluxMovies`);
  console.log(`📡  http://localhost:${PORT}`);
  console.log(`🗺️   ${SITE_URL}/sitemap.xml`);
  console.log(`🎯  Trakt: ${TRAKT_ID ? '✅ connected' : '⚠️  set TRAKT_CLIENT_ID env var'}\n`);
});
