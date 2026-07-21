/**
 * Minimal allocation-free radix-2 FFT + windowed magnitude spectrum.
 *
 * The live engine runs this over `AnalyserNode.getFloatTimeDomainData` (linear
 * PCM samples) rather than reading `getFloatFrequencyData` (which returns dB).
 * Doing our own transform means the exact code the unit tests exercise is the
 * code that runs in production — tests feed the same linear domain.
 *
 * All working buffers are preallocated in the constructor; `magnitude()`
 * allocates nothing on the hot path.
 */
export class Fft {
  readonly size: number;
  private readonly re: Float32Array;
  private readonly im: Float32Array;
  private readonly window: Float32Array;
  private readonly cos: Float32Array;
  private readonly sin: Float32Array;
  private readonly rev: Uint32Array;

  /** @param size FFT length; must be a power of two (e.g. 2048). */
  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0) {
      throw new Error(`Fft size must be a power of two, got ${size}`);
    }
    this.size = size;
    this.re = new Float32Array(size);
    this.im = new Float32Array(size);

    // Periodic Hann window (matches Web Audio's AnalyserNode convention).
    this.window = new Float32Array(size);
    for (let i = 0; i < size; i++) {
      this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / size));
    }

    // Precomputed twiddle factors and bit-reversal permutation.
    const half = size >> 1;
    this.cos = new Float32Array(half);
    this.sin = new Float32Array(half);
    for (let i = 0; i < half; i++) {
      this.cos[i] = Math.cos((-2 * Math.PI * i) / size);
      this.sin[i] = Math.sin((-2 * Math.PI * i) / size);
    }
    this.rev = new Uint32Array(size);
    let bits = 0;
    while (1 << bits < size) bits++;
    for (let i = 0; i < size; i++) {
      let x = i;
      let r = 0;
      for (let b = 0; b < bits; b++) {
        r = (r << 1) | (x & 1);
        x >>= 1;
      }
      this.rev[i] = r;
    }
  }

  /**
   * Compute the windowed magnitude spectrum of `time` into `out`.
   * @param time  linear PCM samples, length === size (extra samples ignored).
   * @param out   destination, length === size/2; magnitudes normalized by size.
   */
  magnitude(time: Float32Array, out: Float32Array): void {
    const n = this.size;
    const re = this.re;
    const im = this.im;
    const rev = this.rev;
    const win = this.window;

    // Windowed, bit-reversed load.
    for (let i = 0; i < n; i++) {
      const j = rev[i] ?? 0;
      const s = time[i] ?? 0;
      const w = win[i] ?? 0;
      re[j] = s * w;
      im[j] = 0;
    }

    // Iterative Cooley-Tukey butterflies.
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1;
      const step = n / len;
      for (let i = 0; i < n; i += len) {
        let k = 0;
        for (let j = i; j < i + half; j++) {
          const c = this.cos[k] ?? 1;
          const s = this.sin[k] ?? 0;
          const l = j + half;
          const tre = (re[l] ?? 0) * c - (im[l] ?? 0) * s;
          const tim = (re[l] ?? 0) * s + (im[l] ?? 0) * c;
          const ure = re[j] ?? 0;
          const uim = im[j] ?? 0;
          re[j] = ure + tre;
          im[j] = uim + tim;
          re[l] = ure - tre;
          im[l] = uim - tim;
          k += step;
        }
      }
    }

    const half = n >> 1;
    const inv = 1 / n;
    for (let i = 0; i < half; i++) {
      const r = re[i] ?? 0;
      const m = im[i] ?? 0;
      out[i] = Math.sqrt(r * r + m * m) * inv;
    }
  }
}
