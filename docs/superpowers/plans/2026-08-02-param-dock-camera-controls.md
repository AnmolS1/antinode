# Param Dock, Shared Camera Controls, Heritage Intensity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the param dock actually visible and collapsible to an icon, give Heritage and Standing Wave user camera control from one shared instance, and take the edge off Heritage's beat peaks.

**Architecture:** Three independent commits. The dock is pure React + CSS around the existing Tweakpane mount. Camera control moves `OrbitControls` from Heritage's private `init` up to `RenderCore`, gated per scene by a new optional `SceneModule.cameraControls` flag, re-targeted after the existing baseline reset. Heritage intensity becomes a param that attenuates `loudNorm` before the existing 2023 gain constants — the constants themselves are not touched.

**Tech Stack:** React 19, TypeScript 5.9 (strict), three r185 (`three/webgpu`, `three/addons`), Tweakpane 4, Vitest, Playwright.

## Global Constraints

- TypeScript strict. `npm run typecheck && npm run lint && npm test` must be clean before every commit.
- **Never** change `resetCameraToBaseline` or its regression test in `tests/render/coreUtils.test.ts` — it is the 2026-07-22 black-screen fix.
- Do **not** change Heritage's camera position, fov, or target. Item 3 is intensity only.
- Do **not** route `bloomSend` (declared in Heritage's params but unreachable from a scene). Out of scope.
- Keep `<ParamsPane>` mounted at all times; hiding is CSS-only.
- React renders chrome only — nothing added here may run in the rAF path.
- Scenes are framework-free `SceneModule`s; new contract fields must be **optional** so existing scenes still typecheck.

## File Structure

| File | Responsibility |
|---|---|
| `src/ui/components/ParamDock.tsx` | **new** — open/closed state, gear toggle, panel shell. Wraps `<ParamsPane>`. |
| `src/ui/params/presets.ts` | **modify** — add `loadDockOpen` / `saveDockOpen` on key `antinode:dock`. |
| `src/ui/styles.css` | **modify** — real `.dock` box; `.dock__*` header/body/toggle. |
| `src/ui/App.tsx` | **modify** — render `<ParamDock>` in the `.dock` slot. |
| `src/contracts/scene.ts` | **modify** — optional `SceneModule.cameraControls?: boolean`. |
| `src/render/RenderCore.ts` | **modify** — own one `OrbitControls`; enable/re-target per scene. |
| `src/scenes/heritage/index.ts` | **modify** — drop private OrbitControls; add `cameraControls: true`; add `intensity` param. |
| `src/scenes/standing-wave/index.ts` | **modify** — add `cameraControls: true`. |
| `src/scenes/heritage/mapping.ts` | **modify** — `intensity` arg on the loud mappings. |
| `tests/ui/paramDock.test.tsx` | **new** |
| `tests/params/presets.test.ts` | **modify** — dock-state cases. |
| `tests/scenes/heritage*.test.ts` | **modify** — intensity table test. |
| `e2e/render.spec.ts` | **modify** — dock-fits-viewport regression test. |

---

### Task 1: Param dock — visible box + collapse to icon

**Files:**
- Create: `src/ui/components/ParamDock.tsx`, `tests/ui/paramDock.test.tsx`
- Modify: `src/ui/params/presets.ts`, `src/ui/styles.css`, `src/ui/App.tsx`, `tests/params/presets.test.ts`, `e2e/render.spec.ts`

**Interfaces:**
- Consumes: `ParamsPane` (`{ engine, host, onReady }`), `PaneApi`, `ParamHost`, `EngineFacade`.
- Produces: `loadDockOpen(): boolean`, `saveDockOpen(open: boolean): void`, `<ParamDock engine host onReady />`.

- [ ] **Step 1: Write the failing persistence test**

Append to `tests/params/presets.test.ts`:

```ts
import { loadDockOpen, saveDockOpen } from '../../src/ui/params/presets';

describe('dock open state', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to collapsed', () => {
    expect(loadDockOpen()).toBe(false);
  });

  it('round-trips', () => {
    saveDockOpen(true);
    expect(loadDockOpen()).toBe(true);
    saveDockOpen(false);
    expect(loadDockOpen()).toBe(false);
  });

  it('falls back to collapsed on corrupt JSON', () => {
    localStorage.setItem('antinode:dock', '{not json');
    expect(loadDockOpen()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/params/presets.test.ts`
Expected: FAIL — `loadDockOpen is not a function`.

- [ ] **Step 3: Implement persistence**

In `src/ui/params/presets.ts`, beside `const LS_PANE = 'antinode:pane';` add:

```ts
const LS_DOCK = 'antinode:dock';
```

and at the end of the folder-state section:

```ts
/**
 * Whether the param dock is expanded. GLOBAL, not per-scene: the dock's
 * *contents* are already per-scene, and a container that appears and vanishes
 * as you switch scenes reads as a glitch. Defaults to collapsed so a first
 * visit is all visual.
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
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run tests/params/presets.test.ts` → PASS.

- [ ] **Step 5: Write the failing component test**

Create `tests/ui/paramDock.test.tsx`. Follow the render/cleanup style already used in `tests/params/pane.test.tsx`.

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';

import { ParamDock } from '../../src/ui/components/ParamDock';
import { mockEngine } from '../../src/ui/dev/mockEngine';

describe('ParamDock', () => {
  beforeEach(() => localStorage.clear());

  it('starts collapsed: shows the toggle, hides the panel body', () => {
    render(<ParamDock engine={mockEngine()} />);
    const toggle = screen.getByRole('button', { name: /scene controls/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.dock__body')).toBeNull();
  });

  it('expands on click and reports aria-expanded', () => {
    render(<ParamDock engine={mockEngine()} />);
    const toggle = screen.getByRole('button', { name: /scene controls/i });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('.dock__body')).not.toBeNull();
  });

  it('remembers the expanded state', () => {
    const { unmount } = render(<ParamDock engine={mockEngine()} />);
    fireEvent.click(screen.getByRole('button', { name: /scene controls/i }));
    unmount();
    render(<ParamDock engine={mockEngine()} />);
    expect(
      screen.getByRole('button', { name: /scene controls/i }).getAttribute('aria-expanded'),
    ).toBe('true');
  });
});
```

If `mockEngine` is not a zero-arg factory, check `src/ui/dev/mockEngine.ts` and use whatever `tests/app.test.tsx` already passes to `<App engine=…>`.

- [ ] **Step 6: Run it and confirm it fails**

Run: `npx vitest run tests/ui/paramDock.test.tsx`
Expected: FAIL — cannot resolve `ParamDock`.

- [ ] **Step 7: Implement `ParamDock`**

Create `src/ui/components/ParamDock.tsx`:

```tsx
/**
 * The param dock (T13 follow-up). Wraps the Tweakpane view in a real, sized
 * panel with a collapse-to-icon toggle.
 *
 * Two load-bearing details:
 *  1. `<ParamsPane>` stays MOUNTED when collapsed and the body is hidden with
 *     CSS. Unmounting would rebuild Tweakpane on every toggle and drop the
 *     `PaneApi` that the `[` / `]` / `R` shortcuts depend on — collapsing the
 *     panel must not disable preset cycling and randomize.
 *  2. The dock renders inside `.chrome`, so it keeps fading with the rest of
 *     the UI. Nothing here needs to know about the idle fade.
 */
import { useState } from 'react';

import type { EngineFacade } from '../../contracts/engine';
import { ParamsPane, type PaneApi } from '../params/ParamsPane';
import type { ParamHost } from '../params/types';
import { loadDockOpen, saveDockOpen } from '../params/presets';

export function ParamDock({
  engine,
  host,
  onReady,
}: {
  engine: EngineFacade;
  host?: ParamHost;
  onReady?: (api: PaneApi) => void;
}) {
  const [open, setOpen] = useState(() => loadDockOpen());

  const toggle = (): void => {
    setOpen((prev) => {
      const next = !prev;
      saveDockOpen(next);
      return next;
    });
  };

  return (
    <div className={`dock${open ? ' dock--open' : ''}`}>
      <button
        type="button"
        className="dock__toggle btn btn--ghost"
        aria-expanded={open}
        aria-controls="dock-body"
        onClick={toggle}
      >
        <span aria-hidden="true">⚙</span>
        <span className="visually-hidden">Scene controls</span>
      </button>
      {/* Kept mounted; only the wrapper is conditionally rendered so Tweakpane
          is built once. When collapsed the pane lives in a display:none host. */}
      <div id="dock-body" className={open ? 'dock__body' : 'dock__body dock__body--hidden'}>
        {host && <ParamsPane engine={engine} host={host} {...(onReady ? { onReady } : {})} />}
      </div>
    </div>
  );
}
```

> **Note for the implementer:** the test asserts `.dock__body` is `null` when
> collapsed, but the component above always renders it. Reconcile by changing the
> test to assert on the `dock__body--hidden` class instead of absence:
> `expect(document.querySelector('.dock__body')?.className).toContain('--hidden')`.
> Keeping the pane mounted is the requirement; the test must follow the
> requirement, not the reverse.

- [ ] **Step 8: Fix the CSS — this is the actual bug**

In `src/ui/styles.css`, replace the whole `.dock` rule:

```css
/* The dock was `width: 0; height: 0` — a zero-size fixed anchor at the viewport
   floor. Tweakpane mounted as a static child and grew DOWNWARD from there, so
   measured at 1280x907 the 300x380 pane started at y=891 and overflowed the
   bottom by 364px: ~4% of it was on screen. Give it a real box that fits. */
.dock {
  position: fixed;
  bottom: var(--space-4);
  left: var(--space-4);
  z-index: var(--z-panel);
  display: grid;
  gap: var(--space-2);
  justify-items: start;
}
.dock__toggle {
  font-size: 1rem;
  line-height: 1;
  padding: var(--space-2) var(--space-3);
}
.dock__body {
  width: 300px;
  /* Clears the fixed topbar plus both margins so the pane can never run off. */
  max-height: calc(100vh - 140px);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.dock__body > * {
  width: 100% !important; /* Tweakpane sets its own inline width. */
}
.dock__body--hidden {
  display: none;
}
```

- [ ] **Step 9: Wire it into App**

In `src/ui/App.tsx`, replace the dock slot:

```tsx
        <div className="dock-slot">
          <ParamDock engine={engine} host={host} onReady={onPaneReady} />
        </div>
```

with just:

```tsx
        <ParamDock engine={engine} {...(host ? { host } : {})} onReady={onPaneReady} />
```

(The old `<div className="dock" data-reserved-for="T07-params">` wrapper goes
away — `ParamDock` renders the `.dock` element itself.) Add the import:
`import { ParamDock } from './components/ParamDock';` and drop the now-unused
`ParamsPane` import if nothing else uses it.

- [ ] **Step 10: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all clean, test count up by ~6.

- [ ] **Step 11: Add the e2e regression test**

In `e2e/render.spec.ts`, inside the `render + live interaction` describe:

```ts
  test('param dock fits the viewport when expanded', async ({ page }) => {
    await reachLiveWithFile(page);
    await page.keyboard.press(' '); // pin the UI so the idle fade can't eat the click
    await page.getByRole('button', { name: /scene controls/i }).click();
    const body = page.locator('.dock__body');
    await expect(body).toBeVisible();
    const fits = await body.evaluate(
      (el) => el.getBoundingClientRect().bottom <= window.innerHeight + 1,
    );
    expect(fits).toBe(true);
  });
```

- [ ] **Step 12: Run the e2e test**

Run: `npx playwright test e2e/render.spec.ts --project=chromium --workers=1 -g "fits the viewport"`
Expected: PASS. If it fails, the `max-height` in Step 8 is wrong — read the
reported `bottom` and adjust, do not raise the tolerance.

- [ ] **Step 13: Verify on a real GPU**

Load `http://127.0.0.1:5173/`, reach live, screenshot collapsed and expanded.
Confirm the gear is visible, the panel fits, and both fade after 3 s idle.
**Look at the screenshot** — do not trust a canvas readback (see T13).

- [ ] **Step 14: Commit**

```bash
git add src/ui/components/ParamDock.tsx src/ui/params/presets.ts src/ui/styles.css src/ui/App.tsx tests/ui/paramDock.test.tsx tests/params/presets.test.ts e2e/render.spec.ts
git commit -m "feat(ui): give the param dock a real box and a collapse-to-icon toggle"
```

---

### Task 2: Shared camera controls

**Files:**
- Modify: `src/contracts/scene.ts`, `src/render/RenderCore.ts`, `src/scenes/heritage/index.ts`, `src/scenes/standing-wave/index.ts`
- Test: `tests/contracts.test.ts`, `tests/render/coreUtils.test.ts` (must keep passing untouched)

**Interfaces:**
- Consumes: `resetCameraToBaseline(camera)`, `SceneRegistry.activeScene()`.
- Produces: `SceneModule.cameraControls?: boolean`.

- [ ] **Step 1: Add the optional contract field**

In `src/contracts/scene.ts`, inside `interface SceneModule`, after `params`:

```ts
  /**
   * Opt this scene into user camera control (orbit + zoom) on the SHARED
   * camera. Optional and default-false so existing scenes are unaffected.
   *
   * There is exactly one camera, reset to baseline before every scene's `init`
   * (that reset is the 2026-07-22 black-screen fix). Controls are therefore
   * owned by RenderCore and merely gated here — a scene must never construct
   * its own, or its framing leaks into the next scene.
   *
   * Screen-space scenes (Phosphor) leave this unset: orbiting them changes
   * nothing visible and reads as broken.
   */
  cameraControls?: boolean;
```

- [ ] **Step 2: Run typecheck to confirm nothing breaks**

Run: `npm run typecheck` → clean (the field is optional).

- [ ] **Step 3: Own the controls in RenderCore**

In `src/render/RenderCore.ts` add the import:

```ts
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
```

a field beside the other privates:

```ts
  /** One OrbitControls on the shared camera; enabled per scene. */
  private controls: OrbitControls | null = null;
```

in `postInit()`, after the listeners:

```ts
    // Guard the no-DOM path (unit tests / SSR) so we never attach dangling
    // listeners — same guard Heritage used before this moved up here.
    const dom = this.renderer.domElement as HTMLElement | undefined;
    if (dom && typeof dom.addEventListener === 'function') {
      this.controls = new OrbitControls(this.camera, dom);
      this.controls.enableDamping = true;
      // Panning an origin-centred scene mostly gets you lost.
      this.controls.enablePan = false;
      this.controls.enabled = false; // until a scene opts in
      this.controls.target.set(0, 0, 0);
      this.controls.update();
    }
```

and a helper:

```ts
  /**
   * Point the shared controls at the newly active scene. Called AFTER the
   * baseline reset and after the scene's `init` (a scene may reframe the camera
   * in init — Heritage does), so the controls adopt the scene's own framing
   * rather than the previous scene's orbit position.
   */
  private syncCameraControls(): void {
    if (!this.controls) return;
    const active = this.registry.activeScene();
    this.controls.enabled = active?.cameraControls === true;
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }
```

- [ ] **Step 4: Call it on scene change and on reinit**

In `setScene`, immediately before `this.emitSceneChange(id);`:

```ts
    this.syncCameraControls();
```

In `reinitActiveScene`, after `this.rebuildPost();`:

```ts
    this.syncCameraControls();
```

- [ ] **Step 5: Damp each frame**

In `tick(dtMs)`, immediately after `this.registry.advanceFade(dtMs);`:

```ts
    // enableDamping requires a per-frame update; cheap no-op when disabled.
    if (this.controls?.enabled) this.controls.update();
```

- [ ] **Step 6: Dispose**

In `dispose()`, before `this.renderer.dispose();`:

```ts
    this.controls?.dispose();
    this.controls = null;
```

- [ ] **Step 7: Remove Heritage's private controls**

In `src/scenes/heritage/index.ts`: delete the `OrbitControls` import, the
`let controls: OrbitControls | null = null;` declaration, the whole
`if (dom && typeof dom.addEventListener === 'function') { … }` block in `init`,
any `controls.update()` in `update`, and `controls?.dispose()` in `dispose`.
Then add `cameraControls: true,` to the returned object beside `id` / `name`.

- [ ] **Step 8: Opt Standing Wave in**

In `src/scenes/standing-wave/index.ts`, add `cameraControls: true,` to the
returned `SceneModule`. Leave Phosphor untouched.

- [ ] **Step 9: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test`
Expected: clean. **`tests/render/coreUtils.test.ts` must pass unchanged** — if it
does not, the baseline reset was disturbed; revert and re-read Step 3.

- [ ] **Step 10: Verify on a real GPU — including the regression**

At `http://127.0.0.1:5173/`: drag-rotate and scroll-zoom on Heritage and on
Standing Wave; confirm Phosphor ignores both. Then **orbit Standing Wave, switch
to Heritage, switch back, and screenshot** — the field must still render. That
round-trip is the 2026-07-22 bug; a resting screenshot of one scene proves nothing.

- [ ] **Step 11: Commit**

```bash
git add src/contracts/scene.ts src/render/RenderCore.ts src/scenes/heritage/index.ts src/scenes/standing-wave/index.ts
git commit -m "feat(render): shared OrbitControls on the core camera, opt-in per scene"
```

---

### Task 3: Heritage intensity

**Files:**
- Modify: `src/scenes/heritage/mapping.ts`, `src/scenes/heritage/index.ts`, `src/scenes/heritage/nodes.ts`
- Test: `tests/scenes/` (the file already covering `innerScaleFromLoud`; find it with `grep -rl innerScaleFromLoud tests/`)

**Interfaces:**
- Consumes: `HERITAGE_LOUD_REF`, `HERITAGE_INNER_GAIN`, `HERITAGE_INNER_DIV`, `HERITAGE_UAVG_GAIN`.
- Produces: `innerScaleFromLoud(loudNorm, intensity?)`, `uScaleFromLoud(loudNorm, intensity?)`, Heritage param key `intensity`.

**Why this shape:** the 2023 gain constants are a reconstruction of the original
look and must not be re-tuned blind. Attenuating `loudNorm` *before* them scales
the entire beat response uniformly, leaves the resting state identical, and keeps
`intensity: 1` byte-identical to today's behaviour — so the old look is always
one slider away.

- [ ] **Step 1: Write the failing mapping test**

Add to the test file that already covers `innerScaleFromLoud`:

```ts
describe('heritage intensity', () => {
  it('defaults to the 2023 response at intensity 1', () => {
    expect(innerScaleFromLoud(0.8, 1)).toBeCloseTo(innerScaleFromLoud(0.8), 10);
    expect(uScaleFromLoud(0.8, 1)).toBeCloseTo(uScaleFromLoud(0.8), 10);
  });

  it('attenuates the peak response below 1', () => {
    expect(innerScaleFromLoud(1, 0.6)).toBeLessThan(innerScaleFromLoud(1, 1));
    expect(uScaleFromLoud(1, 0.6)).toBeLessThan(uScaleFromLoud(1, 1));
  });

  it('leaves silence unchanged at any intensity', () => {
    // The pulse is 1 + k·loud, so loud = 0 must be exactly 1 regardless.
    expect(innerScaleFromLoud(0, 0.2)).toBe(1);
    expect(innerScaleFromLoud(0, 1.5)).toBe(1);
  });

  it('is monotonic in intensity', () => {
    const at = (i: number) => innerScaleFromLoud(0.9, i);
    expect(at(0.3)).toBeLessThan(at(0.6));
    expect(at(0.6)).toBeLessThan(at(1.2));
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run tests/scenes` → FAIL (extra arg ignored, so the
"attenuates" cases fail with equal values).

- [ ] **Step 3: Implement the intensity arg**

In `src/scenes/heritage/mapping.ts`:

```ts
/**
 * Default beat-response intensity. Below 1 because the 2023 response saturates
 * on peaks on modern displays (owner review, 2026-08-02: "overpowered", from a
 * screenshot taken on a beat). `intensity: 1` reproduces the 2023 look exactly,
 * so the original is always one slider away.
 */
export const HERITAGE_DEFAULT_INTENSITY = 0.6;

export function uScaleFromLoud(loudNorm: number, intensity = 1): number {
  return loudNorm * intensity * HERITAGE_LOUD_REF * HERITAGE_UAVG_GAIN;
}

export function innerScaleFromLoud(loudNorm: number, intensity = 1): number {
  return 1 + (loudNorm * intensity * HERITAGE_LOUD_REF * HERITAGE_INNER_GAIN) / HERITAGE_INNER_DIV;
}
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run tests/scenes` → PASS.

- [ ] **Step 5: Expose the param**

In `src/scenes/heritage/index.ts`, add to `params` (import
`HERITAGE_DEFAULT_INTENSITY` from `./mapping`):

```ts
    {
      type: 'number',
      key: 'intensity',
      label: 'Intensity',
      min: 0,
      max: 1.5,
      step: 0.05,
      default: HERITAGE_DEFAULT_INTENSITY,
      modulatable: true,
    },
```

- [ ] **Step 6: Apply it on the CPU path**

In `update`, replace the inner-shell line:

```ts
      if (innerMesh) {
        const intensity = typeof values['intensity'] === 'number' ? values['intensity'] : 1;
        innerMesh.scale.setScalar(innerScaleFromLoud(f.loudNorm, intensity));
      }
```

- [ ] **Step 7: Apply it on the GPU path**

`src/scenes/heritage/nodes.ts` line ~46 builds `uScale` from a constant product.
Add a uniform so the shader honours the same intensity. Follow the existing
`uDisp` param-uniform pattern in that file exactly — same construction, same
naming (`uIntensity`) — and change:

```ts
const uScale = bridge.uLoud.mul(HERITAGE_LOUD_REF * HERITAGE_UAVG_GAIN);
```

to:

```ts
const uScale = bridge.uLoud.mul(uIntensity).mul(HERITAGE_LOUD_REF * HERITAGE_UAVG_GAIN);
```

then drive `uIntensity` from `values['intensity']` in `update`, exactly where
`uDisp` is already driven.

- [ ] **Step 8: Run the full gate**

Run: `npm run typecheck && npm run lint && npm test` → clean.

- [ ] **Step 9: Verify on a real GPU, ON A BEAT**

Play audio into the app, switch to Heritage, and capture screenshots **at a
peak** at `intensity` 1 and at the new default. A resting screenshot proves
nothing about a peak — that is the whole complaint. Confirm the peak no longer
saturates and that quiet passages look unchanged.

- [ ] **Step 10: Commit**

```bash
git add src/scenes/heritage/mapping.ts src/scenes/heritage/index.ts src/scenes/heritage/nodes.ts tests/scenes/
git commit -m "feat(heritage): intensity param, defaulted below the 2023 peak response"
```

---

## Final verification

- [ ] `npm run typecheck && npm run lint && npm test` clean.
- [ ] `npx playwright test --project=chromium --workers=1` — 18 passed + the new dock test.
- [ ] Real-GPU pass: dock collapsed/expanded, orbit on Heritage + Standing Wave, Phosphor inert, Standing Wave → Heritage → Standing Wave round-trip renders, Heritage peak attenuated.
- [ ] Deploy to staging and confirm there: `npm run build && npx wrangler deploy --env dev`, then check `https://antinode-dev.discoinferno.workers.dev`.
- [ ] Update `antinode-plan/04-handoff.md` with what shipped and anything left open.
