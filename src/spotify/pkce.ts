/**
 * PKCE (RFC 7636, S256) primitives built on Web Crypto — no dependencies, no
 * backend. Spotify's token endpoint is CORS-enabled, so the whole Authorization
 * Code + PKCE flow runs client-side with just these helpers plus `fetch`.
 */

const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/** Cryptographically-random string from the RFC 3986 unreserved set. */
export function randomString(length = 64): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += UNRESERVED[b % UNRESERVED.length];
  return out;
}

/** A code verifier: 43–128 chars of unreserved characters (we use 64). */
export function generateCodeVerifier(): string {
  return randomString(64);
}

/** An anti-CSRF `state` value round-tripped through the authorize redirect. */
export function generateState(): string {
  return randomString(32);
}

/** base64url with no padding, per PKCE. */
function base64UrlEncode(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (const b of view) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** S256 code challenge = base64url(SHA-256(verifier)). */
export async function codeChallengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64UrlEncode(digest);
}
