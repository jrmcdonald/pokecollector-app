/**
 * WCAG 2.2 contrast ratio between two sRGB colours, from 1 (identical) to 21
 * (black on white). https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
 */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Relative luminance of a `#RRGGBB` colour. */
export function luminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Not a #RRGGBB colour: ${hex}`);
  const [r, g, b] = match.slice(1).map((part) => {
    const c = parseInt(part, 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.2 AA minimums. */
export const AA = {
  /** 1.4.3: body text. */
  text: 4.5,
  /** 1.4.3: text at least 24 pt, or 18.66 pt bold. */
  largeText: 3,
  /** 1.4.11: icons, and the edges that identify a control. */
  nonText: 3,
} as const;
