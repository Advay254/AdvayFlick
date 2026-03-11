require('dotenv').config();
const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || null;
const TMDB_KEY = process.env.TMDB_API_KEY || null;
const YTS_BASE = 'https://movies-api.accel.li/api/v2';
const TMDB_BASE = 'https://api.themoviedb.org/3';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
app.use(express.static(path.join(__dirname, 'public')));

const authApi = (req, res, next) => {
  if (!API_KEY) return next();
  const referer = req.headers['referer'] || '';
  const host = req.headers['host'] || '';
  if (referer.includes(host)) return next();
  const key = req.query.key || req.headers['x-api-key'];
  if (key === API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized.' });
};

const http = axios.create({
  timeout: 12000,
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
});

const cache = new Map();
const getCached = k => { const i = cache.get(k); if (!i || Date.now() > i.exp) { cache.delete(k); return null; } return i.data; };
const setCache = (k, d, ttl = 300000) => cache.set(k, { data: d, exp: Date.now() + ttl });

// ══════════════════════════ YTS ══════════════════════════

app.get('/api/search', authApi, async (req, res) => {
  const { q, sort = 'rating' } = req.query;
  if (!q?.trim()) return res.status(400).json({ error: 'Missing query.' });
  const ck = `yts:search:${q.trim().toLowerCase()}:${sort}`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const { data } = await http.get(`${YTS_BASE}/list_movies.json`, {
      params: { query_term: q.trim(), sort_by: sort, limit: 10 }
    });
    if (data.status !== 'ok') throw new Error('YTS error');
    setCache(ck, data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Search failed.' });
  }
});

app.get('/api/movie/:id', authApi, async (req, res) => {
  const { id } = req.params;
  if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });
  const ck = `yts:movie:${id}`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const { data } = await http.get(`${YTS_BASE}/movie_details.json`, {
      params: { movie_id: id, with_images: true }
    });
    if (data.status !== 'ok') throw new Error('YTS error');
    setCache(ck, data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load.' });
  }
});

// Bridge: find YTS torrent by title+year (for TMDB movies)
app.get('/api/yts/find', authApi, async (req, res) => {
  const { title, year } = req.query;
  if (!title) return res.status(400).json({ error: 'Missing title.' });
  const ck = `yts:find:${title.toLowerCase()}:${year || ''}`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const { data } = await http.get(`${YTS_BASE}/list_movies.json`, {
      params: { query_term: title, limit: 5, sort_by: 'year' }
    });
    if (data.status !== 'ok' || !data.data?.movies?.length) return res.json({ found: false });
    const movie = data.data.movies.find(m => String(m.year) === String(year)) || data.data.movies[0];
    const result = { found: true, movie };
    setCache(ck, result, 600000);
    res.json(result);
  } catch (err) {
    res.json({ found: false });
  }
});

// ══════════════════════════ TMDB ══════════════════════════

const tmdb = async (endpoint, params = {}) => {
  if (!TMDB_KEY) throw new Error('TMDB_API_KEY not set. Add it in Render environment variables.');
  const { data } = await http.get(`${TMDB_BASE}${endpoint}`, { params: { api_key: TMDB_KEY, ...params } });
  return data;
};

app.get('/api/tmdb/trending', authApi, async (req, res) => {
  const ck = 'tmdb:trending';
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try { const d = await tmdb('/trending/movie/week'); setCache(ck, d, 1800000); res.json(d); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/tmdb/nowplaying', authApi, async (req, res) => {
  const ck = 'tmdb:nowplaying';
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try { const d = await tmdb('/movie/now_playing', { region: 'US' }); setCache(ck, d, 1800000); res.json(d); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/tmdb/toprated', authApi, async (req, res) => {
  const ck = 'tmdb:toprated';
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try { const d = await tmdb('/movie/top_rated'); setCache(ck, d, 3600000); res.json(d); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/tmdb/popular', authApi, async (req, res) => {
  const ck = 'tmdb:popular';
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try { const d = await tmdb('/movie/popular'); setCache(ck, d, 1800000); res.json(d); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/tmdb/movie/:id', authApi, async (req, res) => {
  const { id } = req.params;
  const ck = `tmdb:movie:${id}`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const [details, credits, videos] = await Promise.all([
      tmdb(`/movie/${id}`),
      tmdb(`/movie/${id}/credits`),
      tmdb(`/movie/${id}/videos`)
    ]);
    const result = { ...details, credits, videos };
    setCache(ck, result, 3600000);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/tmdb/search', authApi, async (req, res) => {
  const { q } = req.query;
  if (!q?.trim()) return res.status(400).json({ error: 'Missing query.' });
  const ck = `tmdb:search:${q.trim().toLowerCase()}`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try { const d = await tmdb('/search/movie', { query: q.trim() }); setCache(ck, d, 300000); res.json(d); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/tmdb/genres', authApi, async (req, res) => {
  const ck = 'tmdb:genres';
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try { const d = await tmdb('/genre/movie/list'); setCache(ck, d, 86400000); res.json(d); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/tmdb/genre/:id', authApi, async (req, res) => {
  const { id } = req.params;
  const ck = `tmdb:genre:${id}`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const d = await tmdb('/discover/movie', { with_genres: id, sort_by: 'popularity.desc' });
    setCache(ck, d, 1800000);
    res.json(d);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ══════════════════════════ UTIL ══════════════════════════

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok', uptime: Math.floor(process.uptime()), cache: cache.size,
    tmdb: TMDB_KEY ? 'ready' : 'missing TMDB_API_KEY', apiKey: API_KEY ? 'on' : 'open'
  });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, req, res, next) => res.status(500).json({ error: 'Server error.' }));

app.listen(PORT, () => {
  console.log(`\n🎬  SkyluxMovies`);
  console.log(`📡  http://localhost:${PORT}`);
  console.log(`🎥  TMDB: ${TMDB_KEY ? 'ready' : '⚠️  add TMDB_API_KEY to env'}`);
  console.log(`🔑  API Key: ${API_KEY ? 'enabled' : 'open'}\n`);
});
