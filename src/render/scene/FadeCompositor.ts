import { HalfFloatType, LinearFilter, RenderTarget } from 'three';
import { mix, texture, uv } from 'three/tsl';
import { uniform } from 'three/tsl';
import { MeshBasicNodeMaterial, QuadMesh, type WebGPURenderer } from 'three/webgpu';

/**
 * Crossfade compositor for scene switches.
 *
 * The render loop draws the outgoing scene into {@link outTarget} and the
 * incoming scene into {@link inTarget}, then {@link render}s a fullscreen quad
 * that mixes the two by the fade alpha. This is only used during the 400 ms
 * crossfade window; steady state renders the active scene straight through the
 * post chain. GPU-bound — not exercised in headless tests.
 */
export class FadeCompositor {
  private out: RenderTarget;
  private in: RenderTarget;
  private readonly alpha = uniform(0);
  private readonly material: MeshBasicNodeMaterial;
  private readonly quad: QuadMesh;

  constructor(width: number, height: number) {
    this.out = FadeCompositor.makeTarget(width, height);
    this.in = FadeCompositor.makeTarget(width, height);

    this.material = new MeshBasicNodeMaterial();
    this.material.colorNode = mix(
      texture(this.out.texture, uv()),
      texture(this.in.texture, uv()),
      this.alpha,
    );
    this.quad = new QuadMesh(this.material);
  }

  private static makeTarget(width: number, height: number): RenderTarget {
    return new RenderTarget(Math.max(1, width), Math.max(1, height), {
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
  }

  /** Target the outgoing scene renders into. */
  get outTarget(): RenderTarget {
    return this.out;
  }

  /** Target the incoming scene renders into. */
  get inTarget(): RenderTarget {
    return this.in;
  }

  /** Resize both targets to match the canvas. */
  setSize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.out.setSize(w, h);
    this.in.setSize(w, h);
  }

  /** Composite the two targets to the screen at `alpha` (0 = outgoing, 1 = incoming). */
  render(renderer: WebGPURenderer, alpha: number): void {
    this.alpha.value = Math.min(1, Math.max(0, alpha));
    this.quad.render(renderer);
  }

  /** Free targets and material. */
  dispose(): void {
    this.out.dispose();
    this.in.dispose();
    this.material.dispose();
  }
}
