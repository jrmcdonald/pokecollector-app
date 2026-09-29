/** What the batch review says about each photo and about the batch. */
import { itemState, type BatchChoice, type BatchPick, type BatchProgress } from '@/api/batch';
import type { ScanItem } from '@/api/schemas';

/** A picked card's name, code and images, whichever way it was picked. */
export function pickCard(pick: BatchPick): {
  id: string;
  name: string;
  code: string;
  images_small: string | null;
  images_large: string | null;
} {
  if (pick.kind === 'candidate') {
    const { match } = pick;
    return {
      id: match.id,
      name: match.name,
      code: [match.set_abbreviation?.toUpperCase(), match.number].filter(Boolean).join(' '),
      images_small: match.image ?? null,
      images_large: match.image_hd ?? null,
    };
  }
  const { card } = pick;
  return {
    id: card.id,
    name: card.name,
    code: [card.set_ref?.abbreviation ?? card.set_id?.toUpperCase(), card.number]
      .filter(Boolean)
      .join(' '),
    images_small: card.images_small ?? null,
    images_large: card.images_large ?? null,
  };
}

/** "Holo · LP · 2 copies"; the defaults say "Normal · NM". */
export function copyLine(choice: Pick<BatchChoice, 'variant' | 'condition' | 'quantity'>): string {
  const copies = choice.quantity > 1 ? ` · ${choice.quantity} copies` : '';
  return `${choice.variant} · ${choice.condition}${copies}`;
}

export function photoName(item: Pick<ScanItem, 'position'>): string {
  return `Photo ${(item.position ?? 0) + 1}`;
}

export type RowOutcome = 'added' | 'skipped' | undefined;

/** A row's two lines. `outcome` is what this screen did with the photo, if anything. */
export function describeRow(
  item: ScanItem,
  choice: BatchChoice,
  outcome: RowOutcome,
): { title: string; detail: string } {
  const state = itemState(item);
  const picked = choice.pick ? pickCard(choice.pick) : null;
  if (state === 'handled') {
    if (outcome === 'added' && picked) return { title: picked.name, detail: 'Added' };
    if (outcome === 'skipped') return { title: photoName(item), detail: 'Skipped' };
    return { title: photoName(item), detail: 'Already added or skipped' };
  }
  if (state === 'reading') {
    return {
      title: item.status === 'retrying' ? 'Waiting to try again' : 'Reading…',
      detail: photoName(item),
    };
  }
  if (picked) {
    const from = choice.pick?.kind === 'search' ? 'From search · ' : '';
    return {
      title: picked.name,
      detail: `${from}${[picked.code, copyLine(choice)].filter(Boolean).join(' · ')}`,
    };
  }
  if (state === 'unmatched') return { title: 'No match', detail: 'Tap to search for it' };
  return {
    title: 'Couldn’t read this card',
    detail: item.error || 'Tap to try again or search',
  };
}

/** The line over the list: progress while reading, then what is left to do. */
export function progressLine(progress: BatchProgress): string {
  if (progress.total === 0) return '';
  if (progress.reading > 0) return `${progress.read} of ${progress.total} read`;
  const left = progress.ready + progress.unmatched + progress.failed;
  if (left === 0) return 'All done';
  return [
    progress.ready > 0 ? `${progress.ready} ready` : null,
    progress.unmatched > 0 ? `${progress.unmatched} with no match` : null,
    progress.failed > 0 ? `${progress.failed} not read` : null,
    progress.handled > 0 ? `${progress.handled} done` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
