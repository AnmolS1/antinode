# T06 — Heritage scene (the 2023 sphere, faithfully)

**Role:** graphics engineer. **Depends on:** T02 + T03. **Parallel with:** T07 T08 T09.
**Owns:** `src/scenes/heritage/**`. **Reads:** contracts, T03's framework, and the ORIGINAL source at git tag `v0-2023-cra` (`src/index.js` there — the dual `IcosahedronGeometry(40/39.5, 4)` wireframe + inner shell with hand-written GLSL).

## Objective

Port the original visualizer to a `SceneModule` in TSL — **preserving its look exactly**. This is the project's history and its first regression test. Modernize the plumbing, not the character.

## Port notes (from reading the old code — verify against the tag)

- Two meshes: outer wireframe icosahedron (custom vertex displacement along `aFrequency` attribute + rotation matrices, additive-ish transparent look) and inner solid shell (position-derived subtle color, scale-pulsed by average level). Keep the duplicate-vertex → shared-index mapping (`detectIndex`) that makes the wireframe displace coherently — port the algorithm, precompute once, document it (it's the soul of the look).
- The zigzag spectrum→vertex mapping (255-wide mirrored ramps, `spectrum[num + 20]`, index-decayed) must be reproduced — but fed from T02's 64-bin normalized spectrum upsampled to the old 256-bin expectation (`spectrumCompat()` helper local to this scene; document the mapping so the visual weight lands on the same vertices).
- `uScale` ≔ old `frequencyAvg` chain → now `loudNorm`-based; tune the two constants until A/B matches (the old chain had magic ×1.2 ×1.7 ×1.7 gains — replicate the transfer curve, then note it).
- `isBlack` uniform (color vs. grayscale-cubed mode) → scene param `mode: color|mono`. Camera: same start position + OrbitControls (drei not needed — three addons OrbitControls works with WebGPURenderer).
- Old fixed `setPixelRatio(1.5)` → governor-managed DPR; old `Math.max(600, innerHeight)` sizing quirk → dies (document).
- GLSL strings → TSL node material (WebGPURenderer cannot run ShaderMaterial). Keep shader constants verbatim where possible; comment each with its old-line provenance.

## A/B regression

Build a one-off harness: serve the `v0-2023-cra` tag build (its file-input mode) and the new scene side by side, drive both with the same fixture WAV, capture frames at 3 timestamps → composite diff images committed to the PR (not the repo main tree). Acceptance is *perceptual* match (silhouette, displacement character, palette) — not pixel-identical (AA/DPR differ legitimately).

## Params (schema per contracts)

`mode (color|mono)` · `displacement gain` · `rotation speed` · `bloom send` (post-chain amount, default subtle) · `spin free/beat-locked` (new, off by default — beat-phase-locked rotation; the one tasteful modernization, opt-in).

## Performance & acceptance

- [ ] 60 fps at 1080p on WebGL2 mid-tier (Playwright perf sample on CI runner as smoke, real check in T10); allocation-free update loop.
- [ ] A/B composite in PR shows faithful match; `spectrumCompat` mapping documented.
- [ ] Works on both backends (`?gl=1` and WebGPU); dispose leak-free (T03 harness assertion).
- [ ] Registered as `heritage` in the registry; params drive via schema alone (no bespoke UI). 04-handoff updated.
