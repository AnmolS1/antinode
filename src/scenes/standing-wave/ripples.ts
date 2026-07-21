/**
 * Standing Wave — onset ripple pool (pure, no three, no GPU).
 *
 * Each onset spawns a radial ripple from the nearest antinode peak; the ripple
 * expands, rings, and fades. Attack is instantaneous (a spawn sets full strength
 * immediately) and release is a slow exponential decay — the asymmetric-lag feel
 * the spec asks for, done in scene state rather than re-smoothing the already-
 * lagged audio features.
 *
 * The pool is fixed-capacity and allocation-free after construction: `spawn`
 * reuses the weakest slot, `advance` decays in place, and `heightAt` sums the
 * live rings. It is bounded and finite by construction (see the tests): strengths
 * only ever decay, the ring/gaussian/falloff factors are each in [-1, 1] or
 * (0, 1], so |heightAt| ≤ gain · Σ strength.
 */

/** One ripple in the pool. `strength <= 0` means the slot is free. */
export interface Ripple {
  /** Emission x (an antinode peak). */
  originX: number;
  /** Emission z. */
  originZ: number;
  /** Seconds since emission. */
  age: number;
  /** Current amplitude; set at spawn, decays each frame, 0 when dead. */
  strength: number;
}

/** Tunables for a {@link RipplePool}. */
export interface RippleConfig {
  /** Number of simultaneous ripples the pool holds. */
  capacity: number;
  /** Radial propagation speed in world units per second. */
  speed: number;
  /** Half-width of the travelling gaussian ring, in world units. */
  ringWidth: number;
  /** Exponential decay time-constant in seconds (larger = longer trails). */
  decayTau: number;
  /** Age past which a ripple is culled, in seconds. */
  maxAge: number;
  /** Spatial ring frequency (rad per world unit). */
  wavenumber: number;
}

/** Sensible defaults; the scene scales `speed`/`ringWidth` to its world size. */
export const DEFAULT_RIPPLE_CONFIG: RippleConfig = {
  capacity: 6,
  speed: 2.4,
  ringWidth: 0.6,
  decayTau: 0.9,
  maxAge: 4,
  wavenumber: 6,
};

/** Below this a ripple is considered dead and its slot freed. */
const STRENGTH_EPSILON = 1e-3;

export class RipplePool {
  readonly ripples: Ripple[];
  private readonly cfg: RippleConfig;

  constructor(cfg: RippleConfig = DEFAULT_RIPPLE_CONFIG) {
    this.cfg = { ...cfg };
    const capacity = Math.max(1, Math.floor(cfg.capacity));
    this.ripples = Array.from({ length: capacity }, () => ({
      originX: 0,
      originZ: 0,
      age: 0,
      strength: 0,
    }));
  }

  /** Number of live ripples. */
  activeCount(): number {
    let n = 0;
    for (const r of this.ripples) if (r.strength > STRENGTH_EPSILON) n += 1;
    return n;
  }

  /**
   * Emit a ripple from `(originX, originZ)` at `strength` (clamped ≥ 0). Reuses
   * the weakest slot so a burst of onsets never allocates and always shows the
   * freshest rings. A non-finite input is ignored (defensive; keeps the field
   * finite no matter what upstream feeds).
   */
  spawn(originX: number, originZ: number, strength: number): void {
    if (!isFiniteNum(originX) || !isFiniteNum(originZ) || !isFiniteNum(strength)) return;
    const s = Math.max(0, strength);
    if (s <= 0) return;

    let target = this.ripples[0]!;
    for (const r of this.ripples) {
      if (r.strength <= STRENGTH_EPSILON) {
        target = r;
        break;
      }
      if (r.strength < target.strength) target = r;
    }
    target.originX = originX;
    target.originZ = originZ;
    target.age = 0;
    target.strength = s;
  }

  /** Advance all ripples by `dt` seconds: age up, decay, cull the spent ones. */
  advance(dt: number): void {
    const step = Math.max(0, isFiniteNum(dt) ? dt : 0);
    const decay = Math.exp(-step / Math.max(1e-3, this.cfg.decayTau));
    for (const r of this.ripples) {
      if (r.strength <= STRENGTH_EPSILON) {
        r.strength = 0;
        continue;
      }
      r.age += step;
      r.strength *= decay;
      if (r.age >= this.cfg.maxAge || r.strength <= STRENGTH_EPSILON) {
        r.strength = 0;
      }
    }
  }

  /**
   * Summed ripple height at `(x, z)`, scaled by `gain`. Each ripple contributes a
   * travelling ring: `sin(wavenumber·d − speed·age)` windowed by a gaussian on the
   * wavefront radius and an inverse-distance falloff. Always finite and bounded.
   */
  heightAt(x: number, z: number, gain: number): number {
    let sum = 0;
    for (const r of this.ripples) {
      if (r.strength <= STRENGTH_EPSILON) continue;
      const dx = x - r.originX;
      const dz = z - r.originZ;
      const d = Math.sqrt(dx * dx + dz * dz);
      const front = this.cfg.speed * r.age;
      const window = Math.exp(-((d - front) * (d - front)) / (2 * this.cfg.ringWidth * this.cfg.ringWidth));
      const falloff = 1 / (1 + d);
      const ring = Math.sin(this.cfg.wavenumber * d - front);
      sum += r.strength * ring * window * falloff;
    }
    return gain * sum;
  }

  /** Free every slot. */
  reset(): void {
    for (const r of this.ripples) {
      r.originX = 0;
      r.originZ = 0;
      r.age = 0;
      r.strength = 0;
    }
  }
}

function isFiniteNum(v: number): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}
