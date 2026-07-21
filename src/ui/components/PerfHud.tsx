/**
 * Perf HUD — mono type, lab-readout styling. `fps` is the observed feature-stream rate
 * (real, from the mock); `backend`/quality are Wave B placeholders until the T03 stats
 * hook is wired. Toggleable so it never clutters by default.
 */
export function PerfHud({ fps, backend = '—' }: { fps: number; backend?: string }) {
  return (
    <dl className="perfhud mono" aria-label="Performance readout">
      <div className="perfhud__row">
        <dt>fps</dt>
        <dd>{fps.toString().padStart(3, ' ')}</dd>
      </div>
      <div className="perfhud__row">
        <dt>backend</dt>
        <dd>{backend}</dd>
      </div>
    </dl>
  );
}
