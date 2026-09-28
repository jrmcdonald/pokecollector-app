/**
 * Colors, spacing and type for the "Night holo" look: a dark-only theme with
 * a yellow accent, a teal holo edge on cards, Space Grotesk for text and
 * JetBrains Mono for figures. Kept deliberately small: a handful of named
 * roles rather than a palette, so a screen asks for "the secondary text
 * color", never a hex value.
 *
 * The app is dark whatever the phone's setting (see `forceDarkAppearance`),
 * which also makes the native headers, tab bar and alerts dark.
 */
import { Appearance, type TextStyle } from 'react-native';

export const palette = {
  text: '#EEF0F6',
  textSecondary: '#9AA3B5',
  background: '#0D0F14',
  /** Cards and grouped sections. */
  surface: '#171A22',
  /** Tiles inside a surface, and pressed or selected controls. */
  surfaceRaised: '#222633',
  surfaceSelected: '#2A2F3D',
  /** Separators and panel edges: decoration, so no contrast minimum. */
  border: '#2A2F3D',
  /**
   * The edge of a control that is recognised by its outline (a text field,
   * an unselected chip): at least 3:1 against every surface, per WCAG 2.2
   * 1.4.11 Non-text Contrast.
   */
  outline: '#687186',
  accent: '#F5C518',
  onAccent: '#111317',
  /** The holo edge on card art, and secondary highlights. */
  holo: '#4FC3E8',
  success: '#4CC38A',
  danger: '#FF6B6B',
} as const;

export type Colors = { [K in keyof typeof palette]: string };

/**
 * Font family names, as registered by `useAppFonts`. iOS will not synthesise
 * weights across separately loaded files, so each weight is its own family
 * and styles never set `fontWeight` alongside these.
 */
export const fonts = {
  regular: 'SpaceGrotesk_400Regular',
  medium: 'SpaceGrotesk_500Medium',
  semibold: 'SpaceGrotesk_600SemiBold',
  bold: 'SpaceGrotesk_700Bold',
  mono: 'JetBrainsMono_500Medium',
  monoBold: 'JetBrainsMono_700Bold',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
} as const;

export const type = {
  title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34 },
  heading: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  /** A small uppercase heading over a group or a figure. */
  overline: {
    fontFamily: fonts.medium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  /** Prices, counts and collector numbers. */
  figure: { fontFamily: fonts.monoBold, fontSize: 20, lineHeight: 26 },
  figureLarge: { fontFamily: fonts.monoBold, fontSize: 40, lineHeight: 46 },
  figureSmall: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 18 },
} as const satisfies Record<string, TextStyle>;

/** The minimum tap target, per Apple's HIG. */
export const minTapTarget = 44;

export function useColors(): Colors {
  return palette;
}

/** Makes native UI (headers, tab bar, alerts, keyboards) dark. */
export function forceDarkAppearance() {
  Appearance.setColorScheme('dark');
}
