import { PerspectiveCamera, Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

import type { EngineFacade, FrameFeatures, SceneContext, SceneModule } from '../contracts';
import { FeatureUniforms } from './bridge/FeatureUniforms';
import { FeedbackHelper } from './feedback/FeedbackHelper';
import { QualityGovernor } from './governor/QualityGovernor';
import { FrameLoop } from './loop/FrameLoop';
import { PostChain } from './post/PostChain';
import { createRenderer, parseBackendPreference } from './renderer/bootstrap';
import { FadeCompositor } from './scene/FadeCompositor';
import { SceneRegistry } from './scene/SceneRegistry';
import type { PerfReadout, RenderCoreHooks, RenderSize } from './types';

/** Debounce for resize handling; iOS WebGL leaks on resize churn (WebKit 219780). */
const RESIZE_DEBOUNCE_MS = 150;
/** Hard cap on device pixel ratio before the governor scales it further. */
const DEFAULT_MAX_DPR = 2;

/** Construction options for {@link createRenderCore}. */
export interface RenderCoreOptions extends RenderCoreHooks {
  /** The canvas to render into. Mounted once by the caller; never re-created. */
  canvas: HTMLCanvasElement;
  /**
   * Feature source. T03 consumes only the {@link EngineFacade} contract — never
   * audio internals. In dev this is the fixture mock from `dev/mockFeatures`.
   */
  engine: EngineFacade;
  /** `location.search` override (tests / SSR). Defaults to the live value. */
  search?: string;
  /** DPR ceiling before governor scaling. Default 2. */
  maxDpr?: number;
}

/**
 * The render core: owns the renderer, the shared camera, the feature→uniform
 * bridge, the scene registry + crossfade, the quality governor, and the post
 * chain, and drives them from a single frame loop in fixed order
 * (`features → active scene update → render`).
 *
 * Scenes are framework-free {@link SceneModule}s (contract in
 * `src/contracts/scene.ts`); each gets its own `THREE.Scene` so a switch frees
 * cleanly. The one placeholder scene lives in `src/render/dev`.
 *
 * Construct via {@link createRenderCore} (init is async).
 */
export class RenderCore {
  private readonly camera: PerspectiveCamera;
  private readonly registry: SceneRegistry;
  private readonly governor = new QualityGovernor();
  private readonly loop: FrameLoop;
  private readonly maxDpr: number;
  private readonly hooks: RenderCoreHooks;

  private readonly bridge = new FeatureUniforms();

  /** Scenes each own a THREE.Scene; we track the active/outgoing ones for rendering. */
  private activeThree: Scene | null = null;
  private outgoingThree: Scene | null = null;
  private readonly threeByScene = new WeakMap<SceneModule, Scene>();

  private post!: PostChain;
  private compositor!: FadeCompositor;
  /** Feedback ping-pong buffer, provided once for scenes/recipes that need it. */
  private feedback!: FeedbackHelper;

  private readonly params: Record<string, unknown> = {};
  private readonly outgoingParams: Record<string, unknown> = {};

  private size: RenderSize = { w: 1, h: 1, dpr: 1 };
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;

  /** Dev-only artificial per-frame CPU burn (ms) to exercise the governor. */
  private burnMs = 0;

  private readonly renderer: WebGPURenderer;
  readonly isWebGPU: boolean;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly engine: EngineFacade,
    bootstrap: { renderer: WebGPURenderer; isWebGPU: boolean },
    opts: RenderCoreOptions,
  ) {
    this.renderer = bootstrap.renderer;
    this.isWebGPU = bootstrap.isWebGPU;
    this.maxDpr = opts.maxDpr ?? DEFAULT_MAX_DPR;
    this.hooks = opts;

    this.camera = new PerspectiveCamera(60, 1, 0.1, 100);
    this.camera.position.z = 5;

    this.registry = new SceneRegistry({ onSwapComplete: () => this.onSwapComplete() });
    this.loop = new FrameLoop((dt) => this.tick(dt));
  }

  /**
   * Bootstrap and initialize a render core. Resolves once the renderer is ready
   * (WebGPU or the automatic WebGL2 fallback). On init failure the error is
   * routed to `onError` and rethrown.
   */
  static async create(opts: RenderCoreOptions): Promise<RenderCore> {
    const pref = parseBackendPreference(
      opts.search ?? (typeof location !== 'undefined' ? location.search : ''),
    );
    let bootstrap: { renderer: WebGPURenderer; isWebGPU: boolean };
    try {
      bootstrap = await createRenderer(opts.canvas, pref);
    } catch (cause) {
      const err =
        cause instanceof Error
          ? cause
          : new Error('Renderer initialization failed', { cause });
      opts.onError?.(err);
      throw err;
    }

    const core = new RenderCore(opts.canvas, opts.engine, bootstrap, opts);
    core.postInit();
    return core;
  }

  private postInit(): void {
    this.measureSize();
    this.applyQuality();

    this.compositor = new FadeCompositor(this.drawW(), this.drawH());
    this.feedback = new FeedbackHelper(this.drawW(), this.drawH());
    // Post binds to the active scene lazily once a scene is set (see rebuildPost).
    this.post = new PostChain(this.renderer, new Scene(), this.camera);

    window.addEventListener('resize', this.onResize);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
  }

  /** Register a scene module. */
  registerScene(module: SceneModule): void {
    this.registry.register(module);
  }

  /** The registered scenes as `{ id, name }`. */
  scenes(): { id: string; name: string }[] {
    return this.registry.list();
  }

  /**
   * Switch to scene `id`, crossfading from the current scene (400 ms). The
   * incoming scene is initialized into its own `THREE.Scene`. No-op if it is
   * already active.
   */
  async setScene(id: string): Promise<void> {
    if (id === this.registry.activeSceneId()) return;

    const incomingThree = new Scene();
    const module = this.registry.get(id);
    if (module) this.threeByScene.set(module, incomingThree);

    const previousActiveThree = this.activeThree;
    await this.registry.activate(id, () => this.buildContext(incomingThree));

    // Registry set the incoming module active and began the fade (if any).
    if (previousActiveThree) {
      this.outgoingThree = previousActiveThree;
    }
    this.activeThree = incomingThree;

    // With no previous scene there is no fade; bind post to the new scene now.
    if (!this.registry.isFading()) this.rebuildPost();
    this.resetSceneParams();
    this.governor.reset();
  }

  /** Start the frame loop. */
  start(): void {
    this.paused = false;
    this.loop.start();
  }

  /** Stop the frame loop. */
  stop(): void {
    this.loop.stop();
  }

  /** Toggle the bloom post chain. Off = zero post cost. */
  setBloom(enabled: boolean): void {
    this.post.setEnabled(enabled);
  }

  /** Dev affordance: burn `ms` of CPU each frame to force the governor to step. */
  setArtificialLoad(ms: number): void {
    this.burnMs = Math.max(0, ms);
  }

  /** A perf snapshot for the HUD (T04). */
  readout(): PerfReadout {
    const level = this.governor.level;
    return {
      isWebGPU: this.isWebGPU,
      fps: this.governor.fps,
      frameMs: this.governor.p75,
      qualityLevel: this.governor.levelIndex,
      dprScale: level.dprScale,
      renderScale: level.renderScale,
      sceneQuality: level.sceneQuality,
      bloom: this.post.isEnabled,
    };
  }

  /** The shared feedback ping-pong buffer (for T09 Phosphor / T05 recipe). */
  feedbackBuffer(): FeedbackHelper {
    return this.feedback;
  }

  /** The feature→uniform bridge (scenes bind their TSL graphs to this). */
  featureUniforms(): FeatureUniforms {
    return this.bridge;
  }

  /** Tear everything down. */
  dispose(): void {
    this.loop.stop();
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.registry.dispose();
    this.post.dispose();
    this.compositor.dispose();
    this.feedback.dispose();
    this.bridge.dispose();
    this.renderer.dispose();
  }

  // ---- internals -------------------------------------------------------------

  private buildContext(three: Scene): SceneContext {
    return {
      renderer: this.renderer,
      scene: three,
      camera: this.camera,
      isWebGPU: this.isWebGPU,
      size: { w: this.size.w, h: this.size.h, dpr: this.size.dpr },
    };
  }

  private tick(dtMs: number): void {
    if (this.paused) return;
    this.renderer.info.reset();

    const dtSec = dtMs / 1000;
    const f: FrameFeatures = this.engine.latest();
    this.bridge.update(f);

    this.registry.advanceFade(dtMs);

    const active = this.registry.activeScene();
    if (active) {
      this.params['quality'] = this.governor.level.sceneQuality;
      active.update(f, this.params, dtSec);
    }
    const outgoing = this.registry.outgoingScene();
    if (outgoing) {
      this.outgoingParams['quality'] = this.governor.level.sceneQuality;
      outgoing.update(f, this.outgoingParams, dtSec);
    }

    this.renderFrame();

    if (this.burnMs > 0) RenderCore.burn(this.burnMs);

    if (this.governor.sample(dtMs)) this.applyQuality();
  }

  private renderFrame(): void {
    if (this.registry.isFading() && this.activeThree && this.outgoingThree) {
      this.renderer.setRenderTarget(this.compositor.outTarget);
      this.renderer.render(this.outgoingThree, this.camera);
      this.renderer.setRenderTarget(this.compositor.inTarget);
      this.renderer.render(this.activeThree, this.camera);
      this.renderer.setRenderTarget(null);
      this.compositor.render(this.renderer, this.registry.fadeAlpha());
    } else if (this.activeThree) {
      this.post.render();
    }
  }

  private onSwapComplete(): void {
    // Outgoing scene was disposed + dereferenced by the registry; drop our
    // THREE.Scene ref too and rebind post to the now-sole active scene.
    this.outgoingThree = null;
    this.rebuildPost();
  }

  private rebuildPost(): void {
    if (!this.activeThree) return;
    this.post.dispose();
    this.post = new PostChain(this.renderer, this.activeThree, this.camera);
  }

  private resetSceneParams(): void {
    for (const key of Object.keys(this.params)) delete this.params[key];
    const active = this.registry.activeScene();
    if (!active) return;
    for (const p of active.params) {
      this.params[p.key] = p.default;
    }
  }

  private measureSize(): void {
    const w = Math.max(1, this.canvas.clientWidth || this.canvas.width || 1);
    const h = Math.max(1, this.canvas.clientHeight || this.canvas.height || 1);
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.size = { w, h, dpr: Math.min(this.maxDpr, dpr) };
  }

  private drawW(): number {
    return Math.max(1, Math.round(this.size.w * this.effectivePixelRatio()));
  }

  private drawH(): number {
    return Math.max(1, Math.round(this.size.h * this.effectivePixelRatio()));
  }

  private effectivePixelRatio(): number {
    const level = this.governor.level;
    return this.size.dpr * level.dprScale * level.renderScale;
  }

  private applyQuality(): void {
    this.renderer.setPixelRatio(this.effectivePixelRatio());
    this.renderer.setSize(this.size.w, this.size.h, false);
    this.camera.aspect = this.size.w / this.size.h;
    this.camera.updateProjectionMatrix();
    this.compositor?.setSize(this.drawW(), this.drawH());
    this.feedback?.setSize(this.drawW(), this.drawH());
    const active = this.registry.activeScene();
    active?.resize({ w: this.size.w, h: this.size.h, dpr: this.size.dpr });
  }

  private readonly onResize = (): void => {
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeTimer = setTimeout(() => {
      this.measureSize();
      this.applyQuality();
    }, RESIZE_DEBOUNCE_MS);
  };

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.paused = true;
    this.hooks.onToast?.('Graphics context lost — restoring…');
  };

  private readonly onContextRestored = (): void => {
    // Stay paused until the active scene's GPU resources are rebuilt, then
    // resume. (A crossfade in flight when the context dropped is not resumed;
    // the incoming scene is reinitialized and the fade is abandoned.)
    void this.reinitActiveScene().finally(() => {
      this.paused = false;
      this.applyQuality();
      this.hooks.onToast?.('Graphics context restored.');
    });
  };

  /** Dispose and re-`init` the active scene into a fresh THREE.Scene. */
  private async reinitActiveScene(): Promise<void> {
    const module = this.registry.activeScene();
    if (!module || !this.activeThree) return;
    module.dispose();
    const fresh = new Scene();
    this.threeByScene.set(module, fresh);
    await module.init(this.buildContext(fresh));
    this.activeThree = fresh;
    this.rebuildPost();
  }

  /** Busy-wait `ms` to simulate GPU/CPU load (dev governor demo only). */
  private static burn(ms: number): void {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      /* spin */
    }
  }
}

/** Bootstrap and initialize a {@link RenderCore}. */
export function createRenderCore(opts: RenderCoreOptions): Promise<RenderCore> {
  return RenderCore.create(opts);
}
