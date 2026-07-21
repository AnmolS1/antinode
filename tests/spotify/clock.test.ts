import { describe, expect, it } from 'vitest';

import { BACK_CLAMP_MS, DriftClock, HARD_RESYNC_MS } from '../../src/spotify/clock';

const DURATION = 240_000;

function sample(progressMs: number, fetchedAt: number, isPlaying = true) {
  return { progressMs, durationMs: DURATION, isPlaying, fetchedAt };
}

/** Sweep progressAt across [from,to] and assert it never steps backward. */
function assertMonotonic(clock: DriftClock, from: number, to: number, step = 25): void {
  let prev = -Infinity;
  for (let t = from; t <= to; t += step) {
    const v = clock.progressAt(t);
    expect(v).toBeGreaterThanOrEqual(prev - 1e-6);
    prev = v;
  }
}

describe('DriftClock', () => {
  it('interpolates linearly while playing between polls', () => {
    const clock = new DriftClock();
    clock.update(sample(1000, 0));
    expect(clock.progressAt(0)).toBe(1000);
    expect(clock.progressAt(500)).toBe(1500);
    expect(clock.progressAt(1000)).toBe(2000);
  });

  it('holds position (does not advance) while paused', () => {
    const clock = new DriftClock();
    clock.update(sample(5000, 0, false));
    expect(clock.progressAt(0)).toBe(5000);
    expect(clock.progressAt(3000)).toBe(5000);
  });

  it('stays monotonic across a steady timeline', () => {
    const clock = new DriftClock();
    // Server perfectly tracks: each poll's progress == wall time since start.
    for (let t = 0; t <= 5000; t += 1000) {
      clock.update(sample(1000 + t, t));
      assertMonotonic(clock, t, t + 1000);
    }
  });

  it('eases in a small forward drift without a visible jump, staying monotonic', () => {
    const clock = new DriftClock();
    clock.update(sample(1000, 0));
    // At t=1000 we predict 2000 but the server says 2300 (300 ms ahead).
    const before = clock.progressAt(1000);
    clock.update(sample(2300, 1000));
    const after = clock.progressAt(1000);
    // Re-anchor happens at the previously-displayed value + eased correction; the
    // step is a fraction of 300 ms, never the full jump, and never backward.
    expect(after).toBeGreaterThanOrEqual(before);
    expect(after - before).toBeLessThan(300);
    assertMonotonic(clock, 1000, 2000);
  });

  it('clamps a tiny backward correction (jitter) — never rewinds', () => {
    const clock = new DriftClock();
    clock.update(sample(1000, 0));
    const predicted = clock.progressAt(1000); // 2000
    // Server reports 1950 — 50 ms behind (< BACK_CLAMP after easing) → held.
    clock.update(sample(predicted - 50, 1000));
    expect(clock.progressAt(1000)).toBe(predicted);
    expect(BACK_CLAMP_MS).toBeGreaterThan(0);
  });

  it('holds a mid-band backward correction rather than rewinding (smoothness over the literal 120 ms)', () => {
    // A ~300 ms raw backward error eases to ~75 ms — under the displayed-step
    // clamp — so we hold position (monotonic) instead of hard-resyncing. This is
    // the deliberate reading of the spec's "monotonic" over its literal 120 ms.
    const clock = new DriftClock();
    clock.update(sample(1000, 0));
    const predicted = clock.progressAt(1000); // 2000
    const res = clock.update(sample(predicted - 300, 1000));
    expect(res.resync).toBe(false);
    expect(clock.progressAt(1000)).toBe(predicted); // held, not rewound
  });

  it('hard-resyncs on a backward seek', () => {
    const clock = new DriftClock();
    clock.update(sample(60_000, 0));
    // User scrubs back to 10 s.
    const res = clock.update(sample(10_000, 1000));
    expect(res.resync).toBe(true);
    expect(clock.progressAt(1000)).toBe(10_000);
  });

  it('hard-resyncs on a large forward discontinuity beyond the threshold', () => {
    const clock = new DriftClock();
    clock.update(sample(1000, 0));
    const res = clock.update(sample(1000 + HARD_RESYNC_MS + 5000, 1000));
    expect(res.resync).toBe(true);
  });

  it('clamps interpolation to [0, duration]', () => {
    const clock = new DriftClock();
    clock.update(sample(DURATION - 100, 0));
    expect(clock.progressAt(10_000)).toBe(DURATION);
    clock.reset();
    expect(clock.progressAt(0)).toBe(0);
  });
});
