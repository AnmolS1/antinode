/**
 * DEV-ONLY fixtures for building the shell without live data:
 * `NowPlaying` snapshots for the Spotify card's states, and a canned device list
 * for the input/loopback device picker. T08 replaces the Spotify internals.
 */
import type { NowPlaying, SpotifyStatus } from '../../contracts/spotify';

/** A connected now-playing snapshot. Metadata must render exactly as provided. */
export const NOW_PLAYING_FIXTURE: NowPlaying = {
  trackId: '3n3Ppam7vgaVa1iaRUc9Lp',
  title: 'Mr. Brightside',
  artists: ['The Killers'],
  album: 'Hot Fuss',
  artUrl: null, // no external network in dev; the card renders an art placeholder box.
  trackUrl: 'https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp',
  durationMs: 222_075,
  progressMs: 61_000,
  isPlaying: true,
  fetchedAt: 0,
};

/** The Spotify integration states the card must handle (T08 owns the real transitions). */
export const SPOTIFY_STATES: Record<'disconnected' | 'connected' | 'notAllowlisted', SpotifyStatus> =
  {
    disconnected: { state: 'disconnected' },
    connected: { state: 'connected' },
    notAllowlisted: { state: 'error', reason: 'not-allowlisted' },
  };

/** Palette swatches (art -> scene tint). Shown as mono-labeled chips under the card. */
export const PALETTE_FIXTURE: string[] = ['#2FBF71', '#0E1A24', '#E9ECE7'];

export interface DeviceFixture {
  deviceId: string;
  label: string;
}

/** Canned enumerated input devices; loopback devices are flagged by name heuristic. */
export const DEVICE_FIXTURES: DeviceFixture[] = [
  { deviceId: 'default', label: 'Default — MacBook Pro Microphone' },
  { deviceId: 'blackhole-2ch', label: 'BlackHole 2ch' },
  { deviceId: 'usb-audio', label: 'Scarlett Solo USB' },
  { deviceId: 'vb-cable', label: 'CABLE Output (VB-Audio Virtual Cable)' },
];
