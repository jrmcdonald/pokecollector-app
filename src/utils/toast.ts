/**
 * In-app notices: errors and confirmations shown as a themed banner rather
 * than a system alert. A tiny store, so code outside React (mutation
 * callbacks) can raise one. Confirmations before something destructive stay
 * native alerts; these are for telling, not asking.
 */

export type ToastKind = 'error' | 'success' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

type Listener = (toast: Toast | null) => void;

let current: Toast | null = null;
let nextId = 1;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener(current);
}

/** Shows a notice, replacing any on screen. Returns its id. */
export function showToast(toast: Omit<Toast, 'id'>): number {
  current = { ...toast, id: nextId++ };
  emit();
  return current.id;
}

/** Hides the notice with this id, if it is still the one showing. */
export function dismissToast(id: number): void {
  if (current?.id !== id) return;
  current = null;
  emit();
}

export function subscribeToToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function currentToast(): Toast | null {
  return current;
}

/** How long a notice stays: longer for errors, and for longer messages. */
export function toastDuration(toast: Pick<Toast, 'kind' | 'message'>): number {
  const base = toast.kind === 'error' ? 5000 : 3000;
  return base + Math.min(4000, (toast.message?.length ?? 0) * 40);
}
