/**
 * The param dock. Wraps the Tweakpane view in a real, sized panel with a
 * collapse-to-icon toggle.
 *
 * Two load-bearing details:
 *  1. `<ParamsPane>` stays MOUNTED when collapsed; only its wrapper is hidden
 *     with CSS. Unmounting would rebuild Tweakpane (DOM, MIDI subscription,
 *     localStorage reads) on every toggle AND drop the `PaneApi` that the
 *     `[` / `]` / `R` shortcuts depend on — collapsing the panel must not
 *     disable preset cycling and randomize.
 *  2. The dock renders inside `.chrome`, so it keeps fading with the rest of the
 *     UI for free. Nothing here needs to know about the idle fade.
 */
import { useState } from 'react';

import type { EngineFacade } from '../../contracts/engine';
import { ParamsPane, type PaneApi } from '../params/ParamsPane';
import { loadDockOpen, saveDockOpen } from '../params/presets';
import type { ParamHost } from '../params/types';

export function ParamDock({
  engine,
  host,
  onReady,
}: {
  engine: EngineFacade;
  /** Omitted in unit tests; without it the pane body stays empty. */
  host?: ParamHost;
  onReady?: (api: PaneApi) => void;
}) {
  const [open, setOpen] = useState(() => loadDockOpen());

  const toggle = (): void => {
    setOpen((prev) => {
      const next = !prev;
      saveDockOpen(next);
      return next;
    });
  };

  return (
    <div className={`dock${open ? ' dock--open' : ''}`}>
      <button
        type="button"
        className="dock__toggle btn btn--ghost"
        aria-expanded={open}
        aria-controls="dock-body"
        onClick={toggle}
      >
        <span aria-hidden="true">⚙</span>
        <span className="visually-hidden">Scene controls</span>
      </button>
      <div id="dock-body" className={`dock__body${open ? '' : ' dock__body--hidden'}`}>
        {host && <ParamsPane engine={engine} host={host} {...(onReady ? { onReady } : {})} />}
      </div>
    </div>
  );
}
