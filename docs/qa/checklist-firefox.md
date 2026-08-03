# Manual checklist — Firefox (current)

**Target:** current Firefox. **Treat as:** WebGPU on Windows / Apple-Silicon macs;
Linux & Intel-mac fall back cleanly to WebGL2. Tab-capture **no**.
**Tester:** ______  **Date:** ______  **OS / GPU:** ______  **Build/commit:** ______

Mark: ✅ · ⚠️ (note) · ❌ (file P0/P1). Attach evidence per row.

## Boot & render
- [ ] App boots; scenes render and animate.
- [ ] **WebGPU engaged on Windows / AS-mac**; **Linux / Intel-mac falls back cleanly to
      WebGL2** with no error and no visual break. Record which path this machine took:
      `#stage[data-antinode-engine]` = ______  (platform: ______). Evidence: ______

## Capture ladder
- [ ] Tab / system audio rung correctly **disabled** with honest reason.
- [ ] **Loopback device** capture works (with headphones). Evidence: ______
- [ ] File + mic paths work.

## Controls & sharing
- [ ] **WebMIDI** works (controller drives mapped params).
- [ ] Preset share URLs roundtrip. Keyboard shortcuts operable.
- [ ] `prefers-reduced-motion` engages the low-motion program.

## Result
- [ ] No open P0 · No open P1.
- Known degradations (accepted by Anmol): ______
