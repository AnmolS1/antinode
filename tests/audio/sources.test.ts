import { describe, it, expect, vi, afterEach } from 'vitest';
import { InputSource } from '../../src/audio/sources/InputSource';
import { DisplayCaptureSource } from '../../src/audio/sources/DisplayCaptureSource';
import { ProceduralSource } from '../../src/audio/sources/ProceduralSource';
import { FileSource } from '../../src/audio/sources/FileSource';
import { createSource } from '../../src/audio/sources';

/** A tap node that records everything it was connected to. */
class MockNode {
  readonly connected: unknown[] = [];
  connect(dest: unknown): unknown {
    this.connected.push(dest);
    return dest;
  }
  disconnect(): void {}
}

const DESTINATION = { __destination: true };

function mockCtx(): AudioContext {
  const ctx = {
    destination: DESTINATION,
    sampleRate: 44_100,
    createMediaStreamSource: (stream: unknown): MockNode => {
      const n = new MockNode();
      (n as unknown as { stream: unknown }).stream = stream;
      return n;
    },
    createMediaElementSource: (): MockNode => new MockNode(),
    createOscillator: () => ({
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
    }),
    createGain: () => ({
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    }),
  };
  return ctx as unknown as AudioContext;
}

function track(kind: 'audio' | 'video'): MediaStreamTrack {
  return { kind, stop: vi.fn() } as unknown as MediaStreamTrack;
}

function mockStream(tracks: MediaStreamTrack[]): MediaStream {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
  } as unknown as MediaStream;
}

function setMediaDevices(md: Partial<MediaDevices>): void {
  Object.defineProperty(navigator, 'mediaDevices', { value: md, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
});

describe('InputSource', () => {
  it('requests capture with all voice DSP disabled and never routes to destination', async () => {
    const getUserMedia = vi.fn<(c: MediaStreamConstraints) => Promise<MediaStream>>(async () =>
      mockStream([track('audio')]),
    );
    setMediaDevices({ getUserMedia } as unknown as MediaDevices);

    const src = new InputSource('device-42');
    const node = (await src.start(mockCtx())) as unknown as MockNode;

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    const arg = getUserMedia.mock.calls[0]?.[0] as MediaStreamConstraints;
    const audio = arg.audio as MediaTrackConstraints;
    expect(audio.echoCancellation).toBe(false);
    expect(audio.noiseSuppression).toBe(false);
    expect(audio.autoGainControl).toBe(false);
    expect(audio.channelCount).toBe(2);
    expect(audio.deviceId).toEqual({ exact: 'device-42' });

    // The mic tap is NEVER connected to the destination (no feedback loop).
    expect(node.connected).not.toContain(DESTINATION);
    expect(node.connected).toHaveLength(0);
  });

  it('omits deviceId when none is given', async () => {
    const getUserMedia = vi.fn<(c: MediaStreamConstraints) => Promise<MediaStream>>(async () =>
      mockStream([track('audio')]),
    );
    setMediaDevices({ getUserMedia } as unknown as MediaDevices);
    await new InputSource().start(mockCtx());
    const audio = (getUserMedia.mock.calls[0]?.[0] as MediaStreamConstraints)
      .audio as MediaTrackConstraints;
    expect('deviceId' in audio).toBe(false);
  });

  it('enumerate lists audio inputs', async () => {
    setMediaDevices({
      enumerateDevices: async () =>
        [
          { kind: 'audioinput', deviceId: 'a', label: 'BlackHole 2ch' },
          { kind: 'videoinput', deviceId: 'v', label: 'Cam' },
        ] as MediaDeviceInfo[],
    } as unknown as MediaDevices);
    const list = await InputSource.enumerate();
    expect(list).toHaveLength(1);
    expect(list[0]?.label).toBe('BlackHole 2ch');
  });
});

describe('DisplayCaptureSource', () => {
  it('stops the video track, keeps audio, and does not route to destination', async () => {
    const v = track('video');
    const a = track('audio');
    const getDisplayMedia = vi.fn(async () => mockStream([v, a]));
    setMediaDevices({ getDisplayMedia } as unknown as MediaDevices);

    const src = new DisplayCaptureSource();
    const node = (await src.start(mockCtx())) as unknown as MockNode;

    expect(v.stop).toHaveBeenCalled();
    expect(a.stop).not.toHaveBeenCalled();
    expect(node.connected).not.toContain(DESTINATION);
  });

  it('rejects when the user did not share audio', async () => {
    const getDisplayMedia = vi.fn(async () => mockStream([track('video')]));
    setMediaDevices({ getDisplayMedia } as unknown as MediaDevices);
    await expect(new DisplayCaptureSource().start(mockCtx())).rejects.toThrow(/audio/i);
  });
});

describe('ProceduralSource', () => {
  it('returns a silent (zero-gain) tap, not routed to destination', async () => {
    const ctx = mockCtx();
    const node = await new ProceduralSource().start(ctx);
    expect((node as unknown as { gain: { value: number } }).gain.value).toBe(0);
  });
});

describe('FileSource', () => {
  it('routes the file to the destination (the file is meant to be heard)', async () => {
    // Fake <audio> element that fires 'canplay' when load() is called.
    class FakeAudio extends EventTarget {
      loop = false;
      crossOrigin: string | null = null;
      preload = '';
      src = '';
      play = vi.fn(async () => {});
      pause = vi.fn();
      removeAttribute = vi.fn();
      load(): void {
        queueMicrotask(() => this.dispatchEvent(new Event('canplay')));
      }
    }
    vi.stubGlobal('Audio', FakeAudio);
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:x';
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};

    const connected: unknown[] = [];
    const ctx = {
      destination: DESTINATION,
      sampleRate: 44_100,
      createMediaElementSource: () => ({
        connect: (d: unknown) => connected.push(d),
        disconnect: vi.fn(),
      }),
    } as unknown as AudioContext;

    const file = { name: 'song.mp3' } as unknown as File;
    const src = new FileSource(file);
    expect(src.label).toBe('song.mp3');
    await src.start(ctx);
    expect(connected).toContain(DESTINATION);
  });
});

describe('createSource factory', () => {
  it('throws when a file source has no file', () => {
    expect(() => createSource('file')).toThrow(/file/i);
  });
  it('builds each ladder kind', () => {
    expect(createSource('input').kind).toBe('input');
    expect(createSource('display').kind).toBe('display');
    expect(createSource('procedural').kind).toBe('procedural');
  });
});
