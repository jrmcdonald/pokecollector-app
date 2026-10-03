import { ActivityIndicator, StyleSheet, View } from 'react-native';

import type { CollectionItem, ScanMatch } from '@/api/schemas';
import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  useAddToWishlist,
  useCachedWishlist,
  useCard,
  useCollection,
  useIsOnline,
} from '@/hooks/queries';
import { useLargeText } from '@/hooks/use-large-text';
import { useOwnerLabel } from '@/hooks/use-owner-label';
import { radius, spacing, useColors } from '@/theme';
import { entriesForCard } from '@/utils/collection';
import { cardValue, formatPrice } from '@/utils/pricing';

import { MatchSummary } from './scan-confirm';

/**
 * A scanned card looked up, not added: what it is worth and whether it is
 * already owned, for a card in a shop or a friend's binder. The price costs
 * one request (scan candidates carry none), cached for the card's page; what
 * is owned comes from the collection the app already keeps.
 */
export function LookupResult({
  match,
  onScanAnother,
  onOpen,
  onAdd,
  onBack,
}: {
  match: ScanMatch;
  onScanAnother(): void;
  onOpen(): void;
  onAdd(): void;
  /** Back to the other candidates; none when this was the only one. */
  onBack?: () => void;
}) {
  const online = useIsOnline();
  const largeText = useLargeText();
  const wishlist = useCachedWishlist();
  const addToWishlist = useAddToWishlist();
  const wishlisted =
    addToWishlist.isSuccess || (wishlist ?? []).some((item) => item.card_id === match.id);

  return (
    <View style={styles.container}>
      <MatchSummary match={match} />
      <Price cardId={match.id} />
      <Ownership cardId={match.id} />
      <Button title="Scan another" onPress={onScanAnother} />
      <View style={[styles.row, largeText && styles.stacked]}>
        <Button
          title={wishlisted ? 'On your wishlist' : 'Add to wishlist'}
          variant="secondary"
          style={!largeText && styles.half}
          busy={addToWishlist.isPending}
          disabled={!online || wishlisted}
          onPress={() => addToWishlist.mutate(match.id)}
        />
        <Button
          title="Open the card"
          variant="secondary"
          style={!largeText && styles.half}
          onPress={onOpen}
        />
      </View>
      <Button title="Add to collection…" variant="secondary" disabled={!online} onPress={onAdd} />
      {onBack ? <Button title="Not this one?" variant="secondary" onPress={onBack} /> : null}
    </View>
  );
}

function Price({ cardId }: { cardId: string }) {
  const colors = useColors();
  const card = useCard(cardId);
  const c = card.data;

  if (!c) {
    return (
      <ThemedView background="surface" style={[styles.panel, { borderColor: colors.border }]}>
        {card.error ? (
          <>
            <ThemedText color="textSecondary">Couldn’t get the price.</ThemedText>
            <Button title="Try again" variant="secondary" onPress={() => card.refetch()} />
          </>
        ) : (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
            <ThemedText variant="label" color="textSecondary" accessibilityLiveRegion="polite">
              Getting the price…
            </ThemedText>
          </View>
        )}
      </ThemedView>
    );
  }

  const rows: [string, number | null | undefined][] = [
    ['Low', c.price_low],
    ['Market', c.price_market],
    ['30-day', c.price_avg30],
  ];
  const value = cardValue(c);
  return (
    <ThemedView background="surface" style={[styles.panel, { borderColor: colors.border }]}>
      <View
        accessible
        accessibilityLabel={`Trend price: ${formatPrice(value)}, Cardmarket, in euros`}>
        <ThemedText variant="overline" color="textSecondary">
          Trend · Cardmarket, €
        </ThemedText>
        <ThemedText variant="figure">{formatPrice(value)}</ThemedText>
      </View>
      <View
        accessible
        accessibilityLabel={rows.map(([label, v]) => `${label}: ${formatPrice(v)}`).join(', ')}>
        <ThemedText variant="caption" color="textSecondary">
          {rows.map(([label, v]) => `${label} ${formatPrice(v)}`).join(' · ')}
        </ThemedText>
      </View>
    </ThemedView>
  );
}

/** "You own 2 (Normal NM, Holo LP)", or that it is not owned; nothing until the collection is known. */
function Ownership({ cardId }: { cardId: string }) {
  const collection = useCollection();
  const owner = useOwnerLabel();
  if (!collection.data) return null;
  const entries = entriesForCard(collection.data, cardId);
  const count = entries.reduce((sum, item) => sum + item.quantity, 0);
  const text =
    count > 0
      ? `${owner ? `In ${owner}` : 'You own'}: ${count} (${describe(entries)})`
      : `Not in ${owner ?? 'your collection'}`;
  return (
    <View style={styles.owned} accessible accessibilityLabel={text}>
      {count > 0 ? <Icon name="checkmark.circle.fill" size={18} color="success" /> : null}
      <ThemedText variant="label" style={styles.ownedText}>
        {text}
      </ThemedText>
    </View>
  );
}

function describe(entries: readonly CollectionItem[]): string {
  return entries.map((item) => `${item.variant ?? 'Normal'} ${item.condition}`).join(', ');
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm + 4 },
  panel: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  loading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  owned: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ownedText: { flex: 1 },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
  stacked: { flexDirection: 'column' },
});
