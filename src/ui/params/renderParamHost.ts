/**
 * The REAL {@link ParamHost}, backed by {@link RenderCore} (the gate wiring the
 * T07 handoff describes). {@link createDevParamHost} is the in-memory reference
 * used under Vitest; this one drives the live render core:
 *
 * - `getBase`/`setBase` read/write the core's `baseParams` (mod-matrix input);
 * - `setRoutes` reconfigures the core's `ModMatrix` off the hot path;
 * - `previewValue` reads the core's live *resolved* param value;
 * - scene changes flow from `RenderCore.onSceneChange` → default routes re-applied
 *   → the pane's own listeners fire (which rebuild the pane).
 *
 * Scenes export their default modulation routes as `{ source, target, amount }`
 * (some sources dotted, e.g. `bands.mid`); {@link sceneRoutesToMap} normalizes
 * them into the mod-matrix's `{ source, amount }` map keyed by target param.
 */
import type { ParamDef } from '../../contracts';
import type { ModRoute } from '../../render/modmatrix';
import { MOD_SOURCES } from '../../render/modmatrix';
import type { ModSource } from '../../render/modmatrix';
import type { RenderCore } from '../../render';
import type { GlobalSettings, ParamHost, ParamValue } from './types';
import { DEFAULT_GLOBALS } from './types';

/** The route shape scenes export (distinct from the mod-matrix `ModRoute`). */
export interface SceneModRoute {
  source: string;
  target: string;
  amount: number;
}

/** Normalize a scene route's source (`bands.mid` → `mid`) to a mod-matrix source. */
function normalizeSource(source: string): ModSource | null {
  const bare = source.startsWith('bands.') ? source.slice('bands.'.length) : source;
  return (MOD_SOURCES as readonly string[]).includes(bare) ? (bare as ModSource) : null;
}

/**
 * Convert a scene's `{ source, target, amount }[]` default routes into the
 * mod-matrix map keyed by target param key. Sources that don't map to a known
 * channel are dropped (they can't be evaluated).
 */
export function sceneRoutesToMap(
  routes: readonly SceneModRoute[],
): Map<string, ModRoute[]> {
  const map = new Map<string, ModRoute[]>();
  for (const r of routes) {
    const source = normalizeSource(r.source);
    if (!source) continue;
    const list = map.get(r.target) ?? [];
    list.push({ source, amount: r.amount });
    map.set(r.target, list);
  }
  return map;
}

/** Map the global quality control to a scene-facing quality (0–1), or null=auto. */
function qualityToSceneQuality(q: GlobalSettings['quality']): number | null {
  switch (q) {
    case '0':
      return 1.0;
    case '1':
      return 0.75;
    case '2':
      return 0.5;
    case '3':
      return 0.35;
    case 'auto':
    default:
      return null;
  }
}

export interface RenderParamHostOptions {
  core: RenderCore;
  /** Curated default routes per scene id (already normalized via {@link sceneRoutesToMap}). */
  defaultRoutesByScene: ReadonlyMap<string, ReadonlyMap<string, readonly ModRoute[]>>;
}

/** Build the render-backed {@link ParamHost}. */
export function createRenderParamHost(opts: RenderParamHostOptions): ParamHost {
  const { core, defaultRoutesByScene } = opts;
  const emptyMap: ReadonlyMap<string, readonly ModRoute[]> = new Map();

  // Live routes for the active scene, keyed by param key.
  let routesByKey = new Map<string, readonly ModRoute[]>();
  let globals: GlobalSettings = { ...DEFAULT_GLOBALS };
  const sceneListeners = new Set<(id: string) => void>();

  const defOf = (key: string): ParamDef | undefined =>
    core.activeParamDefs().find((d) => d.key === key);

  const pushRoutes = (): void => {
    core.setRoutes(core.activeParamDefs(), routesByKey);
  };

  const applyDefaultRoutes = (sceneId: string): void => {
    const defaults = defaultRoutesByScene.get(sceneId) ?? emptyMap;
    routesByKey = new Map();
    for (const [k, r] of defaults) routesByKey.set(k, [...r]);
    pushRoutes();
  };

  // Apply the initial globals so the render side matches the pane's shown
  // defaults (bloom on, quality auto).
  core.setBloom(globals.bloom);
  core.setQualityOverride(qualityToSceneQuality(globals.quality));

  // Seed the initial scene's default routes (main sets the default scene before
  // building this host), then keep them in sync on every scene change.
  applyDefaultRoutes(core.activeSceneId());
  core.onSceneChange((id) => {
    applyDefaultRoutes(id);
    for (const cb of sceneListeners) cb(id);
  });

  return {
    activeSceneId: () => core.activeSceneId(),
    paramDefs: () => core.activeParamDefs(),
    onSceneChange: (cb) => {
      sceneListeners.add(cb);
      return () => sceneListeners.delete(cb);
    },

    getBase: (key) => {
      const v = core.getBaseParam(key);
      if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
      return (defOf(key)?.default ?? 0) as ParamValue;
    },
    setBase: (key, value) => core.setBaseParam(key, value),

    getRoutes: (key) => routesByKey.get(key) ?? [],
    setRoutes: (key, r) => {
      if (r.length === 0) routesByKey.delete(key);
      else routesByKey.set(key, [...r]);
      pushRoutes();
    },
    defaultRoutes: (id) => defaultRoutesByScene.get(id) ?? emptyMap,

    getGlobals: () => globals,
    setGlobal: (key, value) => {
      globals = { ...globals, [key]: value };
      if (key === 'bloom') core.setBloom(value as boolean);
      if (key === 'quality') {
        core.setQualityOverride(qualityToSceneQuality(value as GlobalSettings['quality']));
      }
    },

    previewValue: (key) => core.resolvedParam(key),
  };
}
