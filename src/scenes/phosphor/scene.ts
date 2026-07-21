/**
 * Phosphor — a feedback flow-field scene: long-exposure oscilloscope
 * photography. A moving Lissajous trace is injected into a ping-pong feedback
 * buffer that decays and domain-warps (2-octave FBM) every frame; the
 * accumulation over frames *is* the long exposure. Mids steer the warp, highs
 * add shimmer, flux kicks the injection; the field is monochrome phosphor with
 * rare graphite-white peaks (02-design).
 *
 * ## How it plugs into the render core
 * `RenderCore` renders each scene's `THREE.Scene` through the shared camera and
 * (optionally) the bloom post chain — it has no per-scene render hook. So this
 * scene runs its own feedback fragment pass into the **shared** `FeedbackHelper`
 * during `update()` (before the core draws), then presents the result via
 * `scene.backgroundNode` — a fullscreen node the core's `renderer.render()`
 * rasterises for free. Two `TextureNode`s are re-pointed at the live ping-pong
 * targets each frame.
 *
 * ## Backends (PORTING.md §7)
 * This look is a **pure fragment feedback** pass + composite — it uses no
 * compute, so WebGPU and the WebGL2 fallback run the identical TSL graph (TSL
 * compiles to WGSL or GLSL). The only backend-sensitive resource is the
 * half-float feedback target, which `FeedbackHelper` already provisions for
 * both. Nothing here is gated to WebGPU; `ctx.isWebGPU` is intentionally unused.
 *
 * ## Governor quality
 * The primary cost lever is the shared feedback buffer's resolution, which the
 * core scales via the governor (`FeedbackHelper.setSize`). This scene reads the
 * governor's `quality` (via `params.quality`) as a secondary lever: it sheds
 * shimmer and widens the trace so the line stays visible at reduced resolution.
 */
import { Color, Vector3, Vector4 } from 'three';
import {
  clamp,
  dot,
  length,
  min,
  mix,
  mx_fractal_noise_vec3,
  mx_noise_float,
  screenUV,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { MeshBasicNodeMaterial, QuadMesh, type WebGPURenderer } from 'three/webgpu';
import type { Scene } from 'three';

import type { FrameFeatures, SceneContext, SceneModule } from '../../contracts';
import { SPECTRUM_BINS } from '../../render/bridge/FeatureUniforms';
import type { FeatureUniforms } from '../../render/bridge/FeatureUniforms';
import type { FeedbackHelper } from '../../render/feedback/FeedbackHelper';
import {
  advancePhase,
  binToRate,
  decayCoefficient,
  dominantBinIndex,
  injectionBrightness,
  lissajousCoord,
  motionProfile,
  shimmerAmount,
  smoothBin,
  traceAmplitude,
  warpStrength,
} from './flowField';
import { PHOSPHOR_ACCENT, PHOSPHOR_PARAMS } from './presets';

/** Any object we may stamp a background node onto (Scene.backgroundNode is untyped in @types/three). */
interface NodeBackgroundScene {
  backgroundNode: unknown;
}

// --- look constants ----------------------------------------------------------
const BLEED = 0.06; // loudNorm→decay coupling
const WARP_SCALE = 2.5; // FBM domain-warp spatial frequency
const WARP_SPEED = 0.08; // FBM evolution speed (audio-clock)
const SHIMMER_SCALE = 40.0; // high-frequency shimmer noise scale
const BIN_SMOOTH = 0.08; // dominant-bin exponential smoothing
const MIN_RATE = 0.05; // oscillator rate at bin 0 (cyc/s)
const MAX_RATE = 0.9; // oscillator rate at the top bin
const RATIO_Y = 1.37; // base X:Y rate ratio (Lissajous figure)
const SWEEP_RATE = 0.5; // pair-0 horizontal time-base sweep (cyc/s)
const AMP = 0.42; // trace excursion (screen-space, 0–0.5)
const TRACE_WIDTH_BASE = 0.02; // trace half-width at full quality
const SCAN_FREQ = 1200.0; // scanline frequency (≤0.04 amplitude, 02-design)
const SPEC_LOW_BIN = 2; // fixed low bin for the bass bloom (spectrumAt)
const SPEC_HIGH_BIN = 50; // fixed high bin gating shimmer (spectrumAt)
const TRACE_PAIRS = 3; // max oscillator pairs (complexity 1–3)

/** Read a finite number param, else the fallback. */
function num(p: Record<string, unknown>, key: string, fallback: number): number {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
/** Read a boolean param, else the fallback. */
function bool(p: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = p[key];
  return typeof v === 'boolean' ? v : fallback;
}
/** Read a string param, else the fallback. */
function str(p: Record<string, unknown>, key: string, fallback: string): string {
  const v = p[key];
  return typeof v === 'string' ? v : fallback;
}

/** Clamp to the unit interval (finite-safe). */
function clampUnit(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * The Phosphor scene. Construct via {@link createPhosphorScene}; the render core
 * supplies the live feature bridge and the shared feedback buffer.
 */
class PhosphorScene implements SceneModule {
  readonly id = 'phosphor';
  readonly name = 'Phosphor';
  readonly params = PHOSPHOR_PARAMS;

  private renderer: WebGPURenderer | null = null;
  private three: Scene | null = null;
  private material: MeshBasicNodeMaterial | null = null;
  private quad: QuadMesh | null = null;
  private ready = false;

  // Per-frame uniforms driven from the pure flow-field math.
  private readonly uDecay = uniform(0.96);
  private readonly uWarp = uniform(0);
  private readonly uShimmer = uniform(0);
  private readonly uInject = uniform(0);
  private readonly uTraceWidth = uniform(TRACE_WIDTH_BASE);
  private readonly uAccent = uniform(new Vector3(1, 1, 1));

  // One vec4 (prevX, prevY, curX, curY) + enable flag per oscillator pair.
  private readonly uSeg = [
    uniform(new Vector4(0.5, 0.5, 0.5, 0.5)),
    uniform(new Vector4(0.5, 0.5, 0.5, 0.5)),
    uniform(new Vector4(0.5, 0.5, 0.5, 0.5)),
  ];
  private readonly uEnable = [uniform(1), uniform(0), uniform(0)];

  // Feedback ping-pong texture handles, re-pointed at the live targets each frame.
  private readonly prevTex = texture();
  private readonly dispTex = texture();

  // Trace kinematic state (allocation-free; mutated in place).
  private readonly phaseX = new Float64Array([0, 0.33, 0.66]);
  private readonly phaseY = new Float64Array([0.25, 0.5, 0.75]);
  private readonly prevX = new Float64Array([0.5, 0.5, 0.5]);
  private readonly prevY = new Float64Array([0.5, 0.5, 0.5]);
  private smoothedBin = 0;
  private readonly accentScratch = new Color();

  constructor(
    private readonly bridge: FeatureUniforms,
    private readonly feedback: FeedbackHelper,
  ) {}

  async init(ctx: SceneContext): Promise<void> {
    const renderer = ctx.renderer as WebGPURenderer;
    const three = ctx.scene as Scene;
    this.renderer = renderer;
    this.three = three;

    // --- feedback fragment pass (renders into fb.write, sampling fb.read) -----
    const material = new MeshBasicNodeMaterial();
    material.colorNode = this.buildPassNode();
    this.material = material;
    this.quad = new QuadMesh(material);

    // --- composite / present (fullscreen background node) --------------------
    (three as unknown as NodeBackgroundScene).backgroundNode = this.buildCompositeNode();

    // Seed: the shared buffer may hold another scene's frame on activation.
    // Clear both targets to black and point the display at a known-good texture.
    renderer.setRenderTarget(this.feedback.read);
    renderer.clear();
    renderer.setRenderTarget(this.feedback.write);
    renderer.clear();
    renderer.setRenderTarget(null);
    this.prevTex.value = this.feedback.read.texture;
    this.dispTex.value = this.feedback.read.texture;

    this.ready = true;
    return Promise.resolve();
  }

  /** The decaying, domain-warped feedback + trace-injection fragment graph. */
  private buildPassNode() {
    const p = uv();
    // Domain warp: 2-octave FBM offset, mid-steered (uWarp), audio-clock evolved.
    const warp = mx_fractal_noise_vec3(vec3(p.mul(WARP_SCALE), this.bridge.uTime.mul(WARP_SPEED)));
    const wuv = p.add(warp.xy.mul(this.uWarp));
    // Sample *through* the stable prevTex node (`.sample` shares its value slot)
    // so the per-frame `this.prevTex.value = fb.read.texture` reassignment is seen.
    const prev = this.prevTex.sample(wuv).rgb.mul(this.uDecay);

    // Trace injection (grayscale): soft glow along this frame's segment(s).
    const width = this.uTraceWidth;
    const glow = (segU: (typeof this.uSeg)[number], enU: (typeof this.uEnable)[number]) => {
      const seg = vec4(segU);
      const a = seg.xy;
      const b = seg.zw;
      const pa = p.sub(a);
      const ba = b.sub(a);
      const h = clamp(dot(pa, ba).div(dot(ba, ba).add(1e-4)), 0, 1);
      const d = length(pa.sub(ba.mul(h)));
      return smoothstep(width, 0, d).mul(enU);
    };
    let trace = glow(this.uSeg[0]!, this.uEnable[0]!);
    for (let i = 1; i < TRACE_PAIRS; i += 1) {
      trace = trace.add(glow(this.uSeg[i]!, this.uEnable[i]!));
    }
    const injected = trace.mul(this.uInject);

    // Fine shimmer, gated by a fixed high bin (spectrumAt) + the shimmer param.
    const specHigh = this.bridge.spectrumAt(SPEC_HIGH_BIN);
    const shNoise = mx_noise_float(vec3(p.mul(SHIMMER_SCALE), this.bridge.uTime.mul(3.0))).mul(0.5).add(0.5);
    const shimmer = shNoise.mul(this.uShimmer).mul(specHigh.add(0.15));

    // Faint central bloom breathing with a fixed low bin (spectrumAt).
    const specLow = this.bridge.spectrumAt(SPEC_LOW_BIN);
    const bloom = smoothstep(0.6, 0.0, length(p.sub(vec2(0.5)))).mul(specLow).mul(0.04);

    const bright = injected.add(shimmer).add(bloom);
    const outc = prev.add(vec3(bright));
    return vec4(clamp(outc, 0.0, 4.0), 1.0);
  }

  /** Fullscreen composite: monochrome phosphor ramp, graphite-white peaks, vignette, subtle scanline. */
  private buildCompositeNode() {
    const p = screenUV;
    // Sample through the stable dispTex node (see buildPassNode) so the
    // post-swap `this.dispTex.value` reassignment reaches the composite.
    const raw = clamp(this.dispTex.sample(p).r, 0.0, 4.0);
    const lum = min(raw, 1.0);
    const base = this.uAccent.mul(lum);
    // Rare graphite-white only where the field peaks past unity.
    const peak = smoothstep(0.75, 1.1, raw);
    const withPeak = mix(base, vec3(0.92, 0.94, 0.9), peak.mul(0.85));
    // Vignette in-shader.
    const d = length(p.sub(vec2(0.5)));
    const vig = smoothstep(0.95, 0.35, d);
    // Scanline restraint (≤0.04).
    const scan = sin(p.y.mul(SCAN_FREQ)).mul(0.02).add(1.0);
    return vec4(withPeak.mul(vig).mul(scan), 1.0);
  }

  update(f: FrameFeatures, params: Record<string, unknown>, dtSec: number): void {
    if (!this.ready || !this.renderer || !this.quad) return;
    const dt = Math.max(0, Math.min(0.1, dtSec)); // clamp against tab-stall spikes

    const decayParam = num(params, 'decay', 0.96);
    const warpParam = num(params, 'warp', 0.35);
    const traceParam = num(params, 'trace', 0.9);
    const shimmerParam = num(params, 'shimmer', 0.3);
    const complexity = Math.round(num(params, 'complexity', 2));
    const quality = num(params, 'quality', 1);

    const profile = motionProfile(f.reducedMotion);

    // Feedback coefficients (all from tested pure functions).
    this.uDecay.value = decayCoefficient(decayParam + profile.decayBias, BLEED, f.loudNorm);
    this.uWarp.value = warpStrength(warpParam, f.bands.mid) * profile.warp;
    this.uShimmer.value = shimmerAmount(shimmerParam, f.bands.high, quality) * profile.shimmer;
    this.uInject.value = injectionBrightness(traceParam, f.flux, f.loudNorm);
    // Widen the trace as resolution drops so the line survives the fallback.
    this.uTraceWidth.value = TRACE_WIDTH_BASE * (1 + (1 - clampUnit(quality)) * 1.5);

    // Accent: phosphor by default; palette-follow retints toward the accent
    // param (driven from NowPlaying.palette by T07/T08, subtle by design).
    const accentHex = bool(params, 'paletteFollow', false) ? str(params, 'accent', PHOSPHOR_ACCENT) : PHOSPHOR_ACCENT;
    this.accentScratch.set(accentHex);
    this.uAccent.value.set(this.accentScratch.r, this.accentScratch.g, this.accentScratch.b);

    // Trace kinematics.
    const dom = dominantBinIndex(f.spectrum);
    this.smoothedBin = smoothBin(this.smoothedBin, dom, BIN_SMOOTH);
    const baseRate = binToRate(this.smoothedBin, SPECTRUM_BINS, MIN_RATE, MAX_RATE);
    this.updateTrace(f, complexity, baseRate, profile.phase, dt);

    // Run the feedback pass: render into `write` sampling `read`, then swap.
    this.prevTex.value = this.feedback.read.texture;
    this.renderer.setRenderTarget(this.feedback.write);
    this.quad.render(this.renderer);
    this.renderer.setRenderTarget(null);
    this.feedback.swap();
    // Present the just-written frame.
    this.dispTex.value = this.feedback.read.texture;
  }

  /** Advance each oscillator pair and stamp its segment/enable uniforms. */
  private updateTrace(f: FrameFeatures, complexity: number, baseRate: number, phaseScale: number, dt: number): void {
    for (let i = 0; i < TRACE_PAIRS; i += 1) {
      const amp = traceAmplitude(f.silent, AMP * (1 - 0.18 * i), f.loudNorm);
      let curX: number;
      let curY: number;

      if (i === 0) {
        // Pair 0 is the time-base: X sweeps horizontally, Y is the signal.
        // On silence amp→0 ⇒ Y flattens to 0.5 ⇒ an honest flat idle line.
        this.phaseX[0] = advancePhase(this.phaseX[0]!, SWEEP_RATE * phaseScale, dt);
        this.phaseY[0] = advancePhase(this.phaseY[0]!, baseRate * phaseScale, dt);
        curX = 0.05 + 0.9 * this.phaseX[0]!;
        curY = lissajousCoord(this.phaseY[0]!, amp);
      } else {
        // Decorative Lissajous pairs at higher, offset rates.
        const rateX = baseRate * (1 + 0.5 * i) * phaseScale;
        const rateY = rateX * (RATIO_Y + 0.13 * i);
        this.phaseX[i] = advancePhase(this.phaseX[i]!, rateX, dt);
        this.phaseY[i] = advancePhase(this.phaseY[i]!, rateY, dt);
        curX = lissajousCoord(this.phaseX[i]!, amp);
        curY = lissajousCoord(this.phaseY[i]!, amp);
      }

      // Suppress the retrace streak when the sweep wraps back to the left.
      if (i === 0 && curX < this.prevX[0]!) {
        this.prevX[0] = curX;
        this.prevY[0] = curY;
      }

      this.uSeg[i]!.value.set(this.prevX[i]!, this.prevY[i]!, curX, curY);
      this.prevX[i] = curX;
      this.prevY[i] = curY;

      // Pair 0 always draws (the idle line); pairs 1–2 need complexity + signal.
      const on = i === 0 || (complexity > i && amp > 0.001);
      this.uEnable[i]!.value = on ? 1 : 0;
    }
  }

  resize(): void {
    // The shared feedback buffer is resized by RenderCore (governor-scaled);
    // the display samples via screenUV, so there is nothing per-scene to do.
  }

  dispose(): void {
    this.ready = false;
    if (this.three) {
      (this.three as unknown as NodeBackgroundScene).backgroundNode = null;
      this.three = null;
    }
    this.material?.dispose();
    this.material = null;
    this.quad = null;
    this.renderer = null;
    // NOTE: the FeedbackHelper is owned by RenderCore — do not dispose it here.
  }
}

/**
 * Create the Phosphor scene.
 *
 * @param bridge the render core's live feature→uniform bridge (`spectrumAt`,
 *   scalar feature uniforms) — must be the same instance the core updates each
 *   frame.
 * @param feedback the render core's **shared** ping-pong buffer
 *   (`RenderCore.feedbackBuffer()`); governor-scaled by the core. Not disposed
 *   by this scene.
 */
export function createPhosphorScene(bridge: FeatureUniforms, feedback: FeedbackHelper): SceneModule {
  return new PhosphorScene(bridge, feedback);
}
