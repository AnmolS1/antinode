# T07 — Params, presets, mod-matrix, MIDI

**Role:** tools engineer (the "live modifying variables" promise lives here). **Depends on:** T03 + T04. **Parallel with:** T06 T08 T09.
**Owns:** `src/ui/params/**` (pane, presets, mod-matrix UI) + `src/render/modmatrix.ts` (evaluation, render-side). **Reads:** contracts (`ParamDef`), T03 registry, T04 dock/theme contract, 02-design.

## Param pane

- Tweakpane 4, auto-generated from the active scene's `ParamDef[]` + a global folder (post/bloom, quality override, UI opacity). Pane themed via CSS vars → tokens (dock + style contract from T04). Folder state persists per scene (localStorage `antinode:pane`).
- Live: changes apply same-frame; numeric drag shows mono value readouts (Hz/×/° units from `ParamDef.label` conventions).

## Mod-matrix (the differentiator — TD-style "export a channel to any parameter")

- Any `ParamDef` with `modulatable: true` accepts one or more modulation routes: `source ∈ {bass, lowMid, mid, high, rms, loudNorm, flux, onset(decay), beatPhase(shape: saw|sine|pulse)}`, `amount ∈ [-1,1]`, `lag override?`.
- Evaluation render-side (`modmatrix.ts`, pure function `resolve(paramBase, routes, features) → value`, clamped to ParamDef range) — runs in the frame loop, zero React involvement, allocation-free.
- UI: per-param "⊕ mod" affordance → route editor row (source select, amount slider with bipolar center, tiny live preview meter of the resolved value). Phosphor ring on modulated params. `onset(decay)` routes are subject to the engine's flashGuard by construction (they consume the already-limited onset).
- Ships with tasteful default routes per scene (defined in scene registration metadata, overridable).

## Presets

- A preset = `{ sceneId, paramValues, modRoutes, version }`. Built-ins per scene (3+ each, curated at Wave C polish) + user presets: save/rename/delete (localStorage), export/import JSON file, **share via URL hash** (`#p=<base64url(deflate(json))>`; decode on load with schema-versioned migration + hard validation — never trust the hash).
- Morph: `[`/`]` cycles presets with a beat-synced interpolation (numeric params lerp over 4 beats when BPM confident, else 2 s; non-numerics switch at midpoint). `R` = tasteful randomize (per-param jitter within safe subranges flagged in ParamDef, never mode/color flips).

## Physical control

- **WebMIDI** (Chrome/Edge/Firefox 108+/Waterfox — feature-detect; Safari never): MIDI-learn per param/mod-amount (click learn → twist knob → bound; CC 0–127 mapped to range). Mappings persist keyed by device name. SysEx not requested.
- **Gamepad** fallback (all browsers incl. Safari): sticks/triggers assignable to up to 4 params via the same learn flow (poll in the frame loop, deadzone 0.08).
- Both are enhancement layers: absent hardware = zero UI noise (a single "Control" folder appears when devices detected).

## Tests

Vitest: mod-matrix resolve (routes/clamps/bipolar amounts; property test: output always within ParamDef range), preset roundtrip (save→URL→load identical, incl. malformed-hash rejection), migration versioning, MIDI mapping reducer (synthetic MIDIMessageEvents), randomize respects safe ranges. Playwright: pane renders schema for the T03 dev scene, changing a slider changes a uniform (readback via test hook), URL preset restores on reload.

## Acceptance

- [ ] Every scene param live-tweakable with zero added per-frame allocations; mod routes audibly/visibly tie sound→param on the dev scene.
- [ ] Preset URL from Chrome opens identically in Firefox (cross-browser Playwright pair test).
- [ ] MIDI learn works on Chromium+Firefox with a synthetic device in tests; Safari shows no MIDI UI, Gamepad path works.
- [ ] Owns-boundary respected (evaluation in render side, UI in ui side; contracts untouched). 04-handoff updated.
