import type { BeatInfo } from '../contracts';
import { RollingStats, clamp01 } from './dsp/normalize';

const MIN_BPM = 60;
const MAX_BPM = 180;
const MIN_PERIOD = 60 / MAX_BPM; // 0.333 s
const MAX_PERIOD = 60 / MIN_BPM; // 1.0 s

/** Fold an inter-onset interval into the primary tempo octave [MIN, MAX] period. */
function foldPeriod(interval: number): number {
  let p = interval;
  if (p <= 0) return MAX_PERIOD;
  while (p < MIN_PERIOD) p *= 2;
  while (p > MAX_PERIOD) p /= 2;
  return p;
}

/**
 * Tempo + beat-phase tracker.
 *
 * This pure estimator is the always-on producer of {@link BeatInfo}: it derives
 * BPM from the median inter-onset interval, tracks a beat anchor for phase, and
 * scores confidence from interval consistency. The live engine additionally
 * feeds it `hintBpm()` from `realtime-bpm-analyzer` (an AudioWorklet that cannot
 * run under jsdom); when a hint is present it is treated as the authority.
 */
export class TempoTracker {
  private readonly intervals: RollingStats;
  private lastOnsetT = Number.NaN;
  private anchorT = Number.NaN;
  private smoothedBpm: number | null = null;
  private hintedBpm: number | null = null;
  private onsetCount = 0;

  constructor(historyLen = 24) {
    this.intervals = new RollingStats(historyLen);
  }

  /** Register a detected onset at time `t` (seconds). */
  onOnset(t: number): void {
    if (Number.isFinite(this.lastOnsetT)) {
      const folded = foldPeriod(t - this.lastOnsetT);
      this.intervals.push(folded);
      const period = this.intervals.quantile(0.5);
      if (period > 1e-6) {
        const bpm = 60 / period;
        this.smoothedBpm = this.smoothedBpm == null ? bpm : this.smoothedBpm * 0.7 + bpm * 0.3;
      }
    }
    this.anchorT = t;
    this.lastOnsetT = t;
    this.onsetCount++;
  }

  /** Seed/override BPM from the realtime-bpm-analyzer (authority when present). */
  hintBpm(bpm: number): void {
    if (Number.isFinite(bpm) && bpm > 0) this.hintedBpm = bpm;
  }

  /** Clear all tempo state (on source switch). */
  reset(): void {
    this.lastOnsetT = Number.NaN;
    this.anchorT = Number.NaN;
    this.smoothedBpm = null;
    this.hintedBpm = null;
    this.onsetCount = 0;
  }

  private consistency(): number {
    const median = this.intervals.quantile(0.5);
    if (median <= 1e-6) return 0;
    const cv = this.intervals.mad(median) / median;
    return clamp01(1 - cv);
  }

  /** Write the current beat estimate into `out` (allocation-free). */
  writeBeat(t: number, out: BeatInfo): void {
    const bpm = this.hintedBpm ?? this.smoothedBpm;
    if (bpm == null || bpm <= 0) {
      out.bpm = null;
      out.phase = 0;
      out.confidence = 0;
      return;
    }
    const period = 60 / bpm;
    let phase = 0;
    if (Number.isFinite(this.anchorT)) {
      phase = ((t - this.anchorT) / period) % 1;
      if (phase < 0) phase += 1;
    }
    let confidence = clamp01(Math.min(1, this.onsetCount / 8)) * this.consistency();
    if (this.hintedBpm != null) confidence = Math.max(confidence, 0.7);
    out.bpm = bpm;
    out.phase = phase;
    out.confidence = confidence;
  }
}

/** Handle to a live tempo analyzer wired to the audio graph. */
export interface LiveTempo {
  stop(): void;
}

/**
 * Wire `realtime-bpm-analyzer` into the live graph, forwarding its detected BPM
 * to `onBpm` (typically `analyzer.hintBpm`). Loaded dynamically because it
 * installs an AudioWorklet (real AudioContext only) — it is never exercised by
 * the jsdom unit tests.
 */
export async function createLiveTempo(
  ctx: AudioContext,
  source: AudioNode,
  onBpm: (bpm: number) => void,
): Promise<LiveTempo> {
  const { createRealtimeBpmAnalyzer } = await import('realtime-bpm-analyzer');
  const analyzer = await createRealtimeBpmAnalyzer(ctx);
  source.connect(analyzer.node);
  const onEvent = (data: { bpm: readonly { tempo: number }[] }): void => {
    const top = data.bpm[0];
    if (top) onBpm(top.tempo);
  };
  analyzer.on('bpm', onEvent);
  analyzer.on('bpmStable', onEvent);
  return {
    stop(): void {
      try {
        analyzer.stop();
        analyzer.disconnect();
      } catch {
        /* analyzer already torn down */
      }
    },
  };
}
