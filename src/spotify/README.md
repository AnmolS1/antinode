Owner: **T08** — Authorization Code + PKCE (client-side), `/me/player` poller, now-playing models. Produces `NowPlaying` / `SpotifyStatus` (src/contracts/spotify.ts).

## Environment

Set the **public** Spotify client ID (PKCE uses no secret) in `.env.local`:

```
VITE_SPOTIFY_CLIENT_ID=<the dashboard client id>
```

Unset → the whole layer stays dark (`isConfigured()` is false) and the app runs without Spotify. Redirect URIs registered on the dashboard: `https://antinode.ponderance.dev/callback` and `http://127.0.0.1:5173/callback` (loopback, never `localhost`).

## Layout

- `config.ts` — endpoints, exact scopes, storage key `antinode:sp`, compliance URLs, env client ID.
- `pkce.ts` — S256 verifier/challenge/state via Web Crypto.
- `store.ts` — token + handshake persistence under the one key; refresh-token rotation.
- `auth.ts` — authorize URL, `/callback` code exchange, refresh, error classification.
- `clock.ts` — `DriftClock`: drift-corrected, monotonic `progressAt(now)`.
- `poller.ts` — `SpotifyPoller`: visibility-gated `/me/player` polling, backoff, response guards.
- `palette.ts` — album-art palette extraction (03-legal: extraction ON, distortion NEVER).
- `procedural.ts` — pure metadata-procedural beat helper (capture-ladder mode #5).
- `controller.ts` — framework-free orchestrator (`SpotifyView`, connect/disconnect/reconnect, `completeRedirect`).
- `useSpotify.ts` — React hook the gate spreads into `<SpotifyArea>`.

## Gate seam (Wave-B integration; T08 does not edit App.tsx/main.tsx)

- **UI:** `App.tsx` swaps its dev fixtures for `const sp = useSpotify()` and spreads `sp.status / sp.nowPlaying / sp.palette / sp.stale / sp.connect / sp.disconnect / sp.reconnect` into `<SpotifyArea>`.
- **Flag/bundle:** keep `import('./spotify')` lazy behind `FEATURE_SPOTIFY && isConfigured()` so nothing ships when dark (index is side-effect-free).
- **Engine feed:** `controller.nowPlayingAt(now)` gives smoothly interpolated position each frame; `proceduralBeat(progressMs, bpm)` synthesizes `BeatInfo` for metadata-procedural mode. T02 wraps these — this layer owns labels/position, not the audio source contract.
