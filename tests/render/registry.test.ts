import { describe, expect, it, vi } from 'vitest';

import type { SceneContext, SceneModule } from '../../src/contracts';
import { SceneRegistry } from '../../src/render/scene/SceneRegistry';

function fakeContext(): SceneContext {
  return {
    renderer: {},
    scene: {},
    camera: {},
    isWebGPU: false,
    size: { w: 100, h: 100, dpr: 1 },
  };
}

function mockScene(id: string): SceneModule {
  return {
    id,
    name: id.toUpperCase(),
    params: [],
    init: vi.fn(async () => {}),
    update: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
  };
}

describe('SceneRegistry', () => {
  it('registers and lists scenes in order; rejects duplicate ids', () => {
    const r = new SceneRegistry();
    const a = mockScene('a');
    const b = mockScene('b');
    r.register(a);
    r.register(b);
    expect(r.list()).toEqual([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ]);
    expect(() => r.register(mockScene('a'))).toThrow(/duplicate/i);
  });

  it('initializes a scene exactly once on first activation', async () => {
    const r = new SceneRegistry();
    const a = mockScene('a');
    r.register(a);
    await r.activate('a', fakeContext);
    expect(a.init).toHaveBeenCalledTimes(1);
    expect(r.activeSceneId()).toBe('a');
    expect(r.isFading()).toBe(false); // no previous scene → no fade
  });

  it('activating the already-active scene is a no-op (no re-init)', async () => {
    const r = new SceneRegistry();
    const a = mockScene('a');
    r.register(a);
    await r.activate('a', fakeContext);
    await r.activate('a', fakeContext);
    expect(a.init).toHaveBeenCalledTimes(1);
  });

  it('throws when activating an unknown id', async () => {
    const r = new SceneRegistry();
    await expect(r.activate('nope', fakeContext)).rejects.toThrow(/unknown/i);
  });

  it('crossfades, then disposes AND dereferences the outgoing scene exactly once', async () => {
    const onSwapComplete = vi.fn();
    const r = new SceneRegistry({ fadeMs: 400, onSwapComplete });
    const a = mockScene('a');
    const b = mockScene('b');
    r.register(a);
    r.register(b);

    await r.activate('a', fakeContext);
    await r.activate('b', fakeContext);

    // Incoming initialized once; fade started with a as outgoing.
    expect(b.init).toHaveBeenCalledTimes(1);
    expect(r.isFading()).toBe(true);
    expect(r.outgoingScene()).toBe(a);
    expect(r.fadeAlpha()).toBeCloseTo(0, 5);
    expect(a.dispose).not.toHaveBeenCalled();

    // Halfway through the fade.
    r.advanceFade(200);
    expect(r.fadeAlpha()).toBeCloseTo(0.5, 5);
    expect(a.dispose).not.toHaveBeenCalled();

    // Complete the fade: outgoing disposed once, dereferenced, callback fired.
    r.advanceFade(250);
    expect(r.isFading()).toBe(false);
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(r.outgoingScene()).toBeNull();
    expect(r.fadeAlpha()).toBe(1);
    expect(onSwapComplete).toHaveBeenCalledTimes(1);

    // Further advancement does not re-dispose.
    r.advanceFade(1000);
    expect(a.dispose).toHaveBeenCalledTimes(1);
  });

  it('finishing a fade that is still in flight when a third scene activates', async () => {
    const r = new SceneRegistry({ fadeMs: 400 });
    const a = mockScene('a');
    const b = mockScene('b');
    const c = mockScene('c');
    [a, b, c].forEach((s) => r.register(s));

    await r.activate('a', fakeContext);
    await r.activate('b', fakeContext); // fade a→b begins
    await r.activate('c', fakeContext); // should finish a→b (dispose a) before b→c

    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(r.activeSceneId()).toBe('c');
    expect(r.outgoingScene()).toBe(b);
  });

  it('dispose() frees the active and any outgoing scene', async () => {
    const r = new SceneRegistry();
    const a = mockScene('a');
    const b = mockScene('b');
    r.register(a);
    r.register(b);
    await r.activate('a', fakeContext);
    await r.activate('b', fakeContext);
    r.dispose();
    expect(a.dispose).toHaveBeenCalledTimes(1);
    expect(b.dispose).toHaveBeenCalledTimes(1);
    expect(r.activeScene()).toBeNull();
  });
});
