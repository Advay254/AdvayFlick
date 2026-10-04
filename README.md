<div align="center">

<img src="https://img.shields.io/badge/SkyluxMovies-v4.2.0-d4922a?style=for-the-badge&logo=film&logoColor=white" alt="SkyluxMovies v4.2.0" />

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
- 🔥 **Rich catalogue homepage** — Trending, Most Watched, New Releases, Box Office, Top Rated, Most Downloaded, Most Anticipated + 9 genre rows
- 🗂️ **14 genre tabs** — tap any genre for a full-screen filtered view
- 🖼️ **Category visual cards** — genre thumbnails built from real movie posters
- 🔍 **Live search** — instant results dropdown as you type
- ▶️ **In-browser streaming** — "Watch Now" plays the movie directly in the page via WebTorrent, no external app required
- 🎞️ **Movie detail page** — backdrop blur, cast circles, IMDb rating ring, trailer link, quality picker, similar movies grid
- ⚡ **Smart rate limiting** — 3-tier system: image proxy unrestricted, search 30/min, API 600/15min
- 📱 **Full PWA** — installable, Background Sync, Periodic Sync, Push Notifications handler, auto-updates on deploy
- 📲 **TWA / APK** — native Android app via Digital Asset Links verification (no URL bar)
- 📥 **In-browser install banner** — shows only in browser, hidden automatically in PWA/TWA
- 🗺️ **Production SEO** — JSON-LD knowledge graph, FAQPage schema, dynamic Open Graph, robots.txt with AI crawler allowlist, XML sitemap
- 📝 **SEO Blog** — 8 articles targeting high-traffic movie download keywords
- 💰 **Ad-monetized** — Adsterra banners (320×50 between rows, 300×250 footer) + popunder on movie page
- 🚀 **Deploy anywhere** — Render, Railway, Fly.io, any Node.js host

---

## 🗂️ Project Structure

```
SkyluxMovies/
├── server.js                  # Express backend — YTS proxy, cache, sitemap, asset links
├── package.json
├── .env.example               # Environment variable reference
├── .gitignore
├── README.md
└── public/
    ├── index.html             # Homepage — hero, category tabs, genre rows, live search
    ├── results.html           # Search & browse results page
    ├── movie.html             # Movie detail — backdrop, cast, quality picker, trailer
    ├── style.css              # Global styles
    ├── pwa.js                 # SW registration + Background Sync + Periodic Sync
    ├── sw.js                  # Service worker — network-first HTML, SWR assets, push handler
    ├── manifest.json          # PWA manifest — full icon set, screenshots, shortcuts, share target
    ├── robots.txt             # Crawl rules — allows all crawlers + AI bots
    ├── og-image.png           # Open Graph preview image (1200×630)
    ├── SkyluxMovies — Free HD Movies Download.apk  # TWA Android app
    ├── blog/
    │   ├── index.html                                    # Blog listing page
    │   ├── free-hd-movie-download-no-account.html
    │   ├── watch-movies-online-free-no-signup.html
    │   ├── how-to-download-movies-to-phone.html
    │   ├── download-4k-movies-free.html
    │   ├── download-action-movies-free.html
    │   ├── how-to-stream-movies-free-splayer.html
    │   ├── best-free-movie-download-site-2025.html
    │   └── movie-download-not-working-fix.html
    ├── icons/
    │   ├── icon-72.png  · icon-96.png  · icon-128.png  · icon-144.png
    │   ├── icon-152.png · icon-192.png · icon-384.png  · icon-512.png
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
git clone https://github.com/Advay254/AdvayFlick.git
cd AdvayFlick
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

| Variable   | Required | Description |
|------------|----------|-------------|
| `SITE_URL` | ✅ **Yes** | Full production domain — used for sitemap and canonical URLs. Example: `https://skyluxmovies.onrender.com` |
| `PORT`     | Auto     | Set automatically by Render — do not set manually |
| `API_KEY`  | Optional | If set, external API requests must include this key via `?key=` or `x-api-key` header. Browser requests from your own domain bypass this automatically. |

> ⚠️ `SITE_URL` is the most critical variable. If missing, the sitemap and Digital Asset Links will reference the wrong domain.

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
git clone https://github.com/Advay254/AdvayFlick.git
cd AdvayFlick && npm install
npm install -g pm2
pm2 start server.js --name skyluxmovies
pm2 save && pm2 startup
```

---

## 🛠️ How It Works

```
User opens SkyluxMovies
        ↓
Homepage loads parallel fetches (trending, most watched, new, box office)
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
  → Similar movies in 3-column grid (18 titles)
        ↓
Watch Now  → in-browser WebTorrent player (streams in the page, no app)
Download   → magnet link handed to whatever torrent app is on the device
```

> **Why image proxy?** YTS CDN applies hotlink protection. The `/api/img?u=` proxy strips the Referer header server-side, bypassing the block reliably. The proxy accepts `yts.bz`, `yts.mx`, and `img.yts.mx` mirror domains.

---

## ⚡ Cache TTL Reference

| Endpoint | TTL | Reason |
|----------|-----|--------|
| `/api/search` | 10 min | Search results change often |
| `/api/trending`, `/api/watched`, `/api/new`, `/api/boxoffice`, `/api/anticipated` | 2 hr | Updated daily by YTS |
| `/api/toprated`, `/api/popular` | 2 hr | Stable high-traffic lists |
| `/api/movie/:id` | 6 hr | Movie metadata rarely changes |
| `/api/suggestions/:id` | 4 hr | Suggestion list changes slowly |
| `/api/img` | 24 hr | Image bytes never change |

---

## 🔒 Security & Rate Limiting

Three-tier rate limiting — tuned so normal browsing never hits a limit:

| Tier | Endpoints | Limit |
|------|-----------|-------|
| Unrestricted | `/api/img` (image proxy) | No limit — 24hr cached, one real fetch per image |
| Search | `/api/search` | 30 req / min — scrape protection |
| API | All other `/api/` routes | 600 req / 15 min per IP |

Additional protections:
- **Server-side image proxy** — real YTS CDN URLs never exposed to the browser
- **Optional API key** — protect endpoints from external scrapers
- **Hardened HTTP headers** — via `helmet` (XSS, clickjacking, MIME sniffing protection)
- **Digital Asset Links** — TWA verified via `/.well-known/assetlinks.json` so the Android app runs without a URL bar

---

## 📲 Android App (TWA)

The included APK is a Trusted Web Activity wrapping the SkyluxMovies PWA. Key details:

- **Package name:** `com.onrender.skyluxmovies.twa`
- **Asset links:** served at `/.well-known/assetlinks.json` — required for URL bar removal
- **Signing key:** kept separately in `signing.keystore` (not committed to repo)
- **In-browser install banner:** shown automatically to browser users, hidden in PWA/TWA mode via `matchMedia('(display-mode: standalone)')`

---

## 🗺️ SEO

SkyluxMovies ships with production-grade SEO:

- **JSON-LD knowledge graph** — `Organization`, `WebSite`, `WebPage`, and `Movie` entities
- **FAQPage schema** — eligibility for Google AI Overviews and rich results
- **Movie schema** — title, year, genre, rating, runtime, language per movie page
- **Dynamic Open Graph** — title, description, and poster update after each movie loads
- **robots.txt** — explicit `Allow` for GPTBot, ClaudeBot, and PerplexityBot (GEO)
- **XML sitemap** at `/sitemap.xml` — includes all pages + all 8 blog articles
- **Canonical URLs** on every page
- **SEO Blog** — 8 long-form articles targeting high-volume keywords

Submit sitemap to [Google Search Console](https://search.google.com/search-console):
```
https://skyluxmovies.onrender.com/sitemap.xml
```

**Target keywords:** `free movie download no account` · `download HD movies free` · `watch movies online free no sign up` · `free 4K movie download` · `download action movies free` · `stream movies free SPlayer`

---

## 📜 Changelog

### v4.2.0 — Player polish: quality switching + progress detail (Chunk 2 of the Smart TV upgrade)
- Added a quality selector inside the player overlay itself. You can now switch between 720p/1080p/4K **mid-stream** without closing the player — it tears down the current torrent and starts the new one in place.
- Switching quality also keeps the page's own quality picker (the one below the poster) in sync, so if you close the player afterward, it reflects whatever quality you ended up watching.
- Picking a quality with 0 seeds in the in-player selector is now rejected with a toast instead of silently starting a dead stream, and the selector reverts to the quality that's actually playing.
- Progress readout now also shows downloaded size vs. total size (e.g. "340 MB of 2.1 GB"), not just percentage/speed/peers.
- Added a stall hint: if 15+ seconds pass with 0 peers and under 2% progress, a message appears suggesting a different quality. It clears automatically once peers show up.
- `_fmtBytes` now handles gigabyte-scale numbers properly (previously topped out at MB formatting).
- Internal: the progress ticker now checks it's still ticking for the *current* torrent before updating the UI, so a rapid quality switch can't have an old timer overwrite the new stream's numbers.
- **Flagged, not changed:** same version-lineage note as v4.1.0 — carried forward.
- **Not tested:** same real-network caveat as v4.1.0 — real peer-to-peer playback and real quality-switch-under-load weren't tested (no tracker/peer access in this sandbox). What *was* tested for real: the full quality-switch state machine (open with N qualities → switch → old client destroyed → new stream starts with correct hash → page picker synced; 0-seed quality rejected and selection reverts) against the exact shipped code via jsdom, plus a full re-run of all Chunk 1 tests against this version to confirm no regressions. Server boot + HTTP checks also re-run clean.

### v4.1.0 — In-browser streaming (Chunk 1 of the Smart TV upgrade)
- Added a WebTorrent-based player directly in `movie.html`. The **Watch Now** button (previously "Stream") now opens a full-screen overlay and plays the movie in the browser — no SPlayer or other external app needed.
- **Download** is unchanged: it still hands the magnet link to whichever torrent app is on the device.
- Back button / back gesture closes the player (wired through `history.pushState` + `popstate`) instead of leaving the app.
- If the device's browser doesn't support MediaSource Extensions, the player falls back to a blob-URL download-then-play approach automatically.
- WebTorrent's library is lazy-loaded from a CDN only when Watch Now is tapped, so page weight is unaffected for people who only download.
- SPlayer guide and copy updated to describe it as the download path only, not the only way to watch.
- **Flagged, not changed:** `README.md`'s version badge said v4.0.0 while `package.json` said 3.0.0. Per your rule, the higher number (4.0.0) was treated as current and this release bumped to 4.1.0 — confirm that's the version lineage you want.
- **Flagged, not changed:** your delivery instructions say to root the zip under a folder named `SkyluxMoxies/`, but the actual repo/package is named `AdvayFlick` / `skyluxmovies`. This delivery uses `SkyluxMoxies/` as instructed — tell me if you'd rather it match the real repo name going forward.
- **Known gap (v4.1.0):** `GET /api/suggestions/:id` returns a 500 for an invalid id instead of a handled 4xx (pre-existing, not introduced by this change — found during error-path testing).
- **Known gap (v4.1.0):** unmatched static routes (e.g. a typo'd `.html` path) return 200 instead of a 404 (pre-existing Express static behavior, not introduced by this change).
- **Not tested:** real peer-to-peer playback on an actual phone/TV browser and actual magnet hashes with live seeders — my sandbox has no outbound network access to trackers/peers. What *was* tested for real: the server boots, every route returns the right status code under real HTTP requests (including the error paths above), and the full player state machine (open → buffering → playing → progress updates → close, plus the back-button and MSE-unsupported fallback paths) against the exact code shipped, using jsdom with WebTorrent's network layer mocked out.

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
