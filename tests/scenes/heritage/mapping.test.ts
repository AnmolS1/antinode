import { IcosahedronGeometry } from 'three';
import { describe, expect, it } from 'vitest';

import {
  COMPAT_LEN,
  HERITAGE_LOUD_REF,
  HERITAGE_UAVG_GAIN,
  SRC_BINS,
  detectIndex,
  fillFrequencies,
  innerScaleFromLoud,
  spectrumCompat,
  uScaleFromLoud,
} from '../../../src/scenes/heritage/mapping';

describe('detectIndex (2023 duplicate-vertex dedup)', () => {
  it('numbers unique positions in first-seen order and maps every slot', () => {
    // slots: A, B, A, C, B  → uniques A=0, B=1, C=2 (first-seen order).
    const positions = [
      1, 0, 0, // A → 0
      0, 1, 0, // B → 1
      1, 0, 0, // A → 0
      0, 0, 1, // C → 2
      0, 1, 0, // B → 1
    ];
    const { slotUnique, uniqueCount } = detectIndex(positions);
    expect(uniqueCount).toBe(3);
    expect(Array.from(slotUnique)).toEqual([0, 1, 0, 2, 1]);
  });

  it('collapses -0 and +0 to the same unique (matches the original `===`)', () => {
    const positions = [0, 0, 0, -0, -0, -0];
    const { slotUnique, uniqueCount } = detectIndex(positions);
    expect(uniqueCount).toBe(1);
    expect(Array.from(slotUnique)).toEqual([0, 0]);
  });

  it('gives coherent shared ids for the real IcosahedronGeometry(40, 4)', () => {
    const geo = new IcosahedronGeometry(40, 4);
    const positions = geo.getAttribute('position').array;
    const { slotUnique, uniqueCount } = detectIndex(positions);
    // 500 faces ⇒ V - E + F = 2, E = 750 ⇒ V = 252 unique vertices.
    expect(slotUnique.length).toBe(1500);
    expect(uniqueCount).toBe(252);
    // Coherence: slots sharing a position share an id (spot-check a few).
    const idOf = new Map<string, number>();
    for (let s = 0; s < slotUnique.length; s += 1) {
      const key = `${positions[s * 3]},${positions[s * 3 + 1]},${positions[s * 3 + 2]}`;
      const id = slotUnique[s] as number;
      if (idOf.has(key)) expect(idOf.get(key)).toBe(id);
      else idOf.set(key, id);
    }
    expect(idOf.size).toBe(252);
    geo.dispose();
  });
});

describe('spectrumCompat (64 → 256 upsample)', () => {
  it('fills the whole compat table scaled 0..255', () => {
    const src = new Float32Array(SRC_BINS).fill(1);
    const out = new Float32Array(COMPAT_LEN);
    spectrumCompat(src, out);
    expect(out.length).toBe(COMPAT_LEN);
    for (let i = 0; i < COMPAT_LEN; i += 1) expect(out[i]).toBe(255);
  });

  it('maps zero to zero', () => {
    const out = new Float32Array(COMPAT_LEN).fill(9);
    spectrumCompat(new Float32Array(SRC_BINS), out);
    expect(Array.from(out).every((v) => v === 0)).toBe(true);
  });

  it('nearest-bin holds: p=0 reads bin 0, p=255 reads bin 63', () => {
    const src = new Float32Array(SRC_BINS);
    src[0] = 0.1; // → 25.5
    src[SRC_BINS - 1] = 0.5; // → 127.5
    const out = new Float32Array(COMPAT_LEN);
    spectrumCompat(src, out);
    expect(out[0]).toBeCloseTo(25.5, 5);
    expect(out[COMPAT_LEN - 1]).toBeCloseTo(127.5, 5);
  });
});

describe('fillFrequencies (2023 zigzag + index decay)', () => {
  it('reads compat[num+20], with num == i for the icosahedron range', () => {
    const compat = new Float32Array(COMPAT_LEN);
    compat[20] = 200; // num=0 → i=0
    compat[25] = 200; // num=5 → i=5
    const out = new Float32Array(300);
    fillFrequencies(compat, out, 300);
    // i=0: raw 200, decay 0 → 200
    expect(out[0]).toBeCloseTo(200, 5);
    // i=5: raw 200, decay 5/80 = 0.0625 → 199.9375
    expect(out[5]).toBeCloseTo(200 - 5 / 80, 5);
    // i=1: compat[21] == 0 → 0
    expect(out[1]).toBe(0);
  });

  it('zeroes vertices whose ramp index exceeds 150', () => {
    const compat = new Float32Array(COMPAT_LEN).fill(255);
    const out = new Float32Array(300);
    fillFrequencies(compat, out, 300);
    // i=150 → num=150 (not > 150): reads compat[170], nonzero.
    expect(out[150]).toBeGreaterThan(0);
    // i=151 → num=151 (> 150): forced to 0.
    expect(out[151]).toBe(0);
  });

  it('mirrors on the second ramp (i > 255): num = 255 - (i - 255)', () => {
    const compat = new Float32Array(COMPAT_LEN);
    compat[170] = 100; // reachable only when num == 150
    const out = new Float32Array(400);
    fillFrequencies(compat, out, 400);
    // i=360: mult=1, ramp=105, num=255-105=150 → compat[170]=100, decay 360/80=4.5
    expect(out[360]).toBeCloseTo(100 - 360 / 80, 5);
  });
});

describe('loudness transfer curve', () => {
  it('uScaleFromLoud is linear with the magic-gain product', () => {
    expect(uScaleFromLoud(0)).toBe(0);
    expect(uScaleFromLoud(1)).toBeCloseTo(HERITAGE_LOUD_REF * HERITAGE_UAVG_GAIN, 6);
    expect(HERITAGE_UAVG_GAIN).toBeCloseTo(3.468, 6);
  });

  it('innerScaleFromLoud rests at 1 and grows with loudness', () => {
    expect(innerScaleFromLoud(0)).toBe(1);
    expect(innerScaleFromLoud(1)).toBeGreaterThan(1);
    expect(innerScaleFromLoud(0.5)).toBeLessThan(innerScaleFromLoud(1));
  });
});
