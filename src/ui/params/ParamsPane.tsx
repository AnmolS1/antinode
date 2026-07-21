/**
 * The params pane (T07) — a Tweakpane 4 view auto-generated from the active
 * scene's {@link ParamDef}s plus a global folder, a preset folder, and a
 * (device-gated) control folder. All non-view logic lives in
 * {@link PaneController}; this file only binds widgets to it.
 *
 * Themed entirely through the `--tp-*` CSS-var → token contract already declared
 * in `src/theme/tokens.css` (T04), so it reads as lab instrumentation with zero
 * inline color here.
 *
 * MOUNT SEAM: render `<ParamsPane engine host />` into App's `.dock` slot
 * (App.tsx line ~305, `data-reserved-for="T07-params"`). React renders chrome
 * only; nothing here runs in the rAF path (preview meters sample at ~8 Hz).
 */
import { useEffect, useRef } from 'react';

import type { FolderApi } from 'tweakpane';
import { Pane } from 'tweakpane';

import type { EngineFacade, ParamDef } from '../../contracts';
import type { ModRoute } from '../../render/modmatrix';
import { BEAT_SHAPES, MOD_SOURCES } from '../../render/modmatrix';
import { PaneController } from './controller';
import {
  gamepadSupported,
  initialMidiState,
  loadGamepadMappings,
  loadMidiBindings,
  midiReducer,
  midiSupported,
  pollGamepad,
  saveMidiBindings,
  subscribeMidi,
  type GamepadMapping,
  type MidiState,
} from './midi';
import {
  loadPaneState,
  presetToHash,
  savePaneFolderState,
  saveUserPreset,
  type Preset,
} from './presets';
import type { ParamHost, ParamValue } from './types';

/** Imperative handle the shell wires to keyboard shortcuts (`[` `]` `R`) + share. */
export interface PaneApi {
  controller: PaneController;
  randomize(): void;
  cyclePrev(): void;
  cycleNext(): void;
  /** Build the `#p=…` share hash for the current state and set `location.hash`. */
  share(): Promise<string>;
  savePreset(name: string): void;
  applyPreset(preset: Preset): void;
}

export interface ParamsPaneProps {
  engine: EngineFacade;
  host: ParamHost;
  /** Fired once the controller is live so the shell can wire keys + share. */
  onReady?: (api: PaneApi) => void;
}

const SOURCE_OPTIONS = Object.fromEntries(MOD_SOURCES.map((s) => [s, s]));
const SHAPE_OPTIONS = Object.fromEntries(BEAT_SHAPES.map((s) => [s, s]));
const QUALITY_OPTIONS = { Auto: 'auto', High: '0', Medium: '1', Low: '2', Potato: '3' } as const;

export function ParamsPane({ engine, host, onReady }: ParamsPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<PaneApi | null>(null);

  // Keep `onReady` in a ref so it isn't an effect dependency: the pane is
  // expensive to (re)build (Tweakpane DOM, MIDI subscription, localStorage), and
  // `engine`/`host` are the only inputs that should trigger a rebuild. Scene
  // changes are handled via `host.onSceneChange`, not deps. NOTE: callers MUST
  // pass STABLE `engine` and `host` references (memoize them) — the pane rebuilds
  // whenever either identity changes.
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  useEffect(() => {
    const maybeEl = containerRef.current;
    if (!maybeEl) return;
    const el: HTMLDivElement = maybeEl;

    const controller = new PaneController(engine, host);
    let pane: Pane | null = null;
    let syncTimer: ReturnType<typeof setInterval> | null = null;
    let unsubMidi: (() => void) | null = null;
    let disposed = false;

    // MIDI/gamepad state lives across rebuilds via these refs.
    let midiState: MidiState = initialMidiState(loadMidiBindings());
    let gamepadMappings: GamepadMapping[] = loadGamepadMappings();
    let devicesPresent = false;

    // Preview + editable-sync scratch objects (stable identities for Tweakpane).
    const previewObj: Record<string, number> = {};
    const values: Record<string, ParamValue> = {};

    const dispatchMidi = (deviceName: string, data: Uint8Array): void => {
      const { state, effect } = midiReducer(midiState, { type: 'message', deviceName, message: { data } });
      midiState = state;
      saveMidiBindings(midiState.bindings);
      if (effect) controller.applyNormalized(effect);
    };

    function buildModFolder(parent: FolderApi, def: Extract<ParamDef, { type: 'number' }>): void {
      const modFolder = parent.addFolder({ title: `⊕ mod · ${def.label}`, expanded: false });
      const routes: ModRoute[] = [...host.getRoutes(def.key)];

      const commit = (): void => {
        host.setRoutes(def.key, routes);
      };

      const renderRoutes = (): void => {
        // Rebuild the folder's route rows from scratch (route edits are rare).
        for (const child of [...modFolder.children]) {
          if (child !== addBtn && child !== previewMonitor) modFolder.remove(child);
        }
        routes.forEach((route, i) => {
          const row = { source: route.source, amount: route.amount, shape: route.shape ?? 'sine' };
          const srcBinding = modFolder.addBinding(row, 'source', {
            options: SOURCE_OPTIONS,
            label: `src ${i + 1}`,
            index: i * 3,
          });
          srcBinding.on('change', (ev) => {
            route.source = ev.value as ModRoute['source'];
            commit();
          });
          const amtBinding = modFolder.addBinding(row, 'amount', {
            min: -1,
            max: 1,
            step: 0.01,
            label: 'amount',
            index: i * 3 + 1,
          });
          amtBinding.on('change', (ev) => {
            route.amount = ev.value as number;
            commit();
          });
          if (route.source === 'beatPhase') {
            const shapeBinding = modFolder.addBinding(row, 'shape', {
              options: SHAPE_OPTIONS,
              label: 'shape',
              index: i * 3 + 2,
            });
            shapeBinding.on('change', (ev) => {
              route.shape = ev.value as NonNullable<ModRoute['shape']>;
              commit();
            });
          }
        });
      };

      const addBtn = modFolder.addButton({ title: '+ route' });
      addBtn.on('click', () => {
        routes.push({ source: 'bass', amount: 0.5 });
        commit();
        renderRoutes();
      });
      if (routes.length > 0) {
        const clearBtn = modFolder.addButton({ title: 'clear routes' });
        clearBtn.on('click', () => {
          routes.length = 0;
          commit();
          renderRoutes();
        });
      }
      previewObj[def.key] = host.previewValue(def.key);
      const previewMonitor = modFolder.addBinding(previewObj, def.key, {
        readonly: true,
        label: 'resolved',
        interval: 120,
      });
      renderRoutes();
    }

    function buildControlFolder(): void {
      if (!pane) return;
      const folder = pane.addFolder({ title: 'Control', expanded: false });
      const modulatable = host.paramDefs().filter((d) => d.type === 'number' && d.modulatable);
      if (midiSupported()) {
        for (const def of modulatable) {
          const btn = folder.addButton({ title: `MIDI learn · ${def.label}` });
          btn.on('click', () => {
            midiState = midiReducer(midiState, { type: 'learn', paramKey: def.key }).state;
          });
        }
      }
      if (gamepadSupported() && modulatable[0]) {
        const first = modulatable[0];
        const btn = folder.addButton({ title: `Gamepad → ${first.label}` });
        btn.on('click', () => {
          gamepadMappings = [{ paramKey: first.key, axis: 0 }];
        });
      }
    }

    function build(): void {
      if (disposed) return;
      const sceneId = host.activeSceneId();
      const defs = host.paramDefs();
      const folderState = loadPaneState(sceneId);
      const globals = host.getGlobals();

      pane = new Pane({ container: el });
      el.style.opacity = String(globals.uiOpacity);

      // — Global folder —
      const globalFolder = pane.addFolder({
        title: 'Global',
        expanded: folderState['global'] ?? false,
      });
      globalFolder.on('fold', (ev) => savePaneFolderState(sceneId, 'global', ev.expanded));
      const g = { bloom: globals.bloom, quality: globals.quality, uiOpacity: globals.uiOpacity };
      globalFolder.addBinding(g, 'bloom', { label: 'Bloom' }).on('change', (ev) => {
        host.setGlobal('bloom', ev.value as boolean);
      });
      globalFolder
        .addBinding(g, 'quality', { label: 'Quality', options: QUALITY_OPTIONS })
        .on('change', (ev) => {
          host.setGlobal('quality', ev.value as (typeof QUALITY_OPTIONS)[keyof typeof QUALITY_OPTIONS]);
        });
      globalFolder
        .addBinding(g, 'uiOpacity', { label: 'UI opacity', min: 0.3, max: 1, step: 0.01 })
        .on('change', (ev) => {
          const v = ev.value as number;
          host.setGlobal('uiOpacity', v);
          el.style.opacity = String(v);
          document.documentElement.style.setProperty('--ui-opacity', String(v));
        });

      // — Scene params folder —
      const sceneName = engine.scenes().find((s) => s.id === sceneId)?.name ?? sceneId;
      const sceneFolder = pane.addFolder({
        title: sceneName,
        expanded: folderState['scene'] ?? true,
      });
      sceneFolder.on('fold', (ev) => savePaneFolderState(sceneId, 'scene', ev.expanded));

      for (const def of defs) {
        values[def.key] = host.getBase(def.key);
        if (def.type === 'number') {
          const numberOpts =
            def.step !== undefined
              ? { label: def.label, min: def.min, max: def.max, step: def.step }
              : { label: def.label, min: def.min, max: def.max };
          const binding = sceneFolder.addBinding(values, def.key, numberOpts);
          binding.on('change', (ev) => controller.setParam(def.key, ev.value as number));
          bindings.set(def.key, binding);
          if (def.modulatable) buildModFolder(sceneFolder, def);
        } else if (def.type === 'boolean') {
          const binding = sceneFolder.addBinding(values, def.key, { label: def.label });
          binding.on('change', (ev) => controller.setParam(def.key, ev.value as boolean));
          bindings.set(def.key, binding);
        } else if (def.type === 'select') {
          const options = Object.fromEntries(def.options.map((o) => [o, o]));
          const binding = sceneFolder.addBinding(values, def.key, { label: def.label, options });
          binding.on('change', (ev) => controller.setParam(def.key, ev.value as string));
          bindings.set(def.key, binding);
        } else {
          // color — Tweakpane auto-detects the hex string and shows a picker.
          const binding = sceneFolder.addBinding(values, def.key, { label: def.label });
          binding.on('change', (ev) => controller.setParam(def.key, ev.value as string));
          bindings.set(def.key, binding);
        }
      }

      // — Presets folder —
      const presetFolder = pane.addFolder({
        title: 'Presets',
        expanded: folderState['presets'] ?? false,
      });
      presetFolder.on('fold', (ev) => savePaneFolderState(sceneId, 'presets', ev.expanded));
      const nameObj = { name: 'my preset' };
      presetFolder.addBinding(nameObj, 'name', { label: 'name' });
      presetFolder.addButton({ title: 'Save' }).on('click', () => {
        saveUserPreset(nameObj.name.trim() || 'preset', controller.snapshot());
        controller.resetCycle();
      });
      presetFolder.addButton({ title: 'Share link' }).on('click', () => {
        void apiRef.current?.share();
      });
      presetFolder.addButton({ title: '⟨ prev' }).on('click', () => controller.cycle(-1));
      presetFolder.addButton({ title: 'next ⟩' }).on('click', () => controller.cycle(1));
      presetFolder.addButton({ title: 'Randomize' }).on('click', () => controller.randomizeNow());

      // — Control folder (device-gated) —
      if (devicesPresent) buildControlFolder();
    }

    const bindings = new Map<string, { refresh(): void }>();

    function rebuild(): void {
      if (pane) {
        pane.dispose();
        pane = null;
      }
      bindings.clear();
      build();
    }

    build();

    // ~8 Hz sync: refresh preview meters + reflect external (morph/MIDI) base
    // changes back into the widgets, without clobbering a control mid-edit.
    syncTimer = setInterval(() => {
      if (!pane) return;
      const focusInPane = el.contains(document.activeElement);
      for (const def of host.paramDefs()) {
        if (def.type === 'number' && def.modulatable) {
          previewObj[def.key] = host.previewValue(def.key);
        }
        if (focusInPane) continue;
        const current = host.getBase(def.key);
        if (values[def.key] !== current) {
          values[def.key] = current;
          bindings.get(def.key)?.refresh();
        }
      }
      // Poll gamepad in the UI sync loop (fallback path; deadzone applied inside).
      if (gamepadMappings.length > 0 && gamepadSupported()) {
        const pads = navigator.getGamepads();
        for (const pad of pads) {
          if (!pad) continue;
          for (const effect of pollGamepad(pad, gamepadMappings)) controller.applyNormalized(effect);
        }
      }
    }, 120);

    const onGamepadConnected = (): void => {
      if (!devicesPresent) {
        devicesPresent = true;
        rebuild();
      }
    };
    window.addEventListener('gamepadconnected', onGamepadConnected);

    // Live MIDI: subscribe, and reveal the Control folder once inputs exist.
    void subscribeMidi((deviceName, message) => {
      if (!devicesPresent) {
        devicesPresent = true;
        rebuild();
      }
      dispatchMidi(deviceName, message.data);
    }).then((unsub) => {
      if (disposed) unsub();
      else unsubMidi = unsub;
    });

    const offScene = host.onSceneChange(() => {
      controller.resetCycle();
      rebuild();
    });

    const api: PaneApi = {
      controller,
      randomize: () => controller.randomizeNow(),
      cyclePrev: () => controller.cycle(-1),
      cycleNext: () => controller.cycle(1),
      share: async () => {
        const hash = await presetToHash(controller.snapshot());
        if (typeof location !== 'undefined') location.hash = hash;
        return hash;
      },
      savePreset: (name) => saveUserPreset(name, controller.snapshot()),
      applyPreset: (preset) => controller.applyPreset(preset),
    };
    apiRef.current = api;
    onReadyRef.current?.(api);

    return () => {
      disposed = true;
      offScene();
      window.removeEventListener('gamepadconnected', onGamepadConnected);
      if (syncTimer) clearInterval(syncTimer);
      if (unsubMidi) unsubMidi();
      controller.stopMorph();
      if (pane) pane.dispose();
      apiRef.current = null;
    };
  }, [engine, host]);

  // The T04 `.dock` mount slot is sized 0×0, so the pane carries its own
  // intrinsic width here (styles.css is owned by T04; we don't touch it). Width
  // is the only layout the pane needs — Tweakpane lays out vertically within it.
  return (
    <div
      ref={containerRef}
      className="params-pane"
      data-testid="params-pane"
      style={{ width: 'min(300px, 90vw)' }}
    />
  );
}
