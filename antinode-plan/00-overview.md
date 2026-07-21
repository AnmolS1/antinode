# Antinode — plan of record

*A music visualizer that listens and gives the sound a shape.*
Formerly `audio_visualizer` / codename "spotiball". Written 2026-07-21 with Claude (Cowork), decisions locked with Anmol the same day.

**Name:** an *antinode* is the point on a standing wave where the oscillation is largest — the exact spot where the wave shows itself. Chosen 2026-07-21 after Spotify's naming policy killed "Spotiball" (Developer Policy §VI: an app name "should not begin with 'Spot' or be confusing in sound or spelling to Spotify"; they won a dilution case against "Potify"). Checked against the visualizer-app landscape — no existing product surfaced under "Antinode". Runner-ups considered: FlatWaves (collides with FlatFold — exactly the cross-project confusion to avoid; also a flat wave is silence), Tonoscope (existing "Software Tonoscope" niche), Chladni ("Chladni Screen" app exists), Entrain (entrainme.com exists).

## What exists today

`~/GitHub/antinode` (renamed from `audio_visualizer` 2026-07-21; GitHub repo rename is T01). A 2023-era CRA app (`react-scripts` 5, React 18, three 0.151): a two-layer icosahedron wireframe visualizer driven by WebAudio `AnalyserNode` from a **local file input** — no Spotify code in the current tree (the old React+Express Spotify sync lives only in git history). `temp/` holds a duplicate. `touchdesigner-skill.md` is a good TD reference written for this project — it stays, and T05 builds on it.

The site already tells this project's story: `ponderance.dev/workshop/audio-visualizer` and the marginalia note *"Knowing what's playing vs. knowing what the music is doing"* (2026-05-29) — which diagnosed precisely the gap this rebuild closes. The note's "hard half" (knowing what the audio is *doing*) is now solved by listening to real audio client-side instead of dancing to Spotify's description of it.

## The 2026 Spotify reality (research 2026-07-21; all dates verified)

These constraints are load-bearing. Do not design against pre-2024 memories of this API.

| Fact | Detail | Since |
|---|---|---|
| Audio analysis is dead for new apps | `audio-features`, `audio-analysis`, `recommendations`, 30-sec `preview_url`s → 403/null for apps without pre-existing extended quota. Never reversed; no replacement. **Not even tempo/BPM is available.** | 2024-11-27 |
| Redirect URIs must be HTTPS | `http://localhost` banned for everyone; explicit loopback `http://127.0.0.1:PORT` still allowed for dev. `https://antinode.ponderance.dev/callback` is compliant. | enforced 2025-11-27 |
| Dev mode = 5 users | Manually allowlisted accounts only; **app owner must keep Spotify Premium**; 1 client ID per new developer. Was 25 users until Feb 2026. | 2026-02-11 / 03-09 |
| Extended quota = businesses only | Registered business entity + launched service + **250k MAU** minimum. "Individual applications are no longer accepted." There is no review path for a hobbyist. | 2025-05-15 |
| Refresh tokens expire after 6 months | Not extended by use; on `invalid_grant`, discard and re-auth. | 2026-06-18/07-20 |
| PKCE needs no backend | Token endpoint is CORS-enabled; a fully static site can run the whole flow. Implicit grant is dead. | 2025-11-27 |
| Still available to new apps | `/me/player` (state), `/me/player/currently-playing`, `/me/player/queue`, recently-played, playback controls, single-item metadata, album art, `/search` (limit ≤10), `/me/top`. | current |
| Album art must stay intact | Design Guidelines: no distortion, no crop, no overlay, rounded corners, unmodified metadata, link back to Spotify, full logo ≥70px for attribution. | current |
| No sync-to-video features, ever | Policy §III.6: "Do not synchronize any sound recordings with any visual media…". Real-time *reactive* rendering has long precedent (Kaleidosync et al.) and is the accepted reading; **exporting a video with the music is not** — that feature is permanently out of scope. | current |
| Non-commercial | Dev mode is for non-commercial personal use. Antinode is free. No ads, no data resale (also banned by Terms §IV.2.5). | current |

**Consequences, embraced rather than fought:**
1. **Spotify is the label, not the signal.** It tells us *what's playing* (track, art, position — polled ~1s and interpolated). The *sound itself* comes from the browser: the audio engine analyzes real audio locally.
2. **The public app never needs Spotify.** Mic / file / tab-capture modes work for anyone, with any music source. Spotify connect is a bonus tier for the 5 allowlisted seats (Anmol + 4). This turns the allowlist wall into a feature tier instead of a launch blocker.
3. If Spotify ever reopens hobbyist quota, only the allowlist UX changes — nothing architectural.

## Decisions (locked 2026-07-21)

| Decision | Choice |
|---|---|
| Name | **Antinode** — repo, subdomain, registry all renamed now (Anmol: "rename everything now so that nothing is confusing later") |
| Audio source | **Capture ladder** (below) — hybrid real-audio + Spotify metadata. Mic is *a* source, not *the* source: headphone listeners (the common case, per Anmol) get tab-capture (Chromium) or a loopback device (all browsers) or file mode. The app detects silence-while-playing and steers. |
| Publish scope | **Public app; Spotify = bonus tier.** No account needed for the visualizer itself. |
| Rendering | **three.js r185 `WebGPURenderer` + TSL**, automatic WebGL2 fallback — one shader codebase. WebGL2 is the guaranteed baseline (incl. Waterfox 6.6 / ESR 140); WebGPU is headroom on Chrome 113+, Safari 26+, Firefox 141+ (Win) / 145–147+ (AS macs). Live tweaking via Tweakpane 4 + a mod-matrix. |
| TouchDesigner | **Look-dev sandbox only** — TD has no web export and none is coming (native C++ engine; TouchEngine embeds are native-only). T05 ships a TD→TSL porting recipe so prototyped looks port mechanically. cables.gl noted as the web-native node alternative if TSL ever chafes. |
| UI framework | React 19 + Vite + TS for the chrome (consistent with Calque; CC velocity); the render loop and audio engine are framework-free modules React merely mounts. |
| Hosting | Static site on Cloudflare (same account/zone as ponderance.dev) at **antinode.ponderance.dev**. No backend, no database, no server-side state at all. |
| Auth | Spotify Authorization Code + PKCE, fully client-side. Scopes: `user-read-currently-playing user-read-playback-state` only. No Web Playback SDK in v1 (Premium-per-user + DRM iframe weight for zero analysis benefit — revisit later as an in-app playback tier). |
| Legal | Registry-driven ponderance `/privacy` + `/terms` — the `antinode` entry is **already updated** (status `planned`, so it renders nothing until launch flips it to `live`). See `03-legal.md`. |
| Browsers | Chrome, Firefox, **Waterfox** (Anmol's daily driver — ESR-based, treat as WebGL2 + WebMIDI yes + tab-capture no), Safari incl. iOS. Test matrix in T10. |
| Orchestration | Wave-based task graph run by Claude Code with parallel subagents — see `01-task-graph.md`. |

## The capture ladder

Every source feeds the same `AudioSourceProvider` interface; the engine and scenes never know which is active. Picker shows only what the current browser can do, with honest "why not" notes for the rest.

| # | Source | Chrome/Edge | Firefox/Waterfox | Safari | Works with headphones | Notes |
|---|---|---|---|---|---|---|
| 1 | **Drop a file** | ✅ | ✅ | ✅ | ✅ | Perfect signal. The heritage mode — kept forever. |
| 2 | **Tab / system audio** (`getDisplayMedia` audio) | ✅ (macOS system audio needs Chrome 141+ & macOS 14.2+) | ❌ never shipped | ❌ | ✅ | Bit-clean capture of the Spotify tab. Chromium-only, feature-detected. |
| 3 | **Loopback device** (BlackHole / VB-Cable) via mic picker | ✅ | ✅ | ✅ | ✅ (multi-output device) | Bit-clean, all browsers, one-time OS setup. First-class guided setup in the UI, not a footnote — this is the Waterfox+headphones answer. |
| 4 | **Microphone** (EC/NS/AGC off) | ✅ | ✅ | ⚠️ constraints partly ignored | ❌ speakers only | Zero-setup demo path. Safari keeps some voice DSP. |
| 5 | **Metadata-procedural** (Spotify seat required) | ✅ | ✅ | ✅ | ✅ | Floor mode: progress-locked motion, no spectral truth. Exists so a connected user with no capturable audio still gets *something*. |

## Architecture

```
sources (hot-swappable)                      Spotify layer (optional, 5 seats)
  file ─┐                                      PKCE (client-side, no backend)
  tab  ─┤                                      /me/player poll ~1s + drift-corrected
  loop ─┼─► AudioEngine ─► FrameFeatures ─┐    interpolation · now-playing card
  mic  ─┘   (AudioWorklet: FFT, bands,    │    (art intact + attribution + link-back)
            RMS, flux/onset, BPM+phase,   │            │
            adaptive normalize, asym lag) │            ▼ (labels, palette, position)
                                          ▼
                render core — three.js r185 WebGPURenderer → auto WebGL2, TSL
                  scene registry: 01 Heritage · 02 Standing Wave · 03 Phosphor
                                          │
                Tweakpane 4 · presets · URL share · mod-matrix · MIDI/Gamepad
```

`FrameFeatures` is the whole coupling between sound and picture: `{ t, rms, bands{bass,lowMid,mid,high}, spectrum[64], flux, onset, beat{bpm,phase,confidence}, loudNorm, silent }` — normalized 0–1 by rolling percentile so any source/track drives scenes identically, smoothed with asymmetric lag (fast attack, slow decay — the TD skill file's §8 wisdom, ported).

## Repo layout (post-T01)

```
antinode/
  antinode-plan/        ← this plan (committed; contains no secrets)
  src/
    contracts/          ← shared types: FrameFeatures, AudioSourceProvider, SceneModule, NowPlaying
    audio/              ← T02 (engine, sources, worklet, analysis)
    render/             ← T03 (renderer bootstrap, TSL bridge, scene framework, quality governor)
    scenes/             ← T06, T09 (one folder per scene)
    spotify/            ← T08 (pkce, poller, models)
    ui/                 ← T04, T07 (shell, picker, onboarding, panels, now-playing card)
    theme/              ← tokens per 02-design.md
  touchdesigner/        ← T05 (look-dev kit + porting recipe; .toe stays untracked if large)
  tests/  e2e/  public/
```

## Launch checklist (beyond code — owner actions)

- [ ] `gh repo rename antinode` (T01; GitHub auto-redirects `AnmolS1/audio_visualizer`)
- [ ] Spotify dashboard: reuse the existing 2023 app if it still exists (pre-Nov-2024 client IDs keep a slightly wider endpoint surface and dodge the 1-client-ID cap); rename it **Antinode** (dashboard name obeys the same naming policy), set redirect URIs `https://antinode.ponderance.dev/callback` + `http://127.0.0.1:5173/callback`, remove any client secret from use (PKCE only)
- [ ] Rotate/revoke any Spotify client secret found in git history (T01 secret scan — the 2023 Express server likely had one)
- [ ] Allowlist the 5 Spotify seats (Anmol + 4); owner account keeps Premium
- [ ] DNS: `antinode.ponderance.dev` → Cloudflare project (T11)
- [ ] Flip `status: 'live'` in ponderance `legal-services.ts` + verify /privacy /terms render (T12)
- [ ] Workshop entry + follow-up marginalia note via ponder-and-post (T12, at ship)

## Out of scope (v1)

Native/desktop app (deliberately: "an app separate from Spotify kinda knocks" — Anmol), video export **(permanently — Spotify sync clause)**, Web Playback SDK in-app playback, monetization of any kind, WebXR, multi-user/rooms, non-Spotify streaming services (the source ladder makes them unnecessary — Apple Music through a loopback device already works).
