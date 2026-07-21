/**
 * Mini TSL hsv->rgb, drop-in for TD's `TDHSVToRGB` (hue in 0..1).
 * Provided so a look that used TDHSVToRGB ports without depending on a specific
 * three build exporting `hsvtorgb`. See ../../PORTING.md §3.
 *
 * Import surface ('three/tsl') is the r185 TSL entry point per 00-overview.md.
 */
import { Fn, vec3, clamp, abs, fract, mix } from 'three/tsl';

// hsv.x = hue 0..1, .y = sat 0..1, .z = value 0..1  -> rgb 0..1
export const hsvToRgb = Fn(([hsv]: [any]) => {
  const h = hsv.x;
  const s = hsv.y;
  const v = hsv.z;
  const k = vec3(0.0, 4.0, 2.0);
  const p = abs(fract(h.add(k.div(6.0))).mul(6.0).sub(3.0));
  return v.mul(mix(vec3(1.0), clamp(p.sub(1.0), 0.0, 1.0), s));
});
