import { test, expect } from '@playwright/test';

// Smoke: the landing renders and the engine's canvas is attached to the DOM.
test('landing renders wordmark and stage canvas', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Antinode' })).toBeVisible();
  await expect(page.locator('#stage')).toBeAttached();
});
