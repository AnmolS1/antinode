import type { SceneContext, SceneModule } from '../../contracts';

/** Default crossfade duration in milliseconds. */
export const CROSSFADE_MS = 400;

/**
 * Registers scenes and owns the active-scene lifecycle and crossfade *state*.
 *
 * Responsibilities kept here (renderer-free, so unit-testable headlessly):
 * - `register` / `list` / `get` the available {@link SceneModule}s;
 * - `activate(id)` = init the incoming scene, then crossfade from the outgoing
 *   one; on fade completion the outgoing scene is `dispose()`d **and its
 *   reference dropped** so `renderer.info.memory` can return to baseline;
 * - expose fade progress + the outgoing scene so the render loop can draw both
 *   only during the fade.
 *
 * The actual double-render and the `renderer.info` baseline check live in the
 * render loop / {@link import('../RenderCore').RenderCore}, which owns the
 * renderer; {@link activate} fires `onSwapComplete` right after the outgoing
 * scene is freed so that check can snapshot at the correct moment.
 */
export class SceneRegistry {
  private readonly scenes = new Map<string, SceneModule>();
  private readonly order: string[] = [];
  private active: SceneModule | null = null;
  private activeId: string | null = null;

  /** Outgoing scene held only for the duration of a crossfade. */
  private outgoing: SceneModule | null = null;
  private fadeElapsed = 0;
  private fading = false;

  private readonly fadeMs: number;
  private readonly onSwapComplete: (() => void) | undefined;

  constructor(opts?: { fadeMs?: number; onSwapComplete?: () => void }) {
    this.fadeMs = opts?.fadeMs ?? CROSSFADE_MS;
    this.onSwapComplete = opts?.onSwapComplete;
  }

  /** Register a scene. Throws on a duplicate id (ids are used in deep links). */
  register(module: SceneModule): void {
    if (this.scenes.has(module.id)) {
      throw new Error(`SceneRegistry: duplicate scene id "${module.id}"`);
    }
    this.scenes.set(module.id, module);
    this.order.push(module.id);
  }

  /** The registered scenes as `{ id, name }`, in registration order. */
  list(): { id: string; name: string }[] {
    return this.order.map((id) => {
      const m = this.scenes.get(id)!;
      return { id: m.id, name: m.name };
    });
  }

  /** Look up a scene by id. */
  get(id: string): SceneModule | undefined {
    return this.scenes.get(id);
  }

  /** The currently active scene, or null before the first activation. */
  activeScene(): SceneModule | null {
    return this.active;
  }

  /** The active scene's id, or null. */
  activeSceneId(): string | null {
    return this.activeId;
  }

  /**
   * Activate scene `id`. Initializes the incoming scene, then begins a crossfade
   * from the current one. Activating the already-active id is a no-op (the
   * incoming scene is **not** re-initialized).
   *
   * @param id the scene to switch to (must be registered)
   * @param buildContext produces the {@link SceneContext} for the incoming
   *   scene's `init` (fresh per activation so `size`/backend are current)
   */
  async activate(id: string, buildContext: () => SceneContext): Promise<void> {
    if (id === this.activeId) return;

    const next = this.scenes.get(id);
    if (!next) {
      throw new Error(`SceneRegistry: unknown scene id "${id}"`);
    }

    await next.init(buildContext());

    // If a fade was already in flight, finish it now so we never hold two
    // outgoing scenes (and never leak the older one).
    if (this.fading) this.completeFade();

    const previous = this.active;
    this.active = next;
    this.activeId = id;

    if (previous) {
      this.outgoing = previous;
      this.fadeElapsed = 0;
      this.fading = true;
    }
  }

  /** True while a crossfade is in progress. */
  isFading(): boolean {
    return this.fading;
  }

  /** The outgoing scene during a crossfade (draw it under the incoming one), else null. */
  outgoingScene(): SceneModule | null {
    return this.fading ? this.outgoing : null;
  }

  /**
   * Incoming-scene opacity during the crossfade, 0→1. Returns 1 when no fade is
   * active (the active scene is fully shown).
   */
  fadeAlpha(): number {
    if (!this.fading) return 1;
    return Math.min(1, this.fadeElapsed / this.fadeMs);
  }

  /**
   * Advance the crossfade by `dtMs`. On completion the outgoing scene is
   * disposed and dereferenced, then `onSwapComplete` fires.
   */
  advanceFade(dtMs: number): void {
    if (!this.fading) return;
    this.fadeElapsed += Math.max(0, dtMs);
    if (this.fadeElapsed >= this.fadeMs) this.completeFade();
  }

  private completeFade(): void {
    const outgoing = this.outgoing;
    this.outgoing = null;
    this.fading = false;
    this.fadeElapsed = 0;
    if (outgoing) {
      outgoing.dispose();
      this.onSwapComplete?.();
    }
  }

  /** Dispose the active and any outgoing scene and clear all lifecycle state. */
  dispose(): void {
    if (this.fading && this.outgoing) {
      this.outgoing.dispose();
      this.outgoing = null;
      this.fading = false;
    }
    if (this.active) {
      this.active.dispose();
      this.active = null;
      this.activeId = null;
    }
  }
}
