/**
 * Heritage scene — pure CPU mapping helpers (no Three.js imports).
 *
 * This module is the regression-critical core of the 2023 → TSL port: the
 * duplicate-vertex dedup, the 64→256 spectrum upsample, the zigzag
 * spectrum→vertex mapping, and the loudness→scale transfer curve. It is kept
 * Three-free on purpose so it can be unit-tested in jsdom (no GPU) — the GPU
 * assembly lives in `nodes.ts` / `index.ts`.
 *
 * Provenance references below are to the original `src/index.js` at git tag
 * `v0-2023-cra` (the CRA visualizer).
 */

/** Length of the compat spectrum table the 2023 zigzag expects (`maxNum + 1`). */
export const COMPAT_LEN = 256;
/** Number of bins in T02's normalized spectrum ({@link FrameFeatures.spectrum}). */
export const SRC_BINS = 64;

/** 2023 zigzag ramp width (`var maxNum = 255`). */
const ZIGZAG_MAX = 255;
/** 2023 high-bin cutoff (`(num > 150) ? 0 : ...`) — top ~40% of the ramp is dead. */
const BIN_CUTOFF = 150;
/** 2023 read offset (`this.spectrums[num + 20]`). */
const BIN_OFFSET = 20;
/** 2023 per-index decay divisor (`spectrum - i/80`). */
const DECAY_DIV = 80;

/**
 * The old `frequencyAvg` → `uScale` chain had three magic gains: `×1.2` (per
 * bin), then `×1.7` (post-average), then `×1.7` again into `uScale`. Product =
 * 3.468. Kept as one named constant so the transfer curve is legible.
 * (index.js `_render`: `frequencyAvg += spectrum * 1.2; … *= 1.7; uScale = … * 1.7`.)
 */
export const HERITAGE_UAVG_GAIN = 1.2 * 1.7 * 1.7;
/** The inner-shell scale chain used only two of the gains (`×1.2 ×1.7`). */
export const HERITAGE_INNER_GAIN = 1.2 * 1.7;
/** Old inner-shell scale divisor (`mesh_2.scale = 1 + frequencyAvg / 290`). */
export const HERITAGE_INNER_DIV = 290;

/**
 * A/B tunable. The 2023 chain summed raw 0–255 FFT magnitudes; T02 instead hands
 * us a percentile-normalized `loudNorm` in 0–1. This constant maps `loudNorm = 1`
 * onto the old average-magnitude domain (≈72 of 255 was a loud-but-not-clipping
 * frame). Tune against the A/B composite (see task acceptance) until the sphere's
 * breathing amplitude matches the original; the transfer *shape* is fixed by
 * {@link HERITAGE_UAVG_GAIN}, only this reference amplitude is free.
 */
export const HERITAGE_LOUD_REF = 72;

/**
 * The 2023 `uScale` uniform, reconstructed from `loudNorm`.
 * `uScale = loudNorm · HERITAGE_LOUD_REF · HERITAGE_UAVG_GAIN`.
 * Exposed for tests + documentation; the live GPU path multiplies the same
 * constants onto `bridge.uLoud` (see `nodes.ts`).
 */
export function uScaleFromLoud(loudNorm: number): number {
  return loudNorm * HERITAGE_LOUD_REF * HERITAGE_UAVG_GAIN;
}

/**
 * The 2023 inner-shell scale pulse, reconstructed from `loudNorm`.
 * `1 + (loudNorm · HERITAGE_LOUD_REF · HERITAGE_INNER_GAIN) / HERITAGE_INNER_DIV`.
 */
export function innerScaleFromLoud(loudNorm: number): number {
  return 1 + (loudNorm * HERITAGE_LOUD_REF * HERITAGE_INNER_GAIN) / HERITAGE_INNER_DIV;
}

/** Result of {@link detectIndex}: per-slot unique id + the unique count. */
export interface DedupResult {
  /** For each geometry vertex slot, the id of the unique position it shares. */
  slotUnique: Int32Array;
  /** Number of distinct positions (the zigzag iterates over these). */
  uniqueCount: number;
}

/**
 * Port of the 2023 `detectIndex` / `detectVec` pair. `IcosahedronGeometry` is
 * non-indexed, so every shared vertex appears once per incident triangle. To
 * make the wireframe displace *coherently* (no cracks along shared edges), all
 * slots at the same position must receive the same per-frame frequency. This
 * assigns each unique position an id **in first-seen order** — identical to the
 * original's `vecCount++` sequence — and records, per slot, which unique id it
 * belongs to.
 *
 * The original did an O(n²) linear search (`detectVec`); we use a Map keyed by
 * the raw coordinate triple. JS string coercion collapses `-0`→`"0"`, matching
 * the original's `===` (where `-0 === 0`), so the unique numbering is identical.
 *
 * @param positions the geometry's flat `position` array (x,y,z per slot)
 */
export function detectIndex(positions: ArrayLike<number>): DedupResult {
  const slotCount = Math.floor(positions.length / 3);
  const slotUnique = new Int32Array(slotCount);
  const seen = new Map<string, number>();
  let next = 0;
  for (let s = 0; s < slotCount; s += 1) {
    const x = positions[s * 3] ?? 0;
    const y = positions[s * 3 + 1] ?? 0;
    const z = positions[s * 3 + 2] ?? 0;
    const key = `${x},${y},${z}`;
    let id = seen.get(key);
    if (id === undefined) {
      id = next;
      next += 1;
      seen.set(key, id);
    }
    slotUnique[s] = id;
  }
  return { slotUnique, uniqueCount: next };
}

/**
 * Upsample T02's 64-bin normalized spectrum (0–1) into the 256-wide 0–255 table
 * the 2023 zigzag arithmetic expects, writing into `out` (length
 * {@link COMPAT_LEN}) with zero allocation.
 *
 * Mapping (documented so the visual weight lands on the same vertices): the old
 * code only ever read compat indices `20..170` (`spectrums[num + 20]`, `num` in
 * `0..150`), i.e. the low-mid region of its 1024-bin linear FFT. We stretch the
 * 64 log-spaced bins linearly across all 256 entries (nearest-bin hold) and
 * rescale 0–1 → 0–255, so the downstream index math in {@link fillFrequencies}
 * stays byte-for-byte the original's. The precise bin→band alignment is the
 * single remaining A/B tunable; the *structure* (which vertices are driven by
 * which end of the spectrum) is fixed here.
 *
 * @param spectrum64 T02 spectrum, 0–1 normalized (length {@link SRC_BINS})
 * @param out preallocated compat table (length {@link COMPAT_LEN}); overwritten
 */
export function spectrumCompat(spectrum64: ArrayLike<number>, out: Float32Array): void {
  for (let p = 0; p < COMPAT_LEN; p += 1) {
    const b = Math.min(SRC_BINS - 1, Math.floor((p / COMPAT_LEN) * SRC_BINS));
    out[p] = (spectrum64[b] ?? 0) * 255;
  }
}

/**
 * Port of the 2023 per-vertex frequency assignment (index.js `_render` loop).
 * For each unique vertex `i`, a mirrored zigzag picks a compat index (`num`
 * ramps 0→255→0…), the top of each ramp is zeroed (`num > 150`), and the value
 * is index-decayed (`- i/80`). Writes into `freqByUnique` (length ≥
 * `uniqueCount`) with zero allocation.
 *
 * Note: the original also accumulated `frequencyAvg` here to drive `uScale`;
 * that global is now sourced from `loudNorm` (see {@link uScaleFromLoud}), so it
 * is intentionally omitted — only the *per-vertex* mapping remains here.
 *
 * @param compat the 0–255 compat table from {@link spectrumCompat}
 * @param freqByUnique output, one displacement input per unique vertex
 * @param uniqueCount number of unique vertices (from {@link detectIndex})
 */
export function fillFrequencies(
  compat: ArrayLike<number>,
  freqByUnique: Float32Array,
  uniqueCount: number,
): void {
  for (let i = 0; i < uniqueCount; i += 1) {
    const mult = Math.floor(i / ZIGZAG_MAX);
    const ramp = i - ZIGZAG_MAX * mult;
    const num = mult % 2 === 0 ? ramp : ZIGZAG_MAX - ramp;
    const raw = num > BIN_CUTOFF ? 0 : compat[num + BIN_OFFSET] ?? 0;
    freqByUnique[i] = Math.max(0, raw - i / DECAY_DIV);
  }
}
