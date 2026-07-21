/**
 * The kinds of audio source the capture ladder (T02) can attach to.
 * `'input'` covers a microphone OR a system loopback capture device.
 */
export type SourceKind = 'file' | 'display' | 'input' | 'procedural'; // 'input' = mic OR loopback device

/**
 * Whether a given {@link SourceKind} can be used in the current browser/context,
 * with an honest, user-facing `reason` when it cannot (varies by browser).
 */
export interface SourceCapability {
  /** The source kind this capability describes. */
  kind: SourceKind;
  /** Whether the source is usable right now. */
  available: boolean;
  /** Human-readable "why not", per browser, when unavailable. */
  reason?: string;
} // reason: honest "why not" per browser

/**
 * A pluggable audio source. Implementations (T02) hand back an {@link AudioNode}
 * to tap for analysis; for `'input'` sources that node is NEVER routed to the
 * AudioContext destination (no feedback / no echo of the user's mic).
 */
export interface AudioSourceProvider {
  /** The kind of source this provider represents. */
  readonly kind: SourceKind;
  /** Human-readable label for pickers and status UI. */
  readonly label: string;
  /**
   * Begin capture and return the node to tap for analysis.
   * The returned node is never routed to `ctx.destination` for `'input'`.
   */
  start(ctx: AudioContext): Promise<AudioNode>; // node to tap for analysis (never routed to destination for 'input')
  /** Stop capture and release all underlying resources. */
  stop(): Promise<void>;
  /** Register a callback fired when the source ends on its own (e.g. file EOF). */
  onEnded?(cb: () => void): void;
}
