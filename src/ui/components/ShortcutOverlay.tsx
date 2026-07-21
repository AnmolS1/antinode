/**
 * Keyboard shortcut reference (`?`). A modal dialog; Escape or the close button
 * dismisses it. Focus moves to the dialog on open so keyboard users land inside it.
 */
import { useEffect, useRef } from 'react';

export interface ShortcutHint {
  keys: string;
  label: string;
}

export function ShortcutOverlay({
  shortcuts,
  onClose,
}: {
  shortcuts: ShortcutHint[];
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    globalThis.addEventListener('keydown', onKey);
    return () => globalThis.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay-scrim" onClick={onClose}>
      <div
        className="shortcuts panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shortcuts__head">
          <h2 id="shortcuts-title" className="panel__title">
            Keyboard shortcuts
          </h2>
          <button ref={closeRef} type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <dl className="shortcuts__list">
          {shortcuts.map((s) => (
            <div key={s.keys} className="shortcuts__row">
              <dt>
                <kbd className="mono">{s.keys}</kbd>
              </dt>
              <dd>{s.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
