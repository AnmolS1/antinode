import type { AudioSourceProvider, SourceKind } from '../../contracts';

/** A selectable audio-input device (a microphone OR a loopback device). */
export interface InputDevice {
  deviceId: string;
  label: string;
}

/**
 * Microphone OR system-loopback capture (BlackHole / VB-Cable show up here as
 * first-class picks — this is the Waterfox + headphones answer). Captured with
 * all voice DSP disabled so the analysis sees the real signal. The tap node is
 * NEVER connected to the destination — routing a live input to the speakers is
 * a feedback loop.
 *
 * Note: Safari partially ignores `echoCancellation/noiseSuppression/
 * autoGainControl` and keeps some voice processing. We pass the constraints and
 * accept whatever it grants rather than fighting it.
 */
export class InputSource implements AudioSourceProvider {
  readonly kind: SourceKind = 'input';
  readonly label: string;

  private readonly deviceId: string | undefined;
  private stream: MediaStream | null = null;
  private node: MediaStreamAudioSourceNode | null = null;

  constructor(deviceId?: string, label?: string) {
    this.deviceId = deviceId;
    this.label = label ?? 'Microphone / loopback';
  }

  /**
   * Enumerate audio-input devices. Labels are only populated AFTER capture
   * permission has been granted once (browser privacy rule), which is why the
   * picker should call this again post-permission to reveal loopback names.
   */
  static async enumerate(): Promise<InputDevice[]> {
    const md = navigator.mediaDevices;
    if (!md?.enumerateDevices) return [];
    const devices = await md.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Input ${i + 1}` }));
  }

  async start(ctx: AudioContext): Promise<AudioNode> {
    const audio: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 2,
    };
    if (this.deviceId !== undefined) {
      audio.deviceId = { exact: this.deviceId };
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    this.stream = stream;
    const node = ctx.createMediaStreamSource(stream);
    // Deliberately NOT connected to ctx.destination — no feedback loop.
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
