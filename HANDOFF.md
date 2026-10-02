# HANDOFF — SkyluxMovies (repo: AdvayFlick)

**Version: 4.1.0** · Last updated by this delivery (Chunk 1 of the Smart TV upgrade)

> I could not find a HANDOFF.md in Project Knowledge for this session — it wasn't among the
> uploaded files I had access to. This document is a fresh rewrite built from reading
> `server.js`, `public/movie.html`, `README.md` and `package.json` directly. If an older
> HANDOFF.md exists somewhere I don't have access to, send it over and I'll reconcile.

---

## 1. Current technical state

**Stack:** Node.js (CommonJS) + Express backend, static HTML/CSS/vanilla JS frontend, no
build step, no database, no payment system. Deployed on Render at
`skyluxmovies.onrender.com`.

**Data storage:** There is no database. Everything is either:
- fetched live from the YTS API (`movies-api.accel.li`, falling back to `yts.bz`) and
  held in an in-memory cache inside `server.js` (TTLs documented in the README —
  6hr for movie details, 2hr for homepage rows, 24hr for proxied images, etc.), or
- static files in `public/` (HTML, CSS, the blog articles, icons, the existing APK).

Nothing persists across a server restart except what's re-fetched from YTS. This is
intentional per your no-database rule, and it works fine from a phone-only workflow since
there's no admin dashboard or database console to manage — you only ever touch files in
the repo and environment variables on Render.

**Backend (`server.js`):** Express app with `helmet`, `express-rate-limit` (three tiers:
unrestricted image proxy, 30/min search, 600/15min general API), a YTS proxy layer, an
image proxy (`/api/img`) that strips Referer headers to bypass YTS CDN hotlink protection,
sitemap generation, and `/.well-known/assetlinks.json` for the existing TWA APK.

**Frontend:** Three main pages — `index.html` (homepage, genre rows, live search),
`results.html` (search/browse), `movie.html` (movie detail + the quality picker + the
action buttons). Plus 8 static SEO blog articles under `public/blog/`.

**Streaming/download flow (as of this version):**
- **Download** button: builds a magnet link from the torrent hash and hands it to
  `window.location.href`, so whatever torrent app is installed on the device (SPlayer or
  otherwise) picks it up. Unchanged from before this version.
- **Watch Now** button (previously labeled "Stream", previously opened SPlayer via an
  `intent:` URL): now opens an in-page, full-screen player overlay and streams the movie
  directly in the browser using WebTorrent (loaded from a CDN on demand, not bundled).
  See section 2 for how this works.

**Existing Android app:** A TWA (Trusted Web Activity) APK already ships in
`public/`, verified via Digital Asset Links (package `com.onrender.skyluxmovies.twa`).
This is separate from the Smart TV plan below — the TWA just wraps the existing phone
site, it has no TV-specific support.

**Smart TV plan (in progress, started this session, before this chunk):**
We're building this in chunks, in this order:
1. ✅ **Chunk 1 (this delivery):** in-browser WebTorrent player replacing the SPlayer
   `intent:` dependency for streaming, in `movie.html`.
2. ⬜ **Chunk 2 (not started):** player UI polish — progress bar refinement, in-player
   quality switching without closing the overlay.
3. ⬜ **Chunk 3 (not started):** TV d-pad player controls (play/pause/seek/volume via
   remote) wired into a `tv.js` file.
4. ⬜ **Chunk 4 (not started):** `index.html` / `results.html` — a direct Watch button on
   cards so TV users can skip the movie detail page.

Separately, earlier in this project (before the chunked streaming work started), I also
built a standalone Android TV **wrapper APK** (a plain WebView app, not TWA, because many
Android TVs lack Chrome) with GitHub Actions to build it without a PC. That wrapper's
`MainActivity.java` currently intercepts `intent:` and `magnet:` links and hands them to
SPlayer or any installed torrent app — **this will need a follow-up pass once Chunks 1–4
land**, since the wrapper was built against the old SPlayer-only flow and hasn't been
updated to prefer the in-browser player yet. That wrapper's files are not part of this
repo zip (they live in a separate Android project) and are not re-delivered here.

---

## 2. Key architectural decisions — read before changing this

**Why WebTorrent instead of continuing with SPlayer intents.**
SPlayer is an external dependency outside your control — it requires the app to be
installed, the intent can silently fail if it isn't, and TVs generally don't have it or
any easy way to sideload companion apps per-user the way a phone does. WebTorrent runs
inside the page itself, so "Watch Now" works identically on a phone, a TV WebView wrapper,
or any browser, with no app dependency. This is also the actual reason this chunk exists:
you want TV viewing to work like Netflix, not like "open a second app and hope."

**Why the player is a full-screen overlay `<div>`, not a new page.**
Keeping it inside `movie.html` avoids a page navigation (which would tear down the
quality-picker state and force a re-fetch of movie details) and makes the back button
behavior easy to control via `history.pushState` / `popstate` — one push when the player
opens, and `popstate` closes it. If this becomes its own page later, that back-button
wiring needs to move with it.

**Why WebTorrent is lazy-loaded from a CDN instead of bundled into the page.**
Most visits are downloads, not in-browser streams (per your own framing: people
downloading vs. people on a TV wanting to just watch). Loading WebTorrent's ~1MB+ library
unconditionally on every movie page load would hurt everyone to benefit only the subset
who tap Watch Now. It's pulled from `cdn.jsdelivr.net` on first use and cached by the
browser after that. **Do not move this into a bundled/local script without reconsidering
this tradeoff.**

**Why the largest file in the torrent is assumed to be the video.**
YTS torrents typically contain one video file plus small extras (subtitles, NFO, sample
clips). Picking `torrent.files.reduce((a,b) => a.length > b.length ? a : b)` is a simple,
reliable heuristic for "which file is the movie" without needing to parse filenames or
extensions. **If a future torrent source ships multiple large files (e.g. multi-part
releases), this heuristic will pick the wrong one — revisit before switching sources.**

**Why there's a blob-URL fallback path.**
`file.renderTo()` relies on MediaSource Extensions (MSE), which isn't universally
supported on every embedded/TV WebView. The fallback uses `getBlobURL()` instead, which
works more broadly but means the browser buffers more aggressively before playback starts.
**Don't remove the fallback branch** — it's the only thing standing between "doesn't play
on an older TV WebView" and a silent failure.

**Why the Download button was left untouched.**
You were explicit that Download should keep working exactly as before (magnet → whatever
torrent app the device has). Watch Now is the only button that changed. **Don't merge
these two code paths** — they serve genuinely different purposes (keep a file vs. watch
once) and your SPlayer guide/copy still correctly documents Download's behavior.

**Why `doAction()` still re-fetches the torrent hash from the YTS API before acting.**
This loop already existed before this change (hash can go stale between page load and
button tap, since YTS occasionally updates torrents). It was preserved unchanged and now
feeds into `openPlayer()` for streaming instead of only feeding the SPlayer intent. **If
you ever see a stream fail with a `/dev/null`-style hash mismatch, check this loop first
before assuming the player itself is broken.**

---

## 3. Known gaps

**v4.1.0:**
- `GET /api/suggestions/:id` returns a 500 for an invalid movie id instead of a handled
  4xx response. Pre-existing — found during this delivery's error-path testing, not
  introduced by this change. Not fixed, per your "flag, don't silently patch" rule.
- Unmatched static routes (e.g. `/this-does-not-exist.xyz`) return HTTP 200 instead of a
  404. Pre-existing Express static-serving behavior, not introduced by this change.
- Real peer-to-peer playback (actual trackers, actual seeders, an actual phone or TV
  browser) has **not** been tested — my sandbox has no outbound access to BitTorrent
  trackers or peers. What *was* tested for real: the server boots and every route
  (including the two gaps above) returns the expected status code under real HTTP
  requests, and the entire player state machine — open, buffer, play, progress-tick,
  close, back-button close, and the MSE-unsupported blob fallback — was run against the
  exact shipped code using jsdom with only WebTorrent's network layer mocked out (nothing
  about the DOM/player logic itself was simulated).
- The repo's version numbering had a pre-existing inconsistency (README badge said
  v4.0.0, `package.json` said 3.0.0). Resolved by treating 4.0.0 as current and bumping to
  4.1.0 for this change — flagged in the changelog in case that's not the lineage you
  intended.
- Delivery root folder is named `SkyluxMoxies/` per your standing instructions, even
  though the actual repo/package is named `AdvayFlick` / `skyluxmovies`. Flagged in the
  changelog.
- The standalone Android TV wrapper APK built earlier in this project (separate from this
  repo) still routes through the old `intent:`/SPlayer flow and has not yet been updated
  to use the in-browser player from this chunk. Needs a follow-up pass once all 4 chunks
  of the streaming work are done, so the TV wrapper and the web app agree on one approach.

---

## 4. Files delivered in this version (v4.1.0)

- `public/movie.html` — modified. Added the WebTorrent player overlay (HTML + CSS),
  replaced the SPlayer-intent stream path with `openPlayer()`/`_startStream()`/
  `closePlayer()`, renamed the Stream button to "Watch Now", updated the SPlayer guide
  copy to describe download-only usage, added `history.pushState`/`popstate` wiring for
  the back button.
- `package.json` — version bumped 3.0.0 → 4.1.0 (see flagged note above); no dependency
  changes (WebTorrent is loaded client-side from a CDN, not an npm dependency).
- `README.md` — version badge updated, "In-browser streaming" added to the features list,
  the "How It Works" diagram updated to reflect Watch Now vs. Download, and a new
  Changelog section added (this is the first changelog entry in the project).
- `HANDOFF.md` — this file, written fresh (no prior version was available to me this
  session).

Not included: `node_modules/`, any `.env` file, compiled CSS (none exists in this project
— `style.css` is hand-authored, not build-generated, so there's no postinstall CSS step
here), and the `test_player.js` jsdom test script used to verify this delivery (test-only,
not meant to ship).
