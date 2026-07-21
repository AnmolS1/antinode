# Antinode — handoff / live state

**Read this first when resuming work.** Then `00-overview.md` (decisions + constraints), then `01-task-graph.md` (how to execute), then your task file in `tasks/`.

## State as of 2026-07-21 (T01 complete — awaiting review)

- **T01 DONE** on branch `t01-foundations` (not yet merged to `main`; not yet pushed — see note below). CRA scrubbed, Vite 7 + TS 5.9 strict + React 19 scaffold in place, `src/contracts/` written, CI added. Verified green locally: `typecheck`, `lint`, `test` (2 passing), `build`; `npm run dev` serves the placeholder page (empty `#stage` canvas + theme tokens). **Correcting two stale claims from the prior draft of this file:** the plan was *not* actually committed (the `.gitignore` `*.md` blanket was silently ignoring all of `antinode-plan/` + `CLAUDE.md` — fixed in T01), and the **GitHub repo was already renamed** to `AnmolS1/antinode` before T01 ran.
- **Secret scan: CLEAN.** `gitleaks git .` over all 23 commits → 0 leaks. The 2023 `test-express-w-react/server.js` loaded the Spotify secret from `process.env.CLIENT_SECRET` (dotenv); only `.env.example` (placeholder `XXX`) was ever committed — no real `.env` in history. **Nothing to rotate.** Old CRA baseline preserved at tag **`v0-2023-cra`** (pushed) for T06 A/B.
- **`.env.local`** in the working tree = the **reused 2023 Spotify client** (owner-confirmed). Correctly gitignored + untracked; never read/committed. T08 designs against this pre-Nov-2024 app (wider grandfathered endpoint surface).
- **Spotify dashboard: already renamed to Antinode + redirect URIs set** (`https://antinode.ponderance.dev/callback` + dev loopback) by owner. Remaining Spotify owner actions (T08): allowlist 5 seats, owner keeps Premium, confirm PKCE-only (no client secret in use).
- ponderance `src/data/legal-services.ts`: `antinode` entry already rewritten (status `planned` — renders nothing until T12 flips it). Uncommitted in the ponderance repo — commit it with the next site deploy.
- Shared-memory refs updated `audio_visualizer` → `antinode` (`ponderance-memory/MEMORY.md`, `~/GitHub/CLAUDE.md`). Both uncommitted in their repos — commit with next respective changes.
- **Sandbox git note:** this environment has no SSH key, so `git push` over SSH fails. Pushes done via `gh auth setup-git` HTTPS helper (`git push https://github.com/AnmolS1/antinode.git …`). The `v0-2023-cra` tag is pushed; the `t01-foundations` branch is **not yet pushed** — push + open PR (or merge to `main`) is the pending owner/next-step decision.
- Name locked: **Antinode** (see 00-overview for the why + rejected candidates).

## Next up (in order)

1. **Merge/push T01** — decide branch `t01-foundations` → PR or fast-forward `main`, then push.
2. Then **Wave A in parallel** (the 01-task-graph Mode 2 recipe applies now that T01 is done): spawn 4 general-purpose subagents with **worktree isolation**, one each for T02 audio engine · T03 render core · T04 UI shell · T05 TD look-dev kit. Each gets ONLY its `tasks/Txx-*.md` + `src/contracts/` + `00-overview.md`. Merge onto a `wave-a` branch at the gate, run full typecheck+test, integrate seams, update this file.

## Standing decisions log

| Date | Decision |
|---|---|
| 2026-07-21 | Name = Antinode; rename everything immediately (Anmol has been burned by deferred renames twice) |
| 2026-07-21 | Public app, Spotify = 5-seat bonus tier; capture ladder with loopback as the headphones answer |
| 2026-07-21 | three.js TSL/WebGPU + WebGL2 fallback; TD = look-dev only; React chrome |
| 2026-07-21 | No video export ever (Spotify sync clause); no Web Playback SDK in v1; free forever (dev-mode = non-commercial) |
| 2026-07-21 | **Reuse the 2023 Spotify client** (in `.env.local`) rather than register a new app — keeps the wider pre-Nov-2024 endpoint surface + dodges the 1-client-ID cap. Dashboard already renamed + redirect URIs set. |
| 2026-07-21 | **Stack pin realities (T01):** TypeScript pinned **5.9** (typescript-eslint peer caps `<6.1`, so TS 7 breaks lint); Vite kept on **7.x** per plan pin (latest is 8, but honoring 6/7). three r185 deferred to T03 (not needed for the T01 shell). |

## Update protocol

Every wave gate (see 01): update this file — state, next-up queue, and any decision changes with dates. This file is the only file that describes *now*; the rest of the plan describes *intent*.
