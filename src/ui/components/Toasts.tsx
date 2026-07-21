/**
 * Minimal toast surface for error/info messages (renderer init failure, permission
 * denied, context lost). Errors are `role="alert"` (assertive); info is polite.
 */
import type { ToastKind } from '../context';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast--${t.kind}`}
          role={t.kind === 'error' ? 'alert' : 'status'}
        >
          <span className="toast__msg">{t.message}</span>
          <button
            type="button"
            className="toast__close"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(t.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
