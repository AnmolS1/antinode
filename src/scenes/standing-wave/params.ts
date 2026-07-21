/**
 * Standing Wave — param schema, built-in presets, and default modulation routes.
 *
 * Pure data + a validator so preset/param integrity is unit-testable without a
 * renderer. `quality` is intentionally NOT a param here: RenderCore injects it
 * into the live param bag from the governor each frame (see RenderCore.tick), and
 * the scene reads it defensively.
 */

import type { ParamDef } from '../../contracts';

/** Dark-theme phosphor accent (oscilloscope CRT green) — see 02-design. */
export const PHOSPHOR_HEX = '#4ade80';

/**
 * The parameters Standing Wave exposes to the UI (T07) and preset system.
 * Minimum set from the spec plus `paletteColor` (the tint target palette-follow
 * ramps toward, since the frozen contract carries no palette into `update`).
 */
export const STANDING_WAVE_PARAMS: readonly ParamDef[] = [
  { type: 'number', key: 'amplitude', label: 'Amplitude', min: 0, max: 2, step: 0.01, default: 0.6, modulatable: true },
  { type: 'number', key: 'wavelength', label: 'Wavelength', min: 0.5, max: 8, step: 0.05, default: 3, modulatable: true },
  { type: 'number', key: 'density', label: 'Particle Density', min: 0.1, max: 1, step: 0.01, default: 1, modulatable: false },
  { type: 'number', key: 'rippleGain', label: 'Ripple Gain', min: 0, max: 3, step: 0.01, default: 1, modulatable: true },
  { type: 'number', key: 'glow', label: 'Glow', min: 0, max: 2, step: 0.01, default: 1, modulatable: true },
  { type: 'boolean', key: 'beatLock', label: 'Beat Lock', default: true },
  { type: 'boolean', key: 'paletteFollow', label: 'Palette Follow', default: false },
  { type: 'color', key: 'paletteColor', label: 'Palette Tint', default: PHOSPHOR_HEX },
];

/** A preset is a full set of values keyed by {@link ParamDef.key}. */
export type PresetValues = Record<string, number | boolean | string>;

/** One named preset. */
export interface ScenePreset {
  id: string;
  name: string;
  values: PresetValues;
}

/**
 * Three built-in presets (spec: "3 built-in presets each"). Every key resolves
 * to a param and every value sits inside that param's domain — enforced by
 * {@link validatePreset} and asserted in the tests.
 */
export const STANDING_WAVE_PRESETS: readonly ScenePreset[] = [
  {
    id: 'standing',
    name: 'Standing',
    values: {
      amplitude: 0.6,
      wavelength: 3,
      density: 1,
      rippleGain: 1,
      glow: 1,
      beatLock: true,
      paletteFollow: false,
      paletteColor: PHOSPHOR_HEX,
    },
  },
  {
    id: 'ripple-tide',
    name: 'Ripple Tide',
    values: {
      amplitude: 0.9,
      wavelength: 5,
      density: 1,
      rippleGain: 2.4,
      glow: 1.3,
      beatLock: false,
      paletteFollow: false,
      paletteColor: PHOSPHOR_HEX,
    },
  },
  {
    id: 'calm-field',
    name: 'Calm Field',
    values: {
      amplitude: 0.3,
      wavelength: 6,
      density: 0.7,
      rippleGain: 0.5,
      glow: 0.8,
      beatLock: true,
      paletteFollow: true,
      paletteColor: '#7dd3fc',
    },
  },
];

/**
 * Default modulation routes (spec: "declared in registration metadata"). The
 * frozen `SceneModule` contract has no field for these, so they are exported for
 * the orchestrator / T07 modulation matrix to pick up at the wave gate.
 */
export interface ModRoute {
  /** Feature source driving the param. */
  source: 'bass' | 'mid' | 'high' | 'loudNorm' | 'flux' | 'beatPhase';
  /** Target param key (must be a modulatable {@link ParamDef}). */
  target: string;
  /** Route depth −1..1. */
  amount: number;
}

export const STANDING_WAVE_MOD_ROUTES: readonly ModRoute[] = [
  { source: 'bass', target: 'amplitude', amount: 0.6 },
  { source: 'mid', target: 'wavelength', amount: 0.3 },
  { source: 'flux', target: 'rippleGain', amount: 0.4 },
];

/** A validation problem found in a preset. */
export interface PresetIssue {
  key: string;
  reason: string;
}

/**
 * Validate `preset` against `params`: every key must name a param, hold the right
 * type, and (for numbers) fall within `[min, max]`; every param must be present.
 * Returns the list of problems — empty means valid.
 */
export function validatePreset(
  preset: ScenePreset,
  params: readonly ParamDef[] = STANDING_WAVE_PARAMS,
): PresetIssue[] {
  const issues: PresetIssue[] = [];
  const byKey = new Map(params.map((p) => [p.key, p]));

  for (const [key, value] of Object.entries(preset.values)) {
    const def = byKey.get(key);
    if (!def) {
      issues.push({ key, reason: 'unknown param key' });
      continue;
    }
    issues.push(...checkValue(def, value));
  }

  for (const def of params) {
    if (!(def.key in preset.values)) {
      issues.push({ key: def.key, reason: 'missing from preset' });
    }
  }
  return issues;
}

function checkValue(def: ParamDef, value: unknown): PresetIssue[] {
  switch (def.type) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return [{ key: def.key, reason: 'expected finite number' }];
      }
      if (value < def.min || value > def.max) {
        return [{ key: def.key, reason: `out of range [${def.min}, ${def.max}]` }];
      }
      return [];
    }
    case 'boolean':
      return typeof value === 'boolean' ? [] : [{ key: def.key, reason: 'expected boolean' }];
    case 'color':
      return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
        ? []
        : [{ key: def.key, reason: 'expected #rrggbb color' }];
    case 'select':
      return typeof value === 'string' && def.options.includes(value)
        ? []
        : [{ key: def.key, reason: 'not an allowed option' }];
  }
}
