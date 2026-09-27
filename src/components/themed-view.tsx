import { View, type ViewProps } from 'react-native';

import { useColors, type Colors } from '@/theme';

export type ThemedViewProps = ViewProps & {
  background?: keyof Colors;
};

export function ThemedView({ style, background = 'background', ...rest }: ThemedViewProps) {
  const colors = useColors();
  return <View style={[{ backgroundColor: colors[background] }, style]} {...rest} />;
}
