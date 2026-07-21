import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { pass, uniform } from 'three/tsl';
import type { Camera, Scene } from 'three';
import { PostProcessing, type WebGPURenderer } from 'three/webgpu';

/** Tunable bloom parameters (all live-updatable via uniforms). */
export interface BloomParams {
  strength: number;
  radius: number;
  threshold: number;
}

export const DEFAULT_BLOOM: BloomParams = {
  strength: 0.6,
  radius: 0.4,
  threshold: 0.85,
};

/**
 * TSL post-processing chain: scene pass → bloom → screen.
 *
 * Globally toggleable. When **off** the render loop draws the scene straight to
 * the canvas via `renderer.render(...)` and this object does nothing — the post
 * pipeline is never built, so it costs exactly zero. When **on**, {@link render}
 * runs the composited chain. Bloom thresholds/strength are uniform-backed, so
 * the params panel (T07) can drive them without rebuilding the graph.
 *
 * Built lazily on first enable; GPU-bound and not exercised in headless tests.
 */
export class PostChain {
  private post: PostProcessing | null = null;
  private enabled = false;

  private readonly strength = uniform(DEFAULT_BLOOM.strength);
  private readonly radius = uniform(DEFAULT_BLOOM.radius);
  private readonly threshold = uniform(DEFAULT_BLOOM.threshold);

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly scene: Scene,
    private readonly camera: Camera,
  ) {}

  /** Whether the bloom chain is active. */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Toggle the chain. Building the graph is deferred to the first enable. */
  setEnabled(on: boolean): void {
    if (on && !this.post) this.build();
    this.enabled = on;
  }

  /** Live-update bloom parameters without rebuilding the graph. */
  setBloom(params: Partial<BloomParams>): void {
    if (params.strength !== undefined) this.strength.value = params.strength;
    if (params.radius !== undefined) this.radius.value = params.radius;
    if (params.threshold !== undefined) this.threshold.value = params.threshold;
  }

  private build(): void {
    const scenePass = pass(this.scene, this.camera);
    const bloomPass = bloom(scenePass, this.strength, this.radius, this.threshold);
    this.post = new PostProcessing(this.renderer, scenePass.add(bloomPass));
  }

  /**
   * Draw one frame. With bloom on, runs the composited post chain; with bloom
   * off, a plain scene render (zero post cost).
   */
  render(): void {
    if (this.enabled && this.post) {
      this.post.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** Free the post pipeline. */
  dispose(): void {
    this.post?.dispose();
    this.post = null;
  }
}
