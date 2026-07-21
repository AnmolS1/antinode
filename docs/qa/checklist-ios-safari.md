# Manual checklist — iOS Safari 26 (iPhone + iPad)

**Target:** Safari 26 on iOS/iPadOS. Run the **whole list on both an iPhone and an iPad**.
**Tester:** ______  **Date:** ______  **Devices (model / iOS):** ______  **Build/commit:** ______

Mark: ✅ · ⚠️ (note) · ❌ (file P0/P1). Attach evidence per row.

## Memory & stability
- [ ] **No reload-loop** — the tab is not reloaded by the OS under memory pressure during a normal session.
- [ ] **DPR cap honored** — the canvas does not render at full Retina DPR (would blow the memory budget).
- [ ] **No canvas resize churn on rotate** — rotating the device **reuses** the canvas and
      **letterboxes**; it does not tear down / recreate the GL context. Evidence (screen recording): ______

## Audio
- [ ] **Gesture unlock** works (audio starts only after a tap).
- [ ] **Mic-while-headphones limitation** is surfaced **honestly** (not a silent black screen).
- [ ] **Speaker-forcing during `getUserMedia`** is noted to the user (iOS routes to speaker). Note: ______
- [ ] **Low Power Mode**: 30 fps degradation is **acceptable** and stable (no stutter/crash). Evidence: ______

## Touch & display
- [ ] **Touch controls are usable** — picker rungs, scene switcher, params pane all operable by touch.
- [ ] **Add to Home Screen** launches in **standalone** display (no browser chrome), renders correctly.
- [ ] All three scenes render and animate on-device.

## Result
- [ ] No open P0 · No open P1 (per device — note if a row differs iPhone vs iPad).
- Known degradations (accepted by Anmol): ______
