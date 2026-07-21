/**
 * example-feedback — the finished TSL port of ./look.glsl.
 * The worked example from ../../PORTING.md §6. Feedback ring: hue rides beat
 * phase, radius rides normalized loudness, spectrum adds detail, previous frame
 * is decayed + zoomed for trails.
 *
 * PORT STATUS: ported-pending-verify.
 *   - The TSL body is complete and maps line-for-line to look.glsl.
 *   - It depends on T03's `FeedbackHelper` (ping-pong render targets) and
 *     `spectrumAt` (64-bin DataTexture sampler). Those helper import paths are
 *     the EXPECTED T03 API; confirm and adjust the import at the wave gate.
 *   - Cannot be compile-verified here: src/render/ is a stub (README only) until
 *     T03 lands. Verify against T03's dev harness on both WebGPU and WebGL2.
 *
 * Uniform <- FrameFeatures wiring (see ../../PORTING.md §1):
 *   uLoud      <- f.loudNorm
 *   uHigh      <- f.bands.high
 *   uBeatPhase <- f.beat.phase
 *   uTime      <- f.t              (audio-clock seconds, NOT performance.now())
 */
import {
  Fn, uniform, uv, vec3, vec4,
  texture, length, abs, smoothstep, fract,
} from 'three/tsl';
import { hsvToRgb } from './hsvToRgb';

// --- T03 helper API (expected surface; confirm import path at wave gate) -------
// FeedbackHelper: owns two render targets, hands the material the "previous
// frame" texture node, renders the pass, then swaps (replaces TD's Feedback TOP).
// spectrumAt(indexNode): samples the 64-bin spectrum DataTexture built from
// f.spectrum. See ../../PORTING.md §2 and §6.
// import { FeedbackHelper, spectrumAt } from '../../../src/render';
type TextureNode = any;
declare function spectrumAt(indexNode: any): any;

// --- uniforms; update .value each frame from FrameFeatures in SceneModule.update
export const uLoud = uniform(0);
export const uHigh = uniform(0);
export const uBeatPhase = uniform(0);
export const uTime = uniform(0);

/**
 * Build the colorNode for this look.
 * @param prevFrame the previous-frame texture node from T03's FeedbackHelper
 *                  (== TD's sTD2DInputs[1]).
 */
export const buildFeedbackColor = (prevFrame: TextureNode) =>
  Fn(() => {
    const p = uv(); // == vUV.st
    // previous frame, zoomed in + decayed -> trails
    const prev = texture(prevFrame, p.sub(0.5).mul(0.995).add(0.5)).mul(0.94);
    // spectrum row: x in 0..1 -> bin 0..63
    const spec = spectrumAt(p.x.mul(64.0));
    // ring whose radius rides normalized loudness
    const ring = smoothstep(0.02, 0.0, abs(length(p.sub(0.5)).sub(uLoud.mul(0.4))));
    // hue drifts with beat phase + slow time; high band adds spectral detail
    const col = hsvToRgb(vec3(fract(uBeatPhase.add(uTime.mul(0.05))), 0.8, 1.0))
      .mul(ring)
      .add(spec.mul(uHigh));
    return vec4(col, 1.0).add(prev);
  })();

/**
 * Per-frame uniform update — call from SceneModule.update(f, params, dt).
 * Mirrors the CHOP-reference expressions in ../../BUILD.md §4.
 */
export function updateUniforms(f: {
  loudNorm: number;
  bands: { high: number };
  beat: { phase: number };
  t: number;
}) {
  uLoud.value = f.loudNorm;
  uHigh.value = f.bands.high;
  uBeatPhase.value = f.beat.phase;
  uTime.value = f.t; // audio-clock
}
