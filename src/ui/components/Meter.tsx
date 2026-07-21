/**
 * A lab-instrument level meter: thin stroke, phosphor trace on graphite. Purely
 * presentational; the caller feeds a 0–1 `level` sampled at <=10 Hz. The numeric
 * readout is mono per 02-design (numbers that move are always mono).
 */
export function Meter({
  level,
  label,
  showValue = true,
}: {
  level: number;
  label: string;
  showValue?: boolean;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, level)) * 100);
  return (
    <div className="meter">
      <div className="meter__head">
        <span className="meter__label">{label}</span>
        {showValue && (
          <span className="meter__value" aria-hidden="true">
            {pct.toString().padStart(3, '0')}
          </span>
        )}
      </div>
      <div
        className="meter__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="meter__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
