import { PerspectiveCamera } from 'three';

/**
 * Canonical framing of the shared camera. This is the baseline every scene
 * renders through unless it deliberately reframes the camera in `init` (Heritage
 * does, for its 2023 look). {@link resetCameraToBaseline} restores these on each
 * scene switch so no scene inherits another's framing. `aspect` is owned
 * separately by the size/quality path and is not reset here.
 */
export const CAMERA_BASELINE = { fov: 60, near: 0.1, far: 100, z: 5 } as const;

/**
 * Restore `camera` to the {@link CAMERA_BASELINE canonical framing} (fov / near /
 * far / position / orientation), leaving `aspect` untouched (owned by the size
 * path). Called before each scene's `init` so a scene that reframed the shared
 * camera (Heritage's `lookAt` from `(20,200,-80)` at fov 45) cannot leave that
 * state behind — otherwise the next scene inherits it and its origin-centred
 * geometry (Standing Wave) projects to a speck off-screen and looks black.
 * Pure + renderer-free so it is unit-testable headlessly.
 */
export function resetCameraToBaseline(camera: PerspectiveCamera): void {
  camera.fov = CAMERA_BASELINE.fov;
  camera.near = CAMERA_BASELINE.near;
  camera.far = CAMERA_BASELINE.far;
  camera.position.set(0, 0, CAMERA_BASELINE.z);
  camera.up.set(0, 1, 0);
  camera.rotation.set(0, 0, 0); // Euler.set syncs the quaternion to identity
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
