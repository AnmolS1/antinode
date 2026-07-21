import type { FrameFeatures } from './features';
import type { SourceCapability, SourceKind } from './source';

/**
 * The single facade the UI (T04/T07) uses to drive the audio+render engine
 * without touching its internals. Lets the shell query source availability,
 * switch sources and scenes, and subscribe to the per-frame feature stream.
 */
export interface EngineFacade {
  /** Report which source kinds are available in this browser/context. */
  capabilities(): SourceCapability[];
  /**
   * Switch the active audio source.
   * @param kind which source to attach
   * @param opts optional device id (for `'input'`) or `File` (for `'file'`)
   */
  selectSource(kind: SourceKind, opts?: { deviceId?: string; file?: File }): Promise<void>;
  /** The most recent frame of features (for pull-based readers). */
  latest(): FrameFeatures;
  /**
   * Subscribe to the per-frame feature stream.
   * @returns an unsubscribe function.
   */
  onFrame(cb: (f: FrameFeatures) => void): () => void;
  /** Resume the (gesture-suspended) AudioContext. Call from a user gesture (e.g. first
   *  source selection or an explicit "enable audio" click). Safe to call repeatedly;
   *  a no-op once running. `selectSource()` also resumes as a fallback. */
  unlock(): Promise<void>;
  /** Switch the active scene by its {@link import('./scene').SceneModule.id}. */
  setScene(id: string): void;
  /** List the registered scenes as `{ id, name }`. */
  scenes(): { id: string; name: string }[];
}
