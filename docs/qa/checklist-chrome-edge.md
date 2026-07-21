# Manual checklist — Chrome / Edge (Windows · macOS · Linux)

**Target:** current Chrome & Edge. **Treat as:** WebGPU on · tab-capture yes.
Run the platform rows **per OS** you can cover; record which platform each result is from.
**Tester:** ______  **Date:** ______  **Platforms covered:** ______  **Build/commit:** ______

Mark: ✅ · ⚠️ (note) · ❌ (file P0/P1). Attach evidence per row.

## Boot & render
- [ ] App boots; **WebGPU engaged** (`#stage[data-engine]` = `webgpu`). Evidence: ______
- [ ] All three scenes render and animate.

## Tab-capture (the headline Chromium path) — **manual, per platform**
- [ ] **Tab / system audio capture against a real Spotify tab**: pick the tab, allow
      "Share audio", and confirm **audio actually reaches the analyser** (DRM tab capture
      must produce audio — verify current behavior, do not assume). Record the result
      **per platform**:
  - Windows: ______   macOS: ______   Linux: ______
- [ ] **macOS system-audio** rung is offered **only on Chrome 141+ / macOS 14.2+**, and
      correctly gated off below that. Evidence: ______

## Controls & sharing
- [ ] **MIDI hardware smoke** if a controller is available (MIDI-learn maps a param).
- [ ] Loopback device path works. File + mic paths work.
- [ ] Preset share URLs roundtrip. Keyboard shortcuts operable.
- [ ] `prefers-reduced-motion` engages the low-motion program.

## Result
- [ ] No open P0 · No open P1.
- Known degradations (accepted by Anmol): ______
