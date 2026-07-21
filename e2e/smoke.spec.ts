import { test, expect } from '@playwright/test';
import { waitForBackend } from './helpers';

// Smoke: the landing renders, the stage canvas is attached, and the render
// backend resolves to a real engine (not the `error` degraded mount). Runs on
// every project — the cheapest cross-browser boot signal.
test('landing renders wordmark and a live stage canvas', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Antinode' })).toBeVisible();
  await expect(page.locator('#stage')).toBeAttached();

  const backend = await waitForBackend(page);
  expect(['webgpu', 'webgl2']).toContain(backend);
});
