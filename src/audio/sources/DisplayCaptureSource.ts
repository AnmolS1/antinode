import type { AudioSourceProvider, SourceKind } from '../../contracts';

/**
 * Tab / system-audio capture via `getDisplayMedia({ audio, video })`. The video
 * track is requested only because several browsers refuse audio-only display
 * capture; it is stopped immediately, leaving just the audio track. Chromium-
 * only in practice (feature-gated upstream in {@link detectCapabilities}).
 *
 * If the user shares a surface without ticking "share audio", the stream has no
 * audio track — we detect that here and reject with a clear message rather than
 * silently tapping nothing. (Sustained zero-energy while an audio track IS
 * present is reported downstream by the analyzer's `silent` flag.)
 */
export class DisplayCaptureSource implements AudioSourceProvider {
  readonly kind: SourceKind = 'display';
  readonly label = 'Tab / system audio';

  private stream: MediaStream | null = null;
  private node: MediaStreamAudioSourceNode | null = null;

  async start(ctx: AudioContext): Promise<AudioNode> {
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
    this.stream = stream;

    // Drop video immediately — we only ever wanted the audio.
    stream.getVideoTracks().forEach((t) => t.stop());

    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
      throw new Error(
        'No audio was shared. Re-pick the tab and tick "Share tab audio" (or "Share system audio").',
      );
    }

    const node = ctx.createMediaStreamSource(stream);
    // Not routed to destination — the shared tab is already audible to the user.
    this.node = node;
    return node;
  }

  stop(): Promise<void> {
    try {
      this.node?.disconnect();
    } catch {
      /* already disconnected */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node = null;
    this.stream = null;
    return Promise.resolve();
  }
}
