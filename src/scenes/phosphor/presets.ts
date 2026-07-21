/**
 * Phosphor scene — parameter schema, built-in presets, and default mod routes.
 *
 * Split from the scene module so the schema/presets can be validated headlessly
 * and consumed by the params UI (T07) and preset system without pulling in
 * three/WebGPU. `SceneModule` carries only `params`; presets and mod routes ride
 * alongside as named exports (the seam T07 wires up).
 */
import type { ParamDef } from '../../contracts';

/** Phosphor's default accent — the dark-theme phosphor green (02-design). */
export const PHOSPHOR_ACCENT = '#4ADE80';

/**
 * The parameters Phosphor exposes. Minimum set per T09b: decay, warp amount,
 * trace brightness, trace complexity (1–3 oscillator pairs), shimmer, and
 * palette-follow — plus the accent colour the palette-follow ramp targets.
 */
export const PHOSPHOR_PARAMS: ParamDef[] = [
  { type: 'number', key: 'decay', label: 'Decay', min: 0.85, max: 0.995, step: 0.005, default: 0.96, modulatable: true },
  { type: 'number', key: 'warp', label: 'Warp', min: 0, max: 1, step: 0.01, default: 0.35, modulatable: true },
  { type: 'number', key: 'trace', label: 'Trace', min: 0, max: 2, step: 0.05, default: 0.9, modulatable: true },
  { type: 'number', key: 'complexity', label: 'Complexity', min: 1, max: 3, step: 1, default: 2 },
  { type: 'number', key: 'shimmer', label: 'Shimmer', min: 0, max: 1, step: 0.01, default: 0.3, modulatable: true },
  { type: 'boolean', key: 'paletteFollow', label: 'Palette follow', default: false },
  { type: 'color', key: 'accent', label: 'Accent', default: PHOSPHOR_ACCENT },
];

/** A concrete set of param values (as stored in a preset / the live param map). */
export type PhosphorPreset = Record<string, number | boolean | string>;

/**
 * Three built-in presets (T09b requires ≥3):
 * - **Idle Trace** — high persistence, almost no warp: a calm standing figure.
 * - **Oscilloscope** — the balanced default look.
 * - **Overdrive** — fast bleed, hard warp, three trace pairs, bright.
 */
export const PHOSPHOR_PRESETS: Record<string, PhosphorPreset> = {
  'Idle Trace': { decay: 0.99, warp: 0.1, trace: 0.6, complexity: 1, shimmer: 0.15, paletteFollow: false, accent: PHOSPHOR_ACCENT },
  Oscilloscope: { decay: 0.96, warp: 0.35, trace: 0.9, complexity: 2, shimmer: 0.3, paletteFollow: false, accent: PHOSPHOR_ACCENT },
  Overdrive: { decay: 0.9, warp: 0.8, trace: 1.4, complexity: 3, shimmer: 0.6, paletteFollow: true, accent: PHOSPHOR_ACCENT },
};

/**
 * Default modulation routes: which audio feature drives which param out of the
 * box (declared in registration metadata per T09). Feature keys match
 * `FrameFeatures` leaf paths; the modulation matrix (T07) clamps through the
 * engine flashGuard, so these are safe defaults, not raw strobes.
 */
export interface ModRoute {
  /** Source feature (FrameFeatures leaf path). */
  source: string;
  /** Target param key (must exist in {@link PHOSPHOR_PARAMS}). */
  target: string;
  /** Signed depth of the route, -1..1. */
  amount: number;
}

export const PHOSPHOR_MOD_ROUTES: ModRoute[] = [
  { source: 'bands.mid', target: 'warp', amount: 0.4 },
  { source: 'bands.high', target: 'shimmer', amount: 0.5 },
  { source: 'flux', target: 'trace', amount: 0.35 },
];

/** Look up the {@link ParamDef} for a key. */
function paramDef(key: string): ParamDef | undefined {
  return PHOSPHOR_PARAMS.find((p) => p.key === key);
}

/**
 * Validate a preset (or any param map) against {@link PHOSPHOR_PARAMS}: every
 * key must be known, typed correctly, and numbers must sit within their
 * declared range. Returns true iff the map is a legal, complete Phosphor preset.
 */
export function validatePreset(values: Record<string, unknown>): boolean {
  // Every declared param must be present exactly once and well-typed.
  for (const def of PHOSPHOR_PARAMS) {
    const v = values[def.key];
    if (v === undefined) return false;
    switch (def.type) {
      case 'number':
        if (typeof v !== 'number' || !Number.isFinite(v)) return false;
        if (v < def.min || v > def.max) return false;
        break;
      case 'boolean':
        if (typeof v !== 'boolean') return false;
        break;
      case 'color':
        if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) return false;
        break;
      case 'select':
        if (typeof v !== 'string' || !def.options.includes(v)) return false;
        break;
    }
  }
  // No stray keys the schema doesn't know about.
  for (const key of Object.keys(values)) {
    if (!paramDef(key)) return false;
  }
  return true;
}
