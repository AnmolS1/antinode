/**
 * Render core (T03) public surface.
 *
 * The renderer bootstrap, feature→uniform bridge, scene framework, quality
 * governor, post chain, and feedback helper. T04 mounts a canvas and calls
 * {@link createRenderCore}; scenes (T06/T09) implement the `SceneModule`
 * contract and bind their TSL graphs to {@link FeatureUniforms}.
 *
 * The one placeholder scene and the fixture feature stream live under `./dev`
 * and are intentionally not re-exported here.
 */
export { RenderCore, createRenderCore } from './RenderCore';
export type { RenderCoreOptions } from './RenderCore';
export type {
  BackendPreference,
  PerfReadout,
  RenderCoreHooks,
  RenderSize,
  ThreeContext,
} from './types';

export {
  createRenderer,
  detectIsWebGPU,
  parseBackendPreference,
} from './renderer/bootstrap';
export type { RendererBootstrap } from './renderer/bootstrap';

export { FeatureUniforms, SPECTRUM_BINS } from './bridge/FeatureUniforms';

export { CROSSFADE_MS, SceneRegistry } from './scene/SceneRegistry';
export { FadeCompositor } from './scene/FadeCompositor';

export {
  DEFAULT_GOVERNOR_CONFIG,
  QUALITY_LADDER,
  QualityGovernor,
  decideStep,
  percentile,
} from './governor/QualityGovernor';
export type {
  GovernorConfig,
  GovernorState,
  QualityLevel,
} from './governor/QualityGovernor';

export { DEFAULT_BLOOM, PostChain } from './post/PostChain';
export type { BloomParams } from './post/PostChain';

export { FeedbackHelper } from './feedback/FeedbackHelper';

export { FrameLoop, MAX_DT_MS, clampDt } from './loop/FrameLoop';
