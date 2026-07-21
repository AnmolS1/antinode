# Antinode — task graph & how to run it

Twelve tasks in four waves. Tasks in the same wave are independent by construction — **disjoint file ownership** (each task file declares `Owns:`; nobody edits outside their paths, `src/contracts/` is read-only for everyone after T01). That's what makes parallel subagents safe and keeps each context clean: a subagent needs only its task file, the contracts, and 00-overview.

## The graph

```
                              ┌────────────────────────────────────────────┐
                              │                 WAVE A (∥)                 │
              ┌──► T02 audio engine ──────────┬──► T06 heritage scene ─┐
              │                               ├──► T09 two new scenes ─┤
T01 ──────────┼──► T03 render core + scenes fw┤                        │
 foundations  │            │                  │      WAVE B (∥)        ├─► T10 QA ─► T11 deploy
 (solo,       │            └──────────────────┼──► T07 params/MIDI ────┤    matrix     + launch
  blocks all) ├──► T04 UI shell ──────────────┴──► T08 spotify layer ──┘                 ▲
              ├──► T05 TD look-dev kit ···(feeds looks into T09, non-blocking)···        │
              └──► T11a preview deploy (early slice of T11, optional after T01)          │
                                                                                         │
03-legal.md (registry already applied, status planned) ──────────► T12 legal/site/launch ┘
```

| ID | Task | Role hat | Depends on | Parallel-safe with |
|---|---|---|---|---|
| T01 | Foundations: rename, secret scan, scaffold, contracts, CI | Tech lead | — | nothing (solo) |
| T02 | Audio engine & capture ladder | Audio DSP eng | T01 | T03 T04 T05 |
| T03 | Render core + scene framework | Graphics eng | T01 | T02 T04 T05 |
| T04 | UI shell, source picker, onboarding | Frontend eng | T01 | T02 T03 T05 |
| T05 | TouchDesigner look-dev kit + porting recipe | Creative technologist | T01 | T02 T03 T04 |
| T06 | Heritage scene port (the 2023 sphere, faithfully) | Graphics eng | T02 T03 | T07 T08 T09 |
| T07 | Params, presets, mod-matrix, MIDI | Tools eng | T03 T04 | T06 T08 T09 |
| T08 | Spotify layer (PKCE, poller, now-playing card) | Integration eng | T04 (+contracts) | T06 T07 T09 |
| T09 | Scenes: Standing Wave + Phosphor | Graphics eng ×2 | T02 T03 (T05 inspires) | T06 T07 T08 |
| T10 | Cross-browser QA matrix (incl. Waterfox, iOS) | QA eng | T06–T09 | — (gate) |
| T11 | Deploy, headers, DNS, launch mechanics | Infra eng | T10 (preview slice: T01) | T12 |
| T12 | Legal flip, site content, workshop refresh | Ops/content | T08 shipped, launch timing | T11 |

## How to execute with Claude Code (recommended: Mode 2)

**Mode 1 — solo sequential** (fallback, any CC session): T01 → T02 → T03 → T04 → T06 → T07 → T08 → T09 → T05 → T10 → T11 → T12. Works, slower, single context does everything (compact often).

**Mode 2 — orchestrator + parallel subagents** (recommended; stable CC features only). Paste this into a fresh Claude Code session at the repo root after T01 is merged:

> Read `antinode-plan/00-overview.md`, `antinode-plan/01-task-graph.md`, and `antinode-plan/04-handoff.md`. Execute the next incomplete wave: spawn one general-purpose subagent per wave task **in parallel**, giving each subagent ONLY: its `antinode-plan/tasks/Txx-*.md` file, `src/contracts/`, and `antinode-plan/00-overview.md`. Subagents that write code run with worktree isolation. Each subagent implements its task to its acceptance criteria, runs its own tests, and returns a summary + file list. After all return: merge worktrees onto a `wave-X` branch, run typecheck + full test suite, fix integration seams yourself (ownership should have prevented conflicts — if two agents touched one file, that's a plan bug: note it in 04-handoff.md), commit, update `antinode-plan/04-handoff.md` (state, next-up, decisions), and stop for review.

Run one wave per session sitting; review the diff between waves. Wave A = 4 subagents (T02 T03 T04 T05), Wave B = 4 (T06 T07 T08 T09), Wave C = T10 then T11+T12.

Why not deeper automation: CC's agent-teams and cross-session workflow resumption are experimental as of July 2026 (task lists persist per-team but `/resume` doesn't restore in-process teammates; workflow runs don't survive session exit). Subagents + worktrees are stable. Revisit if agent teams stabilize — this graph maps 1:1 onto a team task list with `blockedBy` edges.

**Verification discipline (every wave gate):** `npm run typecheck && npm run lint && npm test`, then the wave's acceptance items from each task file, checked one by one. T10 is itself a whole-app gate — nothing ships around it. A task isn't done because code exists; it's done when its acceptance list is green and 04-handoff says so.

## Context hygiene rules (for whoever orchestrates)

1. A subagent gets its task file + contracts + overview. **Not** the whole plan folder, not other tasks, not chat history. If a task file is insufficient, that's a bug in the task file — fix the file, then re-run, so the fix persists.
2. `src/contracts/` changes require stopping the wave: contracts are the inter-agent API. Change them only at wave gates, deliberately, recording why in 04-handoff.
3. Every wave gate updates `04-handoff.md`. It is the only file describing current state.
4. Commit granularity: one commit per task merge minimum; message `T0x: <summary>`.

## Stack pins (deviate only with a 04-handoff note)

`three` ≥ r185 · `vite` 6/7 · `typescript` strict · `react` 19 (chrome only) · `tweakpane` 4 · `realtime-bpm-analyzer` 5 · `meyda` 5 (optional, feature extraction) · `vitest` · `playwright` (chromium+firefox+webkit) · ESLint flat + Prettier. No state library (module singletons + React context bridge), no CSS framework (tokens per 02-design.md), no analytics of any kind.
