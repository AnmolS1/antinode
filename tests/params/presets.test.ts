import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ParamDef } from '../../src/contracts';
import {
  PRESET_VERSION,
  RANDOMIZE_SPAN_FRAC,
  decodePreset,
  decodePresetFromHash,
  deleteUserPreset,
  encodePreset,
  lerpParamValues,
  listUserPresets,
  migrateAndValidate,
  morphDurationMs,
  presetToHash,
  randomize,
  renameUserPreset,
  saveUserPreset,
  type Preset,
} from '../../src/ui/params/presets';

const PRESET: Preset = {
  sceneId: 'dev-spectrum',
  paramValues: { gain: 2.5, spin: 0.4, wire: true, mode: 'b' },
  modRoutes: {
    gain: [{ source: 'bass', amount: 0.6 }],
    spin: [{ source: 'beatPhase', amount: 0.4, shape: 'sine', lagMs: 120 }],
  },
  version: PRESET_VERSION,
};

describe('preset URL roundtrip', () => {
  it('save → URL → load is identical', async () => {
    const payload = await encodePreset(PRESET);
    expect(payload).not.toContain('=');
    expect(payload).not.toMatch(/[+/]/); // base64url alphabet only
    const decoded = await decodePreset(payload);
    expect(decoded).toEqual(PRESET);
  });

  it('roundtrips through a full #p=… hash', async () => {
    const hash = await presetToHash(PRESET);
    expect(hash.startsWith('#p=')).toBe(true);
    const decoded = await decodePresetFromHash(hash);
    expect(decoded).toEqual(PRESET);
  });

  it('finds p= among other hash params', async () => {
    const payload = await encodePreset(PRESET);
    const decoded = await decodePresetFromHash(`#scene=x&p=${payload}&t=1`);
    expect(decoded?.sceneId).toBe('dev-spectrum');
  });
});

describe('malformed / untrusted hash rejection', () => {
  it('returns null for garbage base64url', async () => {
    expect(await decodePreset('!!!not-valid!!!')).toBeNull();
    expect(await decodePreset('')).toBeNull();
  });

  it('returns null for valid base64 that is not deflate', async () => {
    expect(await decodePreset('aGVsbG8')).toBeNull(); // "hello", not a deflate stream
  });

  it('returns null when p= is absent', async () => {
    expect(await decodePresetFromHash('#nothing=here')).toBeNull();
  });

  it('rejects structurally-invalid presets (hard validation)', () => {
    expect(migrateAndValidate({ version: 2 })).toBeNull(); // no sceneId
    expect(migrateAndValidate({ sceneId: '', paramValues: {}, version: 2 })).toBeNull();
    expect(migrateAndValidate({ sceneId: 'x', paramValues: { a: {} }, version: 2 })).toBeNull(); // non-primitive
    expect(
      migrateAndValidate({ sceneId: 'x', paramValues: {}, modRoutes: { gain: [{ source: 'nope', amount: 0 }] }, version: 2 }),
    ).toBeNull(); // bad source
    expect(
      migrateAndValidate({ sceneId: 'x', paramValues: {}, modRoutes: { gain: [{ source: 'bass', amount: 'loud' }] }, version: 2 }),
    ).toBeNull(); // bad amount
  });

  it('never trusts a newer schema version than we know', () => {
    expect(migrateAndValidate({ sceneId: 'x', paramValues: {}, version: PRESET_VERSION + 1 })).toBeNull();
  });

  it('clamps out-of-range amounts during validation', () => {
    const p = migrateAndValidate({
      sceneId: 'x',
      paramValues: {},
      modRoutes: { gain: [{ source: 'bass', amount: 9 }] },
      version: 2,
    });
    expect(p?.modRoutes['gain']?.[0]?.amount).toBe(1);
  });
});

describe('migration v1 → v2', () => {
  it('lifts flat v1 `routes` into keyed `modRoutes`', () => {
    const v1 = {
      version: 1,
      sceneId: 'dev-spectrum',
      paramValues: { gain: 2 },
      routes: [
        { param: 'gain', source: 'bass', amount: 0.5 },
        { param: 'gain', source: 'rms', amount: -0.2 },
        { param: 'spin', source: 'flux', amount: 0.3 },
      ],
    };
    const migrated = migrateAndValidate(v1);
    expect(migrated?.version).toBe(PRESET_VERSION);
    expect(migrated?.modRoutes['gain']).toHaveLength(2);
    expect(migrated?.modRoutes['spin']).toHaveLength(1);
  });

  it('treats a version-less blob as v0 and still migrates', () => {
    const migrated = migrateAndValidate({ sceneId: 'x', paramValues: { a: 1 }, routes: [] });
    expect(migrated).toEqual({ sceneId: 'x', paramValues: { a: 1 }, modRoutes: {}, version: PRESET_VERSION });
  });
});

const DEFS: ParamDef[] = [
  { type: 'number', key: 'gain', label: 'Gain', min: 0, max: 4, step: 0.1, default: 2, modulatable: true },
  { type: 'number', key: 'spin', label: 'Spin', min: 0, max: 2, default: 0.3, modulatable: true },
  { type: 'color', key: 'tint', label: 'Tint', default: '#4ade80' },
  { type: 'select', key: 'mode', label: 'Mode', options: ['a', 'b', 'c'], default: 'a' },
  { type: 'boolean', key: 'wire', label: 'Wire', default: true },
];

describe('randomize (R)', () => {
  it('jitters numbers within a safe fraction of range and never flips mode/color/boolean', () => {
    const current = { gain: 2, spin: 1, tint: '#123456', mode: 'b', wire: false };
    // Extreme rng values: force max jitter both directions across many draws.
    for (const r of [0, 0.5, 1]) {
      const next = randomize(DEFS, current, () => r);
      // numeric params stay within range, and within ±frac*span of the base
      expect(next['gain']).toBeGreaterThanOrEqual(0);
      expect(next['gain']).toBeLessThanOrEqual(4);
      expect(Math.abs((next['gain'] as number) - 2)).toBeLessThanOrEqual(4 * RANDOMIZE_SPAN_FRAC + 1e-9);
      expect(next['spin']).toBeGreaterThanOrEqual(0);
      expect(next['spin']).toBeLessThanOrEqual(2);
      // non-numerics untouched
      expect(next['tint']).toBe('#123456');
      expect(next['mode']).toBe('b');
      expect(next['wire']).toBe(false);
    }
  });

  it('respects step quantization', () => {
    const next = randomize(DEFS, { gain: 2 }, () => 0.83);
    const g = next['gain'] as number;
    expect(Math.round(g * 10) / 10).toBeCloseTo(g); // multiple of 0.1
  });
});

describe('morph helpers', () => {
  it('lerps numbers and switches non-numerics at the midpoint', () => {
    const from = { gain: 0, mode: 'a', wire: false };
    const to = { gain: 4, mode: 'c', wire: true };
    const mid0 = lerpParamValues(DEFS, from, to, 0.4);
    expect(mid0['gain']).toBeCloseTo(1.6, 5);
    expect(mid0['mode']).toBe('a'); // < 0.5 keeps source
    const mid1 = lerpParamValues(DEFS, from, to, 0.6);
    expect(mid1['mode']).toBe('c'); // >= 0.5 switches
    expect(mid1['wire']).toBe(true);
  });

  it('picks 4 beats when tempo is confident, else 2s', () => {
    expect(morphDurationMs(120, 0.9)).toBeCloseTo((60000 / 120) * 4); // 2000ms
    expect(morphDurationMs(60, 0.9)).toBeCloseTo(4000);
    expect(morphDurationMs(null, 0.9)).toBe(2000);
    expect(morphDurationMs(120, 0.2)).toBe(2000); // low confidence
  });
});

describe('user presets (localStorage)', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('saves, lists, renames, and deletes by scene', () => {
    saveUserPreset('warm', PRESET);
    expect(listUserPresets('dev-spectrum').map((p) => p.name)).toEqual(['warm']);
    // overwrite by same name
    saveUserPreset('warm', { ...PRESET, paramValues: { gain: 1 } });
    expect(listUserPresets('dev-spectrum')).toHaveLength(1);
    expect(renameUserPreset('dev-spectrum', 'warm', 'cool')).toBe(true);
    expect(renameUserPreset('dev-spectrum', 'missing', 'x')).toBe(false);
    expect(listUserPresets('dev-spectrum')[0]?.name).toBe('cool');
    deleteUserPreset('dev-spectrum', 'cool');
    expect(listUserPresets('dev-spectrum')).toHaveLength(0);
  });
});
