import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Chips } from '@/components/chips';
import { Segmented } from '@/components/segmented';
import { TextField } from '@/components/text-field';
import { ThemedText } from '@/components/themed-text';
import { useCreateBinder, useIsOnline } from '@/hooks/queries';
import { spacing } from '@/theme';
import { BINDER_COLORS } from '@/utils/binders';

const KINDS = [
  { value: 'collection', label: 'Collection' },
  { value: 'wishlist', label: 'Planned' },
] as const;

type Kind = (typeof KINDS)[number]['value'];

/** Binders → Add: a new, empty binder, then its page to fill it. */
export default function NewBinder() {
  const online = useIsOnline();
  const create = useCreateBinder();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<Kind>('collection');
  const [color, setColor] = useState(BINDER_COLORS[0]?.value ?? '#EF1515');
  const [error, setError] = useState<string>();

  function save() {
    const trimmed = name.trim().slice(0, 255);
    if (!trimmed) {
      setError('Give the binder a name.');
      return;
    }
    create.mutate(
      { name: trimmed, binder_type: kind, color },
      {
        onSuccess: (binder) =>
          router.replace({
            pathname: '/binder/[id]',
            params: { id: String(binder.id), name: binder.name },
          }),
      },
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        <TextField
          label="Name"
          placeholder="Trade binder"
          autoCapitalize="words"
          maxLength={255}
          returnKeyType="done"
          value={name}
          onChangeText={(text) => {
            setName(text);
            setError(undefined);
          }}
          onSubmitEditing={save}
          error={error}
        />
        <View style={styles.group}>
          <Segmented<Kind> label="Kind" options={KINDS} value={kind} onChange={setKind} />
          <ThemedText variant="caption" color="textSecondary">
            {kind === 'collection'
              ? 'Holds copies you own, each in one binder at a time.'
              : 'Lists cards to collect, owned or not, and shows what is still missing.'}
          </ThemedText>
        </View>
        <View style={styles.group}>
          <ThemedText variant="label">Colour</ThemedText>
          <Chips<string>
            label="Colour"
            options={BINDER_COLORS.map((c) => ({ value: c.value, label: c.name, swatch: c.value }))}
            value={color}
            onChange={setColor}
          />
        </View>
        {!online ? (
          <ThemedText variant="caption" color="textSecondary">
            Offline: creating a binder needs a connection.
          </ThemedText>
        ) : null}
        <Button title="Create binder" busy={create.isPending} disabled={!online} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  group: { gap: spacing.sm },
});
