/**
 * The standing-wave logotype glyph: fixed nodes as small dots, the central antinode
 * peaked — reads as a waveform, secretly a diagram of the name (02-design). Inlined
 * and themed with `var(--color-*)` so the theme toggle recolors it. `excited` bumps
 * the amplitude (loading/idle "the wave excites as audio arrives").
 */
export function Glyph({
  size = 64,
  excited = false,
  title = 'Antinode',
}: {
  size?: number;
  excited?: boolean;
  title?: string;
}) {
  const amp = excited ? 26 : 16;
  // A standing wave: two nodes pinned at the ends + middle, antinodes bulging between.
  const path = `M4 40 Q 30 ${40 - amp}, 56 40 T 108 40`;
  return (
    <svg
      className="glyph"
      width={size}
      height={size * (56 / 112)}
      viewBox="0 0 112 80"
      role="img"
      aria-label={title}
      fill="none"
    >
      <title>{title}</title>
      {/* envelope (faint) */}
      <path d={path} stroke="var(--color-crease)" strokeWidth="1.5" opacity="0.35" />
      <path
        d={`M4 40 Q 30 ${40 + amp}, 56 40 T 108 40`}
        stroke="var(--color-crease)"
        strokeWidth="1.5"
        opacity="0.35"
      />
      {/* the live antinode peak */}
      <path d={path} stroke="var(--color-phosphor)" strokeWidth="3" strokeLinecap="round" />
      {/* nodes: fixed dots where the wave crosses zero */}
      {[4, 56, 108].map((cx) => (
        <circle key={cx} cx={cx} cy="40" r="3.5" fill="var(--color-phosphor)" />
      ))}
    </svg>
  );
}
