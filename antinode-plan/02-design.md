# Antinode — design language

Half ponderance, half its own — same recipe as Calque's "carbon & vellum", different metal. The app is **dark-first** (visualizers live in the dark); the landing section supports both themes via `data-theme` like the parent site.

## Inherited from ponderance.dev (same token names)

- Graph-paper ground: `--color-graph: #EEF0EC` (dark `#0E1A24`), card `#F6F7F4` / `#182530`, grid lines `rgba(46,94,140,0.07)` repeating background grid — on the **landing/chrome only**, never behind the canvas (pure black `#050A0F` behind the render for contrast).
- Ink: `--color-graphite: #1B2A33` (dark `#E9ECE7`), 60/40 alpha steps.
- Structure lines: `--color-crease: #2E5E8C` (dark `#82A9CE`), hairlines at 0.13 alpha.
- Type: **Bricolage Grotesque** (display), **Hanken Grotesk** (body), **IBM Plex Mono** for every number that moves — BPM, Hz, dB, ms, FPS. All tabular data is mono.
- Decorative SVGs inlined and themed with `var(--color-*)` so the toggle recolors them; `--art-accent` for accent labels (site convention per ponderance-svg-assets).

## Antinode's own half — "phosphor & graphite"

Do **not** use ponderance's crane orange `#E84A27` (parent site only) or Calque's aniline purple.

- **Accent — phosphor** (oscilloscope CRT green, the color of seeing a wave): `--color-phosphor: #2FBF71` on light, `#4ADE80` on dark; hover/deep variant `#1E8A52`. All CTAs, links, live meters, active params, beat indicators.
- **Standing-wave motif**: the logotype glyph is a standing wave with nodes drawn as small fixed dots and the central antinode peaked — reads as a waveform, secretly a diagram of the name. Use as favicon, loading state (the wave "excites" as audio arrives), and section divider.
- **Scanline/CRT restraint**: a *very* subtle vignette + 1px scan texture on UI surfaces only (opacity ≤0.04), never on the canvas. No fake CRT curvature.
- **Meters as instrumentation**: level meters, spectrum thumbnails, and the drift readout styled like lab equipment — thin strokes, mono labels, phosphor traces on graphite. The Tweakpane theme is customized to match (its CSS vars → our tokens).
- Overlay panels: translucent graphite `rgba(14,26,36,0.72)` + `backdrop-filter: blur(10px)`, hairline crease borders. UI fades out after 3s idle (any input brings it back; `Space` pins it).

## Now-playing card (Spotify-visible surface — compliance is part of the design)

Album art **intact**: rounded corners, no overlay, no crop, no filter — floated on the graphite panel, *beside* (never under) the metadata. Track/artist/album exactly as Spotify provides. Full Spotify logo (icon+wordmark) ≥70px as attribution; "PLAY ON SPOTIFY" link-back to the track. The card is the one place third-party brand rules own the layout — everything else is ours.

Palette extraction (art → scene tint) is allowed in our reading (the art itself is displayed unmodified; colors merely inform generated visuals) — see 03-legal.md judgment call. Extracted swatches shown as small chips under the card, mono-labeled with hex, phosphor ring on the active one.

## Scenes — art direction

1. **Heritage** (T06): the original dual icosahedron, preserved faithfully — same palette, same wireframe character. It's the project's history; don't modernize its look, just its plumbing.
2. **Standing Wave** (T09): GPU particle surface shaped as a literal standing wave — nodes pinned, antinodes breathing with bass; onsets ripple outward from antinode peaks. Phosphor-on-black, depth-fogged. The "name made visible" scene, and the default.
3. **Phosphor** (T09): feedback flow-field (domain-warped FBM + decaying trails) like long-exposure oscilloscope photography; highs add shimmer, mids steer the warp. Monochrome phosphor with rare graphite-white peaks.

## Accessibility & safety (non-negotiable, tested in T10)

- `prefers-reduced-motion`: scenes switch to a low-motion program — slow crossfades, amplitude-mapped brightness instead of movement, no camera motion. The visualizer *is* motion, so "reduced" means gentle, not blank.
- **Flash safety**: no effect may exceed 3 flashes/second at high contrast (WCAG 2.3.1). Onset-driven strobes are rate-limited in the engine (`flashGuard` clamp in the feature→param modulation path), not per-scene good intentions.
- Full keyboard operation: `Space` UI pin/unpin, `F` fullscreen, `1–9` scenes, `[`/`]` preset prev/next, `S` PNG snapshot (canvas only — never album art). Focus rings phosphor, visible on dark. All controls labeled for screen readers; the canvas gets `role="img"` with a live-region "now playing" description.
- Contrast: all UI text ≥4.5:1 on its actual translucent-panel background (test against worst-case bright canvas behind).

## Landing page (pre-canvas)

One screen: name + standing-wave glyph, one sentence ("It listens, and gives the sound a shape."), the source picker as the hero CTA, a quiet capability note per browser, links to ponderance.dev, /privacy, /terms, GitHub. No screenshots — the app *is* the demo; a muted looping canvas (procedural idle mode, no audio) plays behind the hero. SEO/OG: og-image is the standing-wave glyph on graphite, generated as a static asset (per site SVG conventions — inline, `var(--color-*)`, toggle-aware where embedded on ponderance).

## Assets to produce (T12, per ponderance-svg-assets conventions)

- Workshop cover `work/antinode-cover.svg` (replaces `audio-visualizer-cover.svg`): standing wave with phosphor antinode marker, `--art-accent` labeled, both-theme safe.
- Favicon/app icon set from the glyph.
- OG image 1200×630.
