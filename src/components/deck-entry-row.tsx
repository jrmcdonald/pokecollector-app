import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import type { Deck, DeckEntry } from '@/api/schemas';
import { minTapTarget, spacing, useColors } from '@/theme';
import { entryCode, entryMissing } from '@/utils/decks';

import { CardImage } from './card-image';
import { ListRow } from './list-row';
import { QuantityStepper } from './quantity-stepper';
import { ThemedText } from './themed-text';

/** How long the copies have to stay put before they are saved: one request for a run of taps. */
export const SAVE_DELAY_MS = 600;

/**
 * One card of a deck: how many the deck needs and, for a planned deck, how
 * many are still missing, in words so it never rests on colour.
 */
export function DeckEntryRow({
  deck,
  entry,
}: {
  deck: Pick<Deck, 'binder_type'>;
  entry: DeckEntry;
}) {
  const card = entry.card ?? { id: entry.card_id, name: entry.card_id };
  const code = entryCode(entry);
  const missing = entryMissing(deck, entry);
  const copies = `${entry.required_quantity} ${entry.required_quantity === 1 ? 'copy' : 'copies'}`;
  return (
    <ListRow
      title={card.name}
      subtitle={[code, copies].filter(Boolean).join(' · ')}
      leading={<CardImage card={card} size="small" style={styles.image} />}
      trailing={
        missing > 0 ? (
          <ThemedText variant="label" color="textSecondary">
            {missing} missing
          </ThemedText>
        ) : null
      }
      accessibilityLabel={[card.name, code, copies, missing > 0 ? `${missing} missing` : null]
        .filter(Boolean)
        .join(', ')}
      onPress={() => router.push({ pathname: '/card/[id]', params: { id: entry.card_id } })}
    />
  );
}

/**
 * A deck's card while the deck is being edited: a stepper for its copies,
 * down to 0, which takes the card out. The stepper sits beside the row, not
 * in it, so VoiceOver reaches its buttons. Changes are saved once the
 * copies have stayed put for a moment.
 */
export function EditableDeckEntryRow({
  deck,
  entry,
  disabled = false,
  onChange,
}: {
  deck: Pick<Deck, 'binder_type'>;
  entry: DeckEntry;
  disabled?: boolean;
  onChange(quantity: number): void;
}) {
  const colors = useColors();
  const card = entry.card ?? { id: entry.card_id, name: entry.card_id };
  const code = entryCode(entry);
  const missing = entryMissing(deck, entry);
  const [value, setValue] = useState(entry.required_quantity);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Read when the timer fires or the row goes, after renders this closure missed.
  const latest = useRef({ onChange, value, saved: entry.required_quantity });
  useEffect(() => {
    latest.current = { onChange, value, saved: entry.required_quantity };
  });

  // Upstream's answer, or another device's edit, when nothing is waiting to be saved.
  useEffect(() => {
    if (!pending.current) setValue(entry.required_quantity);
  }, [entry.required_quantity]);

  const save = () => {
    pending.current = null;
    const { onChange: commit, value: next, saved } = latest.current;
    if (next !== saved) commit(next);
  };

  // Leaving edit mode, or the page, saves what was waiting.
  useEffect(
    () => () => {
      if (!pending.current) return;
      clearTimeout(pending.current);
      save();
    },
    [],
  );

  const change = (next: number) => {
    setValue(next);
    latest.current.value = next;
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(save, SAVE_DELAY_MS);
  };

  return (
    <View style={[styles.editRow, { borderBottomColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[card.name, code, missing > 0 ? `${missing} missing` : null]
          .filter(Boolean)
          .join(', ')}
        onPress={() => router.push({ pathname: '/card/[id]', params: { id: entry.card_id } })}
        style={({ pressed }) => [styles.editCard, pressed && { opacity: 0.6 }]}>
        <CardImage card={card} size="small" style={styles.image} />
        <View style={styles.text}>
          <ThemedText variant="label" numberOfLines={2}>
            {card.name}
          </ThemedText>
          {code || missing > 0 ? (
            <ThemedText variant="caption" color="textSecondary" numberOfLines={1}>
              {[code, missing > 0 ? `${missing} missing` : null].filter(Boolean).join(' · ')}
            </ThemedText>
          ) : null}
        </View>
      </Pressable>
      <QuantityStepper
        label={card.name}
        value={value}
        onChange={change}
        min={0}
        max={99}
        disabled={disabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: 40 },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: minTapTarget + 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  editCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 2 },
});
