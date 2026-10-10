import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { decksWithCard } from '@/api/decks';
import { useDeckContents } from '@/hooks/queries';
import { radius, spacing, useColors } from '@/theme';
import { binderColor } from '@/utils/binders';
import { isRealDeck } from '@/utils/decks';

import { ListRow } from './list-row';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

function copies(count: number): string {
  return count === 1 ? '1 copy' : `${count} copies`;
}

/**
 * The decks that list this card, each opening the deck's page. Nothing at
 * all when none do, or before the decks have been read: it is extra, so it
 * never holds the page up or shows an error of its own.
 */
export function CardDecks({ cardId }: { cardId: string }) {
  const colors = useColors();
  const contents = useDeckContents();
  const decks = decksWithCard(contents.data ?? [], cardId);
  if (decks.length === 0) return null;

  return (
    <ThemedView background="surface" style={[styles.panel, { borderColor: colors.border }]}>
      <ThemedText variant="heading" style={styles.heading}>
        {decks.length === 1 ? 'In 1 deck' : `In ${decks.length} decks`}
      </ThemedText>
      {decks.map((deck) => (
        <ListRow
          key={deck.id}
          title={deck.name}
          subtitle={`${isRealDeck(deck) ? 'Real Deck' : 'Planned'} · ${copies(deck.copies)}`}
          leading={
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor: binderColor(deck, colors.accent),
                  borderColor: colors.border,
                },
              ]}
            />
          }
          onPress={() =>
            router.push({
              pathname: '/deck/[id]',
              params: { id: String(deck.id), name: deck.name },
            })
          }
        />
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  // The rows run edge to edge, as in a list, with their own padding.
  panel: {
    paddingTop: spacing.md,
    borderRadius: radius.lg - 2,
    borderWidth: 1,
    overflow: 'hidden',
  },
  heading: { paddingHorizontal: spacing.md, marginBottom: spacing.xs },
  // As on the Decks screen.
  swatch: { width: 14, height: 40, borderRadius: radius.sm / 2, borderWidth: 1 },
});
