import { describe, expect, it } from 'vitest';

import {
  STANDING_WAVE_MOD_ROUTES,
  STANDING_WAVE_PARAMS,
  STANDING_WAVE_PRESETS,
  validatePreset,
  type ScenePreset,
} from '../../../src/scenes/standing-wave/params';

describe('Standing Wave params & presets', () => {
  it('exposes the spec-minimum param set', () => {
    const keys = new Set(STANDING_WAVE_PARAMS.map((p) => p.key));
    for (const required of ['amplitude', 'wavelength', 'density', 'rippleGain', 'beatLock', 'paletteFollow', 'glow']) {
      expect(keys.has(required)).toBe(true);
    }
  });

  it('does NOT declare `quality` (injected by the governor at runtime)', () => {
    expect(STANDING_WAVE_PARAMS.some((p) => p.key === 'quality')).toBe(false);
  });

  it('every param default is itself in range / of the right type', () => {
    for (const p of STANDING_WAVE_PARAMS) {
      if (p.type === 'number') {
        expect(p.default).toBeGreaterThanOrEqual(p.min);
        expect(p.default).toBeLessThanOrEqual(p.max);
      } else if (p.type === 'color') {
        expect(p.default).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it('ships exactly three built-in presets, all valid', () => {
    expect(STANDING_WAVE_PRESETS.length).toBe(3);
    for (const preset of STANDING_WAVE_PRESETS) {
      expect(validatePreset(preset)).toEqual([]);
    }
  });

  it('preset ids are unique', () => {
    const ids = STANDING_WAVE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('validatePreset flags out-of-range, wrong-type, unknown, and missing keys', () => {
    const bad: ScenePreset = {
      id: 'bad',
      name: 'Bad',
      values: {
        amplitude: 99, // out of range
        wavelength: 3,
        density: 1,
        rippleGain: 1,
        glow: 1,
        beatLock: 'yes' as unknown as boolean, // wrong type
        paletteFollow: false,
        paletteColor: '#4ade80',
        nope: 1, // unknown key
      },
    };
    const issues = validatePreset(bad);
    const byKey = new Map(issues.map((i) => [i.key, i.reason]));
    expect(byKey.has('amplitude')).toBe(true);
    expect(byKey.has('beatLock')).toBe(true);
    expect(byKey.has('nope')).toBe(true);
  });

  it('flags a missing param key', () => {
    const missing: ScenePreset = { id: 'm', name: 'M', values: { amplitude: 0.5 } };
    const issues = validatePreset(missing);
    expect(issues.some((i) => i.key === 'wavelength' && /missing/.test(i.reason))).toBe(true);
  });
});

describe('default modulation routes', () => {
  it('every route targets a modulatable param', () => {
    const modulatable = new Set(
      STANDING_WAVE_PARAMS.filter((p) => p.type === 'number' && p.modulatable).map((p) => p.key),
    );
    expect(STANDING_WAVE_MOD_ROUTES.length).toBeGreaterThan(0);
    for (const route of STANDING_WAVE_MOD_ROUTES) {
      expect(modulatable.has(route.target)).toBe(true);
      expect(Math.abs(route.amount)).toBeLessThanOrEqual(1);
    }
  });
});
