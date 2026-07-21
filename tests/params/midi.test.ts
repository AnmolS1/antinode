import { describe, expect, it } from 'vitest';

import {
  axisToUnit,
  detectGamepadControl,
  GAMEPAD_DEADZONE,
  initialMidiState,
  midiReducer,
  parseControlChange,
  pollGamepad,
  type GamepadMapping,
  type MidiState,
} from '../../src/ui/params/midi';

/** Build a synthetic Control-Change message (status 0xB0 | channel). */
function cc(controller: number, value: number, channel = 0): { data: Uint8Array } {
  return { data: new Uint8Array([0xb0 | channel, controller, value]) };
}

describe('parseControlChange', () => {
  it('parses a CC message', () => {
    expect(parseControlChange(new Uint8Array([0xb0, 7, 100]))).toEqual({ cc: 7, value: 100 });
    expect(parseControlChange(new Uint8Array([0xb5, 20, 64]))).toEqual({ cc: 20, value: 64 }); // channel 5
  });

  it('ignores note-on / SysEx / short messages', () => {
    expect(parseControlChange(new Uint8Array([0x90, 60, 100]))).toBeNull(); // note on
    expect(parseControlChange(new Uint8Array([0xf0, 1, 2]))).toBeNull(); // SysEx
    expect(parseControlChange(new Uint8Array([0xb0, 7]))).toBeNull(); // truncated
  });
});

describe('midiReducer', () => {
  it('learns: arm a param, next CC binds it (by device) and applies the value', () => {
    let state: MidiState = initialMidiState();
    state = midiReducer(state, { type: 'learn', paramKey: 'gain' }).state;
    expect(state.learning).toBe('gain');

    const res = midiReducer(state, { type: 'message', deviceName: 'LPD8', message: cc(7, 127) });
    expect(res.effect).toEqual({ paramKey: 'gain', value01: 1 });
    expect(res.state.learning).toBeNull();
    expect(res.state.bindings['LPD8']?.[7]).toBe('gain');
  });

  it('applies subsequent CCs through an existing binding', () => {
    let state: MidiState = initialMidiState({ LPD8: { 7: 'gain' } });
    const res = midiReducer(state, { type: 'message', deviceName: 'LPD8', message: cc(7, 64) });
    expect(res.effect).toEqual({ paramKey: 'gain', value01: 64 / 127 });
    state = res.state;
    // A different, unbound CC produces no effect.
    expect(midiReducer(state, { type: 'message', deviceName: 'LPD8', message: cc(9, 10) }).effect).toBeUndefined();
  });

  it('keys bindings by device name (same CC, different device)', () => {
    const state = initialMidiState({ LPD8: { 7: 'gain' } });
    // Same CC 7 from another device is not bound.
    expect(midiReducer(state, { type: 'message', deviceName: 'Other', message: cc(7, 100) }).effect).toBeUndefined();
  });

  it('cancels learn without binding', () => {
    let state = midiReducer(initialMidiState(), { type: 'learn', paramKey: 'spin' }).state;
    state = midiReducer(state, { type: 'cancelLearn' }).state;
    expect(state.learning).toBeNull();
    expect(midiReducer(state, { type: 'message', deviceName: 'x', message: cc(1, 1) }).effect).toBeUndefined();
  });

  it('clears every binding for a param across devices', () => {
    const state = initialMidiState({ A: { 1: 'gain', 2: 'spin' }, B: { 1: 'gain' } });
    const cleared = midiReducer(state, { type: 'clear', paramKey: 'gain' }).state;
    expect(cleared.bindings['A']).toEqual({ 2: 'spin' });
    expect(cleared.bindings['B']).toBeUndefined(); // emptied device dropped
  });

  it('ignores non-CC messages entirely', () => {
    const state = initialMidiState({ x: { 1: 'gain' } });
    const res = midiReducer(state, { type: 'message', deviceName: 'x', message: { data: new Uint8Array([0x90, 1, 100]) } });
    expect(res.effect).toBeUndefined();
    expect(res.state).toBe(state);
  });
});

describe('gamepad fallback', () => {
  it('applies a deadzone then maps [-1,1] → [0,1]', () => {
    expect(axisToUnit(0)).toBe(0.5);
    expect(axisToUnit(0.04)).toBe(0.5); // inside deadzone
    expect(axisToUnit(1)).toBe(1);
    expect(axisToUnit(-1)).toBe(0);
    expect(GAMEPAD_DEADZONE).toBeGreaterThan(0);
  });

  it('polls mapped axes and buttons into normalized effects', () => {
    const mappings: GamepadMapping[] = [
      { paramKey: 'gain', axis: 0 },
      { paramKey: 'spin', button: 7 },
    ];
    const pad = {
      axes: [1, 0],
      buttons: Array.from({ length: 8 }, (_, i) => ({ value: i === 7 ? 0.5 : 0 })),
    };
    const effects = pollGamepad(pad, mappings);
    expect(effects).toContainEqual({ paramKey: 'gain', value01: 1 });
    expect(effects).toContainEqual({ paramKey: 'spin', value01: 0.5 });
  });

  it('returns nothing for a null pad', () => {
    expect(pollGamepad(null, [{ paramKey: 'gain', axis: 0 }])).toEqual([]);
  });

  it('detects the most-moved control for learn', () => {
    const prev = { axes: [0, 0], buttons: [{ value: 0 }, { value: 0 }] };
    const curr = { axes: [0.05, 0.9], buttons: [{ value: 0 }, { value: 0 }] };
    expect(detectGamepadControl(prev, curr)).toEqual({ axis: 1 });
    const curr2 = { axes: [0, 0], buttons: [{ value: 0 }, { value: 1 }] };
    expect(detectGamepadControl(prev, curr2)).toEqual({ button: 1 });
    // nothing decisive → null
    expect(detectGamepadControl(prev, { axes: [0.01, 0.01], buttons: [{ value: 0 }, { value: 0 }] })).toBeNull();
  });
});
