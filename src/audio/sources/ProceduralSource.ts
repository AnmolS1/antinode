import type { AudioSourceProvider, SourceKind } from '../../contracts';

/**
 * Floor-mode source for when only Spotify metadata is available (no capturable
 * audio). It contributes no spectral truth; it just keeps the audio graph and
 * the engine loop alive with a silent (zero-gain) oscillator so the engine can
 * emit synthetic, progress-driven {@link FrameFeatures} (`silent = false`).
 * The actual motion synthesis happens engine/scene-side, not here.
 */
export class ProceduralSource implements AudioSourceProvider {
  readonly kind: SourceKind = 'procedural';
  readonly label = 'Spotify (metadata only)';

  private osc: OscillatorNode | null = null;
  private gain: GainNode | null = null;

  start(ctx: AudioContext): Promise<AudioNode> {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0; // silent — never heard.
    osc.connect(gain);
    osc.start();
    this.osc = osc;
    this.gain = gain;
    // Return the (silent) gain node as the tap; the engine ignores its spectrum
    // and synthesizes features from Spotify progress instead.
    return Promise.resolve(gain);
  }

  stop(): Promise<void> {
    try {
      this.osc?.stop();
      this.osc?.disconnect();
      this.gain?.disconnect();
    } catch {
      /* already stopped */
    }
    this.osc = null;
    this.gain = null;
    return Promise.resolve();
  }
}
