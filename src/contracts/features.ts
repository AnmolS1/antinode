/**
 * Per-band energy levels, each normalized to 0–1.
 * Produced by the audio engine (T02) and consumed by scenes (T06/T09) for
 * frequency-reactive motion (e.g. bass-driven scale, high-end shimmer).
 */
export interface BandLevels {
  /** Low frequencies (~20–150 Hz), 0–1 normalized. */
  bass: number;
  /** Low-mid frequencies (~150–500 Hz), 0–1 normalized. */
  lowMid: number;
  /** Mid frequencies (~500 Hz–2 kHz), 0–1 normalized. */
  mid: number;
  /** High frequencies (~2 kHz+), 0–1 normalized. */
  high: number;
} // 0–1 normalized

/**
 * Tempo/beat estimate for the current frame.
 * `bpm` is null until the engine has enough signal to lock a tempo.
 */
export interface BeatInfo {
  /** Estimated beats per minute, or null while unresolved. */
  bpm: number | null;
  /** Position within the current beat, 0–1. */
  phase: number;
  /** Confidence in the current tempo/phase estimate, 0–1. */
  confidence: number;
} // phase 0–1 within beat

/**
 * The single per-frame payload the audio engine (T02) emits and every scene
 * (T06/T09) consumes. One immutable snapshot of the sound at time `t`; this is
 * the hot-path contract between audio analysis and rendering.
 */
export interface FrameFeatures {
  /** Audio-clock time of this frame, in seconds. */
  t: number; // audio-clock seconds
  /** Raw root-mean-square loudness for the frame. */
  rms: number;
  /** Loudness mapped through a running percentile normalizer, 0–1. */
  loudNorm: number; // raw + percentile-normalized loudness
  /** Coarse per-band energy levels. */
  bands: BandLevels;
  /** 64 log-spaced spectrum bins, normalized and smoothed. */
  spectrum: Float32Array; // 64 log-spaced bins, normalized+smoothed
  /** Spectral flux (positive spectral change) for this frame. */
  flux: number;
  /** True on a thresholded onset; rate-limited by the flashGuard. */
  onset: boolean; // spectral flux + thresholded onset (flashGuard-limited)
  /** Tempo/beat estimate for this frame. */
  beat: BeatInfo;
  /** True when input has been sustained sub-threshold while a source is active. */
  silent: boolean; // silence: sustained sub-threshold input while a source is active
  reducedMotion: boolean; // engine-owned: user prefers reduced motion (prefers-reduced-motion). Scenes read this as the single source of truth instead of calling matchMedia themselves.
}
