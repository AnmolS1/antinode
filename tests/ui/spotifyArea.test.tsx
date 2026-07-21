import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { SpotifyArea } from '../../src/ui/components/SpotifyArea';
import { NOW_PLAYING_FIXTURE, PALETTE_FIXTURE, SPOTIFY_STATES } from '../../src/ui/dev/fixtures';

afterEach(cleanup);

describe('Now-playing card Spotify compliance layout', () => {
  it('renders metadata exactly as provided (unmodified)', () => {
    render(
      <SpotifyArea
        status={SPOTIFY_STATES.connected}
        nowPlaying={NOW_PLAYING_FIXTURE}
        palette={PALETTE_FIXTURE}
      />,
    );
    expect(screen.getByText('Mr. Brightside')).toBeTruthy();
    expect(screen.getByText('The Killers')).toBeTruthy();
    expect(screen.getByText('Hot Fuss')).toBeTruthy();
  });

  it('links back to the track with a PLAY ON SPOTIFY link', () => {
    render(<SpotifyArea status={SPOTIFY_STATES.connected} nowPlaying={NOW_PLAYING_FIXTURE} />);
    const link = screen.getByRole('link', { name: /play on spotify/i });
    expect(link.getAttribute('href')).toBe(NOW_PLAYING_FIXTURE.trackUrl);
  });

  it('shows the full Spotify logo at >= 70px as attribution', () => {
    render(<SpotifyArea status={SPOTIFY_STATES.connected} nowPlaying={NOW_PLAYING_FIXTURE} />);
    const logo = screen.getByRole('img', { name: 'Spotify' });
    expect(Number(logo.getAttribute('width'))).toBeGreaterThanOrEqual(70);
  });

  it('renders album art beside the metadata (intact, labeled)', () => {
    render(<SpotifyArea status={SPOTIFY_STATES.connected} nowPlaying={NOW_PLAYING_FIXTURE} />);
    const art = screen.getByRole('img', { name: /album art/i });
    expect(art).toBeTruthy();
  });

  it('shows an honest message when the account is not allowlisted', () => {
    render(<SpotifyArea status={SPOTIFY_STATES.notAllowlisted} nowPlaying={null} />);
    expect(screen.getByText(/allowlist/i)).toBeTruthy();
    expect(screen.queryByRole('link', { name: /play on spotify/i })).toBeNull();
  });

  it('offers a connect action when disconnected', () => {
    render(<SpotifyArea status={SPOTIFY_STATES.disconnected} nowPlaying={null} />);
    expect(screen.getByRole('button', { name: /connect spotify/i })).toBeTruthy();
  });
});
