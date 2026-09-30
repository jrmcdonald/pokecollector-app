import {
  AUTO_START,
  findCardEdges,
  guideInFrame,
  STEADY_FRAMES,
  stepAuto,
  type AutoState,
} from '../card-detect';
import { cropForGuide, guideRect, type Rect, type Size } from '../crop';

const view: Size = { width: 390, height: 700 };
const guide = guideRect(view);

/** A plain luma plane with, optionally, a brighter card drawn on it. */
function plane(size: Size, card?: Rect, { table = 60, face = 200, stride = size.width } = {}) {
  const luma = new Uint8Array(stride * size.height).fill(table);
  if (card) {
    for (let y = Math.round(card.y); y < Math.round(card.y + card.height); y++) {
      for (let x = Math.round(card.x); x < Math.round(card.x + card.width); x++) {
        luma[y * stride + x] = face;
      }
    }
  }
  return { luma, stride };
}

function shift(rect: Rect, dx: number, dy: number, grow = 0): Rect {
  return {
    x: rect.x + dx - grow,
    y: rect.y + dy - grow,
    width: rect.width + 2 * grow,
    height: rect.height + 2 * grow,
  };
}

describe('guideInFrame', () => {
  it('matches the photo crop when the frame is upright', () => {
    const frame = { width: 480, height: 640 };
    const expected = cropForGuide(frame, view, guide, 0);
    const got = guideInFrame(frame, view, guide);
    expect(got.x).toBeCloseTo(expected.x, 0);
    expect(got.y).toBeCloseTo(expected.y, 0);
    expect(got.width).toBeCloseTo(expected.width, 0);
    expect(got.height).toBeCloseTo(expected.height, 0);
  });

  it('turns the guide a quarter for a landscape buffer, still centred', () => {
    const upright = guideInFrame({ width: 480, height: 640 }, view, guide);
    const sideways = guideInFrame({ width: 640, height: 480 }, view, guide);
    expect(sideways.width).toBeCloseTo(upright.height);
    expect(sideways.height).toBeCloseTo(upright.width);
    expect(sideways.x + sideways.width / 2).toBeCloseTo(320);
    expect(sideways.y + sideways.height / 2).toBeCloseTo(240);
  });
});

describe('findCardEdges', () => {
  const frame = { width: 480, height: 640 };
  const inFrame = guideInFrame(frame, view, guide);

  function edges(card?: Rect, options?: Parameters<typeof plane>[2]) {
    const { luma, stride } = plane(frame, card, options);
    return findCardEdges(luma, stride, frame.width, frame.height, inFrame);
  }

  it('finds all four edges of a card lined up with the guide', () => {
    const found = edges(inFrame);
    expect(found).toHaveLength(4);
    for (const e of found) expect(Math.abs(e)).toBeLessThan(0.2);
  });

  it('finds a card a little off the guide, and says which way', () => {
    const [top, right, bottom, left] = edges(shift(inFrame, 0, 8));
    expect(top).toBeGreaterThan(0.2);
    expect(bottom).toBeGreaterThan(0.2);
    expect(Math.abs(right ?? NaN)).toBeLessThan(0.2);
    expect(Math.abs(left ?? NaN)).toBeLessThan(0.2);
  });

  it('finds a darker card on a lighter table', () => {
    const found = edges(inFrame, { table: 210, face: 40 });
    expect(found.every(Number.isFinite)).toBe(true);
  });

  it('reads rows by the stride, not the width', () => {
    const found = edges(inFrame, { stride: 512 });
    expect(found.every(Number.isFinite)).toBe(true);
  });

  it('finds nothing on an empty table', () => {
    expect(edges().every(Number.isNaN)).toBe(true);
  });

  it('finds nothing for a card much smaller than the guide', () => {
    expect(edges(shift(inFrame, 0, 0, -40)).every(Number.isNaN)).toBe(true);
  });

  it('finds no side in random noise', () => {
    let seed = 7;
    const luma = new Uint8Array(frame.width * frame.height).map(() => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % 256;
    });
    const found = findCardEdges(luma, frame.width, frame.width, frame.height, inFrame);
    expect(found.some(Number.isFinite)).toBe(false);
  });

  it('stays inside a guide that runs off the frame', () => {
    const tall = { x: -10, y: -10, width: 500, height: 660 };
    expect(() => findCardEdges(plane(frame).luma, 480, 480, 640, tall)).not.toThrow();
  });
});

describe('stepAuto', () => {
  const card = [0.05, -0.02, 0.03, 0];
  const none = [NaN, NaN, NaN, NaN];

  function run(frames: readonly (readonly number[])[], start: AutoState = AUTO_START) {
    let state = start;
    const fired: number[] = [];
    const statuses: string[] = [];
    frames.forEach((edges, i) => {
      const step = stepAuto(state, edges);
      state = step.state;
      statuses.push(step.status);
      if (step.fire) fired.push(i);
    });
    return { state, fired, statuses };
  }

  it('takes the photo once the card has held still', () => {
    const { fired, statuses } = run(Array(STEADY_FRAMES).fill(card));
    expect(fired).toEqual([STEADY_FRAMES - 1]);
    expect(statuses[0]).toBe('holding');
  });

  it('waits while the card moves', () => {
    const moving = Array.from({ length: 12 }, (_, i) => card.map((e) => e + (i % 2) * 0.5));
    expect(run(moving).fired).toEqual([]);
  });

  it('takes a card left in the guide once, then the next after it is taken away', () => {
    const frames = [
      ...Array(STEADY_FRAMES * 3).fill(card),
      none,
      none,
      none,
      ...Array(STEADY_FRAMES).fill(card),
    ];
    const { fired, statuses } = run(frames);
    expect(fired).toEqual([STEADY_FRAMES - 1, frames.length - 1]);
    expect(statuses[STEADY_FRAMES]).toBe('remove');
  });

  it('is not fooled by a frame that briefly misses the card', () => {
    const frames = [...Array(STEADY_FRAMES).fill(card), none, ...Array(STEADY_FRAMES).fill(card)];
    expect(run(frames).fired).toEqual([STEADY_FRAMES - 1]);
  });

  it('needs all four sides', () => {
    expect(run(Array(10).fill([0, 0, 0, NaN])).fired).toEqual([]);
  });
});
