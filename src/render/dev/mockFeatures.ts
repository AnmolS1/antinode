import type { EngineFacade, FrameFeatures, SourceCapability } from '../../contracts';
import { SPECTRUM_BINS } from '../bridge/FeatureUniforms';

/**
 * Synthetic {@link FrameFeatures} generator for T03's dev harness.
 *
 * The render core consumes only the {@link EngineFacade} contract — it never
 * imports audio internals. Until T02's real engine is wired, this fixture drives
 * the placeholder scene with sine-based, plausibly-musical values so the whole
 * bridge → registry → governor path can be exercised end to end.
 */

const TWO_PI = Math.PI * 2;

/**
 * Compute one frame of synthetic features at absolute time `tSec`.
 * All bands/spectrum are 0–1; a 120 BPM beat drives phase and periodic onsets.
 */
export function synthFeatures(tSec: number, out?: FrameFeatures): FrameFeatures {
  const bpm = 120;
  const beatsPerSec = bpm / 60;
  const beatPos = (tSec * beatsPerSec) % 1;

  const bass = 0.5 + 0.5 * Math.sin(tSec * TWO_PI * 1.0);
  const lowMid = 0.5 + 0.5 * Math.sin(tSec * TWO_PI * 1.7 + 1.0);
  const mid = 0.5 + 0.5 * Math.sin(tSec * TWO_PI * 2.3 + 2.0);
  const high = 0.5 + 0.5 * Math.sin(tSec * TWO_PI * 3.1 + 3.0);
  const rms = 0.25 + 0.2 * Math.sin(tSec * TWO_PI * 0.5);

  const spectrum = out?.spectrum ?? new Float32Array(SPECTRUM_BINS);
  for (let i = 0; i < SPECTRUM_BINS; i += 1) {
    const f = i / SPECTRUM_BINS;
    // Low-tilted noise-ish shape animated over time; kept in 0–1.
    const base = (1 - f) * (0.6 + 0.4 * Math.sin(tSec * 3 + i * 0.35));
    spectrum[i] = Math.min(1, Math.max(0, base * (0.5 + 0.5 * bass)));
  }

  const onset = beatPos < 0.06; // a short pulse at the top of each beat

  const frame: FrameFeatures = {
    t: tSec,
    rms,
    loudNorm: Math.min(1, rms * 2),
    bands: { bass, lowMid, mid, high },
    spectrum,
    flux: Math.max(0, Math.sin(tSec * TWO_PI * beatsPerSec)) * 0.5,
    onset,
    beat: { bpm, phase: beatPos, confidence: 0.8 },
    silent: false,
  };
  return frame;
}

/**
 * A fixture {@link EngineFacade} for the dev harness. `latest()` returns a fresh
 * synthetic frame each call; `onFrame` subscribers are notified when `tick()` is
 * pumped (the harness pumps once per rAF). Scene control is delegated to a
 * callback so the harness's {@link RenderCore} owns the real registry.
 */
export class MockEngine implements EngineFacade {
  private readonly start = performance.now();
  private readonly subscribers = new Set<(f: FrameFeatures) => void>();
  private readonly reusable: FrameFeatures = synthFeatures(0);

  constructor(
    private readonly sceneList: () => { id: string; name: string }[] = () => [],
    private readonly onSetScene: (id: string) => void = () => {},
  ) {}

  capabilities(): SourceCapability[] {
    return [{ kind: 'procedural', available: true, reason: 'Synthetic dev fixture' }];
  }

  async selectSource(): Promise<void> {
    // No real sources in the fixture.
  }

  latest(): FrameFeatures {
    const tSec = (performance.now() - this.start) / 1000;
    return synthFeatures(tSec, this.reusable);
  }

  onFrame(cb: (f: FrameFeatures) => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  /** Push the current frame to subscribers (harness calls this per rAF). */
  tick(): void {
    if (this.subscribers.size === 0) return;
    const f = this.latest();
    for (const cb of this.subscribers) cb(f);
  }

  setScene(id: string): void {
    this.onSetScene(id);
  }

  scenes(): { id: string; name: string }[] {
    return this.sceneList();
  }
}
