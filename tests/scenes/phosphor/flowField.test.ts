import { describe, expect, it } from 'vitest';

import {
  DECAY_CEIL,
  DECAY_FLOOR,
  advancePhase,
  binToRate,
  clamp,
  decayCoefficient,
  dominantBinIndex,
  injectionBrightness,
  lissajousCoord,
  MOTION_FULL,
  MOTION_REDUCED,
  motionProfile,
  shimmerAmount,
  simulateTrailValue,
  smoothBin,
  traceAmplitude,
  warpStrength,
} from '../../../src/scenes/phosphor/flowField';

/** Deterministic LCG so "property" streams are reproducible without a dep. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** A grab-bag of hostile scalar inputs for finiteness guarantees. */
const HOSTILE = [NaN, Infinity, -Infinity, -1, 0, 1, 1e9, -1e9];

describe('clamp', () => {
  it('bounds normal values and neutralises non-finite input to the low bound', () => {
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(-2, 0, 1)).toBe(0);
    expect(clamp(NaN, 0, 1)).toBe(0);
    expect(clamp(Infinity, 0, 1)).toBe(0); // ∞ > hi ⇒ hi... but non-finite collapses first
  });
});

describe('decayCoefficient', () => {
  it('always lands in the contractive open interval (never →1, never →∞/NaN)', () => {
    const rnd = lcg(1);
    for (let i = 0; i < 20000; i += 1) {
      const base = rnd() * 2 - 0.5; // spans out of range on purpose
      const bleed = rnd() * 2 - 0.5;
      const loud = rnd() * 2 - 0.5;
      const d = decayCoefficient(base, bleed, loud);
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(DECAY_FLOOR);
      expect(d).toBeLessThanOrEqual(DECAY_CEIL);
      expect(d).toBeLessThan(1); // strictly contractive
    }
  });

  it('survives hostile inputs', () => {
    for (const a of HOSTILE) for (const b of HOSTILE) for (const c of HOSTILE) {
      const d = decayCoefficient(a, b, c);
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThanOrEqual(DECAY_FLOOR);
      expect(d).toBeLessThanOrEqual(DECAY_CEIL);
    }
  });

  it('louder frames bleed faster (lower persistence)', () => {
    expect(decayCoefficient(0.96, 0.06, 1)).toBeLessThan(decayCoefficient(0.96, 0.06, 0));
  });
});

describe('simulateTrailValue — the feedback loop is bounded', () => {
  it('never diverges or goes NaN under a property-tested feature stream', () => {
    const rnd = lcg(7);
    let value = 0;
    // The shader clamps injection ≤ 8 (injectionBrightness) and decay ≤ CEIL,
    // so the fixed point is ≤ 8/(1-CEIL). Assert we stay under it, always finite.
    const bound = 8 / (1 - DECAY_CEIL) + 1e-6;
    // 100k property samples, but guard-per-iter instead of 3 expect()/iter
    // (300k assertions timed out the default 5s on slow CI runners). Same coverage.
    for (let i = 0; i < 100000; i += 1) {
      const decay = decayCoefficient(0.85 + rnd() * 0.14, 0.06, rnd());
      const inject = injectionBrightness(rnd() * 2, rnd() * 4, rnd());
      value = simulateTrailValue(value, decay, inject);
      if (!Number.isFinite(value) || value < 0 || value > bound) {
        expect.fail(`diverged at i=${i}: value=${value} (bound=${bound})`);
      }
    }
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(bound);
  });

  it('converges toward inject/(1-decay) for a steady input', () => {
    let v = 0;
    for (let i = 0; i < 5000; i += 1) v = simulateTrailValue(v, 0.9, 0.5);
    expect(v).toBeCloseTo(0.5 / (1 - 0.9), 3);
  });

  it('poisoned prev/inject cannot propagate a NaN', () => {
    expect(simulateTrailValue(NaN, 0.9, 0.5)).toBe(0.5);
    expect(simulateTrailValue(0.5, 0.9, Infinity)).toBe(0.45);
  });
});

describe('dominantBinIndex', () => {
  it('finds the argmax bin', () => {
    const s = new Float32Array([0.1, 0.9, 0.2, 0.5]);
    expect(dominantBinIndex(s)).toBe(1);
  });
  it('returns 0 for an empty or flat spectrum', () => {
    expect(dominantBinIndex(new Float32Array(0))).toBe(0);
    expect(dominantBinIndex(new Float32Array(8))).toBe(0);
  });
});

describe('smoothBin', () => {
  it('moves toward the target and reaches it', () => {
    let b = 0;
    for (let i = 0; i < 500; i += 1) b = smoothBin(b, 40, 0.08);
    expect(b).toBeCloseTo(40, 2);
  });
  it('is frozen at smoothing 0 and instant at 1', () => {
    expect(smoothBin(5, 40, 0)).toBe(5);
    expect(smoothBin(5, 40, 1)).toBe(40);
  });
});

describe('binToRate', () => {
  it('is monotonic and bounded across the bin range', () => {
    const lo = binToRate(0, 64, 0.05, 0.9);
    const hi = binToRate(63, 64, 0.05, 0.9);
    expect(lo).toBeCloseTo(0.05, 5);
    expect(hi).toBeCloseTo(0.9, 5);
    expect(binToRate(32, 64, 0.05, 0.9)).toBeGreaterThan(lo);
    expect(binToRate(32, 64, 0.05, 0.9)).toBeLessThan(hi);
  });
});

describe('lissajousCoord', () => {
  it('stays within [0.5-amp, 0.5+amp]', () => {
    const rnd = lcg(3);
    for (let i = 0; i < 5000; i += 1) {
      const amp = rnd() * 0.5;
      const phase = rnd();
      const c = lissajousCoord(phase, amp);
      expect(c).toBeGreaterThanOrEqual(0.5 - amp - 1e-9);
      expect(c).toBeLessThanOrEqual(0.5 + amp + 1e-9);
    }
  });
  it('a zero-amplitude trace collapses to the centre (flat idle line)', () => {
    expect(lissajousCoord(0.123, 0)).toBe(0.5);
  });
});

describe('advancePhase', () => {
  it('always wraps into [0,1)', () => {
    const rnd = lcg(9);
    let phase = 0;
    for (let i = 0; i < 100000; i += 1) {
      phase = advancePhase(phase, rnd() * 4, rnd() * 0.05);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThan(1);
    }
  });
});

describe('traceAmplitude — honest silence', () => {
  it('is exactly zero when silent (flat idle line)', () => {
    for (const loud of [0, 0.5, 1]) expect(traceAmplitude(true, 0.42, loud)).toBe(0);
  });
  it('is positive and loudness-monotonic when not silent', () => {
    const quiet = traceAmplitude(false, 0.42, 0.1);
    const loud = traceAmplitude(false, 0.42, 0.9);
    expect(quiet).toBeGreaterThan(0);
    expect(loud).toBeGreaterThan(quiet);
    expect(loud).toBeLessThanOrEqual(0.5);
  });
});

describe('motionProfile — reduced-motion program (test hook)', () => {
  it('disables warp and slows the trace under reduced motion', () => {
    expect(motionProfile(false)).toBe(MOTION_FULL);
    expect(motionProfile(true)).toBe(MOTION_REDUCED);
    expect(MOTION_REDUCED.warp).toBe(0); // no domain-warp drift
    expect(MOTION_REDUCED.phase).toBeGreaterThan(0);
    expect(MOTION_REDUCED.phase).toBeLessThan(1); // gentle, not frozen
    expect(MOTION_REDUCED.decayBias).toBeGreaterThanOrEqual(0);
    // Shimmer noise animates with time, so it must be damped under reduced
    // motion (brightness carries the music, not per-pixel twinkle).
    expect(MOTION_REDUCED.shimmer).toBeLessThan(MOTION_FULL.shimmer);
    expect(MOTION_FULL.shimmer).toBe(1);
  });

  it('warpStrength × reduced-motion warp is zero (no drift)', () => {
    expect(warpStrength(1, 1) * MOTION_REDUCED.warp).toBe(0);
    expect(warpStrength(1, 1) * MOTION_FULL.warp).toBeGreaterThan(0);
  });
});

describe('shimmerAmount & injectionBrightness bounds', () => {
  it('shimmer is a bounded product of its three unit inputs', () => {
    expect(shimmerAmount(1, 1, 1)).toBeCloseTo(1, 6);
    expect(shimmerAmount(0.5, 0.5, 0.5)).toBeCloseTo(0.125, 6);
    expect(shimmerAmount(2, 2, 2)).toBe(1); // clamped
  });
  it('injection is non-negative, finite, and capped', () => {
    for (const fx of HOSTILE) for (const l of HOSTILE) {
      const v = injectionBrightness(1, fx, l);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(8);
    }
  });
});
