import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { minTapTarget, radius, spacing, useColors } from '@/theme';

import { TextField } from './text-field';
import { ThemedText } from './themed-text';

/**
 * A saved secret shown as a masked summary with a Replace button, rather than
 * a field full of dots. Replacing clears it and opens an empty field; Keep
 * puts the saved value back. With nothing saved, it is a plain secure field.
 */
export function SecretField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText(text: string): void;
}) {
  const colors = useColors();
  const [saved] = useState(value);
  const [editing, setEditing] = useState(!value);

  if (editing) {
    return (
      <View style={styles.container}>
        <TextField
          label={label}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry
          textContentType="none"
          autoComplete="off"
          autoFocus={!!saved}
        />
        {saved ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onChangeText(saved);
              setEditing(false);
            }}
            style={styles.link}>
            <ThemedText variant="label" style={{ color: colors.accent }}>
              Keep the saved one
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ThemedText variant="label">{label}</ThemedText>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.outline }]}>
        <ThemedText
          variant="figureSmall"
          color="textSecondary"
          style={styles.mask}
          accessibilityLabel={`${label}: saved, ${value.length} characters`}>
          •••••••• {value.length} characters
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Replace the ${label.toLowerCase()}`}
          onPress={() => {
            onChangeText('');
            setEditing(true);
          }}
          style={styles.replace}>
          <ThemedText variant="label" style={{ color: colors.accent }}>
            Replace
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  row: {
    height: minTapTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.sm + 4,
  },
  mask: { flex: 1 },
  replace: { height: minTapTarget, paddingHorizontal: spacing.md, justifyContent: 'center' },
  link: { minHeight: minTapTarget, justifyContent: 'center', alignSelf: 'flex-start' },
});
