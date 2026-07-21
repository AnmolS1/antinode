/**
 * A snapshot of the user's currently-playing Spotify track, produced by the
 * poller (T08). Includes the `trackUrl` link-back that Spotify requires we
 * display, and `fetchedAt` so the UI can interpolate `progressMs` smoothly
 * between polls.
 */
export interface NowPlaying {
  /** Spotify track id. */
  trackId: string;
  /** Track title. */
  title: string;
  /** Ordered list of artist names. */
  artists: string[];
  /** Album name. */
  album: string;
  /** Album art URL, or null when unavailable. */
  artUrl: string | null;
  /** open.spotify.com link-back for the track (required display). */
  trackUrl: string; // open.spotify.com link-back (required display)
  /** Track duration in milliseconds. */
  durationMs: number;
  /** Playback progress in milliseconds at `fetchedAt`. */
  progressMs: number;
  /** Whether playback is currently active. */
  isPlaying: boolean;
  /** `performance.now()` at the poll, for client-side interpolation. */
  fetchedAt: number; // performance.now() at poll, for interpolation
}

/**
 * Connection state of the Spotify integration (T08), with an optional machine
 * `reason` the UI turns into an honest message.
 */
export interface SpotifyStatus {
  /** Current connection lifecycle state. */
  state: 'disconnected' | 'connecting' | 'connected' | 'error';
  /** Why we are disconnected/errored, when applicable. */
  reason?: 'not-allowlisted' | 'expired' | 'network' | 'rate-limited';
}
