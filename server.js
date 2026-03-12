require('dotenv').config();
const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || null;
const YTS_BASE = 'https://yts.bz/api/v2';

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

// ── Cache ──────────────────────────────────────────────────────────
const cache = new Map();
const getCached = k => {
  const i = cache.get(k);
  if (!i || Date.now() > i.exp) { cache.delete(k); return null; }
  return i.data;
};
const setCache = (k, d, ttl = 300000) => cache.set(k, { data: d, exp: Date.now() + ttl });

// ── YTS helper ─────────────────────────────────────────────────────
const yts = async (endpoint, params = {}) => {
  const { data } = await http.get(`${YTS_BASE}/${endpoint}`, { params });
  if (data.status !== 'ok') throw new Error('YTS error');
  return data;
};

// ── Search ─────────────────────────────────────────────────────────
app.get('/api/search', authApi, async (req, res) => {
  const { q, sort = 'rating', genre = '', page = 1 } = req.query;
  if (!q?.trim()) return res.status(400).json({ error: 'Missing query.' });
  const ck = `search:${q.trim().toLowerCase()}:${sort}:${genre}:${page}`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const data = await yts('list_movies.json', {
      query_term: q.trim(), sort_by: sort,
      genre: genre || undefined, limit: 20, page
    });
    setCache(ck, data);
    res.json(data);
  } catch (err) { res.status(500).json({ error: 'Search failed.' }); }
});

// ── Movie detail ───────────────────────────────────────────────────
app.get('/api/movie/:id', authApi, async (req, res) => {
  const { id } = req.params;
  if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid ID.' });
  const ck = `movie:${id}`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const data = await yts('movie_details.json', {
      movie_id: id, with_images: true, with_cast: true
    });
    setCache(ck, data, 3600000);
    res.json(data);
  } catch (err) { res.status(500).json({ error: 'Failed to load movie.' }); }
});

// ── Home lists ─────────────────────────────────────────────────────
const homeList = (sort, genre, opts = {}) => async (req, res) => {
  const ck = `home:${sort}:${genre || ''}:v2`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const params = {
      sort_by: sort, limit: opts.limit || 50,
      genre: genre || undefined,
      minimum_rating: sort === 'rating' ? 6 : 0
    };
    const data = await yts('list_movies.json', params);
    let movies = data.data?.movies || [];
    // Filter by minimum year server-side
    if (opts.minYear) movies = movies.filter(m => m.year >= opts.minYear);
    // Trim to desired output size
    movies = movies.slice(0, opts.outputLimit || 20);
    const result = { ...data, data: { ...data.data, movies, movie_count: movies.length } };
    setCache(ck, result, 1800000);
    res.json(result);
  } catch (err) { res.status(500).json({ error: 'Failed.' }); }
};

// Trending: like_count, only 2020+ (genuine trending, not ancient films)
app.get('/api/trending', authApi, homeList('like_count', '', { minYear: 2020, limit: 50, outputLimit: 20 }));
// Popular: download_count (client sorts by year desc)
app.get('/api/popular',  authApi, homeList('download_count', '', { limit: 50, outputLimit: 20 }));
// New Releases: date_added, only 2022+ (no 1975 movies here)
app.get('/api/new',      authApi, homeList('date_added', '', { minYear: 2022, limit: 50, outputLimit: 20 }));
// Top Rated: rating >= 6 (client sorts by year desc)
app.get('/api/toprated', authApi, homeList('rating', '', { limit: 50, outputLimit: 20 }));
app.get('/api/action',     authApi, homeList('download_count', 'Action'));
app.get('/api/comedy',     authApi, homeList('download_count', 'Comedy'));
app.get('/api/thriller',   authApi, homeList('download_count', 'Thriller'));
app.get('/api/horror',     authApi, homeList('download_count', 'Horror'));
app.get('/api/scifi',      authApi, homeList('download_count', 'Sci-Fi'));
app.get('/api/animation',  authApi, homeList('download_count', 'Animation'));

// ── Genre discover ─────────────────────────────────────────────────
app.get('/api/genre/:name', authApi, async (req, res) => {
  const { name } = req.params;
  const { sort = 'download_count' } = req.query;
  const ck = `genre:${name}:${sort}`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const data = await yts('list_movies.json', {
      genre: name, sort_by: sort, limit: 20
    });
    setCache(ck, data, 1800000);
    res.json(data);
  } catch (err) { res.status(500).json({ error: 'Failed.' }); }
});

// ── Suggestions ────────────────────────────────────────────────────
app.get('/api/suggestions/:id', authApi, async (req, res) => {
  const ck = `sug:${req.params.id}`;
  const cached = getCached(ck);
  if (cached) return res.json(cached);
  try {
    const data = await yts('movie_suggestions.json', { movie_id: req.params.id });
    setCache(ck, data, 3600000);
    res.json(data);
  } catch (err) { res.status(500).json({ error: 'Failed.' }); }
});

// ── Health ─────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()), cache: cache.size });
});

app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

app.listen(PORT, () => {
  console.log(`\n🎬  SkyluxMovies — Self-Reliant`);
  console.log(`📡  http://localhost:${PORT}\n`);
});
