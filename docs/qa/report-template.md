# Antinode QA report — <YYYY-MM-DD>

Copy this file to `report-<date>.md` for each pre-launch pass. Fill every cell; link
evidence for anything not ✅. This report + green CI + a go/no-go in
`antinode-plan/04-handoff.md` are the T10 gate.

**Build / commit:** ______  **Tester(s):** ______  **Automated matrix run:** <CI link>

## 1. Automated matrix (Playwright — `e2e/**`)

| Project | Runs green | Last 3 consecutive green? | Flakes (quarantined + issue) | Notes |
|---|---|---|---|---|
| chromium | ☐ | ☐ | | software-WebGL2 locally; WebGPU on GPU runners |
| firefox  | ☐ | ☐ | | |
| webkit   | ☐ | ☐ | | mic path via unit mocks; Tab-focus per Safari checklist |

CI link(s): ______   Flake list (empty or each with a filed issue): ______

## 2. Per-browser manual results

Legend: ✅ pass · ⚠️ pass-with-accepted-degradation · ❌ fail (open P0/P1) · — n/a

| Target | Boot / render | Backend | Capture ladder | Controls (MIDI/Gamepad/kbd) | Share URLs | reduced-motion | Overall | Evidence |
|---|---|---|---|---|---|---|---|---|
| Waterfox (WebGL2) | | | | | | | | |
| macOS Safari 26 | | | | | | | | |
| iOS Safari (iPhone) | | | | | | | | |
| iOS Safari (iPad) | | | | | | | | |
| Chrome/Edge — Windows | | | | | | | | |
| Chrome/Edge — macOS | | | | | | | | |
| Chrome/Edge — Linux | | | | | | | | |
| Firefox current | | | | | | | | |
| Spotify layer (allowlisted) | | | | | | | | |

Each row's detail lives in its `checklist-*.md`; link the filled copy here.

## 3. Known degradations (each must be honest, user-visible where relevant, accepted by Anmol)

| # | Target(s) | Degradation | User-visible? | Honest fallback / surfacing | Accepted by Anmol |
|---|---|---|---|---|---|
| 1 | Waterfox | RFP timer coarsening → coarser motion | ⚠️ | audio-clock driven; stays functional | ☐ |
| 2 | iOS Low Power | 30 fps cap | ⚠️ | stable, expected | ☐ |
| 3 | | | | | ☐ |

## 4. Open findings (P0/P1/P2)

P0 = broken core flow in any target (incl. Waterfox). P1 = broken enhancement without an
honest fallback. P2 = minor / cosmetic.

| ID | Sev | Target(s) | Summary | Owning task | Issue link | Status |
|---|---|---|---|---|---|---|
| | P2 | all | `.footer__note` contrast 3.38:1 (< AA 4.5:1) | T04 | ______ | open (quarantined in a11y.spec.ts) |
| | | | | | | |

**Zero open P0/P1 required to ship.**

## 5. Evidence archive

- Card-compliance screenshots (Spotify): ______
- Rotation / resize recordings (iOS): ______
- Backend readouts per browser: ______

## 6. Launch verdict

- [ ] CI matrix green 3 consecutive runs; flake list empty or quarantined w/ issues.
- [ ] Zero open P0/P1.
- [ ] Known degradations all accepted by Anmol.

**Verdict:** ☐ GO ☐ NO-GO — reasons: ______
(Also record this verdict in `antinode-plan/04-handoff.md`.)
