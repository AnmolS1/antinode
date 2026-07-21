/**
 * Long-run soak (task "Automated" §): chromium, NIGHTLY / MANUAL — never per-PR.
 * Self-gated on `process.env.SOAK` so a normal `playwright test` run skips it.
 *
 * Run it with:  SOAK=1 npx playwright test soak --project=chromium
 * CI wires this into a scheduled (nightly) job, not the PR matrix.
 *
 * Asserts, over a sustained fixture loop: no unbounded `performance.memory`
 * growth, no fps decay > 10%, and a live, non-frozen canvas throughout. The
 * duration is shortened to a few minutes by default (SOAK_MINUTES overrides up to
 * the spec'd 20-minute run for the real nightly).
 */
import { test, expect } from '@playwright/test';
import { reachLiveWithFile, expectCanvasRenders } from './helpers';

const SOAK = !!process.env.SOAK;
const MINUTES = Number(process.env.SOAK_MINUTES ?? '3');

test.describe('long-run soak (nightly/manual)', () => {
  test.skip(!SOAK, 'soak is opt-in: set SOAK=1 (nightly job), not run per-PR');
  test.skip(({ browserName }) => browserName !== 'chromium', 'soak is chromium-only (performance.memory)');

  test('sustained loop: stable memory, fps, and a live canvas', async ({ page }) => {
    test.setTimeout((MINUTES + 2) * 60_000);
    await reachLiveWithFile(page);
    await page.waitForTimeout(3_000); // warm-up

    const sample = () =>
      page.evaluate(() => {
        const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        return { heap: mem?.usedJSHeapSize ?? 0, t: performance.now() };
      });

    // Rough fps via rAF count over 1s.
    const fps = () =>
      page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            let n = 0;
            const t0 = performance.now();
            const tick = () => {
              n += 1;
              if (performance.now() - t0 >= 1_000) resolve(n);
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
      );

    const first = await sample();
    const fpsStart = await fps();

    const end = Date.now() + MINUTES * 60_000;
    let last = first;
    while (Date.now() < end) {
      await page.waitForTimeout(15_000);
      last = await sample();
      await expectCanvasRenders(page, 'soak canvas'); // never freezes / goes blank
    }

    const fpsEnd = await fps();

    // Heap should not run away (allow 2× headroom for GC sawtooth).
    if (first.heap > 0) {
      expect(last.heap, 'heap did not grow unbounded').toBeLessThan(first.heap * 2.0);
    }
    // fps must not decay more than 10%.
    expect(fpsEnd, 'fps decay < 10%').toBeGreaterThanOrEqual(fpsStart * 0.9);
  });
});
