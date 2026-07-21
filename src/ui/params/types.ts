/**
 * Shared types for the params/presets/mod-matrix/MIDI layer (T07, UI side).
 *
 * The frozen {@link EngineFacade} exposes scenes as `{id,name}` only — it has no
 * surface for a scene's {@link ParamDef}s, no param-write path, and no
 * mod-route sink. {@link ParamHost} is the small bridge the orchestrator
 * implements at the Wave B gate to connect this pane to the render core; see
 * `src/ui/params/README`-level notes in the T07 handoff for the exact wiring.
 */
import type { ParamDef } from '../../contracts';
import type { ModRoute } from '../../render/modmatrix';

/** A primitive param value as stored in presets and written to the render side. */
export type ParamValue = number | boolean | string;

/** The global (non-scene) controls surfaced in the pane's "Global" folder. */
export interface GlobalSettings {
  /** Bloom/post enabled. Wires to `RenderCore.setBloom`. */
  bloom: boolean;
  /** Quality override: `'auto'` defers to the governor; a digit pins a ladder step. */
  quality: 'auto' | '0' | '1' | '2' | '3';
  /** Chrome/pane opacity, 0.3–1. Applied locally to the pane; chrome wiring is a gate item. */
  uiOpacity: number;
}

/** The default global settings a fresh session starts from. */
export const DEFAULT_GLOBALS: GlobalSettings = {
  bloom: true,
  quality: 'auto',
  uiOpacity: 1,
};

/**
 * The bridge between the params pane (UI) and the render core.
 *
 * The orchestrator builds one of these over `RenderCore` + `EngineFacade` at the
 * gate. In dev/tests it is backed by {@link createDevParamHost}. Everything the
 * pane needs beyond the frozen facade lives here.
 */
export interface ParamHost {
  /** The active scene's id. */
  activeSceneId(): string;
  /** The active scene's parameter definitions (drives the whole pane). */
  paramDefs(): readonly ParamDef[];
  /** Subscribe to scene switches (id changes); returns an unsubscribe fn. */
  onSceneChange(cb: (sceneId: string) => void): () => void;

  /** Current base value for a param key (pre-modulation). */
  getBase(key: string): ParamValue;
  /** Write a base value; the render side applies it same-frame. */
  setBase(key: string, value: ParamValue): void;

  /** Current routes for a modulatable param key. */
  getRoutes(key: string): readonly ModRoute[];
  /** Replace the routes for a param key; the render side re-evaluates each frame. */
  setRoutes(key: string, routes: readonly ModRoute[]): void;
  /** The curated default routes for a scene (scene metadata is a gate item; injected here). */
  defaultRoutes(sceneId: string): ReadonlyMap<string, readonly ModRoute[]>;

  /** Current global settings. */
  getGlobals(): GlobalSettings;
  /** Apply a global setting change (bloom/quality wire to the render core). */
  setGlobal<K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]): void;

  /** The instantaneous resolved value of a param, for the pane's preview meters. */
  previewValue(key: string): number;
}
