import { createRenderCore } from '../RenderCore';
import { createDevSpectrumScene } from './devSpectrumScene';
import { MockEngine } from './mockFeatures';

/**
 * Standalone dev harness for the render core — the T03 boot path, independent of
 * the app's `src/main.tsx` (which T04 owns). Served by `dev.html` in this
 * folder. Mounts a canvas, boots the core against the synthetic
 * {@link MockEngine} fixture, registers the placeholder scene, and shows a tiny
 * perf HUD. Keyboard: `b` toggles bloom, `l` toggles an artificial GPU load so
 * the governor can be seen stepping down and recovering.
 */
export async function bootHarness(canvas: HTMLCanvasElement, hud?: HTMLElement): Promise<void> {
  let setSceneRef: (id: string) => void = () => {};
  const engine = new MockEngine(
    () => core?.scenes() ?? [],
    (id) => setSceneRef(id),
  );

  const core = await createRenderCore({
    canvas,
    engine,
    onError: (err) => {
      if (hud) hud.textContent = `Renderer error: ${err.message}`;
    },
    onToast: (msg) => {
      if (hud) hud.dataset['toast'] = msg;
    },
  });

  setSceneRef = (id) => void core.setScene(id);

  core.registerScene(createDevSpectrumScene(core.featureUniforms()));
  await core.setScene('dev-spectrum');
  core.start();

  let burnOn = false;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'b') core.setBloom(!core.readout().bloom);
    if (e.key === 'l') {
      burnOn = !burnOn;
      core.setArtificialLoad(burnOn ? 12 : 0);
    }
  });

  if (hud) {
    const paint = (): void => {
      const r = core.readout();
      hud.textContent =
        `${r.isWebGPU ? 'WebGPU' : 'WebGL2'}  ` +
        `${r.fps.toFixed(0)} fps  p75 ${r.frameMs.toFixed(1)}ms  ` +
        `Q${r.qualityLevel} (dpr ${r.dprScale} rs ${r.renderScale} sq ${r.sceneQuality})  ` +
        `bloom ${r.bloom ? 'on' : 'off'}`;
      requestAnimationFrame(paint);
    };
    paint();
  }
}

// Auto-boot when loaded directly by dev.html.
if (typeof document !== 'undefined') {
  const canvas = document.getElementById('render-canvas');
  const hud = document.getElementById('hud');
  if (canvas instanceof HTMLCanvasElement) {
    void bootHarness(canvas, hud ?? undefined);
  }
}
