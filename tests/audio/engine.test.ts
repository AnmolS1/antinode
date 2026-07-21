import { describe, it, expect, vi, afterEach } from 'vitest';
import { AudioEngine } from '../../src/audio/engine';
import type { FrameFeatures } from '../../src/contracts';

function mockContext(): AudioContext {
  return {
    state: 'suspended' as AudioContextState,
    sampleRate: 44_100,
    currentTime: 1.5,
    destination: {},
    createAnalyser: () => ({
      fftSize: 2048,
      smoothingTimeConstant: 0,
      getFloatTimeDomainData: (buf: Float32Array) => buf.fill(0),
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
    createOscillator: () => ({
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
    }),
    createGain: () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }),
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  } as unknown as AudioContext;
}

// Disable the rAF loop so tests pump frames manually and deterministically.
const realRaf = globalThis.requestAnimationFrame;
afterEach(() => {
  globalThis.requestAnimationFrame = realRaf;
});

describe('AudioEngine', () => {
  it('reports the full capability ladder', () => {
    const engine = new AudioEngine({ contextFactory: mockContext });
    const caps = engine.capabilities();
    expect(caps.map((c) => c.kind)).toEqual(['file', 'display', 'input', 'procedural']);
  });

  it('returns a valid default frame before any source', () => {
    const engine = new AudioEngine({ contextFactory: mockContext });
    const f = engine.latest();
    expect(f.spectrum.length).toBe(64);
    expect(f.beat.bpm).toBeNull();
    expect(f.silent).toBe(false);
  });

  it('subscribes and unsubscribes frame listeners', () => {
    globalThis.requestAnimationFrame = (() => 0) as typeof requestAnimationFrame;
    const engine = new AudioEngine({ contextFactory: mockContext });
    const seen: FrameFeatures[] = [];
    const off = engine.onFrame((f) => seen.push(f));
    engine.step();
    expect(seen).toHaveLength(1);
    off();
    engine.step();
    expect(seen).toHaveLength(1);
  });

  it('synthesizes non-silent procedural frames', async () => {
    globalThis.requestAnimationFrame = (() => 0) as typeof requestAnimationFrame;
    const engine = new AudioEngine({ contextFactory: mockContext });
    await engine.selectSource('procedural');
    const f = engine.step();
    expect(f.silent).toBe(false);
    expect(f.beat.bpm).toBeNull();
    // Procedural motion is non-trivial.
    const anyBand = f.bands.bass + f.bands.lowMid + f.bands.mid + f.bands.high;
    expect(anyBand).toBeGreaterThan(0);
    await engine.dispose();
  });

  it('delegates scene control to the injected bridge', () => {
    const setScene = vi.fn();
    const scenes = vi.fn(() => [{ id: 'a', name: 'A' }]);
    const engine = new AudioEngine({ contextFactory: mockContext, sceneBridge: { setScene, scenes } });
    engine.setScene('a');
    expect(setScene).toHaveBeenCalledWith('a');
    expect(engine.scenes()).toEqual([{ id: 'a', name: 'A' }]);
  });
});
