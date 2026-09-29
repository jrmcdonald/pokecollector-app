import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { rankCandidates } from '@/api/scan';
import type { Recognized, ScanMatch } from '@/api/schemas';
import { CardImage } from '@/components/card-image';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { radius, spacing, useColors } from '@/theme';

/**
 * What the scanner read, and its candidates as tiles. A candidate whose
 * number is the one read off the card comes first and is marked, since
 * printings of one Pokémon often differ only by set and number.
 */
export function ScanCandidates({
  candidates,
  recognized,
  onPick,
  selectedId,
}: {
  candidates: ScanMatch[];
  recognized: Recognized | null | undefined;
  onPick(match: ScanMatch): void;
  /** The candidate already chosen, in a batch; marked, and read as selected. */
  selectedId?: string | null;
}) {
  const colors = useColors();
  const ranked = rankCandidates(candidates, recognized).slice(0, 8);
  const readNumber = recognized?.number_local ? String(recognized.number_local) : null;
  const read = [recognized?.name, [recognized?.set_code, readNumber].filter(Boolean).join(' ')]
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
        data={ranked}
        keyExtractor={(r) => r.match.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.list}
        renderItem={({ item: { match, numberMatches } }) => {
          const code = [match.set_abbreviation?.toUpperCase(), match.number]
            .filter(Boolean)
            .join(' ');
          const selected = selectedId === match.id;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={selectedId === undefined ? undefined : { selected }}
              accessibilityLabel={[
                match.name,
                code,
                match.rarity,
                numberMatches ? `matches number ${readNumber}` : null,
              ]
                .filter(Boolean)
                .join(', ')}
              onPress={() => onPick(match)}
              style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
              <CardImage
                card={{ id: match.id, images_small: match.image, images_large: match.image_hd }}
                size="small"
                style={selected && [styles.selected, { borderColor: colors.holo }]}
              />
              {numberMatches ? (
                <View style={[styles.matchMark, { backgroundColor: colors.success }]}>
                  <Icon name="checkmark" size={10} color="onAccent" weight="bold" />
                  <ThemedText
                    variant="caption"
                    style={[styles.matchText, { color: colors.onAccent }]}>
                    Matches {readNumber}
                  </ThemedText>
                </View>
              ) : null}
              <ThemedText variant="label" numberOfLines={2}>
                {match.name}
              </ThemedText>
              <ThemedText variant="figureSmall" color="textSecondary" numberOfLines={1}>
                {code}
              </ThemedText>
              {match.rarity ? (
                <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
                  {match.rarity}
                </ThemedText>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm + 4 },
  list: { gap: spacing.sm + 4 },
  tile: { width: 112, gap: spacing.xs },
  pressed: { opacity: 0.7 },
  selected: { borderWidth: 3 },
  matchMark: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs + 2,
    marginTop: spacing.xs,
  },
  matchText: { fontSize: 11, lineHeight: 16 },
});
