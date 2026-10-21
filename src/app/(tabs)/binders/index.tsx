import { FlashList } from '@shopify/flash-list';
import { router, Stack } from 'expo-router';
import { RefreshControl, StyleSheet, View } from 'react-native';

import { ListRow } from '@/components/list-row';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { ThemedView } from '@/components/themed-view';
import { useBinders, useIsOnline } from '@/hooks/queries';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { radius, useColors } from '@/theme';
import { binderColor, binderKind, bindersOnly } from '@/utils/binders';

export default function Binders() {
  const colors = useColors();
  const binders = useBinders();
  const pull = usePullToRefresh(() => binders.refetch());
  const list = binders.data ? bindersOnly(binders.data) : null;
  const online = useIsOnline();
  const add = () => router.push('/binder-new');

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
                    accessibilityLabel: 'New binder',
                    icon: { type: 'sfSymbol', name: 'plus' },
                    onPress: add,
                  },
                ]
              : [],
        }}
      />
      {list ? (
        <FlashList
          data={list}
          keyExtractor={(b) => String(b.id)}
          contentInsetAdjustmentBehavior="automatic"
          refreshControl={
            <RefreshControl
              refreshing={pull.refreshing}
              onRefresh={pull.onRefresh}
              tintColor={colors.textSecondary}
            />
          }
          renderItem={({ item: binder }) => {
            const count = binder.card_count ?? 0;
            return (
              <ListRow
                title={binder.name}
                subtitle={`${binderKind(binder)} · ${count === 1 ? '1 card' : `${count} cards`}`}
                leading={
                  <View
                    style={[
                      styles.swatch,
                      {
                        backgroundColor: binderColor(binder, colors.accent),
                        borderColor: colors.border,
                      },
                    ]}
                  />
                }
                onPress={() =>
                  router.push({
                    pathname: '/binder/[id]',
                    params: { id: String(binder.id), name: binder.name },
                  })
                }
              />
            );
          }}
          ListEmptyComponent={
            <EmptyState
              title="No binders yet"
              message="A binder holds copies you own, or plans cards to collect."
              action={online ? { title: 'New binder', onPress: add } : undefined}
            />
          }
        />
      ) : binders.error ? (
        <ErrorState error={binders.error} onRetry={() => binders.refetch()} />
      ) : (
        <ListSkeleton />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  swatch: { width: 14, height: 40, borderRadius: radius.sm / 2, borderWidth: 1 },
});
