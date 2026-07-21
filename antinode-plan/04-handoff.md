# Antinode — handoff / live state

**Read this first when resuming work.** Then `00-overview.md` (decisions + constraints), then `01-task-graph.md` (how to execute), then your task file in `tasks/`.

## State as of 2026-07-21

- Plan written and committed. **No code built yet.** Repo is the untouched 2023 CRA app + this plan.
- Local folder renamed `audio_visualizer` → `antinode` (done 2026-07-21, via Cowork). **GitHub repo NOT yet renamed** — that's T01's first step.
- ponderance `src/data/legal-services.ts`: `antinode` entry already rewritten (status `planned` — renders nothing until T12 flips it). Uncommitted in the ponderance repo — commit it with the next site deploy.
- Spotify dashboard: **not yet touched.** Old 2023 app status unknown — T08 pre-flight audits it (reuse if alive: wider grandfathered endpoint surface).
- Name locked: **Antinode** (see 00-overview for the why + rejected candidates).

## Next up (in order)

1. **T01** — rename on GitHub, secret-scan history (old Express server may have committed a Spotify client secret → rotate), scrub CRA, scaffold Vite+TS+React+three r185, write `src/contracts/`, CI. Solo task; everything else is blocked on it.
2. Then **Wave A in parallel**: T02 audio engine · T03 render core · T04 UI shell · T05 TD look-dev kit.

## Standing decisions log

| Date | Decision |
|---|---|
| 2026-07-21 | Name = Antinode; rename everything immediately (Anmol has been burned by deferred renames twice) |
| 2026-07-21 | Public app, Spotify = 5-seat bonus tier; capture ladder with loopback as the headphones answer |
| 2026-07-21 | three.js TSL/WebGPU + WebGL2 fallback; TD = look-dev only; React chrome |
| 2026-07-21 | No video export ever (Spotify sync clause); no Web Playback SDK in v1; free forever (dev-mode = non-commercial) |

## Update protocol

Every wave gate (see 01): update this file — state, next-up queue, and any decision changes with dates. This file is the only file that describes *now*; the rest of the plan describes *intent*.
