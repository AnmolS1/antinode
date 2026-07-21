/**
 * Internal types for the Spotify layer. The public cross-task contracts
 * (`NowPlaying`, `SpotifyStatus`) live in src/contracts/spotify.ts and are
 * frozen; these describe only this layer's private wiring and the subset of the
 * Spotify Web API JSON we actually read.
 */

/** Persisted OAuth token set (localStorage `antinode:sp`). */
export interface TokenSet {
  accessToken: string;
  /** Rotated on refresh; always keep the newest, never overwrite with undefined. */
  refreshToken: string;
  /** Absolute epoch-ms expiry (Date.now based). */
  expiresAt: number;
  scope: string;
}

/** Transient PKCE handshake state, kept between the authorize redirect and callback. */
export interface PendingAuth {
  verifier: string;
  state: string;
  createdAt: number;
}

/** The full shape stored under the single `antinode:sp` key. */
export interface StoredState {
  tokens?: TokenSet;
  pending?: PendingAuth;
}

/** Raw token-endpoint success payload (snake_case as Spotify returns it). */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  /** Omitted on some refreshes — retain the prior token when absent (rotation rule). */
  refresh_token?: string;
}

/** Why an auth/API call failed, mapped to `SpotifyStatus.reason`. */
export type SpotifyFailure = 'not-allowlisted' | 'expired' | 'network' | 'rate-limited';

/** Error thrown across the layer, carrying a classified, UI-mappable reason. */
export class SpotifyError extends Error {
  readonly reason: SpotifyFailure;
  /** Seconds to wait, present only for rate-limit (429 Retry-After) failures. */
  readonly retryAfter?: number;

  constructor(reason: SpotifyFailure, message: string, retryAfter?: number) {
    super(message);
    this.name = 'SpotifyError';
    this.reason = reason;
    if (retryAfter !== undefined) this.retryAfter = retryAfter;
  }
}

/** The minimal `GET /me/player` fields we consume. */
export interface PlayerState {
  is_playing: boolean;
  progress_ms: number | null;
  /** 'track' | 'episode' | 'ad' | 'unknown' — we only render 'track'. */
  currently_playing_type?: string;
  item: TrackItem | null;
}

export interface TrackItem {
  id: string;
  name: string;
  duration_ms: number;
  uri?: string;
  type?: string;
  artists: Array<{ name: string }>;
  album: {
    name: string;
    images: Array<{ url: string; width: number | null; height: number | null }>;
  };
  external_urls?: { spotify?: string };
}
