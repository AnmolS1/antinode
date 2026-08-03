/**
 * Presets: serialization, URL-hash share links, migration, local storage, and
 * the randomize/morph helpers (T07).
 *
 * A preset is `{ sceneId, paramValues, modRoutes, version }`. Share links are
 * `#p=<base64url(deflate-raw(json))>`; decode NEVER trusts the hash — it runs a
 * schema-versioned migration then hard validation, and returns `null` on
 * anything malformed. All targets (and Node ≥18) ship `CompressionStream`, so
 * we always deflate; the `version` envelope is for migration, not compression.
 */
import type { ParamDef } from '../../contracts';
import type { ModRoute } from '../../render/modmatrix';
import type { BeatShape } from '../../render/modmatrix';
import { BEAT_SHAPES, MOD_SOURCES } from '../../render/modmatrix';
import type { ParamValue } from './types';

/** Current preset schema version. Bump when the shape changes; add a migration. */
export const PRESET_VERSION = 2;

/** A saveable snapshot of a scene's tweakable state. */
export interface Preset {
  sceneId: string;
  paramValues: Record<string, ParamValue>;
  /** Modulation routes keyed by param key. */
  modRoutes: Record<string, ModRoute[]>;
  version: number;
}

/** A user preset with a display name (built-ins are unnamed and curated in Wave C). */
export interface NamedPreset {
  name: string;
  preset: Preset;
}

const LS_PRESETS = 'antinode:presets';
const LS_PANE = 'antinode:pane';
const LS_DOCK = 'antinode:dock';

// ── base64url ────────────────────────────────────────────────────────────────

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i] as number);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function transformBytes(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  // Copy into a fresh, exactly-sized view so the write chunk is a clean BufferSource.
  const src = new Uint8Array(bytes.length);
  src.set(bytes);
  const writer = stream.writable.getWriter();
  // Drive the writable side, swallowing its rejection: on corrupt input the
  // readable side surfaces the real error (Z_DATA_ERROR) for the caller to
  // catch, and this keeps the write/close rejection from floating unhandled.
  const pump = (async () => {
    await writer.write(src);
    await writer.close();
  })().catch(() => undefined);
  const buf = await new Response(stream.readable).arrayBuffer();
  await pump;
  return new Uint8Array(buf);
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  return transformBytes(bytes, new CompressionStream('deflate-raw'));
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  return transformBytes(bytes, new DecompressionStream('deflate-raw'));
}

// ── encode / decode ──────────────────────────────────────────────────────────

/**
 * Encode a preset to the URL-hash payload (the value after `#p=`).
 * Always deflate-raw + base64url.
 */
export async function encodePreset(preset: Preset): Promise<string> {
  const json = JSON.stringify(preset);
  const bytes = new TextEncoder().encode(json);
  const compressed = await deflate(bytes);
  return bytesToBase64Url(compressed);
}

/**
 * Decode a URL-hash payload back to a validated preset, or `null` if the hash is
 * malformed, corrupt, fails decompression, or fails schema validation. Never
 * throws — the hash is untrusted input.
 */
export async function decodePreset(payload: string): Promise<Preset | null> {
  try {
    const bytes = base64UrlToBytes(payload.trim());
    const json = new TextDecoder().decode(await inflate(bytes));
    const raw: unknown = JSON.parse(json);
    return migrateAndValidate(raw);
  } catch {
    return null;
  }
}

/** Read a `#p=…` fragment from a full hash/URL and decode it (or `null`). */
export async function decodePresetFromHash(hash: string): Promise<Preset | null> {
  const m = /(?:^|[#&])p=([^&]+)/.exec(hash);
  if (!m || m[1] === undefined) return null;
  return decodePreset(m[1]);
}

/** Build the full location hash for a preset (`#p=…`). */
export async function presetToHash(preset: Preset): Promise<string> {
  return `#p=${await encodePreset(preset)}`;
}

// ── migration + validation ───────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isParamValue(v: unknown): v is ParamValue {
  return (
    (typeof v === 'number' && Number.isFinite(v)) ||
    typeof v === 'boolean' ||
    typeof v === 'string'
  );
}

function validRoute(v: unknown): ModRoute | null {
  if (!isRecord(v)) return null;
  if (typeof v['source'] !== 'string' || !MOD_SOURCES.includes(v['source'] as never)) return null;
  if (typeof v['amount'] !== 'number' || !Number.isFinite(v['amount'])) return null;
  const amount = Math.max(-1, Math.min(1, v['amount']));
  const route: ModRoute = { source: v['source'] as ModRoute['source'], amount };
  if (v['lagMs'] !== undefined) {
    if (typeof v['lagMs'] !== 'number' || !Number.isFinite(v['lagMs']) || v['lagMs'] < 0) return null;
    route.lagMs = v['lagMs'];
  }
  if (v['shape'] !== undefined) {
    if (typeof v['shape'] !== 'string' || !BEAT_SHAPES.includes(v['shape'] as never)) return null;
    route.shape = v['shape'] as BeatShape;
  }
  return route;
}

/**
 * Migrate an unknown decoded blob up to the current schema, then hard-validate.
 * Returns `null` if it cannot be made into a well-formed {@link Preset}.
 *
 * v1 → v2: v1 stored `routes` (a flat array with a `param` field); v2 stores
 * `modRoutes` keyed by param. Unknown/newer versions are rejected.
 */
export function migrateAndValidate(raw: unknown): Preset | null {
  if (!isRecord(raw)) return null;
  const version = typeof raw['version'] === 'number' ? raw['version'] : 0;
  if (version > PRESET_VERSION) return null; // never trust a newer schema than we know

  let modRoutesRaw: unknown = raw['modRoutes'];
  if (version < 2) {
    // v1 shape: routes: [{ param, source, amount, ... }]
    const flat = raw['routes'];
    const grouped: Record<string, unknown[]> = {};
    if (Array.isArray(flat)) {
      for (const r of flat) {
        if (!isRecord(r) || typeof r['param'] !== 'string') continue;
        (grouped[r['param']] ??= []).push(r);
      }
    }
    modRoutesRaw = grouped;
  }

  if (typeof raw['sceneId'] !== 'string' || raw['sceneId'].length === 0) return null;

  const paramValuesRaw = raw['paramValues'];
  if (!isRecord(paramValuesRaw)) return null;
  const paramValues: Record<string, ParamValue> = {};
  for (const [k, v] of Object.entries(paramValuesRaw)) {
    if (!isParamValue(v)) return null;
    paramValues[k] = v;
  }

  const modRoutes: Record<string, ModRoute[]> = {};
  if (modRoutesRaw !== undefined) {
    if (!isRecord(modRoutesRaw)) return null;
    for (const [k, list] of Object.entries(modRoutesRaw)) {
      if (!Array.isArray(list)) return null;
      const routes: ModRoute[] = [];
      for (const item of list) {
        const route = validRoute(item);
        if (!route) return null;
        routes.push(route);
      }
      if (routes.length > 0) modRoutes[k] = routes;
    }
  }

  return { sceneId: raw['sceneId'], paramValues, modRoutes, version: PRESET_VERSION };
}

// ── user presets (localStorage) ──────────────────────────────────────────────

type PresetStore = Record<string, NamedPreset[]>;

function readStore(): PresetStore {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LS_PRESETS) ?? '{}');
    return isRecord(raw) ? (raw as PresetStore) : {};
  } catch {
    return {};
  }
}

function writeStore(store: PresetStore): void {
  try {
    localStorage.setItem(LS_PRESETS, JSON.stringify(store));
  } catch {
    /* storage full / unavailable — presets are best-effort */
  }
}

/** List a scene's saved user presets. */
export function listUserPresets(sceneId: string): NamedPreset[] {
  return readStore()[sceneId] ?? [];
}

/** Save (or overwrite by name) a user preset for its scene. */
export function saveUserPreset(name: string, preset: Preset): void {
  const store = readStore();
  const list = (store[preset.sceneId] ??= []);
  const idx = list.findIndex((p) => p.name === name);
  const entry: NamedPreset = { name, preset };
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  writeStore(store);
}

/** Rename a user preset. Returns false if the name is taken or missing. */
export function renameUserPreset(sceneId: string, from: string, to: string): boolean {
  const store = readStore();
  const list = store[sceneId];
  if (!list) return false;
  if (list.some((p) => p.name === to)) return false;
  const entry = list.find((p) => p.name === from);
  if (!entry) return false;
  entry.name = to;
  writeStore(store);
  return true;
}

/** Delete a user preset by name. */
export function deleteUserPreset(sceneId: string, name: string): void {
  const store = readStore();
  const list = store[sceneId];
  if (!list) return;
  store[sceneId] = list.filter((p) => p.name !== name);
  writeStore(store);
}

// ── folder state (localStorage `antinode:pane`) ──────────────────────────────

type PaneState = Record<string, Record<string, boolean>>; // sceneId -> folderKey -> expanded

/** Read persisted folder-expansion state for a scene. */
export function loadPaneState(sceneId: string): Record<string, boolean> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LS_PANE) ?? '{}');
    if (!isRecord(raw)) return {};
    const forScene = (raw as PaneState)[sceneId];
    return isRecord(forScene) ? forScene : {};
  } catch {
    return {};
  }
}

/** Persist one folder's expansion state for a scene. */
export function savePaneFolderState(sceneId: string, folderKey: string, expanded: boolean): void {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LS_PANE) ?? '{}');
    const state: PaneState = isRecord(raw) ? (raw as PaneState) : {};
    (state[sceneId] ??= {})[folderKey] = expanded;
    localStorage.setItem(LS_PANE, JSON.stringify(state));
  } catch {
    /* best-effort */
  }
}

/**
 * Whether the param dock is expanded. GLOBAL, not per-scene: the dock's
 * *contents* are already per-scene, and a container that appears and vanishes as
 * you switch scenes reads as a glitch. Defaults to collapsed so a first visit is
 * all visual. Anything stored that is not literally `true` counts as collapsed.
 */
export function loadDockOpen(): boolean {
  try {
    return JSON.parse(localStorage.getItem(LS_DOCK) ?? 'false') === true;
  } catch {
    return false;
  }
}

/** Persist the dock's expanded state. Best-effort, like the folder state above. */
export function saveDockOpen(open: boolean): void {
  try {
    localStorage.setItem(LS_DOCK, JSON.stringify(open));
  } catch {
    /* best-effort */
  }
}

// ── randomize + morph ────────────────────────────────────────────────────────

/**
 * Fraction of a numeric param's span that a randomize jitter may move it by.
 *
 * NOTE (integration gap): the spec wants per-param "safe subranges flagged in
 * ParamDef", but the frozen `ParamDef` has no such field. Until a contract
 * field exists we jitter every numeric param by ±`RANDOMIZE_SPAN_FRAC` of its
 * range and clamp — and never touch `select`/`color`/`boolean` (no mode/color
 * flips, per spec).
 */
export const RANDOMIZE_SPAN_FRAC = 0.25;

/**
 * Produce a "tasteful randomize" of the current values: numeric params get a
 * bounded jitter within a safe fraction of their range; booleans, colors, and
 * selects are left exactly as they are.
 *
 * @param rng injectable uniform [0,1) source (default `Math.random`) for tests.
 */
export function randomize(
  defs: readonly ParamDef[],
  current: Record<string, ParamValue>,
  rng: () => number = Math.random,
): Record<string, ParamValue> {
  const next: Record<string, ParamValue> = { ...current };
  for (const def of defs) {
    if (def.type !== 'number') continue; // never flip mode/color/boolean
    const base = typeof current[def.key] === 'number' ? (current[def.key] as number) : def.default;
    const span = def.max - def.min;
    const jitter = (rng() * 2 - 1) * span * RANDOMIZE_SPAN_FRAC;
    let v = base + jitter;
    if (def.step && def.step > 0) v = Math.round(v / def.step) * def.step;
    next[def.key] = Math.max(def.min, Math.min(def.max, v));
  }
  return next;
}

/**
 * Interpolate between two presets' param values at `t ∈ [0,1]`: numeric params
 * lerp; non-numeric params switch at the midpoint (`t ≥ 0.5`). Modulation routes
 * are not interpolated — they switch with the non-numerics.
 */
export function lerpParamValues(
  defs: readonly ParamDef[],
  from: Record<string, ParamValue>,
  to: Record<string, ParamValue>,
  t: number,
): Record<string, ParamValue> {
  const clampedT = Math.max(0, Math.min(1, t));
  const out: Record<string, ParamValue> = {};
  for (const def of defs) {
    const a = from[def.key] ?? def.default;
    const b = to[def.key] ?? def.default;
    if (def.type === 'number' && typeof a === 'number' && typeof b === 'number') {
      let v = a + (b - a) * clampedT;
      if (def.step && def.step > 0) v = Math.round(v / def.step) * def.step;
      out[def.key] = Math.max(def.min, Math.min(def.max, v));
    } else {
      out[def.key] = clampedT >= 0.5 ? b : a;
    }
  }
  return out;
}

/**
 * Morph duration (ms): 4 beats when the tempo estimate is confident, else a
 * fixed 2 s. `bpm` null / low `confidence` ⇒ the 2 s fallback.
 */
export function morphDurationMs(bpm: number | null, confidence: number): number {
  if (bpm !== null && bpm > 0 && confidence >= 0.5) {
    return (60_000 / bpm) * 4;
  }
  return 2000;
}
