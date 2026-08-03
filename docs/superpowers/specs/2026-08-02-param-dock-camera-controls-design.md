# Design — param dock, shared camera controls, Heritage intensity

**Date:** 2026-08-02 · **Status:** approved design, not yet implemented
**Origin:** owner review of the live prod site after T13 closed.

Three related pieces of chrome/interaction work, delivered as **one spec, three commits**.

---

## 1. Param dock — fix the clipping, add collapse-to-icon

### The bug (measured, not inferred)

`.dock` is `position: fixed; bottom: 16px; left: 16px; width: 0; height: 0` — a zero-size
anchor. Tweakpane mounts as a static child and grows *downward* from a point already at
the viewport floor. Measured live at 1280×907:

| | value |
|---|---|
| dock box | `(16, 891)`, `0 × 0` |
| Tweakpane pane | `300 × 380`, top `y=891`, bottom `y=1271` |
| overflow past viewport bottom | **364 px** |
| visible fraction of the pane | **~4 %** |

That is the sliver in the owner's screenshots — the "Global" title bar and nothing else.

### Design

Give `.dock` a real box and a header:

- `.dock` becomes `width: 300px; max-height: calc(100vh - 140px); overflow-y: auto`, still
  anchored bottom-left, still at `--z-panel`. The `140px` clears the topbar plus margins.
  The Tweakpane container fills it (`width: 100%`).
- New `src/ui/components/ParamDock.tsx` owns open/closed state and renders:
  - **collapsed** — a single gear `<button>` (no scene name; owner's call);
  - **expanded** — a header row (gear + "Scene controls" + collapse affordance) above the body.
- Toggle carries `aria-expanded` and `aria-controls`; accessible name "Scene controls".
- Expand/collapse transition respects `.reduced-motion` (existing pattern).

**Load-bearing decision: `<ParamsPane>` stays mounted when collapsed; the body is hidden with
CSS.** Unmounting would tear down and rebuild Tweakpane on every toggle *and* drop
`paneApiRef` — which the `[` / `]` / `R` keyboard shortcuts depend on. Collapsing the panel
must not disable preset cycling and randomize.

### State

Global, not per-scene (owner's call): collapse once and it stays collapsed across scene
switches. The panel's *contents* are already per-scene; the container needn't be.

- New `loadDockOpen()` / `saveDockOpen(open)` in `src/ui/params/presets.ts`, key
  `antinode:dock`, plain boolean, **default `false` (collapsed)**, same try/catch-and-fall-back
  shape as the existing `loadPaneState`.
- First-time visitors get the visuals uncluttered; the setting sticks once changed.

`.dock` already lives inside `.chrome` (verified live: `document.querySelector('.chrome .dock')`
is non-null), so it keeps fading with the rest of the UI for free — no new work.

---

## 2. Shared camera controls — zoom and click-rotate

### The constraint that shapes this

**There is exactly one camera.** `RenderCore` owns a single `PerspectiveCamera` and calls
`resetCameraToBaseline()` before *every* scene's `init`. That reset is not incidental — it is
the fix for the 2026-07-22 "switch away from Standing Wave and back → black screen" bug, where
Heritage's framing (`fov 45`, position `(20,200,-80)`) leaked into the next scene and projected
its origin-centred geometry to a speck off-screen.

Today only Heritage constructs `OrbitControls`, privately, in its own `init`. Adding a private
instance per scene would re-open exactly that leak.

### Design

Move `OrbitControls` **up to `RenderCore`**, as one instance bound to the shared camera:

- Constructed once against `renderer.domElement`, guarded for the no-DOM path (unit tests /
  SSR) exactly as Heritage's current guard does.
- **Enabled per scene via a capability flag** on `SceneModule` (e.g. `cameraControls?: boolean`):
  - Heritage — **on** (and it drops its private instance; one behaviour, one owner).
  - Standing Wave — **on** (a 3D field; orbiting is meaningful).
  - Phosphor — **off**. It is a screen-space feedback effect; orbiting it changes nothing
    visible and would read as broken.
- On every scene switch: baseline reset runs first (unchanged), then controls are re-targeted
  and `update()`d so the new scene starts from its own framing rather than the previous
  scene's orbit position. Controls are disabled outright for scenes that opt out.
- `enableDamping` for feel; `enablePan` left off (the scenes are origin-centred — panning
  mostly gets you lost).

### Why this can't quietly regress the 2026-07-22 bug

The reset still happens before `init`, and a scene that opts out never has its camera touched
by user input. The regression test in `tests/render/coreUtils.test.ts` (corrupt camera
Heritage-style → reset → assert canonical) stays valid and must keep passing.

---

## 3. Heritage — reduce output intensity

**Not a framing change.** The owner's initial screenshot was a zoomed-in view (Heritage already
has orbit controls) captured **on a beat**. The complaint is that the output is *too intense at
peaks*, not that the form is framed too tightly. Do **not** move the camera.

### Where the intensity comes from

- `innerScaleFromLoud(f.loudNorm)` — `1 + (loudNorm * HERITAGE_LOUD_REF * HERITAGE_INNER_GAIN)
  / HERITAGE_INNER_DIV` in `src/scenes/heritage/mapping.ts`. The inner-shell pulse.
- The `displacement` param (default `1`, max `3`) driving per-vertex spectrum displacement.
- The TSL colour graph in `src/scenes/heritage/nodes.ts` (`outerColor` / `innerColor`).
- Note `bloomSend` is declared in the params schema but **not routed** — the bloom amount lives
  on the post chain, which a scene cannot reach. This is a known Wave-B gate gap; it is *not*
  in scope to fix here, but it means bloom is not the lever available to us.

### Design

Add a single scene-level **intensity/gain** control with a lower default, applied to the
peak-driven terms rather than re-tuning several constants blind:

- Keep the mapping functions pure and unit-tested (they already are), so the new gain is a
  multiplier that can be table-tested headlessly.
- Lower the default so a beat peak no longer saturates, leaving headroom to push it back up
  via the param for anyone who wants the old response.
- **Verification is visual and must be done on a beat, not at rest** — a resting screenshot
  proves nothing about a peak. Capture Heritage on the owner's GPU with audio running, before
  and after, and compare.

---

## Testing

**Unit**
- `loadDockOpen` / `saveDockOpen`: round-trip, default-`false`, corrupt-JSON resilience.
- `ParamDock`: renders gear when collapsed, panel when expanded, toggles on click,
  `aria-expanded` tracks state.
- Heritage intensity mapping: table test over the gain, including that the default is strictly
  below the current response at high `loudNorm`.
- `coreUtils.test.ts` camera-baseline regression must keep passing unchanged.

**e2e — the real regression test for §1**
In the live phase, expand the dock and assert the pane's `bottom <= window.innerHeight`, i.e.
it actually fits on screen. Nothing currently catches this; it is precisely the reported bug.

**Manual, on real GPU**
- Orbit + zoom work on Heritage and Standing Wave; are inert on Phosphor.
- Scene round-trip after orbiting (Standing Wave → Heritage → Standing Wave) still renders —
  guards the 2026-07-22 leak.
- Heritage on a beat, before/after.

## Out of scope

- Routing `bloomSend` to the post chain (Wave-B contract-friction item).
- Any change to Heritage's camera position, fov, or target.
- Keyboard shortcut for the dock toggle — the button is Tab-reachable; add one only if wanted.
- Tweakpane theming or internals.
