/**
 * Adding a prebuilt deck from a pasted list, in a handful of requests.
 *
 * A planned deck is the preview: upstream fills it from a CSV of set codes
 * and numbers, finding every card itself, and answers with each card, its
 * picture and what is already owned. Nothing touches the collection until
 * the user confirms; cancelling deletes the deck. Confirming is one bulk add
 * of every copy and one conversion to a Real Deck, which reserves them.
 *
 * Importing is create, import (twice when a row fails, since upstream then
 * writes nothing), and fetch: three or four requests for a 60-card deck,
 * against one per card otherwise.
 */
import type { PokeCollectorClient } from './client';
import {
  bulkAddToCollection,
  convertDeckToReal,
  createDeck,
  deleteDeck,
  getDeck,
  getDecks,
  importDeckCsv,
} from './endpoints';
import { ConflictError } from './errors';
import type { BulkAddResult, Deck, DeckEntry } from './schemas';
import { deckCsv, failedRows, type DeckLine } from '@/utils/decklist';
import { defaultVariant } from '@/utils/variants';

export interface DeckImport {
  deck: Deck;
  /** Lines upstream could not find, or that had no set: for the user to find or leave out. */
  unresolved: DeckLine[];
}

/**
 * Creates a planned deck named `name` and fills it with every line upstream
 * can find. `toFile` turns the CSV into something FormData can send, named
 * `*.csv`. If anything fails after the deck is created, the deck is deleted.
 */
export async function importDecklist(
  client: PokeCollectorClient,
  {
    name,
    cards,
    lang,
    toFile,
  }: { name: string; cards: readonly DeckLine[]; lang: string; toFile(csv: string): Blob },
): Promise<DeckImport> {
  const created = await createDeck(client, { name });
  try {
    const unresolved = cards.filter((card) => !card.setCode || !card.number);
    let { csv, rows } = deckCsv(cards, lang);
    if (rows.length > 0) {
      const first = await importDeckCsv(client, created.id, toFile(csv));
      if (first.failed > 0) {
        const failed = failedRows(first.errors ?? []);
        unresolved.push(...rows.filter((_, index) => failed.has(index)));
        ({ csv, rows } = deckCsv(
          rows.filter((_, index) => !failed.has(index)),
          lang,
        ));
        if (rows.length > 0) {
          const second = await importDeckCsv(client, created.id, toFile(csv));
          if (second.failed > 0) throw new Error(second.errors?.[0] ?? 'The import failed');
        }
      }
    }
    unresolved.sort((a, b) => a.line - b.line);
    return { deck: await getDeck(client, created.id), unresolved };
  } catch (error) {
    await deleteDeck(client, created.id).catch(() => undefined);
    throw error;
  }
}

/** The language a catalogue card id carries: `sv01-057_en` is English. */
export function langOf(cardId: string): string {
  return /_([a-z]{2}(?:-[a-z]{2})?)$/i.exec(cardId)?.[1] ?? 'en';
}

/** Every copy a deck lists, as collection adds: each card's usual variant, Near Mint. */
export function collectionAdds(entries: readonly DeckEntry[]) {
  return entries.map((entry) => ({
    card_id: entry.card_id,
    quantity: entry.required_quantity,
    variant: entry.card ? defaultVariant(entry.card) : ('Normal' as const),
    condition: 'NM' as const,
    lang: langOf(entry.card_id),
  }));
}

export interface DeckAdded {
  added: BulkAddResult;
  /** False when upstream would not reserve the copies; the deck stays planned. */
  real: boolean;
  deck: Deck;
}

/**
 * Adds every copy of a planned deck to the collection, then makes it a Real
 * Deck of those copies. A refused conversion is not an error: the cards are
 * in, and the deck can be converted in the web UI once the clash is sorted.
 */
export async function addDeckToCollection(
  client: PokeCollectorClient,
  deck: Deck,
): Promise<DeckAdded> {
  const added = await bulkAddToCollection(client, collectionAdds(deck.entries ?? []));
  try {
    return { added, real: true, deck: await convertDeckToReal(client, deck.id) };
  } catch (error) {
    if (error instanceof ConflictError) return { added, real: false, deck };
    throw error;
  }
}

/** One deck's cards, by card id: how many copies the deck lists. */
export interface DeckContents {
  id: number;
  name: string;
  binder_type?: string | null;
  color?: string | null;
  updated_at?: string | null;
  cards: Record<string, number>;
}

/**
 * Every deck's cards, for "which decks is this card in?". Upstream has no
 * such lookup, and its deck list leaves the cards out, so this reads each
 * deck. A deck read before, whose `updated_at` has not changed, is taken
 * from `previous`: upstream moves `updated_at` on every edit of a deck's
 * cards, so after the first time this is one request plus one per deck
 * edited since. Decks are read one at a time, to keep within the rate limit.
 * `onDeck` gets each deck read, so its own page need not read it again.
 */
export async function deckContents(
  client: PokeCollectorClient,
  previous: readonly DeckContents[] = [],
  onDeck?: (deck: Deck) => void,
): Promise<DeckContents[]> {
  const known = new Map(previous.map((deck) => [deck.id, deck]));
  const result: DeckContents[] = [];
  for (const summary of await getDecks(client)) {
    const before = known.get(summary.id);
    if (before && summary.updated_at && before.updated_at === summary.updated_at) {
      result.push({
        ...before,
        name: summary.name,
        binder_type: summary.binder_type,
        color: summary.color,
      });
      continue;
    }
    const deck = await getDeck(client, summary.id);
    onDeck?.(deck);
    const cards: Record<string, number> = {};
    for (const entry of deck.entries ?? []) {
      cards[entry.card_id] = (cards[entry.card_id] ?? 0) + entry.required_quantity;
    }
    result.push({
      id: deck.id,
      name: deck.name,
      binder_type: deck.binder_type,
      color: deck.color,
      // The list's, as that is what the next read compares against.
      updated_at: summary.updated_at ?? deck.updated_at,
      cards,
    });
  }
  return result;
}

/** The decks that list the card, with how many copies each does. */
export function decksWithCard(
  decks: readonly DeckContents[],
  cardId: string,
): (DeckContents & { copies: number })[] {
  return decks.flatMap((deck) => {
    const copies = deck.cards[cardId] ?? 0;
    return copies > 0 ? [{ ...deck, copies }] : [];
  });
}
