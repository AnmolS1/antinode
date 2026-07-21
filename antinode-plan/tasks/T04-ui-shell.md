# T04 — UI shell, source picker, onboarding

**Role:** frontend engineer. **Depends on:** T01. **Parallel with:** T02 T03 T05.
**Owns:** `src/ui/**`, `src/theme/**`, `index.html`. **Reads:** contracts, 02-design.md (follow it closely), 00-overview capture ladder.
**Build against mocks**: `src/ui/dev/mockEngine.ts` implementing `EngineFacade` + canned `SourceCapability[]` matrices (one per browser profile) and `NowPlaying` fixtures. Real wiring happens at the Wave B gate — keep the seam thin (one `<App engine={...}>` prop).

## Structure

- `main.ts` boots (canvas placeholder from T03's slot) and mounts React beside it; React renders chrome only — **nothing in the rAF path**. Engine state → UI via a small subscription hook (`useEngine(select)`), throttled to ≤10 Hz for meters (not 60).
- Layout: full-bleed canvas; floating panels per 02-design (translucent graphite, blur, hairlines); UI auto-fades after 3 s idle, any input restores, `Space` pins.
- Theme: implement ponderance-inherited tokens + phosphor accent as CSS custom props (`data-theme` dark default for the app; landing supports both). Tweakpane CSS vars mapped to tokens (actual pane arrives in T07 — style contract only).

## Source picker & onboarding (the product's front door — most of this task's care goes here)

- First-run: name + glyph + one-liner → **source picker as hero**. Each ladder rung a card: label, works-with-headphones badge, per-browser availability from `capabilities()` (unavailable = shown but disabled with the honest `reason` — "Firefox doesn't allow tab audio capture; try a loopback device").
- Picking a source runs the gesture-unlock (`engine.unlock()` then `selectSource`), then a **signal check screen**: live input meter; success → fade into visualizer; silence ≥3 s → the steering flow.
- **Steering flow (headphones answer, treat as first-class):** when `silent` while source active — "Hearing nothing?" panel with per-browser recommendations: Chromium → switch to tab-capture (one click); Firefox/Waterfox/Safari → guided **loopback setup**: BlackHole (macOS: install, create Multi-Output Device so you still hear in headphones, pick BlackHole in our device list) / VB-Cable (Windows) / PipeWire monitor (Linux), each as a 3-step illustrated card, links included; or drop a file instead. Never blame the user; the copy explains *why* browsers limit this (one sentence, no lecture).
- Device picker for `input` kind: enumerated devices, loopback devices visually flagged (name match heuristics: BlackHole/VB-Cable/Monitor), remember last choice (localStorage `antinode:source`).
- Spotify connect slot: renders a `<SpotifyArea>` placeholder component behind a feature flag with fixture states (disconnected / card with art+metadata / not-allowlisted error) — T08 replaces internals; you own the card's **compliance layout** per 02-design (art intact + rounded, no overlay, Spotify full logo ≥70px, PLAY ON SPOTIFY link slot, unmodified metadata fields).

## Chrome (rest of it)

- Keyboard: `Space` pin UI, `F` fullscreen, `1–9` scene select, `[`/`]` presets, `S` canvas PNG snapshot (canvas only — never composite the now-playing card/art into the capture), `?` shortcut overlay. All also reachable by visible buttons.
- Scene switcher (names from `engine.scenes()`); param panel dock area reserved for T07; perf HUD toggle (numbers from T03 hook, mono type).
- Error surfaces: renderer init failure, permission denied (per-source kind copy), context lost. Toast system, minimal.
- A11y per 02-design: full keyboard operability, focus rings, aria labels, canvas `role="img"` + polite live-region announcing track/scene changes, reduced-motion detection exposed as an engine flag (scenes consume it; UI also calms its own transitions), contrast ≥4.5:1 against worst-case bright canvas (test with white canvas behind).
- Landing/SEO: meta/OG per 02-design; footer links (ponderance.dev, /privacy, /terms on the parent domain, GitHub).

## Tests

Vitest+jsdom: capability gating renders per canned browser matrix (4 profiles), steering flow appears on silent flag, keyboard map fires actions, snapshot excludes UI layer. Playwright (chromium): first-run → pick file source (fixture wav via input) → signal check passes → canvas visible → UI fades → Space pins.

## Acceptance

- [ ] Full flow works against mock engine on all 4 canned capability profiles; disabled rungs always say why.
- [ ] Steering flow reachable and correct per profile (tab-capture offer only on Chromium profile; loopback guide elsewhere).
- [ ] a11y: axe run clean on picker + main chrome; keyboard-only walkthrough recorded in PR notes.
- [ ] No imports outside `src/ui`, `src/theme` + contracts; mock engine clearly dev-only. 04-handoff updated.
