import { afterEach, describe, expect, it, vi } from 'vitest';

import { SpotifyPoller } from '../../src/spotify/poller';
import type { PollerDeps, PollerState } from '../../src/spotify/poller';
import { SpotifyError } from '../../src/spotify/types';

function trackPlayer(overrides: Record<string, unknown> = {}): unknown {
  return {
    is_playing: true,
    progress_ms: 61_000,
    currently_playing_type: 'track',
    item: {
      id: 'trk1',
      name: 'Mr. Brightside',
      duration_ms: 200_000,
      uri: 'spotify:track:trk1',
      type: 'track',
      artists: [{ name: 'The Killers' }, { name: 'Guest' }],
      album: {
        name: 'Hot Fuss',
        images: [{ url: 'https://i.scdn.co/image/abc.jpg', width: 640, height: 640 }],
      },
      external_urls: { spotify: 'https://open.spotify.com/track/trk1' },
    },
    ...overrides,
  };
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

interface Harness {
  poller: SpotifyPoller;
  states: PollerState[];
  trackChanges: unknown[];
  perf: { t: number };
  fetchMock: ReturnType<typeof vi.fn>;
}

function harness(
  fetchImpl: (...args: unknown[]) => Promise<Response>,
  extra: Partial<PollerDeps> = {},
): Harness {
  const states: PollerState[] = [];
  const trackChanges: unknown[] = [];
  const perf = { t: 0 };
  const fetchMock = vi.fn(fetchImpl);
  const poller = new SpotifyPoller({
    fetch: fetchMock as unknown as typeof fetch,
    now: () => perf.t,
    getAccessToken: async () => 'tok',
    isVisible: () => true,
    onState: (s) => states.push(s),
    onTrackChange: (np) => trackChanges.push(np),
    random: () => 0.5, // no jitter
    ...extra,
  });
  return { poller, states, trackChanges, perf, fetchMock };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('SpotifyPoller — response handling', () => {
  it('builds NowPlaying from a playing track and fires a track-change', async () => {
    const h = harness(async () => jsonRes(trackPlayer()));
    await h.poller.tick();
    const s = h.states.at(-1);
    expect(s?.status).toEqual({ state: 'connected' });
    expect(s?.nowPlaying).toMatchObject({
      trackId: 'trk1',
      title: 'Mr. Brightside',
      artists: ['The Killers', 'Guest'],
      album: 'Hot Fuss',
      artUrl: 'https://i.scdn.co/image/abc.jpg',
      trackUrl: 'https://open.spotify.com/track/trk1',
      isPlaying: true,
    });
    expect(h.trackChanges).toHaveLength(1);
  });

  it('fires a scene event on a >1.5 s in-track seek (same track id)', async () => {
    const responses = [
      jsonRes(trackPlayer({ progress_ms: 61_000 })),
      jsonRes(trackPlayer({ progress_ms: 120_000 })), // big forward jump, same track
    ];
    let i = 0;
    const h = harness(async () => responses[i++] as Response);
    h.perf.t = 1000;
    await h.poller.tick(); // initial track → event 1
    h.perf.t = 2000;
    await h.poller.tick(); // seek discontinuity → event 2
    expect(h.trackChanges).toHaveLength(2);
    expect(h.states.at(-1)?.nowPlaying?.trackId).toBe('trk1');
  });

  it('does NOT fire a scene event on steady playback', async () => {
    const responses = [
      jsonRes(trackPlayer({ progress_ms: 61_000 })),
      jsonRes(trackPlayer({ progress_ms: 62_000 })), // ~matches interpolation
    ];
    let i = 0;
    const h = harness(async () => responses[i++] as Response);
    h.perf.t = 1000;
    await h.poller.tick();
    h.perf.t = 2000;
    await h.poller.tick();
    expect(h.trackChanges).toHaveLength(1); // only the initial track
  });

  it('treats 204 No Content as connected with no card', async () => {
    const h = harness(async () => new Response(null, { status: 204 }));
    await h.poller.tick();
    expect(h.states.at(-1)).toMatchObject({ status: { state: 'connected' }, nowPlaying: null });
  });

  it('ignores ads and podcast episodes (non-track items)', async () => {
    const ad = harness(async () => jsonRes(trackPlayer({ currently_playing_type: 'ad' })));
    await ad.poller.tick();
    expect(ad.states.at(-1)?.nowPlaying).toBeNull();

    const nullItem = harness(async () => jsonRes(trackPlayer({ item: null })));
    await nullItem.poller.tick();
    expect(nullItem.states.at(-1)?.nowPlaying).toBeNull();
  });

  it('maps 403 to not-allowlisted and stops', async () => {
    const h = harness(async () => new Response(null, { status: 403 }));
    const stop = await h.poller.tick();
    expect(stop).toBe(true);
    expect(h.states.at(-1)?.status).toEqual({ state: 'error', reason: 'not-allowlisted' });
  });

  it('maps 401 to expired and stops', async () => {
    const h = harness(async () => new Response(null, { status: 401 }));
    const stop = await h.poller.tick();
    expect(stop).toBe(true);
    expect(h.states.at(-1)?.status).toEqual({ state: 'error', reason: 'expired' });
  });

  it('propagates an expired token error from getAccessToken', async () => {
    const h = harness(async () => jsonRes(trackPlayer()), {
      getAccessToken: async () => {
        throw new SpotifyError('expired', 'gone');
      },
    });
    const stop = await h.poller.tick();
    expect(stop).toBe(true);
    expect(h.states.at(-1)?.status).toEqual({ state: 'error', reason: 'expired' });
  });

  it('keeps the last track as stale on 429 and on 5xx', async () => {
    const responses = [jsonRes(trackPlayer()), new Response(null, { status: 429, headers: { 'Retry-After': '3' } }), jsonRes(trackPlayer(), 503)];
    let i = 0;
    const h = harness(async () => responses[i++] as Response);
    await h.poller.tick(); // track
    await h.poller.tick(); // 429
    expect(h.states.at(-1)).toMatchObject({ status: { state: 'error', reason: 'rate-limited' }, stale: true });
    expect(h.states.at(-1)?.nowPlaying?.trackId).toBe('trk1');
    await h.poller.tick(); // 503
    expect(h.states.at(-1)).toMatchObject({ status: { state: 'error', reason: 'network' }, stale: true });
  });

  it('maps a thrown fetch (offline) to a network-degraded state', async () => {
    const h = harness(async () => {
      throw new TypeError('Failed to fetch');
    });
    await h.poller.tick();
    expect(h.states.at(-1)?.status).toEqual({ state: 'error', reason: 'network' });
  });

  it('interpolates position forward via nowPlayingAt', async () => {
    const h = harness(async () => jsonRes(trackPlayer()));
    h.perf.t = 1000;
    await h.poller.tick();
    const later = h.poller.nowPlayingAt(1500);
    expect(later?.progressMs).toBe(61_500);
  });
});

describe('SpotifyPoller — scheduling & visibility', () => {
  it('does not fetch while the tab is hidden', async () => {
    vi.useFakeTimers();
    const h = harness(async () => jsonRes(trackPlayer()), { isVisible: () => false });
    h.poller.start();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.fetchMock).not.toHaveBeenCalled();
    h.poller.stop();
  });

  it('honors 429 Retry-After before the next poll', async () => {
    vi.useFakeTimers();
    const responses = [new Response(null, { status: 429, headers: { 'Retry-After': '3' } }), jsonRes(trackPlayer())];
    let i = 0;
    const h = harness(async () => responses[Math.min(i++, responses.length - 1)] as Response);
    h.poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2900);
    expect(h.fetchMock).toHaveBeenCalledTimes(1); // still backing off
    await vi.advanceTimersByTimeAsync(200);
    expect(h.fetchMock).toHaveBeenCalledTimes(2);
    h.poller.stop();
  });
});
