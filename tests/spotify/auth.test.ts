import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildAuthorizeUrl, exchangeCode, refreshTokens } from '../../src/spotify/auth';
import type { AuthEnv } from '../../src/spotify/auth';
import { loadPending, loadTokens, savePending, saveTokens } from '../../src/spotify/store';
import { SpotifyError } from '../../src/spotify/types';
import type { TokenSet } from '../../src/spotify/types';

const NOW = 1_000_000;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeEnv(fetchImpl: typeof fetch): AuthEnv {
  return {
    fetch: fetchImpl,
    origin: 'http://127.0.0.1:5173',
    now: () => NOW,
    savePending: (verifier, state, at) => savePending({ verifier, state, createdAt: at }),
    redirect: () => {},
  };
}

const TOKEN_BODY = {
  access_token: 'access-1',
  token_type: 'Bearer',
  expires_in: 3600,
  scope: 'user-read-currently-playing user-read-playback-state',
  refresh_token: 'refresh-1',
};

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('buildAuthorizeUrl', () => {
  it('includes PKCE + exact scopes + loopback redirect and persists the handshake', async () => {
    vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', 'client-abc');
    const url = new URL(await buildAuthorizeUrl(makeEnv(vi.fn())));
    expect(url.origin + url.pathname).toBe('https://accounts.spotify.com/authorize');
    const p = url.searchParams;
    expect(p.get('client_id')).toBe('client-abc');
    expect(p.get('response_type')).toBe('code');
    expect(p.get('redirect_uri')).toBe('http://127.0.0.1:5173/callback');
    expect(p.get('code_challenge_method')).toBe('S256');
    expect(p.get('code_challenge')).toBeTruthy();
    expect(p.get('scope')).toBe('user-read-currently-playing user-read-playback-state');
    const pending = loadPending();
    expect(pending?.state).toBe(p.get('state'));
    expect(pending?.verifier).toBeTruthy();
  });
});

describe('exchangeCode', () => {
  it('verifies state, swaps the code, persists tokens, clears the handshake', async () => {
    savePending({ verifier: 'ver', state: 'st', createdAt: NOW });
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(TOKEN_BODY));
    const tokens = await exchangeCode(makeEnv(fetchMock as unknown as typeof fetch), {
      code: 'the-code',
      state: 'st',
      error: null,
    });
    expect(tokens.accessToken).toBe('access-1');
    expect(tokens.refreshToken).toBe('refresh-1');
    expect(tokens.expiresAt).toBe(NOW + 3600 * 1000);
    expect(loadTokens()?.accessToken).toBe('access-1');
    expect(loadPending()).toBeNull();
  });

  it('rejects a state mismatch (CSRF) and clears the handshake', async () => {
    savePending({ verifier: 'ver', state: 'expected', createdAt: NOW });
    await expect(
      exchangeCode(makeEnv(vi.fn()), { code: 'c', state: 'attacker', error: null }),
    ).rejects.toMatchObject({ reason: 'network' });
    expect(loadPending()).toBeNull();
  });

  it('maps an authorize error param to not-allowlisted', async () => {
    savePending({ verifier: 'ver', state: 'st', createdAt: NOW });
    await expect(
      exchangeCode(makeEnv(vi.fn()), { code: null, state: null, error: 'access_denied' }),
    ).rejects.toBeInstanceOf(SpotifyError);
  });
});

describe('refreshTokens', () => {
  const stored: TokenSet = {
    accessToken: 'old',
    refreshToken: 'refresh-old',
    expiresAt: NOW,
    scope: 'user-read-currently-playing user-read-playback-state',
  };

  it('rotates the refresh token when a new one is returned', async () => {
    saveTokens(stored);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ...TOKEN_BODY, refresh_token: 'refresh-new' }));
    const t = await refreshTokens(makeEnv(fetchMock as unknown as typeof fetch));
    expect(t.refreshToken).toBe('refresh-new');
    expect(loadTokens()?.refreshToken).toBe('refresh-new');
  });

  it('retains the prior refresh token when the response omits one', async () => {
    saveTokens(stored);
    const body: Record<string, unknown> = { ...TOKEN_BODY };
    delete body['refresh_token'];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
    const t = await refreshTokens(makeEnv(fetchMock as unknown as typeof fetch));
    expect(t.refreshToken).toBe('refresh-old');
  });

  it('wipes the store and reports expired on invalid_grant (6-month rule)', async () => {
    saveTokens(stored);
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: 'invalid_grant' }, 400));
    await expect(
      refreshTokens(makeEnv(fetchMock as unknown as typeof fetch)),
    ).rejects.toMatchObject({ reason: 'expired' });
    expect(loadTokens()).toBeNull();
  });

  it('classifies a 403 as not-allowlisted and a thrown fetch as network', async () => {
    saveTokens(stored);
    await expect(
      refreshTokens(makeEnv(vi.fn().mockResolvedValue(new Response(null, { status: 403 })) as unknown as typeof fetch)),
    ).rejects.toMatchObject({ reason: 'not-allowlisted' });

    saveTokens(stored);
    await expect(
      refreshTokens(makeEnv(vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch)),
    ).rejects.toMatchObject({ reason: 'network' });
  });
});
