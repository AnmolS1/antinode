/**
 * Typed access to the one Spotify env var. The client ID is *public* (PKCE uses
 * no secret), so it ships in the built bundle from an env var — never hardcoded.
 * Owner sets `VITE_SPOTIFY_CLIENT_ID` in `.env.local` (see src/spotify/README.md).
 * Merges with vite/client's ImportMetaEnv via interface declaration merging.
 */
interface ImportMetaEnv {
  readonly VITE_SPOTIFY_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
