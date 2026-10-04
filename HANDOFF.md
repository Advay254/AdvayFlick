# HANDOFF — SkyluxMovies (repo: AdvayFlick)

**Version: 4.2.0** · Last updated by this delivery (Chunk 2 of the Smart TV upgrade)

> No HANDOFF.md was available in Project Knowledge as of the v4.1.0 delivery either, so this
> is still effectively a from-scratch document, now carried forward and updated for v4.2.0.
> If an older/canonical HANDOFF.md turns up somewhere I don't have access to, send it over
> and I'll reconcile the two.

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

**Smart TV plan (in progress):**
We're building this in chunks, in this order:
1. ✅ **Chunk 1 (v4.1.0):** in-browser WebTorrent player replacing the SPlayer `intent:`
   dependency for streaming, in `movie.html`.
2. ✅ **Chunk 2 (this delivery, v4.2.0):** player UI polish — in-player quality switching
   (no need to close the overlay to change quality), downloaded/total size display, and a
   stall hint when a quality has no peers.
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

**Why quality switching tears down and recreates the WebTorrent client rather than
trying to reuse it.** WebTorrent's `.add()` is keyed to a specific torrent; there's no
clean "swap the torrent under an existing client" operation. Destroying `_wt` and
creating a fresh `WebTorrent()` instance per quality switch is slightly wasteful
(re-negotiates trackers from scratch) but is far more reliable than trying to manage
multiple torrents on one client or reuse state across incompatible torrents. **Don't
"optimize" this into a single persistent client** without first confirming WebTorrent 2.x
actually supports hot-swapping a torrent on an existing client — as of this version it
doesn't cleanly.

**Why the progress ticker checks `_wtTorrent !== torrent` before updating the UI.**
When you switch quality, the old torrent's `setInterval` ticker is still technically
alive for one more tick until `clearInterval` fires (JS timers aren't synchronously
cancelled mid-flight). Without this guard, a slow quality switch could have the OLD
torrent's ticker overwrite the percentage/peers/size display with stale numbers right
after the NEW stream starts. **If you touch the ticker logic, keep this guard** — it's
the only thing preventing a race between an old and a new stream's UI updates.

**Why the in-player quality `<select>` re-reads from `movieData.torrents` instead of
keeping its own copy.** `movieData` is already the single source of truth for what
qualities exist for this movie (fetched once on page load). Keeping a second copy in the
player would just be another thing to keep in sync. **If `movieData.torrents` is ever
restructured, `_populateQualitySelect()` needs to move with it.**

**Why switching to a quality with 0 seeds is blocked client-side instead of just letting
it try and fail.** WebTorrent will sit there finding zero peers indefinitely with no
built-in timeout — that's a worse experience than refusing the switch up front with a
toast, since we already have the seed count for every quality from `movieData` without
an extra request. **This check uses `movieData`'s seed count, which can go stale between
page load and switch** — same caveat as the hash-refresh logic in `doAction`/`onPlayerQualityChange`, not a new problem introduced here.

**Why `onPlayerQualityChange()` also calls the page's own `onQualityChange()`.** That
function is what drives the quality info panel below the poster (size, codec, seed count,
etc.) and the main `<select id="qualitySelect">`. Without this call, switching quality
*inside* the player would leave the page's own UI showing the old quality's info once the
player closes. **Don't remove this cross-call** without replacing what it keeps in sync.

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

**v4.2.0 (new):**
- No gaps specific to this chunk were found during testing, beyond the general
  real-network caveat below (same as v4.1.0).
- Switching quality rapidly (tapping through several qualities in under a second) hasn't
  been tested — each switch destroys/recreates a WebTorrent client, and doing that faster
  than a client can tear down cleanly is a plausible edge case worth a manual check once
  you have real devices to test on.

**v4.1.0 (carried forward):**
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

## 4. Files delivered in this version (v4.2.0)

- `public/movie.html` — modified. Added the in-player quality `<select>` (replacing the
  static quality badge), `_populateQualitySelect()`, `onPlayerQualityChange()`,
  `_resetLoaderUI()`, downloaded/total size display, the stall-hint element and its
  15-second/0-peer/<2%-progress trigger logic, and the `_wtTorrent !== torrent` guard in
  the progress ticker to prevent race conditions on quality switch. `_fmtBytes()` extended
  to handle GB-scale values. Removed the now-unused `#wtQualityBadge` CSS rule (the badge
  itself was replaced by the select in v4.2.0's HTML, but its CSS rule was accidentally
  left behind until this cleanup).
- `package.json` — version bumped 4.1.0 → 4.2.0; no dependency changes.
- `README.md` — version badge updated, new Changelog entry added for v4.2.0 (kept v4.1.0's
  entry below it).
- `HANDOFF.md` — this file, fully rewritten for v4.2.0 (see note at the top about no prior
  canonical version being available).

Not included: `node_modules/`, any `.env` file, compiled CSS (still not applicable — see
v4.1.0 note), and the jsdom test scripts used to verify this delivery (`test_chunk2.js`
and a Chunk 1 regression re-run script) — test-only, not meant to ship.

### A note on how this version was tested (worth knowing before the next chunk)

The first attempt at testing Chunk 2 with jsdom produced confusing false failures: calling
the real `_populateQualitySelect()` function appeared to see `movieData` as empty even
though it had just been set. That turned out to be a test-harness mistake, not a bug in
the shipped code — the test was setting up fake movie data via a *separate* `window.eval()`
call after the page script had already run, and `let`-declared variables don't share
their binding across separate eval() invocations (only within one continuous script
execution, the way a real `<script>` tag actually runs). Once the test's fake data was
folded into the *same* script execution as the page code — matching how a browser actually
runs a page — everything passed correctly. Flagging this in case Chunk 3 or 4's tests hit
the same illusion: if a jsdom test shows a function "not seeing" a variable that was
clearly set moments earlier, check whether the setup used a separate `window.eval()` call
before assuming the shipped code is broken.
