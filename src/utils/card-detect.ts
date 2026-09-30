/**
 * Auto-capture: is there a card in the guide, lined up and holding still?
 *
 * No general rectangle detector. The guide already says where the card
 * should be, so this only looks for the card's four edges near the four
 * sides of the guide, in the brightness (luma) plane of a small camera
 * frame. Along each side it takes a dozen short cuts across the side and
 * finds the strongest change in brightness on each; a side has an edge when
 * most of those land on one straight line. A card on a table, sleeved or
 * not, gives four; an empty table, a hand or a patterned cloth rarely gives
 * four straight ones.
 *
 * The first two functions run on the camera's thread as worklets, once per
 * frame; `stepAuto` runs in React Native's JavaScript with their results.
 */
import type { Rect, Size } from './crop';

/** Cuts across each side of the guide. */
const SAMPLES = 12;
/** Cuts that must agree for a side to count as an edge. */
const MIN_HITS = 9;
/** The cuts cover the middle of each side, clear of the rounded corners. */
const SPAN_START = 0.2;
const SPAN_END = 0.8;
/** How far either side of the guide an edge is looked for, as a fraction of the guide's short side. */
const BAND = 0.1;
/** Pixels either side of a point when measuring the change in brightness there. */
const GAP = 2;
/** The least change in brightness (0 to 255) that can be a card's edge. */
const MIN_CONTRAST = 24;
/** How far from the line an agreeing cut may be, as a fraction of the band. */
const STRAIGHT = 0.3;

/**
 * Where the on-screen guide falls in a camera frame's pixel buffer.
 *
 * The preview covers its view, like the photo (`cropForGuide`). The buffer
 * may be the sensor's landscape while the app is portrait; since the guide
 * is centred, turning it a quarter either way gives the same rectangle, so
 * only whether the buffer is sideways matters, not which way.
 */
export function guideInFrame(frame: Size, view: Size, guide: Rect): Rect {
  'worklet';
  const sideways = frame.width > frame.height !== view.width > view.height;
  const uprightWidth = sideways ? frame.height : frame.width;
  const uprightHeight = sideways ? frame.width : frame.height;
  const scale = Math.max(view.width / uprightWidth, view.height / uprightHeight);
  const offsetX = (uprightWidth * scale - view.width) / 2;
  const offsetY = (uprightHeight * scale - view.height) / 2;
  const x = (guide.x + offsetX) / scale;
  const y = (guide.y + offsetY) / scale;
  const width = guide.width / scale;
  const height = guide.height / scale;
  if (!sideways) return { x, y, width, height };
  return {
    x: (frame.width - height) / 2,
    y: (frame.height - width) / 2,
    width: height,
    height: width,
  };
}

/**
 * The offset of the line most of the cuts agree on, or NaN if they don't.
 * Defined before its caller: the worklet plugin turns functions into
 * constants, which are not hoisted.
 */
function straightLine(positions: number[], band: number, centre: number): number {
  'worklet';
  if (positions.length < MIN_HITS) return NaN;
  const sorted = positions.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? centre;
  const tolerance = Math.max(1.5, band * STRAIGHT);
  let agree = 0;
  for (const p of sorted) if (Math.abs(p - median) <= tolerance) agree++;
  if (agree < MIN_HITS) return NaN;
  return (median - centre) / band;
}

/**
 * The card's edges near the guide in a luma plane: for the top, right,
 * bottom and left sides in turn, how far the edge found is from the guide's
 * side, as a fraction of the band searched (−1 to 1), or NaN where none was
 * found. A card is there when all four are numbers.
 */
export function findCardEdges(
  luma: Uint8Array,
  stride: number,
  width: number,
  height: number,
  guide: Rect,
): number[] {
  'worklet';
  const band = Math.max(GAP + 1, Math.round(Math.min(guide.width, guide.height) * BAND));
  const left = guide.x;
  const top = guide.y;
  const right = guide.x + guide.width;
  const bottom = guide.y + guide.height;
  const sides = [
    { line: top, from: left, to: right, horizontal: true },
    { line: right, from: top, to: bottom, horizontal: false },
    { line: bottom, from: left, to: right, horizontal: true },
    { line: left, from: top, to: bottom, horizontal: false },
  ];
  const offsets: number[] = [];
  const positions: number[] = [];
  for (const side of sides) {
    positions.length = 0;
    const centre = Math.round(side.line);
    // The cut runs across the side: down for a top or bottom edge, along for a left or right one.
    const limit = side.horizontal ? height : width;
    const start = Math.max(GAP, centre - band);
    const end = Math.min(limit - 1 - GAP, centre + band);
    for (let i = 0; i < SAMPLES; i++) {
      const t = SPAN_START + ((SPAN_END - SPAN_START) * i) / (SAMPLES - 1);
      const along = Math.round(side.from + (side.to - side.from) * t);
      if (along < 0 || along >= (side.horizontal ? width : height)) continue;
      let best = 0;
      let at = -1;
      for (let p = start; p <= end; p++) {
        const before = side.horizontal
          ? luma[(p - GAP) * stride + along]
          : luma[along * stride + p - GAP];
        const after = side.horizontal
          ? luma[(p + GAP) * stride + along]
          : luma[along * stride + p + GAP];
        const contrast = Math.abs((after ?? 0) - (before ?? 0));
        if (contrast > best) {
          best = contrast;
          at = p;
        }
      }
      if (best >= MIN_CONTRAST) positions.push(at);
    }
    offsets.push(straightLine(positions, band, centre));
  }
  return offsets;
}

/**
 * What auto-capture shows while it looks: nothing found yet; a card found
 * and being held still; or the card just photographed still there, which
 * has to go before the next is taken.
 */
export type AutoStatus = 'searching' | 'holding' | 'remove';

export interface AutoState {
  /** Ready to take a photo; false from a photo until the card is taken away. */
  armed: boolean;
  /** Frames in a row with the card found where it was in the one before. */
  steady: number;
  /** Frames in a row with no card. */
  absent: number;
  last: readonly number[] | null;
}

/** Frames checked (about ten a second) with the card still before it is taken: half a second. */
export const STEADY_FRAMES = 5;
/** Frames with no card before the next one can be taken. */
const ABSENT_FRAMES = 3;
/** How far an edge may move between frames and still count as still, as a fraction of the band. */
const STILL = 0.2;

export const AUTO_START: AutoState = { armed: true, steady: 0, absent: 0, last: null };

/**
 * One frame's result into the running state: whether to take the photo now,
 * and what to show. Once a photo is taken it waits for the card to be taken
 * away, so a card left in the guide is photographed once, not over and over.
 */
export function stepAuto(
  state: AutoState,
  edges: readonly number[],
): { state: AutoState; status: AutoStatus; fire: boolean } {
  const found = edges.length === 4 && edges.every((e) => Number.isFinite(e));
  if (!found) {
    const absent = state.absent + 1;
    const next = { armed: state.armed || absent >= ABSENT_FRAMES, steady: 0, absent, last: null };
    return { state: next, status: next.armed ? 'searching' : 'remove', fire: false };
  }
  const still =
    state.last !== null && edges.every((e, i) => Math.abs(e - (state.last?.[i] ?? NaN)) <= STILL);
  const steady = still ? state.steady + 1 : 1;
  if (!state.armed) {
    return {
      state: { armed: false, steady, absent: 0, last: edges },
      status: 'remove',
      fire: false,
    };
  }
  if (steady >= STEADY_FRAMES) {
    return {
      state: { armed: false, steady: 0, absent: 0, last: edges },
      status: 'remove',
      fire: true,
    };
  }
  return { state: { armed: true, steady, absent: 0, last: edges }, status: 'holding', fire: false };
}
