/**
 * `GET /me/player` poller. Polls ~1 s while playing (5 s paused), halts while the
 * tab is hidden, single-flights, jitters ±100 ms, honors 429 `Retry-After` with
 * exponential backoff on 5xx/network, and produces `NowPlaying` + `SpotifyStatus`.
 * A drift-corrected {@link DriftClock} smooths `progressMs` between polls.
 *
 * Response-shape guards (the "passes fixtures, 500s live" trap): `204 No Content`
 * = nothing active; `item` may be null; `currently_playing_type` may be `ad`/
 * `episode`. Only a real `track` becomes a card.
 */
import { PLAYER_ENDPOINT } from './config';
import { DriftClock } from './clock';
import { SpotifyError } from './types';
import type { PlayerState, TrackItem } from './types';
import type { NowPlaying, SpotifyStatus } from '../contracts/spotify';

const POLL_PLAYING_MS = 1000;
const POLL_PAUSED_MS = 5000;
const JITTER_MS = 100;
const MAX_BACKOFF_MS = 60_000;

export interface PollerState {
  status: SpotifyStatus;
  /** Raw last-poll snapshot; use {@link SpotifyPoller.nowPlayingAt} for smooth position. */
  nowPlaying: NowPlaying | null;
  /** True when we are showing a stale snapshot because the last poll failed. */
  stale: boolean;
}

export interface PollerDeps {
  fetch: typeof fetch;
  /** `performance.now()`. */
  now: () => number;
  /** A valid access token, refreshing as needed; throws `SpotifyError` on failure. */
  getAccessToken: () => Promise<string>;
  isVisible: () => boolean;
  onState: (state: PollerState) => void;
  onTrackChange?: (np: NowPlaying) => void;
  random?: () => number;
  setTimeoutFn?: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (h: ReturnType<typeof setTimeout>) => void;
}

function pickArt(item: TrackItem): string | null {
  const first = item.album.images[0];
  return first ? first.url : null;
}

function isRenderableTrack(player: PlayerState): player is PlayerState & { item: TrackItem } {
  if (!player.item) return false;
  const type = player.currently_playing_type ?? player.item.type ?? 'track';
  return type === 'track';
}

function buildNowPlaying(player: PlayerState, item: TrackItem, fetchedAt: number): NowPlaying {
  return {
    trackId: item.id,
    title: item.name,
    artists: item.artists.map((a) => a.name),
    album: item.album.name,
    artUrl: pickArt(item),
    trackUrl: item.external_urls?.spotify ?? `https://open.spotify.com/track/${item.id}`,
    durationMs: item.duration_ms,
    progressMs: player.progress_ms ?? 0,
    isPlaying: player.is_playing,
    fetchedAt,
  };
}

export class SpotifyPoller {
  private readonly deps: Required<
    Pick<PollerDeps, 'fetch' | 'now' | 'getAccessToken' | 'isVisible' | 'onState'>
  > &
    PollerDeps;
  private readonly clock = new DriftClock();
  private handle: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private running = false;
  private backoffMs = 0;
  private lastTrackId: string | null = null;
  private last: PollerState = { status: { state: 'connecting' }, nowPlaying: null, stale: false };

  constructor(deps: PollerDeps) {
    this.deps = { random: Math.random, ...deps };
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.tickAndSchedule();
  }

  stop(): void {
    this.running = false;
    if (this.handle !== null) {
      (this.deps.clearTimeoutFn ?? clearTimeout)(this.handle);
      this.handle = null;
    }
  }

  /** Force an immediate poll (e.g. on `visibilitychange` back to visible). */
  resync(): void {
    if (!this.running) return;
    void this.tickAndSchedule();
  }

  /** Smoothly interpolated snapshot at `now`, or null when nothing is playing. */
  nowPlayingAt(now: number): NowPlaying | null {
    const np = this.last.nowPlaying;
    if (!np) return null;
    return { ...np, progressMs: Math.round(this.clock.progressAt(now)), fetchedAt: now };
  }

  private emit(next: PollerState): void {
    this.last = next;
    this.deps.onState(next);
  }

  private schedule(delayMs: number): void {
    if (!this.running) return;
    const set = this.deps.setTimeoutFn ?? setTimeout;
    this.handle = set(() => {
      void this.tickAndSchedule();
    }, delayMs);
  }

  private nextDelay(): number {
    if (this.backoffMs > 0) return this.backoffMs;
    const base = this.last.nowPlaying?.isPlaying ? POLL_PLAYING_MS : POLL_PAUSED_MS;
    const rnd = (this.deps.random ?? Math.random)();
    return base + (rnd * 2 - 1) * JITTER_MS;
  }

  private async tickAndSchedule(): Promise<void> {
    if (this.handle !== null) {
      (this.deps.clearTimeoutFn ?? clearTimeout)(this.handle);
      this.handle = null;
    }
    if (!this.deps.isVisible()) {
      // Halt while hidden; resync() drives the next poll on becoming visible.
      return;
    }
    const stop = await this.tick();
    if (stop || !this.running) return;
    this.schedule(this.nextDelay());
  }

  /** One poll. Returns true when polling should stop (e.g. not-allowlisted/expired). */
  async tick(): Promise<boolean> {
    if (this.inFlight) return false; // single-flight
    this.inFlight = true;
    try {
      let token: string;
      try {
        token = await this.deps.getAccessToken();
      } catch (e) {
        return this.handleAuthError(e);
      }

      let res: Response;
      try {
        res = await this.deps.fetch(PLAYER_ENDPOINT, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        this.degrade('network');
        return false;
      }

      return await this.handleResponse(res);
    } finally {
      this.inFlight = false;
    }
  }

  private handleAuthError(e: unknown): boolean {
    if (e instanceof SpotifyError) {
      if (e.reason === 'expired') {
        this.emit({ status: { state: 'error', reason: 'expired' }, nowPlaying: null, stale: false });
        return true;
      }
      if (e.reason === 'not-allowlisted') {
        this.emit({
          status: { state: 'error', reason: 'not-allowlisted' },
          nowPlaying: null,
          stale: false,
        });
        return true;
      }
    }
    this.degrade('network');
    return false;
  }

  private async handleResponse(res: Response): Promise<boolean> {
    if (res.status === 204) {
      // Nothing is active — connected, but no card.
      this.backoffMs = 0;
      this.clock.reset();
      this.lastTrackId = null;
      this.emit({ status: { state: 'connected' }, nowPlaying: null, stale: false });
      return false;
    }
    if (res.status === 401) {
      // Token rejected mid-flight; surface as expired so the gate re-auths.
      this.emit({ status: { state: 'error', reason: 'expired' }, nowPlaying: null, stale: false });
      return true;
    }
    if (res.status === 403) {
      this.emit({
        status: { state: 'error', reason: 'not-allowlisted' },
        nowPlaying: null,
        stale: false,
      });
      return true;
    }
    if (res.status === 429) {
      const retry = Number(res.headers.get('Retry-After') ?? '1');
      this.backoffMs = Math.min(MAX_BACKOFF_MS, (Number.isFinite(retry) ? retry : 1) * 1000);
      this.emit({
        status: { state: 'error', reason: 'rate-limited' },
        nowPlaying: this.last.nowPlaying,
        stale: this.last.nowPlaying !== null,
      });
      return false;
    }
    if (res.status >= 500) {
      this.degrade('network');
      return false;
    }
    if (!res.ok) {
      this.degrade('network');
      return false;
    }

    let player: PlayerState;
    try {
      player = (await res.json()) as PlayerState;
    } catch {
      // 200 with an empty body behaves like 204.
      this.backoffMs = 0;
      this.clock.reset();
      this.emit({ status: { state: 'connected' }, nowPlaying: null, stale: false });
      return false;
    }

    this.backoffMs = 0;

    if (!isRenderableTrack(player)) {
      // Ad / podcast episode / nothing renderable — connected, no card.
      this.clock.reset();
      this.lastTrackId = null;
      this.emit({ status: { state: 'connected' }, nowPlaying: null, stale: false });
      return false;
    }

    const fetchedAt = this.deps.now();
    const np = buildNowPlaying(player, player.item, fetchedAt);

    const changed = np.trackId !== this.lastTrackId;
    if (changed) this.clock.reset();
    const upd = this.clock.update({
      progressMs: np.progressMs,
      durationMs: np.durationMs,
      isPlaying: np.isPlaying,
      fetchedAt,
    });

    // Scene event on a track change (id change) OR a >1.5 s in-track discontinuity
    // (a seek), per spec. `upd.resync` is the clock's discontinuity signal; on a
    // track change the clock was just reset so it seeds and also reports resync —
    // hence this fires exactly once per discontinuity.
    if (changed || upd.resync) this.deps.onTrackChange?.(np);
    this.lastTrackId = np.trackId;

    this.emit({ status: { state: 'connected' }, nowPlaying: np, stale: false });
    return false;
  }

  private degrade(reason: 'network'): void {
    this.backoffMs = this.backoffMs > 0 ? Math.min(MAX_BACKOFF_MS, this.backoffMs * 2) : 2000;
    this.emit({
      status: { state: 'error', reason },
      nowPlaying: this.last.nowPlaying,
      stale: this.last.nowPlaying !== null,
    });
  }
}
