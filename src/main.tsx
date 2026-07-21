import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './ui/App';
import { AudioEngine, type SceneBridge } from './audio/engine';
import { createRenderCore, type RenderCore } from './render';
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

void (async () => {
  try {
    canvas.dataset.engine = 'booting';
    core = await createRenderCore({ canvas, engine });

    // Register scenes (each factory needs the feature→uniform bridge; phosphor
    // also needs the shared feedback ping-pong buffer).
    core.registerScene(createHeritageScene(core.featureUniforms()));
    core.registerScene(createStandingWaveScene(core.featureUniforms()));
    core.registerScene(createPhosphorScene(core.featureUniforms(), core.feedbackBuffer()));

    await core.setScene(DEFAULT_SCENE_ID);
    core.start();
    canvas.dataset.engine = core.isWebGPU ? 'webgpu' : 'webgl2';

    // Default modulation routes per scene, normalized from each scene's
    // `{ source, target, amount }` export to the mod-matrix map (heritage ships none).
    const defaultRoutesByScene = new Map<string, ReadonlyMap<string, readonly ModRoute[]>>([
      ['standing-wave', sceneRoutesToMap(STANDING_WAVE_MOD_ROUTES)],
      ['phosphor', sceneRoutesToMap(PHOSPHOR_MOD_ROUTES)],
    ]);
    const host = createRenderParamHost({ core, defaultRoutesByScene });

    createRoot(uiRoot).render(
      <StrictMode>
        <App engine={engine} host={host} defaultSceneId={DEFAULT_SCENE_ID} />
      </StrictMode>,
    );
  } catch (err) {
    // Renderer init failed (no WebGPU/WebGL2). Surface it, then still mount the
    // chrome in a degraded state — without the render core there is no params
    // host (dock stays empty) and `engine.scenes()` is empty (no visuals), but
    // onboarding + source picker + Spotify all work. Mounting unconditionally
    // also preserves the landing "Antinode" heading the e2e smoke asserts on.
    canvas.dataset.engine = 'error';
    canvas.setAttribute('aria-label', 'Audio visualizer failed to start — your browser may not support WebGL2.');
    console.error('antinode: engine/render boot failed', err);
    createRoot(uiRoot).render(
      <StrictMode>
        <App engine={engine} />
      </StrictMode>,
    );
  }
})();
