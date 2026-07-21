/**
 * DEV-ONLY mock of {@link EngineFacade}. Never imported by production wiring:
 * the real engine (T02 audio + T03 render) is injected at the Wave B `main.tsx`
 * gate via `<App engine={realEngine} />`. This mock lets T04 build the whole shell
 * — source picker, onboarding, steering, chrome — with no audio/render code present.
 *
 * Beyond the frozen `EngineFacade` surface it exposes a small dev control API
 * (`emit`, `emitSilent`, `lastSource`, `profile`) that tests and the dev harness
 * drive by hand. Production never sees these.
 */
import type { EngineFacade } from '../../contracts/engine';
import type { FrameFeatures } from '../../contracts/features';
import type { SourceCapability, SourceKind } from '../../contracts/source';

/** The four canned browser profiles from 00-overview's browser list + capture ladder. */
export type BrowserProfile = 'chrome' | 'firefox' | 'waterfox' | 'safari';

export const BROWSER_PROFILES: readonly BrowserProfile[] = [
  'chrome',
  'firefox',
  'waterfox',
  'safari',
] as const;

export const PROFILE_LABEL: Record<BrowserProfile, string> = {
  chrome: 'Chrome / Edge',
  firefox: 'Firefox',
  waterfox: 'Waterfox',
  safari: 'Safari',
};

/** A neutral idle frame; `silent: true` because no source is producing signal yet. */
export function idleFrame(overrides: Partial<FrameFeatures> = {}): FrameFeatures {
  return {
    t: 0,
    rms: 0,
    loudNorm: 0,
    bands: { bass: 0, lowMid: 0, mid: 0, high: 0 },
    spectrum: new Float32Array(64),
    flux: 0,
    onset: false,
    beat: { bpm: null, phase: 0, confidence: 0 },
    silent: true,
    reducedMotion: false,
    ...overrides,
  };
}

/** A lively frame simulating real signal (used to pass the signal-check screen). */
export function signalFrame(t: number): FrameFeatures {
  const spectrum = new Float32Array(64);
  for (let i = 0; i < spectrum.length; i += 1) {
    spectrum[i] = Math.max(0, 0.8 - i / 80 + Math.sin(t * 6 + i) * 0.12);
  }
  return {
    t,
    rms: 0.18,
    loudNorm: 0.62,
    bands: { bass: 0.7, lowMid: 0.4, mid: 0.35, high: 0.22 },
    spectrum,
    flux: 0.3,
    onset: t % 0.5 < 0.02,
    beat: { bpm: 120, phase: (t % 0.5) * 2, confidence: 0.8 },
    silent: false,
    reducedMotion: false,
  };
}

/** Per-browser capability matrix. `display` (tab/system audio) is Chromium-only. */
export function capabilitiesFor(profile: BrowserProfile): SourceCapability[] {
  const displayAvailable = profile === 'chrome';
  const displayReason =
    profile === 'safari'
      ? "Safari doesn't support tab audio capture — use a loopback device or drop a file."
      : `${PROFILE_LABEL[profile]} has never shipped tab audio capture — use a loopback device or drop a file.`;

  return [
    { kind: 'file', available: true },
    displayAvailable
      ? { kind: 'display', available: true }
      : { kind: 'display', available: false, reason: displayReason },
    { kind: 'input', available: true },
    { kind: 'procedural', available: true },
  ];
}

const CANNED_SCENES: { id: string; name: string }[] = [
  { id: 'standing-wave', name: 'Standing Wave' },
  { id: 'heritage', name: 'Heritage' },
  { id: 'phosphor', name: 'Phosphor' },
];

/** The mock engine: the frozen facade plus a dev control surface. */
export interface MockEngine extends EngineFacade {
  readonly profile: BrowserProfile;
  /** Push a full frame to all `onFrame` subscribers and update `latest()`. */
  emit(frame: FrameFeatures): void;
  /** Convenience: emit a sustained-silence frame (source active, sub-threshold). */
  emitSilent(): void;
  /** The most recent `selectSource` call, for assertions/dev display. */
  lastSource(): { kind: SourceKind; deviceId?: string; fileName?: string } | null;
  /** The currently active scene id (mirrors `setScene`). */
  activeScene(): string;
}

export interface MockEngineOptions {
  /** Make `selectSource` reject, to exercise permission-denied error surfaces. */
  rejectSelect?: boolean;
}

export function createMockEngine(
  profile: BrowserProfile = 'chrome',
  options: MockEngineOptions = {},
): MockEngine {
  const subscribers = new Set<(f: FrameFeatures) => void>();
  let last: FrameFeatures = idleFrame();
  let selected: { kind: SourceKind; deviceId?: string; fileName?: string } | null = null;
  let scene = CANNED_SCENES[0]?.id ?? 'standing-wave';

  const emit = (frame: FrameFeatures): void => {
    last = frame;
    for (const cb of subscribers) cb(frame);
  };

  return {
    profile,
    capabilities: () => capabilitiesFor(profile),
    selectSource: async (kind, opts) => {
      if (options.rejectSelect) {
        throw new DOMException('Permission denied', 'NotAllowedError');
      }
      const next: { kind: SourceKind; deviceId?: string; fileName?: string } = { kind };
      if (opts?.deviceId !== undefined) next.deviceId = opts.deviceId;
      if (opts?.file !== undefined) next.fileName = opts.file.name;
      selected = next;
      // A real engine resumes its AudioContext on this user-gesture call.
      await Promise.resolve();
    },
    unlock: () => Promise.resolve(),
    latest: () => last,
    onFrame: (cb) => {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    setScene: (id) => {
      scene = id;
    },
    scenes: () => CANNED_SCENES.map((s) => ({ ...s })),
    emit,
    emitSilent: () => emit(idleFrame({ silent: true, t: last.t + 0.05 })),
    lastSource: () => selected,
    activeScene: () => scene,
  };
}
