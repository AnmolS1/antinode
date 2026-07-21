import { describe, expect, it } from 'vitest';

import { mulberry32 } from '../../fixtures/gen';
import {
  DEFAULT_RIPPLE_CONFIG,
  RipplePool,
} from '../../../src/scenes/standing-wave/ripples';

describe('RipplePool — lifecycle', () => {
  it('spawns, then decays to nothing over time (never negative, never NaN)', () => {
    const pool = new RipplePool({ ...DEFAULT_RIPPLE_CONFIG, capacity: 4 });
    pool.spawn(0, 0, 1);
    expect(pool.activeCount()).toBe(1);

    for (let i = 0; i < 500; i += 1) pool.advance(1 / 60);
    expect(pool.activeCount()).toBe(0);
    for (const r of pool.ripples) {
      expect(r.strength).toBe(0);
      expect(Number.isFinite(r.age)).toBe(true);
    }
  });

  it('reuses the weakest slot instead of allocating past capacity', () => {
    const pool = new RipplePool({ ...DEFAULT_RIPPLE_CONFIG, capacity: 3 });
    for (let i = 0; i < 20; i += 1) {
      pool.spawn(i, 0, 1);
      pool.advance(0.01);
    }
    expect(pool.ripples.length).toBe(3);
    expect(pool.activeCount()).toBeLessThanOrEqual(3);
  });

  it('ignores non-finite or non-positive spawns', () => {
    const pool = new RipplePool();
    pool.spawn(Number.NaN, 0, 1);
    pool.spawn(0, Number.POSITIVE_INFINITY, 1);
    pool.spawn(0, 0, 0);
    pool.spawn(0, 0, -5);
    expect(pool.activeCount()).toBe(0);
  });

  it('reset frees every slot', () => {
    const pool = new RipplePool();
    pool.spawn(1, 2, 1);
    pool.spawn(3, 4, 1);
    pool.reset();
    expect(pool.activeCount()).toBe(0);
  });
});

describe('RipplePool — field is finite and bounded under a feature stream', () => {
  it('heightAt stays finite and within the strength-sum bound across a random onset stream', () => {
    const pool = new RipplePool({ ...DEFAULT_RIPPLE_CONFIG, capacity: 6 });
    const rand = mulberry32(42);
    const gain = 2;

    let maxAbs = 0;
    for (let frame = 0; frame < 3000; frame += 1) {
      // Emulate a flashGuard-limited onset stream: occasional strong spawns.
      if (rand() < 0.05) {
        const ox = (rand() * 2 - 1) * 10;
        const oz = (rand() * 2 - 1) * 10;
        pool.spawn(ox, oz, 0.5 + rand());
      }
      pool.advance(1 / 60);

      // Sum of live strengths bounds |heightAt| (ring·window·falloff each ≤ 1).
      let strengthSum = 0;
      for (const r of pool.ripples) strengthSum += Math.max(0, r.strength);
      const bound = gain * strengthSum + 1e-6;

      for (const [x, z] of [[0, 0], [5, -3], [-8, 8], [2.5, 1.5]] as const) {
        const h = pool.heightAt(x, z, gain);
        expect(Number.isFinite(h)).toBe(true);
        expect(Math.abs(h)).toBeLessThanOrEqual(bound);
        maxAbs = Math.max(maxAbs, Math.abs(h));
      }
    }
    // Sanity: the field actually did something.
    expect(maxAbs).toBeGreaterThan(0);
  });

  it('advance tolerates zero/negative/NaN dt without diverging', () => {
    const pool = new RipplePool();
    pool.spawn(0, 0, 1);
    pool.advance(0);
    pool.advance(-1);
    pool.advance(Number.NaN);
    const h = pool.heightAt(0.5, 0.5, 1);
    expect(Number.isFinite(h)).toBe(true);
    expect(pool.activeCount()).toBe(1); // no time passed → still alive
  });
});
