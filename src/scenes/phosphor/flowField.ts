/**
 * Phosphor scene — pure flow-field / feedback math.
 *
 * Everything in this module is GPU-free and allocation-light so it can be
 * unit-tested headlessly (Vitest) and reused by the TSL scene on the hot path.
 * The scene ({@link ./scene}) pushes the outputs here into `uniform()` nodes each
 * frame; the shader only samples textures and draws.
 *
 * The look is "long-exposure oscilloscope photography": a moving trace point is
 * injected into a feedback buffer that decays and domain-warps every frame, so
 * the accumulation over frames *is* the long exposure. This file owns the trace
 * kinematics, the decay/warp/injection coefficients, and the guarantees that
 * keep the feedback loop bounded (never →∞/NaN).
 */

/** τ — one full turn. */
export const TWO_PI = Math.PI * 2;

/** Coerce non-finite inputs to 0 so a bad feature frame can never poison the loop. */
function finite(x: number): number {
  return Number.isFinite(x) ? x : 0;
}

/** Clamp `x` into `[lo, hi]` (finite-safe: NaN/∞ collapse to `lo`). */
export function clamp(x: number, lo: number, hi: number): number {
  const v = finite(x);
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

/** Lower bound on the per-frame decay multiplier — guarantees the loop contracts. */
export const DECAY_FLOOR = 0.5;
/** Upper bound — strictly < 1 so a full-white field always bleeds back toward black. */
export const DECAY_CEIL = 0.995;

/**
 * Per-frame trail decay multiplier, in the open interval (0, 1).
 *
 * `base` is the resting persistence (~0.96); louder passages bleed a little
 * faster (`bleed·loudNorm` subtracted) so peaks don't smear into a flat wash.
 * The result is clamped to [{@link DECAY_FLOOR}, {@link DECAY_CEIL}] — since the
 * ceiling is < 1, an iterated `value·decay + inject` loop is a contraction and
 * can never diverge.
 */
export function decayCoefficient(base: number, bleed: number, loudNorm: number): number {
  const b = clamp(base, 0, DECAY_CEIL);
  const bl = clamp(bleed, 0, 0.49);
  const l = clamp(loudNorm, 0, 1);
  return clamp(b - bl * l, DECAY_FLOOR, DECAY_CEIL);
}

/**
 * Domain-warp strength: `mid` steers how hard the FBM offset pushes the field.
 * Zero param or zero mid ⇒ no warp. Bounded to [0, amount].
 */
export function warpStrength(amount: number, mid: number): number {
  const a = clamp(amount, 0, 1);
  const m = clamp(mid, 0, 1);
  return clamp(a * (0.25 + 0.75 * m), 0, 1);
}

/** Fine shimmer-noise gain: `high` adds sparkle, gated by the shimmer param and quality. */
export function shimmerAmount(param: number, high: number, quality: number): number {
  return clamp(param, 0, 1) * clamp(high, 0, 1) * clamp(quality, 0, 1);
}

/**
 * Brightness of the freshly-injected trace this frame. `flux` kicks it (onset
 * energy), `loudNorm` gives a floor so a steady tone still writes a visible
 * line. Bounded, non-negative.
 */
export function injectionBrightness(base: number, flux: number, loudNorm: number): number {
  const b = clamp(base, 0, 2);
  const fx = clamp(flux, 0, 4);
  const l = clamp(loudNorm, 0, 1);
  return clamp(b * (0.35 + 0.65 * l) + fx * 0.5 * b, 0, 8);
}

/**
 * One step of the feedback accumulation, as the shader performs it per texel:
 * `prev·decay + inject`. Kept here as a pure scalar so tests can prove the loop
 * stays finite and non-negative under adversarial feature streams. With
 * `decay < 1` the fixed point is `inject/(1-decay)` — always bounded.
 */
export function simulateTrailValue(prev: number, decay: number, inject: number): number {
  const p = Math.max(0, finite(prev));
  const d = clamp(decay, 0, DECAY_CEIL);
  const inj = Math.max(0, finite(inject));
  return p * d + inj;
}

/** Index of the loudest spectrum bin (argmax). 0 for an empty spectrum. */
export function dominantBinIndex(spectrum: ArrayLike<number>): number {
  let best = 0;
  let bestVal = -Infinity;
  for (let i = 0; i < spectrum.length; i += 1) {
    const v = finite(spectrum[i] ?? 0);
    if (v > bestVal) {
      bestVal = v;
      best = i;
    }
  }
  return best;
}

/** Exponential smoothing toward `target` (0 = frozen, 1 = instant). */
export function smoothBin(prev: number, target: number, smoothing: number): number {
  const s = clamp(smoothing, 0, 1);
  return finite(prev) + (finite(target) - finite(prev)) * s;
}

/**
 * Map a (smoothed, possibly fractional) bin index to an oscillator rate in
 * cycles/second. Higher bins ⇒ higher frequency ⇒ a busier figure.
 */
export function binToRate(bin: number, bins: number, minRate: number, maxRate: number): number {
  const n = Math.max(1, bins - 1);
  const t = clamp(bin / n, 0, 1);
  return minRate + (maxRate - minRate) * t;
}

/**
 * One coordinate of a Lissajous trace point in [0.5-amp, 0.5+amp] (screen-space
 * 0–1), for oscillator `phase` in [0,1). Both axes share this; the figure comes
 * from the two axes running at different rates.
 */
export function lissajousCoord(phase: number, amp: number): number {
  return 0.5 + clamp(amp, 0, 0.5) * Math.sin(TWO_PI * finite(phase));
}

/** Advance an oscillator phase by `rate·dt`, wrapped into [0,1). */
export function advancePhase(phase: number, rate: number, dt: number): number {
  const next = finite(phase) + finite(rate) * Math.max(0, finite(dt));
  return next - Math.floor(next);
}

/**
 * Trace excursion amplitude. On silence the trace collapses to a flat idle line
 * (`amp → 0`, so both axes sit at 0.5 and only the horizontal sweep remains) —
 * the honest "flat wave = silence" state from the spec. Pure so the idle
 * behaviour is unit-testable.
 */
export function traceAmplitude(silent: boolean, base: number, loudNorm: number): number {
  if (silent) return 0;
  return clamp(base, 0, 0.5) * (0.35 + 0.65 * clamp(loudNorm, 0, 1));
}

/**
 * Motion coefficients for the current accessibility program. Baked as a pure
 * function so the reduced-motion path is verifiable by a test hook rather than a
 * live `matchMedia` read (the scene takes `reducedMotion` from `frame`, never
 * from the DOM). Reduced motion ⇒ no domain warp, near-frozen trace kinematics,
 * calmer persistence; brightness then carries the music instead of movement.
 */
export interface MotionProfile {
  /** Multiplier on the domain-warp offset (0 disables camera-like drift). */
  warp: number;
  /** Multiplier on oscillator phase advance (near 0 = gentle, standing trace). */
  phase: number;
  /** Extra persistence added to the decay resting point (calmer trails). */
  decayBias: number;
  /** Multiplier on the shimmer layer (its noise animates with time — damp it so
   * reduced motion doesn't twinkle; brightness carries the music instead). */
  shimmer: number;
}

/** Full-motion program. */
export const MOTION_FULL: MotionProfile = { warp: 1, phase: 1, decayBias: 0, shimmer: 1 };
/** Reduced-motion program (gentle, amplitude-carried, no drift). */
export const MOTION_REDUCED: MotionProfile = { warp: 0, phase: 0.12, decayBias: 0.02, shimmer: 0.15 };

/** Select the motion program for the frame. */
export function motionProfile(reducedMotion: boolean): MotionProfile {
  return reducedMotion ? MOTION_REDUCED : MOTION_FULL;
}
