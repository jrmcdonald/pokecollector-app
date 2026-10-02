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
 * Whether the text is at one of the accessibility sizes, where even a short
 * word ("Missing") outgrows a third of the screen. Controls laid side by side
 * stack then (HIG Typography: Dynamic Type sizes).
 */
export function useAccessibilityText(): boolean {
  return useWindowDimensions().fontScale >= ACCESSIBILITY;
}

/**
 * Columns for a grid of card tiles: three, two once the text is large, and
 * one at the accessibility sizes, where a tile becomes a row with the name
 * beside a small image. Names break mid-word otherwise ("Char/mander").
 */
export function useCardColumns(): 1 | 2 | 3 {
  const { fontScale } = useWindowDimensions();
  return fontScale >= ACCESSIBILITY ? 1 : fontScale >= LARGE ? 2 : 3;
}
