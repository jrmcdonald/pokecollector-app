import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CardSet } from '@/api/schemas';
import { useSets } from '@/hooks/queries';
import { spacing, useColors } from '@/theme';
import { filterSets } from '@/utils/sets';

import { Icon } from './icon';
import { ListRow } from './list-row';
import { SearchField } from './search-field';
import { EmptyState, ErrorState, ListSkeleton } from './states';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/**
 * Choose one set, or any. A sheet with its own search rather than an action
 * sheet: there are a couple of hundred sets. The list is the Sets screen's,
 * cached for an hour, so opening this rarely costs a request.
 */
export function SetPicker({
  visible,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selectedId: string | null;
  onSelect(set: CardSet | null): void;
  onClose(): void;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <ThemedView style={styles.fill}>
        {visible ? <SetList selectedId={selectedId} onSelect={onSelect} onClose={onClose} /> : null}
      </ThemedView>
    </Modal>
  );
}

function SetList({
  selectedId,
  onSelect,
  onClose,
}: {
  selectedId: string | null;
  onSelect(set: CardSet | null): void;
  onClose(): void;
}) {
  const colors = useColors();
  const sets = useSets();
  const [query, setQuery] = useState('');
  const shown = useMemo(
    () => filterSets(sets.data ?? [], { query, startedOnly: false }),
    [sets.data, query],
  );
  const check = <Icon name="checkmark" size={16} color="text" />;

  return (
    <SafeAreaView edges={['bottom']} style={styles.fill}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <ThemedText variant="heading" accessibilityRole="header" style={styles.fill}>
          Set
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          onPress={onClose}
          style={styles.cancel}>
          <ThemedText variant="label" style={{ color: colors.accent }}>
            Cancel
          </ThemedText>
        </Pressable>
      </View>
      <View style={styles.search}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Set name or series"
          accessibilityLabel="Search sets"
        />
      </View>
      {sets.data ? (
        <FlashList
          // No recycle pool: FlashList 2.0.2 keeps cells past the end of a list
          // that shrank, showing their old items (a set searched for "char"
          // still showed what "c" found). Unused cells now unmount instead.
          maxItemsInRecyclePool={0}
          data={shown}
          keyExtractor={(set) => set.id}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            query ? null : (
              <ListRow
                title="Any set"
                kind="action"
                selected={selectedId === null}
                trailing={selectedId === null ? check : null}
                onPress={() => onSelect(null)}
              />
            )
          }
          renderItem={({ item: set }) => (
            <ListRow
              title={set.name}
              subtitle={[set.abbreviation, set.series, set.release_date?.slice(0, 4)]
                .filter(Boolean)
                .join(' · ')}
              kind="action"
              selected={set.id === selectedId}
              trailing={set.id === selectedId ? check : null}
              onPress={() => onSelect(set)}
            />
          )}
          ListEmptyComponent={
            <EmptyState title="No sets found" message={`Nothing matches “${query.trim()}”.`} />
          }
        />
      ) : sets.error ? (
        <ErrorState error={sets.error} onRetry={() => sets.refetch()} />
      ) : (
        <ListSkeleton />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cancel: {
    minWidth: 64,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  search: { padding: spacing.md, paddingBottom: spacing.sm },
});
