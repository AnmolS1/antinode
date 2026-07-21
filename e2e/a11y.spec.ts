/**
 * Accessibility & flash-safety (02-design "non-negotiable, tested in T10").
 *
 *   • axe (@axe-core/playwright) on picker / live chrome / shortcuts panel —
 *     zero serious/critical violations.
 *   • keyboard-only navigation reaches the source rungs.
 *   • prefers-reduced-motion emulation engages the low-motion program.
 *   • flashGuard re-verified E2E: the engine's onset rate over a strobe-bait
 *     fixture stays ≤ 3/s (WCAG 2.3.1), the surface that drives every strobe.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { reachLiveWithFile, STROBE_WAV, TONE_WAV, wavBase64, analyzeFixture } from './helpers';

function seriousOrCritical(results: { violations: { impact?: string | null; id: string; nodes: unknown[] }[] }) {
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

test.describe('axe — no serious/critical violations', () => {
  test('source picker (onboarding)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Antinode' })).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(seriousOrCritical(results)).toEqual([]);
  });

  test('live chrome', async ({ page }) => {
    await reachLiveWithFile(page);
    await page.waitForTimeout(500);
    // Tweakpane (.params-pane) is a third-party widget we do not own; excluded per
    // task guidance.
    const results = await new AxeBuilder({ page })
      .exclude('.params-pane')
      .analyze();
    expect(seriousOrCritical(results)).toEqual([]);
  });

  test('shortcuts panel (dialog)', async ({ page }) => {
    await reachLiveWithFile(page);
    // Pin the chrome so it does not idle-fade (pointer-events:none) mid-click.
    await page.locator('body').press(' ');
    await page.getByRole('button', { name: /Shortcuts/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const results = await new AxeBuilder({ page })
      .exclude('.params-pane')
      .analyze();
    expect(seriousOrCritical(results)).toEqual([]);
  });
});

test('keyboard-only: the source rungs are reachable by Tab and focusable', async ({ page, browserName }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Antinode' })).toBeVisible();

  // WebKit does NOT move Tab focus to buttons/links unless macOS "Full Keyboard
  // Access" is enabled (a system setting Playwright can't flip) — the DOM tab
  // order is still correct. So the Tab-walk reachability runs on chromium/firefox;
  // Safari keyboard operation is verified in docs/qa/checklist-macos-safari.md.
  if (browserName !== 'webkit') {
    const kinds = new Set<string>();
    for (let i = 0; i < 25; i += 1) {
      await page.keyboard.press('Tab');
      const kind = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        const rung = el?.closest('.rung') as HTMLElement | null;
        return rung?.dataset.kind ?? null;
      });
      if (kind) kinds.add(kind);
    }
    expect(kinds.has('file'), 'file rung reachable via keyboard').toBe(true);
  }

  // Every engine: the rung is a real focusable control (a button, not a div), so
  // programmatic + assistive-tech focus lands on an operable element.
  await page.locator('.rung[data-kind="file"]').focus();
  const tag = await page.evaluate(() => document.activeElement?.tagName);
  expect(tag).toBe('BUTTON');
});

test('prefers-reduced-motion engages the low-motion program', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachLiveWithFile(page);
  // App-level signal that drives both engine (frame.reducedMotion) and scenes.
  await expect(page.locator('.app')).toHaveClass(/reduced-motion/);
});

test('flashGuard: engine onset rate over strobe-bait stays ≤ 3/s (WCAG 2.3.1)', async ({ page }) => {
  await page.goto('/');
  // strobe.wav is a 10 Hz impulse train — without the guard onsets would approach
  // ~10/s. The engine's flashGuard (dsp/flux.ts MIN_ONSET_INTERVAL) clamps them.
  const strobe = await analyzeFixture(page, wavBase64(STROBE_WAV));
  expect(strobe.onsetsPerSec, 'strobe onset rate clamped').toBeLessThanOrEqual(3.1);

  // Sanity: the steady tone is well under the ceiling too.
  const tone = await analyzeFixture(page, wavBase64(TONE_WAV));
  expect(tone.onsetsPerSec).toBeLessThanOrEqual(3.1);
});
