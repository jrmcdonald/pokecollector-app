import { StyleSheet, View } from 'react-native';

import { CONDITIONS, VARIANTS, type Condition, type Variant } from '@/api/schemas';
import { Chips } from '@/components/chips';
import { PrintingDetailsPicker } from '@/components/printing-details-picker';
import { QuantityStepper } from '@/components/quantity-stepper';
import { ThemedText } from '@/components/themed-text';
import { spacing } from '@/theme';

/** How a scanned card goes into the collection. */
export interface CopyDetails {
  variant: Variant;
  condition: Condition;
  quantity: number;
  printing_details: string[];
}

export const DEFAULT_COPY: CopyDetails = {
  variant: 'Normal',
  condition: 'NM',
  quantity: 1,
  printing_details: [],
};

/** Variant, condition, printing details and how many: the same for one scan or a batch. */
export function CopyDetailsFields({
  value,
  onChange,
}: {
  value: CopyDetails;
  onChange(next: CopyDetails): void;
}) {
  return (
    <View style={styles.container}>
      <Chips<Variant>
        label="Variant"
        options={VARIANTS.map((v) => ({ value: v, label: v }))}
        value={value.variant}
        onChange={(variant) => onChange({ ...value, variant })}
      />
      <Chips<Condition>
        label="Condition"
        options={CONDITIONS.map((c) => ({ value: c, label: c }))}
        value={value.condition}
        onChange={(condition) => onChange({ ...value, condition })}
      />
      <PrintingDetailsPicker
        value={value.printing_details}
        onChange={(printing_details) => onChange({ ...value, printing_details })}
      />
      <View style={styles.row}>
        <ThemedText>Quantity</ThemedText>
        <QuantityStepper
          label="Copies to add"
          value={value.quantity}
          onChange={(quantity) => onChange({ ...value, quantity })}
          min={1}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm + 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
