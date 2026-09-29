import { deckCsv, failedRows, lineCode, parseDecklist } from '../decklist';

const EXPORT = `Pokémon: 7
4 Pikachu ex SVI 57
3 Pikachu ex SVI 57

Trainer: 6
4 Professor's Research PR-SV 122
2 Nest Ball

Energy: 13
8 Basic {L} Energy SVE 4
3 Lightning Energy
2 Basic {R} Energy Energy 2

Total Cards: 26`;

describe('parseDecklist', () => {
  const deck = parseDecklist(EXPORT);

  it('reads card lines, skipping headings, blanks and the total', () => {
    expect(deck.unreadable).toEqual([]);
    expect(deck.total).toBe(26);
  });

  it('merges repeats of the same printing', () => {
    expect(deck.cards[0]).toEqual({
      quantity: 7,
      name: 'Pikachu ex',
      setCode: 'SVI',
      number: '57',
      line: 2,
    });
  });

  it("maps Pokémon TCG Live's promo codes to upstream's", () => {
    expect(deck.cards[1]).toMatchObject({ setCode: 'SVP', number: '122' });
  });

  it('keeps a line with no set, to be searched for', () => {
    expect(deck.cards[2]).toMatchObject({ quantity: 2, name: 'Nest Ball', setCode: null });
  });

  it('places basic Energy in SVE, however it is written', () => {
    expect(deck.cards.slice(3).map(lineCode)).toEqual(['SVE 4', 'SVE 2']);
    expect(deck.cards[3]?.quantity).toBe(11);
  });

  it('accepts the bracketed and "x" forms', () => {
    expect(parseDecklist('4x Iono (PAL 185)').cards[0]).toMatchObject({
      quantity: 4,
      name: 'Iono',
      setCode: 'PAL',
      number: '185',
    });
    expect(parseDecklist('* 1 Arceus VSTAR BRS 123').cards[0]).toMatchObject({
      setCode: 'BRS',
      number: '123',
    });
  });

  it('keeps gallery numbers', () => {
    expect(parseDecklist('1 Pikachu VMAX CRZ GG30').cards[0]).toMatchObject({
      setCode: 'CRZ',
      number: 'GG30',
    });
  });

  it('reports lines it cannot read, with their line numbers', () => {
    const parsed = parseDecklist('My deck\n4 Pikachu ex SVI 57\n0 Iono PAL 185');
    expect(parsed.unreadable).toEqual([
      { line: 1, text: 'My deck' },
      { line: 3, text: '0 Iono PAL 185' },
    ]);
    expect(parsed.total).toBe(4);
  });
});

describe('deckCsv', () => {
  it('writes the rows with a set and number, under the header upstream expects', () => {
    const { csv, rows } = deckCsv(parseDecklist(EXPORT).cards, 'en');
    expect(csv.split('\n')).toEqual([
      'set_code,number,required_quantity,lang',
      'SVI,57,7,en',
      'SVP,122,4,en',
      'SVE,4,11,en',
      'SVE,2,2,en',
      '',
    ]);
    expect(rows.map((row) => row.name)).toEqual([
      'Pikachu ex',
      "Professor's Research",
      'Basic {L} Energy',
      'Basic {R} Energy',
    ]);
  });

  it('caps a row at the 99 copies upstream allows', () => {
    expect(deckCsv(parseDecklist('120 Basic {L} Energy SVE 4').cards, 'en').csv).toContain(
      'SVE,4,99,en',
    );
  });
});

describe('failedRows', () => {
  it("turns upstream's row numbers into indexes of the rows sent", () => {
    expect(
      failedRows(['row 2: card was not found', 'row 5: card was not found', 'something else']),
    ).toEqual(new Set([0, 3]));
  });
});
