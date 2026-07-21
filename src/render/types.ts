import type { Camera, Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

/**
 * Drawing-buffer size + device pixel ratio. Mirrors the shape the contracts
 * layer's {@link import('../contracts').SceneContext} exposes as `size`.
 */
export interface RenderSize {
  w: number;
  h: number;
  dpr: number;
}

/**
 * Backend selection parsed from the page URL. `?gl=1` (and the `?gpu=0` alias)
 * force the WebGL2 fallback so T10 can run the same TSL codebase on both paths.
 */
export interface BackendPreference {
  /** When true, the renderer is created with `{ forceWebGL: true }`. */
  forceWebGL: boolean;
}

/**
 * The fully-typed render context T03 builds internally. It is handed to scenes
 * as a {@link import('../contracts').SceneContext} (whose `renderer`/`scene`/
 * `camera` are `unknown`); scenes narrow the fields they need.
 */
export interface ThreeContext {
  renderer: WebGPURenderer;
  scene: Scene;
  camera: Camera;
  isWebGPU: boolean;
  size: RenderSize;
}

/**
 * A snapshot the perf HUD (T04) renders. All values are cheap reads produced
 * once per frame by the {@link import('./governor/QualityGovernor').QualityGovernor}
 * and the render loop.
 */
export interface PerfReadout {
  /** True on the WebGPU backend, false on the WebGL2 fallback. */
  isWebGPU: boolean;
  /** Smoothed frames-per-second. */
  fps: number;
  /** Rolling p75 frame time in milliseconds (the governor's control signal). */
  frameMs: number;
  /** Current index into the quality ladder (0 = full quality). */
  qualityLevel: number;
  /** Device-pixel-ratio multiplier currently applied (≤ 1). */
  dprScale: number;
  /** Internal render-scale multiplier currently applied (≤ 1). */
  renderScale: number;
  /** Scene-facing quality param, 0–1, that scenes may use to cut work. */
  sceneQuality: number;
  /** Whether the bloom post chain is active. */
  bloom: boolean;
}

/**
 * A user-readable failure surface. T04 renders these; T03 only calls them.
 * `onError` fires on unrecoverable init failure; `onToast` on transient events
 * (context loss/restore).
 */
export interface RenderCoreHooks {
  onError?: (err: Error) => void;
  onToast?: (msg: string) => void;
}
