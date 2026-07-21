# T02 — Audio engine & capture ladder

**Role:** audio DSP engineer. **Depends on:** T01. **Parallel with:** T03 T04 T05.
**Owns:** `src/audio/**`. **Reads:** `src/contracts/`, 00-overview (capture ladder + Spotify reality).
**No UI. No three.js. No Spotify.** Output = a working `EngineFacade` audio half + tests.

## Sources (implement `AudioSourceProvider` for each)

- `FileSource` — File/drag payload → `<audio>` element (loop, seekable) → `MediaElementAudioSourceNode`. Also routed to destination (user hears it). Handle decode errors kindly.
- `InputSource` — `getUserMedia` audio with `echoCancellation:false, noiseSuppression:false, autoGainControl:false, channelCount:2`; enumerate devices (labels post-permission) so **loopback devices (BlackHole, VB-Cable) appear as first-class picks**; never route to destination (feedback loop). Note in code: Safari partially ignores the constraints — accept, don't fight.
- `DisplayCaptureSource` — `getDisplayMedia({ audio: true, video: true })`, immediately stop video tracks, keep audio. Feature-detect: Chromium-only (Firefox/Waterfox/Safari have never shipped audio here — capability `reason` says so honestly). Handle the user picking a share without ticking "share audio" → detect zero-energy and report.
- `ProceduralSource` — silent oscillator standing in when only Spotify metadata drives visuals (emits synthetic FrameFeatures from beat-less progress; the real synthesis of motion happens scene-side — this source just keeps the engine loop alive and `silent=false`).
- `capabilities()` — the ladder with per-browser honesty (UA-feature-detect, not UA-sniff, except the documented getDisplayMedia-audio Chromium check).

## Analysis chain (AudioWorklet-first)

`source → AnalyserNode (fft 2048, smoothing 0)` + `AudioWorkletProcessor` tap for sample-accurate work:

1. 64 log-spaced bins 20 Hz–16 kHz from FFT magnitudes; per-bin EMA smoothing.
2. Bands: bass 20–160, lowMid 160–630, mid 630–2.5k, high 2.5k–16k (energy sums).
3. RMS; **rolling-percentile normalization** (p10–p95 window ~8 s) → `loudNorm` and normalized bands/spectrum, so quiet tracks and loud tracks drive scenes identically (auto-gain for *features*, not audio).
4. **Asymmetric lag** per feature (attack ≈ 0 ms, release 120–400 ms; per-band tuning) — the TD skill §8b behavior, implemented once here (`lagSmooth(attack, release)` helper exported for scene use too).
5. Spectral flux (half-wave rectified positive delta, band-weighted) → adaptive-threshold onset (median + k·MAD over ~1.5 s). **flashGuard:** onsets emitted max 3/s (WCAG 2.3.1) — hard clamp in the engine, not scene courtesy.
6. Tempo: `realtime-bpm-analyzer` fed from the worklet; smooth BPM readout; beat `phase` derived from last-beat timestamp + BPM, confidence-weighted.
7. `silent` detection: sustained sub-threshold RMS ≥3 s while a non-procedural source is active (UI uses this to steer users to a better source — headphones case).

AudioContext lifecycle: create suspended; `resume()` only inside a user-gesture path (exposed as `unlock()`); auto-resume on `visibilitychange`/focus (Safari suspends when backgrounded/minimized — WebKit 231105); expose context state changes.

## Deliverables

- `src/audio/` implementing the audio half of `EngineFacade` (`capabilities/selectSource/latest/onFrame`) with the render half stubbed via an injected callback registry.
- Fixture generator script (`tests/fixtures/gen.ts`): sine sweeps, click track at known BPM, pink noise, silence — checked-in small WAVs.
- Vitest (`OfflineAudioContext`-driven, no worklet in jsdom — abstract the processor so the DSP functions are pure and unit-testable): band mapping correctness, normalization convergence (loud vs quiet same-shape output within ε), onset hits on click track ±25 ms, no onsets on pink noise > 3/s (flashGuard), BPM lock within ±2 on 120 BPM fixture, silence flag timing.

## Acceptance

- [ ] `npm test` green incl. all DSP units; demo harness page (`/dev/audio.html`, dev-only) shows live meters for any source on Chrome AND Firefox.
- [ ] Mic path never audible (no feedback); file path audible; display path Chromium-gated with honest capability reason.
- [ ] FrameFeatures object allocation-free per frame (reused buffers) — verified by a heap-growth assertion over 10k frames.
- [ ] No imports outside `src/audio` + contracts. 04-handoff updated.
