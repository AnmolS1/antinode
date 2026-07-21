/** Shared toast types used by the toast surface and the App orchestrator. */
export type ToastKind = 'error' | 'info';

export interface ToastInput {
  kind: ToastKind;
  message: string;
}
