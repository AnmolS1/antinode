import { DataTexture, FloatType, NearestFilter, RedFormat } from 'three';
import { texture, uniform, vec2 } from 'three/tsl';

import type { FrameFeatures } from '../../contracts';

/** Number of spectrum bins carried in {@link FrameFeatures.spectrum}. */
export const SPECTRUM_BINS = 64;

/**
 * Bridges the per-frame {@link FrameFeatures} payload into GPU-visible state for
 * TSL node materials:
 *
 * - scalar features → TSL `uniform()` nodes (`uBass`, `uMid`, `uOnset`, …), and
 * - the 64-bin spectrum → a single `R32F` {@link DataTexture}, updated *in
 *   place* every frame (its backing `Float32Array` is allocated once).
 *
 * Scenes read the spectrum through {@link spectrumAt}, a stable TSL accessor
 * that is identical on both backends. `update()` performs exactly one write pass
 * with zero per-frame allocation, so it is safe on the hot path.
 *
 * (A WebGPU storage-buffer fast path for the spectrum is described in the spec;
 * the `DataTexture` path here works on both backends and keeps `spectrumAt`
 * backend-agnostic. The storage-buffer variant is deferred — it can slot in
 * behind the same accessor without touching scene code.)
 */
export class FeatureUniforms {
  /** Low-band energy, 0–1. */
  readonly uBass = uniform(0);
  /** Low-mid-band energy, 0–1. */
  readonly uLowMid = uniform(0);
  /** Mid-band energy, 0–1. */
  readonly uMid = uniform(0);
  /** High-band energy, 0–1. */
  readonly uHigh = uniform(0);
  /** Raw RMS loudness. */
  readonly uRms = uniform(0);
  /** Percentile-normalized loudness, 0–1. */
  readonly uLoud = uniform(0);
  /** Spectral flux. */
  readonly uFlux = uniform(0);
  /** Onset gate, 0 or 1 (float for shader use). */
  readonly uOnset = uniform(0);
  /** Beat phase, 0–1. */
  readonly uBeatPhase = uniform(0);
  /** Estimated tempo in BPM (0 until locked). */
  readonly uBpm = uniform(0);
  /** Audio-clock time in seconds. */
  readonly uTime = uniform(0);

  /** The spectrum texture backing store, allocated once and reused. */
  private readonly spectrumData = new Float32Array(SPECTRUM_BINS);

  /** 64×1 R32F texture holding the current spectrum; sampled by {@link spectrumAt}. */
  readonly spectrumTexture: DataTexture;

  constructor() {
    this.spectrumTexture = new DataTexture(
      this.spectrumData,
      SPECTRUM_BINS,
      1,
      RedFormat,
      FloatType,
    );
    // Nearest sampling so a bin-centered fetch returns that exact texel.
    this.spectrumTexture.magFilter = NearestFilter;
    this.spectrumTexture.minFilter = NearestFilter;
    this.spectrumTexture.generateMipmaps = false;
    this.spectrumTexture.needsUpdate = true;
  }

  /**
   * TSL accessor for spectrum bin `index` (0–63). Returns a float node reading
   * the red channel at that bin's texel center. Stable across both backends —
   * scenes never touch the texture directly.
   */
  spectrumAt(index: number) {
    const u = (index + 0.5) / SPECTRUM_BINS;
    return texture(this.spectrumTexture, vec2(u, 0.5)).r;
  }

  /**
   * Push one frame of features into the uniforms and the spectrum texture.
   * Exactly one update pass; no allocation. Call once per frame, before scenes
   * read the values.
   */
  update(f: FrameFeatures): void {
    this.uBass.value = f.bands.bass;
    this.uLowMid.value = f.bands.lowMid;
    this.uMid.value = f.bands.mid;
    this.uHigh.value = f.bands.high;
    this.uRms.value = f.rms;
    this.uLoud.value = f.loudNorm;
    this.uFlux.value = f.flux;
    this.uOnset.value = f.onset ? 1 : 0;
    this.uBeatPhase.value = f.beat.phase;
    this.uBpm.value = f.beat.bpm ?? 0;
    this.uTime.value = f.t;

    const src = f.spectrum;
    const n = Math.min(SPECTRUM_BINS, src.length);
    for (let i = 0; i < n; i += 1) {
      this.spectrumData[i] = src[i] ?? 0;
    }
    this.spectrumTexture.needsUpdate = true;
  }

  /** Free the spectrum texture. */
  dispose(): void {
    this.spectrumTexture.dispose();
  }
}
