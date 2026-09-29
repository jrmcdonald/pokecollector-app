import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ScanMatch } from '@/api/schemas';
import { Button } from '@/components/button';
import { CardImage } from '@/components/card-image';
import { ThemedText } from '@/components/themed-text';
import { useOwnerLabel } from '@/hooks/use-owner-label';
import { spacing } from '@/theme';

import { CopyDetailsFields, DEFAULT_COPY, type CopyDetails } from './copy-details';

export type ScanChoice = CopyDetails;

/** The confirm step: variant, condition and how many, then one tap to add. */
export function ScanConfirm({
  match,
  busy,
  disabled,
  onAdd,
  onBack,
}: {
  match: ScanMatch;
  busy: boolean;
  disabled: boolean;
  onAdd(choice: ScanChoice): void;
  onBack(): void;
}) {
  const [details, setDetails] = useState<CopyDetails>(DEFAULT_COPY);
  const owner = useOwnerLabel();

  return (
    <View style={styles.container}>
      <MatchSummary match={match} />
      <CopyDetailsFields value={details} onChange={setDetails} />
      <Button
        title={
          owner ? `Add ${details.quantity} to ${owner}` : `Add ${details.quantity} to collection`
        }
        busy={busy}
        disabled={disabled}
        onPress={() => onAdd(details)}
      />
      <Button title="Back to the matches" variant="secondary" onPress={onBack} />
    </View>
  );
}

/** A candidate's image, name, set code and number, and rarity, side by side. */
export function MatchSummary({
  match,
}: {
  match: Pick<
    ScanMatch,
    'id' | 'name' | 'number' | 'rarity' | 'set_abbreviation' | 'image' | 'image_hd'
  >;
}) {
  return (
    <View style={styles.card}>
      <CardImage
        card={{ id: match.id, images_small: match.image, images_large: match.image_hd }}
        size="small"
        style={styles.image}
      />
      <View style={styles.text}>
        <ThemedText variant="heading" numberOfLines={2}>
          {match.name}
        </ThemedText>
        <ThemedText variant="figureSmall" color="textSecondary">
          {[match.set_abbreviation?.toUpperCase(), match.number].filter(Boolean).join(' ')}
        </ThemedText>
        {match.rarity ? (
          <ThemedText variant="caption" color="textSecondary">
            {match.rarity}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm + 4 },
  card: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  image: { width: 72 },
  text: { flex: 1, gap: 2 },
});
