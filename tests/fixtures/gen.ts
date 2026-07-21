/**
 * Deterministic audio-signal fixtures for the T02 DSP tests.
 *
 * These are in-memory `Float32Array` generators — the unit tests feed the same
 * linear time-domain samples the live engine hands its `Analyzer` (via
 * `AnalyserNode.getFloatTimeDomainData`), so no Web Audio, no `decodeAudioData`,
 * and no committed binary WAVs are required (jsdom can do none of those). A
 * `toWav` helper is included for optionally materialising a fixture on disk /
 * in the dev harness, but tests never depend on it.
 */

/** Seeded PRNG (mulberry32) so noise fixtures are reproducible across runs. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Silence: `n` zero samples. */
export function silence(n: number): Float32Array {
  return new Float32Array(n);
}

/** A pure sine tone. */
export function sine(freq: number, sampleRate: number, n: number, amp = 0.5): Float32Array {
  const out = new Float32Array(n);
  const w = (2 * Math.PI * freq) / sampleRate;
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin(w * i);
  return out;
}

/** A linear-frequency sine sweep from `f0` to `f1`. */
export function sineSweep(
  f0: number,
  f1: number,
  sampleRate: number,
  n: number,
  amp = 0.5,
): Float32Array {
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const f = f0 + ((f1 - f0) * i) / n;
    phase += (2 * Math.PI * f) / sampleRate;
    out[i] = amp * Math.sin(phase);
  }
  return out;
}

/** Approximate pink noise via a simple IIR filter over white noise (Paul Kellet). */
export function pinkNoise(sampleRate: number, n: number, amp = 0.5, seed = 1): Float32Array {
  const rand = mulberry32(seed);
  const out = new Float32Array(n);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  void sampleRate;
  for (let i = 0; i < n; i++) {
    const white = rand() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    out[i] = amp * pink * 0.11;
  }
  return out;
}

/** A click/impulse track fixture with its ground-truth beat times. */
export interface ClickTrack {
  samples: Float32Array;
  sampleRate: number;
  bpm: number;
  /** Beat onset times in seconds. */
  beatTimes: number[];
}

/**
 * A click track: short broadband bursts at a fixed BPM over a silent bed.
 * Each click is a few-ms exponentially-decaying noise burst so it has energy
 * across the spectrum (a clean onset for flux detection).
 */
export function clickTrack(
  bpm: number,
  sampleRate: number,
  durationSec: number,
  amp = 0.8,
  seed = 7,
): ClickTrack {
  const n = Math.floor(durationSec * sampleRate);
  const out = new Float32Array(n);
  const rand = mulberry32(seed);
  const period = 60 / bpm;
  const burstLen = Math.floor(0.004 * sampleRate); // 4 ms
  const beatTimes: number[] = [];
  for (let t = 0; t < durationSec; t += period) {
    const start = Math.floor(t * sampleRate);
    if (start >= n) break;
    beatTimes.push(t);
    for (let j = 0; j < burstLen && start + j < n; j++) {
      const env = Math.exp(-j / (burstLen * 0.3));
      out[start + j] = amp * (rand() * 2 - 1) * env;
    }
  }
  return { samples: out, sampleRate, bpm, beatTimes };
}

/**
 * Slide a `fftSize` analysis window across `signal` in `hop`-sample steps,
 * invoking `fn(window, t)` where `t` is the window-centre time in seconds.
 * The reusable window buffer mimics the engine reading the AnalyserNode.
 */
export function forEachFrame(
  signal: Float32Array,
  sampleRate: number,
  fftSize: number,
  hop: number,
  fn: (window: Float32Array, t: number) => void,
): void {
  const win = new Float32Array(fftSize);
  for (let start = 0; start + fftSize <= signal.length; start += hop) {
    win.set(signal.subarray(start, start + fftSize));
    const t = (start + fftSize / 2) / sampleRate;
    fn(win, t);
  }
}

/** Encode mono PCM as a 16-bit WAV (optional; tests don't rely on this). */
export function toWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const writeStr = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}
