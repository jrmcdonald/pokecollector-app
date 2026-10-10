import { useState } from 'react';
import { useWindowDimensions } from 'react-native';

/** The largest standard Dynamic Type size is about 1.35×. */
const LARGE = 1.3;
/** The first accessibility size (AX1) is about 1.65×; the largest about 3.1×. */
const ACCESSIBILITY = 1.6;

/**
 * Whether the text is set large enough that side-by-side figures no longer
 * fit: from the largest standard Dynamic Type size (about 1.35×) up. Rows of
 * tiles stack then, so a word is never broken across lines (HIG Typography;
 * WCAG 1.4.4 and 1.4.10).
 */
export function useLargeText(): boolean {
  return useWindowDimensions().fontScale >= LARGE;
}

/**
 * `useLargeText`, kept at the size the screen opened with, for a layout
 * that rearranges itself on it rather than only restyling: see
 * `useOpeningFontScale` for what following every change does to one.
 */
export function useLargeTextLayout(): boolean {
  return useOpeningFontScale() >= LARGE;
}

/**
 * Whether the text is at one of the accessibility sizes, where even a short
 * word ("Missing") outgrows a third of the screen. Controls laid side by side
 * stack then (HIG Typography: Dynamic Type sizes).
 */
export function useAccessibilityText(): boolean {
  return useOpeningFontScale() >= ACCESSIBILITY;
}

/**
 * Columns for a grid of card tiles: three, two once the text is large, and
 * one at the accessibility sizes, where a tile becomes a row with the name
 * beside a small image. Names break mid-word otherwise ("Char/mander").
 */
export function useCardColumns(): 1 | 2 | 3 {
  const fontScale = useOpeningFontScale();
  return fontScale >= ACCESSIBILITY ? 1 : fontScale >= LARGE ? 2 : 3;
}

/**
 * The text size when the screen opened, kept until it closes. Following
 * every change, the simulator walkthrough at the largest size found a grid
 * screen's text cut in half after the accessibility audit, which tries
 * other text sizes for a moment: as if its list, rebuilt when its columns
 * changed, was measured at the passing size and drawn at the real one.
 * Screens that kept their layout were unaffected. A size changed in
 * Settings applies when the screen is next opened (the Search tab, which
 * stays open, when the app restarts), and a list keeps its place meanwhile.
 */
function useOpeningFontScale(): number {
  const { fontScale } = useWindowDimensions();
  const [opening] = useState(fontScale);
  return opening;
}
