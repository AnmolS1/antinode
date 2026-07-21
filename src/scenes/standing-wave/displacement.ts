/**
 * Standing Wave — the pure displacement math (no three, no GPU).
 *
 * This is the CPU reference for the surface the scene draws and the single
 * source of truth the TSL node in {@link ./field} mirrors. Keeping it framework-
 * free is what makes the "nodes stay pinned" and "no motion when reduced" claims
 * unit-testable without a renderer (see `tests/scenes/standing-wave`).
 *
 * The surface is a literal standing wave along x, extruded across z:
 *
 *   A(x, θ) = antinodeGain · Σ_{m=1..H} envₘ · sin(m·k·x) · cos(m·θ + φ)
 *
 * with k = 2π/λ. Every harmonic shares the fundamental's node set — the zeros of
 * sin(k·x) at x = n·π/k — because sin(m·k·(nπ/k)) = sin(mnπ) = 0 for all m. So
 * those x are nodes for *every* amplitude, bass level, and phase: pinned, exactly.
 * Antinodes sit halfway between, at x = (n+½)·π/k, where the surface breathes.
 */

/** Number of spatial harmonics summed into the surface. */
export const HARMONICS = 3;

/** Relative weight of each harmonic (fundamental loudest). Length {@link HARMONICS}. */
export const HARMONIC_ENVELOPE: readonly number[] = [1, 0.5, 0.25];

/** How much normalized bass (0–1) inflates the antinode amplitude. */
export const BASS_ANTINODE_GAIN = 1.2;

/** One evaluated wave state: everything {@link standingWaveHeight} needs per frame. */
export interface WaveSample {
  /** Base amplitude (the `amplitude` param), pre-bass. */
  amplitude: number;
  /** Normalized bass energy 0–1; breathes the antinodes. */
  bass: number;
  /** Spatial wavelength λ in world units (drives k = 2π/λ). */
  wavelength: number;
  /** Temporal phase θ in radians (advanced or beat-locked by {@link resolveTheta}). */
  theta: number;
  /** Static phase offset φ in radians. */
  phase: number;
}

/** Wavenumber k = 2π/λ, guarded against a zero/negative wavelength. */
export function waveNumber(wavelength: number): number {
  return (2 * Math.PI) / Math.max(1e-3, Math.abs(wavelength));
}

/** Amplitude after bass breathing — the peak height an antinode can reach. */
export function antinodeGain(s: Pick<WaveSample, 'amplitude' | 'bass'>): number {
  const bass = clamp01(s.bass);
  return s.amplitude * (1 + bass * BASS_ANTINODE_GAIN);
}

/**
 * Surface height at position `x` for the given wave state. Nodes (x = nπ/k) are
 * exactly zero for any amplitude/bass/phase; this is the property the tests pin.
 */
export function standingWaveHeight(x: number, s: WaveSample): number {
  const k = waveNumber(s.wavelength);
  const gain = antinodeGain(s);
  let sum = 0;
  for (let m = 1; m <= HARMONICS; m += 1) {
    const env = HARMONIC_ENVELOPE[m - 1] ?? 0;
    sum += env * Math.sin(m * k * x) * Math.cos(m * s.theta + s.phase);
  }
  return gain * sum;
}

/**
 * Fundamental node x-positions (where sin(k·x) = 0) within `[xMin, xMax]`.
 * These are the pinned points of the surface for the given wavelength.
 */
export function nodePositions(wavelength: number, xMin: number, xMax: number): number[] {
  const k = waveNumber(wavelength);
  const spacing = Math.PI / k; // = λ/2
  const out: number[] = [];
  const nStart = Math.ceil(xMin / spacing);
  const nEnd = Math.floor(xMax / spacing);
  for (let n = nStart; n <= nEnd; n += 1) out.push(n * spacing);
  return out;
}

/**
 * Fundamental antinode x-positions (where |sin(k·x)| = 1) within `[xMin, xMax]`.
 * Onset ripples are emitted from the one nearest a source point.
 */
export function antinodePositions(wavelength: number, xMin: number, xMax: number): number[] {
  const k = waveNumber(wavelength);
  const spacing = Math.PI / k;
  const out: number[] = [];
  const nStart = Math.ceil(xMin / spacing - 0.5);
  const nEnd = Math.floor(xMax / spacing - 0.5);
  for (let n = nStart; n <= nEnd; n += 1) out.push((n + 0.5) * spacing);
  return out;
}

/**
 * The antinode x nearest to `x`, clamped into `[xMin, xMax]`. This is the visual
 * thesis of the app: onsets ripple outward from the nearest breathing peak.
 */
export function nearestAntinode(
  x: number,
  wavelength: number,
  xMin: number,
  xMax: number,
): number {
  const k = waveNumber(wavelength);
  const spacing = Math.PI / k;
  const n = Math.round(x / spacing - 0.5);
  const candidate = (n + 0.5) * spacing;
  return Math.min(xMax, Math.max(xMin, candidate));
}

/** Inputs that decide the temporal phase for the next frame. */
export interface ThetaInput {
  /** Free-run angular frequency (rad/s) when the wave is not beat-locked. */
  freeOmega: number;
  /** Seconds since the previous frame. */
  dt: number;
  /** Estimated tempo, or null while unresolved. */
  bpm: number | null;
  /** Tempo/phase confidence 0–1. */
  confidence: number;
  /** Beat position 0–1 within the current beat. */
  beatPhase: number;
  /** Whether the `beatLock` param is on. */
  beatLock: boolean;
  /** Confidence at/above which the wave "stands on the beat". */
  confidenceThreshold: number;
  /** Engine-owned reduced-motion flag; when true the surface freezes. */
  reducedMotion: boolean;
}

/**
 * Advance (or lock, or freeze) the temporal phase θ.
 *
 * - **Reduced motion:** returns the previous θ unchanged — the surface holds
 *   still and the scene maps energy to brightness instead of movement.
 * - **Beat-locked** (param on, confident, tempo resolved): θ tracks the beat
 *   directly (`2π·beatPhase`) so antinodes peak *on* the beat — the wave stands.
 * - **Free-run:** θ accumulates at `freeOmega`, wrapped to [0, 2π).
 */
export function resolveTheta(prevTheta: number, o: ThetaInput): number {
  if (o.reducedMotion) return prevTheta;
  if (o.beatLock && o.bpm !== null && o.bpm > 0 && o.confidence >= o.confidenceThreshold) {
    return wrapTau(2 * Math.PI * o.beatPhase);
  }
  return wrapTau(prevTheta + o.freeOmega * Math.max(0, o.dt));
}

/** Wrap a phase into [0, 2π). */
export function wrapTau(theta: number): number {
  const tau = 2 * Math.PI;
  const r = theta % tau;
  return r < 0 ? r + tau : r;
}

/** Clamp to 0–1. */
export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** What the reduced-motion gate resolves each frame. */
export interface MotionState {
  /** Multiplier on the bass→antinode drive: 1 normally, 0 under reduced motion. */
  bassGate: number;
  /** Effective wavelength: base (no morph) under reduced motion, else mid-drifted. */
  effWavelength: number;
  /** Multiplier on ripple output: 1 normally, 0 under reduced motion. */
  rippleGate: number;
}

/** How strongly the eased mid-drift morphs the wavelength (normal program only). */
export const WAVELENGTH_MORPH = 0.25;

/**
 * The single decision point for the low-motion program. Under reduced motion the
 * design language forbids *movement* — so every audio-driven geometric motion is
 * silenced: bass antinode breathing (`bassGate → 0`), the mid-steered wavelength
 * morph (wavelength holds at its base, so node positions x = nπ/k never shift),
 * and onset ripples (`rippleGate → 0`). Energy still reads, but as brightness
 * ({@link energyBrightness}), not motion. Time-based motion (θ, camera/group drift)
 * is frozen separately by {@link resolveTheta} / the scene.
 */
export function motionGate(
  reducedMotion: boolean,
  baseWavelength: number,
  kDrift: number,
): MotionState {
  const base = Math.max(0.5, baseWavelength);
  if (reducedMotion) {
    return { bassGate: 0, effWavelength: base, rippleGate: 0 };
  }
  return {
    bassGate: 1,
    effWavelength: Math.max(0.5, base * (1 + kDrift * WAVELENGTH_MORPH)),
    rippleGate: 1,
  };
}

/**
 * The brightness the scene feeds the shader. In the normal program motion
 * carries the energy, so brightness is a steady floor plus a little high-end
 * shimmer. Under reduced motion the surface is frozen (see {@link resolveTheta}),
 * so **loudness drives brightness instead of movement** — the low-motion program
 * the design language requires ("amplitude-mapped brightness, no camera motion").
 */
export function energyBrightness(
  reducedMotion: boolean,
  loudNorm: number,
  high: number,
): number {
  const loud = clamp01(loudNorm);
  const hi = clamp01(high);
  return reducedMotion ? 0.2 + loud * 1.3 : 0.45 + hi * 0.2;
}
