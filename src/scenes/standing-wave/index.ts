/**
 * Standing Wave — the default scene ("the name made visible").
 *
 * A GPU point surface shaped as a literal standing wave: nodes pinned, antinodes
 * breathing with bass, onsets rippling outward from the nearest antinode peak.
 * Phosphor-on-black, depth-fogged, with a slow orbital drift that stills under
 * reduced motion.
 *
 * Factory pattern mirrors `render/dev/devSpectrumScene.ts`: the scene binds its
 * TSL graph to the render core's {@link FeatureUniforms} bridge, which is updated
 * once per frame *before* `update` runs (RenderCore.tick). All per-frame math is
 * the closed-form, unit-tested pure code in `./displacement` and `./ripples`; the
 * GPU node graph in `./field` mirrors it.
 *
 * @module scenes/standing-wave
 */

import { Color, Group, type Scene } from 'three';

import type { FrameFeatures, SceneContext, SceneModule } from '../../contracts';
import type { FeatureUniforms } from '../../render/bridge/FeatureUniforms';
import { SPECTRUM_BINS } from '../../render/bridge/FeatureUniforms';
import {
  clamp01,
  energyBrightness,
  motionGate,
  nearestAntinode,
  resolveTheta,
} from './displacement';
import { createStandingWaveField, WORLD_HALF_X, type StandingWaveField } from './field';
import { STANDING_WAVE_PARAMS } from './params';
import { DEFAULT_RIPPLE_CONFIG, RipplePool } from './ripples';

export {
  STANDING_WAVE_PARAMS,
  STANDING_WAVE_PRESETS,
  STANDING_WAVE_MOD_ROUTES,
  validatePreset,
} from './params';
export type { ScenePreset, PresetValues, ModRoute } from './params';

/** Stable scene id — the app default (declared in registration). */
export const STANDING_WAVE_ID = 'standing-wave';

/** Target particle budget per backend (spec: ~200k WebGPU / ~60k WebGL2). */
const COUNT_WEBGPU = 200_000;
const COUNT_WEBGL2 = 60_000;

/** Free-run temporal angular frequency (rad/s) when not beat-locked. */
const FREE_OMEGA = 1.6;
/** Confidence at/above which the wave locks to the beat. */
const CONFIDENCE_THRESHOLD = 0.6;
/** Orbital drift rate (rad/s), off under reduced motion. */
const DRIFT_SPEED = 0.12;
/** Palette-follow ramp time-constant (seconds) — subtle, ~6 s per 02-design. */
const PALETTE_TAU = 6;
/** Default phosphor accent (dark-theme CRT green). */
const PHOSPHOR = new Color(0x4ade80);

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

/**
 * Create the Standing Wave scene. Pass the render core's feature→uniform bridge
 * (`core.featureUniforms()`); it is the only T03 helper this scene needs at
 * registration — the displacement is closed-form, so no FeedbackHelper and no
 * compute pass (see `./field` for why).
 */
export function createStandingWaveScene(bridge: FeatureUniforms): SceneModule {
  let group: Group | null = null;
  let field: StandingWaveField | null = null;
  const pool = new RipplePool({ ...DEFAULT_RIPPLE_CONFIG });

  // Per-frame scene state (no allocation in update).
  let theta = 0;
  let kDrift = 0; // eased mid-driven wavelength morph
  const accent = PHOSPHOR.clone();
  const target = new Color();
  let dpr = 1;

  const spawnLocus = { x: 0, z: 0 };

  return {
    id: STANDING_WAVE_ID,
    name: 'Standing Wave',
    params: [...STANDING_WAVE_PARAMS],

    async init(ctx: SceneContext): Promise<void> {
      const scene = ctx.scene as Scene;
      dpr = ctx.size.dpr || 1;
      const count = ctx.isWebGPU ? COUNT_WEBGPU : COUNT_WEBGL2;

      const f = createStandingWaveField(bridge, count);
      field = f;
      f.u.pointSize.value = 2.5 * dpr;

      const g = new Group();
      // Tilt the XZ plane up toward the shared camera (RenderCore owns it at z≈5)
      // and scale to frame the surface; the group — not the camera — carries the
      // orbital drift, so we never fight the core's projection/aspect handling.
      g.rotation.x = -Math.PI * 0.28;
      g.scale.setScalar(0.42);
      g.position.y = -0.3;
      g.add(f.points);
      scene.add(g);
      group = g;
    },

    update(f: FrameFeatures, values: Record<string, unknown>, dt: number): void {
      const fld = field;
      if (!fld || !group) return;

      const reduced = f.reducedMotion;
      const amplitude = num(values['amplitude'], 0.6);
      const wavelength = num(values['wavelength'], 3);
      const density = clamp01(num(values['density'], 1));
      const rippleGain = num(values['rippleGain'], 1);
      const glow = num(values['glow'], 1);
      const beatLock = bool(values['beatLock'], true);
      const paletteFollow = bool(values['paletteFollow'], false);
      const paletteColor = str(values['paletteColor'], '#4ade80');
      const quality = clamp01(num(values['quality'], 1)); // injected by the governor

      // Mid steers a slow wavelength morph (k-drift); ease toward the target —
      // but only in the normal program (the ease is frozen under reduced motion
      // so node positions can't shift).
      if (!reduced) {
        const driftTarget = (clamp01(f.bands.mid) - 0.5) * 2; // −1..1
        kDrift += (driftTarget - kDrift) * Math.min(1, dt * 0.5);
      }

      // The low-motion gate: silences every audio-driven geometric motion (bass
      // breathing, wavelength morph, ripples) under reduced motion — energy then
      // reads as brightness, not movement (02-design, non-negotiable).
      const gate = motionGate(reduced, wavelength, kDrift);
      const effWavelength = gate.effWavelength;

      // Temporal phase: locked to the beat when confident, else free-running;
      // frozen entirely under reduced motion.
      theta = resolveTheta(theta, {
        freeOmega: FREE_OMEGA,
        dt,
        bpm: f.beat.bpm,
        confidence: f.beat.confidence,
        beatPhase: f.beat.phase,
        beatLock,
        confidenceThreshold: CONFIDENCE_THRESHOLD,
        reducedMotion: reduced,
      });

      // Onsets emit a ripple from the nearest antinode to the spectral centroid
      // (the visual thesis). f.onset is already flashGuard-limited upstream. No
      // new ripples under reduced motion (in-flight ones decay out via advance).
      pool.advance(dt);
      if (f.onset && !reduced) {
        spectralLocus(f.spectrum, spawnLocus);
        const originX = nearestAntinode(spawnLocus.x, effWavelength, -WORLD_HALF_X, WORLD_HALF_X);
        pool.spawn(originX, spawnLocus.z, 0.5 + clamp01(f.flux));
      }

      // Palette-follow: ramp the accent toward the track tint (or back to
      // phosphor) over ~6 s — subtle, never replacing the phosphor identity.
      target.set(paletteFollow ? safeColor(paletteColor) : 0x4ade80);
      const lerp = 1 - Math.exp(-dt / PALETTE_TAU);
      accent.lerp(target, lerp);
      (fld.u.accent.value as Color).copy(accent);

      // Push scalar uniforms.
      fld.u.amplitude.value = amplitude;
      fld.u.wavelength.value = effWavelength;
      fld.u.theta.value = theta;
      fld.u.rippleGain.value = rippleGain * gate.rippleGate;
      fld.u.bassGate.value = gate.bassGate;
      fld.u.glow.value = glow;
      fld.u.brightness.value = energyBrightness(reduced, f.loudNorm, f.bands.high);
      fld.u.densityQuality.value = density * quality;
      fld.syncRipples(pool);

      // Orbital drift lives on the group; off under reduced motion.
      if (!reduced) group.rotation.y += dt * DRIFT_SPEED;
    },

    resize(size: SceneContext['size']): void {
      dpr = size.dpr || 1;
      if (field) field.u.pointSize.value = 2.5 * dpr;
    },

    dispose(): void {
      if (group) {
        group.parent?.remove(group);
        group = null;
      }
      if (field) {
        field.dispose();
        field = null;
      }
      pool.reset();
    },
  };
}

/** #rrggbb → number; falls back to phosphor on anything malformed. */
function safeColor(hex: string): number {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? parseInt(hex.slice(1), 16) : 0x4ade80;
}

/**
 * Spectral-centroid emission point: map the energy-weighted mean bin to an x on
 * the wave axis (z stays on the centre line). Pure-ish helper kept local; the
 * antinode snap it feeds is unit-tested in `./displacement`.
 */
function spectralLocus(spectrum: Float32Array, out: { x: number; z: number }): void {
  const n = Math.min(SPECTRUM_BINS, spectrum.length);
  let weighted = 0;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const e = spectrum[i] ?? 0;
    weighted += e * i;
    total += e;
  }
  const centroid = total > 1e-6 ? weighted / total / Math.max(1, n - 1) : 0.5; // 0..1
  out.x = (centroid * 2 - 1) * WORLD_HALF_X;
  out.z = 0;
}
