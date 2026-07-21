import { RollingStats } from './normalize';

/** WCAG 2.3.1 flash ceiling: no more than three onsets per second. */
export const MAX_ONSETS_PER_SEC = 3;
/** Hard minimum spacing between emitted onsets (seconds). */
export const MIN_ONSET_INTERVAL = 1 / MAX_ONSETS_PER_SEC;

/**
 * Half-wave-rectified spectral flux between two spectra: the sum of positive
 * bin-to-bin increases. Fed the 64 log bins, equal weighting is effectively
 * band-balanced (one term per octave-ish), so onsets across the spectrum count
 * comparably rather than being dominated by raw bass energy.
 */
export function spectralFlux(cur: Float32Array, prev: Float32Array, n: number): number {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const d = (cur[i] ?? 0) - (prev[i] ?? 0);
    if (d > 0) sum += d;
  }
  return sum;
}

/**
 * Adaptive-threshold onset detector with a hard flash guard.
 *
 * A frame is an onset when its flux exceeds a rolling `median + k·MAD`
 * threshold (window ~1.5 s), is a local peak, and at least
 * {@link MIN_ONSET_INTERVAL} has passed since the last onset. The flash guard
 * is enforced here in the engine — not left to scene courtesy.
 */
export class OnsetDetector {
  private readonly stats: RollingStats;
  private readonly k: number;
  private prevFlux = 0;
  private lastOnsetT = Number.NEGATIVE_INFINITY;

  /**
   * @param windowFrames rolling window length in frames (~1.5 s).
   * @param k            MAD multiplier for the adaptive threshold.
   */
  constructor(windowFrames: number, k = 2.5) {
    this.stats = new RollingStats(Math.max(4, windowFrames));
    this.k = k;
  }

  /**
   * @param flux current frame's spectral flux.
   * @param t    frame time in seconds.
   * @returns true on a thresholded, peak, flash-guarded onset.
   */
  process(flux: number, t: number): boolean {
    const f = Number.isFinite(flux) ? flux : 0;
    const median = this.stats.quantile(0.5);
    const mad = this.stats.mad(median);
    // Small absolute floor so a dead-silent window can't fire on numeric noise.
    const threshold = median + this.k * (mad + 1e-9) + 1e-6;

    const isPeak = f > this.prevFlux;
    const guardOk = t - this.lastOnsetT >= MIN_ONSET_INTERVAL;
    const onset = f > threshold && isPeak && guardOk;

    if (onset) this.lastOnsetT = t;
    this.stats.push(f);
    this.prevFlux = f;
    return onset;
  }
}
