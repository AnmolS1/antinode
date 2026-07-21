/**
 * Public surface of the T02 audio engine. The UI (T04/T07) constructs an
 * {@link AudioEngine} and drives it through the {@link EngineFacade} contract;
 * scenes (T06/T09) consume the emitted {@link FrameFeatures}.
 */
export { AudioEngine, type EngineOptions, type SceneBridge } from './engine';
export { Analyzer, type AnalyzerConfig } from './analyzer';
export { detectCapabilities, probeEnvironment, type CapabilityProbe } from './capabilities';
export { TempoTracker, createLiveTempo, type LiveTempo } from './tempo';

export {
  createSource,
  FileSource,
  InputSource,
  DisplayCaptureSource,
  ProceduralSource,
  type SourceOptions,
  type InputDevice,
} from './sources';

// DSP primitives — exported so scenes can reuse the smoothing helpers (the plan
// calls for `lagSmooth` to be shared) and tests can unit-check the internals.
export { Fft } from './dsp/fft';
export { BandMapper, SPECTRUM_BINS, BAND_EDGES, BAND_NAMES, type BandName } from './dsp/bands';
export {
  RollingStats,
  PercentileNormalizer,
  PeakNormalizer,
  clamp01,
} from './dsp/normalize';
export {
  lagStep,
  lagSmooth,
  LAG_CONSTANTS,
  type LagTuning,
} from './dsp/lag';
export {
  OnsetDetector,
  spectralFlux,
  MAX_ONSETS_PER_SEC,
  MIN_ONSET_INTERVAL,
} from './dsp/flux';
