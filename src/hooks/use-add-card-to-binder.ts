import type { Binder, CollectionItem } from '@/api/schemas';
import { useAddToBinder } from '@/hooks/queries';
import { isPlanned } from '@/utils/binders';
import { pick } from '@/utils/pick';
import { showToast } from '@/utils/toast';

/**
 * Puts a card in a binder: the card itself in a planned binder; in a
 * collection binder, which holds exact collection entries, one owned copy,
 * asking which when there are several. A card not owned cannot go in one.
 */
export function useAddCardToBinder() {
  const add = useAddToBinder();

  async function addCard(
    binder: Pick<Binder, 'id' | 'name' | 'binder_type'>,
    cardId: string,
    entries: readonly CollectionItem[],
    onSuccess?: () => void,
  ) {
    if (isPlanned(binder)) {
      add.mutate({ binderId: binder.id, cardId }, { onSuccess });
      return;
    }
    if (entries.length === 0) {
      showToast({
        kind: 'info',
        title: 'Not in your collection',
        message: `“${binder.name}” holds cards you own. Add a copy first, or use a planned binder.`,
      });
      return;
    }
    let entry = entries[0];
    if (entries.length > 1) {
      const entryIndex = await pick(
        'Which copy?',
        entries.map((e) => `${e.variant ?? 'Normal'}, ${e.condition} (×${e.quantity})`),
      );
      entry = entryIndex === null ? undefined : entries[entryIndex];
    }
    if (entry) add.mutate({ binderId: binder.id, collectionItemId: entry.id }, { onSuccess });
  }

  return { ...add, addCard };
}
