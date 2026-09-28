import { useWindowDimensions } from 'react-native';

/**
 * Whether the text is set large enough that side-by-side figures no longer
 * fit: from the largest standard Dynamic Type size (about 1.35×) up. Rows of
 * tiles stack then, so a word is never broken across lines (HIG Typography;
 * WCAG 1.4.4 and 1.4.10).
 */
export function useLargeText(): boolean {
  return useWindowDimensions().fontScale >= 1.3;
}
