import { router } from 'expo-router';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { CardTile } from '@/components/card-tile';
import { StatTile } from '@/components/stat-tile';
import { EmptyState, ErrorState, GridSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useDashboard } from '@/hooks/queries';
import { useMe } from '@/hooks/use-me';
import { useActiveRoute } from '@/session/session';
import { spacing, useColors } from '@/theme';
import { formatPrice, formatTotal } from '@/utils/pricing';

const number = new Intl.NumberFormat('en-GB');

export default function Home() {
  const colors = useColors();
  const me = useMe();
  const dashboard = useDashboard();
  const { route } = useActiveRoute();
  const d = dashboard.data;

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView edges={['top']} style={styles.fill}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={dashboard.isRefetching}
              onRefresh={() => dashboard.refetch()}
              tintColor={colors.textSecondary}
            />
          }>
          <View style={styles.header}>
            <ThemedText variant="title">{me.data ? me.data.username : 'PokeCollector'}</ThemedText>
            {route ? (
              <ThemedText variant="caption" color="textSecondary">
                Using the {route} address
              </ThemedText>
            ) : null}
          </View>

          {d ? (
            <>
              <View style={styles.stats}>
                <StatTile label="Collection value" value={formatTotal(d.total_value)} />
                <StatTile label="Cards" value={number.format(d.total_cards)} />
                <StatTile label="Unique cards" value={number.format(d.unique_cards)} />
                <StatTile
                  label="Sets started"
                  value={
                    d.total_sets
                      ? `${number.format(d.owned_sets ?? 0)} / ${number.format(d.total_sets)}`
                      : number.format(d.owned_sets ?? 0)
                  }
                />
              </View>

              <Button title="Browse your collection" onPress={() => router.push('/collection')} />

              {d.recent_additions.length > 0 ? (
                <View style={styles.section}>
                  <ThemedText variant="heading">Recently added</ThemedText>
                  <FlatList
                    horizontal
                    data={d.recent_additions}
                    keyExtractor={(item) => String(item.collection_item_id ?? item.card_id)}
                    showsHorizontalScrollIndicator={false}
                    renderItem={({ item }) => (
                      <View style={styles.recent}>
                        <CardTile
                          card={{ ...item, id: item.card_id }}
                          detail={formatPrice(item.price_market)}
                          quantity={item.quantity ?? 0}
                        />
                      </View>
                    )}
                  />
                </View>
              ) : (
                <EmptyState
                  title="Nothing here yet"
                  message="Cards you add, from Search or the web UI, show up here."
                  action={{ title: 'Search the catalogue', onPress: () => router.push('/search') }}
                />
              )}
            </>
          ) : dashboard.error ? (
            <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />
          ) : (
            <GridSkeleton columns={2} rows={2} />
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  header: { gap: spacing.xs },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  section: { gap: spacing.sm },
  recent: { width: 116 },
});
