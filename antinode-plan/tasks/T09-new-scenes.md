# T09 — Scenes: Standing Wave + Phosphor

**Role:** graphics engineers ×2 — this task may itself split into two parallel subagents (T09a, T09b): the scenes share nothing but the framework. **Depends on:** T02 + T03 (T05's PORTING.md informs technique). **Parallel with:** T06 T07 T08.
**Owns:** `src/scenes/standing-wave/**` (a), `src/scenes/phosphor/**` (b). **Reads:** contracts, T03 helpers (`FeedbackHelper`, `spectrumAt`, governor `quality`), 02-design art direction, T05 PORTING.md.

Both scenes: TSL only; both backends (WebGPU compute fast path where it pays, WebGL2 fallback via FBO/instancing — behind T03's helpers); allocation-free updates; honor `quality` (particle/step counts), reduced-motion program, and rely on engine flashGuard for anything onset-driven. Default mod routes declared in registration metadata. 3 built-in presets each.

## T09a — Standing Wave (the default scene; the name made visible)

- A GPU particle field (~200k WebGPU / ~60k WebGL2, quality-scaled) forming a standing-wave surface: displacement `A(x,t) = Σ envelopes · sin(kx)·cos(ωt)` — **nodes pinned, antinodes breathing**. Bass drives antinode amplitude; mid steers a slow k-drift (wavelength morph); `beatPhase` locks ω when confidence high (the wave *stands* on the beat), free-runs otherwise.
- Onsets: radial ripples emitted **from the nearest antinode peak** (visual thesis of the app), decaying per asymmetric-lag feel.
- Look: phosphor-on-black, depth fog, additive glow via bloom send; camera slow orbital drift (off in reduced motion), OrbitControls when user grabs.
- Spotify palette (if `NowPlaying.palette` present): tint accent ramp toward track palette over 6 s — subtle, never replacing phosphor identity (02-design).
- Params (min): amplitude · wavelength · particle density (quality-linked) · ripple gain · beat-lock on/off · palette-follow on/off · glow.
- Implementation notes: WebGPU = TSL compute updating a storage buffer of particle states; WebGL2 = position ping-pong via `FeedbackHelper` textures + instanced quads sampling them (T05 PORTING.md pattern). One TSL displacement fn shared by both paths.

## T09b — Phosphor (long-exposure oscilloscope photography)

- Screen-space feedback flow field: previous frame sampled through a domain-warped FBM offset (2-octave warp; `mid` steers warp strength, `high` adds fine shimmer noise, `flux` kicks injection brightness), decay ~0.96 with `loudNorm`-linked bleed — trails like phosphor persistence.
- Injection layer: a Lissajous-ish trace — 2 phase-offset oscillators at frequencies derived from dominant spectral bins (`spectrumAt` argmax bands, smoothed) drawing the current "signal" into the field; on silence it settles to a flat idle line (honest: flat wave = silence).
- Look: monochrome phosphor, graphite-white only at peaks; scanline restraint per 02-design (≤0.04); vignette in-shader.
- Params (min): decay · warp amount · trace brightness · trace complexity (1–3 oscillator pairs) · shimmer · palette-follow (same rule as T09a).
- Implementation: pure `FeedbackHelper` ping-pong fragment pass + composite — cheap everywhere; WebGPU adds nothing structural (skip compute; note why in code).

## Tests & acceptance

- Vitest: displacement/flow pure functions (node positions stay pinned within ε across amplitudes; decay never →∞/NaN under property-tested feature streams); preset/param schemas validate.
- Playwright: each scene screenshot-stable per backend (loose threshold), 5× scene-switch leak check, fps sample ≥55 @1080p on CI baseline with quality auto.
- [ ] Both scenes registered (`standing-wave` default), demoable from fixture WAVs; visual review clip (10 s screen capture) attached to PR — **canvas-only capture of generated visuals, no Spotify audio in the clip** (sync clause; use the CC-generated fixture track).
- [ ] Reduced-motion + flashGuard verified by test hooks. 04-handoff updated.
