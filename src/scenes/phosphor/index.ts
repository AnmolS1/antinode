/**
 * Phosphor scene — public surface.
 *
 * `SceneModule` carries only `params`, so the preset set and default modulation
 * routes ride alongside the factory as named exports (the seam T07's param /
 * preset system wires up at registration).
 */
export { createPhosphorScene } from './scene';
export {
  PHOSPHOR_ACCENT,
  PHOSPHOR_PARAMS,
  PHOSPHOR_PRESETS,
  PHOSPHOR_MOD_ROUTES,
  validatePreset,
} from './presets';
export type { ModRoute, PhosphorPreset } from './presets';
