/**
 * Why the renderer failed to start, and what the visitor can actually do about it.
 *
 * T13 root cause (2026-08-03, owner's Chrome 150.0.7871.187 / Apple M4 Pro):
 * hardware graphics acceleration was **off** in `chrome://settings`, so Chrome's
 * GPU process never booted. `navigator.gpu` still existed, WebGPU context
 * creation failed, three fell back to WebGL2 — and `getContext('webgl2')`
 * returned `null` too, which three does not null-check:
 *
 *   TypeError: Cannot read properties of null (reading 'getSupportedExtensions')
 *
 * `main.tsx` caught that and mounted the chrome in a degraded state with no
 * visible explanation: a black canvas, an empty scene switcher, an empty param
 * dock, and (3 s later, via the idle fade) an entirely blank page. The visitor
 * had no way to know their own browser setting was the cause.
 *
 * This module turns that dead end into an actionable message. The mapping is
 * pure so the suite can table-test every branch headlessly — which matters
 * because the failure only occurs where no GPU is available at all, and CI
 * cannot manufacture that state.
 */

/** What the browser could actually offer, sampled after a renderer init failure. */
export interface BackendProbe {
  /** `navigator.gpu` exists. The API surface being present says nothing about a device. */
  hasWebGPUApi: boolean;
  /** A *throwaway* canvas yielded a usable `webgl2` context. The decisive signal. */
  webgl2Available: boolean;
  /** Chromium-family UA — decides whether we can name the exact setting to flip. */
  isChromium: boolean;
}

/**
 * - `no-backend` — neither WebGPU nor WebGL2 is obtainable. Nothing can render.
 * - `webgl2-available` — WebGL2 works on a fresh canvas, so only the WebGPU
 *   attempt died; forcing the documented `?gl=1` fallback should boot.
 * - `unknown` — init failed for some other reason; show the raw error.
 */
export type RendererFailureKind = 'no-backend' | 'webgl2-available' | 'unknown';

export interface RendererDiagnosis {
  kind: RendererFailureKind;
  /** One short line naming what is wrong, in the visitor's terms. */
  headline: string;
  /** A sentence of context — why the screen is black. */
  detail: string;
  /** Ordered, concrete steps. Empty when we genuinely cannot advise. */
  remedy: readonly string[];
  /** When set, the panel offers a one-click reload into the WebGL2 fallback. */
  retryWithWebGL: boolean;
}

/**
 * Map a probe to a visitor-facing diagnosis. Pure — no DOM, no globals.
 *
 * The ordering matters: `webgl2Available` is checked first because it is the
 * only signal that distinguishes "this browser cannot render at all" from "the
 * WebGPU attempt died but the fallback is still viable". `hasWebGPUApi` is
 * deliberately NOT used to decide `no-backend`: on the owner's machine
 * `navigator.gpu` was present while the GPU process was disabled, so treating
 * the API's existence as a capability is exactly the mistake that produced the
 * silent failure in the first place.
 */
export function diagnoseRendererFailure(probe: BackendProbe): RendererDiagnosis {
  if (probe.webgl2Available) {
    return {
      kind: 'webgl2-available',
      headline: 'The GPU renderer could not start.',
      detail:
        'WebGPU failed to initialize on this machine, but your browser can still run the WebGL2 fallback. Antinode looks the same on both.',
      remedy: ['Reload in WebGL2 mode using the button below.'],
      retryWithWebGL: true,
    };
  }

  // No WebGL2 on a fresh canvas => no backend exists. Retrying cannot help.
  if (probe.isChromium) {
    return {
      kind: 'no-backend',
      headline: 'Graphics acceleration is turned off in your browser.',
      detail:
        'Antinode draws on the GPU, and your browser is currently blocking GPU access entirely — so neither WebGPU nor WebGL2 is available and the canvas stays black. Your hardware is almost certainly fine; this is a browser setting.',
      remedy: [
        'Open Settings → System (paste chrome://settings/system into the address bar).',
        'Turn on “Use graphics acceleration when available”.',
        'Relaunch the browser, then reload this page.',
        'Still black? Open chrome://gpu — if it says “GPU process was unable to boot”, the setting did not take effect.',
      ],
      retryWithWebGL: false,
    };
  }

  return {
    kind: 'no-backend',
    headline: 'This browser cannot give Antinode a GPU canvas.',
    detail:
      'Neither WebGPU nor WebGL2 is available here, so there is nothing to draw with. This is usually hardware acceleration being disabled in the browser’s settings.',
    remedy: [
      'Look for a “hardware acceleration” or “WebGL” setting in your browser’s preferences and enable it.',
      'Then relaunch the browser and reload this page.',
    ],
    retryWithWebGL: false,
  };
}

/**
 * Sample the browser's real capabilities. Impure — touches the DOM and UA.
 *
 * Uses a **throwaway** canvas, never `#stage`: a canvas that has been handed to
 * one context type can never yield another, so probing the live canvas would
 * poison the WebGL2 retry this diagnosis may be about to offer.
 */
export function probeBackends(): BackendProbe {
  let webgl2Available = false;
  try {
    const scratch = document.createElement('canvas');
    const gl = scratch.getContext('webgl2');
    webgl2Available = gl != null;
    // Hand the context back immediately; a probe should not hold a GPU context.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webgl2Available = false;
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return {
    hasWebGPUApi: typeof navigator !== 'undefined' && 'gpu' in navigator,
    webgl2Available,
    // Chrome/Edge/Brave/Opera/Arc all carry "Chrome/" and all expose
    // chrome://settings/system; Safari and Firefox do not.
    isChromium: /Chrome\//.test(ua),
  };
}
