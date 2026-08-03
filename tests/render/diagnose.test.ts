/**
 * T13: the renderer-failure diagnosis mapping.
 *
 * This is a table test on purpose. The failure it describes only happens where
 * no GPU backend exists at all — a state CI cannot manufacture (headless runners
 * always have SwiftShader WebGL2) — so the mapping is the only part that can be
 * verified automatically. The real-browser half is the manual check in the task's
 * DoD.
 */
import { describe, expect, it } from 'vitest';

import { diagnoseRendererFailure, type BackendProbe } from '../../src/render/renderer/diagnose';

const probe = (over: Partial<BackendProbe> = {}): BackendProbe => ({
  hasWebGPUApi: true,
  webgl2Available: false,
  isChromium: true,
  ...over,
});

describe('diagnoseRendererFailure', () => {
  it('offers the WebGL2 retry when WebGL2 is still obtainable', () => {
    const d = diagnoseRendererFailure(probe({ webgl2Available: true }));
    expect(d.kind).toBe('webgl2-available');
    expect(d.retryWithWebGL).toBe(true);
  });

  it('names the Chrome setting when no backend exists at all', () => {
    const d = diagnoseRendererFailure(probe({ webgl2Available: false, isChromium: true }));
    expect(d.kind).toBe('no-backend');
    expect(d.retryWithWebGL).toBe(false);
    // The whole point of T13: the remedy must be actionable, not "unsupported".
    expect(d.remedy.join(' ')).toContain('chrome://settings/system');
    expect(d.remedy.join(' ')).toMatch(/graphics acceleration/i);
  });

  it('falls back to generic advice off Chromium', () => {
    const d = diagnoseRendererFailure(probe({ webgl2Available: false, isChromium: false }));
    expect(d.kind).toBe('no-backend');
    expect(d.remedy.join(' ')).not.toContain('chrome://');
    expect(d.remedy.length).toBeGreaterThan(0);
  });

  it('does NOT treat a present navigator.gpu as a working backend', () => {
    // The exact trap that produced the silent failure: the owner's Chrome had
    // `navigator.gpu` while the GPU process was disabled. API presence != capability.
    const d = diagnoseRendererFailure(probe({ hasWebGPUApi: true, webgl2Available: false }));
    expect(d.kind).toBe('no-backend');
  });

  it('always produces a non-empty headline, detail and remedy', () => {
    for (const p of [
      probe({ webgl2Available: true }),
      probe({ webgl2Available: false, isChromium: true }),
      probe({ webgl2Available: false, isChromium: false }),
    ]) {
      const d = diagnoseRendererFailure(p);
      expect(d.headline.length).toBeGreaterThan(0);
      expect(d.detail.length).toBeGreaterThan(0);
      expect(d.remedy.length).toBeGreaterThan(0);
    }
  });
});
