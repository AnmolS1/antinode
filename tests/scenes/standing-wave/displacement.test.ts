import { describe, expect, it } from 'vitest';

import {
  antinodeGain,
  antinodePositions,
  energyBrightness,
  motionGate,
  nearestAntinode,
  nodePositions,
  resolveTheta,
  standingWaveHeight,
  waveNumber,
  wrapTau,
  type ThetaInput,
  type WaveSample,
} from '../../../src/scenes/standing-wave/displacement';

const base = (over: Partial<WaveSample> = {}): WaveSample => ({
  amplitude: 0.6,
  bass: 0.4,
  wavelength: 3,
  theta: 0.7,
  phase: 0.2,
  ...over,
});

describe('standing wave — nodes stay pinned', () => {
  it('is ~0 at every node for any amplitude, bass, and phase', () => {
    const wavelength = 3;
    const nodes = nodePositions(wavelength, -12, 12);
    expect(nodes.length).toBeGreaterThan(4);

    for (const amplitude of [0, 0.25, 1, 2, 50]) {
      for (const bass of [0, 0.5, 1]) {
        for (const theta of [0, 1.1, Math.PI, 5.9]) {
          for (const x of nodes) {
            const h = standingWaveHeight(x, base({ amplitude, bass, wavelength, theta }));
            expect(Math.abs(h)).toBeLessThan(1e-9);
          }
        }
      }
    }
  });

  it('antinodes actually breathe (non-zero, amplitude-scaled)', () => {
    const wavelength = 3;
    const anti = antinodePositions(wavelength, -12, 12);
    expect(anti.length).toBeGreaterThan(3);
    // At an antinode with theta=0, phase=0 the fundamental term is ±gain.
    const s = base({ theta: 0, phase: 0, wavelength });
    const peak = Math.max(...anti.map((x) => Math.abs(standingWaveHeight(x, s))));
    expect(peak).toBeGreaterThan(0.1);
  });

  it('bass inflates the antinode amplitude', () => {
    expect(antinodeGain({ amplitude: 1, bass: 1 })).toBeGreaterThan(
      antinodeGain({ amplitude: 1, bass: 0 }),
    );
    expect(antinodeGain({ amplitude: 1, bass: 0 })).toBe(1);
  });

  it('never returns NaN/Infinity, even for a degenerate wavelength', () => {
    for (const wavelength of [0, -0, 1e-9, -3]) {
      for (const x of [-5, 0, 3.3, 9]) {
        expect(Number.isFinite(standingWaveHeight(x, base({ wavelength })))).toBe(true);
      }
    }
  });
});

describe('node / antinode geometry', () => {
  it('nodes are spaced by λ/2 and antinodes sit halfway between', () => {
    const wavelength = 4;
    const k = waveNumber(wavelength);
    const spacing = Math.PI / k;
    expect(spacing).toBeCloseTo(wavelength / 2, 10);

    const nodes = nodePositions(wavelength, -8, 8);
    for (let i = 1; i < nodes.length; i += 1) {
      expect(nodes[i]! - nodes[i - 1]!).toBeCloseTo(spacing, 10);
    }
  });

  it('nearestAntinode returns an antinode and clamps to bounds', () => {
    const wavelength = 3;
    const near = nearestAntinode(0.1, wavelength, -10, 10);
    // Must be a true antinode: |sin(k·x)| ≈ 1.
    expect(Math.abs(Math.sin(waveNumber(wavelength) * near))).toBeCloseTo(1, 6);
    // Clamped.
    expect(nearestAntinode(1000, wavelength, -10, 10)).toBeLessThanOrEqual(10);
    expect(nearestAntinode(-1000, wavelength, -10, 10)).toBeGreaterThanOrEqual(-10);
  });
});

describe('resolveTheta — beat lock, free-run, reduced motion', () => {
  const input = (over: Partial<ThetaInput> = {}): ThetaInput => ({
    freeOmega: 2,
    dt: 0.5,
    bpm: 120,
    confidence: 0.9,
    beatPhase: 0.25,
    beatLock: true,
    confidenceThreshold: 0.6,
    reducedMotion: false,
    ...over,
  });

  it('freezes (returns prev θ) under reduced motion', () => {
    expect(resolveTheta(1.234, input({ reducedMotion: true }))).toBe(1.234);
  });

  it('locks θ to the beat when confident and beatLock is on', () => {
    expect(resolveTheta(0, input({ beatPhase: 0.25 }))).toBeCloseTo(wrapTau(2 * Math.PI * 0.25), 10);
  });

  it('free-runs when unconfident, accumulating at freeOmega', () => {
    const next = resolveTheta(1, input({ confidence: 0.1, dt: 0.5, freeOmega: 2 }));
    expect(next).toBeCloseTo(wrapTau(1 + 2 * 0.5), 10);
  });

  it('free-runs when tempo is unresolved (bpm null)', () => {
    const next = resolveTheta(0, input({ bpm: null }));
    expect(next).toBeCloseTo(wrapTau(2 * 0.5), 10);
  });

  it('always wraps into [0, 2π)', () => {
    for (let i = 0; i < 200; i += 1) {
      const th = resolveTheta(6.2, input({ beatLock: false, confidence: 0, freeOmega: 5, dt: 0.3 }));
      expect(th).toBeGreaterThanOrEqual(0);
      expect(th).toBeLessThan(2 * Math.PI);
    }
  });
});

describe('energyBrightness — reduced-motion program maps loudness to brightness', () => {
  it('under reduced motion, brightness climbs with loudness', () => {
    const quiet = energyBrightness(true, 0, 0);
    const loud = energyBrightness(true, 1, 0);
    expect(loud).toBeGreaterThan(quiet);
    expect(loud - quiet).toBeGreaterThan(0.5); // loudness is the dominant driver
  });

  it('in the normal program, brightness barely tracks loudness (motion carries it)', () => {
    const quiet = energyBrightness(false, 0, 0);
    const loud = energyBrightness(false, 1, 0);
    expect(loud).toBe(quiet); // loudNorm unused when not reduced
  });

  it('stays finite and non-negative for out-of-range inputs', () => {
    for (const rm of [true, false]) {
      for (const l of [-5, 0.5, 99]) {
        const b = energyBrightness(rm, l, l);
        expect(Number.isFinite(b)).toBe(true);
        expect(b).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('motionGate — the low-motion program silences audio-driven motion', () => {
  it('under reduced motion: bass gated off, wavelength held at base, ripples off', () => {
    for (const kDrift of [-1, 0, 0.7, 1]) {
      const g = motionGate(true, 3, kDrift);
      expect(g.bassGate).toBe(0);
      expect(g.rippleGate).toBe(0);
      expect(g.effWavelength).toBe(3); // no morph, independent of kDrift
    }
  });

  it('in the normal program: bass/ripples live, wavelength morphs with drift', () => {
    const g0 = motionGate(false, 3, 0);
    const gp = motionGate(false, 3, 1);
    expect(g0.bassGate).toBe(1);
    expect(g0.rippleGate).toBe(1);
    expect(gp.effWavelength).not.toBe(g0.effWavelength); // drift shifts wavelength
  });

  it('reduced-motion geometry is invariant frame-to-frame under changing audio', () => {
    // Two "frames" with different bass/mid but the same frozen θ. The shader uses
    // `bass · bassGate` as its live drive and `gate.effWavelength`; asserting the
    // CPU reference is identical proves the surface holds still (what T10 checks).
    const xs = [-4.1, -1.3, 0.7, 2.9, 5.5];
    const theta = 1.234; // frozen by resolveTheta under reduced motion
    const frame = (bass: number, mid: number): number[] => {
      const g = motionGate(true, 3, (mid - 0.5) * 2);
      return xs.map((x) =>
        standingWaveHeight(x, {
          amplitude: 0.6,
          bass: bass * g.bassGate, // live drive the shader actually applies
          wavelength: g.effWavelength,
          theta,
          phase: 0,
        }),
      );
    };
    expect(frame(0.1, 0.2)).toEqual(frame(0.95, 0.8));
  });
});
