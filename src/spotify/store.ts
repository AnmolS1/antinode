/**
 * Token + handshake persistence. Everything lives under the single `antinode:sp`
 * localStorage key (acceptance: storage only there) — access/refresh/expiry plus
 * the transient PKCE verifier+state between the authorize redirect and callback.
 *
 * Refresh-token rotation rule (the classic logout bug): always persist the newest
 * refresh token, but when a refresh response omits one, *retain* the existing.
 */
import { REFRESH_SKEW_MS, STORAGE_KEY } from './config';
import type { PendingAuth, StoredState, TokenSet } from './types';

function read(): StoredState {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as StoredState;
  } catch {
    return {};
  }
}

function write(state: StoredState): void {
  try {
    if (!state.tokens && !state.pending) {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
      return;
    }
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode / storage disabled — best-effort. */
  }
}

export function loadTokens(): TokenSet | null {
  return read().tokens ?? null;
}

/**
 * Save a token set, honoring rotation: `refreshToken` here should already be the
 * effective one (caller falls back to the prior token when the response omits it).
 */
export function saveTokens(tokens: TokenSet): void {
  const state = read();
  state.tokens = tokens;
  write(state);
}

/** Compute the effective refresh token: prefer the fresh one, else keep the old. */
export function rotateRefreshToken(next: string | undefined, previous: string): string {
  return next && next.length > 0 ? next : previous;
}

export function loadPending(): PendingAuth | null {
  return read().pending ?? null;
}

export function savePending(pending: PendingAuth): void {
  const state = read();
  state.pending = pending;
  write(state);
}

export function clearPending(): void {
  const state = read();
  delete state.pending;
  write(state);
}

/** Wipe everything — disconnect, or an unrecoverable `invalid_grant`. */
export function clearAll(): void {
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** True when the access token is missing or within the refresh skew of expiry. */
export function isExpired(tokens: TokenSet, now: number = Date.now()): boolean {
  return now >= tokens.expiresAt - REFRESH_SKEW_MS;
}
