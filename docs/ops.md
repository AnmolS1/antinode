# Antinode — Ops & Deploy Runbook

Static SPA (Vite + React) served from a **Cloudflare Workers static-assets** deployment on
the same Cloudflare account/zone as `ponderance.dev`, at **`antinode.ponderance.dev`**.
No backend, no KV/D1/R2, no analytics, no server code. `npm run build` → upload `dist/`.

- Deploy mechanism: **Workers with static assets** (assets-only Worker — no `main`). Chosen over
  Pages to match ponderance's Workers-based hosting and because Workers static assets support a
  native `_headers` file, so all edge headers ship from the repo with zero server code.
- Config: [`wrangler.jsonc`](../wrangler.jsonc) · Headers: [`public/_headers`](../public/_headers)
  (Vite copies it to `dist/_headers`) · CI: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)

---

## 0. One-time owner setup (Cloudflare dashboard + repo)

These are **owner console actions** — not automated by CI (deliberately: keeps the deploy token
off zone-level permissions, and DNS/domain binding persists across deploys).

### 0a. Bootstrap the Worker (first deploy only)

`wrangler versions upload` (used for PR previews) requires the Worker to already exist. Create it
once from a clean local checkout:

```sh
npm ci && npm run build
CLOUDFLARE_ACCOUNT_ID=<account-id> CLOUDFLARE_API_TOKEN=<token> \
  npx wrangler@4.104.0 deploy
```

This creates the `antinode` Worker and uploads `dist/`. After this, CI handles everything.

### 0b. DNS + custom domain (in the ponderance.dev zone)

Attach the hostname as a **Custom Domain** on the Worker (this auto-creates the `CNAME` in the
`ponderance.dev` zone **and** provisions the edge cert — no manual DNS record needed):

1. Cloudflare dashboard → **Workers & Pages → `antinode` → Settings → Domains & Routes → Add → Custom Domain**.
2. Enter `antinode.ponderance.dev` → **Add domain**. Cloudflare writes a proxied `CNAME`
   `antinode` → `antinode.<account>.workers.dev` in the `ponderance.dev` zone and issues the TLS cert.
3. Wait for status **Active** (cert validation, ~1–2 min). Verify: `curl -I https://antinode.ponderance.dev`.

> Routes are intentionally **absent** from `wrangler.jsonc`. The Custom Domain binding lives in the
> dashboard and persists, so `wrangler deploy` only uploads code+assets (no zone perms needed) and
> a preview upload can never hijack the prod domain. Do **not** add `routes` to the config.

### 0c. Repo secrets & variables (GitHub → Settings → Secrets and variables → Actions)

| Kind | Name | Value | Notes |
|---|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | scoped API token (see 0d) | wrangler auth. Absent → deploy jobs skip (config-only). |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID | from dashboard URL / `wrangler whoami`. |
| **Variable** | `VITE_SPOTIFY_CLIENT_ID` | Spotify app client ID | **Variable, not Secret** — it's public (PKCE, no client secret). Vite inlines `VITE_*` at build. |

### 0d. Create the scoped `CLOUDFLARE_API_TOKEN`

Dashboard → **My Profile → API Tokens → Create Token → Create Custom Token**:

- **Account** → `Workers Scripts` → **Edit** (covers `deploy` and `versions upload`).
- Account Resources → **Include → this account only**.
- No **Zone** permissions needed (the custom domain is dashboard-managed; CI never touches DNS/routes).
- Create, copy once, paste into the `CLOUDFLARE_API_TOKEN` repo secret.

If you later manage the custom domain via wrangler instead of the dashboard, add
`Zone → Workers Routes → Edit` + `Zone → DNS → Edit` on the `ponderance.dev` zone — **not
recommended** (broader blast radius; the dashboard binding is simpler and safer).

### 0e. workers.dev subdomain (previews)

PR preview URLs are `*-antinode.<subdomain>.workers.dev`. Ensure the account's workers.dev
subdomain is enabled (dashboard → **Workers & Pages → Subdomain**) — required once for
`versions upload` preview URLs to resolve. `preview_urls: true` in `wrangler.jsonc` opts the Worker in.

### 0f. Branch protection — "prod deploy only after CI green"

`deploy.yml`'s `deploy-prod` job fires on every push to `main` and re-runs its own build, but it
does **not** gate on `ci.yml` (lint/unit/e2e). To guarantee production only ever ships CI-green
commits, protect `main`: GitHub → **Settings → Branches → Add branch ruleset** for `main` →
require a pull request + **require status checks to pass** → select the `ci.yml` jobs. Merged
commits are then already CI-green before `deploy-prod` runs.

---

## 1. Deploy pipelines (`.github/workflows/deploy.yml`)

| Trigger | Job | Command | Result |
|---|---|---|---|
| Pull request | `preview` | `wrangler versions upload` | Ephemeral per-commit preview URL, commented on the PR. Never touches prod. |
| Push to `main` | `deploy-prod` | `wrangler deploy` | Live at `antinode.ponderance.dev`. |

- Both are gated by a **`preflight`** job: if `CLOUDFLARE_API_TOKEN` is unset, deploy jobs **skip
  cleanly** (config-only mode) so CI never hard-fails before the token exists.
- The `build` job re-runs `tsc --noEmit && vite build` (with `VITE_SPOTIFY_CLIENT_ID` from the repo
  variable) so a broken tree never deploys. The full lint/unit/e2e matrix runs in parallel in `ci.yml`.
- `cloudflare/wrangler-action` is pinned to a release commit SHA (supply-chain hardening).

### Manual / orchestrator commands

Run from repo root after `npm ci && npm run build`, with `CLOUDFLARE_API_TOKEN` +
`CLOUDFLARE_ACCOUNT_ID` in the environment:

```sh
# PREVIEW deploy (unique URL, does NOT affect production) — auth: CLOUDFLARE_API_TOKEN (+ ACCOUNT_ID)
npx wrangler@4.104.0 versions upload
#   → prints "Version Preview URL: https://<hash>-antinode.<subdomain>.workers.dev"

# PRODUCTION deploy — auth: same
npx wrangler@4.104.0 deploy
```

## 2. Rollback (one-liner)

Every `wrangler deploy` / `versions upload` creates an immutable version. To revert production to
the previous good version without rebuilding:

```sh
npx wrangler@4.104.0 rollback            # interactive: pick the previous version
# or target a specific version id:
npx wrangler@4.104.0 rollback <version-id>
```

List versions to find the id: `npx wrangler@4.104.0 versions list`.
**Rehearse this once** (deploy → rollback → confirm prod reverted) as part of launch acceptance.

## 3. Post-deploy smoke

`deploy.yml` runs a Playwright chromium smoke against the deploy URL via `PLAYWRIGHT_BASE_URL`
(boots, WebGL2 fallback path, CSP-violation listener clean, `/callback` serves the SPA). It is a
**hard gate** (a failing smoke fails the deploy job).

`playwright.config.ts` (owned by T10-qa) reads `baseURL: process.env.PLAYWRIGHT_BASE_URL ??
'http://127.0.0.1:5173'` and auto-omits its local `webServer` when `PLAYWRIGHT_BASE_URL` names a
non-loopback origin — so the same specs run against the live preview/prod URL without booting a
dev server or testing the wrong target.

> **Spec scope (why not `--project=chromium` alone):** on GPU-less CI runners WebGL2 resolves to
> software SwiftShader, where phosphor's shader compile can take ~85s on the first scene switch
> (`render.spec.ts`). The smoke is therefore scoped to the light specs —
> `smoke.spec.ts` (boot), `backend.spec.ts`, `determinism.spec.ts` — which cover the smoke goals
> without that cost. Keep `render.spec.ts` for the full T10 matrix, not the deploy gate.

## 4. Edge headers (`public/_headers` → `dist/_headers`)

Verify after deploy — evidence for launch acceptance:

```sh
# HTML — expect Cache-Control: no-store + all security headers:
curl -sSI https://antinode.ponderance.dev
# A real content-hashed asset — expect Cache-Control: public, max-age=31536000, immutable.
# Use an actual filename from dist/assets/ (e.g. three-<hash>.js); a bare /assets/ path
# hits the SPA fallback and returns index.html with no-store, NOT the immutable rule:
ASSET=$(basename "$(ls dist/assets/three-*.js | head -1)")
curl -sSI "https://antinode.ponderance.dev/assets/$ASSET"
```

Expected on the HTML response:

- `Content-Security-Policy: default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.spotify.com https://accounts.spotify.com; img-src 'self' data: https://i.scdn.co https://*.scdn.co; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; object-src 'none'; form-action 'self'`
- `X-Content-Type-Options: nosniff` · `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: microphone=(self), display-capture=(self), midi=(self), …=()`
- `Cache-Control: no-store` (HTML) / `public, max-age=31536000, immutable` (`/assets/*`)

**Load-bearing CSP notes (do not "tidy" these away):**

- `script-src` includes **`blob:`** because `realtime-bpm-analyzer` loads its AudioWorklet via
  `URL.createObjectURL(blob) → audioWorklet.addModule(blobUrl)`, and AudioWorklet module loads are
  governed by `script-src` in Chromium. Remove `blob:` and BPM detection dies silently. It does
  **not** allow inline script (no `'unsafe-inline'` on `script-src`).
- `style-src` needs **`'unsafe-inline'`** because Tweakpane 4 injects its stylesheet via a runtime
  `<style>` element and React sets `style=""` attributes.
- **No COOP/COEP** — deliberate. We don't use `SharedArrayBuffer`, and COEP would force `CORP` on
  cross-origin Spotify album art (`i.scdn.co`). (The `resistFingerprinting` timer-precision note in
  T10 stands regardless.)
- `_headers` rules **combine** when multiple match — the `! Cache-Control` detach in the `/assets/*`
  block strips the inherited `no-store` before setting `immutable`. Keep `/*` above `/assets/*`.
- **CSP report-only trial:** there is no report endpoint (fully static, no backend), so "report-only"
  is a manual toggle: temporarily rename the header to `Content-Security-Policy-Report-Only` in
  `public/_headers`, deploy, watch the browser console for violations across the 4 browsers, then
  switch back to enforce. Ship enforcing by default.

## 5. Local dev — loopback only

```sh
npm run dev      # serves http://127.0.0.1:5173  (Vite server.host is pinned to 127.0.0.1)
```

Use **`http://127.0.0.1:5173`**, never `http://localhost:5173`. Spotify banned the `localhost`
alias for redirect URIs (enforced 2025-11-27); explicit loopback `127.0.0.1` is still allowed for
dev. The Spotify dashboard dev redirect URI must be exactly `http://127.0.0.1:5173/callback`.
`vite.config.ts` pins `server.host: '127.0.0.1'` (also required so Playwright's IPv4 probe matches).

## 6. Launch runbook (executed with T12)

1. **T10 go-verdict** linked and green.
2. **DNS live + cert validated** — `curl -I https://antinode.ponderance.dev` returns `200` with a valid cert (§0b).
3. **Spotify dashboard:** app name **Antinode**; prod redirect URI `https://antinode.ponderance.dev/callback`
   (+ dev `http://127.0.0.1:5173/callback`); allowlist filled (5 seats); owner account has Premium active; PKCE only (no client secret in use).
4. **Deploy prod** (`main` push or manual `wrangler deploy`), then **run smoke** + the header `curl -I` checks (§3, §4).
5. **Hand to T12** — registry flip (`status: 'live'` in ponderance `legal-services.ts`) + site content; coordinate same-day.
6. **Post-launch watch:** manual error-console pass on the 4 browsers (Chrome, Firefox, Waterfox, Safari); Spotify 429 sanity with 2 concurrent seats.

## 7. Bundle notes

`vite.config.ts` splits three.js into its own long-cached chunk (`manualChunks`): the app chunk
dropped from **1,328 kB → 453 kB** (gzip 369 → 129 kB); `three` is a separate **873 kB** (gzip
239 kB) chunk that changes rarely and caches for a year. The `>500 kB` warning persists for the
three chunk itself — expected (that's the library); do not silence it by raising the limit.
