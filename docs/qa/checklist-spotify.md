# Manual checklist — Spotify layer (allowlisted account)

**Scope:** the optional bonus tier (5 allowlisted seats). The public visualizer needs no
Spotify — this checklist verifies the connect flow, now-playing sync, expiry UX, the
not-allowlisted UX, and **card compliance** (album-art rules are load-bearing / legal).
**Tester:** ______  **Date:** ______  **Account (allowlisted?):** ______  **Build/commit:** ______

Mark: ✅ · ⚠️ (note) · ❌ (file P0/P1). Attach evidence per row.

## Connect / disconnect
- [ ] **Connect** via Authorization-Code + PKCE (fully client-side) succeeds; now-playing card appears.
- [ ] **Disconnect** clears the session and card cleanly.

## Now-playing sync (poll ~1 s + interpolation)
- [ ] **Skip / seek / track-change** reflect in the card within **≤ 1.5 s**. Evidence (recording): ______
- [ ] Progress advances smoothly between polls (interpolated), not steppy.

## Expiry & access UX
- [ ] **6-month refresh-token expiry**: force it by wiping the stored refresh token
      (simulate `invalid_grant`) → the app shows a clean **re-auth** prompt, not a broken state. Evidence: ______
- [ ] **Not-allowlisted UX**: sign in with a **second, non-listed** account → the app
      explains the allowlist honestly and still offers the full non-Spotify visualizer. Evidence: ______

## Card compliance (per `antinode-plan/03-legal.md` — archive all screenshots here)
- [ ] Album art **intact**: rounded corners, **no crop, no overlay, no filter, no distortion**.
- [ ] Art floated **beside** (never under) the metadata.
- [ ] Track / artist / album shown **exactly** as Spotify provides (unmodified metadata).
- [ ] **Full Spotify logo (icon + wordmark) ≥ 70 px** shown as attribution.
- [ ] **"PLAY ON SPOTIFY"** link-back to the track works.
- [ ] Extracted palette chips are shown **under** the card (art itself unmodified) — mono hex labels, phosphor ring on the active swatch.
- [ ] **Compliance screenshots archived** in `docs/qa/` alongside this pass. Links: ______

## Result
- [ ] No open P0 · No open P1. Any card-compliance ❌ is an automatic **P0** (legal surface).
- Known degradations (accepted by Anmol): ______
