/** Hard ceiling on a single frame's `dt`, in ms. */
export const MAX_DT_MS = 50;

/**
 * Clamp a frame delta to a sane ceiling. A tab returning to the foreground can
 * report a multi-second `dt`; clamping keeps physics/animation from jumping.
 * Pure — unit-testable without a DOM.
 */
export function clampDt(dtMs: number, maxMs: number = MAX_DT_MS): number {
  if (!Number.isFinite(dtMs) || dtMs < 0) return 0;
  return Math.min(dtMs, maxMs);
}

/** Consecutive thrown frames before the renderer is treated as gone, not glitchy. */
export const MAX_CONSECUTIVE_FRAME_FAILURES = 3;

/**
 * Failure policy: has the renderer thrown often enough in a row that we should
 * stop driving it? One bad frame is a hiccup (a transient validation error, a
 * scene mid-rebuild); three in a row means the backend is gone.
 *
 * Pure — unit-testable without a DOM or a GPU.
 */
export function shouldAbandonRenderer(
  consecutiveFailures: number,
  max: number = MAX_CONSECUTIVE_FRAME_FAILURES,
): boolean {
  return consecutiveFailures >= max;
}

/**
 * requestAnimationFrame driver with an explicit visibility pause.
 *
 * `rAF` already stops firing on a hidden tab, but we pause explicitly (and
 * resync the clock on return) so a wake-up never delivers a giant `dt` and the
 * loop resumes cleanly. Each tick receives a `dt` already clamped by
 * {@link clampDt}.
 *
 * Not unit-tested (jsdom's rAF/visibility are not faithful); {@link clampDt}
 * carries the testable logic.
 */
export class FrameLoop {
  private rafId = 0;
  private lastTs = 0;
  private running = false;
  private readonly maxDtMs: number;
  private readonly onVisibility = () => this.handleVisibility();

  private readonly onTickError: ((err: unknown) => void) | undefined;

  constructor(
    private readonly onTick: (dtMs: number) => void,
    opts?: { maxDtMs?: number; onTickError?: (err: unknown) => void },
  ) {
    this.maxDtMs = opts?.maxDtMs ?? MAX_DT_MS;
    this.onTickError = opts?.onTickError;
  }

  /** Begin (or resume) the loop. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTs = performance.now();
    document.addEventListener('visibilitychange', this.onVisibility);
    this.schedule();
  }

  /** Stop the loop and detach listeners. */
  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /** True while the loop is scheduling frames. */
  get isRunning(): boolean {
    return this.running;
  }

  private schedule(): void {
    this.rafId = requestAnimationFrame(this.frame);
  }

  private readonly frame = (ts: number): void => {
    if (!this.running) return;
    if (document.hidden) {
      // Paused; visibilitychange will resync and reschedule.
      this.rafId = 0;
      return;
    }
    const dt = clampDt(ts - this.lastTs, this.maxDtMs);
    this.lastTs = ts;
    // A thrown frame must NOT kill the loop (T13). This used to call `onTick(dt)`
    // bare, immediately before `schedule()` — so the first throw from inside
    // three's render ended rAF forever and left a frozen black canvas with no
    // surface reporting it. We now report and keep scheduling; the owner of
    // `onTickError` decides when repeated failures mean "stop" (see
    // {@link shouldAbandonRenderer}).
    try {
      this.onTick(dt);
    } catch (err) {
      this.onTickError?.(err);
    }
    this.schedule();
  };

  private handleVisibility(): void {
    if (!this.running) return;
    if (document.hidden) {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    } else {
      // Resync the clock so the first frame back has a small dt, then resume.
      this.lastTs = performance.now();
      if (!this.rafId) this.schedule();
    }
  }
}
