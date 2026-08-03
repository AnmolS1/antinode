# Antinode — QA matrix (T10, the gate)

Nothing ships around this gate. This directory holds the **manual** half (per-browser
checklists + a report template); the **automated** half lives in `e2e/**` and runs in CI.

## Automated (Playwright) — `e2e/**`

Projects: `chromium`, `firefox`, `webkit`. Run locally:

```bash
npm install
npx playwright install            # or: npx playwright install chromium
npx playwright test               # whole matrix
npx playwright test --project=chromium
```

`playwright.config.ts` boots the app via `npm run dev` and points `baseURL` at
`http://127.0.0.1:5173`. Override the target (e.g. a deploy preview) with
`PLAYWRIGHT_BASE_URL` — when it names a non-local origin the config skips the dev
server so a post-deploy smoke can run the same specs against the live URL.

### What the automated specs cover

| Spec | Covers |
|---|---|
| `smoke.spec.ts` | Landing renders; `#stage` attached; render backend resolves to a real engine. |
| `render.spec.ts` | Boot → **file source (fixture WAV)** → **each of the 3 scenes renders non-black** → param change applies (Randomize) → preset URL roundtrip → UI fade/pin → snapshot (`S`) download. **First real render verification.** |
| `backend.spec.ts` | Backend axis: default lands on a real engine; `?gl=1` / `?gpu=0` force the WebGL2 fallback (observed via `#stage[data-antinode-engine]`). |
| `a11y.spec.ts` | axe (0 serious/critical) on picker / live chrome / shortcuts dialog; keyboard-only reachability; `prefers-reduced-motion` engages the low-motion program; **flashGuard** — engine onset rate over a strobe-bait fixture stays ≤ 3/s (WCAG 2.3.1). |
| `determinism.spec.ts` | `OfflineAudioContext` → real `Analyzer` → `FrameFeatures` trace summary compared cross-engine against a committed baseline within documented tolerances. |
| `soak.spec.ts` | Long-run soak — **nightly/manual only**, self-gated on `SOAK=1` (never per-PR). |

### Fixtures — `e2e/fixtures/`

Fully synthetic, copyright-safe test tones (regenerate with `node e2e/fixtures/generate.mjs`):

- `tone.wav` — steady 220+440 Hz tone; opens the signal gate and drives the scenes.
- `strobe.wav` — 10 Hz impulse train ("strobe bait"); proves the engine flashGuard clamps onsets to ≤ 3/s.
- `feature-baseline.json` — the cross-engine `FrameFeatures` baseline + tolerances for `determinism.spec.ts`.

### Observability seams (no test-only hooks were added to `src/`)

- `#stage[data-antinode-engine]` — render backend: `booting | webgpu | webgl2 | webgl2-recovered | error` (set by `main.tsx`). This is the "backend hook"; the PerfHud's own `backend` field is still a Wave-B placeholder.
- `.app[data-phase="live"]` — reached the live visualizer.
- `.app.reduced-motion` — reduced-motion program engaged (App class; engine stamps `frame.reducedMotion`, scenes read it — no scene-internal DOM observable exists, so this is the assertion surface).
- `.chrome.ui-hidden` — chrome idle-faded. `[data-testid="params-pane"]` — the param dock.

### Known local-environment caveats (software rendering)

Headless CI runners (and headless local runs) have **no GPU**, so the renderer
resolves to **software WebGL2 (SwiftShader)**, not WebGPU:

- **Backend:** default *and* `?gl=1` both report `webgl2` locally. The WebGPU-primary
  path is only exercised on real-GPU hardware (a GPU CI runner, or the manual matrix).
  The specs assert the invariant that holds everywhere (default is a real engine;
  `?gl=1` forces the fallback), not a specific backend.
- **Phosphor compile:** phosphor's feedback/FBM shader takes **~85 s to compile on
  first switch under SwiftShader** (heritage/standing-wave are sub-second; phosphor is
  instant on a real GPU). All three scenes DO render — this is a software-render cost,
  not an app issue. The scene-render test carries a 200 s budget for it.
- **Non-black check** is decode-free: it samples a small centre clip several times and
  asserts the frames differ (a blank/black/frozen canvas yields identical frames).

## Manual (this directory) — checked before launch, evidence links required

One checklist per target. Fill in a fresh `report-<date>.md` from `report-template.md`
each pass and archive screenshots/recordings alongside it.

- `checklist-waterfox.md` — Anmol's daily driver (first-class).
- `checklist-macos-safari.md`
- `checklist-ios-safari.md`
- `checklist-chrome-edge.md`
- `checklist-firefox.md`
- `checklist-spotify.md` — allowlisted-account Spotify layer + card-compliance screenshots.

## Launch verdict

The gate passes when: CI matrix green 3 consecutive runs (flake list empty or
quarantined with issues filed); zero open P0/P1; `report-<date>.md` complete with
accepted known-degradations; and a written go/no-go in `antinode-plan/04-handoff.md`.

### Open findings (filed for owning tasks)

- **P2 — contrast (T04):** `.footer__note` ("antinode · a ponderance project") is
  `#666e72` on `#0e1a24` = **3.38:1**, below WCAG AA 4.5:1 for 12 px text. Real but
  low-severity (decorative footer). `a11y.spec.ts` quarantines *only* this node from
  the contrast scan (a new serious violation still fails the gate); delete the
  exclusion when the token is fixed.
