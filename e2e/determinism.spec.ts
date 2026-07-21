/**
 * Feature-determinism harness (task "Automated" §): an `OfflineAudioContext`
 * render of the fixture is pushed through the real `Analyzer`, producing a
 * `FrameFeatures` trace whose compact summary is compared across engines against
 * a committed baseline within documented tolerances.
 *
 * Why this is meaningful: the whole coupling between sound and picture is the
 * `FrameFeatures` stream (00-overview). If two engines derived different features
 * from the same audio, the same track would drive the scenes differently. This
 * pins that invariant. Because the analysis is GPU-independent pure JS, the
 * cross-engine spread is tiny (< 2e-4 observed); tolerances (see
 * fixtures/feature-baseline.json) are generous margins, not fudge factors.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TONE_WAV, wavBase64, analyzeFixture } from './helpers';

const baseline = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/feature-baseline.json', import.meta.url)), 'utf8'),
) as {
  frames: number;
  onsets: number;
  meanRms: number;
  meanLoudNorm: number;
  meanBands: Record<'bass' | 'lowMid' | 'mid' | 'high', number>;
  tolerances: { meanAbs: number; framesAbs: number; onsetsAbs: number };
};

test('FrameFeatures trace matches the cross-engine baseline within tolerance', async ({ page }) => {
  await page.goto('/');
  const summary = await analyzeFixture(page, wavBase64(TONE_WAV));
  const tol = baseline.tolerances;

  expect(Math.abs(summary.frames - baseline.frames)).toBeLessThanOrEqual(tol.framesAbs);
  expect(Math.abs(summary.onsets - baseline.onsets)).toBeLessThanOrEqual(tol.onsetsAbs);
  expect(Math.abs(summary.meanRms - baseline.meanRms)).toBeLessThanOrEqual(tol.meanAbs);
  expect(Math.abs(summary.meanLoudNorm - baseline.meanLoudNorm)).toBeLessThanOrEqual(tol.meanAbs);
  for (const band of ['bass', 'lowMid', 'mid', 'high'] as const) {
    expect(
      Math.abs(summary.meanBands[band] - baseline.meanBands[band]),
      `band ${band} within tolerance`,
    ).toBeLessThanOrEqual(tol.meanAbs);
  }
});

test('analysis is deterministic (identical run twice in the same engine)', async ({ page }) => {
  await page.goto('/');
  const b64 = wavBase64(TONE_WAV);
  const a = await analyzeFixture(page, b64);
  const b = await analyzeFixture(page, b64);
  // Same engine, same input → bit-identical summary (no wall-clock / RNG in DSP).
  expect(a).toEqual(b);
});
