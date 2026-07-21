# T08 — Spotify layer (PKCE · poller · now-playing card)

**Role:** integration engineer. **Depends on:** T04 (+contracts). **Parallel with:** T06 T07 T09.
**Owns:** `src/spotify/**` + internals of T04's `<SpotifyArea>`. **Reads:** contracts (`NowPlaying`, `SpotifyStatus`), 00-overview Spotify-reality table (memorize it), 03-legal compliance checklist, 02-design card spec.
**Entirely optional layer:** the app must build, run, and test with the feature flag off or the dashboard app absent.

## Pre-flight (records findings in 04-handoff before coding)

Audit the Spotify dashboard: does the 2023 app still exist? If yes → **reuse** (pre-Nov-2024 client IDs keep a wider grandfathered endpoint surface + dodge the 1-per-developer cap): rename it **Antinode**, redirect URIs `https://antinode.ponderance.dev/callback` + `http://127.0.0.1:5173/callback`, confirm no client secret is used anywhere (PKCE only), note user-management (allowlist) state. If no → create fresh (5-user cap, restricted surface — we only need the player family, which survives). Client ID is public → ships in code/env as `VITE_SPOTIFY_CLIENT_ID`.

## Auth (PKCE, static-site-pure)

- Authorization Code + PKCE (S256, `crypto.subtle`), scopes exactly `user-read-currently-playing user-read-playback-state`. State param verified. `/callback` route completes exchange client-side (token endpoint is CORS-open) and cleans the URL.
- Token store (`localStorage antinode:sp`): access+refresh+expiry; refresh 60 s early; **always persist the newest refresh token** (rotation). **6-month refresh expiry** (live since 2026-07-20): `invalid_grant` → wipe store → status `expired` → UI offers a clean reconnect (copy explains it's Spotify's 6-month rule, not a bug).
- Not-allowlisted 403 at authorize/API → status `not-allowlisted` → honest UX: this app has 5 Spotify-granted seats; the visualizer itself works without connecting (one-click back to source picker).
- Privacy link (`ponderance.dev/privacy`) rendered **on the connect surface itself** (Developer Policy: policy display before sign-up), plus "not endorsed by Spotify" line.
- Disconnect = wipe local tokens + link to Spotify's app-revoke page (we can't revoke server-side; say so).

## Poller & clock (the marginalia-note problem, solved properly this time)

- `GET /me/player` every **1 s** while tab visible & playing; 5 s when paused; halted when hidden (resync on `visibilitychange`). Single-flight; jittered ±100 ms; on 429 honor `Retry-After` + exponential backoff; on 5xx/network → status degraded, keep last NowPlaying with `stale` flag.
- **Drift-corrected interpolation**: predicted = `progressMs + (performance.now() − fetchedAt)`; each poll updates an EMA of (server − predicted) offset; expose `progressAt(now)` — smooth, monotonic (clamp small backward jumps ≤120 ms, hard-resync beyond). Track-change detection fires a scene event (id change or >1.5 s discontinuity).
- Derived beat-grid substitute: **none from Spotify** (analysis endpoints dead — 00-overview). When an audio source is live, T02's BPM is the truth and Spotify supplies only labels/position. Metadata-procedural mode drives scenes from `progressAt` phase ramps (bars of assumed 4/4 at T02-estimated or user-tapped BPM; tap-tempo button lives on the card in that mode).

## Now-playing card (compliance is the layout — see 02-design + 03-legal)

Art intact (rounded, no overlay/crop/filter), metadata verbatim, full Spotify logo ≥70 px attribution, "PLAY ON SPOTIFY" → `trackUrl` link-back. **Palette extraction** (dominant swatches from art via canvas sampling, CORS: `i.scdn.co` allows anonymous crossorigin) exposed as `NowPlaying.palette` for scene tinting — the art itself is never texture-mapped or distorted (03-legal judgment call: extraction ON, distortion never). Card hidden entirely when disconnected (zero Spotify branding when unused). `S` snapshot excludes the card (T04 seam — verify).

## Tests

Vitest + msw: PKCE handshake (mock authorize+token), refresh rotation persistence, `invalid_grant` → expired flow, 403 → not-allowlisted, 429 Retry-After backoff timing (fake timers), drift correction sim (scripted server timelines: steady, stutter, seek, track change — assert monotonic smooth `progressAt` & correct events), poller visibility gating. Playwright: full flow against a stub server route; card renders fixture; disconnect wipes storage.

## Acceptance

- [ ] Connect → card live within 2 polls; skip/seek in the real Spotify app reflected ≤1.5 s (manual check note in PR with a real allowlisted account).
- [ ] Flag off / no client ID → zero Spotify code in the served bundle beyond the flag check (verify by bundle grep) and zero UI traces.
- [ ] All compliance items from 03-legal checklist ticked in PR description, screenshot of card attached.
- [ ] No secrets anywhere (client ID only); storage only under `antinode:sp`. 04-handoff updated incl. dashboard audit outcome.
