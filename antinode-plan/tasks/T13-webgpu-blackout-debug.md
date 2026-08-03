# T13 — Chrome black-canvas bug — RESOLVED 2026-08-03

**Symptom (owner, 2026-08-03):** in Chrome, after connecting Spotify or sharing a tab for audio capture, "none of the visuals or anything else shows." Reported during T10 manual QA — both failing flows are the Chrome-only checklist items.

> ## ✅ RESOLVED — root cause was NOT WebGPU device loss
> **Hardware graphics acceleration was turned off in the owner's Chrome** (`chrome://settings/system`). With the GPU process dead there is no WebGPU *and* no WebGL2, so three's own fallback threw on a `null` context and Antinode mounted degraded with a **silent** black canvas. Owner enabled the setting; the app works. **The reported trigger (Spotify / tab capture) was a red herring — the renderer was already dead at page load.**
>
> **Read `## Step 0 RESULTS` → `### ROOT CAUSE` below, then `## The fix — AS IMPLEMENTED`.** Everything in the container section immediately below is the *original hypothesis*, now **falsified on this machine** — kept only as a record of what was ruled out. Do not implement from it.

## Original hypothesis — FALSIFIED (container repro, commit 50a181c, `npm run dev` + Playwright)

> ⚠️ **This whole section is disproven for the owner's machine.** The container's Chromium predated the shipped `GPUTextureComponentSwizzle` IDL; the owner's Chrome 150 accepts three r185's descriptor (its adapter exposes `texture-component-swizzle`). Retained for provenance.

1. **The WebGPU path kills the canvas; the UI stays alive.** On boot with WebGPU active, the first frames throw inside three's render:
   ```
   TypeError: Failed to execute 'createView' on 'GPUTexture': Failed to read the
   'swizzle' property from 'GPUTextureViewDescriptor': The provided value is not
   of type 'GPUTextureComponentSwizzle'.
       at WebGPUBackend._getRenderPassDescriptor → beginRender → WebGPURenderer.render
       at _PassNode.updateBefore   (the PostChain / bloom pipeline)
   ```
   followed by `THREE.WebGPURenderer: WebGPU Device Lost` — and the canvas is black forever. React chrome, source picker, params pane all keep working. This matches the reported symptom shape exactly (app "works", zero visuals).

2. **Why it's permanent — two compounding gaps (fix both regardless of step 0's outcome):**
   - `FrameLoop.frame()` calls `onTick(dt)` **before** `schedule()` with no try/catch — the first thrown frame kills the rAF loop silently.
   - Recovery only listens for `webglcontextlost/restored` (canvas events). **WebGPU device loss (`device.lost` promise) is not handled anywhere**, and three's WebGPURenderer auto-falls back to WebGL2 only when WebGPU is *unavailable at init* — never after a mid-session loss.

3. **The swizzle source:** three r185 ships a reusable `GPUTexture.createView()` descriptor with `this.swizzle = 'rgba'` set unconditionally (`node_modules/three/build/three.webgpu.js` ~75399–75423, comment says "Requires the 'texture-component-swizzle' feature; ignored otherwise"). Chrome 143 shipped swizzle as a 4-char string, so r185 matches *that* shape — the container's older draft-shape Chromium rejects it. Whether the owner's current Chrome (Aug 2026) rejects it too, or loses the device for a different reason (tab-capture GPU pipeline churn, backgrounding, driver reset), is **exactly what step 0 determines**. r185.1 is the latest three release (checked 2026-08-03) — there is no upgrade that fixes anything yet.

4. **WebGL2 is fully healthy.** With `?gl=1` both flows work end to end in the container (source pick → signal check → live scenes, no console errors). The app logic, audio engine, capture ladder, and Spotify wiring are fine.

5. **Why CI never caught it:** headless CI runs SwiftShader with no WebGPU, so every "non-black render" e2e ran the WebGL2 path (04-handoff already flags "WebGPU-primary path unverified"). Additionally the `data-engine` observable is unreliable under WebGPU: **three itself stamps `data-engine="three.js r185 webgpu"` on the canvas**, clobbering main.tsx's `'webgpu' | 'webgl2'` marker — observed live in the repro. e2e assertions on that attribute only ever passed because the WebGL2 CI path races differently.

6. **Repro pitfalls (save yourself an hour):** the idle-fade hides `.chrome` after 3 s and the faded layer doesn't wake on synthetic pointer moves — Playwright clicks on "Connect Spotify" then fail with "`.app` intercepts pointer events" (press `Space` to pin the UI first, or click once to wake). Also worth a look on its own: decide whether pointermove should wake the chrome for real users too.

## Step 0 RESULTS — on-device, real Chrome (2026-08-02, chrome-devtools MCP + owner)

**The container's swizzle hypothesis is FALSIFIED on this machine.** Do not implement fix item 1 as a root-cause fix.

- **Environment:** Chrome **150.0.0.0**, macOS, Apple **Metal-3** adapter (`vendor: apple`, `architecture: metal-3`).
- **Discriminator:** the adapter's feature list **includes `texture-component-swizzle`** (dumped live via `requestAdapter()`). three r185's `swizzle: 'rgba'` descriptor is therefore legal here — the container failed only because its Chromium predated the shipped IDL shape. Full feature list captured in the session log; the presence of that one feature is what retires the hypothesis.
- **Clean WebGPU boot confirmed on all three origins** — `127.0.0.1:5173` (dev), `antinode.discoinferno.workers.dev` (preview), and `antinode.ponderance.dev` (prod, now live and serving `index-B0uEyH9T.js`). No swizzle TypeError, no `Device Lost`, standing-wave renders (sampled 65% non-black pixels, rAF alive). CSP is clean on preview.
- **`data-engine` clobber CONFIRMED live:** the canvas reads `data-engine="three.js r185 webgpu"` — three overwrites main.tsx's marker. Fix item 4 is justified on direct evidence.
- **Spotify connect is NOT broken** at the redirect step: clicking Connect from `127.0.0.1` correctly navigates to the Spotify/Google auth page and writes the PKCE verifier to `localStorage antinode:sp`. (An early read said otherwise — that was a race against the pending navigation, not a defect.)
- **Stubbed tab capture is clean:** with `getDisplayMedia` replaced by a synthetic stream (real oscillator audio track + canvas video track), the app reaches `live` and renders normally. So the app-side capture ladder is healthy — the failure needs the *real* capture pipeline.
- **Owner-confirmed URL: `antinode.ponderance.dev` (prod).** Not the preview — so the unregistered-`workers.dev`-redirect-URI theory is NOT the owner's bug (still worth fixing separately if preview testing is wanted).

### The reproduction (owner's own Chrome, 2026-08-02)

*(Evidence — owner screenshots and the `chrome://gpu` dump — was reviewed in-session and deliberately left untracked; the findings below are the record.)*

Sharing `open.spotify.com` tab audio into `antinode.ponderance.dev`: **the entire viewport is blank** — flat background, no canvas content AND no React chrome (no topbar, no params dock, no Spotify panel).

**Two facts that constrain the cause:**
1. **It did NOT reproduce in the MCP-driven Chrome** (fresh profile, same machine, same prod URL, real picker, real `open.spotify.com` tab audio) — it worked. It DID reproduce in the owner's daily Chrome. So the trigger is **profile/environment-dependent, not code-path-dependent**: extensions (AdBlock+ and others visible in the toolbar), GPU pressure from many tabs, or a Chrome setting — not a deterministic bug in the share flow.
2. **"Nothing at all shows" is two failures stacked.** The chrome is almost certainly not *destroyed*, it is **idle-faded**: `useIdleFade(3000)` sets `.chrome.ui-hidden { opacity: 0; pointer-events: none }`, measured live at `opacity: "0"` 2.5 s after reaching `live`. So a black canvas plus a faded chrome renders as a completely empty page. (`useIdleFade` *does* listen for real `pointermove` on `window`, so a real mouse move should wake it — the T13 note about it being un-wakeable was a synthetic-event artifact, not a real-user defect. Worth confirming with the owner whether moving the mouse brought the UI back.)

### ROOT CAUSE — CONFIRMED (owner's Chrome console + `chrome://gpu`, 2026-08-03)

**Hardware graphics acceleration is turned OFF in the owner's Chrome settings. Antinode then has NO rendering backend at all — neither WebGPU nor WebGL2 — and fails silently to a black canvas.**

Evidence — the owner's `chrome://gpu` export (Chrome **150.0.7871.187**, macOS 26.2.0, Apple **M4 Pro**), line numbers as exported:
- L82: **`GPU process was unable to boot: GPU access is disabled in chrome://settings.` — Disabled Features: all**
- L14/15: `WebGL: Disabled`, `WebGPU: Disabled`; L73: "WebGL has been disabled via blocklist or the command line"
- L44: `GL implementation parts: (gl=disabled,angle=none)`; L57: **GPU process crash count 0** (it never booted — it did not crash)
- L88–93: Dawn still reports the Metal/M4 Pro adapter as `Available` — **the hardware is fine; the browser setting is the blocker.** This is why a fresh MCP-driven Chrome on the same machine worked: the setting is per-profile.

Failure chain (owner's console, verbatim call sites):
1. `bootstrap.ts:68` → `Failed to create WebGPU Context Provider` (WebGPU context creation fails)
2. `THREE.WebGPURenderer: WebGPU is not available, running under WebGL2 backend.` — three's documented auto-fallback fires
3. **the fallback itself throws:** `main.tsx:77 antinode: engine/render boot failed TypeError: Cannot read properties of null (reading 'getSupportedExtensions')` at `new RP (three.webgpu.js:70300)` — i.e. `canvas.getContext('webgl2')` returned **`null`**, because WebGL is disabled too. three does not null-check it.
4. `RenderCore.create` rethrows → `main.tsx` catch → **degraded mount**: `data-engine='error'`, `<App engine>` with **no `host` and no scenes**. Canvas never renders.
5. 3 s later `useIdleFade` sets `.chrome { opacity: 0 }` → **the entire page is blank**, exactly as screenshotted.

**Nothing here is Spotify- or tab-capture-specific.** The renderer was already dead at page load, before either flow ran (`main.tsx:44`, above `DisplayCaptureSource` in the trace). Picking a source is merely when the owner *expected* visuals and noticed their absence. The reported trigger was a red herring.

**The actual defect in Antinode is that this failure is invisible and unactionable.** `main.tsx`'s catch writes only a `console.error` and an `aria-label`; sighted users get a black rectangle and a UI that behaves as if everything is fine. The fix is a real, visible, actionable error state that names the cause and the remedy ("Chrome → Settings → System → 'Use graphics acceleration when available'"). See the revised fix list.

Everything below — frame-loop death and no device-loss recovery — is confirmed-real and worth fixing regardless, because it is what turns any single thrown frame into a *permanent* blackout mid-session.

**Side findings logged here, not part of the fix:**
- Prod CSP blocks the Cloudflare Web Analytics beacon (`static.cloudflareinsights.com/beacon.min.js` violates `script-src 'self' blob:`). Analytics is silently dead on prod. Cosmetic; decide whether to allow it or drop the beacon.
- Owner: **the Heritage scene is "definitely overpowered"** visually — a look-dev note for a separate pass, not a bug.

## Step 0 — reproduce on the real machine (before changing code)

Run `npm run dev` and drive the owner's actual Chrome (chrome-devtools MCP, as in the 2026-07-22 camera-bug session — NOT headless). On `http://127.0.0.1:5173/`:
- Capture the console from plain boot. If the swizzle TypeError + Device Lost appear → root cause confirmed as three-r185-vs-current-Chrome; proceed with the full fix list.
- If boot is clean on WebGPU: reproduce the two reported flows exactly — (a) share a Chrome tab with audio, (b) complete a real Spotify connect round-trip — and capture what actually errors (look for any `Device Lost`, `GPUValidationError`, uncaught promise). The fix list below still applies (the loop/death + no-recovery gaps are real regardless); adjust the guard to whatever the true trigger is.
- Record the exact Chrome version and console text in this file + 04-handoff.

Also verify the **Spotify origin detail** while there: the dashboard registers `https://antinode.ponderance.dev/callback` + `http://127.0.0.1:5173/callback` only. Connecting from the `*.workers.dev` preview will fail at Spotify's authorize step (unregistered redirect URI) — if the owner was testing on the preview URL, that's a second, independent "connect does nothing" cause. Either add the preview callback to the dashboard or test Spotify on 127.0.0.1/prod domain only.

## The fix — AS IMPLEMENTED (2026-08-03)

The original four-item list was written against the container's swizzle theory. Step 0 retired item 1 and demoted item 3; the real defect (a silent, unactionable failure) was not on the list at all. What shipped:

1. ~~**Swizzle guard**~~ — **DROPPED, not deferred.** Falsified twice: the owner's adapter exposes `texture-component-swizzle`, and on the failing machine three never reaches a `createView` call at all (init dies earlier). Landing it would have been dead defensive code chasing a bug that does not exist here. Re-open only if a real Chrome ever rejects r185's descriptor.
2. **Visible, actionable renderer-failure state — NEW, and the actual fix.**
   - `src/render/renderer/diagnose.ts` — pure `diagnoseRendererFailure(probe)` → `{ kind, headline, detail, remedy[], retryWithWebGL }`, plus the impure `probeBackends()`. The probe uses a **throwaway** canvas, never `#stage`: a canvas handed to one context type can never yield another, so probing the live canvas would poison the WebGL2 retry we may be about to offer. `webgl2Available` is the decisive signal — `navigator.gpu` being present is explicitly NOT treated as capability, since that is exactly the trap that produced the silent failure.
   - `src/ui/components/BootError.tsx` + `.boot-error` styles — a `role="alert"` panel rendered in **every phase** (so the visitor learns before picking a source) and **outside `.chrome`** (so `useIdleFade`'s `opacity: 0` can never hide it — an error that fades out *is* the blank screen). Offers a one-click "Reload in WebGL2 mode" (`?gl=1`) when WebGL2 is still obtainable.
   - `main.tsx` now probes on failure and passes the diagnosis to `<App bootError>`.
3. **Frame-loop resilience** — `FrameLoop` wraps `onTick` in try/catch and keeps scheduling; failures report via `onTickError`. Pure `shouldAbandonRenderer(n, max)` + `MAX_CONSECUTIVE_FRAME_FAILURES = 3`. `RenderCore` counts consecutive failures (reset by any frame that completes) and calls `abandon('frame-errors')` at the threshold.
4. **WebGPU device-loss detection** — `RenderCore.watchDeviceLoss()` hooks `backend.device.lost` when `isWebGPU` (ignoring `reason === 'destroyed'`, which is our own dispose). Feeds the same `abandon()` path.
5. **Hooks are actually wired — a second real gap found en route.** `RenderCoreHooks.onError`/`onToast` existed but `main.tsx` never passed them, so *every* render-error report — including the pre-existing context-lost toast — went nowhere. Now wired, plus a new `onRendererAbandoned` that re-probes and publishes a diagnosis to the mounted `<App>` via a closure-holder (`publishRuntimeError`, same pattern as the existing `SceneBridge`). A renderer that dies mid-session now reaches the screen.
6. **Backend observable** — the app's marker moved to `data-antinode-engine` (`booting | webgpu | webgl2 | webgl2-recovered | error`); `e2e/helpers.ts`, `backend.spec.ts` and all five `docs/qa/checklist-*.md` updated. Confirmed live that three clobbers `data-engine` with `three.js r185 webgpu`.

### Deliberately NOT implemented — automatic in-place WebGL2 recovery

Original item 3's `recoverWithWebGL()` (un-`readonly` the renderer/canvas/`isWebGPU`, swap in a fresh canvas, rebuild post, re-init the scene, mutate `SceneContext.isWebGPU`) is **deferred to its own task**. Reasons: it is the largest and riskiest change in the list; it addresses a scenario now *disproven* as the owner's bug; and it cannot be exercised on this machine, so it would land as an unverified recovery path. The interim story is honest and verifiable: a device loss or repeated frame failure now stops the loop, marks `error`, and shows the panel with a **one-click "Reload in WebGL2 mode"** button — manual rather than automatic, but it works and it is visible. `webgl2-recovered` is reserved in the attribute's value set for whoever picks this up.

Also still queued (separate commit, may defer): after the Spotify OAuth round-trip the app reboots to the landing (`onboarding` phase) — the pre-connect source and visualizer state are gone, which reads as "connected and nothing happened." Restore the remembered source (`localStorage antinode:source` already exists) after `/callback` completes: jump straight into the signal-check for the remembered kind (skip for `display`, which can't restart without a user gesture — land on a "resume tab share" one-click panel instead). Note this is cosmetic, not the reported bug — Spotify itself was verified working end-to-end on prod (now-playing + palette correct).

## Verify — RESULTS (2026-08-03)

- **Unit suite green: 312 tests / 43 files** (was 302), typecheck + lint clean. New: `tests/render/diagnose.test.ts` (table test over every diagnosis branch, including "a present `navigator.gpu` is not a working backend") and `tests/render/frameLoopPolicy.test.ts`.
- **e2e green** — `backend.spec` (4) + `smoke` pass on chromium against `data-antinode-engine`; full chromium project re-run after the attribute change.
- **Degraded path verified in real Chrome** by simulating the owner's exact state at the API boundary (`getContext('webgl2'|'webgpu') → null` *and* `navigator.gpu.requestAdapter() → null`; `navigator.gpu` left present, as it was on the owner's machine):
  - panel renders on the landing with the `chrome://settings/system` remedy;
  - **still `opacity: 1` after 4 s**, past the idle fade;
  - **in the live phase `.chrome` is `opacity: 0` while `.boot-error` is `opacity: 1`** — visible exactly where everything else vanished. This is the blank-screen fix, demonstrated;
  - `data-antinode-engine="error"`;
  - **the Dismiss button works in the live phase** — with `.chrome` at `pointer-events: none`, `elementFromPoint` at the button's centre resolves to the button itself and the click removes the panel. (The panel overlays the source picker, and audio capture + Spotify still work without a renderer, so an un-closable dialog would have been its own bug. Dismissal is explicit-click only — nothing like the idle fade hiding it.)
- **Healthy path unchanged** in real Chrome: `data-antinode-engine="webgpu"`, no panel, standing wave renders (screenshot-verified).
- **Owner confirmed the remedy works:** enabling "Use graphics acceleration when available" made the app work on their machine. Root cause closed.
- **Not done / known-open:**
  - Waterfox + Safari smoke not re-run after the attribute change (nothing engine-specific changed, but it is unverified).
  - Probe caution: `createImageBitmap(#stage)` on a WebGPU canvas reports `nonBlackFrac: 0` even when the scene is visibly rendering. **Screenshots are ground truth; that readback is not.** It nearly produced a false regression report.
  - In the degraded state `announce()` still overwrites the canvas `aria-label` with "Signal locked — visualizing." while nothing is being visualized. The `role="alert"` panel does carry the real message, so this is misleading rather than silent.

## Side findings (logged, not part of this fix)

- **Prod CSP blocks the Cloudflare Web Analytics beacon** (`static.cloudflareinsights.com/beacon.min.js` violates `script-src 'self' blob:`). Analytics is silently dead on `antinode.ponderance.dev`. Decide: allow the host, or drop the beacon.
- **`getDisplayMedia({video:true})` trips a Permissions-Policy violation** on prod (`camera is not allowed in this document`) because the header sets `camera=()`. Capture still works — the video track is requested only for browser compatibility and stopped immediately — but the console noise is real. Consider whether `camera=(self)` or a different capture request shape is warranted.
- **Heritage is "definitely overpowered"** visually (owner) — look-dev note for a separate pass.
- Spotify connect from the `*.workers.dev` preview still cannot work (redirect URI unregistered). Not the owner's bug, but a trap for future preview testing.
