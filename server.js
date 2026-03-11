require('dotenv').config();
const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || null;
const YTS_BASE = 'https://movies-api.accel.li/api/v2';

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: { error: 'Too many requests, slow down.' }
}));

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Key Middleware (optional — for n8n/programmatic access) ──────────────
// Browser requests from the same origin are allowed freely.
// External callers (n8n) must pass ?key= or x-api-key header if API_KEY is set.
const authApi = (req, res, next) => {
  if (!API_KEY) return next(); // No key configured = open
  const referer = req.headers['referer'] || '';
  const host = req.headers['host'] || '';
  // Allow same-origin browser requests
  if (referer.includes(host)) return next();
  // Require key for external requests
  const key = req.query.key || req.headers['x-api-key'];
  if (key === API_KEY) return next();
  return res.status(401).json({ error: 'Unauthorized. Include valid API key.' });
};

// ─── HTTP Client ──────────────────────────────────────────────────────────────
const http = axios.create({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  }
});

// ─── In-Memory Cache ──────────────────────────────────────────────────────────
const cache = new Map();
function getCached(key) {
  const item = cache.get(key);
  if (!item || Date.now() > item.exp) { cache.delete(key); return null; }
  return item.data;
}
function setCache(key, data, ttl = 300000) {
  cache.set(key, { data, exp: Date.now() + ttl });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Search movies
app.get('/api/search', authApi, async (req, res) => {
  const { q, sort = 'rating' } = req.query;
  if (!q || !q.trim()) return res.status(400).json({ error: 'Missing search query.' });

  const cacheKey = `search:${q.trim().toLowerCase()}:${sort}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const { data } = await http.get(`${YTS_BASE}/list_movies.json`, {
      params: { query_term: q.trim(), sort_by: sort, limit: 10 }
    });

    if (data.status !== 'ok') throw new Error('YTS API error');
    setCache(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('[SEARCH]', err.message);
    res.status(500).json({ error: 'Search failed. Try again.' });
  }
});

// Movie details
app.get('/api/movie/:id', authApi, async (req, res) => {
  const { id } = req.params;
  if (!id || isNaN(id)) return res.status(400).json({ error: 'Invalid movie ID.' });

  const cacheKey = `movie:${id}`;
  const cached = getCached(cacheKey);
  if (cached) return res.json(cached);

  try {
    const { data } = await http.get(`${YTS_BASE}/movie_details.json`, {
      params: { movie_id: id, with_images: true }
    });

    if (data.status !== 'ok') throw new Error('YTS API error');
    setCache(cacheKey, data);
    res.json(data);
  } catch (err) {
    console.error('[MOVIE]', err.message);
    res.status(500).json({ error: 'Failed to load movie details.' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.floor(process.uptime()), cache: cache.size });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

app.listen(PORT, () => {
  console.log(`\n🎬 AdvayStream`);
  console.log(`📡 http://localhost:${PORT}`);
  console.log(`🔑 API Key: ${API_KEY ? 'enabled' : 'disabled (open)'}\n`);
});
