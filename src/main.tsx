import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './ui/App';
import { AudioEngine, type SceneBridge } from './audio/engine';
import { createRenderCore, type RenderCore } from './render';
import {
  diagnoseRendererFailure,
  probeBackends,
  type RendererDiagnosis,
} from './render/renderer/diagnose';
import type { ModRoute } from './render/modmatrix';
import { createHeritageScene } from './scenes/heritage';
import { createStandingWaveScene, STANDING_WAVE_MOD_ROUTES } from './scenes/standing-wave';
import { createPhosphorScene, PHOSPHOR_MOD_ROUTES } from './scenes/phosphor';
import { createRenderParamHost, sceneRoutesToMap } from './ui/params/renderParamHost';
import './theme/tokens.css';

// main.tsx is the boot seam. The render loop and audio engine are framework-free
// modules attached to `#stage`; React is mounted only on `#ui-root` for the chrome.
// This split is the whole point of the architecture (00-overview).
const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('antinode: #stage canvas missing from index.html');

const uiRoot = document.querySelector<HTMLElement>('#ui-root');
if (!uiRoot) throw new Error('antinode: #ui-root missing from index.html');

/** The default scene — "the name made visible" (00-overview). */
const DEFAULT_SCENE_ID = 'standing-wave';

// Engine ↔ core cycle: AudioEngine needs a SceneBridge to delegate setScene/scenes,
// but the RenderCore needs the engine at construction. Break the cycle with a closure
// holder — `core` is assigned before any bridge method fires (bridge methods only run
// from UI events, after mount). Declared here (not inside the try) so the catch's
// degraded mount can still hand the engine to <App>.
// Must be `let` (not const): the bridge closures capture `core` before it is assigned.
let core: RenderCore | undefined;
const bridge: SceneBridge = {
  setScene: (id) => {
    void core?.setScene(id);
  },
  scenes: () => core?.scenes() ?? [],
};
const engine = new AudioEngine({ sceneBridge: bridge });

// Same closure-holder trick as `bridge` above: the render core is built before
// React mounts, but a renderer that dies mid-session must still reach the screen.
// <App> registers its setter here on mount (T13).
let publishRuntimeError: ((d: RendererDiagnosis) => void) | null = null;

/**
 * The app's own backend marker (T13).
 *
 * We deliberately do NOT use `data-engine`: three.js stamps its own
 * `data-engine="three.js r185 webgpu"` onto the canvas during `renderer.init()`,
 * silently clobbering ours. That was verified live on 2026-08-02 — every e2e
 * assertion on `data-engine` was reading three's string, not the app's, and only
 * passed because the software-WebGL2 CI path races differently.
 */
// A `const` arrow (not a hoisted `function`) so TS keeps the non-null narrowing
// `canvas` earned from the guard above.
const markEngine = (
  value: 'booting' | 'webgpu' | 'webgl2' | 'webgl2-recovered' | 'error',
): void => {
  canvas.dataset.antinodeEngine = value;
};

void (async () => {
  try {
    markEngine('booting');
    core = await createRenderCore({
      canvas,
      engine,
      // T13: these hooks existed on RenderCoreHooks but were never passed, so
      // every render error — including the pre-existing context-lost toast —
      // went nowhere. A dead renderer was indistinguishable from a black scene.
      onError: (err) => console.error('antinode: render error', err),
      onToast: (msg) => console.info('antinode:', msg),
      onRendererAbandoned: (reason) => {
        markEngine('error');
        console.error('antinode: renderer abandoned', reason);
        // Re-probe rather than reuse a boot-time verdict: after a device loss
        // WebGL2 is usually still available, which makes `?gl=1` a real one-click
        // recovery instead of a dead end.
        publishRuntimeError?.(diagnoseRendererFailure(probeBackends()));
      },
    });

    // Register scenes (each factory needs the feature→uniform bridge; phosphor
    // also needs the shared feedback ping-pong buffer).
    core.registerScene(createHeritageScene(core.featureUniforms()));
    core.registerScene(createStandingWaveScene(core.featureUniforms()));
    core.registerScene(createPhosphorScene(core.featureUniforms(), core.feedbackBuffer()));

    await core.setScene(DEFAULT_SCENE_ID);
    core.start();
    markEngine(core.isWebGPU ? 'webgpu' : 'webgl2');

    // Default modulation routes per scene, normalized from each scene's
    // `{ source, target, amount }` export to the mod-matrix map (heritage ships none).
    const defaultRoutesByScene = new Map<string, ReadonlyMap<string, readonly ModRoute[]>>([
      ['standing-wave', sceneRoutesToMap(STANDING_WAVE_MOD_ROUTES)],
      ['phosphor', sceneRoutesToMap(PHOSPHOR_MOD_ROUTES)],
    ]);
    const host = createRenderParamHost({ core, defaultRoutesByScene });

    createRoot(uiRoot).render(
      <StrictMode>
        <App
          engine={engine}
          host={host}
          defaultSceneId={DEFAULT_SCENE_ID}
          registerRuntimeError={(fn) => {
            publishRuntimeError = fn;
          }}
        />
      </StrictMode>,
    );
  } catch (err) {
    // Renderer init failed. Still mount the chrome in a degraded state — without
    // the render core there is no params host (dock stays empty) and
    // `engine.scenes()` is empty (no visuals), but onboarding + source picker +
    // Spotify all work. Mounting unconditionally also preserves the landing
    // "Antinode" heading the e2e smoke asserts on.
    //
    // T13: this path used to be SILENT to sighted visitors — a `console.error`
    // and an `aria-label`, nothing more. The owner hit it with hardware
    // acceleration disabled in Chrome (no WebGPU *and* no WebGL2, so three's own
    // fallback threw on a null context) and saw only a black screen. We now probe
    // what the browser can actually do and say so on screen, in every phase.
    markEngine('error');
    const diagnosis = diagnoseRendererFailure(probeBackends());
    canvas.setAttribute('aria-label', `${diagnosis.headline} ${diagnosis.detail}`);
    console.error('antinode: engine/render boot failed', diagnosis.kind, err);
    createRoot(uiRoot).render(
      <StrictMode>
        <App engine={engine} bootError={diagnosis} />
      </StrictMode>,
    );
  }
})();
