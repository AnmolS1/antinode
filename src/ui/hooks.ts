/**
 * React hooks for the shell. None of these run in the rAF hot path: the engine's
 * per-frame stream is sampled at <=10 Hz for meters (React never re-renders at 60fps),
 * per 02-design / T04.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import type { EngineFacade } from '../contracts/engine';
import type { FrameFeatures } from '../contracts/features';

/**
 * Keep a ref pointing at the latest value without mutating it during render (the newer
 * react-hooks rules forbid render-phase ref writes). The sync runs after every commit.
 */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

/**
 * Subscribe to the engine's frame stream but only surface a *derived* value,
 * resampled on a fixed interval (default 100ms = 10 Hz). Keeps meters lively while
 * keeping React out of the 60fps path. `select` maps a frame to something cheap to
 * compare; `isEqual` guards against needless re-renders.
 */
export function useEngineSample<T>(
  engine: EngineFacade,
  select: (f: FrameFeatures) => T,
  initial: T,
  hz = 10,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const [value, setValue] = useState<T>(initial);
  const selectRef = useLatest(select);
  const equalRef = useLatest(isEqual);
  const pending = useRef<T>(initial);
  const committed = useRef<T>(initial);

  useEffect(() => {
    pending.current = selectRef.current(engine.latest());
    const unsub = engine.onFrame((f) => {
      pending.current = selectRef.current(f);
    });
    const period = Math.max(16, Math.round(1000 / hz));
    const timer = setInterval(() => {
      if (!equalRef.current(committed.current, pending.current)) {
        committed.current = pending.current;
        setValue(pending.current);
      }
    }, period);
    return () => {
      unsub();
      clearInterval(timer);
    };
    // selectRef/equalRef are stable ref containers; engine + hz drive re-subscription.
  }, [engine, hz, selectRef, equalRef]);

  return value;
}

/**
 * Observed feature-stream rate (frames/sec), updated once a second. This is an honest
 * mock-side number; the real FPS + quality-governor stats come from a T03 hook wired at
 * the Wave B gate, so the perf HUD's `backend`/quality fields stay placeholders here.
 */
export function useFrameRate(engine: EngineFacade): number {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let count = 0;
    const unsub = engine.onFrame(() => {
      count += 1;
    });
    const timer = setInterval(() => {
      setFps(count);
      count = 0;
    }, 1000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [engine]);
  return fps;
}

/** True when the user asked for reduced motion; the UI calms its own transitions. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof globalThis.matchMedia !== 'function') return;
    const mq = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (): void => setReduced(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export interface IdleFade {
  /** True when the chrome should be faded out (idle > timeout and not pinned). */
  hidden: boolean;
  /** When pinned, the chrome never auto-fades (`Space` toggles this). */
  pinned: boolean;
  togglePin: () => void;
  /** Call to register activity (any input restores the chrome). */
  poke: () => void;
}

/**
 * Auto-fade the chrome after `timeoutMs` idle; any pointer/key input restores it;
 * pinning holds it visible. Listeners are passive and off the render path.
 */
export function useIdleFade(timeoutMs = 3000): IdleFade {
  const [hidden, setHidden] = useState(false);
  const [pinned, setPinned] = useState(false);
  const lastActivity = useRef<number>(0);
  const pinnedRef = useLatest(pinned);

  const poke = useCallback(() => {
    lastActivity.current = Date.now();
    setHidden(false);
  }, []);

  const togglePin = useCallback(() => {
    setPinned((p) => {
      const next = !p;
      if (next) setHidden(false);
      return next;
    });
  }, []);

  useEffect(() => {
    lastActivity.current = Date.now();
    const onActivity = (): void => poke();
    globalThis.addEventListener('pointermove', onActivity, { passive: true });
    globalThis.addEventListener('pointerdown', onActivity, { passive: true });
    globalThis.addEventListener('keydown', onActivity);
    const timer = setInterval(() => {
      if (pinnedRef.current) return;
      if (Date.now() - lastActivity.current >= timeoutMs) setHidden(true);
    }, 500);
    return () => {
      globalThis.removeEventListener('pointermove', onActivity);
      globalThis.removeEventListener('pointerdown', onActivity);
      globalThis.removeEventListener('keydown', onActivity);
      clearInterval(timer);
    };
  }, [poke, timeoutMs, pinnedRef]);

  return { hidden, pinned, togglePin, poke };
}

/** A keyboard action: label (for the shortcut overlay) + the handler. */
export interface Shortcut {
  key: string;
  label: string;
  run: () => void;
}

/**
 * Bind global keyboard shortcuts. Ignores keystrokes while a text input/textarea is
 * focused, and lets a focused control keep its own Space/Enter activation. Matches by
 * `event.key`. `shortcuts` should be memoized by the caller.
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
        const interactive =
          tag === 'BUTTON' || tag === 'A' || target.getAttribute('role') === 'button';
        if (interactive && (e.key === ' ' || e.key === 'Enter')) return;
      }
      const match = shortcuts.find((s) => s.key === e.key);
      if (match) {
        e.preventDefault();
        match.run();
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [shortcuts, enabled]);
}
