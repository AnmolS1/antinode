/**
 * Static configuration for the Spotify layer. No secrets: PKCE means the only
 * credential is the *public* client ID, read from an env var so it is never
 * hardcoded. All endpoints and the exact minimum scopes live here.
 */

/** The single localStorage key the whole layer uses (acceptance: storage only here). */
export const STORAGE_KEY = 'antinode:sp';

/**
 * Exact minimum scopes (03-legal + 00-overview). Do not widen: dev-mode apps are
 * held to least privilege and these two cover the entire now-playing surface.
 */
export const SCOPES = 'user-read-currently-playing user-read-playback-state';

export const AUTHORIZE_ENDPOINT = 'https://accounts.spotify.com/authorize';
export const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
export const PLAYER_ENDPOINT = 'https://api.spotify.com/v1/me/player';

/** Refresh this many ms before the access token actually expires. */
export const REFRESH_SKEW_MS = 60_000;

/** The Spotify page a user visits to revoke this app (we cannot revoke server-side). */
export const REVOKE_URL = 'https://www.spotify.com/account/apps/';

/** Compliance links rendered on the connect surface *before* auth (Developer Policy). */
export const PRIVACY_URL = 'https://ponderance.dev/privacy';
export const TERMS_URL = 'https://ponderance.dev/terms';

/**
 * The public client ID, from the environment. Empty string when unset — callers
 * treat that as "Spotify unavailable" so the app runs with the feature dark.
 */
export function clientId(): string {
  return import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? '';
}

/** True when a client ID is configured; the flag/gate uses this to stay dark otherwise. */
export function isConfigured(): boolean {
  return clientId().length > 0;
}

/**
 * The redirect URI for the current origin. Must be byte-identical to a URI
 * registered on the dashboard: the prod HTTPS callback or the explicit loopback
 * (never `localhost` — banned since 2025-11-27).
 */
export function redirectUri(origin: string): string {
  return `${origin}/callback`;
}
