import type { Card, Variant } from '@/api/schemas';

/**
 * The variant to preselect: the first one the catalogue says this printing
 * exists in. All four are always offered, in a fixed order, because the
 * catalogue's flags are often incomplete and the copy in hand is what counts.
 */
export function defaultVariant(
  card: Pick<
    Card,
    'variants_normal' | 'variants_holo' | 'variants_reverse' | 'variants_first_edition'
  >,
): Variant {
  const flags: [Variant, boolean | null | undefined][] = [
    ['Normal', card.variants_normal],
    ['Holo', card.variants_holo],
    ['Reverse Holo', card.variants_reverse],
    ['First Edition', card.variants_first_edition],
  ];
  return flags.find(([, flag]) => flag)?.[0] ?? 'Normal';
}
