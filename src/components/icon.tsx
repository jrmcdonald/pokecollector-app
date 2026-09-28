import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { useColors, type Colors } from '@/theme';

/**
 * An SF Symbol in one of the theme's colours. Decorative by default, hidden
 * from VoiceOver: the control around it carries the name. Pass `label` for an
 * icon that means something on its own.
 */
export function Icon({
  name,
  size = 18,
  color = 'text',
  weight = 'semibold',
  label,
}: {
  name: SymbolViewProps['name'];
  size?: number;
  color?: keyof Colors;
  weight?: SymbolViewProps['weight'];
  label?: string;
}) {
  const colors = useColors();
  return (
    <SymbolView
      name={name}
      size={size}
      weight={weight}
      tintColor={colors[color]}
      accessible={!!label}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      style={{ width: size, height: size }}
    />
  );
}
