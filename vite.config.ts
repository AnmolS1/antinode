import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The render loop and audio engine are framework-free ES modules; React is only
// mounted beside the canvas for the chrome (see src/main.tsx). Vite serves both.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { target: 'es2022', sourcemap: true },
});
