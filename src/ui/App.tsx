/**
 * The Antinode UI shell. React renders chrome only — nothing here runs in the rAF
 * path (per 00-overview / 02-design). The engine is injected as a single prop; at the
 * Wave B `main.tsx` gate the mock is swapped for the real `EngineFacade` with no other
 * change. Until then, `main.tsx` still mounts the T01 placeholder; this shell is
 * exercised via the dev mock and the Vitest suite.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { EngineFacade } from '../contracts/engine';
import type { SourceKind } from '../contracts/source';
import { useSpotify } from '../spotify/useSpotify';
import type { ToastInput } from './context';
import {
  useFrameRate,
  useIdleFade,
  useKeyboardShortcuts,
  useReducedMotion,
  type Shortcut,
} from './hooks';
import { loadRememberedSource, saveRememberedSource, snapshotCanvas } from './util';
import { DEVICE_FIXTURES } from './dev/fixtures';
import { Landing } from './components/Landing';
import { DevicePicker } from './components/DevicePicker';
import { SignalCheck } from './components/SignalCheck';
import { SteeringFlow } from './components/SteeringFlow';
import { SceneSwitcher } from './components/SceneSwitcher';
import { SpotifyArea } from './components/SpotifyArea';
import { PerfHud } from './components/PerfHud';
import { ShortcutOverlay, type ShortcutHint } from './components/ShortcutOverlay';
import { Toasts, type Toast } from './components/Toasts';
import { LiveRegion } from './components/LiveRegion';
import { ParamsPane, type PaneApi } from './params/ParamsPane';
import type { ParamHost } from './params/types';
import { decodePresetFromHash } from './params/presets';
import './styles.css';

type Phase = 'onboarding' | 'device' | 'signal' | 'live';

/** Spotify UI is behind a flag (00-overview: bonus tier for 5 seats). */
const FEATURE_SPOTIFY = true;

const SHORTCUT_HINTS: ShortcutHint[] = [
  { keys: 'Space', label: 'Pin / unpin the UI' },
  { keys: 'F', label: 'Fullscreen' },
  { keys: '1–9', label: 'Select scene' },
  { keys: '[ / ]', label: 'Previous / next preset' },
  { keys: 'R', label: 'Randomize params' },
  { keys: 'S', label: 'Save a PNG of the canvas' },
  { keys: '?', label: 'Toggle this help' },
  { keys: 'Esc', label: 'Close overlays' },
];

function setCanvasLabel(message: string): void {
  document.querySelector('#stage')?.setAttribute('aria-label', message);
}

export function App({
  engine,
  host,
  defaultSceneId,
}: {
  engine: EngineFacade;
  /** The render-backed params host (present in production; omitted in unit tests). */
  host?: ParamHost;
  /** The scene the engine boots on, so the switcher highlights it correctly. */
  defaultSceneId?: string;
}) {
  const capabilities = useMemo(() => engine.capabilities(), [engine]);
  const scenes = useMemo(() => engine.scenes(), [engine]);
  const remembered = useMemo(() => loadRememberedSource(), []);

  const [phase, setPhase] = useState<Phase>('onboarding');
  const [steering, setSteering] = useState(false);
  const [activeScene, setActiveScene] = useState<string>(defaultSceneId ?? scenes[0]?.id ?? '');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPerf, setShowPerf] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [liveMessage, setLiveMessage] = useState('');

  const reducedMotion = useReducedMotion();
  const idle = useIdleFade(3000);
  const fps = useFrameRate(engine);

  const toastId = useRef(0);
  const deviceReturn = useRef<Phase>('onboarding');
  const steeringFileInput = useRef<HTMLInputElement>(null);
  // The params pane hands its imperative API here (once live) for keyboard wiring.
  const paneApiRef = useRef<PaneApi | null>(null);
  const hashApplied = useRef(false);

  const dismissToast = useCallback((id: number): void => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput): void => {
      const id = (toastId.current += 1);
      setToasts((list) => [...list, { id, ...input }]);
      globalThis.setTimeout(() => dismissToast(id), 5000);
    },
    [dismissToast],
  );

  const announce = useCallback((message: string): void => {
    setLiveMessage(message);
    setCanvasLabel(message);
  }, []);

  // Real Spotify now-playing (T08), behind the feature flag. Track changes are
  // announced on the live region for parity with scene-change announcements.
  const sp = useSpotify({
    onTrackChange: (np) => announce(`Now playing: ${np.title} by ${np.artists.join(', ')}`),
  });

  const beginSignalCheck = useCallback(
    async (kind: SourceKind, opts?: { deviceId?: string; file?: File }): Promise<void> => {
      // First user gesture: resume the (gesture-suspended) AudioContext so audio
      // actually plays. Safe to call repeatedly; selectSource also resumes.
      void engine.unlock();
      try {
        await engine.selectSource(kind, opts);
        setSteering(false);
        setPhase('signal');
      } catch {
        const copy: Record<SourceKind, string> = {
          file: 'Could not read that file. Try another audio file.',
          display: 'Tab capture was blocked. Pick the tab and allow “Share audio”.',
          input: 'Microphone/loopback access was denied. Check your browser permissions.',
          procedural: 'Could not start metadata mode.',
        };
        toast({ kind: 'error', message: copy[kind] });
        setPhase('onboarding');
      }
    },
    [engine, toast],
  );

  const onPick = useCallback(
    (kind: SourceKind, opts?: { file?: File }): void => {
      if (kind === 'file') {
        if (opts?.file) void beginSignalCheck('file', { file: opts.file });
        return;
      }
      if (kind === 'input') {
        deviceReturn.current = 'onboarding';
        setPhase('device');
        return;
      }
      void beginSignalCheck(kind);
    },
    [beginSignalCheck],
  );

  const selectScene = useCallback(
    (id: string): void => {
      setActiveScene(id);
      engine.setScene(id);
      const name = scenes.find((s) => s.id === id)?.name ?? id;
      announce(`Scene: ${name}`);
    },
    [engine, scenes, announce],
  );

  // Keep the switcher highlight correct when the scene changes from elsewhere
  // (e.g. a preset that targets another scene). No-op without a host (unit tests).
  useEffect(() => {
    if (!host) return;
    return host.onSceneChange((id) => setActiveScene(id));
  }, [host]);

  // The params pane hands over its imperative API once live; wire it to the
  // keyboard and decode any inbound share hash (#p=…) exactly once.
  const onPaneReady = useCallback((api: PaneApi): void => {
    paneApiRef.current = api;
    if (hashApplied.current) return;
    hashApplied.current = true;
    const hash = typeof location !== 'undefined' ? location.hash : '';
    if (!hash) return;
    void decodePresetFromHash(hash).then((preset) => {
      if (preset) api.applyPreset(preset);
    });
  }, []);

  const toggleFullscreen = useCallback((): void => {
    const el = document.documentElement;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else if (typeof el.requestFullscreen === 'function') {
      void el.requestFullscreen().catch(() =>
        toast({ kind: 'error', message: 'Fullscreen was blocked by the browser.' }),
      );
    }
  }, [toast]);

  const takeSnapshot = useCallback((): void => {
    const ok = snapshotCanvas();
    if (!ok) toast({ kind: 'info', message: 'Nothing to snapshot yet.' });
  }, [toast]);

  const closeOverlays = useCallback((): void => {
    setShowShortcuts(false);
    setSteering(false);
  }, []);

  const shortcuts = useMemo<Shortcut[]>(() => {
    const sceneKeys: Shortcut[] = scenes.slice(0, 9).map((s, i) => ({
      key: String(i + 1),
      label: `Scene ${s.name}`,
      run: () => selectScene(s.id),
    }));
    return [
      { key: ' ', label: 'Pin UI', run: idle.togglePin },
      { key: 'f', label: 'Fullscreen', run: toggleFullscreen },
      { key: 'F', label: 'Fullscreen', run: toggleFullscreen },
      ...sceneKeys,
      { key: '[', label: 'Previous preset', run: () => paneApiRef.current?.cyclePrev() },
      { key: ']', label: 'Next preset', run: () => paneApiRef.current?.cycleNext() },
      { key: 'r', label: 'Randomize', run: () => paneApiRef.current?.randomize() },
      { key: 'R', label: 'Randomize', run: () => paneApiRef.current?.randomize() },
      { key: 's', label: 'Snapshot', run: takeSnapshot },
      { key: 'S', label: 'Snapshot', run: takeSnapshot },
      { key: '?', label: 'Shortcuts', run: () => setShowShortcuts((v) => !v) },
      { key: 'Escape', label: 'Close overlays', run: closeOverlays },
    ];
  }, [scenes, idle.togglePin, toggleFullscreen, takeSnapshot, selectScene, closeOverlays]);

  useKeyboardShortcuts(shortcuts, phase === 'live');

  const rootClass = `app${reducedMotion ? ' reduced-motion' : ''}`;
  const chromeHidden = idle.hidden && !steering && !showShortcuts;

  // — Onboarding / signal-check / device flows are full-screen; live is the chrome. —
  if (phase === 'onboarding') {
    return (
      <div className={rootClass}>
        <Landing capabilities={capabilities} onPick={onPick} />
        <Toasts toasts={toasts} onDismiss={dismissToast} />
        <LiveRegion message={liveMessage} />
      </div>
    );
  }

  if (phase === 'device') {
    return (
      <div className={rootClass}>
        <div className="centered">
          <div className="panel">
            <DevicePicker
              devices={DEVICE_FIXTURES}
              {...(remembered?.deviceId ? { initialDeviceId: remembered.deviceId } : {})}
              onConfirm={(deviceId) => {
                saveRememberedSource({ kind: 'input', deviceId });
                void beginSignalCheck('input', { deviceId });
              }}
              onCancel={() => setPhase(deviceReturn.current)}
            />
          </div>
        </div>
        <Toasts toasts={toasts} onDismiss={dismissToast} />
        <LiveRegion message={liveMessage} />
      </div>
    );
  }

  if (phase === 'signal') {
    return (
      <div className={rootClass}>
        <div className="centered">
          <SignalCheck
            engine={engine}
            onSignal={() => {
              setPhase('live');
              announce('Signal locked — visualizing.');
            }}
            onSilent={() => {
              setPhase('live');
              setSteering(true);
              announce('No signal detected. Steering help is open.');
            }}
            onBack={() => setPhase('onboarding')}
          />
        </div>
        <Toasts toasts={toasts} onDismiss={dismissToast} />
        <LiveRegion message={liveMessage} />
      </div>
    );
  }

  // phase === 'live'
  return (
    <div className={rootClass} data-phase="live">
      <div className={`chrome${chromeHidden ? ' ui-hidden' : ''}`}>
        <header className="topbar panel">
          <SceneSwitcher scenes={scenes} activeId={activeScene} onSelect={selectScene} />
          <div className="topbar__actions">
            <button
              type="button"
              className="btn btn--ghost"
              aria-pressed={idle.pinned}
              onClick={idle.togglePin}
            >
              {idle.pinned ? 'Unpin' : 'Pin'} UI
            </button>
            <button type="button" className="btn btn--ghost" onClick={toggleFullscreen}>
              Fullscreen
            </button>
            <button type="button" className="btn btn--ghost" onClick={takeSnapshot}>
              Snapshot
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              aria-pressed={showPerf}
              onClick={() => setShowPerf((v) => !v)}
            >
              Perf
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              aria-haspopup="dialog"
              onClick={() => setShowShortcuts(true)}
            >
              Shortcuts (?)
            </button>
          </div>
        </header>

        {showPerf && (
          <div className="hud-slot">
            <PerfHud fps={fps} />
          </div>
        )}

        {/* Param dock (T07). The pane needs the render-backed host; without it
            (unit tests inject no host) the slot stays empty. */}
        <div className="dock" data-reserved-for="T07-params">
          {host && <ParamsPane engine={engine} host={host} onReady={onPaneReady} />}
        </div>

        {FEATURE_SPOTIFY && (
          <aside className="spotify-slot">
            <SpotifyArea
              status={sp.status}
              nowPlaying={sp.nowPlaying}
              palette={sp.palette}
              stale={sp.stale}
              onConnect={sp.connect}
              onDisconnect={sp.disconnect}
              onReconnect={sp.reconnect}
            />
          </aside>
        )}
      </div>

      {steering && (
        <div className="centered centered--overlay">
          <SteeringFlow
            capabilities={capabilities}
            onTabCapture={() => void beginSignalCheck('display')}
            onLoopbackDevice={() => {
              deviceReturn.current = 'live';
              setSteering(false);
              setPhase('device');
            }}
            onFile={() => steeringFileInput.current?.click()}
            onDismiss={() => setSteering(false)}
          />
        </div>
      )}

      {showShortcuts && (
        <ShortcutOverlay shortcuts={SHORTCUT_HINTS} onClose={() => setShowShortcuts(false)} />
      )}

      <input
        ref={steeringFileInput}
        type="file"
        accept="audio/*"
        className="visually-hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void beginSignalCheck('file', { file });
          e.target.value = '';
        }}
      />

      <Toasts toasts={toasts} onDismiss={dismissToast} />
      <LiveRegion message={liveMessage} />
    </div>
  );
}
