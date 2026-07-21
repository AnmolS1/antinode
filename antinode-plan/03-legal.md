# Antinode — legal: what changed, what T08/T12 must honor

ponderance.dev runs ONE registry-driven /privacy + /terms (`src/data/legal-services.ts` in the site repo; a service renders only when `status !== 'planned' && audience !== 'household'`). **The Antinode entry was rewritten on 2026-07-21** (id `audio-visualizer` → `antinode`, strings updated to the real architecture) and left at `status: 'planned'` — it renders nothing until T12 flips it to `'live'` on launch day. The strings below are the applied text (voice-checked); if shipped reality drifts from them, fix the entry, not the app's honesty.

## The applied registry entry (reference copy)

```ts
{
  id: 'antinode',
  name: 'Antinode',
  url: 'https://antinode.ponderance.dev',
  status: 'planned', // T12 flips to 'live' on launch day
  audience: 'public',
  hosting: 'cloudflare',
  summary: 'A music visualizer that listens in your browser and gives the sound a shape.',
  auth: 'spotify',
  collects: [
    'the audio you let it hear: a dropped file, your mic, a loopback device, or a shared browser tab. Analyzed in your browser for levels and rhythm, drawn to the screen, and let go. Never recorded, never sent anywhere, there is no server to send it to',
    'if you connect Spotify (optional, and capped by Spotify at a handful of invited accounts): the profile Spotify shares at sign-in, plus your currently-playing track and position, read about once a second to label and sync the visuals. Read and dropped, not stored',
    'sign-in tokens live in your browser and nowhere else. There is no account with us',
  ],
  subprocessors: ['spotify', 'cloudflare'],
  notes:
    'A static page on Cloudflare, nothing of yours passes through it. The visualizer needs no account and works with any audio you can route into it. Spotify connect exists so it can name what you are hearing, and Spotify limits development apps to five invited accounts, so that part is invite-only. Not our choice. Formerly listed here as Audio Visualizer.',
},
```

Also applied: `SUBPROCESSORS.spotify.role` → `'Sign-in and playback metadata for Antinode'`. **Left untouched:** `PROVIDER_DISCLOSURES.spotify` (the Developer-Policy affirmation block) — its text already fits ("use the Spotify data shared with us only to power the visualizer in real time; we do not store, sell, or repurpose it") and renders automatically once the entry is live.

## Spotify compliance checklist (T08 builds it, T12 verifies it deployed, evidence archived)

- [ ] Privacy policy + terms links shown **on the connect surface itself**, before auth (Developer Policy §I.1.a / Terms §V.11-12) — links to ponderance.dev/privacy and /terms.
- [ ] "Antinode is not endorsed by or affiliated with Spotify" line near the connect button.
- [ ] Album art displayed **intact**: rounded corners, no crop, no overlay, no filter, no animation of the art itself.
- [ ] Track/artist/album metadata verbatim from the API; truncation only with full value reachable.
- [ ] Full Spotify logo (icon + wordmark) ≥70 px as attribution on the now-playing card.
- [ ] Link-back to the track on Spotify ("PLAY ON SPOTIFY" / "OPEN SPOTIFY" approved strings).
- [ ] Minimum scopes only (`user-read-currently-playing user-read-playback-state`); PKCE; no client secret anywhere.
- [ ] No ads, no payments, no monetization of any kind (dev mode = non-commercial; Terms §IV.2.5 bans ad-toolset data sharing — we have no ad toolsets).
- [ ] No video/recording export that includes Spotify-played audio, ever (Policy §III.6 sync clause). Canvas PNG snapshot excludes the card and captures no audio — compliant.
- [ ] No Spotify data into any ML/AI training (Policy §III.14) — we train nothing; stated for the record.
- [ ] App name/branding: "Antinode" (clean of Spot-/-ify resemblance); our logo unrelated to Spotify's.

## Judgment call, recorded

**Album-art palette extraction** (dominant colors sampled to tint scene accents): the art itself is displayed unmodified and never texture-mapped, distorted, or overlaid — the extracted colors inform *generated* visuals. The Design Guidelines ban manipulating the artwork's display; they don't address deriving a palette, and category precedent (years of Spotify-connected visualizers) supports it. Decision: **allowed, flag-on by default**, revisit instantly if Spotify's guidelines ever address it. If Anmol wants zero ambiguity at launch, the flag exists — flip it off and the scenes fall back to phosphor.

## Mic/audio privacy stance (why the entry can be this short)

Everything is client-side: no backend, no analytics, no storage of audio in any form, no transmission path at all (CSP `connect-src` allows only Spotify's API — the deploy config *enforces* the privacy claim, T11). localStorage holds tokens + preferences only. This is the FlatFold move: the substantive claim is what is NOT there.

## T12 launch-day steps (details in T12 file)

1. Flip `status: 'live'`; re-verify strings against shipped behavior. 2. Build; confirm /privacy + /terms render the block + Spotify disclosure. 3. Update the pages' "last updated" per their own convention (effective date 2026-06-29 stays unless the pages' pattern says otherwise). 4. Walk this checklist against prod; archive evidence. 5. Note: pages still await the human lawyer review tracked in the site project — adding Antinode doesn't change that; flag it in the review queue.
