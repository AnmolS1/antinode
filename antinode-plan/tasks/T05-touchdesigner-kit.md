# T05 — TouchDesigner look-dev kit + porting recipe

**Role:** creative technologist. **Depends on:** T01. **Parallel with:** T02 T03 T04. Non-blocking for everything (feeds looks into T09+).
**Owns:** `touchdesigner/**`. **Reads:** `touchdesigner/SKILL.md` (moved by T01 — the operator/pattern reference), contracts (`FrameFeatures` field names), 00-overview (why TD can't ship: no web export exists — look-dev only).

## Purpose

Anmol prototypes looks in TD (fast, live, node-based) and ports keepers to TSL scenes with mechanical find-replace-level effort. The kit's job: make the TD patch *speak the same language* as the web engine so ports are translations, not rewrites.

## Deliverables

1. **`touchdesigner/BUILD.md`** — exact steps to assemble `antinode-lookdev.toe` (a .toe is binary; document the network so any TD session can rebuild it in ~15 min, per SKILL.md canon):
   - `Audio Device In CHOP` (device: BlackHole 2ch — same loopback the web app recommends, so look-dev hears exactly what the browser would).
   - `audioAnalysis` palette component → rename/Math/Lag chain producing **channels named exactly like FrameFeatures**: `bass lowMid mid high rms loudNorm flux beatPhase` (Lag CHOP settings mirroring T02's attack/release constants — table included) → `null_features`.
   - `Audio Spectrum CHOP → Resample(64) → CHOP to TOP` → `null_spectrum_top` (the 64-bin texture, same layout as the web `DataTexture`).
   - GLSL TOP scratchpad wired with uniforms `uBass uLowMid uMid uHigh uRms uLoud uFlux uBeatPhase uTime` (CHOP-reference expressions given verbatim) + `sTD2DInputs[0]` = spectrum TOP, `[1]` = Feedback TOP. **Prototype shaders against the identical interface the web scenes see.**
   - Perform-mode window + safe blank scene at Switch index 0 (SKILL.md §8c).
2. **`touchdesigner/PORTING.md`** — the TD→web recipe:
   - Signal table: Lag CHOP → engine `lagSmooth(attack, release)` (already applied — don't double-smooth); Math range remap → TSL `remap()`; Logic threshold → `onset`/`step()`; audioAnalysis kick → `uOnset`.
   - GLSL TOP → TSL translation table: `vUV.st` → `uv()`; `sTD2DInputs[n]` → `texture(x)` nodes / `spectrumAt(i)`; `TDSimplexNoise` → `mx_noise_float`; `TDHSVToRGB` → `hsvtorgb` (or mini TSL fn, provided); `TDOutputSwizzle` → drop; `#version`/none → n/a; Feedback TOP pattern → T03 `FeedbackHelper` ping-pong (worked example included both directions).
   - Instancing (Geometry COMP instance page ← CHOP) → `InstancedMesh` + TSL storage/attribute-driven transforms; particlesGPU/POPs → TSL compute (WebGPU) with the FBO fallback caveat.
   - A full worked example: one small feedback shader shown in TD GLSL and finished TSL side by side.
   - Honest limits list: no CHOP-network equivalent in the browser (the engine is fixed-function by design — new *signals* are code changes to T02, keep look-dev to the visual half); no TD Python; refresh-rate/color differences to expect.
3. **`touchdesigner/looks/`** — empty + README convention: one folder per prototyped look (`.toe` or `.tox` if small, screenshot, notes, port status). `.gitignore` entry for >10 MB toes (git-lfs optional note).

## Acceptance

- [ ] BUILD.md rebuilds a working patch in a current TD build (2025.32280+) — verified once by Anmol or a TD-equipped session; checklist boxes inside BUILD.md for that verification.
- [ ] PORTING.md's worked example compiles: the TSL side is committed as `touchdesigner/looks/example-feedback/` with a runnable snippet against T03's dev harness (coordinate at the wave gate if T03 lands after — snippet may target the contracts-only mock).
- [ ] Channel/uniform names verified identical to contracts (grep-level check listed in the doc).
- [ ] No imports/changes outside `touchdesigner/`. 04-handoff updated.
