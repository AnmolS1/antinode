/**
 * Drift-corrected playback clock — the "marginalia-note problem" solved properly.
 *
 * Spotify tells us `progress_ms` about once a second; between polls we must show a
 * smooth, monotonic position. Each poll re-anchors interpolation at the value we
 * were *already displaying* (so re-anchoring never jumps) and folds the server
 * correction in gently:
 *
 *   - forward drift → eased in (fraction ALPHA of the error)
 *   - tiny backward correction (≤ BACK_CLAMP_MS of displayed motion) → held (clamped),
 *     so normal jitter never rewinds the readout
 *   - a real backward move (a seek-back) or any discontinuity > HARD_RESYNC_MS
 *     → hard resync straight to the server value, and reported as a discontinuity
 *
 * `progressAt(now)` is pure in `now` and monotonic while playing. All timestamps
 * are `performance.now()` ms; the clock never reads the clock itself.
 */

/** Correction larger than this (either direction) is a seek/track boundary → snap. */
export const HARD_RESYNC_MS = 1500;
/** Displayed backward steps this small are suppressed (held) rather than rewound. */
export const BACK_CLAMP_MS = 120;
/** Fraction of the server error eased in per poll. */
export const ALPHA = 0.25;

export interface ClockSample {
  progressMs: number;
  durationMs: number;
  isPlaying: boolean;
  /** `performance.now()` when this sample was fetched. */
  fetchedAt: number;
}

export interface ClockUpdate {
  /** True when the sample was far enough off to force a hard resync (seek/track jump). */
  resync: boolean;
}

interface Anchor {
  progressMs: number;
  at: number;
  isPlaying: boolean;
  durationMs: number;
}

export class DriftClock {
  private anchor: Anchor | null = null;

  /** Reset to empty (e.g. on track change, so the next sample seeds fresh). */
  reset(): void {
    this.anchor = null;
  }

  hasAnchor(): boolean {
    return this.anchor !== null;
  }

  private seed(sample: ClockSample): void {
    this.anchor = {
      progressMs: sample.progressMs,
      at: sample.fetchedAt,
      isPlaying: sample.isPlaying,
      durationMs: sample.durationMs,
    };
  }

  /** Fold a poll result in. Returns whether it triggered a hard resync. */
  update(sample: ClockSample): ClockUpdate {
    if (!this.anchor) {
      this.seed(sample);
      return { resync: true };
    }

    const predicted = this.progressAt(sample.fetchedAt);
    const error = sample.progressMs - predicted;

    if (Math.abs(error) > HARD_RESYNC_MS) {
      this.seed(sample);
      return { resync: true };
    }

    let correction = error * ALPHA;
    if (correction < -BACK_CLAMP_MS) {
      // A meaningful backward move survived easing → a real seek-back; snap to it.
      this.seed(sample);
      return { resync: true };
    }
    if (correction < 0) correction = 0; // tiny backward jitter → hold, stay monotonic

    this.anchor = {
      progressMs: predicted + correction,
      at: sample.fetchedAt,
      isPlaying: sample.isPlaying,
      durationMs: sample.durationMs,
    };
    return { resync: false };
  }

  /** Interpolated progress at `now` (ms), clamped to [0, duration]. */
  progressAt(now: number): number {
    const a = this.anchor;
    if (!a) return 0;
    const raw = a.isPlaying ? a.progressMs + (now - a.at) : a.progressMs;
    if (raw < 0) return 0;
    if (raw > a.durationMs) return a.durationMs;
    return raw;
  }
}
