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

/** A camera view and the guide drawn on it: what a photo's crop is worked out from. */
export interface CameraFrame {
  view: Size;
  guide: Rect;
}

/** A card's printed proportions, 63 × 88 mm. */
export const CARD_RATIO = 63 / 88;

/**
 * The card-shaped guide, centred, as large as fits with room around it.
 *
 * `maxBottom` is the lowest the guide may reach, for a view that runs behind
 * controls (the camera runs behind the shutter and the tab bar). The guide
 * stays centred in the whole view and shrinks to keep clear: centred, it
 * maps onto the photo and the camera frame the same way whichever way the
 * sensor is turned (see `guideInFrame`).
 */
export function guideRect(view: Size, maxBottom = view.height): Rect {
  const clear = Math.max(0, 2 * Math.min(maxBottom, view.height) - view.height);
  const width = Math.min(view.width * 0.78, view.height * 0.62 * CARD_RATIO, clear * CARD_RATIO);
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

/** A rounded rectangle as an SVG path, for cutting the guide out of the shade. */
export function roundedRectPath({ x, y, width: w, height: h }: Rect, r: number): string {
  const k = Math.min(r, w / 2, h / 2);
  return [
    `M${x + k},${y}`,
    `H${x + w - k}`,
    `A${k},${k} 0 0 1 ${x + w},${y + k}`,
    `V${y + h - k}`,
    `A${k},${k} 0 0 1 ${x + w - k},${y + h}`,
    `H${x + k}`,
    `A${k},${k} 0 0 1 ${x},${y + h - k}`,
    `V${y + k}`,
    `A${k},${k} 0 0 1 ${x + k},${y}`,
    'Z',
  ].join(' ');
}
