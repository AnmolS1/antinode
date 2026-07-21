/**
 * Pane controller — the framework-free brain behind the Tweakpane view.
 *
 * Everything that isn't literally drawing a widget lives here: snapshot/apply
 * presets, randomize, beat-synced morph between presets, and mapping MIDI/gamepad
 * effects onto param ranges. Keeping it out of React (and out of Tweakpane) makes
 * it directly unit-testable and keeps the view a thin binding layer.
 */
import type { EngineFacade, ParamDef } from '../../contracts';
import type { ModRoute } from '../../render/modmatrix';
import {
  lerpParamValues,
  morphDurationMs,
  randomize,
  type NamedPreset,
  type Preset,
  PRESET_VERSION,
} from './presets';
import { listUserPresets } from './presets';
import type { MidiEffect } from './midi';
import type { ParamHost, ParamValue } from './types';

/** An injectable scheduler so morph animation is deterministic under test. */
export interface MorphScheduler {
  now(): number;
  raf(cb: (t: number) => void): number;
  cancel(handle: number): void;
}

const defaultScheduler: MorphScheduler = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  raf: (cb) =>
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(cb)
      : (setTimeout(() => cb(defaultScheduler.now()), 16) as unknown as number),
  cancel: (h) => {
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(h);
    else clearTimeout(h);
  },
};

export class PaneController {
  private morphHandle: number | null = null;
  private cycleIndex = -1;

  constructor(
    private readonly engine: EngineFacade,
    private readonly host: ParamHost,
    private readonly scheduler: MorphScheduler = defaultScheduler,
  ) {}

  private defs(): readonly ParamDef[] {
    return this.host.paramDefs();
  }

  // — param writes —

  setParam(key: string, value: ParamValue): void {
    this.host.setBase(key, value);
  }

  /** Map a normalized 0–1 controller value onto a numeric param's range and apply it. */
  applyNormalized(effect: MidiEffect): void {
    const def = this.defs().find((d) => d.key === effect.paramKey);
    if (!def || def.type !== 'number') return;
    const value = def.min + (def.max - def.min) * Math.max(0, Math.min(1, effect.value01));
    const stepped = def.step && def.step > 0 ? Math.round(value / def.step) * def.step : value;
    this.host.setBase(effect.paramKey, Math.max(def.min, Math.min(def.max, stepped)));
  }

  // — presets —

  /** Capture the current scene state as a preset. */
  snapshot(): Preset {
    const paramValues: Record<string, ParamValue> = {};
    const modRoutes: Record<string, ModRoute[]> = {};
    for (const def of this.defs()) {
      paramValues[def.key] = this.host.getBase(def.key);
      if (def.type === 'number' && def.modulatable) {
        const routes = this.host.getRoutes(def.key);
        if (routes.length > 0) modRoutes[def.key] = [...routes];
      }
    }
    return { sceneId: this.host.activeSceneId(), paramValues, modRoutes, version: PRESET_VERSION };
  }

  /**
   * Apply a validated preset. If it targets another scene, switch scenes first;
   * the values/routes are then applied against the current scene's defs.
   */
  applyPreset(preset: Preset): void {
    this.stopMorph();
    if (preset.sceneId !== this.host.activeSceneId()) {
      this.engine.setScene(preset.sceneId);
    }
    for (const def of this.defs()) {
      const v = preset.paramValues[def.key];
      if (v !== undefined) this.host.setBase(def.key, v);
      if (def.type === 'number' && def.modulatable) {
        this.host.setRoutes(def.key, preset.modRoutes[def.key] ?? []);
      }
    }
  }

  // — randomize —

  /** Tasteful randomize (R): numeric jitter within safe ranges; no mode/color flips. */
  randomizeNow(): void {
    this.stopMorph();
    const current: Record<string, ParamValue> = {};
    for (const def of this.defs()) current[def.key] = this.host.getBase(def.key);
    const next = randomize(this.defs(), current);
    for (const [key, value] of Object.entries(next)) this.host.setBase(key, value);
  }

  // — morph / cycle —

  /** Cycle to the previous/next user preset with a beat-synced morph. */
  cycle(dir: 1 | -1): void {
    const list = listUserPresets(this.host.activeSceneId());
    if (list.length === 0) return;
    this.cycleIndex = (this.cycleIndex + dir + list.length) % list.length;
    const target = (list[this.cycleIndex] as NamedPreset).preset;
    this.morphTo(target);
  }

  /**
   * Morph the current numeric params toward `target` over 4 beats (confident
   * tempo) or 2 s; non-numerics + routes switch at the midpoint.
   */
  morphTo(target: Preset): void {
    this.stopMorph();
    if (target.sceneId !== this.host.activeSceneId()) {
      // Cross-scene morph isn't meaningful; switch + apply instantly.
      this.applyPreset(target);
      return;
    }
    const from: Record<string, ParamValue> = {};
    for (const def of this.defs()) from[def.key] = this.host.getBase(def.key);

    const beat = this.engine.latest().beat;
    const durationMs = morphDurationMs(beat.bpm, beat.confidence);
    const start = this.scheduler.now();
    let routesSwitched = false;

    const step = (): void => {
      const t = Math.min(1, (this.scheduler.now() - start) / durationMs);
      const values = lerpParamValues(this.defs(), from, target.paramValues, t);
      for (const [key, value] of Object.entries(values)) this.host.setBase(key, value);
      if (!routesSwitched && t >= 0.5) {
        routesSwitched = true;
        for (const def of this.defs()) {
          if (def.type === 'number' && def.modulatable) {
            this.host.setRoutes(def.key, target.modRoutes[def.key] ?? []);
          }
        }
      }
      if (t < 1) this.morphHandle = this.scheduler.raf(step);
      else this.morphHandle = null;
    };
    this.morphHandle = this.scheduler.raf(step);
  }

  /** Cancel any in-flight morph. */
  stopMorph(): void {
    if (this.morphHandle !== null) {
      this.scheduler.cancel(this.morphHandle);
      this.morphHandle = null;
    }
  }

  /** Reset the cycle cursor (e.g. on scene change or preset save). */
  resetCycle(): void {
    this.cycleIndex = -1;
  }
}
