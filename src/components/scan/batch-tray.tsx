import { Image } from 'expo-image';
import { Alert, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MAX_BATCH_PHOTOS } from '@/api/batch';
import { Button } from '@/components/button';
import { CARD_ASPECT } from '@/components/card-image';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { minTapTarget, radius, spacing, useColors } from '@/theme';

/** A photo taken for a batch and not sent yet: a cropped JPEG in the cache directory. */
export interface TrayPhoto {
  key: string;
  uri: string;
}

/**
 * The photos taken so far, as the last one with a count on it, where iOS's
 * camera keeps its own. Opens the tray to look through them.
 */
export function TrayButton({ photos, onPress }: { photos: readonly TrayPhoto[]; onPress(): void }) {
  const colors = useColors();
  const last = photos[photos.length - 1];
  if (!last) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${photos.length} ${photos.length === 1 ? 'photo' : 'photos'} in this batch. Look through them`}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <View style={[styles.thumb, { borderColor: colors.text }]}>
        <Image
          source={{ uri: last.uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="none"
          accessibilityIgnoresInvertColors
        />
      </View>
      <View style={[styles.count, { backgroundColor: colors.accent }]}>
        <ThemedText variant="figureSmall" style={{ color: colors.onAccent }}>
          {photos.length}
        </ThemedText>
      </View>
    </Pressable>
  );
}

/**
 * Every photo in the batch, each with a way to drop it, and the button that
 * sends them. Nothing has left the phone yet.
 */
export function TraySheet({
  visible,
  photos,
  sending,
  canSend,
  onRemove,
  onClear,
  onSend,
  onClose,
}: {
  visible: boolean;
  photos: readonly TrayPhoto[];
  sending: boolean;
  canSend: boolean;
  onRemove(photo: TrayPhoto): void;
  onClear(): void;
  onSend(): void;
  onClose(): void;
}) {
  const colors = useColors();
  const n = photos.length;
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <ThemedView style={styles.fill}>
        <SafeAreaView edges={['bottom']} style={styles.fill}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <ThemedText variant="heading" accessibilityRole="header">
                {n === 1 ? '1 photo' : `${n} photos`}
              </ThemedText>
              <ThemedText variant="caption" color="textSecondary">
                Still on your phone. Up to {MAX_BATCH_PHOTOS} go in one batch.
              </ThemedText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={spacing.sm}
              onPress={onClose}
              style={[styles.close, { backgroundColor: colors.surfaceRaised }]}>
              <Icon name="xmark" size={14} color="textSecondary" weight="bold" />
            </Pressable>
          </View>
          <FlatList
            data={photos}
            keyExtractor={(photo) => photo.key}
            numColumns={3}
            contentContainerStyle={styles.grid}
            columnWrapperStyle={styles.gridRow}
            renderItem={({ item: photo, index }) => (
              <View style={styles.cell}>
                <View
                  style={[styles.photo, { backgroundColor: colors.surface }]}
                  accessible
                  accessibilityRole="image"
                  accessibilityLabel={`Photo ${index + 1}`}>
                  <Image
                    source={{ uri: photo.uri }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    cachePolicy="none"
                    accessibilityIgnoresInvertColors
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove photo ${index + 1}`}
                  onPress={() => onRemove(photo)}
                  style={styles.remove}>
                  <View
                    style={[
                      styles.removeMark,
                      { backgroundColor: colors.surfaceRaised, borderColor: colors.outline },
                    ]}>
                    <Icon name="xmark" size={12} color="text" weight="bold" />
                  </View>
                </Pressable>
              </View>
            )}
          />
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Button
              title={n === 1 ? 'Scan 1 card' : `Scan ${n} cards`}
              busy={sending}
              disabled={!canSend || n === 0}
              onPress={onSend}
            />
            <Button
              title="Discard these photos"
              variant="secondary"
              disabled={sending || n === 0}
              onPress={() =>
                Alert.alert(
                  n === 1 ? 'Discard this photo?' : `Discard all ${n} photos?`,
                  'They have not been sent, so nothing is saved.',
                  [
                    { text: 'Keep', style: 'cancel' },
                    { text: 'Discard', style: 'destructive', onPress: onClear },
                  ],
                )
              }
            />
          </View>
        </SafeAreaView>
      </ThemedView>
    </Modal>
  );
}

const THUMB = 56;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  button: { width: THUMB + 8, height: THUMB / CARD_ASPECT + 8, justifyContent: 'flex-end' },
  pressed: { opacity: 0.7 },
  thumb: {
    width: THUMB,
    aspectRatio: CARD_ASPECT,
    borderRadius: radius.sm,
    borderWidth: 2,
    overflow: 'hidden',
  },
  count: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 24,
    borderRadius: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
  },
  headerText: { flex: 1, gap: 2 },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { padding: spacing.md, gap: spacing.md },
  gridRow: { gap: spacing.md },
  cell: { flex: 1 / 3 },
  photo: { aspectRatio: CARD_ASPECT, borderRadius: radius.sm, overflow: 'hidden' },
  // A full-size tap target in the corner, drawn as a smaller mark.
  remove: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: minTapTarget,
    height: minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeMark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
