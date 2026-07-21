/**
 * Album-art palette extraction (03-legal judgment call: extraction ON, distortion
 * NEVER — the art itself is only ever displayed intact). We sample the artwork on
 * a canvas and quantize to a few dominant swatches for scene tinting. Spotify's
 * CDN (`i.scdn.co`) allows anonymous CORS, so `crossOrigin = 'anonymous'` lets us
 * read pixels without tainting the canvas.
 */

/** Convert one 0–255 channel to a two-char hex. */
function hex2(n: number): string {
  return n.toString(16).padStart(2, '0');
}

function toHex(r: number, g: number, b: number): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
}

/**
 * Quantize RGBA pixel data into up to `count` dominant swatches, brightest-first.
 * Pure and DOM-free so the color logic is unit-testable. Buckets colors into a
 * coarse 4×4×4 cube, drops near-transparent and near-grey pixels, and returns the
 * most populous buckets as hex strings.
 */
export function quantize(pixels: Uint8ClampedArray, count = 3): string[] {
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const a = pixels[i + 3] ?? 0;
    if (a < 125) continue; // skip transparent
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min < 16 && max > 24 && max < 232) continue; // skip flat greys (keep near-black/white)
    const key = ((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6);
    const cur = buckets.get(key);
    if (cur) {
      cur.r += r;
      cur.g += g;
      cur.b += b;
      cur.n += 1;
    } else {
      buckets.set(key, { r, g, b, n: 1 });
    }
  }
  const ranked = [...buckets.values()].sort((x, y) => y.n - x.n).slice(0, count);
  return ranked.map((c) => toHex(Math.round(c.r / c.n), Math.round(c.g / c.n), Math.round(c.b / c.n)));
}

/**
 * Load `url` and extract its palette. Resolves to `[]` on any failure (no DOM, a
 * blocked image, a tainted canvas) so callers can treat palette as best-effort.
 */
export async function extractPalette(url: string | null, count = 3): Promise<string[]> {
  if (!url) return [];
  if (typeof document === 'undefined') return [];
  return new Promise<string[]>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve([]);
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        resolve(quantize(data, count));
      } catch {
        resolve([]); // tainted canvas or read failure
      }
    };
    img.onerror = () => resolve([]);
    img.src = url;
  });
}
