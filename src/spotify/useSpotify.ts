/**
 * React binding for {@link SpotifyController}. At the Wave-B gate, App.tsx calls
 * this behind the feature flag and spreads the result into `<SpotifyArea>`:
 *
 *   const sp = useSpotify();
 *   <SpotifyArea status={sp.status} nowPlaying={sp.nowPlaying} palette={sp.palette}
 *                stale={sp.stale} onConnect={sp.connect} onDisconnect={sp.disconnect}
 *                onReconnect={sp.reconnect} />
 *
 * On mount it completes any pending `/callback` exchange and resumes an existing
 * session, and it re-polls when the tab becomes visible again.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { SpotifyController } from './controller';
import type { ControllerOptions, SpotifyView } from './controller';

export interface UseSpotify extends SpotifyView {
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
}

export function useSpotify(options: ControllerOptions = {}): UseSpotify {
  // Lazy state initializer builds the controller exactly once; using state (not a
  // ref) keeps it out of render-time ref reads (react-hooks/refs).
  const [controller] = useState(() => new SpotifyController(options));
  const [view, setView] = useState<SpotifyView>(() => controller.getView());

  useEffect(() => {
    const unsub = controller.subscribe(setView);
    void controller.completeRedirect();

    const onVisible = (): void => {
      if (globalThis.document?.visibilityState === 'visible') controller.resyncNow();
    };
    globalThis.document?.addEventListener('visibilitychange', onVisible);
    return () => {
      unsub();
      globalThis.document?.removeEventListener('visibilitychange', onVisible);
    };
  }, [controller]);

  const connect = useCallback((): void => {
    void controller.connect();
  }, [controller]);
  const disconnect = useCallback((): void => {
    controller.disconnect();
  }, [controller]);
  const reconnect = useCallback((): void => {
    void controller.reconnect();
  }, [controller]);

  return useMemo(
    () => ({ ...view, connect, disconnect, reconnect }),
    [view, connect, disconnect, reconnect],
  );
}
