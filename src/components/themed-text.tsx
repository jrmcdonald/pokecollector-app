import { Text, type TextProps } from 'react-native';

import { type, useColors, type Colors } from '@/theme';

export type ThemedTextProps = TextProps & {
  variant?: keyof typeof type;
  color?: keyof Colors;
};

/**
 * Titles and section headings are marked as headings, so VoiceOver's rotor
 * can jump between them (WCAG 1.3.1). Pass another `accessibilityRole` for a
 * heading-sized text that is not a heading.
 */
const HEADINGS: ReadonlySet<keyof typeof type> = new Set(['title', 'heading']);

export function ThemedText({ style, variant = 'body', color = 'text', ...rest }: ThemedTextProps) {
  const colors = useColors();
  return (
    <Text
      accessibilityRole={HEADINGS.has(variant) ? 'header' : undefined}
      style={[type[variant], { color: colors[color] }, style]}
      {...rest}
    />
  );
}
