Owner: **T03** — WebGPURenderer bootstrap + WebGL2 fallback, TSL bridge, scene framework, quality governor.

## What lives here

| Path | Role |
|---|---|
| `RenderCore.ts` | Orchestrator: renderer + shared camera + bridge + registry + governor + post + loop. `createRenderCore(opts)` (async). |
| `renderer/bootstrap.ts` | `parseBackendPreference` (`?gl=1` / `?gpu=0` → `forceWebGL`), `createRenderer` (async, WebGPU→auto WebGL2), `detectIsWebGPU`. |
| `bridge/FeatureUniforms.ts` | `FrameFeatures` → TSL `uniform()`s + 64-bin spectrum `DataTexture` (R32F, in-place). `spectrumAt(i)` TSL accessor. |
| `scene/SceneRegistry.ts` | Register/list/activate `SceneModule`s; crossfade state; dispose+dereference on swap. |
| `scene/FadeCompositor.ts` | Two-target crossfade mix (used only during the 400 ms fade). |
| `governor/QualityGovernor.ts` | Rolling p75 governor. Pure `percentile` + `decideStep`; ladder DPR → render scale → scene quality. |
| `post/PostChain.ts` | TSL scene-pass → bloom, toggleable (off = zero cost). |
| `feedback/FeedbackHelper.ts` | Ping-pong render targets (one impl for T09 Phosphor / T05 recipe). |
| `loop/FrameLoop.ts` | rAF loop, `dt` clamp ≤ 50 ms, explicit visibility pause. |
| `dev/` | Throwaway proof scene (`dev-spectrum`), synthetic `MockEngine` fixture, and a standalone harness (`dev.html`). Not part of the public API. |

## Rules honored

- **TSL node materials only** — no `ShaderMaterial` / `onBeforeCompile` (unsupported on WebGPURenderer).
- Imports stay within `three` (+ `three/webgpu`, `three/tsl`, `three/addons`) and `../contracts`. No audio/UI/scene-package imports.
- `SceneContext.renderer/scene/camera` are `unknown` in the contract; the core builds them from real Three objects and scenes narrow at their boundary — the contract types are untouched.

## Dev harness

`npm run dev`, open `/src/render/dev/dev.html`. Keys: `b` bloom toggle, `l` artificial-load toggle (watch the governor step Q0→Qn and recover).

## Deferred / e2e-verified (headless has no GPU)

- WebGPU storage-buffer spectrum fast path (the `DataTexture` path works on both backends behind the same `spectrumAt`).
- `renderer.info` leak baseline across scene switches, allocation-free steady state, and visible crossfade — these are runtime/e2e properties (see `e2e/`, T10). Unit tests cover the headless-verifiable logic (governor, registry lifecycle, uniform bridge, feedback swap, backend parse).

## Integration seam

T04 wires this into `src/main.tsx`: mount a canvas, `createRenderCore({ canvas, engine })` with the real T02 `EngineFacade`, then `registerScene` the T06/T09 scenes and `setScene`. See the dev harness for the boot shape.
