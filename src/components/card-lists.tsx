import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { bindersWithCard } from '@/api/binders';
import { decksWithCard } from '@/api/decks';
import { useBinderContents, useDeckContents } from '@/hooks/queries';
import { radius, spacing, useColors } from '@/theme';
import { binderColor, binderKind } from '@/utils/binders';
import { isRealDeck } from '@/utils/decks';

import { ListRow } from './list-row';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

function copies(count: number): string {
  return count === 1 ? '1 copy' : `${count} copies`;
}

interface CardList {
  id: number;
  name: string;
  color?: string | null;
  kind: string;
  copies: number;
}

/**
 * The decks or binders that hold a card, each opening its page. Nothing at
 * all when none do, or before they have been read: it is extra, so it never
 * holds the page up or shows an error of its own.
 */
function CardLists({
  lists,
  noun,
  pathname,
}: {
  lists: CardList[];
  noun: 'deck' | 'binder';
  pathname: '/deck/[id]' | '/binder/[id]';
}) {
  const colors = useColors();
  if (lists.length === 0) return null;

  return (
    <ThemedView background="surface" style={[styles.panel, { borderColor: colors.border }]}>
      <ThemedText variant="heading" style={styles.heading}>
        {lists.length === 1 ? `In 1 ${noun}` : `In ${lists.length} ${noun}s`}
      </ThemedText>
      {lists.map((list) => (
        <ListRow
          key={list.id}
          title={list.name}
          subtitle={`${list.kind} · ${copies(list.copies)}`}
          leading={
            <View
              style={[
                styles.swatch,
                {
                  backgroundColor: binderColor(list, colors.accent),
                  borderColor: colors.border,
                },
              ]}
            />
          }
          onPress={() =>
            router.push({ pathname, params: { id: String(list.id), name: list.name } })
          }
        />
      ))}
    </ThemedView>
  );
}

/** The decks that list this card. */
export function CardDecks({ cardId }: { cardId: string }) {
  const contents = useDeckContents();
  const decks = decksWithCard(contents.data ?? [], cardId).map((deck) => ({
    ...deck,
    kind: isRealDeck(deck) ? 'Real Deck' : 'Planned',
  }));
  return <CardLists lists={decks} noun="deck" pathname="/deck/[id]" />;
}

/** The binders that hold or plan this card. */
export function CardBinders({ cardId }: { cardId: string }) {
  const contents = useBinderContents();
  const binders = bindersWithCard(contents.data ?? [], cardId).map((binder) => ({
    ...binder,
    kind: binderKind(binder),
  }));
  return <CardLists lists={binders} noun="binder" pathname="/binder/[id]" />;
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
  // As on the Decks and Binders screens.
  swatch: { width: 14, height: 40, borderRadius: radius.sm / 2, borderWidth: 1 },
});
