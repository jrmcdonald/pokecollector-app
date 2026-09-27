import { Text, type TextProps } from 'react-native';

import { type, useColors, type Colors } from '@/theme';

export type ThemedTextProps = TextProps & {
  variant?: keyof typeof type;
  color?: keyof Colors;
};

export function ThemedText({ style, variant = 'body', color = 'text', ...rest }: ThemedTextProps) {
  const colors = useColors();
  return <Text style={[type[variant], { color: colors[color] }, style]} {...rest} />;
}
