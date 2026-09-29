/**
 * Deck lists as people paste them: the text Pokémon TCG Live exports, which
 * Limitless and most deck sites also offer.
 *
 *     Pokémon: 12
 *     4 Pikachu ex SVI 57
 *     2 Professor's Research PR-SV 122
 *     Energy: 1
 *     8 Basic {L} Energy SVE 4
 *     Total Cards: 60
 *
 * Each card line is a count, the card's name, then its set code and collector
 * number. Upstream finds a card by exactly that (the set's official
 * abbreviation and the number), so the phone never has to search for one.
 */

export interface DeckLine {
  quantity: number;
  name: string;
  /** The code upstream knows the set by, after aliases; null if the line had none. */
  setCode: string | null;
  number: string | null;
  /** 1-based line in the pasted text, for pointing at it. */
  line: number;
}

export interface ParsedDeck {
  /** Card lines, with repeats of the same printing merged. */
  cards: DeckLine[];
  /** Lines that are neither cards nor section headings. */
  unreadable: { line: number; text: string }[];
  /** Copies across every card line. */
  total: number;
}

/**
 * Where Pokémon TCG Live's set codes differ from the abbreviations upstream
 * stores (TCGdex's). Promos are the usual difference; upstream also matches a
 * set's TCGdex id, which is how the ones with no abbreviation are named.
 */
const SET_ALIASES: Record<string, string> = {
  'PR-SV': 'SVP',
  'PR-SW': 'SWSHP',
  'PR-SM': 'SMP',
  'PR-XY': 'XYP',
  'PR-BLW': 'BWP',
  'PR-HS': 'HGSSP',
  'PR-DPP': 'DPP',
  'PR-NP': 'NP',
  'PR-ME': 'MEP',
  // Older exports put basic Energy in a pseudo-set called "Energy", numbered
  // as the Scarlet & Violet Energy set is.
  ENERGY: 'SVE',
};

/** Basic Energy by type, numbered as in the Scarlet & Violet Energy set (SVE). */
const BASIC_ENERGY: Record<string, string> = {
  G: '1',
  GRASS: '1',
  R: '2',
  FIRE: '2',
  W: '3',
  WATER: '3',
  L: '4',
  LIGHTNING: '4',
  P: '5',
  PSYCHIC: '5',
  F: '6',
  FIGHTING: '6',
  D: '7',
  DARKNESS: '7',
  M: '8',
  METAL: '8',
};

const HEADING = /^(pok[eé]mon|trainers?|energy)\b\s*[:-]?\s*\(?\d*\)?\s*$/i;
const TOTAL = /^total\s+cards\b/i;
// "4 Pikachu ex SVI 57", "4x Pikachu ex (SVI 57)", "* 4 Pikachu ex SVI 57".
const CARD =
  /^(?:[*•-]\s*)?(\d{1,3})\s*x?\s+(.+?)\s+\(?([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*|Energy)\s+([A-Za-z]*\d[A-Za-z0-9]*)\)?$/;
// A count and a name alone: "4 Nest Ball". Resolved by searching.
const NAME_ONLY = /^(?:[*•-]\s*)?(\d{1,3})\s*x?\s+(.+)$/;
const BASIC_ENERGY_NAME = /^(?:basic\s+)?(?:\{([A-Z])\}|([a-z]+))\s+energy$/i;

export function parseDecklist(text: string): ParsedDeck {
  const cards: DeckLine[] = [];
  const unreadable: ParsedDeck['unreadable'] = [];
  const byPrinting = new Map<string, DeckLine>();

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (!trimmed || HEADING.test(trimmed) || TOTAL.test(trimmed)) return;

    const parsed = parseCardLine(trimmed, line);
    if (!parsed) {
      unreadable.push({ line, text: trimmed });
      return;
    }
    if (parsed.setCode && parsed.number) {
      const key = `${parsed.setCode} ${parsed.number}`;
      const earlier = byPrinting.get(key);
      if (earlier) {
        earlier.quantity += parsed.quantity;
        return;
      }
      byPrinting.set(key, parsed);
    }
    cards.push(parsed);
  });

  return { cards, unreadable, total: cards.reduce((sum, card) => sum + card.quantity, 0) };
}

function parseCardLine(text: string, line: number): DeckLine | null {
  const full = CARD.exec(text);
  if (full) {
    const [, count, name = '', rawCode = '', number = ''] = full;
    const code = rawCode.toUpperCase();
    const quantity = Number(count);
    if (quantity < 1) return null;
    return {
      quantity,
      name: name.trim(),
      setCode: SET_ALIASES[code] ?? code,
      number,
      line,
    };
  }
  const bare = NAME_ONLY.exec(text);
  if (!bare) return null;
  const quantity = Number(bare[1]);
  if (quantity < 1) return null;
  const name = (bare[2] ?? '').trim();
  const energy = basicEnergyNumber(name);
  return energy
    ? { quantity, name, setCode: 'SVE', number: energy, line }
    : { quantity, name, setCode: null, number: null, line };
}

/** "Basic {L} Energy", "Lightning Energy": its number in SVE, or null. */
function basicEnergyNumber(name: string): string | null {
  const match = BASIC_ENERGY_NAME.exec(name);
  if (!match) return null;
  return BASIC_ENERGY[(match[1] ?? match[2] ?? '').toUpperCase()] ?? null;
}

/** "SVI 57", or the name alone when the line had no set. */
export function lineCode(card: Pick<DeckLine, 'setCode' | 'number'>): string | null {
  return card.setCode && card.number ? `${card.setCode} ${card.number}` : null;
}

/**
 * The CSV upstream's binder import takes (`set_code,number,required_quantity,lang`),
 * one row per card line that has a set and number, in order. Row n of the
 * data is `rows[n - 2]`: upstream counts the header as row 1.
 */
export function deckCsv(
  cards: readonly DeckLine[],
  lang: string,
): { csv: string; rows: DeckLine[] } {
  const rows = cards.filter((card) => card.setCode && card.number);
  const lines = rows.map((card) =>
    [card.setCode, card.number, Math.min(card.quantity, 99), lang].map(csvField).join(','),
  );
  return { csv: ['set_code,number,required_quantity,lang', ...lines].join('\n') + '\n', rows };
}

function csvField(value: string | number | null): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The data rows upstream's import rejected, from its `errors`
 * ("row 3: card was not found"), as indexes into the rows sent.
 */
export function failedRows(errors: readonly string[]): Set<number> {
  const failed = new Set<number>();
  for (const error of errors) {
    const match = /^row (\d+):/.exec(error);
    if (match) failed.add(Number(match[1]) - 2);
  }
  return failed;
}
