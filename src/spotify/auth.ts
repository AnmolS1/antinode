/**
 * Authorization Code + PKCE, fully client-side. Begins the redirect, completes
 * the exchange on `/callback`, and refreshes access tokens with rotation — all
 * against Spotify's CORS-enabled token endpoint, no backend, no client secret.
 *
 * Error classification (mapped to `SpotifyStatus.reason`):
 *   403 at authorize/API .......... not-allowlisted (5-seat dev cap)
 *   invalid_grant / 401 on refresh  expired (6-month refresh rule → wipe + re-auth)
 *   429 ........................... rate-limited (Retry-After honored by the poller)
 *   fetch throw / offline ......... network
 */
import {
  AUTHORIZE_ENDPOINT,
  SCOPES,
  TOKEN_ENDPOINT,
  clientId,
  redirectUri,
} from './config';
import { codeChallengeS256, generateCodeVerifier, generateState } from './pkce';
import {
  clearAll,
  clearPending,
  loadPending,
  loadTokens,
  rotateRefreshToken,
  saveTokens,
} from './store';
import { SpotifyError } from './types';
import type { TokenResponse, TokenSet } from './types';

/** DI seam so tests never touch the network or the address bar. */
export interface AuthEnv {
  fetch: typeof fetch;
  origin: string;
  now: () => number;
  /** Persist `pending` before navigating away; injected for testability. */
  savePending: (verifier: string, state: string, at: number) => void;
  /** Navigate the browser to the authorize URL. */
  redirect: (url: string) => void;
}

function tokenSetFrom(res: TokenResponse, now: number, previousRefresh: string): TokenSet {
  return {
    accessToken: res.access_token,
    refreshToken: rotateRefreshToken(res.refresh_token, previousRefresh),
    expiresAt: now + res.expires_in * 1000,
    scope: res.scope,
  };
}

/** Turn a token-endpoint error body / HTTP status into a classified SpotifyError. */
function classifyTokenError(status: number, body: unknown): SpotifyError {
  const err =
    typeof body === 'object' && body !== null && 'error' in body
      ? String((body as { error: unknown }).error)
      : '';
  if (err === 'invalid_grant') {
    return new SpotifyError('expired', 'Refresh token rejected (invalid_grant).');
  }
  if (status === 403) return new SpotifyError('not-allowlisted', 'Account not on the allowlist.');
  if (status === 429) return new SpotifyError('rate-limited', 'Rate limited at the token endpoint.');
  return new SpotifyError('network', `Token endpoint returned ${String(status)}: ${err}`);
}

/** Build the authorize URL, persist the PKCE handshake, and hand back the URL. */
export async function buildAuthorizeUrl(env: AuthEnv): Promise<string> {
  const verifier = generateCodeVerifier();
  const state = generateState();
  const challenge = await codeChallengeS256(verifier);
  env.savePending(verifier, state, env.now());

  const params = new URLSearchParams({
    client_id: clientId(),
    response_type: 'code',
    redirect_uri: redirectUri(env.origin),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SCOPES,
  });
  return `${AUTHORIZE_ENDPOINT}?${params.toString()}`;
}

/** Kick off the login by redirecting the browser to the authorize URL. */
export async function beginAuth(env: AuthEnv): Promise<void> {
  const url = await buildAuthorizeUrl(env);
  env.redirect(url);
}

async function postToken(env: AuthEnv, body: URLSearchParams): Promise<TokenResponse> {
  let res: Response;
  try {
    res = await env.fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch {
    throw new SpotifyError('network', 'Network error contacting the token endpoint.');
  }
  if (!res.ok) {
    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      /* non-JSON error body */
    }
    throw classifyTokenError(res.status, parsed);
  }
  return (await res.json()) as TokenResponse;
}

/**
 * Complete the `/callback` exchange: verify state, swap the code for tokens,
 * persist them, and clear the handshake. Returns the query string the caller
 * should strip from the URL. Throws SpotifyError on any failure.
 */
export async function exchangeCode(
  env: AuthEnv,
  params: { code: string | null; state: string | null; error: string | null },
): Promise<TokenSet> {
  const pending = loadPending();
  if (params.error === 'access_denied') {
    clearPending();
    throw new SpotifyError('expired', 'Authorization was cancelled.');
  }
  if (params.error) {
    clearPending();
    // Spotify returns error=... on the redirect; 403-class shows as not-allowlisted upstream.
    throw new SpotifyError('not-allowlisted', `Authorize failed: ${params.error}`);
  }
  if (!pending || !params.code || !params.state) {
    clearPending();
    throw new SpotifyError('network', 'Missing PKCE handshake or callback parameters.');
  }
  if (params.state !== pending.state) {
    clearPending();
    throw new SpotifyError('network', 'State mismatch — possible CSRF; aborting.');
  }

  const res = await postToken(
    env,
    new URLSearchParams({
      client_id: clientId(),
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: redirectUri(env.origin),
      code_verifier: pending.verifier,
    }),
  );
  const tokens = tokenSetFrom(res, env.now(), res.refresh_token ?? '');
  saveTokens(tokens);
  clearPending();
  return tokens;
}

/**
 * Refresh the access token using the stored refresh token (rotation applied).
 * On `invalid_grant` (6-month expiry) wipes the store and rethrows `expired`.
 */
export async function refreshTokens(env: AuthEnv): Promise<TokenSet> {
  const current = loadTokens();
  if (!current) throw new SpotifyError('expired', 'No stored tokens to refresh.');
  try {
    const res = await postToken(
      env,
      new URLSearchParams({
        client_id: clientId(),
        grant_type: 'refresh_token',
        refresh_token: current.refreshToken,
      }),
    );
    const tokens = tokenSetFrom(res, env.now(), current.refreshToken);
    saveTokens(tokens);
    return tokens;
  } catch (e) {
    if (e instanceof SpotifyError && e.reason === 'expired') {
      clearAll();
    }
    throw e;
  }
}
