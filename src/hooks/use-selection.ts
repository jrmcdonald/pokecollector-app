import { useCallback, useMemo, useState } from 'react';

import { MAX_BATCH } from '@/api/removal';
import { showToast } from '@/utils/toast';

/**
 * Choosing several cards on a screen, to act on them together. `ids` are
 * the ones on show: a card filtered away, or gone after a refresh, leaves
 * the selection. Upstream takes at most 500 in one batch.
 */
export function useSelection(ids: readonly number[]) {
  const [active, setActive] = useState(false);
  const [chosen, setChosen] = useState<ReadonlySet<number>>(new Set());

  // Only what is on show counts: a card filtered away, or gone after a
  // refresh, is not acted on, without an effect to prune it.
  const selected = useMemo(() => {
    const visible = new Set(ids);
    return new Set([...chosen].filter((id) => visible.has(id)));
  }, [ids, chosen]);

  const toggle = useCallback((id: number) => {
    setChosen((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else if (next.size >= MAX_BATCH) {
        showToast({ kind: 'info', title: `Up to ${MAX_BATCH} at a time` });
        return previous;
      } else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (ids.length > MAX_BATCH) {
      showToast({
        kind: 'info',
        title: `Up to ${MAX_BATCH} at a time`,
        message: 'Filter the list down first.',
      });
      return;
    }
    setChosen(new Set(ids));
  }, [ids]);

  const enter = useCallback(() => {
    setChosen(new Set());
    setActive(true);
  }, []);
  const cancel = useCallback(() => {
    setChosen(new Set());
    setActive(false);
  }, []);

  return {
    active,
    selected,
    count: selected.size,
    allSelected: ids.length > 0 && selected.size === ids.length,
    isSelected: (id: number) => selected.has(id),
    toggle,
    selectAll,
    clear: () => setChosen(new Set()),
    enter,
    cancel,
  };
}
export type Selection = ReturnType<typeof useSelection>;
