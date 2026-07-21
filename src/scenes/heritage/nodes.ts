/**
 * Heritage scene — TSL node graph (the 2023 GLSL shaders, ported).
 *
 * `WebGPURenderer` cannot run `ShaderMaterial`, so the two hand-written GLSL
 * programs from `src/index.js` @ `v0-2023-cra` are reproduced here as TSL node
 * graphs. Constants and the order of operations are kept verbatim; each block is
 * annotated with the original shader it came from. Everything a material needs
 * is built in one function so no node has to be passed across a typed boundary.
 *
 * The one intentional deviation: the outer `uScale` uniform (old `frequencyAvg`
 * chain) is now driven by T02's `loudNorm` through the render bridge
 * (`bridge.uLoud`), scaled by the same magic-gain product the original used.
 */
import { attribute, cos, float, mix, positionLocal, sin, smoothstep, uniform, vec3 } from 'three/tsl';

import type { FeatureUniforms } from '../../render/bridge/FeatureUniforms';
import { HERITAGE_LOUD_REF, HERITAGE_UAVG_GAIN } from './mapping';

/** `const float frequencyNum = 256.0;` (both original shaders). */
const FREQ_NUM = 256;
const FREQ_NUM_SQ = FREQ_NUM * FREQ_NUM;
/** `const float _sin15 = sin(PI / 10.0);` / `_cos15` — the fixed 18° tilt. */
const SIN15 = Math.sin(Math.PI / 10);
const COS15 = Math.cos(Math.PI / 10);
/** `vResolution = (x + y + z) / (3.0 * 120.0)`. */
const RES_DIV = 3 * 120;
/** `const float radius = 40.0;` → inner shell `pos / (radius * 10.0)`. */
const INNER_RES_DIV = 40 * 10;

/**
 * Build both materials' node graphs plus the CPU-updated uniforms.
 *
 * @param bridge the render core's feature→uniform bridge; `bridge.uLoud`
 *   (percentile-normalized loudness) sources the outer `uScale`.
 */
export function buildHeritageGraph(bridge: FeatureUniforms) {
  // Per-frame uniforms owned by the scene (updated in `update`):
  //  - uTime: the rotation clock (old `uTime += 0.015`; NOT audio time).
  //  - uDisp: displacement-gain param (1 = faithful).
  //  - uMono: palette param, 0 = color, 1 = grayscale-cubed (old `isBlack`).
  const uTime = uniform(0);
  const uDisp = uniform(1);
  const uMono = uniform(0);

  // uScale ≔ old frequencyAvg chain, reconstructed from loudNorm on the GPU.
  const uScale = bridge.uLoud.mul(HERITAGE_LOUD_REF * HERITAGE_UAVG_GAIN);

  // ---- outer wireframe vertex program (index.js `this.vertex`) --------------
  const aFreq = attribute<'float'>('aFrequency', 'float');
  const squareF = aFreq.mul(aFreq);
  // frequency = smoothstep(16, 7200, SquareF) * SquareF / (frequencyNum^2)
  const frequency = smoothstep(float(16), float(7200), squareF).mul(squareF).div(FREQ_NUM_SQ);
  // _uScale = (1.0 - uScale * 0.5 / frequencyNum) * 3.0
  const uScaleShader = float(1).sub(uScale.mul(0.5).div(FREQ_NUM)).mul(3);

  const s = sin(uTime.mul(0.5));
  const c = cos(uTime.mul(0.5));
  const p = positionLocal;
  // rot * position.xz. GLSL mat2 constructors are COLUMN-major, so
  // `mat2(_cos,-_sin,_sin,_cos)` is [[_cos,_sin],[-_sin,_cos]] (a −θ rotation):
  //   _pos.x = _cos*x + _sin*z ;  _pos.y = _cos*z − _sin*x.
  const rotX = c.mul(p.x).add(s.mul(p.z));
  const rotZ = c.mul(p.z).sub(s.mul(p.x));
  // newPos = vec3(_pos.x, position.y, _pos.y); then newPos.xy = rot15 * newPos.xy
  // (rot15 is likewise column-major: [[_cos15,_sin15],[-_sin15,_cos15]]).
  const tiltX = float(COS15).mul(rotX).add(float(SIN15).mul(p.y));
  const tiltY = float(COS15).mul(p.y).sub(float(SIN15).mul(rotX));
  // newPos = (1.0 + uScale / (frequencyNum * 2.0)) * newPos
  const grow = float(1).add(uScale.div(FREQ_NUM * 2));
  const nx = tiltX.mul(grow);
  const ny = tiltY.mul(grow);
  const nz = rotZ.mul(grow);
  // vResolution = (newPos.x + newPos.y + newPos.z) / (3.0 * 120.0)
  const vRes = nx.add(ny).add(nz).div(RES_DIV);
  // gl_Position ← newPos + vFrequency * newPos * _uScale   (× displacement gain)
  const factor = frequency.mul(uScaleShader).mul(uDisp);
  const outerPosition = vec3(
    nx.add(nx.mul(factor)),
    ny.add(ny.mul(factor)),
    nz.add(nz.mul(factor)),
  );

  // ---- outer wireframe fragment program (index.js `this.fragment`) ----------
  const f = smoothstep(float(0), float(0.00002), frequency.mul(frequency)).mul(frequency);
  // Pre-clamp trio (drives `sum`):
  const red0 = float(0.75).add(f.mul(1.9)).min(1);
  const green0 = float(0.75).add(f.mul(3.6)).min(1);
  const blue0 = float(0.75).add(f.mul(0.01)).min(1);
  const sum = red0.add(blue0).add(green0);
  // Post-modified blue/green (`blue += 0.3`, `green -= 0.1`), red unchanged:
  const blue1 = blue0.add(0.3).min(1);
  const green1 = green0.sub(0.1).max(0);
  // offsetSum = (sum - (red + blue + green)/3) / 3   (uses post-modified b/g)
  const offsetSum = sum.sub(red0.add(blue1).add(green1).div(3)).div(3);
  const blueOut = blue1.add(offsetSum).add(vRes.mul(2).min(-0.2));
  const redOut = red0.add(offsetSum).add(vRes.mul(0.5).min(0.2));
  const greenOut = green1.add(offsetSum).sub(vRes.mul(frequency.mul(2).max(0.3)));
  const colorRgb = vec3(redOut, greenOut, blueOut);
  // mono: vec3((r+g+b)^3 / 27) — the old `isBlack <= 0` grayscale-cubed branch.
  const sc = redOut.add(greenOut).add(blueOut);
  const monoV = sc.mul(sc).mul(sc).div(27);
  const outerColor = mix(colorRgb, vec3(monoV, monoV, monoV), uMono);

  // ---- inner shell fragment program (index.js `this.fragment_2`) ------------
  // pos = vec3(x, -y, z); resolut = pos / (radius * 10.0) + 0.05; color = resolut
  const innerColor = vec3(p.x, p.y.negate(), p.z).div(INNER_RES_DIV).add(0.05);

  return { uTime, uDisp, uMono, outerPosition, outerColor, innerColor };
}
