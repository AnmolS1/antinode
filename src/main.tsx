import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './theme/tokens.css';

// main.tsx is the boot seam. The render loop and audio engine are framework-free
// modules that later waves attach to `#stage`; React is mounted only on `#ui-root`
// for the chrome. This split is the whole point of the architecture (00-overview).
const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('antinode: #stage canvas missing from index.html');
canvas.dataset.engine = 'pending'; // TODO(T03): boot WebGPU/WebGL2 renderer here.
// TODO(T02): boot AudioEngine, stream FrameFeatures into the active SceneModule.

const uiRoot = document.querySelector<HTMLElement>('#ui-root');
if (!uiRoot) throw new Error('antinode: #ui-root missing from index.html');

createRoot(uiRoot).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
