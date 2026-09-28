import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { DashboardCard } from '@/api/schemas';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { CardTile } from '@/components/card-tile';
import { Icon } from '@/components/icon';
import { StatTile } from '@/components/stat-tile';
import { EmptyState, ErrorState, GridSkeleton } from '@/components/states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useDashboard, useIsOnline } from '@/hooks/queries';
import { useAccountMenu } from '@/hooks/use-account-menu';
import { useMe } from '@/hooks/use-me';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { useSession } from '@/session/session';
import { minTapTarget, radius, spacing, useColors } from '@/theme';
import { formatPrice, formatTotal } from '@/utils/pricing';

const number = new Intl.NumberFormat('en-GB');

/**
 * The account, the collection's value and counts, one way into the
 * collection, then what was added lately and what is worth most. Both rows
 * come from the one dashboard request.
 */
export default function Home() {
  const colors = useColors();
  const me = useMe();
  const dashboard = useDashboard();
  const pull = usePullToRefresh(() => Promise.all([dashboard.refetch(), me.refetch()]));
  const online = useIsOnline();
  const d = dashboard.data;
  const { session } = useSession();
  // The saved username until /api/auth/me answers, e.g. just after a switch.
  const name =
    me.data?.username ?? (session.status === 'signedIn' ? session.credentials.username : undefined);
  const openAccountMenu = useAccountMenu();

  return (
    <ThemedView style={styles.fill}>
      <SafeAreaView edges={['top']} style={styles.fill}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.textSecondary}
            />
          }>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={name ? `Signed in as ${name}` : 'Account'}
              accessibilityHint="Switch account, add one, or open Settings"
              onPress={openAccountMenu}
              style={({ pressed }) => [styles.account, pressed && styles.pressed]}>
              <Avatar name={name} avatarId={me.data?.avatar_id} />
              <ThemedText
                variant="heading"
                accessibilityRole="none"
                numberOfLines={1}
                style={styles.name}>
                {name ?? 'PokeCollector'}
              </ThemedText>
              <Icon name="chevron.down" size={13} color="textSecondary" />
            </Pressable>
            {!online ? (
              <View style={[styles.offline, { borderColor: colors.outline }]}>
                <Icon name="wifi.slash" size={12} color="textSecondary" />
                <ThemedText variant="label" color="textSecondary">
                  Offline
                </ThemedText>
              </View>
            ) : null}
          </View>

          {d ? (
            <>
              <ThemedView
                background="surface"
                style={[styles.hero, { borderColor: colors.border }]}>
                <View
                  accessible
                  accessibilityLabel={`Collection value: ${formatTotal(d.total_value)}`}>
                  <ThemedText variant="overline" color="textSecondary">
                    Collection value
                  </ThemedText>
                  <ThemedText variant="figureLarge" numberOfLines={1} adjustsFontSizeToFit>
                    {formatTotal(d.total_value)}
                  </ThemedText>
                </View>
                <View style={styles.stats}>
                  <StatTile label="cards" value={number.format(d.total_cards)} />
                  <StatTile label="unique" value={number.format(d.unique_cards)} />
                  <StatTile
                    label="sets"
                    value={
                      d.total_sets
                        ? `${number.format(d.owned_sets ?? 0)}/${number.format(d.total_sets)}`
                        : number.format(d.owned_sets ?? 0)
                    }
                  />
                </View>
                <Button title="Browse your collection" onPress={() => router.push('/collection')} />
              </ThemedView>

              {d.recent_additions.length > 0 ? (
                <CardRow title="Recently added" cards={d.recent_additions} />
              ) : (
                <EmptyState
                  title="Nothing here yet"
                  message="Cards you add, from Search or the web UI, show up here."
                  action={{ title: 'Search the catalogue', onPress: () => router.push('/search') }}
                />
              )}
              {d.top_cards && d.top_cards.length > 0 ? (
                <CardRow title="Most valuable" cards={d.top_cards} />
              ) : null}
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

function CardRow({ title, cards }: { title: string; cards: DashboardCard[] }) {
  return (
    <View style={styles.section}>
      <ThemedText variant="heading">{title}</ThemedText>
      <FlatList
        horizontal
        data={cards}
        keyExtractor={(item) => String(item.collection_item_id ?? item.card_id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cardList}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <CardTile
              card={{ ...item, id: item.card_id }}
              detail={formatPrice(item.price_market)}
              quantity={item.quantity ?? 0}
              variant={item.variant}
              photoItemId={item.has_scan_photo ? item.collection_item_id : null}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.lg - 4, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  account: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minHeight: minTapTarget,
  },
  pressed: { opacity: 0.7 },
  name: { flexShrink: 1 },
  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  hero: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md + 2, gap: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm },
  section: { gap: spacing.sm + 4 },
  cardList: { gap: spacing.sm },
  card: { width: 116 },
});
