import type {
  BandLevels,
  BeatInfo,
  EngineFacade,
  FrameFeatures,
  SourceCapability,
  SourceKind,
} from '../contracts';
import { Analyzer } from './analyzer';
import { detectCapabilities } from './capabilities';
import { createSource, type SourceOptions } from './sources';
import type { AudioSourceProvider } from '../contracts';
import { createLiveTempo, type LiveTempo } from './tempo';

/**
 * The render half of {@link EngineFacade} is owned by T03. The audio engine
 * accepts a bridge so `setScene`/`scenes` delegate out without the audio engine
 * knowing anything about three.js. Defaults to no-ops.
 */
export interface SceneBridge {
  setScene(id: string): void;
  scenes(): { id: string; name: string }[];
}

/** Construction options (all optional; defaults target a real browser). */
export interface EngineOptions {
  /** Inject an AudioContext factory (tests supply a mock). */
  contextFactory?: () => AudioContext;
  /** Render-half bridge for scene control. */
  sceneBridge?: SceneBridge;
  /** FFT size for the AnalyserNode + analyzer. Default 2048. */
  fftSize?: number;
}

function emptyFrame(): FrameFeatures {
  const bands: BandLevels = { bass: 0, lowMid: 0, mid: 0, high: 0 };
  const beat: BeatInfo = { bpm: null, phase: 0, confidence: 0 };
  return {
    t: 0,
    rms: 0,
    loudNorm: 0,
    bands,
    spectrum: new Float32Array(64),
    flux: 0,
    onset: false,
    beat,
    silent: false,
    reducedMotion: false,
  };
}

/**
 * Audio half of the engine: capture ladder → AnalyserNode tap → {@link Analyzer}
 * → per-frame {@link FrameFeatures} pushed to subscribers. Framework-free; the
 * UI (T04/T07) drives it purely through {@link EngineFacade}.
 *
 * AudioContext is created suspended and only resumed inside a user gesture via
 * {@link unlock}; it auto-resumes on `visibilitychange`/`focus` because WebKit
 * suspends backgrounded contexts (WebKit 231105).
 */
export class AudioEngine implements EngineFacade {
  private readonly contextFactory: () => AudioContext;
  private readonly bridge: SceneBridge;
  private readonly fftSize: number;

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private timeBuf: Float32Array<ArrayBuffer>;
  private analyzer: Analyzer | null = null;

  private source: AudioSourceProvider | null = null;
  private sourceNode: AudioNode | null = null;
  private liveTempo: LiveTempo | null = null;

  private readonly subscribers = new Set<(f: FrameFeatures) => void>();
  private frame: FrameFeatures = emptyFrame();
  private readonly procFrame: FrameFeatures = emptyFrame();

  private rafId: number | null = null;
  private running = false;
  private readonly onVisibility = (): void => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      void this.resume();
    }
  };

  // Engine-owned reduced-motion signal, sampled from prefers-reduced-motion and
  // stamped onto every emitted frame. Sampled into a stored field (no per-frame
  // matchMedia in the hot path); defaults false where matchMedia is absent (tests).
  private reducedMotion = false;
  private motionQuery: MediaQueryList | null = null;
  private readonly onReducedMotionChange = (e: MediaQueryListEvent): void => {
    this.reducedMotion = e.matches;
  };

  constructor(opts: EngineOptions = {}) {
    this.contextFactory = opts.contextFactory ?? ((): AudioContext => new AudioContext());
    this.bridge = opts.sceneBridge ?? { setScene: () => {}, scenes: () => [] };
    this.fftSize = opts.fftSize ?? 2048;
    this.timeBuf = new Float32Array(this.fftSize);

    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = mq.matches;
      mq.addEventListener('change', this.onReducedMotionChange);
      this.motionQuery = mq;
    }
  }

  // ---- EngineFacade ----

  capabilities(): SourceCapability[] {
    return detectCapabilities();
  }

  latest(): FrameFeatures {
    return this.frame;
  }

  onFrame(cb: (f: FrameFeatures) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  setScene(id: string): void {
    this.bridge.setScene(id);
  }

  scenes(): { id: string; name: string }[] {
    return this.bridge.scenes();
  }

  async selectSource(kind: SourceKind, opts?: { deviceId?: string; file?: File }): Promise<void> {
    const ctx = this.ensureContext();
    await this.teardownSource();

    const sourceOpts: SourceOptions = {};
    if (opts?.deviceId !== undefined) sourceOpts.deviceId = opts.deviceId;
    if (opts?.file !== undefined) sourceOpts.file = opts.file;

    const source = createSource(kind, sourceOpts);
    const node = await source.start(ctx);
    this.source = source;
    this.sourceNode = node;

    const analyzer = this.ensureAnalyzer();
    analyzer.reset();

    if (kind === 'procedural') {
      analyzer.setSilenceEnabled(false);
      // Procedural node is silent; do not tap it for spectrum.
    } else {
      analyzer.setSilenceEnabled(true);
      const analyser = this.ensureAnalyserNode();
      node.connect(analyser);
      // Live tempo (AudioWorklet) — best-effort; failure just falls back to the
      // pure onset-interval estimate.
      try {
        this.liveTempo = await createLiveTempo(ctx, node, (bpm) => analyzer.hintBpm(bpm));
      } catch {
        this.liveTempo = null;
      }
    }

    this.startLoop();
  }

  // ---- lifecycle ----

  /** Resume the AudioContext — MUST be called from a user gesture. */
  async unlock(): Promise<void> {
    this.ensureContext();
    await this.resume();
  }

  /** Current AudioContext state, or 'closed' before creation. */
  state(): AudioContextState {
    return this.ctx?.state ?? 'closed';
  }

  /** Stop capture and release everything. */
  async dispose(): Promise<void> {
    this.stopLoop();
    await this.teardownSource();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', this.onVisibility);
    }
    this.motionQuery?.removeEventListener('change', this.onReducedMotionChange);
    this.motionQuery = null;
    if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close();
    this.ctx = null;
    this.analyser = null;
    this.analyzer = null;
  }

  // ---- internals ----

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = this.contextFactory();
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', this.onVisibility);
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('focus', this.onVisibility);
      }
    }
    return this.ctx;
  }

  private ensureAnalyserNode(): AnalyserNode {
    const ctx = this.ensureContext();
    if (!this.analyser) {
      const a = ctx.createAnalyser();
      a.fftSize = this.fftSize;
      a.smoothingTimeConstant = 0;
      this.analyser = a;
    }
    return this.analyser;
  }

  private ensureAnalyzer(): Analyzer {
    if (!this.analyzer) {
      const ctx = this.ensureContext();
      this.analyzer = new Analyzer(ctx.sampleRate, { fftSize: this.fftSize });
    }
    return this.analyzer;
  }

  private async resume(): Promise<void> {
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* resume may be rejected outside a gesture; ignored */
      }
    }
  }

  private async teardownSource(): Promise<void> {
    this.liveTempo?.stop();
    this.liveTempo = null;
    if (this.source) {
      await this.source.stop();
      this.source = null;
    }
    if (this.sourceNode && this.analyser) {
      try {
        this.sourceNode.disconnect(this.analyser);
      } catch {
        /* already disconnected */
      }
    }
    this.sourceNode = null;
  }

  private startLoop(): void {
    if (this.running) return;
    this.running = true;
    const tick = (): void => {
      if (!this.running) return;
      this.step();
      if (typeof requestAnimationFrame === 'function') {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    if (typeof requestAnimationFrame === 'function') {
      this.rafId = requestAnimationFrame(tick);
    }
  }

  private stopLoop(): void {
    this.running = false;
    if (this.rafId != null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
  }

  /** Produce and dispatch one frame. Public so a manual driver/test can pump it. */
  step(): FrameFeatures {
    const ctx = this.ctx;
    const t = ctx ? ctx.currentTime : this.frame.t + 1 / 60;

    if (this.source?.kind === 'procedural') {
      this.frame = this.synthProcedural(t);
    } else if (this.analyser && this.analyzer) {
      this.analyser.getFloatTimeDomainData(this.timeBuf);
      this.frame = this.analyzer.analyze(this.timeBuf, t);
    }

    // Stamp the engine-owned reduced-motion signal onto whichever frame we emit.
    this.frame.reducedMotion = this.reducedMotion;
    for (const cb of this.subscribers) cb(this.frame);
    return this.frame;
  }

  /** Beat-less, progress-driven synthetic features (allocation-free). */
  private synthProcedural(t: number): FrameFeatures {
    const f = this.procFrame;
    const slow = 0.5 + 0.5 * Math.sin(t * 0.8);
    f.t = t;
    f.rms = 0.1 * slow;
    f.loudNorm = slow;
    f.bands.bass = 0.5 + 0.5 * Math.sin(t * 0.7);
    f.bands.lowMid = 0.5 + 0.5 * Math.sin(t * 0.9 + 1);
    f.bands.mid = 0.5 + 0.5 * Math.sin(t * 1.1 + 2);
    f.bands.high = 0.5 + 0.5 * Math.sin(t * 1.3 + 3);
    for (let i = 0; i < f.spectrum.length; i++) {
      f.spectrum[i] = 0.5 + 0.5 * Math.sin(t * 0.6 + i * 0.2);
    }
    f.flux = 0;
    f.onset = false;
    f.beat.bpm = null;
    f.beat.phase = (t * 0.5) % 1;
    f.beat.confidence = 0;
    f.silent = false; // procedural is never "silent"
    return f;
  }
}
