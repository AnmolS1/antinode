/**
 * Rolling-percentile statistics over a fixed-length window, used for adaptive
 * feature normalization (auto-gain for *features*, never for audio).
 *
 * A ring buffer of recent samples plus a preallocated scratch array; quantiles
 * are computed by copying into scratch and sorting it in place (`Float32Array`
 * sorts numerically without allocating). Nothing allocates after construction.
 */
export class RollingStats {
  readonly capacity: number;
  private readonly ring: Float32Array;
  private readonly scratch: Float32Array;
  private count = 0;
  private head = 0;
  // Cached scratch view so quantile()/mad() allocate nothing in steady state
  // (`subarray` otherwise mints a new view object every call, ~10×/frame).
  private view: Float32Array;
  private viewLen = -1;

  /** @param capacity window length in samples (~8 s of frames). */
  constructor(capacity: number) {
    this.capacity = Math.max(1, capacity);
    this.ring = new Float32Array(this.capacity);
    this.scratch = new Float32Array(this.capacity);
    this.view = this.scratch;
  }

  /** A length-`n` view over scratch, recreated only when `n` changes. */
  private viewFor(n: number): Float32Array {
    if (this.viewLen !== n) {
      this.view = this.scratch.subarray(0, n);
      this.viewLen = n;
    }
    return this.view;
  }

  /** Number of samples currently held (≤ capacity). */
  get size(): number {
    return this.count;
  }

  /** Append a sample, evicting the oldest once full. */
  push(v: number): void {
    if (!Number.isFinite(v)) v = 0;
    this.ring[this.head] = v;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /**
   * The `q`-quantile (0..1) of the current window via nearest-rank.
   * Returns 0 when empty. Sorts a preallocated scratch copy in place.
   */
  quantile(q: number): number {
    const n = this.count;
    if (n === 0) return 0;
    const s = this.scratch;
    for (let i = 0; i < n; i++) s[i] = this.ring[i] ?? 0;
    const view = this.viewFor(n);
    view.sort();
    const idx = Math.min(n - 1, Math.max(0, Math.round(q * (n - 1))));
    return view[idx] ?? 0;
  }

  /** Median absolute deviation around `center`, reusing scratch. */
  mad(center: number): number {
    const n = this.count;
    if (n === 0) return 0;
    const s = this.scratch;
    for (let i = 0; i < n; i++) s[i] = Math.abs((this.ring[i] ?? 0) - center);
    const view = this.viewFor(n);
    view.sort();
    const idx = Math.min(n - 1, Math.max(0, Math.round(0.5 * (n - 1))));
    return view[idx] ?? 0;
  }
}

/** Clamp `v` to the [0, 1] range. */
export function clamp01(v: number): number {
  if (v < 0 || Number.isNaN(v)) return 0;
  if (v > 1) return 1;
  return v;
}

/**
 * Map a raw loudness value through a rolling p10–p95 window so quiet tracks and
 * loud tracks produce the same 0–1 shape. Scale-equivariant: if every raw value
 * is multiplied by k, both percentiles scale by k and the output is unchanged.
 */
export class PercentileNormalizer {
  private readonly stats: RollingStats;
  private readonly loQ: number;
  private readonly hiQ: number;

  constructor(capacity: number, loQ = 0.1, hiQ = 0.95) {
    this.stats = new RollingStats(capacity);
    this.loQ = loQ;
    this.hiQ = hiQ;
  }

  /** Push a raw sample and return its normalized 0–1 position in the window. */
  normalize(raw: number): number {
    this.stats.push(raw);
    const lo = this.stats.quantile(this.loQ);
    const hi = this.stats.quantile(this.hiQ);
    const span = hi - lo;
    if (span <= 1e-12) return 0;
    return clamp01((raw - lo) / span);
  }
}

/**
 * Normalize a positive value by the rolling p95 of its own history (floor 0).
 * Used for per-band and spectral auto-gain; also scale-equivariant.
 */
export class PeakNormalizer {
  private readonly stats: RollingStats;
  private readonly q: number;

  constructor(capacity: number, q = 0.95) {
    this.stats = new RollingStats(capacity);
    this.q = q;
  }

  normalize(raw: number): number {
    this.stats.push(raw);
    const hi = this.stats.quantile(this.q);
    if (hi <= 1e-12) return 0;
    return clamp01(raw / hi);
  }
}
