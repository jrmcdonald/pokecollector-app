import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { SearchCard } from '@/api/schemas';
import { minTapTarget, spacing, useColors } from '@/theme';

import { CardSearchPane } from './card-search-pane';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

/**
 * The catalogue search in a page sheet, over a screen that keeps its place:
 * a deck line the import could not find, or a card to add to a deck.
 * `searchKey` starts the search afresh when it changes.
 */
export function CardPickerSheet({
  visible,
  title,
  initial = '',
  searchKey,
  cancelTitle,
  onCancel,
  onClose,
  onPick,
}: {
  visible: boolean;
  title: string;
  initial?: string;
  searchKey?: string | number;
  cancelTitle?: string;
  onCancel?: () => void;
  onClose(): void;
  onPick(card: SearchCard): void;
}) {
  const colors = useColors();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <ThemedView style={styles.fill}>
        {visible ? (
          <SafeAreaView edges={['bottom']} style={styles.fill}>
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <ThemedText variant="heading" accessibilityRole="header" style={styles.fill}>
                {title}
              </ThemedText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                style={styles.close}>
                <ThemedText variant="label" style={{ color: colors.accent }}>
                  Close
                </ThemedText>
              </Pressable>
            </View>
            <CardSearchPane
              key={searchKey}
              initial={initial}
              cancelTitle={cancelTitle}
              onCancel={onCancel}
              onPick={onPick}
            />
          </SafeAreaView>
        ) : null}
      </ThemedView>
    </Modal>
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
  close: {
    minWidth: 64,
    minHeight: minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
});
