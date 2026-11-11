import { LEVEL, holoStyleFor, nextTilt, rarityStyle, type TiltState } from '../holo';

const card = (rarity: string | null, flags: { normal?: boolean; holo?: boolean } = {}) => ({
  rarity,
  variants_normal: flags.normal ?? true,
  variants_holo: flags.holo ?? false,
  variants_reverse: true,
  variants_first_edition: false,
});

describe('holoStyleFor', () => {
  it('gives a Normal or First Edition copy nothing', () => {
    expect(holoStyleFor(card('Ultra Rare'), ['Normal'])).toBeNull();
    expect(holoStyleFor(card('Rare Holo'), ['First Edition'])).toBeNull();
    expect(holoStyleFor(card('Common'), [null])).toBeNull();
  });

  it('gives a reverse holo copy the reverse look, whatever the rarity', () => {
    expect(holoStyleFor(card('Common'), ['Reverse Holo'])).toBe('reverse');
    expect(holoStyleFor(card('Hyper rare'), ['Reverse Holo'])).toBe('reverse');
  });

  it('prefers reverse holo when both are owned, as upstream does', () => {
    expect(holoStyleFor(card('Rare Holo'), ['Holo', 'Reverse Holo', 'Normal'])).toBe('reverse');
  });

  it('picks a holo copy’s look from its rarity', () => {
    expect(holoStyleFor(card('Rare Holo'), ['Holo'])).toBe('holo');
    expect(holoStyleFor(card('Holo Rare VSTAR'), ['Holo'])).toBe('sparkle');
    expect(holoStyleFor(card('Special illustration rare'), ['Holo'])).toBe('rainbow');
    expect(holoStyleFor(card('Hyper rare'), ['Holo'])).toBe('gold');
  });

  it('uses the catalogue’s first printing for a card not owned', () => {
    expect(holoStyleFor(card('Double rare', { normal: false, holo: true }), [])).toBe('sparkle');
    expect(holoStyleFor(card('Common'), [])).toBeNull();
  });
});

describe('rarityStyle', () => {
  it.each([
    ['Rare Holo', 'holo'],
    ['Rare', 'holo'],
    [null, 'holo'],
    ['Something new', 'holo'],
    ['Holo Rare V', 'sparkle'],
    ['Holo Rare VMAX', 'sparkle'],
    ['Double rare', 'sparkle'],
    ['Ultra Rare', 'sparkle'],
    ['Illustration rare', 'sparkle'],
    ['Radiant Rare', 'sparkle'],
    ['Shiny rare', 'sparkle'],
    ['ACE SPEC Rare', 'sparkle'],
    ['Rare Holo GX', 'sparkle'],
    ['Secret Rare', 'rainbow'],
    ['Amazing Rare', 'rainbow'],
    ['Rare Rainbow', 'rainbow'],
    ['Special illustration rare', 'rainbow'],
    ['Hyper rare', 'gold'],
    ['Mega Hyper Rare', 'gold'],
  ] as const)('%s → %s', (rarity, look) => {
    expect(rarityStyle(rarity)).toBe(look);
  });

  it('does not mistake words that contain a short code for it', () => {
    // "Uncommon" contains no "ex" word; "Prism Star" no "v".
    expect(rarityStyle('Uncommon')).toBe('holo');
    expect(rarityStyle('Rare Holo LV.X')).toBe('holo');
  });
});

describe('nextTilt', () => {
  const settle = (state: TiltState, gx: number, gy: number, readings: number) => {
    let s = state;
    for (let i = 0; i < readings; i++) s = nextTilt(s, gx, gy);
    return s;
  };

  it('takes the first reading as level', () => {
    const s = nextTilt(LEVEL, 3, -8);
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
  });

  it('follows a tilt, within -1 to 1', () => {
    const level = nextTilt(LEVEL, 0, -9.81);
    const tilted = settle(level, 2.5, -9.81, 10);
    expect(tilted.x).toBeGreaterThan(0.5);
    expect(tilted.x).toBeLessThanOrEqual(1);
    expect(Math.abs(tilted.y)).toBeLessThan(0.05);
    const far = settle(level, -9.81, -9.81, 20);
    expect(far.x).toBeGreaterThanOrEqual(-1);
    expect(far.x).toBeLessThan(-0.9);
  });

  it('drifts back to level while the phone is held still at an angle', () => {
    const level = nextTilt(LEVEL, 0, -9.81);
    const tilted = settle(level, 2.5, -9.81, 10);
    const later = settle(tilted, 2.5, -9.81, 600);
    expect(Math.abs(later.x)).toBeLessThan(0.05);
  });
});
