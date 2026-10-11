import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { useMemo } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';

import type { Product } from '@/api/schemas';
import { Button } from '@/components/button';
import { ListRow } from '@/components/list-row';
import { StatTile } from '@/components/stat-tile';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useIsOnline, useProducts } from '@/hooks/queries';
import { useLargeText } from '@/hooks/use-large-text';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { radius, spacing, useColors } from '@/theme';
import {
  formatDate,
  formatMoney,
  formatPnl,
  hasPnl,
  pnlColor,
  productTotals,
  sortProducts,
  statusLabel,
  type ProductTotals,
} from '@/utils/products';

/** More → Sealed products: what was bought, and how it has done. */
export default function Products() {
  const colors = useColors();
  const online = useIsOnline();
  const products = useProducts();
  const pull = usePullToRefresh(() => products.refetch());
  const sorted = useMemo(() => sortProducts(products.data ?? []), [products.data]);
  const totals = useMemo(() => productTotals(products.data ?? []), [products.data]);
  const add = () => router.push('/product-edit');

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen
        options={{
          unstable_headerRightItems: () =>
            online
              ? [
                  {
                    type: 'button',
                    label: 'Add',
                    accessibilityLabel: 'Add a product',
                    icon: { type: 'sfSymbol', name: 'plus' },
                    onPress: add,
                  },
                ]
              : [],
        }}
      />
      {products.data ? (
        <FlashList
          data={sorted}
          keyExtractor={(product) => String(product.id)}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.textSecondary}
            />
          }
          ListHeaderComponent={sorted.length > 0 ? <Totals totals={totals} /> : null}
          renderItem={({ item }) => <ProductRow product={item} />}
          ListEmptyComponent={
            <EmptyState
              title="No sealed products yet"
              message="Log a booster box, tin or pack when you buy it, to see how it does: its value while sealed, or what came out of it once opened."
              action={online ? { title: 'Add a product', onPress: add } : undefined}
            />
          }
          ListFooterComponent={
            sorted.length > 0 && online ? (
              <View style={styles.footer}>
                <Button title="Add a product" variant="secondary" onPress={add} />
              </View>
            ) : null
          }
        />
      ) : products.error ? (
        <ErrorState error={products.error} onRetry={() => products.refetch()} />
      ) : (
        <ListSkeleton />
      )}
    </ThemedView>
  );
}

function Totals({ totals }: { totals: ProductTotals }) {
  const colors = useColors();
  const largeText = useLargeText();
  const pnl = formatPnl(totals.pnl, totals.pnlPercent);
  return (
    <View style={styles.header}>
      <ThemedView background="surface" style={[styles.panel, { borderColor: colors.border }]}>
        <View accessible accessibilityLabel={`Profit or loss: ${pnl}`}>
          <ThemedText variant="overline" color="textSecondary">
            Profit or loss
          </ThemedText>
          <ThemedText variant="figure" color={pnlColor(totals.pnl)}>
            {pnl}
          </ThemedText>
        </View>
        <View style={[styles.tiles, largeText && styles.stacked]}>
          <StatTile label="Invested" value={formatMoney(totals.invested)} />
          <StatTile label="Value" value={formatMoney(totals.value)} />
        </View>
        <ThemedText variant="caption" color="textSecondary">
          In euros. A sealed product with no value entered counts as what you paid.
        </ThemedText>
      </ThemedView>
      {totals.needsReview > 0 ? (
        <ThemedText variant="label" color="accent">
          {totals.needsReview === 1
            ? '1 product needs review: open it to say whether it was opened.'
            : `${totals.needsReview} products need review: open each to say whether it was opened.`}
        </ThemedText>
      ) : null}
    </View>
  );
}

function ProductRow({ product }: { product: Product }) {
  const subtitle = [
    product.product_type,
    statusLabel(product.lifecycle_status),
    formatDate(product.purchase_date),
  ]
    .filter(Boolean)
    .join(' · ');
  const pnl = hasPnl(product) ? formatPnl(product.pnl ?? 0) : null;
  return (
    <ListRow
      title={product.product_name}
      subtitle={subtitle}
      accessibilityLabel={[
        product.product_name,
        subtitle,
        `paid ${formatMoney(product.purchase_price)}`,
        pnl ? `profit or loss ${pnl}` : null,
      ]
        .filter(Boolean)
        .join(', ')}
      trailing={
        <View style={styles.trailing}>
          <ThemedText variant="figureSmall">{formatMoney(product.purchase_price)}</ThemedText>
          {pnl ? (
            <ThemedText variant="figureSmall" color={pnlColor(product.pnl ?? 0)}>
              {pnl}
            </ThemedText>
          ) : null}
        </View>
      }
      onPress={() =>
        router.push({
          pathname: '/product/[id]',
          params: { id: String(product.id), name: product.product_name },
        })
      }
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { padding: spacing.md, gap: spacing.sm },
  panel: { padding: spacing.md, borderRadius: radius.lg - 2, borderWidth: 1, gap: spacing.sm + 4 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  stacked: { flexDirection: 'column' },
  trailing: { alignItems: 'flex-end', gap: 2 },
  footer: { padding: spacing.md },
});
