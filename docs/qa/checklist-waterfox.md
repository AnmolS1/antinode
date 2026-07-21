# Manual checklist — Waterfox (first-class)

**Target:** Waterfox current stable (6.6.x, ESR-140 base) — Anmol's daily driver.
**Treat as:** WebGL2 path · WebMIDI **yes** · tab-capture **no**.
**Tester:** ______  **Date:** ______  **OS:** ______  **Build/commit:** ______

Mark each: ✅ pass · ⚠️ pass-with-degradation (note it) · ❌ fail (file P0/P1). Attach
evidence (screenshot/recording link) for every non-trivial row.

## Boot & render
- [ ] App boots to the landing; wordmark + standing-wave glyph render.
- [ ] **Renderer takes the WebGL2 path** — confirm `#stage[data-engine]` = `webgl2`
      (open the Perf panel / inspect the canvas). Evidence: ______
- [ ] If Waterfox's pref-flipped WebGPU engages instead, verify it works **or** force
      `?gl=1` and note which path was tested. Note: ______
- [ ] All three scenes (heritage, standing-wave, phosphor) render and animate.

## Capture ladder
- [ ] **Drop a file** → perfect signal, scenes react. Evidence: ______
- [ ] **Tab / system audio** rung is correctly **disabled** with the honest reason
      ("Firefox has never shipped tab audio capture…"). Evidence: ______
- [ ] **Loopback device** (BlackHole / VB-Cable via the mic picker) captures cleanly
      with headphones connected. Evidence: ______
- [ ] **Microphone** path works (EC/NS/AGC off).

## Controls & sharing
- [ ] **WebMIDI** works — a connected controller drives mapped params (MIDI-learn).
- [ ] Preset **share URLs** roundtrip (copy link → open in a fresh tab → same look).
- [ ] Keyboard: `Space` pin/unpin, `F` fullscreen, `1–9` scenes, `[`/`]` presets,
      `S` snapshot, `?` help.

## Privacy hardening (Waterfox-specific)
- [ ] With `privacy.resistFingerprinting` **ON** (timers coarsen), the app **stays
      functional** — animation is driven by the audio clock, not wall-clock.
      Record as a **known-degradation** if motion is visibly coarser. Note: ______

## Result
- [ ] No open **P0** (broken core flow) · No open **P1** (broken enhancement w/o honest fallback).
- Known degradations (accepted by Anmol): ______
