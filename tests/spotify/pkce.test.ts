import { describe, expect, it } from 'vitest';

import {
  codeChallengeS256,
  generateCodeVerifier,
  generateState,
  randomString,
} from '../../src/spotify/pkce';

describe('PKCE primitives', () => {
  it('derives the RFC 7636 Appendix B S256 challenge from the known verifier', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await codeChallengeS256(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('emits base64url with no padding or +/ characters', async () => {
    const challenge = await codeChallengeS256(generateCodeVerifier());
    expect(challenge).not.toMatch(/[+/=]/);
  });

  it('produces verifiers of legal length from the unreserved set', () => {
    const v = generateCodeVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
    expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it('generates distinct random strings/states', () => {
    expect(randomString(16)).not.toBe(randomString(16));
    expect(generateState()).not.toBe(generateState());
  });
});
