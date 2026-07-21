import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { SpotifyArea } from '../../src/ui/components/SpotifyArea';
import type { NowPlaying, SpotifyStatus } from '../../src/contracts/spotify';

const NP: NowPlaying = {
  trackId: 'trk1',
  title: 'Mr. Brightside',
  artists: ['The Killers'],
  album: 'Hot Fuss',
  artUrl: null,
  trackUrl: 'https://open.spotify.com/track/trk1',
  durationMs: 222_075,
  progressMs: 61_000,
  isPlaying: true,
  fetchedAt: 0,
};

const CONNECTED: SpotifyStatus = { state: 'connected' };
const DISCONNECTED: SpotifyStatus = { state: 'disconnected' };
const EXPIRED: SpotifyStatus = { state: 'error', reason: 'expired' };
const NETWORK: SpotifyStatus = { state: 'error', reason: 'network' };

afterEach(cleanup);

describe('SpotifyArea — compliance surface (T08)', () => {
  it('shows privacy + terms links and the not-endorsed line before connecting', () => {
    render(<SpotifyArea status={DISCONNECTED} nowPlaying={null} />);
    const privacy = screen.getByRole('link', { name: /privacy policy/i });
    const terms = screen.getByRole('link', { name: /^terms$/i });
    expect(privacy.getAttribute('href')).toContain('/privacy');
    expect(terms.getAttribute('href')).toContain('/terms');
    expect(screen.getByText(/not endorsed by or affiliated with spotify/i)).toBeTruthy();
  });

  it('renders these links even when the gate passes no URLs (compliant by default)', () => {
    render(<SpotifyArea status={DISCONNECTED} nowPlaying={null} />);
    expect(screen.getByRole('link', { name: /privacy policy/i }).getAttribute('href')).toMatch(
      /^https:\/\//,
    );
  });

  it('offers a clean six-month reconnect on the expired state', () => {
    render(<SpotifyArea status={EXPIRED} nowPlaying={null} />);
    expect(screen.getByText(/six months/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /reconnect spotify/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /privacy policy/i })).toBeTruthy();
  });

  it('on the connected card, exposes disconnect + a revoke link to Spotify', () => {
    const onDisconnect = vi.fn();
    render(<SpotifyArea status={CONNECTED} nowPlaying={NP} onDisconnect={onDisconnect} />);
    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(onDisconnect).toHaveBeenCalledOnce();
    const revoke = screen.getByRole('link', { name: /manage app access/i });
    expect(revoke.getAttribute('href')).toContain('spotify.com/account/apps');
  });

  it('keeps the card up (with a reconnecting note) during a degraded blip', () => {
    render(<SpotifyArea status={NETWORK} nowPlaying={NP} stale />);
    expect(screen.getByTestId('nowplaying-card')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Mr. Brightside')).toBeTruthy();
  });
});
