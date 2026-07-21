/**
 * Asymmetric one-pole lag ("fast attack, slow decay") — the TouchDesigner Lag
 * CHOP behaviour (TD skill §8b) implemented once here and exported so scenes
 * (and the TD look-dev kit, T05) smooth identically.
 *
 * A value rising toward its target uses the (near-zero) `attack` time constant;
 * a value falling uses the longer `release`. Time constants are in **seconds**;
 * each step is framed by the real `dt` so behaviour is frame-rate independent.
 */

/** Attack/release time constants in seconds for one smoothed signal. */
export interface LagTuning {
  /** Rising time constant (seconds). ~0 snaps up instantly. */
  attack: number;
  /** Falling time constant (seconds). */
  release: number;
}

/**
 * Canonical per-feature lag constants (seconds). Shared with the TD look-dev
 * kit (T05) as the up-lag/down-lag reference so a look prototyped in TD is
 * smoothed the same as the web engine. attack = 0 everywhere (instant onset);
 * release lengthens toward the low end (heavy bass, snappy highs/flux).
 */
export const LAG_CONSTANTS = {
  bass: { attack: 0, release: 0.35 },
  lowMid: { attack: 0, release: 0.28 },
  mid: { attack: 0, release: 0.2 },
  high: { attack: 0, release: 0.12 },
  loudNorm: { attack: 0, release: 0.25 },
  flux: { attack: 0, release: 0.09 },
} as const satisfies Record<string, LagTuning>;

/**
 * One asymmetric-lag step.
 * @param prev    previous smoothed value.
 * @param target  new raw target.
 * @param dt      elapsed time since the previous step, seconds.
 * @param tuning  attack/release constants.
 * @returns the new smoothed value.
 */
export function lagStep(prev: number, target: number, dt: number, tuning: LagTuning): number {
  if (!Number.isFinite(prev)) prev = target;
  if (dt <= 0) return target;
  const tau = target >= prev ? tuning.attack : tuning.release;
  if (tau <= 0) return target;
  const alpha = 1 - Math.exp(-dt / tau);
  return prev + alpha * (target - prev);
}

/**
 * Stateful convenience wrapper around {@link lagStep} for a single scalar.
 * Exported for scene-side reuse (`lagSmooth(attack, release)` factory).
 */
export function lagSmooth(attack: number, release: number): (target: number, dt: number) => number {
  const tuning: LagTuning = { attack, release };
  let value = Number.NaN;
  return (target: number, dt: number): number => {
    value = lagStep(value, target, dt, tuning);
    return value;
  };
}
