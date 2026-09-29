import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { itemState, type BatchChoice } from '@/api/batch';
import type { ScanItem } from '@/api/schemas';
import { CardImage } from '@/components/card-image';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { minTapTarget, radius, spacing, useColors } from '@/theme';
import { describeRow, photoName, pickCard, type RowOutcome } from '@/utils/batch-review';

import { ScanPhoto } from './scan-photo';

const THUMB = 44;

/**
 * One photo of a batch: the phone's photo beside the card it will add, and
 * how. Tapping it opens the photo to change any of that; a photo already
 * handled, or still being read, has nothing to open.
 */
export function BatchRow({
  jobId,
  item,
  choice,
  outcome,
  failure,
  onPress,
}: {
  jobId: number;
  item: ScanItem;
  choice: BatchChoice;
  outcome: RowOutcome;
  /** Why the last "Add all" could not add this one. */
  failure?: string;
  onPress(): void;
}) {
  const colors = useColors();
  const state = itemState(item);
  const { title, detail } = describeRow(item, choice, outcome);
  const picked = choice.pick ? pickCard(choice.pick) : null;
  const handled = state === 'handled';
  const openable = !handled && state !== 'reading';
  const needsAttention = !picked && (state === 'unmatched' || state === 'failed');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[photoName(item), title, detail, failure ? `Not added: ${failure}` : null]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={openable ? 'Change the card, or how it is added' : undefined}
      accessibilityState={{ disabled: !openable }}
      disabled={!openable}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.surface },
      ]}>
      <View style={[styles.images, handled && styles.faded]}>
        <ScanPhoto jobId={jobId} item={item} style={styles.thumb} />
        <Icon name="arrow.right" size={12} color="textSecondary" />
        {picked && state !== 'reading' ? (
          <CardImage card={picked} size="small" style={styles.thumb} />
        ) : (
          <View
            style={[
              styles.thumb,
              styles.empty,
              { borderColor: colors.outline, backgroundColor: colors.surface },
            ]}>
            {state === 'reading' ? (
              <ActivityIndicator color={colors.textSecondary} />
            ) : (
              <Icon name="questionmark" size={14} color="textSecondary" />
            )}
          </View>
        )}
      </View>
      <View style={styles.text}>
        <ThemedText variant="label" style={styles.title}>
          {title}
        </ThemedText>
        <View style={styles.detail}>
          {outcome === 'added' ? <Icon name="checkmark" size={12} color="success" /> : null}
          {needsAttention ? <Icon name="exclamationmark.circle" size={12} color="accent" /> : null}
          <ThemedText variant="caption" color="textSecondary" style={styles.flex}>
            {detail}
          </ThemedText>
        </View>
        {failure ? (
          <ThemedText variant="caption" style={{ color: colors.danger }}>
            Not added: {failure}
          </ThemedText>
        ) : null}
      </View>
      {openable ? <Icon name="chevron.right" size={14} color="textSecondary" /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    minHeight: minTapTarget + 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  images: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  faded: { opacity: 0.5 },
  thumb: { width: THUMB },
  empty: {
    aspectRatio: 63 / 88,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 16, lineHeight: 21 },
  detail: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  flex: { flexShrink: 1 },
});
