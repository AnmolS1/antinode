import { PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';

import type { FrameFeatures, SceneContext } from '../../../src/contracts';
import { FeatureUniforms, SPECTRUM_BINS } from '../../../src/render/bridge/FeatureUniforms';
import { createHeritageScene } from '../../../src/scenes/heritage';

function frame(overrides: Partial<FrameFeatures> = {}): FrameFeatures {
  return {
    t: 0,
    rms: 0,
    loudNorm: 0.4,
    bands: { bass: 0, lowMid: 0, mid: 0, high: 0 },
    spectrum: new Float32Array(SPECTRUM_BINS).fill(0.3),
    flux: 0,
    onset: false,
    beat: { bpm: 120, phase: 0.25, confidence: 0.5 },
    silent: false,
    reducedMotion: false,
    ...overrides,
  };
}

describe('createHeritageScene (SceneModule contract)', () => {
  it('exposes id "heritage" and the documented param schema', () => {
    const scene = createHeritageScene(new FeatureUniforms());
    expect(scene.id).toBe('heritage');
    const keys = scene.params.map((p) => p.key);
    expect(keys).toEqual(['mode', 'displacement', 'rotation', 'bloomSend', 'spin', 'intensity']);
    const mode = scene.params.find((p) => p.key === 'mode');
    expect(mode).toMatchObject({ type: 'select', default: 'color' });
    expect((mode as { options: string[] }).options).toEqual(['color', 'mono']);
    const spin = scene.params.find((p) => p.key === 'spin');
    expect((spin as { options: string[] }).options).toEqual(['free', 'beat-locked']);
  });

  it('update() and dispose() are safe before init (no GPU resources yet)', () => {
    const scene = createHeritageScene(new FeatureUniforms());
    expect(() => scene.update(frame(), { rotation: 1 }, 0.016)).not.toThrow();
    expect(() => scene.resize({ w: 800, h: 600, dpr: 1 })).not.toThrow();
    expect(() => scene.dispose()).not.toThrow();
  });

  // Exercises the real init/update/dispose path: geometry + detectIndex, the TSL
  // graph build, material construction, the per-frame scatter loop, and cleanup.
  // No GPU is touched (nodes compile only at render, which we never do). The fake
  // renderer's `domElement` is undefined so the OrbitControls guard skips it.
  it('init/update/dispose wires and tears down the scene graph', async () => {
    const scene = createHeritageScene(new FeatureUniforms());
    const three = new Scene();
    const ctx: SceneContext = {
      renderer: { domElement: undefined },
      scene: three,
      camera: new PerspectiveCamera(60, 1, 0.1, 100),
      isWebGPU: true,
      size: { w: 1280, h: 720, dpr: 1 },
    };

    await scene.init(ctx);
    // init adds a single Group holding the outer wireframe + inner shell.
    expect(three.children.length).toBe(1);
    const cam = ctx.camera as PerspectiveCamera;
    // Camera reconfigured to the 2023 framing.
    expect(cam.fov).toBe(45);
    expect(cam.far).toBe(10000);
    expect(cam.position.toArray()).toEqual([20, 200, -80]);

    // A few update frames across the interesting branches.
    expect(() => {
      scene.update(frame(), { displacement: 1, rotation: 1, mode: 'color', spin: 'free' }, 0.016);
      scene.update(frame({ reducedMotion: true }), { mode: 'mono' }, 0.016);
      scene.update(frame(), { spin: 'beat-locked', rotation: 2 }, 0.016);
    }).not.toThrow();

    scene.dispose();
    expect(three.children.length).toBe(0);
  });
});
