import { defineConfig, devices } from '@playwright/test';

// Cross-browser matrix per 00-overview (Chrome, Firefox, Safari/WebKit; Waterfox
// is validated manually in T10 as an ESR-based Firefox). CI runs the chromium
// smoke subset; the full matrix is the T10 gate.
//
// baseURL is overridable via PLAYWRIGHT_BASE_URL so a later deploy-smoke can
// point the same specs at a preview URL. When it is set to a non-local origin we
// do NOT spin up the dev server.
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const IS_LOCAL = /(^|\/\/)(127\.0\.0\.1|localhost)(:|\/|$)/.test(BASE_URL);

// Flags that give headless Chromium a working software WebGL2/WebGPU backend and
// let the AudioContext + <audio> element start without a synthetic user gesture
// (Playwright's programmatic file-pick does not count as autoplay activation).
// NOTE: we deliberately do NOT force a real GPU/WebGPU adapter here. Software
// WebGL2 (SwiftShader) is the deterministic baseline on GPU-less CI runners and
// matches what headless Chromium resolves to locally; forcing Vulkan/WebGPU made
// the backend nondeterministic across parallel workers. On a GPU-equipped runner
// the default path naturally resolves to WebGPU with no flag change needed.
const CHROMIUM_ARGS = [
  '--autoplay-policy=no-user-gesture-required',
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--enable-unsafe-swiftshader',
];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  // The soak spec self-gates on process.env.SOAK; per-PR runs never touch it.
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  ...(IS_LOCAL
    ? {
        webServer: {
          command: 'npm run dev',
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: CHROMIUM_ARGS },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        launchOptions: {
          firefoxUserPrefs: {
            'media.navigator.streams.fake': true,
            'media.autoplay.default': 0,
            'media.autoplay.blocking_policy': 0,
            // Software fallback so CI without a GPU still renders WebGL2.
            'webgl.force-enabled': true,
            'gfx.webrender.software': true,
          },
        },
      },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
});
