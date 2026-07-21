Owner: **T02** — audio engine, capture ladder, analysis. Produces `FrameFeatures` (src/contracts/features.ts).

## Map

- `engine.ts` — `AudioEngine`, the audio half of `EngineFacade`. Suspended-context lifecycle + `unlock()`, capture-ladder source switching, AnalyserNode tap, per-frame `FrameFeatures` emission, procedural synth. `setScene`/`scenes` delegate to an injected `SceneBridge` (render half, T03).
- `capabilities.ts` — the capture ladder with per-browser honesty (feature-detect; the only UA check is the documented Chromium gate on `getDisplayMedia` audio).
- `sources/` — `AudioSourceProvider` implementations: `FileSource` (audible), `InputSource` (mic/loopback, never routed to destination), `DisplayCaptureSource` (Chromium tab/system audio, video dropped), `ProceduralSource` (silent oscillator floor mode). `createSource()` factory.
- `analyzer.ts` — pure, allocation-free per-frame DSP core: FFT → 64 log bins (+EMA) → bands, RMS, percentile normalization, asymmetric lag, spectral flux/onset, silence, beat. Reuses one `FrameFeatures` object.
- `tempo.ts` — `TempoTracker` (pure onset-interval BPM + phase + confidence, the always-on `beat` producer) and `createLiveTempo` (wires `realtime-bpm-analyzer`'s AudioWorklet as the BPM authority when present).
- `dsp/` — `fft`, `bands`, `normalize` (rolling percentile), `lag` (`LAG_CONSTANTS`, `lagSmooth`), `flux` (onset + WCAG flashGuard).

## Notes

- The engine runs its own `fft.ts` over `getFloatTimeDomainData` (linear samples) rather than reading `getFloatFrequencyData` (dB) — so the unit tests exercise the exact production DSP path.
- `realtime-bpm-analyzer` needs a real AudioContext (AudioWorklet); it cannot run under jsdom, so tempo unit tests validate the pure `TempoTracker`. The library is genuinely wired in the live engine and seeds/overrides the pure estimate.
- Tests + fixtures live in `tests/audio/**` and `tests/fixtures/gen.ts` (vitest's include is `tests/**`).
