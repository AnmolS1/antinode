import type { BandLevels, BeatInfo, FrameFeatures } from '../contracts';
import { BandMapper, BAND_NAMES, SPECTRUM_BINS } from './dsp/bands';
import { Fft } from './dsp/fft';
import { OnsetDetector, spectralFlux } from './dsp/flux';
import { LAG_CONSTANTS, lagStep, type LagTuning } from './dsp/lag';
import { PeakNormalizer, PercentileNormalizer, RollingStats, clamp01 } from './dsp/normalize';
import { TempoTracker } from './tempo';

/** Tunables for {@link Analyzer}; all have sensible defaults. */
export interface AnalyzerConfig {
  /** FFT length (power of two). Default 2048. */
  fftSize?: number;
  /** Percentile-normalizer window in frames (~8 s). Default 512. */
  normWindow?: number;
  /** Onset adaptive-threshold window in frames (~1.5 s). Default 96. */
  onsetWindow?: number;
  /** Per-bin EMA smoothing factor 0..1 (higher = smoother). Default 0.5. */
  binEma?: number;
  /** RMS below which a frame counts as silent. Default 1e-3. */
  silenceRms?: number;
  /** Sustained silence (seconds) before `silent` latches true. Default 3. */
  silenceHold?: number;
}

const BAND_TUNING: readonly LagTuning[] = [
  LAG_CONSTANTS.bass,
  LAG_CONSTANTS.lowMid,
  LAG_CONSTANTS.mid,
  LAG_CONSTANTS.high,
];

/**
 * Pure, allocation-free DSP core. Given a frame of linear time-domain samples
 * and its audio-clock time, produces one {@link FrameFeatures}. The returned
 * object (and its `spectrum`, `bands`, `beat` members) is reused every frame —
 * callers must consume or copy before the next `analyze()`.
 *
 * No Web Audio dependency: the engine reads samples from an `AnalyserNode` and
 * hands them here, and the unit tests hand synthetic signals to the same path.
 */
export class Analyzer {
  readonly sampleRate: number;
  readonly fftSize: number;

  private readonly fft: Fft;
  private readonly mapper: BandMapper;
  private readonly mag: Float32Array;
  private readonly logBins: Float32Array;
  private readonly smoothedBins: Float32Array;
  private readonly prevBins: Float32Array;
  private readonly spectrum: Float32Array; // reused output (frame.spectrum)
  private readonly bandEnergy: Float32Array;

  private readonly rmsNorm: PercentileNormalizer;
  private readonly bandNorm: PeakNormalizer[];
  private readonly fluxNorm: PeakNormalizer;
  private readonly specScale: RollingStats;
  private readonly onset: OnsetDetector;
  private readonly tempo: TempoTracker;

  private readonly laggedBands: Float32Array;
  private laggedLoud = 0;
  private laggedFlux = 0;

  private readonly binEma: number;
  private readonly silenceRms: number;
  private readonly silenceHold: number;
  private silentAccum = 0;
  private silenceEnabled = true;
  private lastT = Number.NaN;

  private readonly frame: FrameFeatures;

  constructor(sampleRate: number, config: AnalyzerConfig = {}) {
    this.sampleRate = sampleRate;
    this.fftSize = config.fftSize ?? 2048;
    const normWindow = config.normWindow ?? 512;
    const onsetWindow = config.onsetWindow ?? 96;
    this.binEma = config.binEma ?? 0.5;
    this.silenceRms = config.silenceRms ?? 1e-3;
    this.silenceHold = config.silenceHold ?? 3;

    this.fft = new Fft(this.fftSize);
    this.mapper = new BandMapper(this.fftSize, sampleRate);
    this.mag = new Float32Array(this.fftSize >> 1);
    this.logBins = new Float32Array(SPECTRUM_BINS);
    this.smoothedBins = new Float32Array(SPECTRUM_BINS);
    this.prevBins = new Float32Array(SPECTRUM_BINS);
    this.spectrum = new Float32Array(SPECTRUM_BINS);
    this.bandEnergy = new Float32Array(BAND_NAMES.length);

    this.rmsNorm = new PercentileNormalizer(normWindow, 0.1, 0.95);
    this.bandNorm = BAND_NAMES.map(() => new PeakNormalizer(normWindow, 0.95));
    this.fluxNorm = new PeakNormalizer(normWindow, 0.95);
    this.specScale = new RollingStats(normWindow);
    this.onset = new OnsetDetector(onsetWindow);
    this.tempo = new TempoTracker();
    this.laggedBands = new Float32Array(BAND_NAMES.length);

    const bands: BandLevels = { bass: 0, lowMid: 0, mid: 0, high: 0 };
    const beat: BeatInfo = { bpm: null, phase: 0, confidence: 0 };
    this.frame = {
      t: 0,
      rms: 0,
      loudNorm: 0,
      bands,
      spectrum: this.spectrum,
      flux: 0,
      onset: false,
      beat,
      silent: false,
    };
  }

  /** Seed BPM from the live realtime-bpm-analyzer. */
  hintBpm(bpm: number): void {
    this.tempo.hintBpm(bpm);
  }

  /** Enable/disable silence latching (off for the procedural source). */
  setSilenceEnabled(on: boolean): void {
    this.silenceEnabled = on;
    if (!on) this.silentAccum = 0;
  }

  /** Reset per-source transient state (tempo anchor, silence timer). */
  reset(): void {
    this.tempo.reset();
    this.silentAccum = 0;
    this.lastT = Number.NaN;
  }

  /**
   * Analyse one frame.
   * @param time linear PCM samples, length ≥ fftSize.
   * @param t    audio-clock time in seconds.
   * @returns the reused {@link FrameFeatures} snapshot.
   */
  analyze(time: Float32Array, t: number): FrameFeatures {
    // First frame contributes no elapsed time (so silence/lag track true
    // wall-clock); subsequent frames clamp to a tiny positive dt.
    const dt = Number.isFinite(this.lastT) ? Math.max(1e-4, t - this.lastT) : 0;
    this.lastT = t;

    // RMS over the time block.
    let sumSq = 0;
    const n = this.fftSize;
    for (let i = 0; i < n; i++) {
      const s = time[i] ?? 0;
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / n);

    // Spectrum → 64 log bins → per-bin EMA smoothing.
    this.fft.magnitude(time, this.mag);
    this.mapper.toLogBins(this.mag, this.logBins);
    const a = this.binEma;
    let peak = 0;
    for (let i = 0; i < SPECTRUM_BINS; i++) {
      const prev = this.smoothedBins[i] ?? 0;
      const cur = this.logBins[i] ?? 0;
      const sm = prev * a + cur * (1 - a);
      this.smoothedBins[i] = sm;
      if (sm > peak) peak = sm;
    }

    // Spectral flux (positive delta of smoothed bins) → onset.
    const flux = spectralFlux(this.smoothedBins, this.prevBins, SPECTRUM_BINS);
    this.prevBins.set(this.smoothedBins);
    const onset = this.onset.process(flux, t);
    if (onset) this.tempo.onOnset(t);

    // Band energy → per-band auto-gain → asymmetric lag.
    this.mapper.toBandEnergy(this.mag, this.bandEnergy);
    const bands = this.frame.bands;
    for (let b = 0; b < BAND_NAMES.length; b++) {
      const raw = this.bandNorm[b]?.normalize(this.bandEnergy[b] ?? 0) ?? 0;
      const lagged = lagStep(this.laggedBands[b] ?? 0, raw, dt, BAND_TUNING[b] ?? LAG_CONSTANTS.mid);
      this.laggedBands[b] = lagged;
    }
    bands.bass = this.laggedBands[0] ?? 0;
    bands.lowMid = this.laggedBands[1] ?? 0;
    bands.mid = this.laggedBands[2] ?? 0;
    bands.high = this.laggedBands[3] ?? 0;

    // Loudness (p10–p95) and flux (p95) normalization, both lagged.
    const loudRaw = this.rmsNorm.normalize(rms);
    this.laggedLoud = lagStep(this.laggedLoud, loudRaw, dt, LAG_CONSTANTS.loudNorm);
    const fluxRaw = this.fluxNorm.normalize(flux);
    this.laggedFlux = lagStep(this.laggedFlux, fluxRaw, dt, LAG_CONSTANTS.flux);

    // Normalized + smoothed spectrum (divide by rolling p95 of the peak bin).
    this.specScale.push(peak);
    const denom = this.specScale.quantile(0.95);
    if (denom > 1e-12) {
      for (let i = 0; i < SPECTRUM_BINS; i++) {
        this.spectrum[i] = clamp01((this.smoothedBins[i] ?? 0) / denom);
      }
    } else {
      this.spectrum.fill(0);
    }

    // Silence latch.
    let silent = false;
    if (this.silenceEnabled) {
      if (rms < this.silenceRms) this.silentAccum += dt;
      else this.silentAccum = 0;
      silent = this.silentAccum >= this.silenceHold;
    }

    // Tempo/beat.
    this.tempo.writeBeat(t, this.frame.beat);

    const f = this.frame;
    f.t = t;
    f.rms = rms;
    f.loudNorm = this.laggedLoud;
    f.flux = this.laggedFlux;
    f.onset = onset;
    f.silent = silent;
    return f;
  }
}
