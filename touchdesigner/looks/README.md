# looks/ — prototyped looks

One folder per look prototyped in TouchDesigner (`../BUILD.md`) and ported (or awaiting port)
to a TSL scene via `../PORTING.md`.

## Folder convention

```
looks/
  <look-name>/
    <look-name>.toe   or  <look-name>.tox   ← the TD patch/component (see size rule below)
    look.glsl                                ← the TD GLSL TOP body (text — always tracked)
    <look-name>.tsl.ts / *.ts                ← the ported TSL side (text — always tracked)
    preview.png                              ← a screenshot / still of the look
    NOTES.md                                 ← what it reacts to, params, and PORT STATUS
```

- **Track the text.** `look.glsl`, the `.ts` TSL port, `NOTES.md`, and a small `preview.png`
  are the durable record and are always committed — they survive even when the binary can't.
- **Port status** in every `NOTES.md`, one of: `prototype` (TD only) · `porting` · `ported`
  (TSL committed, verified) · `ported-pending-verify` (TSL committed, awaiting T03 harness).

## `.toe` / `.tox` size rule

- `*.toe` is **gitignored repo-wide** (`.gitignore` line 39) — TD project binaries stay
  untracked. Rebuild any `.toe` from `../BUILD.md` + the look's `look.glsl`/`NOTES.md`.
- Small `*.tox` components (a single exported COMP, typically < a few hundred KB) **may** be
  committed so a look is drag-and-drop reusable. Keep them small.
- **> 10 MB:** do not commit. If a large binary must be versioned, use **git-lfs** (optional;
  `git lfs track "touchdesigner/looks/**/*.toe"`) — not set up by default; prefer rebuild-from-doc.

## Index

| Look | Status | Reacts to | Notes |
|---|---|---|---|
| `example-feedback/` | ported-pending-verify | `loudNorm`, `bands.high`, `beat.phase`, spectrum | The `PORTING.md` §6 worked example — feedback ring. TSL committed; awaits T03 harness verify. |
