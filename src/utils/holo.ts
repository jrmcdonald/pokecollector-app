/**
 * Which holo shimmer a card's page shows, and the tilt that moves it.
 *
 * Upstream 1.56.0 overlays a foil effect only on a Holo or Reverse Holo copy,
 * a reverse holo winning when both are owned, and picks one of about twenty
 * looks from a hand-made design for that exact card. The app has no designs
 * (see DECISIONS.md, "Holo shimmer"), so it picks one of five looks from the
 * variant and the rarity instead:
 *
 * - `reverse`: fine stripes over the whole card, for a Reverse Holo copy.
 * - `holo`: one soft band of light, the classic holo rare.
 * - `sparkle`: a band with glitter, for the textured foils: V, VMAX, VSTAR,
 *   ex, GX, full arts, illustration rares, radiant and shiny cards.
 * - `rainbow`: a band of colour, for rainbow, secret, amazing and special
 *   illustration rares.
 * - `gold`: a warm band with glitter, for hyper rares and gold cards.
 *
 * A Normal or First Edition copy gets nothing, as upstream's advanced
 * effects give it nothing.
 */
import type { Card } from '@/api/schemas';

import { defaultVariant } from './variants';

export const HOLO_STYLES = ['holo', 'reverse', 'sparkle', 'rainbow', 'gold'] as const;
export type HoloStyle = (typeof HOLO_STYLES)[number];

type HoloCard = Pick<
  Card,
  'rarity' | 'variants_normal' | 'variants_holo' | 'variants_reverse' | 'variants_first_edition'
>;

/**
 * The look for a card's page. `variants` are the owned copies' variants;
 * with none, the printing the catalogue lists first stands in, so a card
 * that only exists in foil shimmers before it is owned too.
 */
export function holoStyleFor(
  card: HoloCard,
  variants: readonly (string | null | undefined)[],
): HoloStyle | null {
  const seen = (variants.length > 0 ? variants : [defaultVariant(card)]).map((v) =>
    normalize(v ?? 'Normal'),
  );
  if (seen.includes('reverse holo')) return 'reverse';
  if (seen.includes('holo')) return rarityStyle(card.rarity);
  return null;
}

/** The look for a holo copy, from its rarity. Unknown rarities get plain holo. */
export function rarityStyle(rarity: string | null | undefined): Exclude<HoloStyle, 'reverse'> {
  const r = normalize(rarity ?? '');
  if (/\b(hyper|gold)\b/.test(r)) return 'gold';
  if (/\b(secret|rainbow|amazing)\b|special illustration/.test(r)) return 'rainbow';
  if (
    /\b(ultra|illustration|double|full art|radiant|shiny|vmax|vstar|v|ex|gx|prime|legend|ace spec|crown)\b/.test(
      r,
    )
  ) {
    return 'sparkle';
  }
  return 'holo';
}

/** Lower case, accents and punctuation gone: `Holo Rare VSTAR` → `holo rare vstar`. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Tilt. Runs on the UI thread, once per gravity reading.
// ---------------------------------------------------------------------------

/** Standard gravity: Reanimated reports the gravity vector in m/s². */
const G = 9.81;
/** Tilting this far from where the phone is held (about 20°) is the full sweep. */
const FULL_TILT = 0.35;
/**
 * How quickly "level" follows the phone. Held still at an angle, the light
 * drifts back to the middle over a couple of seconds, so lying down or
 * reading on a table needs no calibration, as upstream recalibrates after a
 * steady hold.
 */
const BASELINE_FOLLOW = 0.012;
/** Smoothing of each reading, against sensor jitter. */
const SMOOTHING = 0.3;

export type TiltState = {
  /** Where "level" is, as a share of gravity on each axis; null until the first reading. */
  baseX: number | null;
  baseY: number;
  /** The tilt from level on each axis, -1 to 1. */
  x: number;
  y: number;
};

export const LEVEL: TiltState = { baseX: null, baseY: 0, x: 0, y: 0 };

/** The next tilt, from the last one and a gravity reading in m/s². */
export function nextTilt(state: TiltState, gx: number, gy: number): TiltState {
  'worklet';
  const nx = Math.max(-1, Math.min(1, gx / G));
  const ny = Math.max(-1, Math.min(1, gy / G));
  // The first reading is level.
  const fromX = state.baseX ?? nx;
  const fromY = state.baseX === null ? ny : state.baseY;
  const baseX = fromX + (nx - fromX) * BASELINE_FOLLOW;
  const baseY = fromY + (ny - fromY) * BASELINE_FOLLOW;
  const tx = Math.max(-1, Math.min(1, (nx - baseX) / FULL_TILT));
  const ty = Math.max(-1, Math.min(1, (ny - baseY) / FULL_TILT));
  return {
    baseX,
    baseY,
    x: state.x + (tx - state.x) * SMOOTHING,
    y: state.y + (ty - state.y) * SMOOTHING,
  };
}
