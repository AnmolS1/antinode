import { WebGPURenderer } from 'three/webgpu';

import type { BackendPreference } from '../types';

/**
 * Parse the backend preference from a URL query string.
 *
 * `?gl=1` forces the WebGL2 fallback (T10 matrix testing); `?gpu=0` is the
 * documented alias. Any other value — including their absence — leaves the
 * renderer free to pick WebGPU when available and fall back automatically.
 *
 * Pure and side-effect-free so it is unit-testable without a DOM.
 *
 * @param search a `location.search` string (leading `?` optional)
 */
export function parseBackendPreference(search: string): BackendPreference {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const gl = params.get('gl');
  const gpu = params.get('gpu');
  const forceWebGL = gl === '1' || gpu === '0';
  return { forceWebGL };
}

/** Result of a successful renderer bootstrap. */
export interface RendererBootstrap {
  renderer: WebGPURenderer;
  /** True on the WebGPU backend; false on the WebGL2 fallback. */
  isWebGPU: boolean;
}

/**
 * Detect whether an initialized renderer landed on the WebGPU backend. The base
 * `Backend` type exposes neither flag, so we duck-type the two concrete
 * backends (`WebGPUBackend.isWebGPUBackend === true`, `WebGLBackend` lacks it).
 */
export function detectIsWebGPU(renderer: WebGPURenderer): boolean {
  const backend = renderer.backend as { isWebGPUBackend?: boolean };
  return backend.isWebGPUBackend === true;
}

/**
 * Create and initialize the renderer against a canvas.
 *
 * three.js's `WebGPURenderer` performs its own automatic WebGL2 fallback; we
 * only add the explicit `forceWebGL` override and surface the resolved backend.
 * Initialization is async and can fail (no WebGPU *and* no WebGL2, or a driver
 * fault) — the caller passes that error to its user-readable surface.
 *
 * Not exercised in headless unit tests (jsdom has no GPU); the pure
 * {@link parseBackendPreference} and {@link detectIsWebGPU} carry the testable
 * logic.
 *
 * @param canvas the already-mounted canvas (never re-created)
 * @param pref backend preference from {@link parseBackendPreference}
 */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  pref: BackendPreference,
): Promise<RendererBootstrap> {
  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    forceWebGL: pref.forceWebGL,
    powerPreference: 'high-performance',
  });
  // App owns the loop and thus the per-frame info reset.
  renderer.info.autoReset = false;
  await renderer.init();
  return { renderer, isWebGPU: detectIsWebGPU(renderer) };
}
