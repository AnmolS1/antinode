/**
 * A single polite live region for the whole app: announces track and scene changes to
 * screen readers without stealing focus. The visualizer canvas itself carries
 * `role="img"` (set in index.html); App keeps its `aria-label` in sync with the same
 * message so a non-sighted user gets a description of what is on screen.
 */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  );
}
