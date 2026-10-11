import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import type { Product } from '@/api/schemas';
import { Button } from '@/components/button';
import { StatTile } from '@/components/stat-tile';
import { EmptyState, ErrorState, GridSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useDeleteProduct, useIsOnline, useProduct, useUpdateProduct } from '@/hooks/queries';
import { useLargeText } from '@/hooks/use-large-text';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { radius, spacing, useColors } from '@/theme';
import {
  formatDate,
  formatMoney,
  formatPnl,
  hasPnl,
  pnlColor,
  statusLabel,
  valueSourceNote,
} from '@/utils/products';
import { showToast } from '@/utils/toast';

/** A sealed product: what it cost, what it is worth now, and what to do with it. */
export default function ProductDetail() {
  const { id = '', name } = useLocalSearchParams<{ id: string; name?: string }>();
  const colors = useColors();
  const online = useIsOnline();
  const product = useProduct(Number(id));
  const pull = usePullToRefresh(() => product.refetch());
  const p = product.data;

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: p?.product_name ?? name ?? '' }} />
      {p ? (
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.textSecondary}
            />
          }>
          <View style={styles.tags}>
            {[p.product_type, statusLabel(p.lifecycle_status)]
              .filter((tag): tag is string => !!tag)
              .map((tag) => (
                <ThemedView key={tag} background="surfaceRaised" style={styles.tag}>
                  <ThemedText variant="caption">{tag}</ThemedText>
                </ThemedView>
              ))}
          </View>
          {p.lifecycle_status === 'review' ? <Review product={p} disabled={!online} /> : null}
          <Value product={p} />
          {p.lifecycle_status === 'opened' ? <Pulls product={p} /> : null}
          {p.notes ? (
            <View style={styles.section}>
              <ThemedText variant="overline" color="textSecondary">
                Notes
              </ThemedText>
              <ThemedText>{p.notes}</ThemedText>
            </View>
          ) : null}
          {!online ? (
            <ThemedText variant="caption" color="textSecondary">
              Offline: changes need a connection.
            </ThemedText>
          ) : null}
          <Actions product={p} disabled={!online} />
        </ScrollView>
      ) : product.error ? (
        <ErrorState error={product.error} onRetry={() => product.refetch()} />
      ) : product.isSuccess ? (
        <EmptyState title="Product not found" message="It may have been deleted elsewhere." />
      ) : (
        <GridSkeleton columns={1} rows={1} />
      )}
    </ThemedView>
  );
}

function Value({ product }: { product: Product }) {
  const colors = useColors();
  const largeText = useLargeText();
  const value = product.computed_current_value ?? product.purchase_price;
  const pnl = hasPnl(product) ? formatPnl(product.pnl ?? 0, product.pnl_percent) : null;
  const sold = product.lifecycle_status === 'sold';
  return (
    <ThemedView background="surface" style={[styles.panel, { borderColor: colors.border }]}>
      {/* One element: a line of its own would be too small a target (and the
          walkthrough's audit says so). */}
      <View
        accessible
        accessibilityLabel={
          pnl
            ? `Value: ${formatMoney(value)}, profit or loss: ${pnl}`
            : `Value: ${formatMoney(value)}`
        }
        style={styles.figures}>
        <ThemedText variant="overline" color="textSecondary">
          Value
        </ThemedText>
        <ThemedText variant="figure" style={styles.value}>
          {formatMoney(value)}
        </ThemedText>
        {pnl ? (
          <ThemedText variant="figureSmall" color={pnlColor(product.pnl ?? 0)}>
            {pnl}
          </ThemedText>
        ) : null}
      </View>
      <View style={[styles.tiles, largeText && styles.stacked]}>
        <StatTile label="Paid" value={formatMoney(product.purchase_price)} />
        <StatTile label="Bought" value={formatDate(product.purchase_date)} />
      </View>
      {sold && product.sold_price != null ? (
        <View style={[styles.tiles, largeText && styles.stacked]}>
          <StatTile label="Sold for" value={formatMoney(product.sold_price)} />
          {product.sold_date ? (
            <StatTile label="Sold" value={formatDate(product.sold_date)} />
          ) : null}
        </View>
      ) : null}
      <ThemedText variant="caption" color="textSecondary">
        {valueSourceNote(product)} In euros.
      </ThemedText>
    </ThemedView>
  );
}

/**
 * What came out of an opened product, in figures. Linking and listing the
 * cards themselves comes later; the web UI does it for now.
 */
function Pulls({ product }: { product: Product }) {
  const largeText = useLargeText();
  const linked = product.linked_cards_count ?? 0;
  return (
    <View style={styles.section}>
      <ThemedText variant="heading">What came out of it</ThemedText>
      {linked > 0 ? (
        <View style={[styles.tiles, largeText && styles.stacked]}>
          <StatTile label="Cards" value={String(linked)} />
          <StatTile label="Worth now" value={formatMoney(product.linked_live_value ?? 0)} />
          <StatTile label="Sold for" value={formatMoney(product.realized_gains ?? 0)} />
        </View>
      ) : (
        <ThemedText color="textSecondary">
          No cards linked yet. Link the cards pulled from it in the web UI, and its value becomes
          what they are worth.
        </ThemedText>
      )}
    </View>
  );
}

/** An old product upstream cannot place: say which it is. */
function Review({ product, disabled }: { product: Product; disabled: boolean }) {
  const update = useUpdateProduct();
  const choose = (status: 'opened' | 'sealed') =>
    update.mutate({ productId: product.id, changes: { lifecycle_status: status } });
  return (
    <View style={styles.section}>
      <ThemedText variant="label">Was it opened, or is it still sealed?</ThemedText>
      <ThemedText variant="caption" color="textSecondary">
        It has a sale date but no price, so it cannot be counted until you say.
      </ThemedText>
      <View style={styles.row}>
        <Button
          title="It was opened"
          variant="secondary"
          style={styles.half}
          busy={update.isPending && update.variables?.changes.lifecycle_status === 'opened'}
          disabled={disabled || update.isPending}
          onPress={() => choose('opened')}
        />
        <Button
          title="Still sealed"
          variant="secondary"
          style={styles.half}
          busy={update.isPending && update.variables?.changes.lifecycle_status === 'sealed'}
          disabled={disabled || update.isPending}
          onPress={() => choose('sealed')}
        />
      </View>
    </View>
  );
}

function Actions({ product, disabled }: { product: Product; disabled: boolean }) {
  const update = useUpdateProduct();
  const remove = useDeleteProduct();
  const sealed = product.lifecycle_status === 'sealed';
  // Upstream values a product by its pulls exactly when it has pulls or sales.
  const hasHistory = product.value_source === 'linked_cards';
  const edit = () => router.push({ pathname: '/product-edit', params: { id: String(product.id) } });

  const markOpened = () =>
    Alert.alert(
      `Mark ${product.product_name} opened?`,
      'Once opened, it is worth what was pulled from it. Until those cards are linked (in the web UI, for now), it counts as nothing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark opened',
          onPress: () =>
            update.mutate({ productId: product.id, changes: { lifecycle_status: 'opened' } }),
        },
      ],
    );

  const confirmDelete = () =>
    Alert.alert(`Delete ${product.product_name}?`, 'Its purchase is forgotten.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          remove.mutate(product.id, {
            onSuccess: () => {
              showToast({ kind: 'success', title: `${product.product_name} deleted` });
              router.back();
            },
          }),
      },
    ]);

  return (
    <View style={styles.section}>
      {sealed ? (
        <Button
          title="Mark opened"
          busy={update.isPending}
          disabled={disabled}
          onPress={markOpened}
        />
      ) : null}
      {product.cardmarket_url ? (
        <Button
          title="Open on Cardmarket"
          variant="secondary"
          onPress={() =>
            Linking.openURL(product.cardmarket_url ?? '').catch(() =>
              showToast({ kind: 'error', title: 'Could not open the link' }),
            )
          }
        />
      ) : null}
      <Button
        title={sealed ? 'Edit, or record a sale' : 'Edit'}
        variant="secondary"
        disabled={disabled}
        onPress={edit}
      />
      {hasHistory ? (
        <ThemedText variant="caption" color="textSecondary">
          It has cards or sales linked, so it cannot be deleted: their history is kept.
        </ThemedText>
      ) : (
        <Button
          title="Delete product"
          variant="destructive"
          busy={remove.isPending}
          disabled={disabled}
          onPress={confirmDelete}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  tag: { borderRadius: radius.sm, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs },
  panel: { padding: spacing.md, borderRadius: radius.lg - 2, borderWidth: 1, gap: spacing.sm + 4 },
  figures: { gap: 2 },
  value: { fontSize: 30, lineHeight: 36 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  stacked: { flexDirection: 'column' },
  section: { gap: spacing.sm + 4 },
  row: { flexDirection: 'row', gap: spacing.sm },
  half: { flex: 1 },
});
