# Antinode — handoff / live state

**Read this first when resuming work.** Then `00-overview.md` (decisions + constraints), then `01-task-graph.md` (how to execute), then your task file in `tasks/`.

## State as of 2026-07-21 (Wave B complete — on branch `wave-b`)

- **WAVE B DONE** on branch `wave-b` (off `main`). All 5 tasks (T06 heritage · T07 params/MIDI · T08 Spotify · T09a standing-wave · T09b phosphor) built by parallel worktree agents, merged disjoint (only seam: T07's `tweakpane` dep), then **wired into a running app** at the gate. **Integrated suite green (verified by me):** typecheck + lint clean, **302 tests / 41 files**, `build` OK, `npm run dev` boots → HTTP 200 with the real engine/renderer/scenes bundled (main chunk 1.33 MB — a T11 code-split candidate; three.js dominates). Per-task commits: T06 `7868ff2`, T07 `610b576`, T08 `fb3a802`, T09a `9f7d92b`, T09b `140f7c7`; gate wiring `1fc6a0b`.
  - **Gate wiring (`1fc6a0b`):** `main.tsx` rewritten — real boot (AudioEngine + RenderCore via a `SceneBridge` closure-holder resolving the engine↔core cycle; registers all 3 scenes, default `standing-wave`; mounts `<App engine>`). `RenderCore.ts` — added `baseParams` (UI input) distinct from resolved `params` (scene output) + `ModMatrix.apply(out,base,f,dt)` each frame before `scene.update` (no self-feed), quality-override reconcile after governor, new seam methods. New `src/ui/params/renderParamHost.ts` (real `ParamHost` over RenderCore). `App.tsx` — mounts `<ParamsPane>`, real `useSpotify()`→`<SpotifyArea>`, keyboard `[`/`]`/`R` + hash-preset, `engine.unlock()` on gesture. Old `src/App.tsx` placeholder untouched (still under `tests/app.test.tsx`).
  - **Spotify env var:** owner must set **`VITE_SPOTIFY_CLIENT_ID`** (public client id) in `.env.local` for the Spotify tier to light up; unset = tier stays dark, app runs fine.
  - **Deferred at the gate (noted, not blockers):** palette-follow (only standing-wave has `paletteColor`, `paletteFollow` defaults off) and the metadata-procedural BPM link (T02 procedural source works standalone) — both skipped deliberately; now-playing card is wired. **Contract-friction candidates for a future gate:** (1) `heritage.bloomSend` has no scene→post-chain path (only the global bloom toggle is wireable); (2) `EngineFacade.setScene` is sync but `RenderCore.setScene` is async → a cross-scene preset hash on mount could misapply against the old scene's ParamDefs (same-scene/default unaffected). A `setScene`-returns-Promise or scene-ready signal would close it.
  - **Still unverified (as always headless):** GPU rendering, the three scenes' actual look, WebGPU/WebGL2 paths, MIDI/Gamepad, live Spotify — all T10 + human/PR review. The heritage A/B perceptual regression is human-gated.

- **WAVE A DONE** — **merged to `main`** (PR #1, merge commit `433751f`). CI **fully green on `main`**: `build` + the chromium `e2e` smoke both pass (the e2e needed a fix — vite dev host pinned to `127.0.0.1` to match Playwright's probe, `08ddbb0`). Cross-platform lockfile bug fixed en route (`97f832e`). Cosmetic: CI emits a Node-20 deprecation warning; bump `actions/*@v4`→`@v5` sometime. Wave A per-task commits: T02 `776669e`, T03 `bf23e48`, T04 `f41de6c`, T05 `5ea7116`; 114 tests.
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
- **Sandbox git note:** this environment has no SSH key, so `git push` over SSH fails. Pushes go via `gh auth setup-git` HTTPS helper (`git push https://github.com/AnmolS1/antinode.git …`). The gh token now carries `workflow` scope (owner ran `gh auth refresh -s workflow`), so pushing CI-file changes works. Branch topology: `main` (has Wave A) ← `wave-b` (has Wave A + B). Old `t01-foundations`/`wave-a` branches are folded into `main`; safe to delete.
- Name locked: **Antinode** (see 00-overview for the why + rejected candidates).

## Contract changes APPLIED at the Wave A gate (owner-approved 2026-07-21)

Both applied to `src/contracts/` in commit `5fd6d2c`, producers cascaded, suite still 114-green:
1. **`EngineFacade.unlock(): Promise<void>`** added. T02's `AudioEngine` already implemented it (and `selectSource()` also resumes the ctx, so no silent-audio bug); the two mock engines got no-op `unlock()`s. UI should call `unlock()` on first gesture.
2. **`FrameFeatures.reducedMotion: boolean`** added (required). The `AudioEngine` owns it — samples `matchMedia('(prefers-reduced-motion: reduce)')` (guarded for jsdom), subscribes to `change`, stamps it per frame (allocation-free). Scenes (T06/T09) read `frame.reducedMotion` as the single source of truth. UI's own `useReducedMotion` hook (transitions) left as-is.

## Next up (in order)

1. **Land Wave B on `main`** — `wave-b` → PR → merge (autonomous per owner: "if everything's green you don't have to wait"). Watch the `e2e` job that fires on the `main` merge (first browser run of the *wired* app; the boot `catch` mounts a degraded shell so the smoke's "Antinode" heading survives even without WebGL in CI).
2. **Wave C** (the final wave):
   - **T10 QA matrix** — the whole-app gate nothing ships around: Playwright across chromium/firefox/webkit + Waterfox/iOS manual, axe a11y, GPU/pixel/leak-baseline, `?gl=1`/`?gpu=0` paths, flash-safety, reduced-motion. This is where all the "unverified headless" items finally get verified. Depends on T06–T09 (done).
   - **T11 deploy** — Cloudflare static at `antinode.ponderance.dev`, headers/CSP, DNS, launch mechanics, bundle code-split (the 1.33 MB chunk). Wrangler already logged in (owner ran `wrangler login`).
   - **T12 legal/site/launch** — flip ponderance `legal-services.ts` status `planned`→`live`, verify `/privacy` `/terms`, workshop entry + marginalia note; needs T08 shipped + launch timing.
3. **Owner actions still pending:** set `VITE_SPOTIFY_CLIENT_ID` in `.env.local`; allowlist the 5 Spotify seats + keep owner on Premium; commit the ponderance `legal-services.ts` + shared-memory edits with their next respective deploys.

### Deferred/known-open carried into Wave C (not blockers)
- **All GPU/browser verification is still pending** — the scenes have never rendered; T10 is where that happens. Heritage A/B perceptual regression is human-gated in review.
- Dev harnesses (`src/render/dev/dev.html`, T04 mock) exist but aren't the main entry. `/dev/audio.html` live-meter page NOT built (needs a UI/dev owner).
- **Gate deferrals (Wave B):** palette-follow + metadata-procedural BPM link (see Wave B state above). **Contract-friction candidates:** `heritage.bloomSend` routing + async `setScene` (see above) — address at a future gate if they bite.
- axe + full Playwright matrix + GPU/pixel/leak-baseline = **T10**. Bundle code-split = **T11**.

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
| 2026-07-21 | **Worktree isolation branches from the DEFAULT branch (`main`), not current HEAD** — merge each wave to `main` before spawning the next wave's worktree agents. (Confirmed fixed: Wave B agents branched cleanly once Wave A was on `main`.) |
| 2026-07-21 | **CI e2e needs vite dev host pinned to `127.0.0.1`** (matches Playwright's IPv4 probe; default `localhost` can bind IPv6-only). `wave-b` dep added: `tweakpane@4.0.5` (T07). |
| 2026-07-21 | **Wave B wiring:** `RenderCore` holds `baseParams` (UI) separate from resolved `params` (scene) with `ModMatrix.apply(out,base,…)` — never one record for both (self-feed). `ParamHost` is an adapter over `RenderCore`, NOT a contract change. Default scene = `standing-wave`. |

## Update protocol

Every wave gate (see 01): update this file — state, next-up queue, and any decision changes with dates. This file is the only file that describes *now*; the rest of the plan describes *intent*.
