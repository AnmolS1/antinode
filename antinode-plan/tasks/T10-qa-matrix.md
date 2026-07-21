# T10 — Cross-browser QA matrix (the gate)

**Role:** QA engineer. **Depends on:** T06–T09 merged. Nothing ships around this gate.
**Owns:** `e2e/**`, `docs/qa/**` (checklists + reports). May file fixes as small PRs anywhere with the relevant task's file conventions — coordinate via 04-handoff.

## Automated (Playwright, CI)

Projects: chromium, firefox, webkit. For each: boot → pick file source with fixture WAV → each scene renders (screenshot, loose threshold, per-backend baselines) → param change applies → preset URL roundtrip → UI fade/pin → snapshot download works.
- Backend axis: default AND `?gl=1` on chromium (WebGPU vs WebGL2); firefox/webkit as shipped (assert the fallback engaged where expected — read the perf HUD hook).
- Fake capture: chromium `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` with fixture WAV (mic path E2E incl. silence-steering flow); firefox `media.navigator.streams.fake`; webkit fake-capture support is limited — mic path covered by unit-level mocks, noted honestly in the report.
- Feature determinism harness: `OfflineAudioContext` render of fixture → FrameFeatures trace snapshot compared across engines (tolerances documented).
- Long-run soak (chromium CI, nightly not per-PR): 20 min fixture loop; assert no unbounded `performance.memory` growth, no fps decay >10%, renderer.info stable.
- a11y: axe on picker/chrome/panels; keyboard-only script; contrast probes against bright-canvas worst case; `prefers-reduced-motion` emulation verifies the low-motion program engages; flashGuard property test at engine level re-verified E2E (frame-luma delta counter over strobe-bait fixture stays ≤3 Hz).

## Manual checklists (docs/qa/, checked before launch, evidence links required)

**Waterfox (Anmol's daily driver — first-class):** current stable (6.6.x, ESR-140 base): boot; **expect WebGL2 path** (if its pref-flipped WebGPU engages, verify or force `?gl=1` and note); tab-capture rung correctly disabled with honest reason; loopback (BlackHole) capture works; WebMIDI works; preset URLs; `privacy.resistFingerprinting` ON → timers coarsen: app must stay functional (animation from audio-clock, not wall-clock) with a known-degradation note.
**macOS Safari 26:** gesture unlock; AudioContext suspend on minimize → auto-resume on return; mic constraints partially ignored (voice DSP may color analysis — verify acceptable); WebGPU engaged; no MIDI UI shown; Gamepad path.
**iOS Safari 26 (iPhone + iPad):** memory headroom (no reload-loop; DPR cap honored; **no canvas resize churn** on rotate — reuse, letterbox); gesture unlock; mic-while-headphones limitation surfaced honestly; speaker-forcing during getUserMedia noted; Low Power Mode 30 fps degradation acceptable; touch controls usable; add-to-home-screen standalone display.
**Chrome/Edge (Win/mac/Linux):** tab-capture E2E against a real Spotify tab (manual — DRM tab capture must actually produce audio; verify current behavior, record result per platform); macOS system-audio rung only Chrome 141+/macOS 14.2+; WebGPU on; MIDI hardware smoke if available.
**Firefox current:** WebGPU Windows/AS-mac engaged, Linux/Intel-mac falls back cleanly; loopback + MIDI.
**Spotify layer (allowlisted account):** connect/disconnect; skip/seek/track-change reflect ≤1.5 s; 6-month-expiry UX (force via wiped refresh token); not-allowlisted UX from a second non-listed account; card compliance screenshots (per 03-legal checklist) archived in docs/qa/.

## Deliverables & acceptance

- [ ] CI matrix green 3 consecutive runs; flake list empty or quarantined with issues filed.
- [ ] `docs/qa/report-<date>.md`: per-browser results table, known degradations (each: honest, user-visible where relevant, accepted by Anmol), evidence links/screenshots.
- [ ] Zero open P0/P1 (P0 = broken core flow in any target browser incl. Waterfox; P1 = broken enhancement without honest fallback).
- [ ] 04-handoff updated; launch-readiness verdict written (go/no-go with reasons).
