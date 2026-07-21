/**
 * Public surface of the Spotify layer (T08). Import-time side-effect-free, so the
 * gate can `if (FLAG && clientId) import('./spotify')` and have it tree-shake out
 * entirely when the feature is dark. See src/spotify/README.md for the env var.
 */
export { SpotifyController } from './controller';
export type { ControllerOptions, SpotifyView } from './controller';
export { useSpotify } from './useSpotify';
export type { UseSpotify } from './useSpotify';
export { isConfigured, clientId, SCOPES, PRIVACY_URL, TERMS_URL, REVOKE_URL } from './config';
export { proceduralBeat, barPhase, DEFAULT_BPM } from './procedural';
export { extractPalette, quantize } from './palette';
export { DriftClock } from './clock';
export { SpotifyError } from './types';
export type { NowPlaying, SpotifyStatus } from '../contracts/spotify';
