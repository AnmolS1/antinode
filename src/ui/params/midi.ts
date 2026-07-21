/**
 * Physical control: WebMIDI (feature-detected; Safari never) and a Gamepad
 * fallback (all browsers). Both are enhancement layers — absent hardware means
 * zero UI. Mappings persist keyed by device name. SysEx is never requested.
 *
 * The core is a **pure reducer** whose message input is a plain
 * `{ data: Uint8Array }` (not the DOM `MIDIMessageEvent`, which jsdom lacks), so
 * synthetic events in tests are trivial. Live WebMIDI/Gamepad access is thin
 * wrappers around that reducer.
 */

// ── feature detection ────────────────────────────────────────────────────────

/** True when this browser exposes WebMIDI (Chrome/Edge/Firefox 108+/Waterfox; not Safari). */
export function midiSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
}

/** True when this browser exposes the Gamepad API (all modern browsers incl. Safari). */
export function gamepadSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
}

// ── MIDI reducer ─────────────────────────────────────────────────────────────

/** Bindings for one device: CC number → param key. Persisted per device name. */
export type DeviceBindings = Record<number, string>;
/** All device bindings, keyed by device name. */
export type MidiBindings = Record<string, DeviceBindings>;

/** Reducer state: which param is learning (if any) + all persisted bindings. */
export interface MidiState {
  /** The param key awaiting a knob twist, or `null` when not learning. */
  learning: string | null;
  bindings: MidiBindings;
}

/** A minimal MIDI message: only `data` matters (status, data1, data2). */
export interface MidiMessageLike {
  data: Uint8Array;
}

export type MidiAction =
  | { type: 'learn'; paramKey: string }
  | { type: 'cancelLearn' }
  | { type: 'message'; deviceName: string; message: MidiMessageLike }
  | { type: 'clear'; paramKey: string };

/** A normalized parameter change the caller maps onto a ParamDef range. */
export interface MidiEffect {
  paramKey: string;
  /** Normalized 0–1 (CC value / 127). */
  value01: number;
}

/** Reducer result: next state plus an optional param-change effect to apply. */
export interface MidiResult {
  state: MidiState;
  effect?: MidiEffect;
}

const CC_STATUS = 0xb0; // Control Change, channel 0; high nibble 0xB across channels.

/** Parse a Control-Change message → `{ cc, value }`, or `null` if not a CC. */
export function parseControlChange(data: Uint8Array): { cc: number; value: number } | null {
  if (data.length < 3) return null;
  const status = data[0] as number;
  if ((status & 0xf0) !== CC_STATUS) return null; // ignore note/pitch/SysEx (0xF0)
  return { cc: data[1] as number, value: data[2] as number };
}

/** The initial (empty) MIDI reducer state. */
export function initialMidiState(bindings: MidiBindings = {}): MidiState {
  return { learning: null, bindings };
}

/**
 * Pure MIDI reducer.
 *
 * - `learn` arms a param for the next CC.
 * - `message` while learning binds the CC (keyed by device name) and applies its
 *   value; otherwise it looks up an existing binding and applies it.
 * - `clear` removes every binding (across devices) for a param.
 */
export function midiReducer(state: MidiState, action: MidiAction): MidiResult {
  switch (action.type) {
    case 'learn':
      return { state: { ...state, learning: action.paramKey } };

    case 'cancelLearn':
      return { state: { ...state, learning: null } };

    case 'clear': {
      const bindings: MidiBindings = {};
      for (const [device, ccMap] of Object.entries(state.bindings)) {
        const kept: DeviceBindings = {};
        for (const [cc, key] of Object.entries(ccMap)) {
          if (key !== action.paramKey) kept[Number(cc)] = key;
        }
        if (Object.keys(kept).length > 0) bindings[device] = kept;
      }
      return { state: { ...state, bindings } };
    }

    case 'message': {
      const cc = parseControlChange(action.message.data);
      if (!cc) return { state };
      const value01 = cc.value / 127;

      if (state.learning !== null) {
        const paramKey = state.learning;
        const device = { ...(state.bindings[action.deviceName] ?? {}) };
        device[cc.cc] = paramKey;
        const bindings: MidiBindings = { ...state.bindings, [action.deviceName]: device };
        return { state: { learning: null, bindings }, effect: { paramKey, value01 } };
      }

      const bound = state.bindings[action.deviceName]?.[cc.cc];
      if (bound === undefined) return { state };
      return { state, effect: { paramKey: bound, value01 } };
    }

    default:
      return { state };
  }
}

// ── MIDI persistence ─────────────────────────────────────────────────────────

const LS_MIDI = 'antinode:midi';

/** Load persisted MIDI bindings (best-effort; `{}` on any error). */
export function loadMidiBindings(): MidiBindings {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LS_MIDI) ?? '{}');
    if (typeof raw !== 'object' || raw === null) return {};
    return raw as MidiBindings;
  } catch {
    return {};
  }
}

/** Persist MIDI bindings. */
export function saveMidiBindings(bindings: MidiBindings): void {
  try {
    localStorage.setItem(LS_MIDI, JSON.stringify(bindings));
  } catch {
    /* best-effort */
  }
}

/**
 * Attach to live WebMIDI inputs and forward every message to `onMessage`.
 * Feature-detects (resolves to a no-op unsubscribe on Safari / no MIDI). Never
 * requests SysEx.
 *
 * @returns an unsubscribe function.
 */
export async function subscribeMidi(
  onMessage: (deviceName: string, message: MidiMessageLike) => void,
): Promise<() => void> {
  if (!midiSupported()) return () => {};
  try {
    const access = await navigator.requestMIDIAccess({ sysex: false });
    const handlers: Array<{ input: MIDIInput; fn: (e: MIDIMessageEvent) => void }> = [];
    access.inputs.forEach((input) => {
      const fn = (e: MIDIMessageEvent): void => {
        if (e.data) onMessage(input.name ?? 'MIDI', { data: e.data });
      };
      input.addEventListener('midimessage', fn as EventListener);
      handlers.push({ input, fn });
    });
    return () => {
      for (const { input, fn } of handlers) {
        input.removeEventListener('midimessage', fn as EventListener);
      }
    };
  } catch {
    return () => {};
  }
}

// ── Gamepad fallback ─────────────────────────────────────────────────────────

/** Sticks/triggers below this magnitude read as zero. */
export const GAMEPAD_DEADZONE = 0.08;
/** Max concurrently mapped gamepad controls (spec: up to 4 params). */
export const GAMEPAD_MAX_MAPPINGS = 4;

/** A gamepad control assignment: one axis (bipolar) or button (0–1) → a param. */
export interface GamepadMapping {
  paramKey: string;
  /** Gamepad axis index (mutually exclusive with `button`). */
  axis?: number;
  /** Gamepad button index (mutually exclusive with `axis`). */
  button?: number;
}

const LS_GAMEPAD = 'antinode:gamepad';

/** Apply the deadzone to a raw axis value, then map [-1,1] → [0,1]. */
export function axisToUnit(raw: number): number {
  const v = Math.abs(raw) < GAMEPAD_DEADZONE ? 0 : raw;
  return (v + 1) / 2;
}

/**
 * Read all mapped controls from a gamepad snapshot into normalized 0–1 changes.
 * Pure over the passed snapshot; call once per frame with `navigator.getGamepads()`.
 */
export function pollGamepad(
  pad: { axes: readonly number[]; buttons: readonly { value: number }[] } | null,
  mappings: readonly GamepadMapping[],
): MidiEffect[] {
  if (!pad) return [];
  const out: MidiEffect[] = [];
  for (const m of mappings) {
    if (m.axis !== undefined) {
      const raw = pad.axes[m.axis];
      if (raw !== undefined) out.push({ paramKey: m.paramKey, value01: axisToUnit(raw) });
    } else if (m.button !== undefined) {
      const btn = pad.buttons[m.button];
      if (btn !== undefined) out.push({ paramKey: m.paramKey, value01: btn.value });
    }
  }
  return out;
}

/**
 * Detect the most-moved control between two gamepad snapshots (for learn).
 * Returns an axis or button descriptor, or `null` if nothing crossed a threshold.
 */
export function detectGamepadControl(
  prev: { axes: readonly number[]; buttons: readonly { value: number }[] },
  curr: { axes: readonly number[]; buttons: readonly { value: number }[] },
): { axis: number } | { button: number } | null {
  let best: { axis: number } | { button: number } | null = null;
  let bestDelta = 0.3; // require a decisive move
  for (let i = 0; i < curr.axes.length; i += 1) {
    const d = Math.abs((curr.axes[i] ?? 0) - (prev.axes[i] ?? 0));
    if (d > bestDelta) {
      bestDelta = d;
      best = { axis: i };
    }
  }
  for (let i = 0; i < curr.buttons.length; i += 1) {
    const d = Math.abs((curr.buttons[i]?.value ?? 0) - (prev.buttons[i]?.value ?? 0));
    if (d > bestDelta) {
      bestDelta = d;
      best = { button: i };
    }
  }
  return best;
}

/** Load persisted gamepad mappings (best-effort). */
export function loadGamepadMappings(): GamepadMapping[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LS_GAMEPAD) ?? '[]');
    return Array.isArray(raw) ? (raw as GamepadMapping[]) : [];
  } catch {
    return [];
  }
}

/** Persist gamepad mappings (capped at {@link GAMEPAD_MAX_MAPPINGS}). */
export function saveGamepadMappings(mappings: readonly GamepadMapping[]): void {
  try {
    localStorage.setItem(LS_GAMEPAD, JSON.stringify(mappings.slice(0, GAMEPAD_MAX_MAPPINGS)));
  } catch {
    /* best-effort */
  }
}
