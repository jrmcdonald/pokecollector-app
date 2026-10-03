import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

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
import { CardImage, frameForVariant } from '@/components/card-image';
import { Chips } from '@/components/chips';
import { Icon } from '@/components/icon';
import { PrintingDetailsPicker } from '@/components/printing-details-picker';
import { QuantityStepper } from '@/components/quantity-stepper';
import { ErrorState, GridSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  useAddToBinder,
  useAddToCollection,
  useAddToWishlist,
  useBinders,
  useCard,
  useCardPhoto,
  useCollection,
  useIsOnline,
  useSetQuantity,
  useUpdateCopy,
} from '@/hooks/queries';
import { useLargeText } from '@/hooks/use-large-text';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useOwnerLabel } from '@/hooks/use-owner-label';
import { useSession } from '@/session/session';
import { radius, spacing, useColors } from '@/theme';
import { binderKind, bindersOnly, isPlanned } from '@/utils/binders';
import { CameraDeniedError, takeCardPhoto, type PhotoSource } from '@/utils/card-photo';
import { entriesForCard } from '@/utils/collection';
import { hasCatalogueImage } from '@/utils/images';
import { pick } from '@/utils/pick';
import { showToast } from '@/utils/toast';
import { cardValue, formatPrice } from '@/utils/pricing';
import { defaultVariant } from '@/utils/variants';

export default function CardDetail() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const card = useCard(id);
  const collection = useCollection();
  const pull = usePullToRefresh(() => Promise.all([card.refetch(), collection.refetch()]));
  const online = useIsOnline();
  const entries = entriesForCard(collection.data, id);
  const setName = useSetName(id, entries);

  // The name is the large heading under the card; the bar shows it only once
  // that heading has scrolled out of view, so it is never on screen twice.
  const [headingBottom, setHeadingBottom] = useState(Number.POSITIVE_INFINITY);
  const [showTitle, setShowTitle] = useState(false);

  const c = card.data;
  const holo = entries.some((e) => frameForVariant(e.variant) === 'holo');
  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: showTitle ? (c?.name ?? '') : '' }} />
      {c ? (
        <ScrollView
          contentContainerStyle={styles.content}
          scrollEventThrottle={32}
          onScroll={(event) => {
            const past = event.nativeEvent.contentOffset.y > headingBottom;
            if (past !== showTitle) setShowTitle(past);
          }}
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.textSecondary}
            />
          }>
          <CardImage
            card={c}
            size="large"
            style={styles.image}
            frame={holo ? 'holo' : 'plain'}
            photoItemId={entries.find((e) => e.has_scan_photo)?.id}
          />
          {hasCatalogueImage(c) ? null : (
            <OwnPhoto cardId={c.id} entries={entries} disabled={!online} />
          )}
          <View
            style={styles.heading}
            onLayout={(event) => {
              const { y, height } = event.nativeEvent.layout;
              setHeadingBottom(y + height / 2);
            }}>
            <ThemedText variant="title">{c.name}</ThemedText>
            <View style={styles.tags}>
              {[setName ?? c.set_id?.toUpperCase(), c.number, c.rarity]
                .filter((t): t is string => !!t)
                .map((tag, i) => (
                  <ThemedView key={`${i}-${tag}`} background="surfaceRaised" style={styles.tag}>
                    <ThemedText variant={i === 1 ? 'figureSmall' : 'caption'}>{tag}</ThemedText>
                  </ThemedView>
                ))}
            </View>
          </View>

          <Prices card={c} />

          {!online ? (
            <ThemedText variant="caption" color="textSecondary">
              Offline: changes need a connection.
            </ThemedText>
          ) : null}

          <Owned entries={entries} disabled={!online} />
          <AddCopies card={c} disabled={!online} />
          <AddToBinder card={c} entries={entries} disabled={!online} />
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
 * For a card the catalogue has no picture of: the owner's own photo of their
 * copy, taken or chosen here. Upstream keeps one per card per account, so it
 * goes with any of the copies, and every copy shows it. Only the owner sees
 * it; the catalogue is unchanged.
 */
function OwnPhoto({
  cardId,
  entries,
  disabled,
}: {
  cardId: string;
  entries: CollectionItem[];
  disabled: boolean;
}) {
  const photo = useCardPhoto();
  const [preparing, setPreparing] = useState(false);
  const copy = entries[0];
  if (!copy) {
    return (
      <ThemedText variant="caption" color="textSecondary" style={styles.photoNote}>
        No picture of this card yet. Add a copy to your collection to give it your own photo.
      </ThemedText>
    );
  }
  const hasPhoto = entries.some((e) => e.has_scan_photo);

  async function add(source: PhotoSource) {
    if (!copy) return;
    setPreparing(true);
    try {
      const file = await takeCardPhoto(source);
      if (file) photo.set.mutate({ itemId: copy.id, cardId, photo: file });
    } catch (error) {
      if (error instanceof CameraDeniedError) {
        Alert.alert('Camera access is off', 'Allow it in Settings to photograph your card.', [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]);
      } else {
        showToast({ kind: 'error', title: 'Could not use that photo' });
      }
    } finally {
      setPreparing(false);
    }
  }

  async function choose() {
    const options = ['Take a photo', 'Choose from library', ...(hasPhoto ? ['Remove photo'] : [])];
    const index = await pick('Your photo of this card', options, {
      destructive: hasPhoto ? [2] : [],
    });
    if (index === 0) await add('camera');
    else if (index === 1) await add('library');
    else if (index === 2 && copy) {
      Alert.alert('Remove your photo?', 'The card shows no picture again.', [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => photo.remove.mutate({ itemId: copy.id, cardId }),
        },
      ]);
    }
  }

  return (
    <View style={styles.photo}>
      <Button
        title={hasPhoto ? 'Change your photo' : 'Add a photo of your copy'}
        variant="secondary"
        busy={preparing || photo.set.isPending || photo.remove.isPending}
        disabled={disabled}
        accessibilityHint="The catalogue has no picture of this card. Only you see your photo."
        onPress={choose}
      />
      {hasPhoto ? null : (
        <ThemedText variant="caption" color="textSecondary" style={styles.photoNote}>
          No picture of this card in the catalogue. A photo of your copy shows here and in your
          lists, only for you.
        </ThemedText>
      )}
    </View>
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
  const colors = useColors();
  const largeText = useLargeText();
  const rows: [string, number | null | undefined][] = [
    ['Market', card.price_market],
    ['Low', card.price_low],
    ['30-day', card.price_avg30],
  ];
  if (card.variants_reverse || card.price_trend_holo) {
    rows.push(['Reverse', card.price_trend_holo]);
  }
  return (
    <ThemedView background="surface" style={[styles.panel, { borderColor: colors.border }]}>
      <View
        style={styles.trend}
        accessible
        accessibilityLabel={`Trend price: ${formatPrice(card.price_trend)}`}>
        <ThemedText variant="overline" color="textSecondary">
          Trend
        </ThemedText>
        <ThemedText variant="figure" style={styles.trendValue}>
          {formatPrice(card.price_trend)}
        </ThemedText>
      </View>
      <View style={[styles.priceTiles, largeText && styles.stacked]}>
        {rows.map(([label, value]) => (
          <ThemedView
            key={label}
            background="surfaceRaised"
            style={styles.priceTile}
            accessible
            accessibilityLabel={`${label}: ${formatPrice(value)}`}>
            <ThemedText variant="caption" color="textSecondary">
              {label}
            </ThemedText>
            <ThemedText variant="figureSmall" numberOfLines={1} adjustsFontSizeToFit>
              {formatPrice(value)}
            </ThemedText>
          </ThemedView>
        ))}
      </View>
      <ThemedText variant="caption" color="textSecondary">
        Cardmarket, in euros.
      </ThemedText>
    </ThemedView>
  );
}

function Owned({ entries, disabled }: { entries: CollectionItem[]; disabled: boolean }) {
  const setQuantity = useSetQuantity();
  const colors = useColors();
  const owner = useOwnerLabel();
  const [editing, setEditing] = useState<number | null>(null);
  if (entries.length === 0) return null;

  const change = (item: CollectionItem, quantity: number) => {
    if (quantity > 0) {
      setQuantity.mutate({ item, quantity });
      return;
    }
    Alert.alert(
      owner ? `Remove from ${owner}?` : 'Remove from collection?',
      `${item.variant ?? 'Normal'}, ${item.condition}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => setQuantity.mutate({ item, quantity }),
        },
      ],
    );
  };

  return (
    <ThemedView background="surface" style={[styles.panel, { borderColor: colors.border }]}>
      <ThemedText variant="heading">{owner ? `In ${owner}` : 'In your collection'}</ThemedText>
      {entries.map((item) => {
        const details = (item.printing_details ?? []).map((d) => d.name);
        const open = editing === item.id;
        return (
          <View key={item.id} style={styles.entry}>
            <View style={styles.ownedRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.variant ?? 'Normal'}, ${item.condition}${details.length ? `, ${details.join(', ')}` : ''}`}
                accessibilityHint={
                  open ? 'Closes the editor' : 'Change variant, condition or printing details'
                }
                disabled={disabled}
                onPress={() => setEditing(open ? null : item.id)}
                style={({ pressed }) => [styles.ownedText, pressed && styles.pressed]}>
                <View style={styles.variantLine}>
                  <ThemedText variant="label">{item.variant ?? 'Normal'}</ThemedText>
                  <Icon name={open ? 'chevron.up' : 'pencil'} size={13} color="accent" />
                </View>
                <ThemedText variant="caption" color="textSecondary">
                  {[item.condition, ...details].join(' · ')} ·{' '}
                  {formatPrice(cardValue(item.card, item.variant))} each
                </ThemedText>
              </Pressable>
              <QuantityStepper
                label={`${item.variant ?? 'Normal'} ${item.condition}`}
                value={item.quantity}
                onChange={(q) => change(item, q)}
                disabled={disabled}
              />
            </View>
            {open ? <EditCopy item={item} onDone={() => setEditing(null)} /> : null}
          </View>
        );
      })}
    </ThemedView>
  );
}

/** Variant, condition and printing details of one copy, saved together. */
function EditCopy({ item, onDone }: { item: CollectionItem; onDone(): void }) {
  const update = useUpdateCopy();
  const initialVariant = (VARIANTS as readonly string[]).includes(item.variant ?? 'Normal')
    ? ((item.variant ?? 'Normal') as Variant)
    : 'Normal';
  const initialCondition = (CONDITIONS as readonly string[]).includes(item.condition)
    ? (item.condition as Condition)
    : 'NM';
  const [variant, setVariant] = useState<Variant>(initialVariant);
  const [condition, setCondition] = useState<Condition>(initialCondition);
  const [details, setDetails] = useState<string[]>(
    (item.printing_details ?? []).map((d) => d.name),
  );

  return (
    <View style={styles.editor}>
      <Chips<Variant>
        label="Variant"
        options={VARIANTS.map((v) => ({ value: v, label: v }))}
        value={variant}
        onChange={setVariant}
      />
      <Chips<Condition>
        label="Condition"
        options={CONDITIONS.map((c) => ({ value: c, label: c }))}
        value={condition}
        onChange={setCondition}
      />
      <PrintingDetailsPicker value={details} onChange={setDetails} />
      <Button
        title="Save changes"
        busy={update.isPending}
        onPress={() =>
          update.mutate(
            { item, patch: { variant, condition, printing_details: details } },
            { onSuccess: onDone },
          )
        }
      />
    </View>
  );
}

function AddCopies({ card, disabled }: { card: Card; disabled: boolean }) {
  const [variant, setVariant] = useState<Variant>(() => defaultVariant(card));
  const [condition, setCondition] = useState<Condition>('NM');
  const [details, setDetails] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const add = useAddToCollection();
  const wishlist = useAddToWishlist();
  const owner = useOwnerLabel();

  return (
    <View style={styles.add}>
      <ThemedText variant="heading">Add copies</ThemedText>
      <Chips<Variant>
        label="Variant"
        options={VARIANTS.map((v) => ({ value: v, label: v }))}
        value={variant}
        onChange={setVariant}
      />
      <Chips<Condition>
        label="Condition"
        options={CONDITIONS.map((v) => ({ value: v, label: v }))}
        value={condition}
        onChange={setCondition}
      />
      <PrintingDetailsPicker value={details} onChange={setDetails} />
      <View style={styles.ownedRow}>
        <ThemedText>Quantity</ThemedText>
        <QuantityStepper label="Copies to add" value={quantity} onChange={setQuantity} min={1} />
      </View>
      <Button
        title={`Add ${quantity} to ${owner ?? 'collection'}`}
        busy={add.isPending}
        disabled={disabled}
        onPress={() =>
          add.mutate(
            { card_id: card.id, variant, condition, quantity, printing_details: details },
            {
              onSuccess: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
                  () => undefined,
                );
                setQuantity(1);
                setDetails([]);
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
    </View>
  );
}

/**
 * Picks a binder, then, for a collection binder, which owned copy goes in:
 * those hold exact collection entries, so a card not owned cannot go in one.
 */
function AddToBinder({
  card,
  entries,
  disabled,
}: {
  card: Card;
  entries: CollectionItem[];
  disabled: boolean;
}) {
  const binders = useBinders();
  const add = useAddToBinder();
  const list = binders.data ? bindersOnly(binders.data) : [];
  if (binders.data && list.length === 0) return null;

  async function choose() {
    const binderIndex = await pick(
      'Add to which binder?',
      list.map((b) => `${b.name} (${binderKind(b).toLowerCase()})`),
    );
    const binder = binderIndex === null ? undefined : list[binderIndex];
    if (!binder) return;
    if (isPlanned(binder)) {
      add.mutate({ binderId: binder.id, cardId: card.id });
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
    if (entry) add.mutate({ binderId: binder.id, collectionItemId: entry.id });
  }

  return (
    <Button
      title={add.isSuccess ? 'Added — add to another binder' : 'Add to binder'}
      variant="secondary"
      busy={add.isPending || binders.isLoading}
      disabled={disabled}
      onPress={choose}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  image: { width: '65%', alignSelf: 'center', borderRadius: radius.md },
  heading: { gap: spacing.sm },
  photo: { gap: spacing.sm },
  photoNote: { textAlign: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  tag: { borderRadius: radius.sm, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs },
  panel: { padding: spacing.md, borderRadius: radius.lg - 2, borderWidth: 1, gap: spacing.sm + 4 },
  add: { gap: spacing.sm + 4 },
  trend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  trendValue: { fontSize: 30, lineHeight: 36 },
  priceTiles: { flexDirection: 'row', gap: spacing.sm },
  stacked: { flexDirection: 'column' },
  priceTile: { flex: 1, borderRadius: radius.sm + 2, padding: spacing.sm, gap: 2 },
  ownedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  ownedText: { flex: 1, gap: 2, minHeight: 44, justifyContent: 'center' },
  entry: { gap: spacing.sm },
  editor: { gap: spacing.sm + 4, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  pressed: { opacity: 0.7 },
  variantLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
});
