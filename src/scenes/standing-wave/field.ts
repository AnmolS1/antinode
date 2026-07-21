/**
 * Standing Wave — the GPU field (TSL node graph + geometry).
 *
 * One BufferGeometry of points laid out as a grid in the XZ plane; the material's
 * `positionNode` displaces each point in Y by the **same** standing-wave formula
 * the pure {@link ./displacement} module defines, plus the summed onset ripples.
 *
 * Why no compute pass (the T09a design bullet names TSL compute for WebGPU): the
 * displacement `A(x, θ)` is *closed-form* — a pure function of a point's base
 * (x, z), a handful of scalar uniforms, and time. There is no persistent
 * per-particle state to integrate, so a compute pass would only duplicate work a
 * vertex-stage `positionNode` already does, on both backends, for free. Evaluating
 * it in `positionNode` is therefore the universal path (WebGPU *and* the WebGL2
 * fallback, which has no compute shaders — see touchdesigner/PORTING.md §7). The
 * ripple sibling scene (Phosphor) makes the same "skip compute; note why" call.
 *
 * This module builds a node graph; it is exercised at the gate against a real
 * renderer, not in Vitest (jsdom has no GPU). The math it mirrors is unit-tested
 * in {@link ./displacement}.
 */

import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Points, Vector4 } from 'three';
import {
  abs,
  cos,
  exp,
  float,
  positionLocal,
  positionView,
  sin,
  smoothstep,
  step,
  uniform,
  varying,
  vec3,
} from 'three/tsl';
import { PointsNodeMaterial } from 'three/webgpu';

import type { FeatureUniforms } from '../../render/bridge/FeatureUniforms';
import { BASS_ANTINODE_GAIN, HARMONIC_ENVELOPE, HARMONICS } from './displacement';
import type { RipplePool } from './ripples';

/** World half-extent of the surface along x (wave axis). */
export const WORLD_HALF_X = 6;
/** World half-extent along z (extrusion axis). */
export const WORLD_HALF_Z = 4;
/** How many ripple slots the shader unrolls; matches the pool capacity. */
export const RIPPLE_CAP = 6;

// Ripple constants baked as shader literals (mirror DEFAULT_RIPPLE_CONFIG feel).
const RIPPLE_SPEED = 2.4;
const RIPPLE_WIDTH = 0.6;
const RIPPLE_WAVENUMBER = 6;

/** Grid dimensions for a target particle budget, keeping the x:z aspect. */
export function gridDimensions(targetCount: number): { cols: number; rows: number } {
  const aspect = WORLD_HALF_X / WORLD_HALF_Z; // wider along x
  const rows = Math.max(2, Math.round(Math.sqrt(targetCount / aspect)));
  const cols = Math.max(2, Math.round(targetCount / rows));
  return { cols, rows };
}

/** The scalar uniforms the scene writes each frame. Types inferred from `uniform`. */
function makeUniforms() {
  return {
    amplitude: uniform(0.6),
    wavelength: uniform(3),
    theta: uniform(0),
    rippleGain: uniform(1),
    glow: uniform(1),
    brightness: uniform(1),
    densityQuality: uniform(1),
    pointSize: uniform(2.5),
    fogNear: uniform(2),
    fogFar: uniform(14),
    phase: uniform(0),
    /** Gates the live bass→antinode drive to 0 under reduced motion. */
    bassGate: uniform(1),
    accent: uniform(new Color(0x4ade80)),
  };
}

/** The live handles the scene mutates each frame. */
export interface StandingWaveField {
  readonly points: Points;
  readonly material: PointsNodeMaterial;
  readonly u: ReturnType<typeof makeUniforms>;
  /** Copy the CPU ripple pool into the ripple uniforms (allocation-free). */
  syncRipples(pool: RipplePool): void;
  dispose(): void;
}

/**
 * Build the point grid and its TSL material, binding to the shared feature
 * uniforms (`bridge.uBass` breathes the antinodes live). `count` is the target
 * particle budget already chosen for the backend and density.
 */
export function createStandingWaveField(bridge: FeatureUniforms, count: number): StandingWaveField {
  const { cols, rows } = gridDimensions(count);
  const geometry = buildGridGeometry(cols, rows);

  const u = makeUniforms();
  const ripples = Array.from({ length: RIPPLE_CAP }, () => uniform(new Vector4(0, 0, 0, 0)));

  // --- shared displacement, mirroring ./displacement.standingWaveHeight -------
  // Built inline (no Fn wrapper) so the base-position swizzles carry their exact
  // float-node types through the arithmetic. `positionLocal` is (x, cull, z):
  // the grid bakes the per-point cull value into the unused Y slot (see
  // buildGridGeometry), so the shader reads it as a plain float swizzle and the
  // displaced Y is computed from scratch below.
  const k = float(Math.PI * 2).div(u.wavelength.max(0.001));
  // Bass breathes the antinodes — gated to 0 under reduced motion (u.bassGate).
  const bassGain = float(1).add(bridge.uBass.mul(BASS_ANTINODE_GAIN).mul(u.bassGate));
  const gain = u.amplitude.mul(bassGain);

  const baseX = positionLocal.x;
  const baseZ = positionLocal.z;
  const cull = positionLocal.y; // per-point cull key, 0..1

  const harmonic = (m: number) =>
    sin(baseX.mul(k).mul(m))
      .mul(cos(u.theta.mul(m).add(u.phase)))
      .mul(HARMONIC_ENVELOPE[m - 1] ?? 0);
  let standing = harmonic(1);
  for (let m = 2; m <= HARMONICS; m += 1) standing = standing.add(harmonic(m));
  const standingHeight = gain.mul(standing);

  const rippleContribution = (i: number) => {
    const r = ripples[i]!; // vec4(originX, originZ, age, strength)
    const dx = baseX.sub(r.x);
    const dz = baseZ.sub(r.y);
    const d = dx.mul(dx).add(dz.mul(dz)).sqrt();
    const front = r.z.mul(RIPPLE_SPEED);
    const offset = d.sub(front);
    const window = exp(offset.mul(offset).mul(-1 / (2 * RIPPLE_WIDTH * RIPPLE_WIDTH)));
    const falloff = float(1).div(d.add(1));
    const ring = sin(d.mul(RIPPLE_WAVENUMBER).sub(front));
    return r.w.mul(ring).mul(window).mul(falloff);
  };
  let ripple = rippleContribution(0);
  for (let i = 1; i < RIPPLE_CAP; i += 1) ripple = ripple.add(rippleContribution(i));
  const rippleHeight = ripple.mul(u.rippleGain);

  const material = new PointsNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.blending = AdditiveBlending;

  const y = standingHeight.add(rippleHeight);
  // Vary the crest height into the fragment stage for glow.
  const yVary = varying(y);

  material.positionNode = vec3(baseX, y, baseZ);

  // Cull points above the density×quality budget by shrinking them to nothing.
  const visible = step(cull, u.densityQuality); // 1 where kept
  material.sizeNode = u.pointSize.mul(visible);

  // Depth fog: fade toward black by view-space distance (additive on black).
  const depth = positionView.z.negate();
  const fog = smoothstep(u.fogFar, u.fogNear, depth);
  const crest = abs(yVary).mul(u.glow);
  const bright = u.brightness.add(crest).mul(fog);
  material.colorNode = u.accent.mul(bright);
  material.opacityNode = visible;

  const points = new Points(geometry, material);
  points.frustumCulled = false;

  return {
    points,
    material,
    u,
    syncRipples(pool: RipplePool): void {
      for (let i = 0; i < RIPPLE_CAP; i += 1) {
        const r = pool.ripples[i];
        const v = ripples[i]!.value;
        if (r) v.set(r.originX, r.originZ, r.age, r.strength);
        else v.set(0, 0, 0, 0);
      }
    },
    dispose(): void {
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * A `cols × rows` grid of points spanning the world extents in the XZ plane. The
 * X and Z slots hold the base position; the **Y slot holds a stable cull key** in
 * [0, 1) (the shader recomputes the displaced Y from x, so the base Y is free to
 * reuse). A deterministic, spatially-interleaved key lets the shader shed an even
 * subset as the quality budget drops — no reallocation.
 */
function buildGridGeometry(cols: number, rows: number): BufferGeometry {
  const n = cols * rows;
  const positions = new Float32Array(n * 3);
  let p = 0;
  for (let r = 0; r < rows; r += 1) {
    const tz = rows > 1 ? r / (rows - 1) : 0.5;
    const z = (tz * 2 - 1) * WORLD_HALF_Z;
    for (let c = 0; c < cols; c += 1) {
      const tx = cols > 1 ? c / (cols - 1) : 0.5;
      const x = (tx * 2 - 1) * WORLD_HALF_X;
      positions[p * 3] = x;
      // Y slot carries the cull key, interleaved so any threshold stays even.
      positions[p * 3 + 1] = ((p * 2654435761) >>> 0) / 0xffffffff;
      positions[p * 3 + 2] = z;
      p += 1;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  return geometry;
}
