# PORTING.md — TouchDesigner → three.js/TSL porting recipe

Prototype a look in TouchDesigner (`BUILD.md`), then port the keeper to a TSL scene in the
web render stack (T03) with **mechanical, find-and-replace-level effort**. This works only
because the TD patch was built to speak the web engine's language: same channel names, same
uniform interface, same spectrum-texture layout. This file is the translation dictionary.

- **Render target:** three.js r185 `WebGPURenderer` + **TSL** (Three Shading Language), auto
  WebGL2 fallback — one shader codebase (`00-overview.md`). TSL nodes compile to WGSL
  (WebGPU) or GLSL (WebGL2), so you write nodes, not raw shader strings.
- **The coupling contract:** everything a scene reacts to arrives as `FrameFeatures`
  (`../src/contracts/features.ts`). A scene implements `SceneModule.update(f, params, dt)`
  (`../src/contracts/scene.ts`). Your ported shader's inputs are fields of `f`.
- **T03 API names** used below (`FeedbackHelper`, `spectrumAt`) are the **expected** helper
  surface T03 exposes for scenes; confirm exact import paths at the wave gate (T03 may land
  after this). The worked example marks that dependency explicitly.

---

## 1. The field mapping — TD channel / GLSL uniform → contract field

This is the load-bearing table. TD channels are **flat**; `FrameFeatures` is **nested**.
Get the nesting and the renamed pairs right and the rest of the port is trivial.

| TD channel (`null_features`) | GLSL TOP uniform | TSL access in `update(f,…)` | Notes / gotcha |
|---|---|---|---|
| `bass`      | `uBass`      | `f.bands.bass`  | **nested** under `bands` |
| `lowMid`    | `uLowMid`    | `f.bands.lowMid`| **nested** |
| `mid`       | `uMid`       | `f.bands.mid`   | **nested** |
| `high`      | `uHigh`      | `f.bands.high`  | **nested** |
| `rms`       | `uRms`       | `f.rms`         | flat |
| `loudNorm`  | `uLoud`      | `f.loudNorm`    | **name differs**: uniform `uLoud`, field `loudNorm` |
| `flux`      | `uFlux`      | `f.flux`        | flat |
| `beatPhase` | `uBeatPhase` | `f.beat.phase`  | **nested + renamed**: TD `beatPhase` → `beat.phase` |
| `onset`     | `uOnset`     | `f.onset`       | **boolean** in the contract, not a level — 0/1. In TSL feed `float(f.onset ? 1 : 0)` into a `uniform()`. |
| (time)      | `uTime`      | `f.t`           | contract `t` = **audio-clock** seconds; TD `uTime` was wall-clock `absTime.seconds`. Divergence — see §4. |
| (spectrum)  | `sTD2DInputs[0]` | `f.spectrum` (Float32Array[64]) | uploaded to a `DataTexture`; sample via `spectrumAt(i)` — see §2. |

Fields present in the contract but **not** driven into the TD patch:
- `beat.bpm`, `beat.confidence` — available to scenes; TD look-dev only used `beat.phase`.
- `silent` — a **state flag** (sustained sub-threshold input while a source is active), not a
  look driver. Scenes use it to fade to an idle state, not as a shader input. Deliberately
  absent from the channel set.

**Feeding features into TSL uniforms** (in `SceneModule.update`): update `uniform()` node
values each frame from `f`. Sketch:

```ts
// created once in init():
const uBass = uniform(0), uLoud = uniform(0), uBeatPhase = uniform(0), uTime = uniform(0);
// each frame in update(f, params, dt):
uBass.value = f.bands.bass;
uLoud.value = f.loudNorm;
uBeatPhase.value = f.beat.phase;
uTime.value = f.t;                 // audio-clock, NOT performance.now()
```

---

## 2. Signal / CHOP-network → engine translation

The web engine is **fixed-function by design**: the CHOP analysis network has no browser
equivalent. Everything the CHOP chain computes has **already been done** by T02's AudioWorklet
before a scene sees `FrameFeatures`. So most CHOP ops don't port — they're *already applied*.

| TD (CHOP-side) | Web equivalent | Rule |
|---|---|---|
| Lag CHOP (asym attack/release) | T02 asymmetric lag, already applied to `FrameFeatures` | **Do NOT re-smooth** in the scene. The `f.bands.*` etc. you receive are already lagged. Double-lagging makes motion mushy. |
| Math CHOP range remap (From/To Range) | TSL `remap(x, inMin, inMax, outMin, outMax)` | Only for shaping *inside* the shader; band normalization to 0–1 is already done. |
| Logic CHOP threshold | `f.onset` boolean, or TSL `step(edge, x)` | Onset detection is done (`f.onset`); use `step()` only for in-shader thresholds. |
| audioAnalysis `kick` → Logic | `f.onset` → `uOnset` (0/1) | one boolean, flashGuard-limited upstream. |
| Analyze CHOP (RMS) | `f.rms` | already computed. |
| Audio Spectrum → Resample(64) → CHOP-to-TOP | `f.spectrum` (Float32Array[64]) → `DataTexture` | sample with `spectrumAt(i)` (T03 helper) or `texture(spectrumTex, vec2(i/64, 0))`. |
| Merge / Rename / Null CHOP | n/a | pure plumbing; disappears in the port. |

**Spectrum sampling in TSL:** T03 uploads `f.spectrum` to a 64×1 `DataTexture` each frame.
Read bin `i` (0..63) with the helper `spectrumAt(iNode)` (returns the normalized bin), or
directly `texture(spectrumTexture, vec2(iNode.div(64), 0)).r`. Remember the **log-spacing
caveat** (§4): TD's Resample was linear unless you remapped it; the contract's 64 bins are
log-spaced, so a bin index means slightly different frequencies across the two — re-tune bin
positions after port if the look keyed off specific bins.

---

## 3. GLSL TOP → TSL translation table

Port the shader **body**. TSL is node-based: import functions from `three/tsl`, compose
nodes, assign the result to a material's `colorNode` / `fragmentNode` (or run a compute /
post-processing pass, per T03's scene framework).

| TD GLSL TOP | TSL node equivalent | Notes |
|---|---|---|
| `vUV.st` | `uv()` | `uv()` returns the 0–1 varying; TD's `vUV` is the same range. |
| `gl_FragCoord` | `screenCoordinate` / `screenUV` | prefer `uv()` where possible. |
| `sTD2DInputs[0]` (spectrum) | `texture(spectrumTexture)` / `spectrumAt(i)` | see §2. |
| `sTD2DInputs[1]` (feedback) | `texture(prevFrameTexture)` via `FeedbackHelper` | see §6 ping-pong. |
| `texture(s, uv)` | `texture(mapNode, uvNode)` | TSL `texture()` takes a texture node + uv node. |
| `TDSimplexNoise(p)` | `mx_noise_float(p)` | MaterialX simplex noise, imported from `three/tsl`. Range differs slightly; rescale if needed. |
| `TDPerlinNoise(p)` | `mx_noise_float(p)` (or `mx_worley_noise_float` for cellular) | pick the MaterialX noise closest to the look. |
| `TDHSVToRGB(c)` | `hsvtorgb(c)` if available, else the mini TSL fn below | provided below for portability. |
| `TDRGBToHSV(c)` | inverse mini fn (rarely needed for output) | write only if a look needs it. |
| `TDOutputSwizzle(x)` | **drop it** | TD-specific channel-order fix; TSL/three handles output ordering. |
| `#version` directive | **n/a** | neither TD nor TSL wants a hand-written version line. |
| `fbm()` loop (§4d in SKILL) | same loop with `mx_noise_float`, or `mx_fractal_noise_float` | MaterialX has a built-in fractal noise — prefer it. |
| `smoothstep(a,b,x)` | `smoothstep(a,b,x)` | same name in TSL. |
| `mix(a,b,t)` | `mix(a,b,t)` | same. |
| `length`, `dot`, `pow`, `sin`… | `length`, `dot`, `pow`, `sin`… | TSL mirrors GLSL math node-for-node. |

**Mini TSL `hsvtorgb`** (drop-in if `hsvtorgb` isn't exported by your three build):

```ts
import { Fn, vec3, vec4, clamp, abs, fract, float } from 'three/tsl';

// hsv.x = hue 0..1, .y = sat 0..1, .z = value 0..1  → rgb 0..1
export const hsvToRgb = Fn(([hsv]) => {
  const h = hsv.x, s = hsv.y, v = hsv.z;
  const k = vec3(0.0, 4.0, 2.0);
  const p = abs(fract(h.add(k.div(6.0))).mul(6.0).sub(3.0));
  return v.mul(mix(vec3(1.0), clamp(p.sub(1.0), 0.0, 1.0), s));
});
```

*(Matches `TDHSVToRGB`'s hue-in-0..1 convention so a palette expression ports unchanged.)*

---

## 4. Honest limits — what does NOT port, and fidelity gaps to expect

1. **No CHOP network in the browser.** The engine is fixed-function *by design*
   (`00-overview.md`). You cannot invent a new *signal* in TD and expect it in the web app —
   new signals are **code changes to T02** (the AudioWorklet), not look-dev. Keep TD to the
   **visual half**: shaders, feedback, geometry, instancing driven by the *existing*
   `FrameFeatures` fields. If a look needs a feature that isn't in `FrameFeatures`, that's a
   T02 conversation, not a port.
2. **No TD Python.** Extensions, `chopexecDAT`, `op()` expressions, scene state machines —
   none port. The web equivalent is the scene's own TS (`SceneModule` lifecycle) and T04's
   UI/param system. Don't build look logic in Python DATs and expect to carry it over.
3. **`uTime` is wall-clock in TD, audio-clock in the web app.** TD's `absTime.seconds` is
   seconds since TD launched; the contract's `f.t` is the audio clock. Time-based motion
   (scroll, LFO phase) will drift relative to the audio differently. Bind TSL time from
   `f.t`, not `performance.now()`, and expect minor retiming.
4. **Spectrum bin spacing.** TD Audio Spectrum → Resample(64) is **linear** across the FFT
   unless you remapped it; `f.spectrum` is **64 log-spaced** bins. A shader that indexed
   specific bins will hit different frequencies after port — re-tune bin indices.
5. **`loudNorm` normalization differs.** TD approximates the percentile normalizer (Audio
   Dynamics / running min-max); the web engine uses a true rolling-percentile. Absolute
   `loudNorm` values won't match 1:1 — tune the look's response, not a hard-coded threshold.
6. **Refresh-rate & color.** TD renders Vulkan at your project FPS; the browser is rAF-paced
   (vsync, variable). Colors: TD viewport vs. browser sRGB/`WebGPURenderer` output color
   management differ subtly — verify final palette in the browser, not the TD viewport.
7. **`onset` is boolean, `beat.phase`/`bpm`/`confidence` are separate.** Don't port a
   continuous "kick level" — the contract gives a thresholded boolean plus a beat estimate.

---

## 5. Name-parity grep check (acceptance)

The port is mechanical only if the TD channel/uniform names match the contract leaf fields.
Verify from the repo root:

```sh
# Leaf field names the docs must use, straight from the contract:
grep -oE '\b(bass|lowMid|mid|high|rms|loudNorm|flux|onset|phase|spectrum|silent)\b' \
  src/contracts/features.ts | sort -u

# Confirm every TD channel name this kit uses appears in the contract source:
for name in bass lowMid mid high rms loudNorm flux onset; do
  grep -q "\b$name\b" src/contracts/features.ts \
    && echo "OK   $name" || echo "MISS $name"
done
# beatPhase maps to the nested field 'phase' under 'beat' — grep 'phase' + 'beat':
grep -q '\bphase\b' src/contracts/features.ts && echo "OK   beat.phase (TD: beatPhase)"
```

Expected: every name resolves. `beatPhase`→`beat.phase` and `uLoud`→`loudNorm` are the two
intentional renames (documented in §1); the grep confirms the underlying contract fields
exist. If a future contract change renames a field, this check fails loudly and the kit's
tables must be updated in the same change.

---

## 6. Worked example — a small feedback shader, both directions

The full, runnable version lives in `looks/example-feedback/` (TD GLSL + finished TSL side
by side). Here is the core, side by side.

**TD GLSL TOP** (input `[0]` = spectrum TOP, input `[1]` = Feedback TOP):

```glsl
uniform float uLoud, uHigh, uBeatPhase, uTime;
layout(location = 0) out vec4 fragColor;

void main() {
    vec2 uv   = vUV.st;
    vec4 prev = texture(sTD2DInputs[1], (uv - 0.5) * 0.995 + 0.5) * 0.94; // decay + zoom
    float spec = texture(sTD2DInputs[0], vec2(uv.x, 0.0)).r;              // spectrum row
    float ring = smoothstep(0.02, 0.0, abs(length(uv - 0.5) - uLoud * 0.4));
    vec3  col  = TDHSVToRGB(vec3(fract(uBeatPhase + uTime * 0.05), 0.8, 1.0)) * ring;
    col += spec * uHigh;
    fragColor = TDOutputSwizzle(vec4(col, 1.0) + prev);
}
```

**Finished TSL** (a `colorNode` reading the feedback texture via T03's `FeedbackHelper`):

```ts
import {
  Fn, uniform, uv, vec2, vec3, vec4, float, texture,
  length, abs, smoothstep, fract, mix,
} from 'three/tsl';
import { hsvToRgb } from './hsvToRgb';
// T03 helpers (expected API — confirm import path at wave gate):
import { FeedbackHelper, spectrumAt } from '../../../src/render'; // path resolved by T03

// uniforms updated each frame from FrameFeatures (see §1):
export const uLoud = uniform(0), uHigh = uniform(0), uBeatPhase = uniform(0), uTime = uniform(0);

// prevFrame is the ping-pong texture node supplied by FeedbackHelper:
export const feedbackColor = (prevFrame) => Fn(() => {
  const p    = uv();
  const prev = texture(prevFrame, p.sub(0.5).mul(0.995).add(0.5)).mul(0.94); // decay + zoom
  const spec = spectrumAt(p.x.mul(64.0));                                    // 64-bin spectrum
  const ring = smoothstep(0.02, 0.0, abs(length(p.sub(0.5)).sub(uLoud.mul(0.4))));
  const col  = hsvToRgb(vec3(fract(uBeatPhase.add(uTime.mul(0.05))), 0.8, 1.0)).mul(ring)
                 .add(spec.mul(uHigh));
  return vec4(col, 1.0).add(prev);
})();
```

Line-for-line correspondence:
- `vUV.st` → `uv()`
- `texture(sTD2DInputs[1], …)` → `texture(prevFrame, …)` (T03 `FeedbackHelper` ping-pong, §below)
- `texture(sTD2DInputs[0], vec2(uv.x,0))` → `spectrumAt(p.x*64)`
- `TDHSVToRGB` → `hsvToRgb`
- `TDOutputSwizzle(…)` → dropped
- uniforms `uLoud/uHigh/uBeatPhase/uTime` ← `f.loudNorm / f.bands.high / f.beat.phase / f.t`

**Feedback TOP → `FeedbackHelper` ping-pong (both directions).** In TD the Feedback TOP
captures the previous frame and you read it from `sTD2DInputs[1]`. In the web stack you can't
read the render target you're writing — you **ping-pong** two render targets: render into A
sampling B, then swap. T03's `FeedbackHelper` wraps this: it owns two targets, gives your
material the "previous" texture node (`prevFrame` above), renders the pass, and swaps. So:
`Feedback TOP` ⇄ `FeedbackHelper` (the decay/zoom factors `0.94`/`0.995` port as literals).

---

## 7. Instancing & particles

| TD | Web / TSL | Notes |
|---|---|---|
| Geometry COMP Instance page ← CHOP (tx,ty,tz,sx…) | `THREE.InstancedMesh` + **TSL storage/attribute-driven** transforms | Per-instance data as a storage/instanced buffer; a TSL `positionNode` reads it. Drive magnitudes from `f.bands.*` uniforms. |
| Merge CHOP feeding instance channels | instanced `attribute()` / `storage()` buffers | plumbing becomes a buffer, not a CHOP. |
| `particlesGPU` COMP | **TSL compute** (WebGPU) | Simulate particle state in a compute node, render as instanced points/quads. |
| POPs (2025 experimental) | TSL compute (same as above) | no direct port; re-express as compute. |

**FBO fallback caveat:** TSL compute needs **WebGPU**. On the WebGL2 fallback there are no
compute shaders — T03 must provide an FBO/transform-feedback path or a reduced particle count.
A particle look that relies on compute will **degrade on WebGL2**; design the look to survive
the fallback (fewer particles / vertex-shader sim) or gate it to WebGPU. This is the single
biggest "won't just port" risk for particle-heavy looks.

---

## 8. Port workflow (checklist per look)

1. Confirm the look only reacts to existing `FrameFeatures` fields (else → T02, not a port).
2. Copy the GLSL TOP body; apply §3 table find-and-replace.
3. Rewire uniforms to `f.*` per §1 (mind `uLoud`→`loudNorm`, `uBeatPhase`→`beat.phase`,
   `uTime`→`f.t`, `uOnset`←boolean).
4. Replace Feedback TOP with `FeedbackHelper`; replace spectrum sampling with `spectrumAt`.
5. Do **not** re-smooth signals (§2) — they're pre-lagged.
6. Re-tune spectrum bin indices and `loudNorm` thresholds for the fidelity gaps (§4).
7. Verify final color/timing **in the browser**, on both WebGPU and WebGL2.
