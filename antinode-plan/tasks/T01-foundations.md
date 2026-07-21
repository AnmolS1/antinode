# T01 — Foundations (rename · secret scan · scaffold · contracts · CI)

**Role:** tech lead. **Depends on:** nothing. **Blocks:** everything. Run solo, not in parallel with anything.
**Owns:** the entire repo (last time anyone does — after T01, ownership splits per task).

## 1. Rename & hygiene (do first, in this order)

1. `gh repo rename antinode` (from repo root; old `AnmolS1/audio_visualizer` URLs auto-redirect), then `git remote set-url origin git@github.com:AnmolS1/antinode.git` (or https equivalent — match existing).
2. **Secret scan the FULL history** before touching anything: `gitleaks git .` (or `trufflehog git file://.`). The 2023 README says Spotify auth was "done w/ react & express" — that server isn't in the working tree, so it lives in history and may contain a **Spotify client secret / .env**. If found: mark the secret compromised, rotate/delete it in the Spotify dashboard (T08 pre-flight covers dashboard state), and record findings in 04-handoff. Do NOT rewrite public history (rotation kills the risk; rewriting breaks the redirect + any forks).
3. Update `~/GitHub/ponderance-memory/` references: grep for `audio_visualizer` in MEMORY.md / topics / projects and update paths to `antinode` (the shared-memory wiring expects repo CLAUDE.md imports to keep working — verify this repo's CLAUDE.md import line survives).

## 2. Scrub & scaffold

- `git rm` the CRA app: `react-scripts` world, `src/` boilerplate, `temp/`, `public/` CRA leftovers, `gh-pages` dep + deploy script. Keep: `README.md` (rewrite below), `touchdesigner-skill.md` (move to `touchdesigner/SKILL.md`), `antinode-plan/`, `CLAUDE.md`, `.gitignore` (rewrite), git history (the old visualizer source stays reachable at the pre-scrub tag — tag it `v0-2023-cra` first; T06 needs it for A/B).
- Scaffold: Vite + TypeScript strict + React 19 (`react` only for UI chrome — `main.ts` boots engine/renderer framework-free and mounts React beside the canvas). ESLint flat config + Prettier. Vitest (+ jsdom for UI units). Playwright with chromium/firefox/webkit projects (install browsers in CI). `npm run` scripts: `dev` (vite, port 5173), `build`, `preview`, `typecheck`, `lint`, `test`, `test:e2e`.
- Directory skeleton per 00-overview "Repo layout", each module folder with a one-line README stub declaring its owner task.
- GitHub Actions CI: typecheck + lint + vitest + build on PR/main; Playwright smoke on main (fast subset). Cache node_modules. Badge in README.
- Rewrite `README.md`: name, one-liner, dev quickstart, plan pointer, browser support table (from 00), the "no video export" note, license decision — add MIT `LICENSE` matching ponderance's (same holder line).

## 3. Contracts (`src/contracts/` — the inter-task API; everyone else reads, nobody else writes)

Write exactly these, typed strictly, JSDoc'd, with zero implementation:

```ts
// features.ts
export interface BandLevels { bass: number; lowMid: number; mid: number; high: number } // 0–1 normalized
export interface BeatInfo { bpm: number | null; phase: number; confidence: number }      // phase 0–1 within beat
export interface FrameFeatures {
  t: number;                // audio-clock seconds
  rms: number; loudNorm: number;          // raw + percentile-normalized loudness
  bands: BandLevels; spectrum: Float32Array; // 64 log-spaced bins, normalized+smoothed
  flux: number; onset: boolean;           // spectral flux + thresholded onset (flashGuard-limited)
  beat: BeatInfo; silent: boolean;        // silence: sustained sub-threshold input while a source is active
}

// source.ts
export type SourceKind = 'file' | 'display' | 'input' | 'procedural'; // 'input' = mic OR loopback device
export interface SourceCapability { kind: SourceKind; available: boolean; reason?: string } // reason: honest "why not" per browser
export interface AudioSourceProvider {
  readonly kind: SourceKind; readonly label: string;
  start(ctx: AudioContext): Promise<AudioNode>;  // node to tap for analysis (never routed to destination for 'input')
  stop(): Promise<void>;
  onEnded?(cb: () => void): void;
}

// scene.ts
export type ParamDef =
  | { type: 'number'; key: string; label: string; min: number; max: number; step?: number; default: number; modulatable?: boolean }
  | { type: 'boolean'; key: string; label: string; default: boolean }
  | { type: 'color'; key: string; label: string; default: string }
  | { type: 'select'; key: string; label: string; options: string[]; default: string };
export interface SceneContext { renderer: unknown /* WebGPURenderer */; scene: unknown; camera: unknown; isWebGPU: boolean; size: {w: number; h: number; dpr: number} }
export interface SceneModule {
  id: string; name: string; params: ParamDef[];
  init(ctx: SceneContext): Promise<void>;
  update(f: FrameFeatures, params: Record<string, unknown>, dt: number): void;
  resize(size: SceneContext['size']): void;
  dispose(): void;
}

// spotify.ts
export interface NowPlaying {
  trackId: string; title: string; artists: string[]; album: string;
  artUrl: string | null; trackUrl: string;         // open.spotify.com link-back (required display)
  durationMs: number; progressMs: number; isPlaying: boolean;
  fetchedAt: number;                               // performance.now() at poll, for interpolation
}
export interface SpotifyStatus { state: 'disconnected' | 'connecting' | 'connected' | 'error'; reason?: 'not-allowlisted' | 'expired' | 'network' | 'rate-limited' }

// engine.ts — facade the UI consumes (lets T04 build against a mock)
export interface EngineFacade {
  capabilities(): SourceCapability[];
  selectSource(kind: SourceKind, opts?: { deviceId?: string; file?: File }): Promise<void>;
  latest(): FrameFeatures; onFrame(cb: (f: FrameFeatures) => void): () => void;
  setScene(id: string): void; scenes(): { id: string; name: string }[];
}
```

## Acceptance

- [ ] Fresh clone → `npm i && npm run dev` shows a placeholder page with an empty canvas element and theme tokens loaded; `build`, `typecheck`, `lint`, `test` all green locally and in CI.
- [ ] `gitleaks` report saved to 04-handoff (findings + rotation actions); tag `v0-2023-cra` exists; GitHub repo renamed.
- [ ] `src/contracts/` compiles standalone; no other src/ code imports anything outside its own folder + contracts.
- [ ] 04-handoff.md updated: state, secret-scan outcome, next-up = Wave A.
