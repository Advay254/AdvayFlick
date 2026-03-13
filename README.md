<div align="center">

<img src="https://img.shields.io/badge/SkyluxMovies-v3.0.0-d4922a?style=for-the-badge&logo=film&logoColor=white" alt="SkyluxMovies v3.0.0" />

# 🎬 SkyluxMovies

### Stream and download free HD movies — no account, no watermark, no hassle.

[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com)
[![YTS](https://img.shields.io/badge/Powered%20by-YTS-f0b84a?style=flat-square)](https://yts.bz)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/Advay254/SkyluxMovies/pulls)

<br/>

> Search a movie. Pick your quality. Download in seconds. No sign-up, ever.

<br/>

![SkyluxMovies Demo](https://skyluxmovies.onrender.com/og-image.png)

</div>

---

## ✨ Features

- 🎬 **720p · 1080p · 4K** — quality picker on every movie, sourced from YTS
- 🔥 **Rich catalogue homepage** — Trending, New Releases, Top Rated, Most Downloaded + 9 genre rows (Action, Horror, Sci-Fi, Comedy, Thriller, Animation, Crime, Drama, Adventure)
- 🗂️ **14 genre tabs** — tap any genre for a full-screen filtered view
- 🖼️ **Category visual cards** — genre thumbnails built from real movie posters
- 🔍 **Live search** — instant results dropdown as you type, powered by YTS search API
- 🎞️ **Movie detail page** — backdrop blur, cast circles, IMDb rating ring, trailer link, quality picker
- ⚡ **Server-side caching** — TTL-based in-memory cache per endpoint to minimise YTS API calls
- 📱 **Mobile-first PWA** — installable from browser, network-first service worker, auto-updates on deploy
- 🗺️ **Production SEO** — JSON-LD knowledge graph, FAQPage schema, dynamic Open Graph, robots.txt with AI crawler allowlist, XML sitemap
- 💰 **Ad-ready** — drop in your Adsterra/ad network scripts with no conflicts
- 🚀 **Deploy anywhere** — Render, Railway, Fly.io, any Node.js host

---

## 🗂️ Project Structure

```
SkyluxMovies/
├── server.js                  # Express backend — YTS proxy, cache, sitemap, health check
├── package.json
├── .env.example               # Environment variable reference
├── .gitignore
└── public/
    ├── index.html             # Homepage — hero, category tabs, genre rows, live search
    ├── results.html           # Search & browse results page
    ├── movie.html             # Movie detail — backdrop, cast, quality picker, trailer
    ├── style.css              # Global styles (Tailwind Play CDN + custom)
    ├── pwa.js                 # Service worker registration
    ├── sw.js                  # Service worker — network-first HTML, SWR assets
    ├── manifest.json          # PWA manifest — full icon set, screenshots, shortcuts
    ├── robots.txt             # Crawl rules — allows all crawlers + AI bots
    ├── og-image.png           # Open Graph preview image (1200×630)
    ├── icons/
    │   ├── icon-72.png
    │   ├── icon-96.png
    │   ├── icon-128.png
    │   ├── icon-144.png
    │   ├── icon-152.png
    │   ├── icon-192.png
    │   ├── icon-384.png
    │   ├── icon-512.png
    │   ├── icon-maskable-192.png
    │   └── icon-maskable-512.png
    └── screenshots/
        ├── desktop.png        # 1280×800  — PWA install banner (wide)
        └── mobile.png         # 390×844   — PWA install banner (narrow)
```

---

## 🚀 Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/Advay254/SkyluxMovies.git
cd SkyluxMovies
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```env
SITE_URL=http://localhost:3000
PORT=3000
```

### 4. Run the server

```bash
npm start
# or for development with auto-reload:
npm run dev
```

Visit `http://localhost:3000` — you're live. 🎉

---

## 🔑 Environment Variables

Set these in your hosting dashboard under **Environment Variables** before deploying.

| Variable   | Required | Description |
|------------|----------|-------------|
| `SITE_URL` | ✅ **Yes** | Full production domain — used for sitemap and canonical URLs. Example: `https://skyluxmovies.onrender.com` |
| `PORT`     | Auto     | Set automatically by Render — do not set manually |
| `API_KEY`  | Optional | If set, external API requests must include this key via `?key=` or `x-api-key` header. Browser requests from your own domain bypass this check automatically. |

> ⚠️ `SITE_URL` is the most critical variable. If missing, the sitemap will reference the wrong domain and hurt Google indexing.

---

## 🌐 Deploying to Production

### Render (recommended — current host)

1. Push your code to GitHub
2. Connect the repo on [render.com](https://render.com)
3. Set **Build Command:** `npm install`
4. Set **Start Command:** `npm start`
5. Add `SITE_URL` under **Environment Variables**
6. Deploy

> Render free tier sleeps after 15 minutes of inactivity. Use [cron-job.org](https://cron-job.org) to ping `/api/health` every 10 minutes to keep it awake.

### Railway

```bash
npm install -g @railway/cli
railway login && railway init && railway up
```

Add `SITE_URL` in the Railway dashboard → **Variables**.

### Any VPS (Ubuntu/Debian)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
git clone https://github.com/Advay254/SkyluxMovies.git
cd SkyluxMovies && npm install
npm install -g pm2
pm2 start server.js --name skyluxmovies
pm2 save && pm2 startup
```

---

## 🛠️ How It Works

```
User opens SkyluxMovies
        ↓
Homepage loads 4 parallel fetches (trending, new, top-rated, popular)
Genre rows stream in with 350ms stagger (prevents YTS rate limiting)
        ↓
User searches or taps a movie card
        ↓
GET /api/movie/:id
  → Server checks in-memory cache (6hr TTL)
  → Cache miss: fetches YTS movie_details with cast + images
  → Rewrites all YTS image URLs to /api/img?u= proxy
  → Returns proxied JSON to client
        ↓
Movie detail page renders
  → Backdrop blur, poster, cast circles, IMDb ring, genres, synopsis
  → Quality picker shows available torrents (720p / 1080p / 4K)
  → Tapping a quality triggers SPlayer magnet link intent
  → Trailer button opens YouTube directly (avoids embed Error 153)
        ↓
Browser opens SPlayer → torrent downloads natively on device
```

> **Why image proxy?** YTS CDN returns `Access-Control-Allow-Origin: *` on their images but applies hotlink protection. The `/api/img?u=` proxy strips the Referer header on the server side, bypassing the block reliably.

---

## ⚡ Cache TTL Reference

| Endpoint | TTL | Reason |
|----------|-----|--------|
| `/api/search` | 10 min | Search results change often |
| `/api/trending`, `/api/new`, genre rows | 2 hr | Updated daily by YTS |
| `/api/toprated`, `/api/popular` | 2 hr | Stable, high-traffic lists |
| `/api/movie/:id` | 6 hr | Movie metadata rarely changes |
| `/api/suggestions/:id` | 4 hr | Suggestion list changes slowly |
| `/api/img` | 24 hr | Image bytes never change |

---

## 🗺️ SEO

SkyluxMovies ships with production-grade SEO out of the box:

- **JSON-LD knowledge graph** — `Organization`, `WebSite`, `WebPage`, and `Movie` entities linked by `@id`
- **FAQPage schema** — eligibility for Google AI Overviews and rich results
- **Movie schema** — title, year, genre, rating, runtime, language per movie page
- **Dynamic Open Graph** — title, description, and poster update on the client after each movie loads
- **robots.txt** — explicit `Allow` for GPTBot, ClaudeBot, and PerplexityBot for GEO (Generative Engine Optimization)
- **XML sitemap** at `/sitemap.xml` with `<lastmod>`, `<changefreq>`, and `<priority>`
- **Canonical URLs** on every page

Submit your sitemap to [Google Search Console](https://search.google.com/search-console):
```
https://skyluxmovies.onrender.com/sitemap.xml
```

Target keywords: `free movie download no account`, `download HD movies free`, `watch movies online free no sign up`, `free 1080p movie download`, `download action movies free`

---

## 🔒 Security

- **Server-side image proxy** — real YTS CDN URLs never exposed to the browser
- **Optional API key** — protect endpoints from external scrapers if needed
- **Rate limiting** — 300 requests / 15 min per IP via `express-rate-limit`
- **Hardened HTTP headers** — via `helmet` (CORS, XSS, clickjacking protection)
- **YTS-only data source** — no user data stored, no auth tokens, no sessions

---

## 🤝 Contributing

1. Fork the repo
2. Create your branch: `git checkout -b feature/your-feature`
3. Commit: `git commit -m 'Add your feature'`
4. Push: `git push origin feature/your-feature`
5. Open a Pull Request

---

## ⚠️ Disclaimer

SkyluxMovies is an independent open-source project and is **not affiliated with, endorsed by, or connected to YTS, YIFY, or any movie studio** in any way.

This tool indexes publicly available torrent metadata. Users are responsible for complying with copyright laws in their country. Always respect the work of filmmakers and content creators.

---

## 📄 License

MIT © 2026 Advay — free to use, modify, and distribute.

---

<div align="center">

**If SkyluxMovies saved you time, drop a ⭐ — it helps others find the project.**

</div>
