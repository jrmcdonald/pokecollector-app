import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CONDITIONS, VARIANTS, type Condition, type ScanMatch, type Variant } from '@/api/schemas';
import { Button } from '@/components/button';
import { CardImage } from '@/components/card-image';
import { Chips } from '@/components/chips';
import { QuantityStepper } from '@/components/quantity-stepper';
import { ThemedText } from '@/components/themed-text';
import { useOwnerLabel } from '@/hooks/use-owner-label';
import { spacing } from '@/theme';

export interface ScanChoice {
  variant: Variant;
  condition: Condition;
  quantity: number;
}

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
  const [variant, setVariant] = useState<Variant>('Normal');
  const [condition, setCondition] = useState<Condition>('NM');
  const [quantity, setQuantity] = useState(1);
  const owner = useOwnerLabel();

  return (
    <View style={styles.container}>
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
      <Chips<Variant>
        label="Variant"
        options={VARIANTS.map((v) => ({ value: v, label: v }))}
        value={variant}
        onChange={setVariant}
      />
      <Chips<Condition>
        label="Condition"
        options={CONDITIONS.map((c) => ({ value: c, label: c }))}
        value={condition}
        onChange={setCondition}
      />
      <View style={styles.row}>
        <ThemedText>Quantity</ThemedText>
        <QuantityStepper label="Copies to add" value={quantity} onChange={setQuantity} min={1} />
      </View>
      <Button
        title={owner ? `Add ${quantity} to ${owner}` : `Add ${quantity} to collection`}
        busy={busy}
        disabled={disabled}
        onPress={() => onAdd({ variant, condition, quantity })}
      />
      <Button title="Back to the matches" variant="secondary" onPress={onBack} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm + 4 },
  card: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  image: { width: 72 },
  text: { flex: 1, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
