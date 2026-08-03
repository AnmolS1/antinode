/**
 * T13: the frame-loop failure policy.
 *
 * `FrameLoop` itself is not unit-tested (jsdom's rAF/visibility are not
 * faithful — see its own doc comment); the decision it delegates to is pure and
 * is tested here.
 */
import { describe, expect, it } from 'vitest';

import { MAX_CONSECUTIVE_FRAME_FAILURES, shouldAbandonRenderer } from '../../src/render/loop/FrameLoop';

describe('shouldAbandonRenderer', () => {
  it('tolerates failures below the threshold', () => {
    expect(shouldAbandonRenderer(0)).toBe(false);
    expect(shouldAbandonRenderer(1)).toBe(false);
    expect(shouldAbandonRenderer(MAX_CONSECUTIVE_FRAME_FAILURES - 1)).toBe(false);
  });

  it('abandons at and beyond the threshold', () => {
    expect(shouldAbandonRenderer(MAX_CONSECUTIVE_FRAME_FAILURES)).toBe(true);
    expect(shouldAbandonRenderer(MAX_CONSECUTIVE_FRAME_FAILURES + 10)).toBe(true);
  });

  it('honours an explicit max', () => {
    expect(shouldAbandonRenderer(1, 1)).toBe(true);
    expect(shouldAbandonRenderer(4, 5)).toBe(false);
  });
});
