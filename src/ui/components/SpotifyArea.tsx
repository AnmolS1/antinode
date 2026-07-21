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

// Compliance URLs shown on the connect surface *before* auth (Developer Policy
// §I.1.a / Terms §V) and for user-driven revoke (we cannot revoke server-side).
// Hardcoded defaults so the surface is compliant by construction even if the gate
// forgets to pass them; kept in sync with src/spotify/config.ts.
const PRIVACY_URL = 'https://ponderance.dev/privacy';
const TERMS_URL = 'https://ponderance.dev/terms';
const REVOKE_URL = 'https://www.spotify.com/account/apps/';
const NOT_ENDORSED = 'Antinode is not endorsed by or affiliated with Spotify.';

/** Privacy + terms links and the not-endorsed line — required before sign-up. */
function ConnectLegal({ privacyUrl, termsUrl }: { privacyUrl: string; termsUrl: string }) {
  return (
    <>
      <p className="spotify__legal">
        By connecting you agree to our{' '}
        <a href={privacyUrl} target="_blank" rel="noreferrer noopener">
          Privacy Policy
        </a>{' '}
        and{' '}
        <a href={termsUrl} target="_blank" rel="noreferrer noopener">
          Terms
        </a>
        .
      </p>
      <p className="spotify__disclaimer">{NOT_ENDORSED}</p>
    </>
  );
}

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

function NowPlayingCard({
  track,
  palette,
  stale,
  onDisconnect,
}: {
  track: NowPlaying;
  palette: string[];
  stale: boolean;
  onDisconnect?: (() => void) | undefined;
}) {
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
        {stale && (
          <p className="nowplaying__stale" role="status">
            Reconnecting… showing the last known track.
          </p>
        )}
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
        <div className="nowplaying__manage">
          {onDisconnect && (
            <button type="button" className="btn btn--ghost" onClick={onDisconnect}>
              Disconnect
            </button>
          )}
          <a className="spotify__revoke" href={REVOKE_URL} target="_blank" rel="noreferrer noopener">
            Manage app access on Spotify
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
  stale = false,
  onConnect,
  onDisconnect,
  onReconnect,
  privacyUrl = PRIVACY_URL,
  termsUrl = TERMS_URL,
}: {
  status: SpotifyStatus;
  nowPlaying: NowPlaying | null;
  palette?: string[];
  /** Showing a last-known track because the latest poll failed (degraded). */
  stale?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onReconnect?: () => void;
  privacyUrl?: string;
  termsUrl?: string;
}) {
  // Keep the card up during a transient network/rate-limit blip (stale), not only
  // when strictly 'connected' — the poller flags staleness rather than dropping it.
  const showCard = nowPlaying !== null && (status.state === 'connected' || stale);
  const isExpired = status.state === 'error' && status.reason === 'expired';
  const isNotAllowlisted = status.state === 'error' && status.reason === 'not-allowlisted';

  return (
    <section className="spotify panel" aria-label="Spotify">
      {showCard && nowPlaying ? (
        <NowPlayingCard
          track={nowPlaying}
          palette={palette}
          stale={stale}
          onDisconnect={onDisconnect}
        />
      ) : isNotAllowlisted ? (
        <div className="spotify__notice" role="note">
          <h3 className="panel__title">Spotify is a 5-seat bonus tier</h3>
          <p>
            This account is not on the allowlist yet, so the now-playing card stays off. The
            visualizer itself needs no Spotify — any source on the ladder works.
          </p>
          <p className="spotify__disclaimer">{NOT_ENDORSED}</p>
        </div>
      ) : isExpired ? (
        <div className="spotify__connect" role="note">
          <h3 className="panel__title">Reconnect Spotify</h3>
          <p className="panel__hint">
            Spotify sign-ins expire after six months — that is Spotify&rsquo;s rule, not a bug.
            Reconnect to bring the now-playing card back.
          </p>
          <button
            type="button"
            className="btn btn--primary"
            onClick={onReconnect ?? onConnect}
          >
            Reconnect Spotify
          </button>
          <ConnectLegal privacyUrl={privacyUrl} termsUrl={termsUrl} />
        </div>
      ) : status.state === 'connecting' ? (
        <div className="spotify__connect" aria-busy="true">
          <h3 className="panel__title">Connecting to Spotify…</h3>
          <p className="panel__hint">Finishing sign-in.</p>
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
          <ConnectLegal privacyUrl={privacyUrl} termsUrl={termsUrl} />
        </div>
      )}
    </section>
  );
}
