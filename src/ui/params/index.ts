/**
 * Params / presets / mod-matrix / MIDI layer (T07, UI side). Public surface for
 * the shell to mount the pane and (at the gate) wire keyboard shortcuts + share.
 *
 * The render-side evaluation half lives in `src/render/modmatrix.ts`.
 */
export { ParamsPane } from './ParamsPane';
export type { ParamsPaneProps, PaneApi } from './ParamsPane';
export { PaneController } from './controller';
export type { MorphScheduler } from './controller';
export type { ParamHost, ParamValue, GlobalSettings } from './types';
export { DEFAULT_GLOBALS } from './types';
export {
  createDevParamHost,
  DEV_DEFAULT_ROUTES,
  type DevParamHost,
  type DevParamHostOptions,
  type DevHostHooks,
} from './devHost';
export {
  encodePreset,
  decodePreset,
  decodePresetFromHash,
  presetToHash,
  migrateAndValidate,
  randomize,
  lerpParamValues,
  morphDurationMs,
  listUserPresets,
  saveUserPreset,
  renameUserPreset,
  deleteUserPreset,
  loadPaneState,
  savePaneFolderState,
  PRESET_VERSION,
  RANDOMIZE_SPAN_FRAC,
  type Preset,
  type NamedPreset,
} from './presets';
export {
  midiReducer,
  initialMidiState,
  parseControlChange,
  midiSupported,
  gamepadSupported,
  loadMidiBindings,
  saveMidiBindings,
  subscribeMidi,
  pollGamepad,
  axisToUnit,
  detectGamepadControl,
  loadGamepadMappings,
  saveGamepadMappings,
  GAMEPAD_DEADZONE,
  GAMEPAD_MAX_MAPPINGS,
  type MidiState,
  type MidiAction,
  type MidiResult,
  type MidiEffect,
  type MidiMessageLike,
  type MidiBindings,
  type DeviceBindings,
  type GamepadMapping,
} from './midi';
