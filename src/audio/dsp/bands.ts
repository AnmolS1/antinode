/**
 * Frequency mapping: FFT magnitude bins → 64 log-spaced spectrum bins and the
 * four coarse energy bands. Pure and allocation-free after construction.
 */

/** Number of log-spaced spectrum bins in {@link FrameFeatures.spectrum}. */
export const SPECTRUM_BINS = 64;

/** Lowest analysed frequency (Hz). */
export const MIN_HZ = 20;
/** Highest analysed frequency (Hz). */
export const MAX_HZ = 16_000;

/** Coarse band edges (Hz), inclusive-low / exclusive-high. */
export const BAND_EDGES = {
  bass: [20, 160],
  lowMid: [160, 630],
  mid: [630, 2_500],
  high: [2_500, 16_000],
} as const;

export type BandName = keyof typeof BAND_EDGES;
export const BAND_NAMES: readonly BandName[] = ['bass', 'lowMid', 'mid', 'high'];

/**
 * Precomputes the FFT-bin ranges for each of the 64 log bins and the 4 bands,
 * given an FFT size and sample rate, then maps a magnitude spectrum onto them.
 */
export class BandMapper {
  readonly sampleRate: number;
  readonly fftBins: number;
  /** For each of the 64 log bins: [startBin, endBin) into the FFT magnitude array. */
  private readonly binStart: Uint32Array;
  private readonly binEnd: Uint32Array;
  /** For each band, [startBin, endBin). */
  private readonly bandStart: Uint32Array;
  private readonly bandEnd: Uint32Array;

  /**
   * @param fftSize    FFT length (magnitude array length is fftSize/2).
   * @param sampleRate audio sample rate in Hz.
   */
  constructor(fftSize: number, sampleRate: number) {
    this.sampleRate = sampleRate;
    this.fftBins = fftSize >> 1;
    const hzPerBin = sampleRate / fftSize;

    this.binStart = new Uint32Array(SPECTRUM_BINS);
    this.binEnd = new Uint32Array(SPECTRUM_BINS);
    const logMin = Math.log(MIN_HZ);
    const logMax = Math.log(MAX_HZ);
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const loHz = Math.exp(logMin + ((logMax - logMin) * i) / SPECTRUM_BINS);
      const hiHz = Math.exp(logMin + ((logMax - logMin) * (i + 1)) / SPECTRUM_BINS);
      let lo = Math.floor(loHz / hzPerBin);
      let hi = Math.ceil(hiHz / hzPerBin);
      lo = Math.max(1, Math.min(this.fftBins, lo));
      hi = Math.max(lo + 1, Math.min(this.fftBins, hi));
      this.binStart[i] = lo;
      this.binEnd[i] = hi;
    }

    this.bandStart = new Uint32Array(BAND_NAMES.length);
    this.bandEnd = new Uint32Array(BAND_NAMES.length);
    for (let b = 0; b < BAND_NAMES.length; b++) {
      const name = BAND_NAMES[b] as BandName;
      const [loHz, hiHz] = BAND_EDGES[name];
      const lo = Math.max(1, Math.min(this.fftBins, Math.floor(loHz / hzPerBin)));
      const hi = Math.max(lo + 1, Math.min(this.fftBins, Math.ceil(hiHz / hzPerBin)));
      this.bandStart[b] = lo;
      this.bandEnd[b] = hi;
    }
  }

  /**
   * Reduce an FFT magnitude spectrum to the 64 log bins (mean magnitude per bin),
   * writing into `out` (length {@link SPECTRUM_BINS}).
   */
  toLogBins(mag: Float32Array, out: Float32Array): void {
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const lo = this.binStart[i] ?? 0;
      const hi = this.binEnd[i] ?? lo;
      let sum = 0;
      let n = 0;
      for (let k = lo; k < hi; k++) {
        const v = mag[k] ?? 0;
        sum += v;
        n++;
      }
      out[i] = n > 0 ? sum / n : 0;
    }
  }

  /**
   * Sum band energy (magnitude²) into `out` (length 4, order = {@link BAND_NAMES}).
   */
  toBandEnergy(mag: Float32Array, out: Float32Array): void {
    for (let b = 0; b < BAND_NAMES.length; b++) {
      const lo = this.bandStart[b] ?? 0;
      const hi = this.bandEnd[b] ?? lo;
      let sum = 0;
      for (let k = lo; k < hi; k++) {
        const v = mag[k] ?? 0;
        sum += v * v;
      }
      out[b] = sum;
    }
  }
}
