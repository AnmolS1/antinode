import { beforeEach, describe, expect, it } from 'vitest';

import { STORAGE_KEY } from '../../src/spotify/config';
import {
  clearAll,
  clearPending,
  isExpired,
  loadPending,
  loadTokens,
  rotateRefreshToken,
  savePending,
  saveTokens,
} from '../../src/spotify/store';
import type { TokenSet } from '../../src/spotify/types';

const TOKENS: TokenSet = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: 10_000_000,
  scope: 'user-read-currently-playing user-read-playback-state',
};

beforeEach(() => {
  localStorage.clear();
});

describe('token store', () => {
  it('round-trips tokens under the single antinode:sp key', () => {
    saveTokens(TOKENS);
    expect(loadTokens()).toEqual(TOKENS);
    expect(Object.keys(localStorage)).toEqual([STORAGE_KEY]);
  });

  it('keeps the PKCE handshake under the same key (not a separate one)', () => {
    savePending({ verifier: 'v', state: 's', createdAt: 1 });
    expect(loadPending()?.state).toBe('s');
    expect(Object.keys(localStorage)).toEqual([STORAGE_KEY]);
    clearPending();
    expect(loadPending()).toBeNull();
  });

  it('rotation keeps the newest refresh token but retains the prior when omitted', () => {
    expect(rotateRefreshToken('refresh-2', 'refresh-1')).toBe('refresh-2');
    expect(rotateRefreshToken(undefined, 'refresh-1')).toBe('refresh-1');
    expect(rotateRefreshToken('', 'refresh-1')).toBe('refresh-1');
  });

  it('clearAll wipes everything', () => {
    saveTokens(TOKENS);
    savePending({ verifier: 'v', state: 's', createdAt: 1 });
    clearAll();
    expect(loadTokens()).toBeNull();
    expect(loadPending()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('isExpired accounts for the 60 s refresh skew', () => {
    expect(isExpired(TOKENS, 9_000_000)).toBe(false);
    expect(isExpired(TOKENS, TOKENS.expiresAt - 30_000)).toBe(true); // within skew
    expect(isExpired(TOKENS, TOKENS.expiresAt + 1)).toBe(true);
  });

  it('survives corrupt storage without throwing', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadTokens()).toBeNull();
    expect(loadPending()).toBeNull();
  });
});
