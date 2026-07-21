# Antinode — handoff / live state

**Read this first when resuming work.** Then `00-overview.md` (decisions + constraints), then `01-task-graph.md` (how to execute), then your task file in `tasks/`.

## State as of 2026-07-21 (Wave A complete — awaiting review)

- **WAVE A DONE** on branch `wave-a`, **pushed**; open as **PR #1** → `main` (https://github.com/AnmolS1/antinode/pull/1). **CI `build` job GREEN** (typecheck+lint+114 tests+build on Linux/Node 22). Not yet merged — awaiting owner review. The `e2e` job is gated to `main`, so the chromium Playwright smoke (`e2e/smoke.spec.ts`) FIRST runs when `wave-a` merges to `main` — still unproven; watch that run. (Fixed en route: cross-platform lockfile bug — the mac-regenerated `package-lock.json` omitted Linux rollup/esbuild binaries → `npm ci` failed on CI; regenerated from clean `node_modules`, commit `97f832e`. CI actions emit a cosmetic Node-20-deprecation warning; bump `actions/*@v4`→`@v5` sometime.) All four tasks merged with disjoint ownership (zero source conflicts; the only seam was `package.json` deps, reconciled). **Integrated suite green:** `typecheck` (all modules — `tsc` checks every `src/` file regardless of import graph), `lint`, `test` = **114 passing across 20 files** (T01 2 · T02 51 · T03 33 · T04 28), `build` OK. Per-task commits: T02 `776669e`, T03 `bf23e48`, T04 `f41de6c`, T05 `5ea7116`.
  - **T02 audio** (`src/audio/**`): capture ladder (file/display/input/procedural) behind `AudioSourceProvider`; own FFT→bands/RMS/flux/onset (flashGuard ≤3/s), adaptive percentile normalize, `TempoTracker` BPM+phase. Allocation-free hot path (verified). Dep `realtime-bpm-analyzer@^5.0.15` (live-only; untestable under jsdom — pure tracker is the tested path). `LAG_CONSTANTS` in `src/audio/dsp/lag.ts`.
  - **T03 render** (`src/render/**`): WebGPU→auto-WebGL2 bootstrap, `?gl=1`/`?gpu=0`, `FrameFeatures`→TSL uniform+spectrum bridge, scene registry + 400ms crossfade, quality governor, feedback ping-pong, one `dev-spectrum` proof scene on its own boot path. Deps `three@0.185.1` + `@types/three@0.185.1`. GPU/pixel/leak checks deferred to T10 (jsdom has no GPU).
  - **T04 UI** (`src/ui/**`, `src/theme/**`, `index.html`): phase-machine shell (onboarding→device→signal-check→live), source/device pickers, steering flow off the capability matrix, Spotify now-playing compliance layout, PerfHUD, full keyboard + a11y (canvas `role="img"` + live region, focus rings, reduced-motion UI, contrast recomputed vs worst-case white canvas). Built entirely against `src/ui/dev/mockEngine.ts`. **Zero deps added.**
  - **T05 TD** (`touchdesigner/**`): `BUILD.md` look-dev recipe (with T02's baked `LAG_CONSTANTS`), `PORTING.md` TD→TSL dictionary, worked feedback example. Docs-only; `*.toe` stays untracked.
- **⚠️ Worktree base-branch bug (transferable caveat):** the Agent-tool `isolation: "worktree"` branched every agent from **`main`** (the default branch = pre-T01 CRA state), NOT from the current `t01-foundations`. All four detected it and `git merge --ff-only t01-foundations`'d before authoring. **Fix for future waves: land `wave-a`/T01 on `main` BEFORE spawning Wave B**, so worktrees get the right base automatically. Leftover `.claude/worktrees/` were removed post-merge (commits preserved; `eslint`/`.claude` now ignored).

- **T01 DONE** (folded into `wave-a`).  Recap: CRA scrubbed, Vite 7 + TS 5.9 strict + React 19 scaffold, `src/contracts/` frozen API, CI. CRA scrubbed, Vite 7 + TS 5.9 strict + React 19 scaffold in place, `src/contracts/` written, CI added. Verified green locally: `typecheck`, `lint`, `test` (2 passing), `build`; `npm run dev` serves the placeholder page (empty `#stage` canvas + theme tokens). **Correcting two stale claims from the prior draft of this file:** the plan was *not* actually committed (the `.gitignore` `*.md` blanket was silently ignoring all of `antinode-plan/` + `CLAUDE.md` — fixed in T01), and the **GitHub repo was already renamed** to `AnmolS1/antinode` before T01 ran.
- **Secret scan: CLEAN.** `gitleaks git .` over all 23 commits → 0 leaks. The 2023 `test-express-w-react/server.js` loaded the Spotify secret from `process.env.CLIENT_SECRET` (dotenv); only `.env.example` (placeholder `XXX`) was ever committed — no real `.env` in history. **Nothing to rotate.** Old CRA baseline preserved at tag **`v0-2023-cra`** (pushed) for T06 A/B.
- **`.env.local`** in the working tree = the **reused 2023 Spotify client** (owner-confirmed). Correctly gitignored + untracked; never read/committed. T08 designs against this pre-Nov-2024 app (wider grandfathered endpoint surface).
- **Spotify dashboard: already renamed to Antinode + redirect URIs set** (`https://antinode.ponderance.dev/callback` + dev loopback) by owner. Remaining Spotify owner actions (T08): allowlist 5 seats, owner keeps Premium, confirm PKCE-only (no client secret in use).
- ponderance `src/data/legal-services.ts`: `antinode` entry already rewritten (status `planned` — renders nothing until T12 flips it). Uncommitted in the ponderance repo — commit it with the next site deploy.
- Shared-memory refs updated `audio_visualizer` → `antinode` (`ponderance-memory/MEMORY.md`, `~/GitHub/CLAUDE.md`). Both uncommitted in their repos — commit with next respective changes.
- **Sandbox git note:** this environment has no SSH key, so `git push` over SSH fails. Pushes done via `gh auth setup-git` HTTPS helper (`git push https://github.com/AnmolS1/antinode.git …`). The `v0-2023-cra` tag is pushed; the `t01-foundations` branch is **not yet pushed** — push + open PR (or merge to `main`) is the pending owner/next-step decision.
- Name locked: **Antinode** (see 00-overview for the why + rejected candidates).

## Contract changes APPLIED at the Wave A gate (owner-approved 2026-07-21)

Both applied to `src/contracts/` in commit `5fd6d2c`, producers cascaded, suite still 114-green:
1. **`EngineFacade.unlock(): Promise<void>`** added. T02's `AudioEngine` already implemented it (and `selectSource()` also resumes the ctx, so no silent-audio bug); the two mock engines got no-op `unlock()`s. UI should call `unlock()` on first gesture.
2. **`FrameFeatures.reducedMotion: boolean`** added (required). The `AudioEngine` owns it — samples `matchMedia('(prefers-reduced-motion: reduce)')` (guarded for jsdom), subscribes to `change`, stamps it per frame (allocation-free). Scenes (T06/T09) read `frame.reducedMotion` as the single source of truth. UI's own `useReducedMotion` hook (transitions) left as-is.

## Next up (in order)

1. **Land Wave A on `main`** — push `wave-a` + open PR (or ff-merge). **Blocked on a token-scope owner action:** the gh OAuth token lacks `workflow` scope, so pushing the branch (which adds `.github/workflows/ci.yml`) is rejected, and the sandbox has no SSH key. Owner runs: `gh auth refresh -h github.com -s workflow` then `git push -u origin wave-a && gh pr create --fill --base main`. Landing this also fixes the worktree base bug for Wave B.
2. ~~Apply the two contract decisions~~ — **DONE** (commit `5fd6d2c`, see above).
3. **Wave B in parallel** (T06 heritage scene · T07 params/presets/mod-matrix/MIDI · T08 Spotify PKCE+poller+now-playing · T09 Standing Wave + Phosphor scenes). Spawn worktree-isolated subagents off the (now `main`-merged) base. T07 may add `tweakpane@4`; T08 no deps (PKCE is fetch).
4. **Wave B gate = wire `main.tsx`** (the deferred integration seam): `import { App } from './ui/App'`; construct the real `EngineFacade` (T02 audio + T03 `createRenderCore({canvas, engine})`); `registerScene(...)` the T06/T09 scenes; `createRoot(uiRoot).render(<App engine={engine}/>)`. Swap `createMockEngine` → real engine here and nowhere else. Recipes: T03 `src/render/dev/harness.ts`, T04 `src/ui/App` (needs exactly one `engine` prop).

### Wave A deferred/known-open (not blockers)
- Dev harnesses exist but aren't on the main entry: `src/render/dev/dev.html` (renderer proof), T04 mock shell. `/dev/audio.html` live-meter page NOT built (needs a UI/dev owner — T02 correctly didn't cross into root/`public`).
- PerfHUD `backend`/quality are placeholders until T03's stats hook is wired (Wave B).
- **e2e + axe not written/run** — only `e2e/smoke.spec.ts` (T01) exists; CI's chromium e2e job has never run anywhere. Full Playwright matrix + axe are **T10**. GPU/pixel/leak-baseline (T03 items 1–3) are also T10.
- `main` is still the pre-T01 CRA app until step 1 lands.

## Standing decisions log

| Date | Decision |
|---|---|
| 2026-07-21 | Name = Antinode; rename everything immediately (Anmol has been burned by deferred renames twice) |
| 2026-07-21 | Public app, Spotify = 5-seat bonus tier; capture ladder with loopback as the headphones answer |
| 2026-07-21 | three.js TSL/WebGPU + WebGL2 fallback; TD = look-dev only; React chrome |
| 2026-07-21 | No video export ever (Spotify sync clause); no Web Playback SDK in v1; free forever (dev-mode = non-commercial) |
| 2026-07-21 | **Reuse the 2023 Spotify client** (in `.env.local`) rather than register a new app — keeps the wider pre-Nov-2024 endpoint surface + dodges the 1-client-ID cap. Dashboard already renamed + redirect URIs set. |
| 2026-07-21 | **Stack pin realities (T01):** TypeScript pinned **5.9** (typescript-eslint peer caps `<6.1`, so TS 7 breaks lint); Vite kept on **7.x** per plan pin (latest is 8, but honoring 6/7). three r185 deferred to T03 (not needed for the T01 shell). |
| 2026-07-21 | **Wave A deps:** `three@0.185.1` + `@types/three@0.185.1` (T03), `realtime-bpm-analyzer@5.0.15` (T02). `eslint` scoped to ignore `touchdesigner/` (look-dev, outside tsconfig) + `.claude/` (worktrees). |
| 2026-07-21 | **Worktree isolation branches from the DEFAULT branch (`main`), not current HEAD** — merge each wave to `main` before spawning the next wave's worktree agents. |

## Update protocol

Every wave gate (see 01): update this file — state, next-up queue, and any decision changes with dates. This file is the only file that describes *now*; the rest of the plan describes *intent*.
