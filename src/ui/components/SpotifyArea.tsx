/**
 * Spotify connect slot + now-playing card. This is a *placeholder* — T08 replaces the
 * internals (auth, polling) — but T04 owns the card's **compliance layout**, which is
 * part of the design and non-negotiable (00-overview / 02-design / Spotify Design
 * Guidelines):
 *   - album art intact: rounded, no crop, no overlay, no filter, floated *beside* the
 *     metadata (never under it);
 *   - track / artist / album rendered exactly as provided (unmodified);
 *   - the full Spotify logo (icon + wordmark) >= 70px as attribution;
 *   - a "PLAY ON SPOTIFY" link back to the track.
 * Rendered behind a feature flag; here it takes fixture props so every state is real.
 */
import type { NowPlaying, SpotifyStatus } from '../../contracts/spotify';
import { formatTime } from '../util';

function SpotifyLogo() {
  // Full logo: icon + wordmark, >=70px wide, brand green. Attribution only.
  return (
    <svg
      className="spotify-logo"
      width={112}
      height={34}
      viewBox="0 0 112 34"
      role="img"
      aria-label="Spotify"
    >
      <title>Spotify</title>
      <circle cx="17" cy="17" r="16" fill="#1db954" />
      <g fill="#050a0f">
        <path d="M9 13.6c4.6-1.2 9.4-.9 13.4 1 .5.3 1.1.1 1.3-.4.3-.5.1-1.1-.4-1.3-4.4-2-9.7-2.4-14.7-1-.6.2-.9.7-.7 1.3.2.5.7.6 1.1.4z" />
        <path d="M9.4 17.7c3.9-1 8-.5 11.3 1.3.4.2.9.1 1.1-.3.2-.4.1-.9-.3-1.1-3.6-2-8.1-2.5-12.4-1.4-.5.1-.7.6-.6 1 .1.4.6.6 1 .5z" />
        <path d="M10 21.5c3.2-.8 6.4-.4 9.1 1 .3.2.7.1.9-.2.2-.3.1-.7-.2-.9-3-1.6-6.6-2-10.1-1.1-.4.1-.6.5-.5.8.1.4.5.6.9.6z" />
      </g>
      <text
        x="38"
        y="23"
        fill="var(--ink)"
        fontFamily="var(--font-display)"
        fontSize="18"
        fontWeight="700"
      >
        Spotify
      </text>
    </svg>
  );
}

function NowPlayingCard({ track, palette }: { track: NowPlaying; palette: string[] }) {
  return (
    <figure className="nowplaying" data-testid="nowplaying-card">
      <div className="nowplaying__art">
        {track.artUrl ? (
          <img className="nowplaying__img" src={track.artUrl} alt={`${track.album} album art`} />
        ) : (
          <div className="nowplaying__img nowplaying__img--placeholder" role="img" aria-label={`${track.album} album art`} />
        )}
      </div>
      <figcaption className="nowplaying__meta">
        <p className="nowplaying__title" data-field="title">
          {track.title}
        </p>
        <p className="nowplaying__artist" data-field="artist">
          {track.artists.join(', ')}
        </p>
        <p className="nowplaying__album" data-field="album">
          {track.album}
        </p>
        <p className="nowplaying__time">
          <span className="mono">{formatTime(track.progressMs)}</span>
          <span aria-hidden="true"> / </span>
          <span className="mono">{formatTime(track.durationMs)}</span>
        </p>
        <div className="nowplaying__attrib">
          <SpotifyLogo />
          <a
            className="btn btn--spotify"
            href={track.trackUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            PLAY ON SPOTIFY
          </a>
        </div>
        {palette.length > 0 && (
          <ul className="palette" role="list" aria-label="Colors extracted from the album art">
            {palette.map((hex, i) => (
              <li key={hex} className={`palette__chip${i === 0 ? ' is-active' : ''}`}>
                <span className="palette__swatch" style={{ background: hex }} aria-hidden="true" />
                <span className="palette__hex mono">{hex.toUpperCase()}</span>
              </li>
            ))}
          </ul>
        )}
      </figcaption>
    </figure>
  );
}

export function SpotifyArea({
  status,
  nowPlaying,
  palette = [],
  onConnect,
}: {
  status: SpotifyStatus;
  nowPlaying: NowPlaying | null;
  palette?: string[];
  onConnect?: () => void;
}) {
  return (
    <section className="spotify panel" aria-label="Spotify">
      {status.state === 'connected' && nowPlaying ? (
        <NowPlayingCard track={nowPlaying} palette={palette} />
      ) : status.state === 'error' && status.reason === 'not-allowlisted' ? (
        <div className="spotify__notice" role="note">
          <h3 className="panel__title">Spotify is a 5-seat bonus tier</h3>
          <p>
            This account is not on the allowlist yet, so the now-playing card stays off. The
            visualizer itself needs no Spotify — any source on the ladder works.
          </p>
        </div>
      ) : (
        <div className="spotify__connect">
          <h3 className="panel__title">Connect Spotify (optional)</h3>
          <p className="panel__hint">
            Shows what is playing beside the visuals. Everything works without it.
          </p>
          <button type="button" className="btn btn--primary" onClick={onConnect}>
            Connect Spotify
          </button>
        </div>
      )}
    </section>
  );
}
