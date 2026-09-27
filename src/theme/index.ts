/**
 * Colors, spacing and type, in light and dark. Kept deliberately small: a
 * handful of named roles rather than a palette, so a screen asks for "the
 * secondary text color", never a hex value.
 */
import { useColorScheme } from 'react-native';

const palette = {
  light: {
    text: '#11181C',
    textSecondary: '#60646C',
    background: '#FFFFFF',
    surface: '#F1F2F4',
    surfaceSelected: '#E0E1E6',
    border: '#D9DBE0',
    accent: '#D62F2F',
    onAccent: '#FFFFFF',
    success: '#1F8A4C',
    danger: '#C62828',
  },
  dark: {
    text: '#ECEDEE',
    textSecondary: '#A0A4AB',
    background: '#000000',
    surface: '#1C1D20',
    surfaceSelected: '#2E3135',
    border: '#34363B',
    accent: '#FF5A4E',
    onAccent: '#000000',
    success: '#4CC38A',
    danger: '#FF6B6B',
  },
} as const;

export type Colors = { [K in keyof (typeof palette)['light']]: string };

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 12,
} as const;

export const type = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const;

/** The minimum tap target, per Apple's HIG. */
export const minTapTarget = 44;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? palette.dark : palette.light;
}
