import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The render loop and audio engine are framework-free ES modules; React is only
// mounted beside the canvas for the chrome (see src/main.tsx). Vite serves both.
export default defineConfig({
  plugins: [react()],
  // host pinned to 127.0.0.1 so it matches Playwright's webServer probe exactly —
  // vite's default `localhost` can bind IPv6-only (::1), which the IPv4 probe misses
  // and the e2e job then times out waiting for the dev server.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
});
