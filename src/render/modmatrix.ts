/**
 * Modulation matrix — the "export a channel to any parameter" differentiator.
 *
 * This is the **render-side** half of T07 (the UI half lives in
 * `src/ui/params/**`). It owns the evaluation of modulation routes: a pure
 * {@link resolve} used for reasoning/tests, and a stateful, allocation-free
 * {@link ModMatrix} applicator that the frame loop calls once per frame to turn
 * `(base params, routes, features) → resolved params` clamped to each
 * {@link ParamDef} range.
 *
 * Deliberately free of any Three/render-internal import (contracts are
 * type-only) so it is safe to import from both the frame loop **and** the UI
 * preview meter.
 */
import type { FrameFeatures, ParamDef } from '../contracts';

/** A modulation source: an audio channel a route can wire into a parameter. */
export type ModSource =
  | 'bass'
  | 'lowMid'
  | 'mid'
  | 'high'
  | 'rms'
  | 'loudNorm'
  | 'flux'
  | 'onset'
  | 'beatPhase';

/** All modulation sources, in UI display order. */
export const MOD_SOURCES: readonly ModSource[] = [
  'bass',
  'lowMid',
  'mid',
  'high',
  'rms',
  'loudNorm',
  'flux',
  'onset',
  'beatPhase',
] as const;

/** Shape applied to the beat-phase source before it modulates a parameter. */
export type BeatShape = 'saw' | 'sine' | 'pulse';

/** All beat-phase shapes. */
export const BEAT_SHAPES: readonly BeatShape[] = ['saw', 'sine', 'pulse'] as const;

/**
 * One modulation route bound to a parameter: `source` drives the parameter by
 * `amount` (bipolar; negative inverts), optionally smoothed by `lagMs` and, for
 * the `beatPhase` source, rendered through `shape`.
 */
export interface ModRoute {
  /** Which audio channel drives the parameter. */
  source: ModSource;
  /** Bipolar depth in [-1, 1]; the fraction of the param's span this route can push. */
  amount: number;
  /** Optional one-pole smoothing time constant (ms). Omitted = instantaneous. */
  lagMs?: number;
  /** Waveshape for `beatPhase` (ignored for other sources). Omitted = `saw`. */
  shape?: BeatShape;
}

/** Default decay time constant (s) for the `onset` envelope source. */
export const ONSET_DECAY_TAU_S = 0.15;

/** Deadzone below which a lag time constant is treated as instantaneous. */
const MIN_LAG_MS = 1;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Clamp an energy channel to a sane [0, 1] before it feeds the offset math. */
function unit(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Sample one modulation source from a feature frame.
 *
 * Energy channels return [0, 1]; `onset` returns the supplied envelope value
 * (0–1); `beatPhase` returns the shaped phase (`sine` is bipolar [-1, 1], `saw`
 * and `pulse` are [0, 1]).
 *
 * @param onsetEnv the decayed onset envelope (render-side state). Callers of the
 *   pure path may pass `f.onset ? 1 : 0` for an instantaneous read.
 */
export function sampleSource(
  source: ModSource,
  f: FrameFeatures,
  shape: BeatShape = 'saw',
  onsetEnv: number = f.onset ? 1 : 0,
): number {
  switch (source) {
    case 'bass':
      return unit(f.bands.bass);
    case 'lowMid':
      return unit(f.bands.lowMid);
    case 'mid':
      return unit(f.bands.mid);
    case 'high':
      return unit(f.bands.high);
    case 'rms':
      return unit(f.rms);
    case 'loudNorm':
      return unit(f.loudNorm);
    case 'flux':
      return unit(f.flux);
    case 'onset':
      return unit(onsetEnv);
    case 'beatPhase': {
      const p = f.beat.phase - Math.floor(f.beat.phase); // wrap to [0,1)
      switch (shape) {
        case 'sine':
          return Math.sin(p * Math.PI * 2); // [-1, 1]
        case 'pulse':
          return p < 0.5 ? 1 : 0;
        case 'saw':
        default:
          return p; // [0, 1)
      }
    }
    default:
      return 0;
  }
}

/**
 * Pure evaluation of a modulated parameter value. Sums each route's
 * `amount × source × span` offset onto `base`, then clamps to `[min, max]`.
 *
 * The final clamp is what guarantees the T07 invariant *(output always within
 * ParamDef range)* regardless of base, amounts, or feature values — this is the
 * function the property test exercises.
 *
 * @param onsetEnv onset envelope (default: instantaneous from `f.onset`).
 */
export function resolve(
  base: number,
  min: number,
  max: number,
  routes: readonly ModRoute[],
  f: FrameFeatures,
  onsetEnv: number = f.onset ? 1 : 0,
): number {
  const span = max - min;
  let v = base;
  for (const r of routes) {
    const s = sampleSource(r.source, f, r.shape ?? 'saw', onsetEnv);
    v += r.amount * s * span;
  }
  return clamp(v, min, max);
}

/** Per-route render-side state (onset envelope + lagged sample), reused frame to frame. */
interface RouteState {
  env: number;
  lagged: number;
  primed: boolean;
}

interface Entry {
  key: string;
  min: number;
  max: number;
  routes: readonly ModRoute[];
  states: RouteState[];
}

/**
 * Stateful, allocation-free modulation applicator for the frame loop.
 *
 * Configure it with the active scene's {@link ParamDef}s and the current routes
 * (allocations happen here, off the hot path); then call {@link apply} once per
 * frame. `apply` copies every base value into `out` and overwrites modulated
 * numeric params with their resolved values — performing **zero** per-frame
 * allocation and holding all envelope/lag state internally.
 *
 * Intended gate wiring (see T07 handoff): the render core keeps a `base` params
 * record written by the UI pane, owns one `ModMatrix`, and calls
 * `apply(this.params, this.baseParams, features, dtSec)` in `tick()` right
 * before `activeScene.update()`.
 */
export class ModMatrix {
  private entries: Entry[] = [];
  /** Every declared param key (numeric or not), for the straight copy pass. */
  private allKeys: string[] = [];
  private readonly defaultsByKey = new Map<string, unknown>();

  /**
   * (Re)configure for a scene. `routesByKey` maps a param key to its routes;
   * keys absent from the map (or non-numeric / non-modulatable) are copied
   * through untouched. Allocates — never call this on the hot path.
   */
  configure(
    defs: readonly ParamDef[],
    routesByKey: ReadonlyMap<string, readonly ModRoute[]> = new Map(),
  ): void {
    this.entries = [];
    this.allKeys = [];
    this.defaultsByKey.clear();
    for (const def of defs) {
      this.allKeys.push(def.key);
      this.defaultsByKey.set(def.key, def.default);
      if (def.type !== 'number' || def.modulatable !== true) continue;
      const routes = routesByKey.get(def.key);
      if (!routes || routes.length === 0) continue;
      this.entries.push({
        key: def.key,
        min: def.min,
        max: def.max,
        routes,
        states: routes.map(() => ({ env: 0, lagged: 0, primed: false })),
      });
    }
  }

  /** True when at least one modulated param has active routes. */
  get active(): boolean {
    return this.entries.length > 0;
  }

  /**
   * Resolve all params for one frame into `out` (allocation-free).
   *
   * @param out the resolved params record the scene consumes (mutated in place).
   * @param base the UI-authored base values, keyed by param key. Missing keys
   *   fall back to the declared default.
   * @param f the current feature frame.
   * @param dtSec seconds since the previous frame (drives envelope decay + lag).
   */
  apply(
    out: Record<string, unknown>,
    base: Record<string, unknown>,
    f: FrameFeatures,
    dtSec: number,
  ): void {
    // 1) straight copy of every declared param (numeric + non-numeric).
    for (let i = 0; i < this.allKeys.length; i += 1) {
      const key = this.allKeys[i] as string;
      const v = base[key];
      out[key] = v === undefined ? this.defaultsByKey.get(key) : v;
    }
    // 2) overwrite modulated numeric params with their resolved values.
    for (let i = 0; i < this.entries.length; i += 1) {
      const e = this.entries[i] as Entry;
      const span = e.max - e.min;
      const rawBase = base[e.key];
      let value = typeof rawBase === 'number' ? rawBase : (this.defaultsByKey.get(e.key) as number);
      for (let r = 0; r < e.routes.length; r += 1) {
        const route = e.routes[r] as ModRoute;
        const st = e.states[r] as RouteState;
        const s = this.step(route, st, f, dtSec);
        value += route.amount * s * span;
      }
      out[e.key] = clamp(value, e.min, e.max);
    }
  }

  /** Advance one route's envelope/lag state and return its shaped sample. */
  private step(route: ModRoute, st: RouteState, f: FrameFeatures, dtSec: number): number {
    let onsetEnv = st.env;
    if (route.source === 'onset') {
      // Decay toward 0, re-trigger to 1 on an onset (already flashGuard-limited
      // upstream — this route consumes the rate-limited onset by construction).
      const decay = Math.exp(-Math.max(0, dtSec) / ONSET_DECAY_TAU_S);
      onsetEnv = f.onset ? 1 : st.env * decay;
      st.env = onsetEnv;
    }
    const raw = sampleSource(route.source, f, route.shape ?? 'saw', onsetEnv);
    if (route.lagMs === undefined || route.lagMs < MIN_LAG_MS) {
      st.lagged = raw;
      st.primed = true;
      return raw;
    }
    if (!st.primed) {
      st.lagged = raw;
      st.primed = true;
      return raw;
    }
    const tau = route.lagMs / 1000;
    const alpha = 1 - Math.exp(-Math.max(0, dtSec) / tau);
    st.lagged += (raw - st.lagged) * alpha;
    return st.lagged;
  }
}
