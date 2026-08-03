/**
 * Shared helpers for the T10 automated QA matrix.
 *
 * The app boots as: onboarding (landing + source picker) → signal-check → live.
 * The file source is the one path that works headlessly in all three engines
 * (mic/tab capture need real devices; the manual checklists cover those). Every
 * automated flow therefore drives the *file* rung with a synthetic fixture WAV.
 *
 * Observability seams used here (all pre-existing in the app — no test-only hooks
 * were added to src/):
 *   • `#stage[data-antinode-engine]` — the render backend hook, set by main.tsx to
 *     `booting|webgpu|webgl2|webgl2-recovered|error`. This is the "perf-HUD/backend
 *     hook" the task references; the PerfHud's own `backend` field is a Wave-B
 *     placeholder. NOT `data-engine`: three.js stamps its own
 *     `data-engine="three.js r185 webgpu"` on the canvas during `renderer.init()`
 *     and clobbers ours (verified live 2026-08-02, T13) — assertions on that
 *     attribute were reading three's string and only passed because the
 *     software-WebGL2 CI path races differently.
 *   • `.app[data-phase="live"]` — the shell has reached the live visualizer.
 *   • `.app.reduced-motion`   — the reduced-motion program is engaged (App adds
 *     the class; the engine stamps `frame.reducedMotion` and scenes read it —
 *     scene internals have no DOM observable, so this is the assertion surface).
 *   • `.chrome.ui-hidden`     — the chrome has idle-faded.
 *   • `[data-testid="params-pane"]` — the Tweakpane param dock.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';

export const SCENES = ['heritage', 'standing-wave', 'phosphor'] as const;
export const DEFAULT_SCENE = 'standing-wave';

export const TONE_WAV = fileURLToPath(new URL('./fixtures/tone.wav', import.meta.url));
export const STROBE_WAV = fileURLToPath(new URL('./fixtures/strobe.wav', import.meta.url));

/** Read a fixture WAV as base64 for decoding inside the page (avoids the Vite
 *  SPA-fallback that swallows `fetch('/abs/path')`). */
export function wavBase64(absPath: string): string {
  return readFileSync(absPath).toString('base64');
}

/** Wait until the render backend resolves away from `booting`/`error`. Returns
 *  the resolved backend string, guaranteed to be exactly `webgpu` or `webgl2`. */
export async function waitForBackend(page: Page, timeout = 20_000): Promise<string> {
  await expect
    .poll(async () => page.locator('#stage').getAttribute('data-antinode-engine'), { timeout })
    .toMatch(/^(webgpu|webgl2|webgl2-recovered)$/);
  return (await page.locator('#stage').getAttribute('data-antinode-engine')) ?? '';
}

/** Boot, pick the file source with the tone fixture, and wait for the live phase. */
export async function reachLiveWithFile(page: Page, wav: string = TONE_WAV): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Antinode' })).toBeVisible();
  await page.locator('.picker input[type="file"]').setInputFiles(wav);
  await expect(page.locator('.app[data-phase="live"]')).toBeVisible({ timeout: 20_000 });
}

/**
 * Assert the `#stage` canvas is rendering something — NOT a uniform blank.
 *
 * Decode-free by design. The PRIMARY signal is frame-to-frame difference: a
 * blank/black or frozen canvas produces byte-identical PNGs, while every live
 * scene changes continuously (heritage idle-rotates, standing-wave free-runs,
 * phosphor trails decay) — verified for all three. A low size floor is a
 * secondary sanity check that some pixels were actually read back (it is kept
 * low on purpose: the default standing-wave scene is smooth phosphor-on-black
 * and compresses to only ~1 KB even when rendering correctly).
 *
 * Performance: reads back only a small CENTRE clip, not the whole 1280×720
 * surface — full-frame readback under software WebGL (SwiftShader on GPU-less CI)
 * is pathologically slow (~20 s/frame). All three scenes have continuous content
 * in the centre, so the centre is a cheap, reliable sampling window.
 */
export async function expectCanvasRenders(page: Page, label = 'canvas'): Promise<void> {
  const box = await page.locator('#stage').boundingBox();
  expect(box, `${label}: stage has a layout box`).not.toBeNull();
  if (!box) return;
  const w = Math.min(300, Math.floor(box.width));
  const h = Math.min(300, Math.floor(box.height));
  const clip = {
    x: box.x + box.width / 2 - w / 2,
    y: box.y + box.height / 2 - h / 2,
    width: w,
    height: h,
  };
  // Sample several frames across ~1.4 s and assert at least one differs from the
  // first. More robust than a single pair: tolerant of a momentary static frame
  // (e.g. right after phosphor's shader compile) while still proving the canvas
  // is live and non-blank (a blank/black/frozen canvas yields identical frames).
  const shots: Buffer[] = [];
  for (let i = 0; i < 5; i += 1) {
    shots.push(await page.screenshot({ clip }));
    if (i < 4) await page.waitForTimeout(350);
  }
  const first = shots[0]!;
  expect(first.byteLength, `${label}: some pixels were read back (not an empty clip)`).toBeGreaterThan(800);
  const animates = shots.some((s, i) => i > 0 && !s.equals(first));
  expect(animates, `${label}: canvas is animating (frames differ) → renders non-blank`).toBe(true);
}

/**
 * Run the fixture through the real `Analyzer` inside the page via an
 * `OfflineAudioContext` decode, sliding `fftSize` windows at ~60 fps. Pure DSP —
 * GPU-independent — so it is deterministic within an engine and near-identical
 * across engines (only `decodeAudioData` differs by ~1e-4). Returns a compact
 * feature summary + the per-second onset rate (the engine flashGuard surface).
 */
export async function analyzeFixture(page: Page, wavB64: string) {
  return page.evaluate(async (b64: string) => {
    // Runtime-only import: the Vite dev server serves the transformed module at
    // this URL in the browser. A `string`-typed specifier keeps tsc from trying
    // to resolve a filesystem path it cannot see (these run only in-page).
    const analyzerModule: string = '/src/audio/analyzer.ts';
    const mod = (await import(/* @vite-ignore */ analyzerModule)) as {
      Analyzer: new (sr: number, opts: { fftSize: number }) => {
        reset(): void;
        analyze(win: Float32Array, t: number): {
          rms: number;
          loudNorm: number;
          bands: { bass: number; lowMid: number; mid: number; high: number };
          onset: boolean;
        };
      };
    };
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    const sr = 44_100;
    const fft = 2048;
    const Ctx = (globalThis as unknown as { OfflineAudioContext: typeof OfflineAudioContext })
      .OfflineAudioContext;
    const buf = await new Ctx(1, sr * 2, sr).decodeAudioData(bytes.buffer);
    const pcm = buf.getChannelData(0);
    const an = new mod.Analyzer(sr, { fftSize: fft });
    an.reset();
    const hop = Math.floor(sr / 60);
    const win = new Float32Array(fft);
    let n = 0;
    let onsets = 0;
    let sumRms = 0;
    let sumLoud = 0;
    const band = { bass: 0, lowMid: 0, mid: 0, high: 0 };
    for (let s = 0; s + fft < pcm.length; s += hop) {
      win.set(pcm.subarray(s, s + fft));
      const f = an.analyze(win, s / sr);
      sumRms += f.rms;
      sumLoud += f.loudNorm;
      band.bass += f.bands.bass;
      band.lowMid += f.bands.lowMid;
      band.mid += f.bands.mid;
      band.high += f.bands.high;
      if (f.onset) onsets += 1;
      n += 1;
    }
    const durSec = pcm.length / sr;
    return {
      frames: n,
      onsets,
      durSec,
      onsetsPerSec: onsets / durSec,
      meanRms: sumRms / n,
      meanLoudNorm: sumLoud / n,
      meanBands: {
        bass: band.bass / n,
        lowMid: band.lowMid / n,
        mid: band.mid / n,
        high: band.high / n,
      },
    };
  }, wavB64);
}
