# T03 — Render core + scene framework

**Role:** graphics engineer. **Depends on:** T01. **Parallel with:** T02 T04 T05.
**Owns:** `src/render/**`. **Reads:** contracts, 00-overview (stack decision), 02-design (canvas ground).
**No scenes beyond a proof placeholder. No UI. No audio internals** (consume `FrameFeatures` from a fixture generator).

## Renderer bootstrap

- three.js **r185+**, `WebGPURenderer` with its automatic WebGL2 backend fallback. Expose `isWebGPU` on `SceneContext`. Support `?gl=1` (force WebGL2 via `forceWebGL: true`) and `?gpu=0` alias — T10 depends on these for matrix testing.
- All materials/shaders in **TSL node materials** (`ShaderMaterial`/`onBeforeCompile` are unsupported on WebGPURenderer — hard rule for every scene task).
- Init is async (`await renderer.init()`); handle init failure → user-readable error surface hook (T04 renders it).
- Canvas mounted once, never re-created; **no resize churn** (debounce 150 ms; iOS WebGL resize leaks — WebKit 219780); DPR capped at 2, governor may lower it.
- `webglcontextlost`/`restored` (WebGL2 path) → pause loop, dispose/reinit scene, toast hook.

## Feature→uniform bridge

`FeatureUniforms` helper: wraps FrameFeatures into TSL `uniform()`s (`uBass uLowMid uMid uHigh uRms uLoud uFlux uOnset uBeatPhase uBpm uTime`) + the 64-bin spectrum as a `DataTexture` (R32F, updated in place; storage-buffer fast path when `isWebGPU` — same TSL accessor either way: `spectrumAt(i)` TSL fn). One update call per frame; zero per-frame allocations.

## Scene framework

- `SceneRegistry`: register/list/activate `SceneModule`s (contract in `src/contracts/scene.ts`); `setScene(id)` = dispose old (verify via renderer.info that geometries/textures actually freed), init new, crossfade 400 ms (render both during fade only).
- Frame loop: fixed-order `features → active scene update(f, params, dt) → render`; `dt` clamped ≤ 50 ms (background tab return spike). Loop pauses when `document.hidden` (rAF stops anyway; make it explicit) and resyncs cleanly on return.
- **Quality governor**: rolling frame-time p75; over 16.6 ms budget → step down (DPR → internal render scale → scene-declared `quality` param 0–1 that scenes may use to cut particle counts); recover hysteretically. Expose readout for the perf HUD.
- Post-processing: TSL post chain with bloom (threshold/strength params), globally toggleable; off = zero cost.
- `FeedbackHelper`: ping-pong render-target utility with the same API on both backends (WebGL2 FBO / WebGPU) — T09's Phosphor scene and the T05 porting recipe both depend on this existing here, once.

## Proof placeholder scene

`scenes/dev-spectrum` (lives in `src/render/dev/`, not `src/scenes/` — throwaway): 64 bars from `spectrumAt(i)`, phosphor color, proves bridge + registry + governor end to end with the T02 fixture stream (synthetic sine-driven FrameFeatures when audio module absent — import ONLY contracts, feed via `EngineFacade` mock provided in `src/render/dev/mockFeatures.ts`).

## Tests

- Vitest: registry lifecycle (init/dispose called exactly once each; activating twice is a no-op), governor stepping logic (pure function over synthetic frame-time series), uniform bridge writes (values land in uniform nodes; spectrum texture updates in place).
- Playwright smoke (chromium + firefox): boot placeholder on both `?gl=1` and default; screenshot non-black; `renderer.info` leak check across 5 scene switches (geometry/texture counts return to baseline).

## Acceptance

- [ ] Placeholder renders on WebGPU (Chrome) and WebGL2 (`?gl=1`, Firefox) from one TSL codebase; backend visibly reported in perf HUD hook.
- [ ] Scene switch leaks nothing (renderer.info baseline restored); loop allocation-free steady-state.
- [ ] Governor demonstrably steps down/up under artificial load (dev toggle that burns GPU time).
- [ ] No imports outside `src/render` + contracts; 04-handoff updated.
