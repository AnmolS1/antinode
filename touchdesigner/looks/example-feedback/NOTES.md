# example-feedback

The worked porting example from `../../PORTING.md` §6 — a feedback ring, shown as TD GLSL
and finished TSL so the TD→TSL translation is concrete and checkable.

## What it does

A ring expands from center; its radius rides normalized loudness. Hue drifts with beat phase
plus a slow time term. The high band adds spectral sparkle. Each frame samples the previous
frame slightly zoomed and decayed, producing trails (the feedback loop).

## Reacts to (`FrameFeatures` fields)

| Field | Role | TD uniform |
|---|---|---|
| `loudNorm`   | ring radius            | `uLoud` |
| `bands.high` | spectral detail gain   | `uHigh` |
| `beat.phase` | hue drift              | `uBeatPhase` |
| `t`          | slow hue time term     | `uTime` (wall-clock in TD; `f.t` audio-clock after port) |
| `spectrum`   | per-column detail (64-bin row) | `sTD2DInputs[0]` → `spectrumAt` |

## Files

- `look.glsl` — the TD GLSL TOP body (rebuild the patch per `../../BUILD.md`).
- `hsvToRgb.ts` — mini TSL hsv→rgb (drop-in for `TDHSVToRGB`).
- `feedback.tsl.ts` — the finished TSL port + per-frame uniform update.
- `preview.png` — *(add a still once the TD patch is rebuilt/run — not committed yet.)*

## Port status: `ported-pending-verify`

TSL is committed and maps line-for-line to `look.glsl`. It cannot be compile-verified in this
worktree: `src/render/` is a stub (README only) until **T03** lands, and the port depends on
T03's `FeedbackHelper` (ping-pong; replaces the Feedback TOP) and `spectrumAt` (64-bin
DataTexture sampler). Confirm those import paths and run against T03's dev harness on **both**
WebGPU and WebGL2 at the wave gate, then flip status to `ported`.

## Known fidelity gaps (from `../../PORTING.md` §4)

- `uTime` is wall-clock in TD, audio-clock (`f.t`) after port — expect minor retiming.
- Spectrum bins: TD linear vs. contract log-spaced — `spectrumAt` indices may need re-tuning.
- `loudNorm` normalization differs (TD approx vs. rolling percentile) — tune the `0.4` radius
  gain in-browser, not against a TD-measured value.
- Verify final color in the browser (sRGB / WebGPU color management), not the TD viewport.
