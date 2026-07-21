import { describe, expect, it } from 'vitest';

import {
  PHOSPHOR_MOD_ROUTES,
  PHOSPHOR_PARAMS,
  PHOSPHOR_PRESETS,
  validatePreset,
} from '../../../src/scenes/phosphor/presets';

describe('PHOSPHOR_PARAMS', () => {
  it('declares the minimum T09b param set with unique keys', () => {
    const keys = PHOSPHOR_PARAMS.map((p) => p.key);
    for (const required of ['decay', 'warp', 'trace', 'complexity', 'shimmer', 'paletteFollow']) {
      expect(keys).toContain(required);
    }
    expect(new Set(keys).size).toBe(keys.length); // no dupes
  });

  it('every numeric default sits inside its declared range', () => {
    for (const p of PHOSPHOR_PARAMS) {
      if (p.type === 'number') {
        expect(p.default).toBeGreaterThanOrEqual(p.min);
        expect(p.default).toBeLessThanOrEqual(p.max);
      }
    }
  });

  it('complexity is a 1–3 integer control', () => {
    const c = PHOSPHOR_PARAMS.find((p) => p.key === 'complexity');
    expect(c?.type).toBe('number');
    if (c?.type === 'number') {
      expect(c.min).toBe(1);
      expect(c.max).toBe(3);
      expect(c.step).toBe(1);
    }
  });
});

describe('PHOSPHOR_PRESETS', () => {
  it('provides at least three built-in presets', () => {
    expect(Object.keys(PHOSPHOR_PRESETS).length).toBeGreaterThanOrEqual(3);
  });

  it('every built-in preset validates against the schema', () => {
    for (const [name, preset] of Object.entries(PHOSPHOR_PRESETS)) {
      expect(validatePreset(preset), name).toBe(true);
    }
  });
});

describe('validatePreset', () => {
  const valid = PHOSPHOR_PRESETS['Oscilloscope']!;

  it('accepts a complete, in-range preset', () => {
    expect(validatePreset(valid)).toBe(true);
  });

  it('rejects an out-of-range number', () => {
    expect(validatePreset({ ...valid, decay: 2 })).toBe(false);
    expect(validatePreset({ ...valid, decay: -1 })).toBe(false);
  });

  it('rejects a wrong type', () => {
    expect(validatePreset({ ...valid, paletteFollow: 'yes' })).toBe(false);
    expect(validatePreset({ ...valid, decay: '0.9' })).toBe(false);
  });

  it('rejects a NaN number', () => {
    expect(validatePreset({ ...valid, warp: NaN })).toBe(false);
  });

  it('rejects a malformed accent colour', () => {
    expect(validatePreset({ ...valid, accent: 'green' })).toBe(false);
    expect(validatePreset({ ...valid, accent: '#GGG' })).toBe(false);
  });

  it('rejects a missing key', () => {
    const { decay: _drop, ...missing } = valid;
    void _drop;
    expect(validatePreset(missing)).toBe(false);
  });

  it('rejects a stray unknown key', () => {
    expect(validatePreset({ ...valid, bogus: 1 })).toBe(false);
  });
});

describe('PHOSPHOR_MOD_ROUTES', () => {
  it('routes only onto real params with sane depths', () => {
    const keys = new Set(PHOSPHOR_PARAMS.map((p) => p.key));
    for (const route of PHOSPHOR_MOD_ROUTES) {
      expect(keys.has(route.target), route.target).toBe(true);
      expect(Math.abs(route.amount)).toBeLessThanOrEqual(1);
    }
  });
});
