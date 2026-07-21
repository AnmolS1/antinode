import { describe, it, expect } from 'vitest';

import type { FrameFeatures } from '../src/contracts';

// Proves the contracts compile and that vitest runs. If the FrameFeatures shape
// drifts, this literal stops type-checking — a cheap tripwire for the API.
describe('contracts', () => {
  it('builds a minimal valid FrameFeatures', () => {
    const f: FrameFeatures = {
      t: 0,
      rms: 0,
      loudNorm: 0,
      bands: { bass: 0, lowMid: 0, mid: 0, high: 0 },
      spectrum: new Float32Array(64),
      flux: 0,
      onset: false,
      beat: { bpm: null, phase: 0, confidence: 0 },
      silent: true,
    };

    expect(f.spectrum).toHaveLength(64);
    expect(f.beat.bpm).toBeNull();
  });
});
