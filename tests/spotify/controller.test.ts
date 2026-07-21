import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpotifyController } from '../../src/spotify/controller';
import type { SpotifyView } from '../../src/spotify/controller';
import { STORAGE_KEY } from '../../src/spotify/config';
import { loadTokens, savePending, saveTokens } from '../../src/spotify/store';

const TOKEN_BODY = {
  access_token: 'access-1',
  token_type: 'Bearer',
  expires_in: 3600,
  scope: 'user-read-currently-playing user-read-playback-state',
  refresh_token: 'refresh-1',
};

function trackPlayer(): unknown {
  return {
    is_playing: true,
    progress_ms: 1000,
    currently_playing_type: 'track',
    item: {
      id: 'trk1',
      name: 'Song',
      duration_ms: 200_000,
      type: 'track',
      artists: [{ name: 'A' }],
      album: { name: 'Alb', images: [{ url: 'https://i.scdn.co/x.jpg', width: 640, height: 640 }] },
      external_urls: { spotify: 'https://open.spotify.com/track/trk1' },
    },
  };
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function apiFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: unknown) => {
    const u = String(url);
    if (u.includes('/api/token')) return jsonRes(TOKEN_BODY);
    if (u.includes('/me/player')) return jsonRes(trackPlayer());
    return new Response(null, { status: 404 });
  });
}

beforeEach(() => {
  localStorage.clear();
  vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', 'client-abc');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('SpotifyController', () => {
  it('completes the /callback exchange, cleans the URL, and starts polling', async () => {
    savePending({ verifier: 'ver', state: 'st', createdAt: 0 });
    const replaced: string[] = [];
    const views: SpotifyView[] = [];
    const controller = new SpotifyController({
      fetch: apiFetch() as unknown as typeof fetch,
      origin: 'http://127.0.0.1:5173',
      location: { search: '?code=the-code&state=st', pathname: '/callback' },
      replaceState: (url) => replaced.push(url),
      isVisible: () => true,
      nowPerf: () => 0,
      extractPalette: async () => ['#112233'],
    });
    controller.subscribe((v) => views.push(v));

    await controller.completeRedirect();

    expect(loadTokens()?.accessToken).toBe('access-1');
    expect(replaced).toContain('/'); // query stripped
    await vi.waitFor(() => {
      expect(controller.getView().nowPlaying?.trackId).toBe('trk1');
    });
    expect(controller.getView().status).toEqual({ state: 'connected' });
  });

  it('does nothing off the callback route but resumes an existing session', async () => {
    saveTokens({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 3_600_000,
      scope: 'user-read-currently-playing user-read-playback-state',
    });
    const controller = new SpotifyController({
      fetch: apiFetch() as unknown as typeof fetch,
      origin: 'http://127.0.0.1:5173',
      location: { search: '', pathname: '/' },
      replaceState: () => {},
      isVisible: () => true,
      nowPerf: () => 0,
      extractPalette: async () => [],
    });
    await controller.completeRedirect();
    await vi.waitFor(() => {
      expect(controller.getView().status).toEqual({ state: 'connected' });
    });
  });

  it('disconnect wipes storage and returns to disconnected', async () => {
    saveTokens({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 3_600_000,
      scope: 's',
    });
    const controller = new SpotifyController({
      fetch: apiFetch() as unknown as typeof fetch,
      origin: 'http://127.0.0.1:5173',
      location: { search: '', pathname: '/' },
      isVisible: () => true,
    });
    controller.disconnect();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(controller.getView().status).toEqual({ state: 'disconnected' });
  });

  it('reports not-allowlisted when no client ID is configured', async () => {
    vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', '');
    const redirect = vi.fn();
    const controller = new SpotifyController({
      fetch: apiFetch() as unknown as typeof fetch,
      origin: 'http://127.0.0.1:5173',
      location: { search: '', pathname: '/' },
      redirect,
    });
    await controller.connect();
    expect(redirect).not.toHaveBeenCalled();
    expect(controller.getView().status).toEqual({ state: 'error', reason: 'not-allowlisted' });
  });
});
