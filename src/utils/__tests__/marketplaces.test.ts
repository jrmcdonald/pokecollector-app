import type { Card } from '@/api/schemas';

import { cardmarketUrl, ebayUrl, listingQuery, marketplaces, tcgplayerUrl } from '../marketplaces';

const PIKACHU: Card = {
  id: 'sv01-057_en',
  name: 'Pikachu ex',
  number: '057',
  set_ref: { id: 'sv01_en', name: 'Scarlet & Violet', abbreviation: 'SVI', printed_total: 198 },
};

describe('listingQuery', () => {
  it('is the name and the number as printed', () => {
    expect(listingQuery(PIKACHU)).toBe('Pikachu ex 057/198');
  });

  it('names the set when the number has no set size', () => {
    expect(
      listingQuery({
        name: 'Pikachu',
        number: 'TG05',
        set_ref: { id: 'swsh11tg_en', name: 'Lost Origin Trainer Gallery', printed_total: 30 },
      }),
    ).toBe('Pikachu Lost Origin Trainer Gallery TG05');
    expect(listingQuery({ name: 'Pikachu', number: '1' })).toBe('Pikachu 1');
  });
});

describe('ebayUrl', () => {
  it("searches the region's own eBay", () => {
    expect(ebayUrl(PIKACHU, 'GB')).toBe(
      'https://www.ebay.co.uk/sch/i.html?_nkw=Pokemon%20Pikachu%20ex%20057%2F198',
    );
    expect(ebayUrl(PIKACHU, 'de')).toMatch(/^https:\/\/www\.ebay\.de\//);
  });

  it('falls back to ebay.com', () => {
    expect(ebayUrl(PIKACHU, 'JP')).toMatch(/^https:\/\/www\.ebay\.com\/sch/);
    expect(ebayUrl(PIKACHU, null)).toMatch(/^https:\/\/www\.ebay\.com\/sch/);
  });
});

describe('cardmarketUrl', () => {
  it("opens the card's own product when TCGdex knows it", () => {
    expect(
      cardmarketUrl({
        ...PIKACHU,
        cardmarket_products: [
          { variant: 'normal', foil: 'cosmos', product_id: 111 },
          { variant: 'normal', foil: null, product_id: 222 },
        ],
      }),
    ).toBe('https://www.cardmarket.com/en/Pokemon/Products?idProduct=222');
  });

  it('takes a special print when it is the only one, and skips rows it cannot read', () => {
    expect(
      cardmarketUrl({
        ...PIKACHU,
        cardmarket_products: [
          null,
          'x',
          { product_id: 'nope' },
          { variant: 'first edition', product_id: 7 },
        ],
      }),
    ).toBe('https://www.cardmarket.com/en/Pokemon/Products?idProduct=7');
  });

  it('searches by name, set code and number otherwise', () => {
    expect(cardmarketUrl(PIKACHU)).toBe(
      'https://www.cardmarket.com/en/Pokemon/Products/Singles?searchMode=v2&idCategory=51&searchString=Pikachu%20ex%20SVI%20057',
    );
  });
});

describe('marketplaces', () => {
  it('lists eBay, Cardmarket and TCGplayer', () => {
    expect(marketplaces(PIKACHU, 'GB')).toEqual([
      { label: 'Find on eBay', url: ebayUrl(PIKACHU, 'GB') },
      { label: 'Find on Cardmarket', url: cardmarketUrl(PIKACHU) },
      { label: 'Find on TCGplayer', url: tcgplayerUrl(PIKACHU) },
    ]);
    expect(tcgplayerUrl(PIKACHU)).toBe(
      'https://www.tcgplayer.com/search/pokemon/product?productLineName=pokemon&q=Pikachu%20ex%20057%2F198',
    );
  });
});
