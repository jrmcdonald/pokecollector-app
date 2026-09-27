/**
 * The letter shown in an account's avatar: the first character of its name,
 * upper-cased. Iterates by code point so an emoji or accented letter is not
 * cut in half.
 */
export function initialOf(name: string | null | undefined): string {
  const first = Array.from((name ?? '').trim())[0];
  return first ? first.toLocaleUpperCase() : '?';
}
