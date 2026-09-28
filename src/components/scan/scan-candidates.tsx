import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import type { Recognized, ScanMatch } from '@/api/schemas';
import { CardImage } from '@/components/card-image';
import { ThemedText } from '@/components/themed-text';
import { spacing } from '@/theme';

/** What the scanner read, and its candidates as tiles, best first. */
export function ScanCandidates({
  candidates,
  recognized,
  onPick,
}: {
  candidates: ScanMatch[];
  recognized: Recognized | null;
  onPick(match: ScanMatch): void;
}) {
  const read = [
    recognized?.name,
    [recognized?.set_code, recognized?.number_local].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={styles.container}>
      <View>
        <ThemedText variant="heading">
          {candidates.length === 1 ? 'Is this it?' : 'Which one is it?'}
        </ThemedText>
        {read ? (
          <ThemedText variant="caption" color="textSecondary">
            Read as {read}
          </ThemedText>
        ) : null}
      </View>
      <FlatList
        horizontal
        data={candidates.slice(0, 8)}
        keyExtractor={(m) => m.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item: match, index }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${match.name}, ${match.set_abbreviation ?? ''} ${match.number ?? ''}${index === 0 ? ', best match' : ''}`}
            onPress={() => onPick(match)}
            style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
            <CardImage
              card={{ id: match.id, images_small: match.image, images_large: match.image_hd }}
              size="small"
            />
            <ThemedText variant="label" numberOfLines={1}>
              {match.name}
            </ThemedText>
            <ThemedText variant="figureSmall" color="textSecondary" numberOfLines={1}>
              {[match.set_abbreviation?.toUpperCase(), match.number].filter(Boolean).join(' ')}
            </ThemedText>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm + 4 },
  list: { gap: spacing.sm + 4 },
  tile: { width: 108, gap: spacing.xs },
  pressed: { opacity: 0.7 },
});
