/**
 * Framework-free orchestrator: owns the token lifecycle, the poller, and palette
 * extraction, and exposes a tiny observable `SpotifyView` (status + nowPlaying +
 * palette + stale). React binds to it via {@link useSpotify}; the audio engine can
 * read `nowPlayingAt(now)` directly. No import-time side effects — safe to load
 * lazily behind the feature flag so it tree-shakes out when Spotify is dark.
 */
import { isConfigured } from './config';
import { beginAuth, exchangeCode, refreshTokens } from './auth';
import type { AuthEnv } from './auth';
import { extractPalette } from './palette';
import { SpotifyPoller } from './poller';
import type { PollerState } from './poller';
import { clearAll, isExpired, loadTokens, savePending } from './store';
import { SpotifyError } from './types';
import type { NowPlaying, SpotifyStatus } from '../contracts/spotify';

export interface SpotifyView {
  status: SpotifyStatus;
  nowPlaying: NowPlaying | null;
  palette: string[];
  stale: boolean;
}

export interface ControllerOptions {
  fetch?: typeof fetch;
  origin?: string;
  /** Epoch-ms clock for token expiry (Date.now). */
  nowEpoch?: () => number;
  /** Monotonic clock for interpolation (performance.now). */
  nowPerf?: () => number;
  redirect?: (url: string) => void;
  location?: { search: string; pathname: string };
  replaceState?: (url: string) => void;
  isVisible?: () => boolean;
  /** Palette extraction, overridable in tests. */
  extractPalette?: (url: string | null) => Promise<string[]>;
  onTrackChange?: (np: NowPlaying) => void;
}

const IDLE: SpotifyView = {
  status: { state: 'disconnected' },
  nowPlaying: null,
  palette: [],
  stale: false,
};

export class SpotifyController {
  private readonly authEnv: AuthEnv;
  private readonly getLocation: () => { search: string; pathname: string };
  private readonly replaceState: (url: string) => void;
  private readonly isVisible: () => boolean;
  private readonly nowPerf: () => number;
  private readonly extract: (url: string | null) => Promise<string[]>;
  private readonly externalTrackChange: ((np: NowPlaying) => void) | undefined;

  private poller: SpotifyPoller | null = null;
  private view: SpotifyView = IDLE;
  private paletteFor: string | null = null;
  private readonly listeners = new Set<(v: SpotifyView) => void>();

  constructor(opts: ControllerOptions = {}) {
    const origin = opts.origin ?? globalThis.location?.origin ?? 'http://127.0.0.1:5173';
    const fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);
    const nowEpoch = opts.nowEpoch ?? (() => Date.now());
    this.nowPerf = opts.nowPerf ?? (() => performance.now());
    this.getLocation =
      opts.location !== undefined
        ? (): { search: string; pathname: string } => opts.location as { search: string; pathname: string }
        : (): { search: string; pathname: string } => ({
            search: globalThis.location?.search ?? '',
            pathname: globalThis.location?.pathname ?? '/',
          });
    this.replaceState =
      opts.replaceState ??
      ((url: string): void => {
        globalThis.history?.replaceState(null, '', url);
      });
    this.isVisible = opts.isVisible ?? ((): boolean => globalThis.document?.visibilityState !== 'hidden');
    this.extract = opts.extractPalette ?? ((url): Promise<string[]> => extractPalette(url));
    this.externalTrackChange = opts.onTrackChange;

    this.authEnv = {
      fetch: fetchFn,
      origin,
      now: nowEpoch,
      savePending: (verifier, state, at) => savePending({ verifier, state, createdAt: at }),
      redirect: opts.redirect ?? ((url: string): void => {
        if (globalThis.location) globalThis.location.href = url;
      }),
    };
  }

  subscribe(fn: (v: SpotifyView) => void): () => void {
    this.listeners.add(fn);
    fn(this.view);
    return () => this.listeners.delete(fn);
  }

  getView(): SpotifyView {
    return this.view;
  }

  /** Interpolated snapshot at the current instant, for the engine/UI hot path. */
  nowPlayingAt(now: number = this.nowPerf()): NowPlaying | null {
    return this.poller?.nowPlayingAt(now) ?? this.view.nowPlaying;
  }

  private setView(patch: Partial<SpotifyView>): void {
    this.view = { ...this.view, ...patch };
    for (const fn of this.listeners) fn(this.view);
  }

  /** True when the current URL is the OAuth callback that needs completing. */
  isOnCallback(): boolean {
    const { pathname, search } = this.getLocation();
    return pathname.endsWith('/callback') && /[?&]code=|[?&]error=/.test(search);
  }

  /** Ensure a fresh access token, refreshing within the skew; throws on failure. */
  private getAccessToken = async (): Promise<string> => {
    const tokens = loadTokens();
    if (!tokens) throw new SpotifyError('expired', 'Not connected.');
    if (isExpired(tokens)) {
      const refreshed = await refreshTokens(this.authEnv);
      return refreshed.accessToken;
    }
    return tokens.accessToken;
  };

  /** Begin the PKCE login (redirects the browser away). */
  async connect(): Promise<void> {
    if (!isConfigured()) {
      this.setView({ status: { state: 'error', reason: 'not-allowlisted' } });
      return;
    }
    this.setView({ status: { state: 'connecting' } });
    await beginAuth(this.authEnv);
  }

  /** Wipe local tokens and stop polling. (Server-side revoke is the user's job.) */
  disconnect(): void {
    this.poller?.stop();
    this.poller = null;
    clearAll();
    this.paletteFor = null;
    this.view = IDLE;
    for (const fn of this.listeners) fn(this.view);
  }

  /** Clean reconnect after `expired` — wipe then start the login again. */
  async reconnect(): Promise<void> {
    clearAll();
    await this.connect();
  }

  /**
   * Complete the `/callback` exchange: verify state, swap code→tokens, strip the
   * query from the URL, and start polling. No-op when not on the callback.
   */
  async completeRedirect(): Promise<void> {
    if (!this.isOnCallback()) {
      this.resume();
      return;
    }
    const { pathname, search } = this.getLocation();
    const params = new URLSearchParams(search);
    this.setView({ status: { state: 'connecting' } });
    try {
      await exchangeCode(this.authEnv, {
        code: params.get('code'),
        state: params.get('state'),
        error: params.get('error'),
      });
      this.replaceState(pathname.replace(/\/callback$/, '/') || '/');
      this.startPolling();
    } catch (e) {
      this.replaceState(pathname.replace(/\/callback$/, '/') || '/');
      this.applyError(e);
    }
  }

  /** If tokens are already present (returning visitor), start polling. */
  resume(): void {
    if (loadTokens()) this.startPolling();
  }

  private applyError(e: unknown): void {
    const reason = e instanceof SpotifyError ? e.reason : 'network';
    this.setView({ status: { state: 'error', reason }, nowPlaying: null, stale: false });
  }

  private onPollerState = (s: PollerState): void => {
    this.setView({ status: s.status, nowPlaying: s.nowPlaying, stale: s.stale });
    void this.refreshPalette(s.nowPlaying);
  };

  private async refreshPalette(np: NowPlaying | null): Promise<void> {
    const url = np?.artUrl ?? null;
    if (url === this.paletteFor) return;
    this.paletteFor = url;
    if (!url) {
      this.setView({ palette: [] });
      return;
    }
    const palette = await this.extract(url);
    if (this.paletteFor === url) this.setView({ palette });
  }

  private startPolling(): void {
    this.poller?.stop();
    this.poller = new SpotifyPoller({
      fetch: this.authEnv.fetch,
      now: this.nowPerf,
      getAccessToken: this.getAccessToken,
      isVisible: this.isVisible,
      onState: this.onPollerState,
      ...(this.externalTrackChange ? { onTrackChange: this.externalTrackChange } : {}),
    });
    this.setView({ status: { state: 'connecting' } });
    this.poller.start();
  }

  /** Poll immediately (call from a `visibilitychange`→visible handler). */
  resyncNow(): void {
    this.poller?.resync();
  }
}
