/**
 * The renderer-failed panel (T13).
 *
 * When `createRenderCore` throws there is no canvas, no scene switcher and no
 * param dock — the app still "works" but draws nothing. Before this panel the
 * only trace was a `console.error` and the canvas `aria-label`, so a sighted
 * visitor saw a black rectangle and no reason for it.
 *
 * Two placement rules, both load-bearing:
 *  1. It renders OUTSIDE `.chrome`. The idle fade sets `.chrome.ui-hidden {
 *     opacity: 0 }` after 3 s — an error inside it would state the problem and
 *     then disappear, which is precisely the blank screen this fixes.
 *  2. It renders in EVERY phase, including onboarding, so the visitor learns the
 *     visuals cannot work *before* picking a source rather than after.
 */
import { useState } from 'react';

import type { RendererDiagnosis } from '../../render/renderer/diagnose';

export function BootError({ diagnosis }: { diagnosis: RendererDiagnosis }) {
  // Dismissible on purpose, and only by an explicit click. The panel sits over
  // the source picker, and audio capture + Spotify still work without a renderer
  // — so trapping the visitor behind an un-closable dialog would be its own bug.
  // A user choosing to close it is nothing like the idle fade silently hiding it.
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const retry = (): void => {
    // `?gl=1` is the documented WebGL2 override (renderer/bootstrap.ts). Preserve
    // any existing query so a shared preset/debug flag survives the retry.
    const url = new URL(window.location.href);
    url.searchParams.set('gl', '1');
    window.location.href = url.toString();
  };

  return (
    <div className="boot-error panel" role="alert" aria-live="assertive">
      <h2 className="boot-error__headline">{diagnosis.headline}</h2>
      <p className="boot-error__detail">{diagnosis.detail}</p>
      {diagnosis.remedy.length > 0 && (
        <ol className="boot-error__remedy">
          {diagnosis.remedy.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      <div className="panel__actions">
        {diagnosis.retryWithWebGL && (
          <button type="button" className="btn" onClick={retry}>
            Reload in WebGL2 mode
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={() => setDismissed(true)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
