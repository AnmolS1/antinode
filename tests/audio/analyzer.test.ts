import { describe, it, expect } from 'vitest';
import { Analyzer } from '../../src/audio/analyzer';
import { clickTrack, sine, silence, forEachFrame } from '../fixtures/gen';
import type { FrameFeatures } from '../../src/contracts';

const SR = 44_100;

describe('Analyzer produces a valid FrameFeatures', () => {
  it('fills every field in range', () => {
    const a = new Analyzer(SR, { fftSize: 2048 });
    const tone = sine(440, SR, 2048, 0.5);
    let f: FrameFeatures | null = null;
    for (let i = 0; i < 30; i++) f = a.analyze(tone, i / 60);
    expect(f).not.toBeNull();
    const frame = f as FrameFeatures;
    expect(frame.spectrum.length).toBe(64);
    expect(frame.loudNorm).toBeGreaterThanOrEqual(0);
    expect(frame.loudNorm).toBeLessThanOrEqual(1);
    for (const v of [frame.bands.bass, frame.bands.lowMid, frame.bands.mid, frame.bands.high]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    for (let i = 0; i < frame.spectrum.length; i++) {
      const s = frame.spectrum[i] ?? -1;
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe('allocation-free hot path', () => {
  it('reuses the frame, spectrum, bands and beat objects across 10k frames', () => {
    const a = new Analyzer(SR, { fftSize: 2048 });
    const buf = sine(300, SR, 2048, 0.4);
    const first = a.analyze(buf, 0);
    const spectrumRef = first.spectrum;
    const bandsRef = first.bands;
    const beatRef = first.beat;

    for (let i = 1; i < 10_000; i++) {
      const f = a.analyze(buf, i / 60);
      expect(f).toBe(first);
      expect(f.spectrum).toBe(spectrumRef);
      expect(f.bands).toBe(bandsRef);
      expect(f.beat).toBe(beatRef);
    }
  });

  it('does not grow the heap when gc is available', () => {
    const gc = (globalThis as { gc?: () => void }).gc;
    if (!gc) return; // only meaningful under --expose-gc; skipped otherwise
    const a = new Analyzer(SR, { fftSize: 2048 });
    const buf = sine(300, SR, 2048, 0.4);
    for (let i = 0; i < 2000; i++) a.analyze(buf, i / 60); // warm up
    gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 10_000; i++) a.analyze(buf, i / 60);
    gc();
    const after = process.memoryUsage().heapUsed;
    expect(after - before).toBeLessThan(2_000_000);
  });
});

describe('normalization convergence (loud vs quiet, same shape)', () => {
  it('yields near-identical loudNorm and bands for scaled signals', () => {
    const quiet = new Analyzer(SR, { fftSize: 2048 });
    const loud = new Analyzer(SR, { fftSize: 2048 });
    const gain = 10;
    let q: FrameFeatures | null = null;
    let l: FrameFeatures | null = null;
    // Amplitude-modulated tone so percentiles have a real distribution.
    for (let i = 0; i < 600; i++) {
      const env = 0.05 + 0.5 * Math.abs(Math.sin(i * 0.05));
      const base = sine(500, SR, 2048, env);
      const scaled = new Float32Array(base.length);
      for (let j = 0; j < base.length; j++) scaled[j] = (base[j] ?? 0) * gain;
      const t = i / 60;
      q = quiet.analyze(base, t);
      l = loud.analyze(scaled, t);
    }
    const qf = q as FrameFeatures;
    const lf = l as FrameFeatures;
    expect(Math.abs(qf.loudNorm - lf.loudNorm)).toBeLessThan(1e-3);
    expect(Math.abs(qf.bands.bass - lf.bands.bass)).toBeLessThan(1e-3);
    expect(Math.abs(qf.bands.mid - lf.bands.mid)).toBeLessThan(1e-3);
  });
});

describe('silence flag timing', () => {
  it('latches after ~3 s of sub-threshold input and not before', () => {
    const a = new Analyzer(SR, { fftSize: 2048, silenceHold: 3 });
    const quiet = silence(2048);
    const fps = 60;
    let latchedAt = -1;
    for (let i = 0; i < fps * 5; i++) {
      const t = i / fps;
      const f = a.analyze(quiet, t);
      if (f.silent && latchedAt < 0) latchedAt = t;
    }
    expect(latchedAt).toBeGreaterThanOrEqual(3);
    expect(latchedAt).toBeLessThan(3.3);
  });

  it('stays false while audio is present', () => {
    const a = new Analyzer(SR, { fftSize: 2048, silenceHold: 3 });
    const tone = sine(440, SR, 2048, 0.4);
    let everSilent = false;
    for (let i = 0; i < 60 * 5; i++) {
      const f = a.analyze(tone, i / 60);
      if (f.silent) everSilent = true;
    }
    expect(everSilent).toBe(false);
  });

  it('never latches silent when disabled (procedural source)', () => {
    const a = new Analyzer(SR, { fftSize: 2048, silenceHold: 3 });
    a.setSilenceEnabled(false);
    const quiet = silence(2048);
    let everSilent = false;
    for (let i = 0; i < 60 * 6; i++) {
      const f = a.analyze(quiet, i / 60);
      if (f.silent) everSilent = true;
    }
    expect(everSilent).toBe(false);
  });
});

describe('Analyzer locks BPM on a click track (end-to-end)', () => {
  it('reads ~120 BPM within ±2 via onset → tempo', () => {
    const track = clickTrack(120, SR, 8, 0.85);
    const a = new Analyzer(SR, { fftSize: 512, onsetWindow: 200 });
    let last = a.analyze(new Float32Array(512), 0);
    forEachFrame(track.samples, SR, 512, 128, (win, t) => {
      last = a.analyze(win, t);
    });
    expect(last.beat.bpm).not.toBeNull();
    expect(Math.abs((last.beat.bpm ?? 0) - 120)).toBeLessThanOrEqual(2);
  });
});
