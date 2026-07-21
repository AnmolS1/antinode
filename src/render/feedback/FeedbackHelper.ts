import { HalfFloatType, LinearFilter, RenderTarget } from 'three';

/**
 * Ping-pong render-target utility with one API across both backends.
 *
 * Feedback effects (T09's Phosphor flow-field, and the T05 TouchDesigner
 * porting recipe) read last frame's output while writing this frame's — a
 * classic two-target swap. This helper exists here **once** so those tasks share
 * a single, tested implementation rather than each rolling their own.
 *
 * `read` is last frame's target (sample it); `write` is this frame's (render to
 * it); {@link swap} exchanges them at end of frame. Half-float targets preserve
 * the decaying-trail precision the phosphor look needs.
 */
export class FeedbackHelper {
  private a: RenderTarget;
  private b: RenderTarget;

  constructor(
    width: number,
    height: number,
    opts?: { type?: typeof HalfFloatType },
  ) {
    const make = (): RenderTarget =>
      new RenderTarget(Math.max(1, width), Math.max(1, height), {
        type: opts?.type ?? HalfFloatType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      });
    this.a = make();
    this.b = make();
  }

  /** Last frame's target — sample this as the feedback source. */
  get read(): RenderTarget {
    return this.a;
  }

  /** This frame's target — render into this. */
  get write(): RenderTarget {
    return this.b;
  }

  /** Exchange read/write. Call once per frame after rendering into `write`. */
  swap(): void {
    const tmp = this.a;
    this.a = this.b;
    this.b = tmp;
  }

  /** Resize both targets (e.g. on canvas resize / render-scale change). */
  setSize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.a.setSize(w, h);
    this.b.setSize(w, h);
  }

  /** Free both targets. */
  dispose(): void {
    this.a.dispose();
    this.b.dispose();
  }
}
