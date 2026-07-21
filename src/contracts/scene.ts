import type { FrameFeatures } from './features';

/**
 * Declarative definition of one scene parameter. Drives the params UI (T07),
 * preset serialization, and the modulation matrix. A discriminated union on
 * `type`; `modulatable` marks numeric params a modulator can drive.
 */
export type ParamDef =
  | {
      type: 'number';
      key: string;
      label: string;
      min: number;
      max: number;
      step?: number;
      default: number;
      modulatable?: boolean;
    }
  | { type: 'boolean'; key: string; label: string; default: boolean }
  | { type: 'color'; key: string; label: string; default: string }
  | { type: 'select'; key: string; label: string; options: string[]; default: string };

/**
 * The rendering context handed to a {@link SceneModule} on init/resize.
 * `renderer`/`scene`/`camera` are typed as `unknown` here so the contracts
 * layer stays dependency-free; T03 narrows them to the real Three/WebGPU types.
 */
export interface SceneContext {
  /** The active renderer instance (WebGPURenderer, or WebGL2 fallback). */
  renderer: unknown /* WebGPURenderer */;
  /** The root scene graph object. */
  scene: unknown;
  /** The active camera. */
  camera: unknown;
  /** True when running on the WebGPU backend rather than the WebGL2 fallback. */
  isWebGPU: boolean;
  /** Current drawing-buffer size and device pixel ratio. */
  size: { w: number; h: number; dpr: number };
}

/**
 * A self-contained visual. Each scene (T06 Heritage, T09 Standing Wave /
 * Phosphor) implements this: it declares its {@link ParamDef}s, sets up on
 * `init`, advances every frame in `update` from {@link FrameFeatures}, adapts
 * to `resize`, and frees resources on `dispose`.
 */
export interface SceneModule {
  /** Stable unique id (used in presets and deep links). */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** The parameters this scene exposes to the UI and preset system. */
  params: ParamDef[];
  /** Allocate GPU/scene resources. Called once before the first `update`. */
  init(ctx: SceneContext): Promise<void>;
  /**
   * Advance the scene by one frame.
   * @param f current audio features
   * @param params current param values keyed by {@link ParamDef.key}
   * @param dt seconds elapsed since the previous frame
   */
  update(f: FrameFeatures, params: Record<string, unknown>, dt: number): void;
  /** React to a change in drawing-buffer size / DPR. */
  resize(size: SceneContext['size']): void;
  /** Release all resources allocated in `init`. */
  dispose(): void;
}
