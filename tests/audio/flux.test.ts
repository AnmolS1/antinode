import { describe, it, expect } from 'vitest';
import { OnsetDetector, spectralFlux, MIN_ONSET_INTERVAL } from '../../src/audio/dsp/flux';
import { Analyzer } from '../../src/audio/analyzer';
import { clickTrack, pinkNoise, forEachFrame } from '../fixtures/gen';

const SR = 44_100;
const FFT = 512;
const HOP = 128;

describe('spectralFlux', () => {
  it('counts only positive bin deltas', () => {
    const prev = new Float32Array([1, 1, 1, 1]);
    const cur = new Float32Array([2, 0.5, 3, 1]); // +1, -0.5, +2, 0
    expect(spectralFlux(cur, prev, 4)).toBeCloseTo(3);
  });
});

describe('OnsetDetector flashGuard (WCAG 2.3.1)', () => {
  it('never emits more than 3 onsets per second even under constant excitation', () => {
    const det = new OnsetDetector(96);
    // Feed a rising-then-falling flux every frame at 200 fps for 5 s so a naive
    // detector would fire almost every frame.
    const fps = 200;
    const dur = 5;
    const onsetTimes: number[] = [];
    for (let i = 0; i < fps * dur; i++) {
      const t = i / fps;
      const flux = (i % 2 === 0 ? 5 : 1) + Math.random(); // alternating peaks
      if (det.process(flux, t)) onsetTimes.push(t);
    }
    // No two onsets closer than the hard guard interval.
    for (let i = 1; i < onsetTimes.length; i++) {
      expect((onsetTimes[i] ?? 0) - (onsetTimes[i - 1] ?? 0)).toBeGreaterThanOrEqual(
        MIN_ONSET_INTERVAL - 1e-9,
      );
    }
    // And the rate stays at or below 3/s across the whole run.
    expect(onsetTimes.length).toBeLessThanOrEqual(3 * dur + 1);
  });
});

describe('onset detection on a click track', () => {
  it('hits each beat within ±25 ms', () => {
    const track = clickTrack(120, SR, 6, 0.8);
    // The analyzer FFT window is FFT samples; we slide it in HOP steps, matching
    // how the engine reads a fresh AnalyserNode buffer each animation frame.
    const onsets: number[] = [];
    const a = new Analyzer(SR, { fftSize: FFT, onsetWindow: 200 });
    forEachFrame(track.samples, SR, FFT, HOP, (win, t) => {
      const f = a.analyze(win, t);
      if (f.onset) onsets.push(t);
    });

    // Every beat should have a detected onset within 25 ms.
    for (const beat of track.beatTimes) {
      let best = Infinity;
      for (const o of onsets) best = Math.min(best, Math.abs(o - beat));
      expect(best).toBeLessThanOrEqual(0.025);
    }
    // And we should not be flooded with spurious onsets.
    expect(onsets.length).toBeLessThanOrEqual(track.beatTimes.length + 3);
  });

  it('stays under the flash ceiling on pink noise (no beat)', () => {
    const noise = pinkNoise(SR, SR * 4, 0.5);
    const a = new Analyzer(SR, { fftSize: FFT, onsetWindow: 200 });
    const onsets: number[] = [];
    forEachFrame(noise, SR, FFT, HOP, (win, t) => {
      const f = a.analyze(win, t);
      if (f.onset) onsets.push(t);
    });
    // 4 s of stationary noise: flash guard caps at ≤ 3/s.
    expect(onsets.length).toBeLessThanOrEqual(3 * 4 + 1);
  });
});
