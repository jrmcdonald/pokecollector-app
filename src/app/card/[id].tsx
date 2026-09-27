import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import {
  CONDITIONS,
  VARIANTS,
  type Card,
  type CollectionItem,
  type Condition,
  type SearchResponse,
  type Variant,
} from '@/api/schemas';
import { Button } from '@/components/button';
import { CardImage } from '@/components/card-image';
import { Chips } from '@/components/chips';
import { QuantityStepper } from '@/components/quantity-stepper';
import { ErrorState, GridSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  useAddToCollection,
  useAddToWishlist,
  useCard,
  useCollection,
  useIsOnline,
  useSetQuantity,
} from '@/hooks/queries';
import { useSession } from '@/session/session';
import { radius, spacing, useColors } from '@/theme';
import { entriesForCard } from '@/utils/collection';
import { cardValue, formatPrice } from '@/utils/pricing';

export default function CardDetail() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const card = useCard(id);
  const collection = useCollection();
  const online = useIsOnline();
  const entries = entriesForCard(collection.data, id);
  const setName = useSetName(id, entries);

  const c = card.data;
  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: c?.name ?? '' }} />
      {c ? (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={card.isRefetching}
              onRefresh={() => Promise.all([card.refetch(), collection.refetch()])}
              tintColor={colors.textSecondary}
            />
          }>
          <CardImage card={c} size="large" style={styles.image} />
          <View style={styles.heading}>
            <ThemedText variant="title">{c.name}</ThemedText>
            <ThemedText color="textSecondary">
              {[setName ?? c.set_id?.toUpperCase(), c.number, c.rarity].filter(Boolean).join(' · ')}
            </ThemedText>
          </View>

          <Prices card={c} />

          {!online ? (
            <ThemedText variant="caption" color="textSecondary">
              Offline: changes need a connection.
            </ThemedText>
          ) : null}

          <Owned entries={entries} disabled={!online} />
          <AddCopies card={c} disabled={!online} />
        </ScrollView>
      ) : card.error ? (
        <ErrorState error={card.error} onRetry={() => card.refetch()} />
      ) : (
        <GridSkeleton columns={1} rows={1} />
      )}
    </ThemedView>
  );
}

/**
 * The card endpoint has no set name, only an id. The collection or an
 * earlier search usually has it already, so look there before settling for
 * the id.
 */
function useSetName(cardId: string, entries: CollectionItem[]): string | null {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const fromCollection = entries.find((e) => e.card?.set_ref?.name)?.card?.set_ref?.name;
  if (fromCollection) return fromCollection;
  if (session.status !== 'signedIn') return null;
  for (const [, data] of queryClient.getQueriesData<{ pages: SearchResponse[] }>({
    queryKey: [session.cacheId, 'search'],
  })) {
    for (const page of data?.pages ?? []) {
      const hit = page.data.find((result) => result.id === cardId);
      if (hit?.set_ref?.name) return hit.set_ref.name;
    }
  }
  return null;
}

function Prices({ card }: { card: Card }) {
  const rows: [string, number | null | undefined][] = [
    ['Trend', card.price_trend],
    ['Market', card.price_market],
    ['Low', card.price_low],
    ['30-day average', card.price_avg30],
  ];
  if (card.variants_reverse || card.price_trend_holo) {
    rows.push(['Reverse holo trend', card.price_trend_holo]);
  }
  return (
    <ThemedView background="surface" style={styles.panel}>
      <ThemedText variant="heading">Prices</ThemedText>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.priceRow}>
          <ThemedText color="textSecondary">{label}</ThemedText>
          <ThemedText>{formatPrice(value)}</ThemedText>
        </View>
      ))}
      <ThemedText variant="caption" color="textSecondary">
        Cardmarket, in euros.
      </ThemedText>
    </ThemedView>
  );
}

function Owned({ entries, disabled }: { entries: CollectionItem[]; disabled: boolean }) {
  const setQuantity = useSetQuantity();
  if (entries.length === 0) return null;

  const change = (item: CollectionItem, quantity: number) => {
    if (quantity > 0) {
      setQuantity.mutate({ item, quantity });
      return;
    }
    Alert.alert('Remove from collection?', `${item.variant ?? 'Normal'}, ${item.condition}`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => setQuantity.mutate({ item, quantity }),
      },
    ]);
  };

  return (
    <ThemedView background="surface" style={styles.panel}>
      <ThemedText variant="heading">In your collection</ThemedText>
      {entries.map((item) => (
        <View key={item.id} style={styles.ownedRow}>
          <View style={styles.ownedText}>
            <ThemedText variant="label">{item.variant ?? 'Normal'}</ThemedText>
            <ThemedText variant="caption" color="textSecondary">
              {item.condition} · {formatPrice(cardValue(item.card, item.variant))} each
            </ThemedText>
          </View>
          <QuantityStepper
            label={`${item.variant ?? 'Normal'} ${item.condition}`}
            value={item.quantity}
            onChange={(q) => change(item, q)}
            disabled={disabled}
          />
        </View>
      ))}
    </ThemedView>
  );
}

/** The variants this printing exists in, per the catalogue; all of them if it does not say. */
function availableVariants(card: Card): Variant[] {
  const flags: [Variant, boolean | null | undefined][] = [
    ['Normal', card.variants_normal],
    ['Holo', card.variants_holo],
    ['Reverse Holo', card.variants_reverse],
    ['First Edition', card.variants_first_edition],
  ];
  const known = flags.filter(([, flag]) => flag).map(([variant]) => variant);
  return known.length > 0 ? known : [...VARIANTS];
}

function AddCopies({ card, disabled }: { card: Card; disabled: boolean }) {
  const variants = useMemo(() => availableVariants(card), [card]);
  const [variant, setVariant] = useState<Variant>(variants[0] ?? 'Normal');
  const [condition, setCondition] = useState<Condition>('NM');
  const [quantity, setQuantity] = useState(1);
  const add = useAddToCollection();
  const wishlist = useAddToWishlist();

  return (
    <ThemedView background="surface" style={styles.panel}>
      <ThemedText variant="heading">Add copies</ThemedText>
      <Chips<Variant>
        label="Variant"
        options={variants.map((v) => ({ value: v, label: v }))}
        value={variant}
        onChange={setVariant}
      />
      <Chips<Condition>
        label="Condition"
        options={CONDITIONS.map((v) => ({ value: v, label: v }))}
        value={condition}
        onChange={setCondition}
      />
      <View style={styles.ownedRow}>
        <ThemedText>Quantity</ThemedText>
        <QuantityStepper label="Copies to add" value={quantity} onChange={setQuantity} min={1} />
      </View>
      <Button
        title={`Add ${quantity} to collection`}
        busy={add.isPending}
        disabled={disabled}
        onPress={() =>
          add.mutate(
            { card_id: card.id, variant, condition, quantity },
            {
              onSuccess: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
                  () => undefined,
                );
                setQuantity(1);
              },
            },
          )
        }
      />
      <Button
        title={wishlist.isSuccess ? 'On your wishlist' : 'Add to wishlist'}
        variant="secondary"
        busy={wishlist.isPending}
        disabled={disabled || wishlist.isSuccess}
        onPress={() => wishlist.mutate(card.id)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  image: { width: '75%', alignSelf: 'center', borderRadius: radius.md },
  heading: { gap: spacing.xs },
  panel: { padding: spacing.md, borderRadius: radius.md, gap: spacing.sm },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between' },
  ownedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  ownedText: { flex: 1, gap: 2 },
});
