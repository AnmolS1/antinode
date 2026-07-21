import { describe, expect, it } from 'vitest';

import type { FrameFeatures, ParamDef } from '../../src/contracts';
import {
  MOD_SOURCES,
  ModMatrix,
  resolve,
  sampleSource,
  type ModRoute,
  type ModSource,
} from '../../src/render/modmatrix';

/** Deterministic PRNG (mulberry32) so the property test is reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function frame(overrides: Partial<FrameFeatures> = {}): FrameFeatures {
  return {
    t: 0,
    rms: 0.3,
    loudNorm: 0.5,
    bands: { bass: 0.8, lowMid: 0.4, mid: 0.3, high: 0.2 },
    spectrum: new Float32Array(64),
    flux: 0.25,
    onset: false,
    beat: { bpm: 120, phase: 0.25, confidence: 0.9 },
    silent: false,
    reducedMotion: false,
    ...overrides,
  };
}

describe('sampleSource', () => {
  it('reads energy channels as 0–1', () => {
    const f = frame();
    expect(sampleSource('bass', f)).toBeCloseTo(0.8);
    expect(sampleSource('mid', f)).toBeCloseTo(0.3);
    expect(sampleSource('loudNorm', f)).toBeCloseTo(0.5);
    expect(sampleSource('flux', f)).toBeCloseTo(0.25);
  });

  it('clamps out-of-range energy to [0,1]', () => {
    expect(sampleSource('rms', frame({ rms: 5 }))).toBe(1);
    expect(sampleSource('rms', frame({ rms: -2 }))).toBe(0);
  });

  it('shapes beatPhase: saw ramps, sine is bipolar, pulse is a square', () => {
    const f = frame({ beat: { bpm: 120, phase: 0.25, confidence: 1 } });
    expect(sampleSource('beatPhase', f, 'saw')).toBeCloseTo(0.25);
    expect(sampleSource('beatPhase', f, 'sine')).toBeCloseTo(1); // sin(2π·0.25)=1
    expect(sampleSource('beatPhase', f, 'pulse')).toBe(1);
    expect(sampleSource('beatPhase', frame({ beat: { bpm: 120, phase: 0.75, confidence: 1 } }), 'pulse')).toBe(0);
  });

  it('onset source returns the supplied envelope', () => {
    expect(sampleSource('onset', frame({ onset: true }))).toBe(1);
    expect(sampleSource('onset', frame({ onset: false }), 'saw', 0.4)).toBeCloseTo(0.4);
  });
});

describe('resolve', () => {
  it('returns the (clamped) base with no routes', () => {
    expect(resolve(3, 0, 4, [], frame())).toBe(3);
    expect(resolve(9, 0, 4, [], frame())).toBe(4);
    expect(resolve(-9, 0, 4, [], frame())).toBe(0);
  });

  it('adds amount × source × span', () => {
    // base 2, span 4, bass 0.8, amount 0.5 → 2 + 0.5*0.8*4 = 3.6
    const routes: ModRoute[] = [{ source: 'bass', amount: 0.5 }];
    expect(resolve(2, 0, 4, routes, frame())).toBeCloseTo(3.6);
  });

  it('is bipolar: negative amount pushes the other way', () => {
    const up: ModRoute[] = [{ source: 'bass', amount: 0.5 }];
    const down: ModRoute[] = [{ source: 'bass', amount: -0.5 }];
    expect(resolve(2, 0, 4, up, frame())).toBeGreaterThan(2);
    expect(resolve(2, 0, 4, down, frame())).toBeLessThan(2);
  });

  it('sums multiple routes then clamps to range', () => {
    const routes: ModRoute[] = [
      { source: 'bass', amount: 1 },
      { source: 'loudNorm', amount: 1 },
    ];
    // Would overshoot 4; clamps.
    expect(resolve(3, 0, 4, routes, frame())).toBe(4);
  });

  it('property: output is ALWAYS within [min,max] for arbitrary inputs', () => {
    const rng = mulberry32(0xa11ce);
    const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)] as T;
    for (let i = 0; i < 2000; i += 1) {
      const min = rng() * 20 - 10;
      const max = min + rng() * 20 + 0.001;
      const base = min + rng() * (max - min);
      const routes: ModRoute[] = [];
      const n = Math.floor(rng() * 4);
      for (let r = 0; r < n; r += 1) {
        const source = pick<ModSource>(MOD_SOURCES);
        const route: ModRoute = { source, amount: rng() * 2 - 1 };
        if (source === 'beatPhase') route.shape = pick(['saw', 'sine', 'pulse'] as const);
        routes.push(route);
      }
      const f = frame({
        rms: rng() * 3 - 1, // deliberately out of [0,1]
        loudNorm: rng() * 2 - 0.5,
        flux: rng() * 2,
        bands: { bass: rng() * 2, lowMid: rng() * 2, mid: rng() * 2, high: rng() * 2 },
        onset: rng() > 0.5,
        beat: { bpm: 120, phase: rng() * 3 - 1, confidence: rng() },
      });
      const out = resolve(base, min, max, routes, f, rng());
      expect(out).toBeGreaterThanOrEqual(min - 1e-9);
      expect(out).toBeLessThanOrEqual(max + 1e-9);
      expect(Number.isFinite(out)).toBe(true);
    }
  });
});

const DEFS: ParamDef[] = [
  { type: 'number', key: 'gain', label: 'Gain', min: 0, max: 4, default: 2, modulatable: true },
  { type: 'number', key: 'spin', label: 'Spin', min: 0, max: 2, default: 0.3, modulatable: true },
  { type: 'number', key: 'fixed', label: 'Fixed', min: 0, max: 1, default: 0.5 }, // not modulatable
  { type: 'boolean', key: 'wire', label: 'Wire', default: true },
];

describe('ModMatrix applicator', () => {
  it('copies non-modulated + non-numeric params straight through', () => {
    const m = new ModMatrix();
    m.configure(DEFS, new Map());
    const out: Record<string, unknown> = {};
    m.apply(out, { gain: 1.5, spin: 0.4, fixed: 0.9, wire: false }, frame(), 1 / 60);
    expect(out['fixed']).toBe(0.9);
    expect(out['wire']).toBe(false);
    expect(out['gain']).toBe(1.5); // no routes → base
  });

  it('resolves modulated params within range', () => {
    const m = new ModMatrix();
    m.configure(
      DEFS,
      new Map<string, readonly ModRoute[]>([['gain', [{ source: 'bass', amount: 1 }]]]),
    );
    const out: Record<string, unknown> = {};
    m.apply(out, { gain: 2, spin: 0.3, fixed: 0.5, wire: true }, frame({ bands: { bass: 1, lowMid: 0, mid: 0, high: 0 } }), 1 / 60);
    expect(out['gain']).toBe(4); // 2 + 1*1*4 = 6 → clamp 4
    expect(m.active).toBe(true);
  });

  it('decays the onset envelope across frames', () => {
    const m = new ModMatrix();
    m.configure(
      DEFS,
      new Map<string, readonly ModRoute[]>([['spin', [{ source: 'onset', amount: 1 }]]]),
    );
    const out: Record<string, unknown> = {};
    const base = { gain: 2, spin: 0, fixed: 0.5, wire: true };
    m.apply(out, base, frame({ onset: true }), 1 / 60);
    const peak = out['spin'] as number;
    expect(peak).toBeGreaterThan(0); // triggered
    m.apply(out, base, frame({ onset: false }), 0.1);
    const decayed = out['spin'] as number;
    expect(decayed).toBeLessThan(peak);
    expect(decayed).toBeGreaterThan(0);
  });

  it('smooths with a lag override (does not jump instantly)', () => {
    const m = new ModMatrix();
    m.configure(
      DEFS,
      new Map<string, readonly ModRoute[]>([['gain', [{ source: 'bass', amount: 1, lagMs: 200 }]]]),
    );
    const out: Record<string, unknown> = {};
    const base = { gain: 0, spin: 0.3, fixed: 0.5, wire: true };
    // First frame primes to the raw value; step from a low bass to a high one.
    m.apply(out, base, frame({ bands: { bass: 0, lowMid: 0, mid: 0, high: 0 } }), 1 / 60);
    m.apply(out, base, frame({ bands: { bass: 1, lowMid: 0, mid: 0, high: 0 } }), 1 / 60);
    const lagged = out['gain'] as number;
    // A 16ms step with a 200ms time constant only moves a fraction of the way.
    expect(lagged).toBeGreaterThan(0);
    expect(lagged).toBeLessThan(4 * 0.5);
  });

  it('does not accumulate keys across frames (stable output shape)', () => {
    const m = new ModMatrix();
    m.configure(DEFS, new Map<string, readonly ModRoute[]>([['gain', [{ source: 'bass', amount: 0.5 }]]]));
    const out: Record<string, unknown> = {};
    for (let i = 0; i < 10; i += 1) m.apply(out, { gain: 2, spin: 0.3, fixed: 0.5, wire: true }, frame(), 1 / 60);
    expect(Object.keys(out).sort()).toEqual(['fixed', 'gain', 'spin', 'wire']);
  });
});
