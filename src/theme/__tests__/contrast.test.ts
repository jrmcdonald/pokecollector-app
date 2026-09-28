import { AA, contrastRatio } from '../contrast';
import { palette as colors, type Colors } from '../index';

type Role = keyof Colors;

/**
 * Every foreground the app puts on every background it can sit on, with the
 * WCAG AA level it has to meet. A new colour, or a colour used somewhere
 * new, belongs in this list.
 */
const PAIRS: [fg: Role, bg: Role[], minimum: number, what: string][] = [
  ['text', ['background', 'surface', 'surfaceRaised', 'surfaceSelected'], AA.text, 'body text'],
  [
    'textSecondary',
    ['background', 'surface', 'surfaceRaised', 'surfaceSelected'],
    AA.text,
    'secondary text and captions',
  ],
  ['accent', ['background', 'surface', 'surfaceRaised'], AA.text, 'prices and links in the accent'],
  ['onAccent', ['accent'], AA.text, 'text on accent buttons and chips'],
  ['onAccent', ['danger'], AA.text, 'text on destructive buttons'],
  ['danger', ['background', 'surface', 'surfaceRaised'], AA.text, 'error text'],
  ['holo', ['background', 'surface', 'surfaceRaised'], AA.nonText, 'the holo edge and focus rings'],
  [
    'outline',
    ['background', 'surface', 'surfaceRaised'],
    AA.nonText,
    'field, chip and secondary button edges',
  ],
  ['accent', ['surfaceRaised'], AA.nonText, 'progress bar fill on its track'],
  ['success', ['surfaceRaised'], AA.nonText, 'the success stripe on a notice'],
  ['danger', ['surfaceRaised'], AA.nonText, 'the error stripe on a notice'],
];

describe('theme contrast (WCAG 2.2 AA)', () => {
  const cases = PAIRS.flatMap(([fg, bgs, minimum, what]) =>
    bgs.map((bg) => [fg, bg, minimum, what] as const),
  );

  it.each(cases)('%s on %s is at least %s:1 (%s)', (fg, bg, minimum) => {
    expect(contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(minimum);
  });
});

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1);
  });

  it('refuses anything but #RRGGBB', () => {
    expect(() => contrastRatio('red', '#000000')).toThrow();
  });
});
