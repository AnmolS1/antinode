/**
 * Adaptive quality governor.
 *
 * Watches a rolling window of frame times and, when the p75 exceeds the frame
 * budget, steps *down* a fixed ladder: first device pixel ratio, then internal
 * render scale, then a scene-declared `quality` param (0–1) that scenes may use
 * to cut particle counts. Recovery is hysteretic — it only steps back up after a
 * sustained run under a lower recovery threshold, so it never oscillates.
 *
 * The stepping math is a pure function ({@link decideStep}) over a plain state
 * object, so it is fully unit-testable without a GPU. {@link QualityGovernor}
 * is the stateful wrapper the render loop feeds one `dt` per frame.
 */

/** One rung of the quality ladder. All multipliers are ≤ 1 (1 = full quality). */
export interface QualityLevel {
  /** Multiplier applied to the capped device pixel ratio. */
  dprScale: number;
  /** Multiplier applied to the internal render resolution. */
  renderScale: number;
  /** Scene-facing quality param, 0–1. */
  sceneQuality: number;
}

/**
 * The fixed degradation ladder. Index 0 is full quality. The order encodes the
 * spec's priority: shed DPR first (cheapest visual cost), then render scale,
 * then ask the scene to do less.
 */
export const QUALITY_LADDER: readonly QualityLevel[] = [
  { dprScale: 1.0, renderScale: 1.0, sceneQuality: 1.0 },
  { dprScale: 0.75, renderScale: 1.0, sceneQuality: 1.0 },
  { dprScale: 0.5, renderScale: 1.0, sceneQuality: 1.0 },
  { dprScale: 0.5, renderScale: 0.85, sceneQuality: 1.0 },
  { dprScale: 0.5, renderScale: 0.7, sceneQuality: 1.0 },
  { dprScale: 0.5, renderScale: 0.7, sceneQuality: 0.6 },
  { dprScale: 0.5, renderScale: 0.7, sceneQuality: 0.35 },
];

/** Mutable control state carried between frames. */
export interface GovernorState {
  /** Current ladder index. */
  level: number;
  /** Consecutive over-budget samples since the last change. */
  overCount: number;
  /** Consecutive comfortably-under-budget samples since the last change. */
  underCount: number;
}

/** Tunables for {@link decideStep}. */
export interface GovernorConfig {
  /** Frame budget in ms; p75 above this is "over budget". Default 16.6 (60fps). */
  budgetMs: number;
  /** Recovery threshold in ms; p75 below this counts toward stepping back up. */
  recoverMs: number;
  /** Consecutive over-budget samples required before a step down. */
  stepDownAfter: number;
  /** Consecutive under-recovery samples required before a step up. */
  stepUpAfter: number;
  /** Highest ladder index that may be reached. */
  maxLevel: number;
}

export const DEFAULT_GOVERNOR_CONFIG: GovernorConfig = {
  budgetMs: 16.6,
  recoverMs: 12.0,
  stepDownAfter: 3,
  stepUpAfter: 8,
  maxLevel: QUALITY_LADDER.length - 1,
};

/** Ascending numeric comparator, hoisted so `sort` allocates no closure per call. */
const ASC = (a: number, b: number): number => a - b;

/** Nearest-rank index into a length-`n` sorted series for percentile `p` (0–1). */
function nearestRankIndex(n: number, p: number): number {
  const clampedP = Math.min(1, Math.max(0, p));
  const rank = Math.ceil(clampedP * n);
  return Math.min(n - 1, Math.max(0, rank - 1));
}

/**
 * The p-th percentile of `values` by nearest-rank. Non-mutating.
 * @param values sample list (need not be sorted)
 * @param p percentile in 0–1
 * @returns the percentile value, or 0 for an empty list
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort(ASC);
  return sorted[nearestRankIndex(sorted.length, p)] ?? 0;
}

/**
 * Pure transition: given the current control state and the latest p75 frame
 * time, return the next state. Over budget accrues toward a step down; under the
 * recovery threshold accrues toward a step up; the neutral band decays both
 * counters so only *sustained* pressure moves the level.
 */
export function decideStep(
  state: GovernorState,
  p75Ms: number,
  cfg: GovernorConfig,
): GovernorState {
  let { level, overCount, underCount } = state;

  if (p75Ms > cfg.budgetMs) {
    overCount += 1;
    underCount = 0;
    if (overCount >= cfg.stepDownAfter && level < cfg.maxLevel) {
      level += 1;
      overCount = 0;
    }
  } else if (p75Ms < cfg.recoverMs) {
    underCount += 1;
    overCount = 0;
    if (underCount >= cfg.stepUpAfter && level > 0) {
      level -= 1;
      underCount = 0;
    }
  } else {
    // Neutral band: relax both counters so a brief spike/dip doesn't latch.
    overCount = Math.max(0, overCount - 1);
    underCount = Math.max(0, underCount - 1);
  }

  return { level, overCount, underCount };
}

/**
 * Stateful governor for the render loop. Feed it one frame time per frame via
 * {@link sample}; read the active {@link QualityLevel} and control signal via
 * {@link level} / {@link p75} / {@link fps}. It only re-evaluates once the
 * rolling window is warm, so early frames don't cause spurious downgrades.
 */
export class QualityGovernor {
  private readonly window: number;
  private readonly cfg: GovernorConfig;
  private readonly ring: number[] = [];
  /** Reused sort buffer so the steady-state hot path allocates nothing. */
  private readonly scratch: number[] = [];
  private cursor = 0;
  private readonly state: GovernorState = { level: 0, overCount: 0, underCount: 0 };
  private lastP75 = 0;
  private emaFps = 60;

  constructor(opts?: { windowSize?: number; config?: Partial<GovernorConfig> }) {
    this.window = opts?.windowSize ?? 60;
    this.cfg = { ...DEFAULT_GOVERNOR_CONFIG, ...opts?.config };
  }

  /**
   * Record one frame time (ms) and re-evaluate the quality level.
   * @returns true if the level changed this call.
   */
  sample(dtMs: number): boolean {
    const clamped = Math.max(0, dtMs);
    if (this.ring.length < this.window) {
      this.ring.push(clamped);
    } else {
      this.ring[this.cursor] = clamped;
      this.cursor = (this.cursor + 1) % this.window;
    }

    const instFps = clamped > 0 ? 1000 / clamped : 60;
    this.emaFps = this.emaFps * 0.9 + instFps * 0.1;

    // Only steer once the window is warm.
    if (this.ring.length < this.window) return false;

    this.lastP75 = this.p75InPlace();
    const prevLevel = this.state.level;
    // Mutates `this.state` in place (no per-frame allocation); mirrors the pure
    // {@link decideStep} used by tests.
    this.stepInPlace(this.lastP75);
    return this.state.level !== prevLevel;
  }

  /** Rolling p75 over the warm ring, computed into the reused scratch buffer. */
  private p75InPlace(): number {
    const n = this.ring.length;
    if (n === 0) return 0;
    const s = this.scratch;
    for (let i = 0; i < n; i += 1) s[i] = this.ring[i]!;
    s.length = n;
    s.sort(ASC);
    return s[nearestRankIndex(n, 0.75)] ?? 0;
  }

  /** In-place counterpart to {@link decideStep} — same logic, no allocation. */
  private stepInPlace(p75Ms: number): void {
    const st = this.state;
    const cfg = this.cfg;
    if (p75Ms > cfg.budgetMs) {
      st.overCount += 1;
      st.underCount = 0;
      if (st.overCount >= cfg.stepDownAfter && st.level < cfg.maxLevel) {
        st.level += 1;
        st.overCount = 0;
      }
    } else if (p75Ms < cfg.recoverMs) {
      st.underCount += 1;
      st.overCount = 0;
      if (st.underCount >= cfg.stepUpAfter && st.level > 0) {
        st.level -= 1;
        st.underCount = 0;
      }
    } else {
      st.overCount = Math.max(0, st.overCount - 1);
      st.underCount = Math.max(0, st.underCount - 1);
    }
  }

  /** The active ladder index. */
  get levelIndex(): number {
    return this.state.level;
  }

  /** The active quality multipliers. */
  get level(): QualityLevel {
    return QUALITY_LADDER[this.state.level] ?? QUALITY_LADDER[0]!;
  }

  /** The most recent rolling p75 frame time in ms. */
  get p75(): number {
    return this.lastP75;
  }

  /** Smoothed frames-per-second. */
  get fps(): number {
    return this.emaFps;
  }

  /** Reset the window and level (e.g. after a scene switch). */
  reset(): void {
    this.ring.length = 0;
    this.scratch.length = 0;
    this.cursor = 0;
    this.state.level = 0;
    this.state.overCount = 0;
    this.state.underCount = 0;
    this.lastP75 = 0;
  }
}
