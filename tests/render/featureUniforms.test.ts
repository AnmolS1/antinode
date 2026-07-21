import { describe, expect, it } from 'vitest';

import type { FrameFeatures } from '../../src/contracts';
import { FeatureUniforms, SPECTRUM_BINS } from '../../src/render/bridge/FeatureUniforms';

// Values chosen to be exactly representable in float32 (multiples of 1/2^n) so
// the DataTexture round-trip is exact.
function frame(overrides: Partial<FrameFeatures> = {}): FrameFeatures {
  const spectrum = new Float32Array(SPECTRUM_BINS);
  for (let i = 0; i < SPECTRUM_BINS; i += 1) spectrum[i] = (i % 4) / 4; // 0, .25, .5, .75
  return {
    t: 2.5,
    rms: 0.25,
    loudNorm: 0.5,
    bands: { bass: 0.75, lowMid: 0.5, mid: 0.25, high: 0.125 },
    spectrum,
    flux: 0.5,
    onset: true,
    beat: { bpm: 128, phase: 0.5, confidence: 0.75 },
    silent: false,
    ...overrides,
  };
}

describe('FeatureUniforms', () => {
  it('lands scalar features in their uniform nodes', () => {
    const fu = new FeatureUniforms();
    fu.update(frame());
    expect(fu.uBass.value).toBe(0.75);
    expect(fu.uLowMid.value).toBe(0.5);
    expect(fu.uMid.value).toBe(0.25);
    expect(fu.uHigh.value).toBe(0.125);
    expect(fu.uRms.value).toBe(0.25);
    expect(fu.uLoud.value).toBe(0.5);
    expect(fu.uFlux.value).toBe(0.5);
    expect(fu.uBeatPhase.value).toBe(0.5);
    expect(fu.uBpm.value).toBe(128);
    expect(fu.uTime.value).toBe(2.5);
    fu.dispose();
  });

  it('maps the boolean onset to a 0/1 float uniform', () => {
    const fu = new FeatureUniforms();
    fu.update(frame({ onset: true }));
    expect(fu.uOnset.value).toBe(1);
    fu.update(frame({ onset: false }));
    expect(fu.uOnset.value).toBe(0);
    fu.dispose();
  });

  it('treats a null bpm as 0', () => {
    const fu = new FeatureUniforms();
    fu.update(frame({ beat: { bpm: null, phase: 0.25, confidence: 0 } }));
    expect(fu.uBpm.value).toBe(0);
    expect(fu.uBeatPhase.value).toBe(0.25);
    fu.dispose();
  });

  it('writes the spectrum into the texture backing store in place (no realloc)', () => {
    const fu = new FeatureUniforms();
    const backing = fu.spectrumTexture.image.data;
    expect(backing).toBeInstanceOf(Float32Array);
    expect((backing as Float32Array).length).toBe(SPECTRUM_BINS);

    const versionBefore = fu.spectrumTexture.version;
    fu.update(frame());
    // Same backing array reference — updated in place.
    expect(fu.spectrumTexture.image.data).toBe(backing);
    // `needsUpdate` is a write-only setter; the observable upload signal is the
    // version counter incrementing.
    expect(fu.spectrumTexture.version).toBeGreaterThan(versionBefore);

    const data = fu.spectrumTexture.image.data as Float32Array;
    expect(data[0]).toBe(0);
    expect(data[1]).toBe(0.25);
    expect(data[2]).toBe(0.5);
    expect(data[3]).toBe(0.75);
    fu.dispose();
  });

  it('overwrites the same store on the next frame (still no realloc)', () => {
    const fu = new FeatureUniforms();
    const backing = fu.spectrumTexture.image.data;
    fu.update(frame());
    const next = new Float32Array(SPECTRUM_BINS).fill(0.5);
    fu.update(frame({ spectrum: next }));
    expect(fu.spectrumTexture.image.data).toBe(backing); // unchanged reference
    expect((fu.spectrumTexture.image.data as Float32Array)[10]).toBe(0.5);
    fu.dispose();
  });

  it('clamps a longer-than-64 spectrum without throwing', () => {
    const fu = new FeatureUniforms();
    const long = new Float32Array(128).fill(0.25);
    expect(() => fu.update(frame({ spectrum: long }))).not.toThrow();
    expect((fu.spectrumTexture.image.data as Float32Array)[63]).toBe(0.25);
    fu.dispose();
  });
});
