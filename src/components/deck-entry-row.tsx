import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import type { Deck, DeckEntry } from '@/api/schemas';
import { entryCode, entryMissing } from '@/utils/decks';

import { CardImage } from './card-image';
import { ListRow } from './list-row';
import { ThemedText } from './themed-text';

/**
 * One card of a deck: how many the deck needs and, for a planned deck, how
 * many are still missing, in words so it never rests on colour.
 */
export function DeckEntryRow({
  deck,
  entry,
}: {
  deck: Pick<Deck, 'binder_type'>;
  entry: DeckEntry;
}) {
  const card = entry.card ?? { id: entry.card_id, name: entry.card_id };
  const code = entryCode(entry);
  const missing = entryMissing(deck, entry);
  const copies = `${entry.required_quantity} ${entry.required_quantity === 1 ? 'copy' : 'copies'}`;
  return (
    <ListRow
      title={card.name}
      subtitle={[code, copies].filter(Boolean).join(' · ')}
      leading={<CardImage card={card} size="small" style={styles.image} />}
      trailing={
        missing > 0 ? (
          <ThemedText variant="label" color="textSecondary">
            {missing} missing
          </ThemedText>
        ) : null
      }
      accessibilityLabel={[card.name, code, copies, missing > 0 ? `${missing} missing` : null]
        .filter(Boolean)
        .join(', ')}
      onPress={() => router.push({ pathname: '/card/[id]', params: { id: entry.card_id } })}
    />
  );
}

const styles = StyleSheet.create({
  image: { width: 40 },
});
