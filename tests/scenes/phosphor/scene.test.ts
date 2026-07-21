import { describe, expect, it } from 'vitest';

import type { FrameFeatures } from '../../../src/contracts';
import { FeatureUniforms, SPECTRUM_BINS } from '../../../src/render/bridge/FeatureUniforms';
import { FeedbackHelper } from '../../../src/render/feedback/FeedbackHelper';
import { createPhosphorScene } from '../../../src/scenes/phosphor';
import { PHOSPHOR_PARAMS } from '../../../src/scenes/phosphor/presets';

function frame(overrides: Partial<FrameFeatures> = {}): FrameFeatures {
  return {
    t: 1,
    rms: 0.2,
    loudNorm: 0.4,
    bands: { bass: 0.5, lowMid: 0.4, mid: 0.3, high: 0.2 },
    spectrum: new Float32Array(SPECTRUM_BINS).fill(0.25),
    flux: 0.3,
    onset: false,
    beat: { bpm: 120, phase: 0.25, confidence: 0.5 },
    silent: false,
    reducedMotion: false,
    ...overrides,
  };
}

function makeScene() {
  return createPhosphorScene(new FeatureUniforms(), new FeedbackHelper(8, 8));
}

describe('createPhosphorScene — contract surface', () => {
  it('is a SceneModule with the registered id/name and param schema', () => {
    const s = makeScene();
    expect(s.id).toBe('phosphor');
    expect(s.name).toBe('Phosphor');
    expect(s.params).toBe(PHOSPHOR_PARAMS);
  });

  it('update/resize/dispose are safe no-ops before init (no GPU touched)', () => {
    const s = makeScene();
    // No init() ⇒ scene is not ready ⇒ update must not touch the renderer.
    expect(() => s.update(frame(), {}, 0.016)).not.toThrow();
    expect(() => s.update(frame({ silent: true, reducedMotion: true }), { decay: 0.9 }, 0.016)).not.toThrow();
    expect(() => s.resize({ w: 100, h: 100, dpr: 2 })).not.toThrow();
    expect(() => s.dispose()).not.toThrow();
  });

  it('dispose is idempotent', () => {
    const s = makeScene();
    expect(() => {
      s.dispose();
      s.dispose();
    }).not.toThrow();
  });
});
