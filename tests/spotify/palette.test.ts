import { describe, expect, it } from 'vitest';

import { extractPalette, quantize } from '../../src/spotify/palette';

/** Build RGBA pixel data from [r,g,b,a] tuples. */
function pixels(...rgba: Array<[number, number, number, number]>): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length * 4);
  rgba.forEach(([r, g, b, a], i) => {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a;
  });
  return out;
}

describe('palette quantize', () => {
  it('returns the dominant color as a hex string', () => {
    const data = pixels(
      [200, 20, 20, 255],
      [210, 30, 25, 255],
      [205, 25, 22, 255],
      [20, 200, 40, 255],
    );
    const swatches = quantize(data, 2);
    expect(swatches[0]).toMatch(/^#[0-9a-f]{6}$/);
    // The reddish bucket has three votes vs one → it ranks first.
    const [r] = [parseInt(swatches[0]!.slice(1, 3), 16)];
    expect(r).toBeGreaterThan(150);
  });

  it('skips transparent pixels', () => {
    const data = pixels([255, 0, 0, 0], [255, 0, 0, 10], [30, 120, 200, 255]);
    const swatches = quantize(data, 3);
    expect(swatches).toHaveLength(1); // only the opaque blue survives
  });

  it('returns [] when there is nothing to sample', () => {
    expect(quantize(new Uint8ClampedArray(0))).toEqual([]);
  });
});

describe('extractPalette', () => {
  it('resolves to [] for a null art URL', async () => {
    expect(await extractPalette(null)).toEqual([]);
  });
});
