/**
 * Made-up data for the simulator tests: one account's collection, sets,
 * binders and wishlist, shaped like upstream 1.51.0's responses. Typed
 * against the app's own schemas, and parsed through them in
 * `__tests__/fixtures.test.ts`, so the fake server cannot drift from what
 * the app accepts.
 *
 * Images point back at the fake server, which draws a plain placeholder for
 * each card: the screenshots must not depend on TCGdex, or change when it
 * does.
 */
import type {
  Binder,
  BinderCard,
  BinderCards,
  Card,
  CardSet,
  Checklist,
  CollectionItem,
  Dashboard,
  Deck,
  DeckEntry,
  PricePoint,
  PrintingDetailTag,
  ScanItem,
  ScanJob,
  ScanMatch,
  SearchCard,
  User,
  WishlistItem,
} from '../../src/api/schemas';

export const USERNAME = 'ash';
export const PASSWORD = 'pikachu';

export const USER: User = { id: 1, username: USERNAME, role: 'user', avatar_id: 25 };

type SetInfo = { id: string; name: string; series: string; date: string; total: number };

// Twilight Masquerade and Obsidian Flames have nothing owned, for the
// Started filter to hide.
const SET_INFO: SetInfo[] = [
  {
    id: 'sv6',
    name: 'Twilight Masquerade',
    series: 'Scarlet & Violet',
    date: '2024-05-24',
    total: 167,
  },
  {
    id: 'sv5',
    name: 'Temporal Forces',
    series: 'Scarlet & Violet',
    date: '2024-03-22',
    total: 162,
  },
  { id: 'sv4', name: 'Paradox Rift', series: 'Scarlet & Violet', date: '2023-11-03', total: 182 },
  { id: 'sv3pt5', name: '151', series: 'Scarlet & Violet', date: '2023-09-22', total: 24 },
  {
    id: 'sv3',
    name: 'Obsidian Flames',
    series: 'Scarlet & Violet',
    date: '2023-08-11',
    total: 197,
  },
  { id: 'sv2', name: 'Paldea Evolved', series: 'Scarlet & Violet', date: '2023-06-09', total: 193 },
  {
    id: 'sv1',
    name: 'Scarlet & Violet',
    series: 'Scarlet & Violet',
    date: '2023-03-31',
    total: 198,
  },
  { id: 'swsh1', name: 'Sword & Shield', series: 'Sword & Shield', date: '2020-02-07', total: 202 },
];

const ABBREVIATIONS: Record<string, string> = {
  sv6: 'TWM',
  sv3: 'OBF',
  sv5: 'TEF',
  sv4: 'PAR',
  sv3pt5: 'MEW',
  sv2: 'PAL',
  sv1: 'SVI',
  swsh1: 'SSH',
};

type CardInfo = {
  set: string;
  number: string;
  name: string;
  rarity: string;
  /** Trend price in euros; 0 for a card with no price yet. */
  price: number;
  holo?: boolean;
  reverse?: boolean;
  /** No catalogue picture, as TCGdex has none for some promos. */
  noImage?: boolean;
};

/** The 151 subset is small on purpose, so its checklist is short and complete. */
const KANTO = [
  'Bulbasaur',
  'Ivysaur',
  'Venusaur ex',
  'Charmander',
  'Charmeleon',
  'Charizard ex',
  'Squirtle',
  'Wartortle',
  'Blastoise ex',
  'Caterpie',
  'Metapod',
  'Butterfree',
  'Weedle',
  'Kakuna',
  'Beedrill',
  'Pidgey',
  'Pidgeotto',
  'Pidgeot',
  'Rattata',
  'Raticate',
  'Spearow',
  'Fearow',
  'Ekans',
  'Arbok',
];

const CARD_INFO: CardInfo[] = [
  ...KANTO.map((name, i): CardInfo => ({
    set: 'sv3pt5',
    number: String(i + 1).padStart(3, '0'),
    name,
    rarity: name.endsWith(' ex') ? 'Double Rare' : i % 3 === 2 ? 'Uncommon' : 'Common',
    price: name.endsWith(' ex') ? 18.5 + i : 0.1 + (i % 5) * 0.05,
    reverse: true,
    holo: name.endsWith(' ex'),
  })),
  { set: 'sv1', number: '063', name: 'Pikachu', rarity: 'Common', price: 0.25, reverse: true },
  { set: 'sv1', number: '198', name: 'Miraidon ex', rarity: 'Hyper Rare', price: 64.9, holo: true },
  {
    set: 'sv2',
    number: '254',
    name: 'Pikachu with Grey Felt Hat',
    rarity: 'Promo',
    price: 0,
    noImage: true,
  },
  { set: 'sv2', number: '231', name: 'Iono', rarity: 'Special Illustration Rare', price: 71.2 },
  {
    set: 'sv4',
    number: '124',
    name: 'Roaring Moon ex',
    rarity: 'Double Rare',
    price: 4.1,
    holo: true,
  },
  { set: 'sv5', number: '120', name: 'Koraidon ex', rarity: 'Double Rare', price: 2.8, holo: true },
  { set: 'sv5', number: '051', name: 'Pikachu ex', rarity: 'Ultra Rare', price: 12.4, holo: true },
  { set: 'swsh1', number: '025', name: 'Pikachu', rarity: 'Common', price: 0.3, reverse: true },
];

const setRef = (id: string) => {
  const info = SET_INFO.find((s) => s.id === id);
  if (!info) throw new Error(`No set ${id}`);
  return { id, name: info.name, abbreviation: ABBREVIATIONS[id] ?? null, lang: 'en' };
};

const cardId = (c: CardInfo) => `${c.set}-${c.number}_en`;

export type SearchFilters = { setId?: string; rarity?: string; category?: string; type?: string };

/** Everything that depends on where the server is: the image URLs. */
export function buildFixtures(origin: string) {
  const image = (id: string, size: 'small' | 'large') =>
    `${origin}/images/cards/${encodeURIComponent(id)}/${size}.png`;

  const cards: Card[] = CARD_INFO.map((c) => ({
    id: cardId(c),
    name: c.name,
    set_id: c.set,
    number: c.number,
    rarity: c.rarity,
    supertype: 'Pokémon',
    artist: 'Placeholder Studio',
    images_small: c.noImage ? null : image(cardId(c), 'small'),
    images_large: c.noImage ? null : image(cardId(c), 'large'),
    set_ref: setRef(c.set),
    price_market: c.price || null,
    price_trend: c.price || null,
    price_low: c.price ? Math.round(c.price * 70) / 100 : null,
    price_avg30: c.price ? Math.round(c.price * 105) / 100 : null,
    price_trend_holo: c.reverse && c.price ? Math.round(c.price * 180) / 100 : null,
    variants_normal: !c.holo,
    variants_holo: !!c.holo,
    variants_reverse: !!c.reverse,
    variants_first_edition: false,
  }));

  const card = (id: string): Card => {
    const found = cards.find((c) => c.id === id);
    if (!found) throw new Error(`No card ${id}`);
    return found;
  };

  let nextItemId = 100;
  const item = (
    id: string,
    variant: string,
    quantity: number,
    condition = 'NM',
    addedDay = 1,
  ): CollectionItem => ({
    id: nextItemId++,
    card_id: id,
    quantity,
    condition,
    variant,
    lang: 'en',
    added_at: `2026-09-${String(addedDay).padStart(2, '0')}T10:00:00`,
    has_scan_photo: false,
    printing_details: [],
    card: card(id),
  });

  const collection: CollectionItem[] = [
    item('sv3pt5-006_en', 'Holo', 1, 'NM', 27),
    item('sv1-198_en', 'Holo', 1, 'Mint', 26),
    item('sv2-231_en', 'Normal', 1, 'NM', 25),
    item('sv1-063_en', 'Normal', 3, 'NM', 24),
    item('sv1-063_en', 'Reverse Holo', 1, 'LP', 24),
    item('sv2-254_en', 'Normal', 1, 'NM', 23),
    item('sv5-120_en', 'Holo', 2, 'NM', 22),
    item('sv5-051_en', 'Holo', 1, 'NM', 21),
    item('sv4-124_en', 'Holo', 1, 'MP', 20),
    // Two in three of the first sixteen, so the checklist has gaps.
    ...KANTO.slice(0, 16)
      .map((_, i) => i + 1)
      .filter((n) => n % 3 !== 2)
      .map((n) => item(`sv3pt5-${String(n).padStart(3, '0')}_en`, 'Normal', 1, 'NM', 10)),
    item('sv3pt5-009_en', 'Holo', 1, 'NM', 12),
    item('swsh1-025_en', 'Reverse Holo', 2, 'NM', 5),
  ];

  const value = (i: CollectionItem) => (i.card?.price_trend ?? 0) * i.quantity;
  const byNewest = [...collection].sort((a, b) =>
    (b.added_at ?? '').localeCompare(a.added_at ?? ''),
  );
  const byValue = [...collection].sort((a, b) => value(b) - value(a));
  const dashboardCard = (i: CollectionItem) => ({
    collection_item_id: i.id,
    card_id: i.card_id,
    name: i.card?.name ?? i.card_id,
    images_small: i.card?.images_small,
    images_large: i.card?.images_large,
    quantity: i.quantity,
    variant: i.variant,
    added_at: i.added_at,
    price_market: i.card?.price_trend ?? null,
    has_scan_photo: false,
  });

  const ownedIds = new Set(collection.map((i) => i.card_id));
  const ownedQuantity = (id: string) =>
    collection.filter((i) => i.card_id === id).reduce((sum, i) => sum + i.quantity, 0);

  const sets: CardSet[] = SET_INFO.map((s) => ({
    id: s.id,
    name: s.name,
    series: s.series,
    release_date: s.date,
    total: s.total,
    printed_total: s.total,
    abbreviation: ABBREVIATIONS[s.id] ?? null,
    lang: 'en',
    owned_count: new Set(collection.filter((i) => i.card?.set_id === s.id).map((i) => i.card_id))
      .size,
  }));

  const dashboard: Dashboard = {
    total_cards: collection.reduce((sum, i) => sum + i.quantity, 0),
    unique_cards: ownedIds.size,
    total_value: Math.round(collection.reduce((sum, i) => sum + value(i), 0) * 100) / 100,
    total_sets: sets.length,
    owned_sets: sets.filter((s) => (s.owned_count ?? 0) > 0).length,
    recent_additions: byNewest.slice(0, 8).map(dashboardCard),
    top_cards: byValue.slice(0, 8).map(dashboardCard),
    price_field: 'price_trend',
  };

  const withOwnership = (c: Card): SearchCard => ({
    ...c,
    owned: ownedIds.has(c.id),
    owned_quantity: ownedQuantity(c.id),
    wishlisted: wishlistIds.includes(c.id),
  });

  // One with no price, one wanted twice.
  const wishlistIds = ['sv3pt5-017_en', 'sv3pt5-008_en', 'sv2-254_en', 'sv3pt5-024_en'];
  const wishlist: WishlistItem[] = wishlistIds.map((id, i) => ({
    id: 500 + i,
    card_id: id,
    quantity: i === 1 ? 2 : 1,
    created_at: `2026-09-${String(10 + i).padStart(2, '0')}T09:00:00`,
    card: card(id),
  }));

  const checklist = (setId: string): Checklist | null => {
    const info = SET_INFO.find((s) => s.id === setId);
    if (!info) return null;
    const inSet = cards.filter((c) => c.set_id === setId).map(withOwnership);
    const owned = inSet.filter((c) => c.owned).length;
    return {
      set: { id: info.id, name: info.name, total: info.total },
      cards: inSet,
      owned_count: owned,
      // The 151 subset is the whole set here; the others list only the
      // cards these fixtures know about, against the printed total.
      total_count: setId === 'sv3pt5' ? inSet.length : info.total,
      progress: owned / (setId === 'sv3pt5' ? inSet.length : info.total),
    };
  };

  const binders: Binder[] = [
    {
      id: 1,
      name: '151 master set',
      description: 'Every card from 151, one of each.',
      color: '#E3350D',
      binder_type: 'wishlist',
      card_count: 24,
      unique_card_count: 24,
    },
    {
      id: 2,
      name: 'Trade binder',
      color: '#3B6CE0',
      binder_type: 'collection',
      card_count: 3,
      unique_card_count: 3,
    },
    // Decks share the endpoint; the app leaves them out of Binders.
    { id: 3, name: 'Lost Box', binder_type: 'deck', card_count: 60 },
    { id: 4, name: 'Pikachu ex Battle Deck', binder_type: 'physical_deck', card_count: 60 },
  ];

  const binderCard = (c: Card, n: number, extra: Partial<BinderCard> = {}): BinderCard => ({
    id: c.id,
    binder_card_id: 900 + n,
    name: c.name,
    set_id: c.set_id,
    set_name: c.set_ref?.name,
    number: c.number,
    rarity: c.rarity,
    images_small: c.images_small,
    images_large: c.images_large,
    price_market: c.price_trend,
    ...extra,
  });

  const binderCards = (id: number): BinderCards | null => {
    const binder = binders.find((b) => b.id === id);
    if (!binder) return null;
    if (binder.binder_type === 'wishlist') {
      const inSet = cards.filter((c) => c.set_id === 'sv3pt5');
      const list = inSet.map((c, n) =>
        binderCard(c, n, {
          owned: ownedIds.has(c.id),
          required_quantity: 1,
          owned_quantity: Math.min(1, ownedQuantity(c.id)),
          missing_quantity: ownedIds.has(c.id) ? 0 : 1,
        }),
      );
      const owned = list.filter((c) => c.owned).length;
      return {
        binder,
        cards: list,
        owned_count: owned,
        total_count: list.length,
        missing_count: list.length - owned,
        cost_to_complete:
          Math.round(
            list.filter((c) => !c.owned).reduce((sum, c) => sum + (c.price_market ?? 0), 0) * 100,
          ) / 100,
      };
    }
    const held = collection.filter((i) =>
      ['sv1-063_en', 'swsh1-025_en', 'sv5-120_en'].includes(i.card_id),
    );
    const list = held.slice(0, 3).map((i, n) =>
      binderCard(card(i.card_id), 50 + n, {
        owned: true,
        variant: i.variant,
        condition: i.condition,
        collection_item_id: i.id,
      }),
    );
    return {
      binder,
      cards: list,
      owned_count: list.length,
      total_count: list.length,
      current_value:
        Math.round(list.reduce((sum, c) => sum + (c.price_market ?? 0), 0) * 100) / 100,
    };
  };

  // A planned deck with some cards missing, and a Real Deck, whose copies are
  // all reserved. Short lists: the screens are the same for sixty cards.
  const deckEntry = (n: number, id: string, required: number): DeckEntry => {
    const owned = ownedQuantity(id);
    return {
      id: 700 + n,
      card_id: id,
      required_quantity: required,
      owned_quantity: owned,
      shortage: Math.max(required - owned, 0),
      card: card(id),
    };
  };
  const deckList: Deck[] = [
    {
      id: 3,
      name: 'Lost Box',
      binder_type: 'deck',
      format: 'Standard',
      target_size: 60,
      color: '#8A4FD8',
      entries: [
        deckEntry(1, 'sv4-124_en', 3),
        deckEntry(2, 'sv2-231_en', 4),
        deckEntry(3, 'sv1-063_en', 4),
        deckEntry(4, 'sv3pt5-004_en', 2),
        deckEntry(7, 'sv3pt5-006_en', 2),
      ],
    },
    {
      id: 4,
      name: 'Pikachu ex Battle Deck',
      binder_type: 'physical_deck',
      format: 'Casual',
      target_size: 60,
      color: '#F2C522',
      entries: [
        deckEntry(5, 'sv5-051_en', 1),
        deckEntry(6, 'sv1-063_en', 2),
        deckEntry(8, 'sv3pt5-006_en', 1),
      ],
    },
  ].map((deck) => {
    const entries = deck.entries;
    const real = deck.binder_type === 'physical_deck';
    return {
      ...deck,
      updated_at: `2026-09-${String(20 + deck.id).padStart(2, '0')}T10:00:00`,
      entries: real ? entries.map((e) => ({ ...e, shortage: 0 })) : entries,
      current_card_count: entries.reduce((sum, e) => sum + e.required_quantity, 0),
      missing_copy_count: real ? 0 : entries.reduce((sum, e) => sum + (e.shortage ?? 0), 0),
    };
  });
  // The list leaves out each deck's cards, as upstream's does.
  const decks = deckList.map(({ entries: _entries, ...deck }) => deck);
  const deck = (id: number): Deck | null => deckList.find((d) => d.id === id) ?? null;

  // A year and a bit of daily prices for every priced card, ending on a
  // fixed day so the screenshots never change with the date: a climb to
  // today's price with a gentle wobble, and a few days the sync missed.
  const priceHistory = (id: string): PricePoint[] | null => {
    const found = cards.find((c) => c.id === id);
    if (!found) return null;
    const today = found.price_trend ?? 0;
    if (!today) return [];
    const days = 400;
    const end = Date.UTC(2026, 8, 30);
    const points: PricePoint[] = [];
    for (let i = 0; i < days; i++) {
      if (i % 37 === 5) continue;
      const progress = i / (days - 1);
      const wobble = i === days - 1 ? 0 : Math.sin(i / 9) * 0.04 + Math.sin(i / 41) * 0.06;
      const price = Math.round(today * (0.7 + 0.3 * progress + wobble) * 100) / 100;
      points.push({
        id: i + 1,
        card_id: id,
        date: new Date(end - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10),
        price_trend: price,
        price_market: price,
        price_low: Math.round(price * 70) / 100,
      });
    }
    return points;
  };

  const printingDetailTags: PrintingDetailTag[] = [
    { id: 1, name: 'Stamped', usage_count: 2 },
    { id: 2, name: 'Staff', usage_count: 0 },
  ];

  // Upstream's filters are each a substring, without regard to case or
  // accents: "Rare" finds "Double Rare" too, as it does there.
  const fold = (text: string | null | undefined) =>
    (text ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const search = (query: string, page: number, pageSize: number, filters: SearchFilters = {}) => {
    const q = fold(query.trim());
    const has = (value: string | null | undefined, wanted: string | undefined) =>
      !wanted || fold(value).includes(fold(wanted));
    const hits = cards.filter(
      (c) =>
        fold(c.name).includes(q) &&
        (!filters.setId || c.set_id === filters.setId || c.set_ref?.id === filters.setId) &&
        has(c.rarity, filters.rarity) &&
        has(c.supertype, filters.category) &&
        has(JSON.stringify(c.types ?? []), filters.type),
    );
    return {
      data: hits.slice((page - 1) * pageSize, page * pageSize).map(withOwnership),
      total_count: hits.length,
      page,
      page_size: pageSize,
    };
  };

  // One batch sent earlier and read to the end, so the review is still: three
  // photos ready, one with no match, one the scanner gave up on, and one
  // already added. The phone has none of the photos (the simulator never
  // took them), so the review shows numbered placeholders.
  const scanMatch = (id: string): ScanMatch => {
    const c = card(id);
    return {
      id: c.id,
      tcg_card_id: c.id.replace(/_en$/, ''),
      name: c.name,
      number: c.number,
      rarity: c.rarity,
      set_abbreviation: c.set_ref?.abbreviation?.toLowerCase() ?? null,
      image: c.images_small,
      image_hd: c.images_large,
      lang: 'en',
    };
  };
  const scanItem = (position: number, extra: Partial<ScanItem>): ScanItem => ({
    id: 500 + position,
    position,
    status: 'done',
    resolved: false,
    error: null,
    recognized: null,
    matches: [],
    has_image: false,
    next_attempt_at: null,
    retry_reason: null,
    ...extra,
  });
  const scanItems: ScanItem[] = [
    scanItem(0, {
      recognized: { name: 'Pikachu', set_code: 'SVI', number_local: '063', language: 'en' },
      matches: [scanMatch('sv1-063_en'), scanMatch('swsh1-025_en')],
    }),
    scanItem(1, {
      recognized: { name: 'Charizard ex', set_code: 'MEW', number_local: '006', language: 'en' },
      matches: [scanMatch('sv3pt5-006_en')],
    }),
    scanItem(2, {
      recognized: { name: 'Iono', set_code: 'PAL', number_local: '231', language: 'en' },
      matches: [scanMatch('sv2-231_en')],
    }),
    scanItem(3, {
      recognized: { name: 'Snorlax', set_code: 'MEW', number_local: '143', language: 'en' },
    }),
    scanItem(4, {
      status: 'failed',
      error: 'The scanner could not find a card in this photo.',
    }),
    scanItem(5, {
      resolved: true,
      recognized: { name: 'Bulbasaur', set_code: 'MEW', number_local: '001', language: 'en' },
      matches: [scanMatch('sv3pt5-001_en')],
    }),
  ];
  const scanJobSummary: ScanJob = {
    id: 12,
    status: 'done',
    total: scanItems.length,
    processed: scanItems.length,
    active: 0,
    retrying: 0,
    attention: scanItems.filter((i) => !i.resolved).length,
    next_retry_at: null,
    created_at: '2026-09-28T13:05:00',
    expires_at: '2026-10-12T13:05:00',
  };
  const scanJob = (id: number): ScanJob | null =>
    id === scanJobSummary.id ? { ...scanJobSummary, items: scanItems } : null;

  return {
    cards,
    card: (id: string) => cards.find((c) => c.id === id) ?? null,
    collection,
    dashboard,
    sets,
    checklist,
    binders,
    binderCards,
    decks,
    deck,
    priceHistory,
    wishlist,
    printingDetailTags,
    search,
    scanJobs: [scanJobSummary],
    scanJob,
  };
}

export type Fixtures = ReturnType<typeof buildFixtures>;
