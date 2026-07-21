/**
 * A dev/test implementation of {@link ParamHost}.
 *
 * It stands in for the real gate bridge (which the orchestrator builds over
 * `RenderCore` + `EngineFacade`). This one keeps base values and routes in
 * memory, runs a {@link ModMatrix} against a supplied feature source so the
 * emulated "render side" produces resolved values, and exposes them via
 * {@link ParamHost.previewValue} — letting the pane component be exercised
 * end-to-end under Vitest with no render core present.
 */
import type { FrameFeatures, ParamDef } from '../../contracts';
import type { ModRoute } from '../../render/modmatrix';
import { ModMatrix, resolve } from '../../render/modmatrix';
import type { GlobalSettings, ParamHost, ParamValue } from './types';
import { DEFAULT_GLOBALS } from './types';

/** Callbacks the dev host forwards global changes to (mirrors the gate wiring). */
export interface DevHostHooks {
  onBloom?: (enabled: boolean) => void;
  onQuality?: (quality: GlobalSettings['quality']) => void;
  onBaseChange?: (key: string, value: ParamValue) => void;
}

export interface DevParamHostOptions {
  sceneId: string;
  defs: readonly ParamDef[];
  /** Source of the current feature frame (e.g. `engine.latest`). */
  latest: () => FrameFeatures;
  /** Curated default routes for scenes (scene-metadata gap; injected in dev). */
  defaultRoutes?: ReadonlyMap<string, ReadonlyMap<string, readonly ModRoute[]>>;
  hooks?: DevHostHooks;
}

/** The dev host plus a couple of test-only affordances. */
export interface DevParamHost extends ParamHost {
  /** Swap the active scene (defs + id) and reset base values to defaults. */
  loadScene(sceneId: string, defs: readonly ParamDef[]): void;
  /** Run one emulated render frame: resolve base+routes into the output record. */
  tick(f: FrameFeatures, dtSec: number): void;
  /** The most recent resolved params (what a scene would consume). */
  resolved(): Readonly<Record<string, unknown>>;
}

/**
 * Curated default routes for the T03 dev scene (`dev-spectrum`). Demonstrates
 * the differentiator: bass pumps `gain`, the beat's sine sways `spin`.
 *
 * NOTE (integration gap): real scenes should ship these in their registration
 * metadata, but `SceneModule` has no route-metadata field in the frozen
 * contract. Until it does, defaults are injected here.
 */
export const DEV_DEFAULT_ROUTES: ReadonlyMap<string, ReadonlyMap<string, readonly ModRoute[]>> =
  new Map<string, ReadonlyMap<string, readonly ModRoute[]>>([
    [
      'dev-spectrum',
      new Map<string, readonly ModRoute[]>([
        ['gain', [{ source: 'bass', amount: 0.6 }]],
        ['spin', [{ source: 'beatPhase', amount: 0.4, shape: 'sine' }]],
      ]),
    ],
  ]);

export function createDevParamHost(opts: DevParamHostOptions): DevParamHost {
  const emptyDefaults: ReadonlyMap<string, ReadonlyMap<string, readonly ModRoute[]>> = new Map();
  const defaultRoutesBySceneMap = opts.defaultRoutes ?? emptyDefaults;

  let sceneId = opts.sceneId;
  let defs: readonly ParamDef[] = opts.defs;
  const base = new Map<string, ParamValue>();
  const routes = new Map<string, ModRoute[]>();
  let globals: GlobalSettings = { ...DEFAULT_GLOBALS };
  const sceneListeners = new Set<(id: string) => void>();

  const matrix = new ModMatrix();
  const out: Record<string, unknown> = {};

  const defOf = (key: string): ParamDef | undefined => defs.find((d) => d.key === key);

  const seedDefaults = (): void => {
    base.clear();
    routes.clear();
    for (const d of defs) base.set(d.key, d.default);
    const forScene = defaultRoutesBySceneMap.get(sceneId);
    if (forScene) for (const [k, r] of forScene) routes.set(k, [...r]);
    reconfigure();
  };

  const reconfigure = (): void => {
    matrix.configure(defs, routes);
  };

  seedDefaults();

  return {
    activeSceneId: () => sceneId,
    paramDefs: () => defs,
    onSceneChange: (cb) => {
      sceneListeners.add(cb);
      return () => sceneListeners.delete(cb);
    },

    getBase: (key) => base.get(key) ?? (defOf(key)?.default as ParamValue),
    setBase: (key, value) => {
      base.set(key, value);
      opts.hooks?.onBaseChange?.(key, value);
    },

    getRoutes: (key) => routes.get(key) ?? [],
    setRoutes: (key, r) => {
      if (r.length === 0) routes.delete(key);
      else routes.set(key, [...r]);
      reconfigure();
    },
    defaultRoutes: (id) => defaultRoutesBySceneMap.get(id) ?? new Map(),

    getGlobals: () => globals,
    setGlobal: (key, value) => {
      globals = { ...globals, [key]: value };
      if (key === 'bloom') opts.hooks?.onBloom?.(value as boolean);
      if (key === 'quality') opts.hooks?.onQuality?.(value as GlobalSettings['quality']);
    },

    previewValue: (key) => {
      const d = defOf(key);
      if (!d || d.type !== 'number') return 0;
      const b = base.get(key);
      const bn = typeof b === 'number' ? b : d.default;
      return resolve(bn, d.min, d.max, routes.get(key) ?? [], opts.latest());
    },

    // — dev/test extras —
    loadScene: (id, nextDefs) => {
      sceneId = id;
      defs = nextDefs;
      seedDefaults();
      for (const cb of sceneListeners) cb(id);
    },
    tick: (f, dtSec) => {
      const baseRecord: Record<string, unknown> = {};
      for (const [k, v] of base) baseRecord[k] = v;
      matrix.apply(out, baseRecord, f, dtSec);
    },
    resolved: () => out,
  };
}
