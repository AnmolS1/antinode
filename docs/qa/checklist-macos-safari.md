# Manual checklist — macOS Safari 26

**Target:** Safari 26 on macOS. **Treat as:** WebGPU engaged · no MIDI UI · Gamepad path.
**Tester:** ______  **Date:** ______  **macOS version:** ______  **Build/commit:** ______

Mark: ✅ · ⚠️ (note) · ❌ (file P0/P1). Attach evidence per row.

## Boot & render
- [ ] App boots; landing renders.
- [ ] **WebGPU is engaged** — `#stage[data-antinode-engine]` = `webgpu`. Evidence: ______
- [ ] All three scenes render and animate.

## Audio lifecycle
- [ ] **Gesture unlock** — audio does not start until the first user gesture; then it does.
- [ ] **AudioContext suspends on minimize / tab-hide**, and **auto-resumes on return**
      (no manual poke needed). Evidence: ______

## Microphone caveat
- [ ] Mic path works; **constraints are partly ignored** — Safari keeps some voice DSP
      (EC/NS/AGC). Verify the colored analysis is still **acceptable**; note if not. Note: ______

## Controls & sharing
- [ ] **No MIDI UI** is shown (WebMIDI unsupported) — the Control folder hides MIDI cleanly.
- [ ] **Gamepad** path works if a controller is connected (axis → mapped param).
- [ ] Preset share URLs roundtrip. Keyboard shortcuts operable (verify `Space`/`F`/`1–9`/`[`/`]`/`S`/`?`).
- [ ] `prefers-reduced-motion` (System Settings → Accessibility → Reduce motion) engages the low-motion program.

## Result
- [ ] No open P0 · No open P1.
- Known degradations (accepted by Anmol): ______
