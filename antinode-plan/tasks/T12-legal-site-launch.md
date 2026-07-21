# T12 — Legal flip, site content, workshop refresh (launch companion)

**Role:** ops/content. **Depends on:** T08 shipped + launch timing (same day as T11's runbook). Works in the **ponderance repo**, not this one.
**Owns (ponderance repo):** `src/data/legal-services.ts` (the antinode entry), `src/content/work/audio-visualizer.md`, new cover SVG. **Reads:** `antinode-plan/03-legal.md` (the drafted content + compliance checklist — most of this task is *applying* it), ponderance repo conventions (legal registry header comment; svg-assets conventions; per site memory: registry drives /privacy + /terms, planned entries render nothing).

## At launch (ordered)

1. **Registry flip:** the `antinode` entry (already rewritten 2026-07-21, sitting at `status: 'planned'`) → `status: 'live'`. Verify the drafted `collects[]`/`notes` still match the *shipped* reality (esp. if T08 scope moved — e.g. palette extraction flag, storage keys). Truth over draft: fix the entry, not the app.
2. **Render verification:** build the site; confirm /privacy and /terms now show the Antinode block: summary, collects list, Spotify sub-processor row, and the Spotify Developer-Policy disclosure block (it renders for any live `auth: 'spotify'` service). Confirm the pages' "last updated" line reflects the change per the pages' own convention (effective date was 2026-06-29; adding a service = update the updated-date, not the effective-date, unless the pages' pattern says otherwise — follow the file, note the choice).
3. **Compliance checklist** from 03-legal.md walked item by item against the deployed app; evidence screenshots into the antinode repo `docs/qa/` (with T10's archive).
4. **Workshop entry refresh** (`src/content/work/audio-visualizer.md`): keep the slug (published URL + inbound links survive; the repo link redirects post-rename), retitle to **Antinode**, rewrite summary/body — the honest arc: the 2023 half-finished sync, the 2026 constraint wall (analysis endpoints gone, 5-seat cap), and the resolution (listen locally, let Spotify label). Update `stack` (three.js TSL/WebGPU, TypeScript, Web Audio), `repo` URL to `AnmolS1/antinode`. New cover `work/antinode-cover.svg` per site SVG conventions (inline-ready, `var(--color-*)` themed, toggle-aware, `--art-accent` labels — standing-wave glyph per 02-design). **Voice: run the write-like-anmol skill for every sentence of site copy.**
5. **Marginalia follow-up note** (optional, recommended, via ponder-and-post at ship): sequel to *"Knowing what's playing vs. knowing what the music is doing"* (2026-05-29) — the hard half closed by refusing the metadata premise: the browser listens to the actual audio; Spotify labels it. Draft-by-default per that skill's staging convention.
6. Cross-links: antinode footer already links /privacy /terms (T04); add antinode to any site indexes that list live products if such exist (check index page patterns).

## Sanity rails

- The registry is the **single source of truth** — no bespoke prose sections added to privacy/terms pages themselves (site convention; one policy covers the property).
- If launch slips after a registry commit: `planned` status is safe to commit anytime (renders nothing); `live` only flips the day the app is actually up.
- Operator line: pre-LLC = Anmol Saxena individually; if Ponderance LLC has formed by launch (see llc-formation project), the pages' operator handling changes globally — check that project's state first; do not special-case antinode.

## Acceptance

- [ ] /privacy + /terms render the Antinode block correctly (screenshots in PR), site CI gates green (CSP self, no inline scripts, axe, tokens, dark mode).
- [ ] Compliance checklist archived with evidence; workshop entry live with new cover in both themes.
- [ ] All copy in Anmol's voice (skill-checked), no stray "Audio Visualizer"/"spotiball" references site-wide (grep).
- [ ] 04-handoff updated: launch date recorded, project state → live/maintenance.
