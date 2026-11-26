/**
 * The removal waiting on the user to clear what blocks it: one at a time,
 * app-wide, shown by `RemovalConflictSheet` in the root layout. Opened by a
 * bulk removal or by a single copy taken to 0, whichever upstream refused.
 */
import { useSyncExternalStore } from 'react';

import type { RemovalConflict } from '@/api/removal';

export type PendingRemoval = {
  conflict: RemovalConflict;
  /** Removes again, the same entries, once they are clear. */
  retry(): Promise<unknown>;
  /** After the removal finally goes through. */
  onRemoved?(): void;
};

let pending: PendingRemoval | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function openRemovalConflict(next: PendingRemoval) {
  pending = next;
  emit();
}

/** Keeps the removal, with upstream's newer answer. */
export function updateRemovalConflict(conflict: RemovalConflict) {
  if (!pending) return;
  pending = { ...pending, conflict };
  emit();
}

export function closeRemovalConflict() {
  pending = null;
  emit();
}

export function usePendingRemoval(): PendingRemoval | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending,
    () => pending,
  );
}
