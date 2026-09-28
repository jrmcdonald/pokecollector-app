import { CARD_RATIO, cropForGuide, downscaleTo, guideRect } from '../crop';

describe('guideRect', () => {
  it('is card-shaped and centred', () => {
    const view = { width: 390, height: 700 };
    const g = guideRect(view);
    expect(g.width / g.height).toBeCloseTo(CARD_RATIO);
    expect(g.x + g.width / 2).toBeCloseTo(195);
    expect(g.y + g.height / 2).toBeCloseTo(350);
    expect(g.width).toBeLessThanOrEqual(390 * 0.78);
  });
});

describe('cropForGuide', () => {
  it('maps the guide through an aspect-fill preview, with a margin', () => {
    // A 3:4 photo behind a taller 390 × 780 view: scaled to 780 high, so
    // 585 wide, with 97.5 points cut off each side.
    const photo = { width: 3000, height: 4000 };
    const view = { width: 390, height: 780 };
    const guide = { x: 95, y: 250, width: 200, height: 280 };
    const crop = cropForGuide(photo, view, guide, 0);
    const scale = 780 / 4000;
    expect(crop.x).toBe(Math.round((95 + 97.5) / scale));
    expect(crop.y).toBe(Math.round(250 / scale));
    expect(crop.width).toBe(Math.round(200 / scale));
    expect(crop.height).toBe(Math.round(280 / scale));
  });

  it('grows by the margin and stays inside the photo', () => {
    const photo = { width: 1000, height: 1000 };
    const view = { width: 100, height: 100 };
    const crop = cropForGuide(photo, view, { x: 0, y: 0, width: 100, height: 100 }, 0.1);
    expect(crop).toEqual({ x: 0, y: 0, width: 1000, height: 1000 });
  });
});

describe('downscaleTo', () => {
  it('shrinks the long edge to the target and leaves small images alone', () => {
    expect(downscaleTo({ width: 1500, height: 2100 })).toEqual({ width: 857, height: 1200 });
    expect(downscaleTo({ width: 800, height: 1100 })).toBeNull();
  });
});
