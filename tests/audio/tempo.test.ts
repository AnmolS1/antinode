import { describe, it, expect } from 'vitest';
import { TempoTracker } from '../../src/audio/tempo';
import type { BeatInfo } from '../../src/contracts';

function newBeat(): BeatInfo {
  return { bpm: null, phase: 0, confidence: 0 };
}

describe('TempoTracker', () => {
  it('locks 120 BPM from steady onsets within ±2', () => {
    const tt = new TempoTracker();
    const period = 0.5; // 120 BPM
    for (let i = 0; i < 32; i++) tt.onOnset(i * period);
    const beat = newBeat();
    tt.writeBeat(16 * period, beat);
    expect(beat.bpm).not.toBeNull();
    expect(Math.abs((beat.bpm ?? 0) - 120)).toBeLessThanOrEqual(2);
    expect(beat.confidence).toBeGreaterThan(0.5);
  });

  it('folds double-time onsets into the primary tempo octave', () => {
    const tt = new TempoTracker();
    // 0.25 s spacing (240 BPM) folds to 120 BPM.
    for (let i = 0; i < 40; i++) tt.onOnset(i * 0.25);
    const beat = newBeat();
    tt.writeBeat(10, beat);
    expect(Math.abs((beat.bpm ?? 0) - 120)).toBeLessThanOrEqual(4);
  });

  it('derives a beat phase in [0,1)', () => {
    const tt = new TempoTracker();
    for (let i = 0; i < 16; i++) tt.onOnset(i * 0.5);
    const beat = newBeat();
    tt.writeBeat(8 + 0.25, beat); // quarter into a beat
    expect(beat.phase).toBeGreaterThanOrEqual(0);
    expect(beat.phase).toBeLessThan(1);
    expect(beat.phase).toBeCloseTo(0.5, 1); // 0.25 s of a 0.5 s beat
  });

  it('treats a BPM hint as the authority', () => {
    const tt = new TempoTracker();
    tt.hintBpm(128);
    const beat = newBeat();
    tt.writeBeat(1, beat);
    expect(beat.bpm).toBe(128);
    expect(beat.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('reports no tempo before any signal', () => {
    const tt = new TempoTracker();
    const beat = newBeat();
    tt.writeBeat(1, beat);
    expect(beat.bpm).toBeNull();
    expect(beat.confidence).toBe(0);
  });

  it('reset clears the lock', () => {
    const tt = new TempoTracker();
    for (let i = 0; i < 16; i++) tt.onOnset(i * 0.5);
    tt.reset();
    const beat = newBeat();
    tt.writeBeat(1, beat);
    expect(beat.bpm).toBeNull();
  });
});
