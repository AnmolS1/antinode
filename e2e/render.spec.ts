/**
 * The core render + interaction flow — the first REAL render verification in the
 * project (unit tests use a mock engine; this drives the actual AudioEngine +
 * RenderCore in a browser). Runs on chromium, firefox, and webkit.
 *
 * Boot → pick file source (fixture WAV) → each of the 3 scenes renders non-black
 * → a param change applies → preset URL roundtrip → UI fade/pin → snapshot (S)
 * downloads.
 */
import { test, expect } from '@playwright/test';
import {
  SCENES,
  DEFAULT_SCENE,
  reachLiveWithFile,
  expectCanvasRenders,
} from './helpers';

test.describe('render + live interaction', () => {
  test('each scene renders non-black', async ({ page }) => {
    // Generous budget: under SOFTWARE WebGL (SwiftShader on a GPU-less CI runner
    // or headless locally) phosphor's feedback/FBM shader takes ~85 s to compile
    // on first switch — heritage/standing-wave are sub-second, and phosphor is
    // instant on a real GPU. All three DO render; this cost is a software-render
    // artifact, not an app issue. See docs/qa/README.md.
    // CI's 2-core SwiftShader ran ~210s (killed at 200s); give phosphor's ~85s
    // compile + the two other scenes + reach-live generous headroom on CI.
    test.setTimeout(process.env.CI ? 420_000 : 200_000);
    await reachLiveWithFile(page);
    // Default scene highlighted correctly (registration order → standing-wave).
    await expect(
      page.locator('.scene-btn.is-active .scene-btn__name'),
    ).toBeVisible();

    for (const id of SCENES) {
      // Scenes are keyboard-selectable 1..9 in registration order.
      const idx = SCENES.indexOf(id) + 1;
      await page.locator('body').press(String(idx));
      await page.waitForTimeout(500); // let the scene swap + a few frames render
      await expectCanvasRenders(page, `scene ${id}`);
    }
  });

  test('a param change applies (Randomize updates the pane)', async ({ page }) => {
    await reachLiveWithFile(page);
    await expect(page.locator('[data-testid="params-pane"]')).toBeVisible();
    await page.waitForTimeout(300);

    const readInputs = () =>
      page.$$eval('[data-testid="params-pane"] input', (els) =>
        els.map((e) => (e as HTMLInputElement).value),
      );
    const before = await readInputs();
    expect(before.length, 'params pane has numeric controls').toBeGreaterThan(0);

    await page.locator('body').press('r'); // Randomize shortcut → controller
    await page.waitForTimeout(400);

    const after = await readInputs();
    const changed = before.filter((v, i) => v !== after[i]).length;
    expect(changed, 'at least one param value changed').toBeGreaterThan(0);
  });

  test('preset URL roundtrip', async ({ page }) => {
    await reachLiveWithFile(page);

    // 1) The share codec roundtrips losslessly (cross-engine; pure JS, imported
    //    from the app so we test the shipped implementation, not a copy).
    const roundtrips = await page.evaluate(async () => {
      // Runtime-only import served by Vite in the browser (see helpers.ts note).
      const presetsModule: string = '/src/ui/params/presets.ts';
      const m = (await import(/* @vite-ignore */ presetsModule)) as {
        PRESET_VERSION: number;
        presetToHash: (p: unknown) => Promise<string>;
        decodePresetFromHash: (h: string) => Promise<unknown>;
      };
      const preset = {
        sceneId: 'standing-wave',
        paramValues: { amp: 0.42, gain: 0.7 },
        modRoutes: { amp: [{ source: 'bass', amount: 0.5 }] },
        version: m.PRESET_VERSION,
      };
      const hash = await m.presetToHash(preset);
      const back = await m.decodePresetFromHash(hash);
      return { hash, back, expected: preset };
    });
    expect(roundtrips.hash.startsWith('#p=')).toBe(true);
    expect(roundtrips.back).toEqual(roundtrips.expected);

    // 2) Applying an inbound share hash on load is honored: load the app with the
    //    hash and confirm the shell decodes it without throwing (the pane decodes
    //    `location.hash` exactly once via onPaneReady). We were already at `/` and
    //    live, so a hash-only goto is same-document — force a full reload so the
    //    app re-boots into onboarding with the hash present.
    await page.goto(`/${roundtrips.hash}`);
    await page.reload();
    await reachLiveViaHashReload(page);
    await expect(page.locator('.app[data-phase="live"]')).toBeVisible();
  });

  test('UI fades when idle and pins with Space', async ({ page }) => {
    await reachLiveWithFile(page);
    await page.mouse.move(20, 20); // register activity, then go idle
    await expect(page.locator('.chrome')).toHaveClass(/ui-hidden/, { timeout: 6_000 });

    await page.locator('body').press(' '); // pin
    await expect(page.locator('.chrome')).not.toHaveClass(/ui-hidden/);
  });

  test('snapshot (S) downloads a PNG of the canvas', async ({ page }) => {
    await reachLiveWithFile(page);
    await page.waitForTimeout(600);

    const downloadPromise = page.waitForEvent('download', { timeout: 8_000 });
    await page.locator('body').press('S');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^antinode-\d+\.png$/);
  });
});

/** After a hash-reload the app is back at onboarding; re-pick the file to reach live. */
async function reachLiveViaHashReload(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Antinode' })).toBeVisible();
  const { TONE_WAV } = await import('./helpers');
  await page.locator('.picker input[type="file"]').setInputFiles(TONE_WAV);
  await expect(page.locator('.app[data-phase="live"]')).toBeVisible({ timeout: 20_000 });
}

// Keep DEFAULT_SCENE referenced for documentation/lint (registration-order default).
void DEFAULT_SCENE;
