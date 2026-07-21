import { describe, it, expect } from 'vitest';
import { Fft } from '../../src/audio/dsp/fft';
import { BandMapper, SPECTRUM_BINS } from '../../src/audio/dsp/bands';
import {
  RollingStats,
  PercentileNormalizer,
  PeakNormalizer,
  clamp01,
} from '../../src/audio/dsp/normalize';
import { lagStep, lagSmooth, LAG_CONSTANTS } from '../../src/audio/dsp/lag';
import { sine } from '../fixtures/gen';

const SR = 44_100;

describe('Fft', () => {
  it('rejects non-power-of-two sizes', () => {
    expect(() => new Fft(1000)).toThrow();
  });

  it('puts a tone at the correct magnitude bin', () => {
    const N = 2048;
    const fft = new Fft(N);
    const freq = (SR / N) * 100; // exactly bin 100
    const time = sine(freq, SR, N, 0.5);
    const mag = new Float32Array(N / 2);
    fft.magnitude(time, mag);

    let peak = 0;
    let peakBin = -1;
    for (let i = 1; i < mag.length; i++) {
      const v = mag[i] ?? 0;
      if (v > peak) {
        peak = v;
        peakBin = i;
      }
    }
    expect(peakBin).toBe(100);
    expect(peak).toBeGreaterThan(0);
  });
});

describe('BandMapper', () => {
  it('maps bass energy to the bass band', () => {
    const N = 2048;
    const fft = new Fft(N);
    const mapper = new BandMapper(N, SR);
    const mag = new Float32Array(N / 2);
    fft.magnitude(sine(60, SR, N, 0.7), mag); // 60 Hz → bass

    const bands = new Float32Array(4);
    mapper.toBandEnergy(mag, bands);
    const [bass, lowMid, mid, high] = bands;
    expect(bass ?? 0).toBeGreaterThan(lowMid ?? 0);
    expect(bass ?? 0).toBeGreaterThan(mid ?? 0);
    expect(bass ?? 0).toBeGreaterThan(high ?? 0);
  });

  it('maps high energy to the high band', () => {
    const N = 2048;
    const fft = new Fft(N);
    const mapper = new BandMapper(N, SR);
    const mag = new Float32Array(N / 2);
    fft.magnitude(sine(8000, SR, N, 0.7), mag); // 8 kHz → high

    const bands = new Float32Array(4);
    mapper.toBandEnergy(mag, bands);
    const [bass, , , high] = bands;
    expect(high ?? 0).toBeGreaterThan(bass ?? 0);
  });

  it('produces 64 log bins with a peak near the tone', () => {
    const N = 2048;
    const fft = new Fft(N);
    const mapper = new BandMapper(N, SR);
    const mag = new Float32Array(N / 2);
    fft.magnitude(sine(1000, SR, N, 0.7), mag);
    const bins = new Float32Array(SPECTRUM_BINS);
    mapper.toLogBins(mag, bins);
    expect(bins.length).toBe(64);
    let peakBin = -1;
    let peak = 0;
    for (let i = 0; i < bins.length; i++) {
      const v = bins[i] ?? 0;
      if (v > peak) {
        peak = v;
        peakBin = i;
      }
    }
    // 1 kHz sits in the upper-middle of a 20 Hz–16 kHz log axis.
    expect(peakBin).toBeGreaterThan(20);
    expect(peakBin).toBeLessThan(55);
  });
});

describe('RollingStats', () => {
  it('computes quantiles over the window', () => {
    const s = new RollingStats(100);
    for (let i = 1; i <= 100; i++) s.push(i);
    expect(s.quantile(0.5)).toBeGreaterThanOrEqual(49);
    expect(s.quantile(0.5)).toBeLessThanOrEqual(52);
    expect(s.quantile(0.95)).toBeGreaterThanOrEqual(94);
  });

  it('evicts oldest beyond capacity', () => {
    const s = new RollingStats(10);
    for (let i = 0; i < 100; i++) s.push(i);
    expect(s.size).toBe(10);
    expect(s.quantile(0)).toBeGreaterThanOrEqual(90);
  });
});

describe('normalizers are scale-equivariant', () => {
  it('PercentileNormalizer: loud vs quiet converge', () => {
    const quiet = new PercentileNormalizer(200);
    const loud = new PercentileNormalizer(200);
    const rand = () => Math.random();
    let ql = 0;
    let ll = 0;
    for (let i = 0; i < 400; i++) {
      const v = 0.01 + 0.05 * rand();
      ql = quiet.normalize(v);
      ll = loud.normalize(v * 8);
    }
    expect(Math.abs(ql - ll)).toBeLessThan(1e-6);
  });

  it('PeakNormalizer: loud vs quiet converge', () => {
    const quiet = new PeakNormalizer(200);
    const loud = new PeakNormalizer(200);
    let ql = 0;
    let ll = 0;
    for (let i = 0; i < 400; i++) {
      const v = 0.02 + 0.08 * Math.abs(Math.sin(i));
      ql = quiet.normalize(v);
      ll = loud.normalize(v * 12);
    }
    expect(Math.abs(ql - ll)).toBeLessThan(1e-6);
  });
});

describe('clamp01', () => {
  it('clamps and rejects NaN', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBeCloseTo(0.4);
    expect(clamp01(Number.NaN)).toBe(0);
  });
});

describe('asymmetric lag', () => {
  it('snaps up instantly (attack 0) and decays slowly on release', () => {
    // Rising: attack 0 → target reached immediately.
    const up = lagStep(0, 1, 1 / 60, LAG_CONSTANTS.bass);
    expect(up).toBeCloseTo(1);

    // Falling: release 0.35 s → partial move only.
    const down = lagStep(1, 0, 1 / 60, LAG_CONSTANTS.bass);
    expect(down).toBeGreaterThan(0.9);
    expect(down).toBeLessThan(1);
  });

  it('is frame-rate independent over equal wall-clock time', () => {
    const tuning = { attack: 0, release: 0.3 };
    // 0.1 s of decay in one big step vs ten small steps → close.
    const big = lagStep(1, 0, 0.1, tuning);
    let small = 1;
    for (let i = 0; i < 10; i++) small = lagStep(small, 0, 0.01, tuning);
    expect(Math.abs(big - small)).toBeLessThan(0.02);
  });

  it('lagSmooth factory seeds from first target', () => {
    const smooth = lagSmooth(0, 0.2);
    expect(smooth(0.5, 1 / 60)).toBeCloseTo(0.5); // first call seeds
  });
});
