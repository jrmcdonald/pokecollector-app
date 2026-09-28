/** Which binders the Binders screen lists, and how it describes them. */
import { DECK_TYPES, type Binder } from '@/api/schemas';

/** Decks share upstream's binder endpoint; they are not binders here. */
export function bindersOnly(list: readonly Binder[]): Binder[] {
  return list.filter((b) => !(DECK_TYPES as readonly string[]).includes(b.binder_type ?? ''));
}

/**
 * A planned binder lists cards to collect, owned or not; a collection binder
 * holds exact owned copies. Upstream calls the planned kind "wishlist".
 */
export function isPlanned(binder: Pick<Binder, 'binder_type'>): boolean {
  return binder.binder_type === 'wishlist';
}

export function binderKind(binder: Pick<Binder, 'binder_type'>): string {
  return isPlanned(binder) ? 'Planned' : 'Collection';
}

/** A binder's own color, when it is a usable hex value. */
export function binderColor(binder: Pick<Binder, 'color'>, fallback: string): string {
  return binder.color && /^#[0-9a-f]{6}$/i.test(binder.color) ? binder.color : fallback;
}
