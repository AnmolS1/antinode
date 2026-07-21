# T11 — Deploy, headers, DNS, launch mechanics

**Role:** infra engineer. **Depends on:** T10 go-verdict for production; the **preview slice may start right after T01** (early preview URLs help every wave).
**Owns:** `wrangler.jsonc` (or equivalent), `.github/workflows/deploy*`, `docs/ops.md`. **Reads:** 00-overview (hosting decision), ponderance conventions (same CF account/zone; site repo's CI gates as prior art).

## Shape

Static assets only — **no server code, no KV/D1/R2, no analytics**. Cloudflare Workers-with-assets (consistent with ponderance's wrangler setup) or Pages if simpler; either way the deliverable is: `vite build` → deploy `dist/` → `https://antinode.ponderance.dev`.

- DNS: `antinode` CNAME/route in the ponderance.dev zone (owner action listed in 00-overview checklist; document exact console steps in docs/ops.md).
- Preview deploys per PR (workers versions / pages previews) with URL commented on the PR; production deploy on `main` after CI green. Rollback = redeploy previous version (document the one-liner).
- **Loopback dev note:** local dev stays `http://127.0.0.1:5173` (NOT `localhost` — Spotify banned the alias; Vite must bind/print 127.0.0.1; set `server.host`).

## Headers (set at the edge; mirror ponderance's CI-gate philosophy)

- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'(only if tokens require — prefer none); connect-src 'self' https://api.spotify.com https://accounts.spotify.com; img-src 'self' data: https://i.scdn.co https://*.scdn.co; media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'`. No inline scripts (site convention). Adjust from real console errors, never to `*`.
- **No COOP/COEP** (would demand CORP on Spotify art; we don't need SharedArrayBuffer). Documented as a deliberate trade (resistFingerprinting timer-precision note in T10 stands regardless).
- `Permissions-Policy`: explicitly allow self `microphone`, `display-capture`, `midi`; deny the rest. Cache: hashed assets immutable 1y; HTML no-store. `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

## CI/CD

Extend T01's workflow: on main → build (env `VITE_SPOTIFY_CLIENT_ID` from repo variable — it's public, still keep it env-driven) → deploy → **post-deploy smoke** (Playwright against prod URL: boots, WebGL2 fallback path works, CSP violation listener clean, /callback route serves the SPA). Wrangler auth via `CLOUDFLARE_API_TOKEN` secret (scoped token, document creation).

## Launch runbook (docs/ops.md — executed at launch with T12)

1. T10 go-verdict linked. 2. DNS live + cert validated. 3. Spotify dashboard: prod redirect URI confirmed, app name **Antinode**, allowlist filled (5 seats), owner Premium active. 4. Deploy prod, run smoke. 5. Hand to T12 (registry flip + site content) — coordinate same-day. 6. Post-launch watch: manual error-console pass on the 4 browsers, Spotify 429 sanity with 2 concurrent seats.

## Acceptance

- [ ] PR preview + prod pipelines demonstrably work (a no-op change deploys end to end); rollback rehearsed once.
- [ ] Prod URL serves with all headers (curl -I evidence in docs/ops.md); CSP report-only trial period shows zero violations before enforce.
- [ ] Smoke suite green against prod; `http://127.0.0.1:5173` dev flow documented and working.
- [ ] docs/ops.md complete (DNS steps, secrets/tokens, rollback, runbook). 04-handoff updated.
