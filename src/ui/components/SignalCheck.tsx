/**
 * Signal-check screen: after a source is selected we show a live input meter. Real
 * signal → resolve (fade into the visualizer). Sustained silence (>= silenceMs with the
 * source active) → hand off to the steering flow. This is where the headphone case is
 * caught honestly instead of leaving a black screen.
 */
import { useEffect } from 'react';

import type { EngineFacade } from '../../contracts/engine';
import { useEngineSample, useLatest } from '../hooks';
import { Meter } from './Meter';

export function SignalCheck({
  engine,
  onSignal,
  onSilent,
  onBack,
  silenceMs = 3000,
}: {
  engine: EngineFacade;
  onSignal: () => void;
  onSilent: () => void;
  onBack: () => void;
  silenceMs?: number;
}) {
  const level = useEngineSample(engine, (f) => Math.round(f.loudNorm * 100) / 100, 0);
  const onSignalRef = useLatest(onSignal);
  const onSilentRef = useLatest(onSilent);

  useEffect(() => {
    let settled = false;
    const unsub = engine.onFrame((f) => {
      if (settled) return;
      if (!f.silent && f.loudNorm > 0.03) {
        settled = true;
        onSignalRef.current();
      }
    });
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        onSilentRef.current();
      }
    }, silenceMs);
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [engine, silenceMs, onSignalRef, onSilentRef]);

  return (
    <div className="signalcheck panel" role="status" aria-live="polite">
      <h2 className="panel__title">Listening for signal…</h2>
      <p className="panel__hint">Play something. If we can hear it, the wave will excite.</p>
      <Meter level={level} label="Input level" />
      <div className="panel__actions">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          Choose a different source
        </button>
      </div>
    </div>
  );
}
