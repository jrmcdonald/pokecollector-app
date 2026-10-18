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

/** The colours the web UI offers for a binder, by name for the action sheet. */
export const BINDER_COLORS: readonly { name: string; value: string }[] = [
  { name: 'Red', value: '#EF1515' },
  { name: 'Blue', value: '#3B82F6' },
  { name: 'Green', value: '#22C55E' },
  { name: 'Yellow', value: '#EAB308' },
  { name: 'Purple', value: '#8B5CF6' },
  { name: 'Pink', value: '#EC4899' },
  { name: 'Cyan', value: '#06B6D4' },
  { name: 'Lime', value: '#84CC16' },
];

/** The name of a binder's colour, when it is one of `BINDER_COLORS`. */
export function binderColorName(binder: Pick<Binder, 'color'>): string | null {
  const color = binder.color?.toLowerCase();
  return BINDER_COLORS.find((c) => c.value.toLowerCase() === color)?.name ?? null;
}
