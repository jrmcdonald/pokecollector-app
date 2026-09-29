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
