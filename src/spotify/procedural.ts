/**
 * Metadata-procedural beat source (00-overview capture-ladder mode #5, source
 * kind `'procedural'`). Spotify's analysis endpoints are dead — there is no tempo
 * from the API — so when no real audio is capturable, motion is driven purely by
 * playback *position*: `progressAt` phase ramps over bars of an assumed 4/4 at a
 * BPM that comes from T02's estimate or the on-card tap-tempo.
 *
 * This module is a pure helper. At the Wave-B gate, T02 wraps `proceduralBeat`
 * into an `AudioSourceProvider` (silent node) or the engine reads it directly to
 * synthesize a `BeatInfo`/`FrameFeatures` phase. Kept dependency-free so it can be
 * unit-tested and so the audio engine — not this layer — owns the source contract.
 */
import type { BeatInfo } from '../contracts/features';

export const DEFAULT_BPM = 120;
const BEATS_PER_BAR = 4;

/** Position within the bar, 0–1 (0 = downbeat), from a playback position + BPM. */
export function barPhase(progressMs: number, bpm: number = DEFAULT_BPM): number {
  const safeBpm = bpm > 0 ? bpm : DEFAULT_BPM;
  const beatsElapsed = (progressMs / 60_000) * safeBpm;
  const barPos = (beatsElapsed / BEATS_PER_BAR) % 1;
  return barPos < 0 ? barPos + 1 : barPos;
}

/**
 * A synthetic {@link BeatInfo} from playback position — assumed 4/4, `phase` is the
 * position within the current beat. `confidence` is deliberately low: this is a
 * position-locked substitute, not a spectral measurement. `bpm` is null when the
 * caller has no tempo estimate yet (unresolved), matching the contract.
 */
export function proceduralBeat(progressMs: number, bpm: number | null): BeatInfo {
  if (bpm === null || bpm <= 0) {
    return { bpm: null, phase: 0, confidence: 0 };
  }
  const beatsElapsed = (progressMs / 60_000) * bpm;
  const phase = beatsElapsed - Math.floor(beatsElapsed);
  return { bpm, phase, confidence: 0.35 };
}
