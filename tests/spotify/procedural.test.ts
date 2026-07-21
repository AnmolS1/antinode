import { describe, expect, it } from 'vitest';

import { DEFAULT_BPM, barPhase, proceduralBeat } from '../../src/spotify/procedural';

describe('metadata-procedural beat', () => {
  it('barPhase wraps 0..1 over a 4/4 bar', () => {
    // At 120 BPM a beat is 500 ms; a 4/4 bar is 2000 ms.
    expect(barPhase(0, 120)).toBeCloseTo(0, 5);
    expect(barPhase(1000, 120)).toBeCloseTo(0.5, 5); // half a bar
    expect(barPhase(2000, 120)).toBeCloseTo(0, 5); // full bar wraps
  });

  it('falls back to the default BPM for a non-positive tempo', () => {
    expect(barPhase(1000, 0)).toBe(barPhase(1000, DEFAULT_BPM));
  });

  it('proceduralBeat returns an unresolved beat when BPM is null', () => {
    expect(proceduralBeat(1234, null)).toEqual({ bpm: null, phase: 0, confidence: 0 });
  });

  it('proceduralBeat derives beat phase from position at a known BPM', () => {
    // 120 BPM → 500 ms/beat; 250 ms in = halfway through the beat.
    const b = proceduralBeat(250, 120);
    expect(b.bpm).toBe(120);
    expect(b.phase).toBeCloseTo(0.5, 5);
    expect(b.confidence).toBeGreaterThan(0);
    expect(b.confidence).toBeLessThan(1);
  });
});
