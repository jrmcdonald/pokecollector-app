/**
 * Mapping the on-screen card guide onto the captured photo.
 *
 * The preview fills its view (aspect "cover"), so the photo is scaled until
 * it covers the view and the overflow is cut off equally on both sides. The
 * guide is drawn in view points; the crop has to be in photo pixels.
 */

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

/** A card's printed proportions, 63 × 88 mm. */
export const CARD_RATIO = 63 / 88;

/** The card-shaped guide, centred, as large as fits with room around it. */
export function guideRect(view: Size): Rect {
  const width = Math.min(view.width * 0.78, view.height * 0.62 * CARD_RATIO);
  const height = width / CARD_RATIO;
  return {
    x: (view.width - width) / 2,
    y: (view.height - height) / 2,
    width,
    height,
  };
}

/**
 * The part of the photo under the guide, grown by `margin` (a fraction of
 * the guide) on each side so a card held slightly off-centre keeps its
 * edges, and clamped to the photo.
 */
export function cropForGuide(photo: Size, view: Size, guide: Rect, margin = 0.06): Rect {
  const scale = Math.max(view.width / photo.width, view.height / photo.height);
  const offsetX = (photo.width * scale - view.width) / 2;
  const offsetY = (photo.height * scale - view.height) / 2;
  const padX = guide.width * margin;
  const padY = guide.height * margin;

  const left = Math.max(0, (guide.x - padX + offsetX) / scale);
  const top = Math.max(0, (guide.y - padY + offsetY) / scale);
  const right = Math.min(photo.width, (guide.x + guide.width + padX + offsetX) / scale);
  const bottom = Math.min(photo.height, (guide.y + guide.height + padY + offsetY) / scale);

  const x = Math.round(left);
  const y = Math.round(top);
  return {
    x,
    y,
    width: Math.max(1, Math.min(photo.width - x, Math.round(right - left))),
    height: Math.max(1, Math.min(photo.height - y, Math.round(bottom - top))),
  };
}

/**
 * The size to shrink a crop to so its long edge is `longEdge`, or null if it
 * is already that small. About 1200 px keeps the collector number, set code
 * and regulation mark legible to the model; upstream re-encodes anyway.
 */
export function downscaleTo(size: Size, longEdge = 1200): Size | null {
  const long = Math.max(size.width, size.height);
  if (long <= longEdge) return null;
  const factor = longEdge / long;
  return { width: Math.round(size.width * factor), height: Math.round(size.height * factor) };
}
