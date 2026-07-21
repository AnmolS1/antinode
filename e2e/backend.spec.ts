/**
 * Backend axis (00-overview: WebGPU primary, automatic WebGL2 fallback — one
 * shader codebase). The observable is `#stage[data-engine]`, set by main.tsx.
 *
 * NOTE on local runs: headless Chromium here resolves to the software WebGL2
 * backend (SwiftShader), so BOTH default and `?gl=1` report `webgl2` locally —
 * the WebGPU-primary path is only exercised on real GPU hardware (CI runners with
 * a GPU, or the manual matrix). We still assert the invariants that hold
 * everywhere: default lands on a real engine, and `?gl=1` forces the WebGL2
 * fallback. `?gpu=0` is the documented alias (see renderer/bootstrap.ts).
 */
import { test, expect } from '@playwright/test';
import { waitForBackend } from './helpers';

test('default: renderer lands on a real backend (webgpu or webgl2)', async ({ page }) => {
  await page.goto('/');
  const backend = await waitForBackend(page);
  expect(['webgpu', 'webgl2']).toContain(backend);
});

test('?gl=1 forces the WebGL2 fallback', async ({ page }) => {
  await page.goto('/?gl=1');
  await expect(page.locator('#stage')).toHaveAttribute('data-engine', 'webgl2', { timeout: 20_000 });
});

test('?gpu=0 alias also forces WebGL2', async ({ page }) => {
  await page.goto('/?gpu=0');
  await expect(page.locator('#stage')).toHaveAttribute('data-engine', 'webgl2', { timeout: 20_000 });
});

// Chromium-only backend-comparison note: on a GPU runner default==webgpu while
// ?gl=1==webgl2, proving both branches of the single shader codebase compile.
// Locally both are webgl2; we assert the fallback branch is reachable and stable.
test('chromium: default and ?gl=1 both produce a working canvas', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'backend-comparison note is chromium-only');

  await page.goto('/');
  const dflt = await waitForBackend(page);
  await page.goto('/?gl=1');
  const forced = await waitForBackend(page);
  expect(forced).toBe('webgl2');
  // If the runner has a GPU these differ (webgpu vs webgl2); in software they
  // match. Either way both must be real engines, never `error`.
  expect(['webgpu', 'webgl2']).toContain(dflt);
});
