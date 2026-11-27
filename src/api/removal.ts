/**
 * Removing several cards at once, and clearing what blocks a removal
 * (upstream 1.57.0, Git-Romer/pokecollector#456).
 *
 * The three bulk routes are atomic: every id goes, or nothing does. A
 * collection entry still assigned to a collection binder or a Real Deck, or
 * linked to a sealed product, makes upstream refuse the whole batch with a
 * 409 that names each blocked card and the exact calls that would clear it
 * (`resolutions`). The app makes those calls only after the user confirms
 * each one, then removes again. The single-entry `DELETE /api/collection/{id}`
 * refuses the same way since 1.57.0.
 */
import { z } from 'zod';

import type { PokeCollectorClient } from './client';
import { ApiError, ConflictError } from './errors';

/** Upstream's limit on one batch. */
export const MAX_BATCH = 500;

export const BulkRemoveResultSchema = z.looseObject({
  removed_ids: z.array(z.number()),
  removed_entries: z.number(),
  removed_copies: z.number(),
});
export type BulkRemoveResult = z.infer<typeof BulkRemoveResultSchema>;

const AssignmentSchema = z.looseObject({
  assignment_id: z.number(),
  list_id: z.number(),
  item_id: z.number(),
  quantity: z.number(),
  list_name: z.string().nullish(),
  /** `collection` (a binder) or `physical_deck` (a Real Deck). */
  list_type: z.string().nullish(),
});
export type Assignment = z.infer<typeof AssignmentSchema>;

const LinkedProductSchema = z.looseObject({
  product_card_id: z.number(),
  product_id: z.number(),
  product_name: z.string().nullish(),
  active_quantity: z.number(),
  /** False when the link has sale or trade history, which upstream keeps. */
  can_unlink: z.boolean().nullish(),
});
export type LinkedProduct = z.infer<typeof LinkedProductSchema>;

const BlockedEntrySchema = z.looseObject({
  item_id: z.number(),
  card_id: z.string().nullish(),
  name: z.string().nullish(),
  variant: z.string().nullish(),
  condition: z.string().nullish(),
  quantity: z.number().nullish(),
  assignments: z.array(AssignmentSchema).catch([]),
  products: z.array(LinkedProductSchema).catch([]),
});
export type BlockedEntry = z.infer<typeof BlockedEntrySchema>;

const ResolutionSchema = z.looseObject({
  method: z.string(),
  path: z.string(),
  requires_confirmation: z.boolean().nullish(),
  can_execute: z.boolean().nullish(),
  body: z.unknown(),
});

/** What a 409 on a removal says: who blocks it, and how to clear them. */
export const RemovalConflictSchema = z.looseObject({
  code: z.enum([
    'collection_assignment_conflict',
    'collection_product_link_conflict',
    'collection_assignments_changed',
  ]),
  message: z.string(),
  conflicts: z.array(BlockedEntrySchema),
  resolutions: z.array(ResolutionSchema).catch([]),
});
export type RemovalConflict = z.infer<typeof RemovalConflictSchema>;

/** The conflict in an error from a removal, or null for any other failure. */
export function removalConflict(error: unknown): RemovalConflict | null {
  if (!(error instanceof ConflictError)) return null;
  const parsed = RemovalConflictSchema.safeParse(error.detail);
  return parsed.success ? parsed.data : null;
}

export const RELEASE_PATH = '/api/collection/release-assignments';
export const UNLINK_PATH = '/api/products/cards/bulk-unlink';

const ReleaseBodySchema = z.looseObject({
  item_ids: z.array(z.number()),
  assignments: z.array(
    z.looseObject({
      assignment_id: z.number(),
      list_id: z.number(),
      item_id: z.number(),
      quantity: z.number(),
    }),
  ),
});
export type ReleaseBody = z.infer<typeof ReleaseBodySchema>;

const UnlinkBodySchema = z.looseObject({
  links: z.array(
    z.looseObject({
      product_id: z.number(),
      product_card_id: z.number(),
      collection_item_id: z.number(),
      active_quantity: z.number(),
    }),
  ),
});
export type UnlinkBody = z.infer<typeof UnlinkBodySchema>;

/**
 * The exact assignments upstream reported, to release: its own resolution's
 * body, so the server can tell if anything changed since (it then answers
 * `collection_assignments_changed` with the new list).
 */
export function releasePlan(conflict: RemovalConflict): ReleaseBody | null {
  const resolution = conflict.resolutions.find(
    (r) => r.method === 'POST' && r.path === RELEASE_PATH,
  );
  const body = ReleaseBodySchema.safeParse(resolution?.body);
  if (body.success && body.data.assignments.length) return body.data;
  // An answer without resolutions (as `collection_assignments_changed` may
  // be, in later versions): the same thing, built from the list itself.
  const assignments = conflict.conflicts.flatMap((entry) =>
    entry.assignments.map(({ assignment_id, list_id, item_id, quantity }) => ({
      assignment_id,
      list_id,
      item_id,
      quantity,
    })),
  );
  return assignments.length
    ? { item_ids: conflict.conflicts.map((entry) => entry.item_id), assignments }
    : null;
}

/** The product links to unlink, and whether upstream says it can be done. */
export function unlinkPlan(
  conflict: RemovalConflict,
): { body: UnlinkBody; canExecute: boolean } | null {
  const resolution = conflict.resolutions.find(
    (r) => r.method === 'POST' && r.path === UNLINK_PATH,
  );
  const body = UnlinkBodySchema.safeParse(resolution?.body);
  if (!body.success || !body.data.links.length) return null;
  return { body: body.data, canExecute: resolution?.can_execute === true };
}

/** Copies a plan would release or unlink, for the confirmation. */
export const planCopies = (rows: readonly { quantity?: number; active_quantity?: number }[]) =>
  rows.reduce((sum, row) => sum + (row.quantity ?? row.active_quantity ?? 0), 0);

function checkBatch(ids: readonly number[]): number[] {
  const unique = [...new Set(ids)];
  if (unique.length === 0 || unique.length > MAX_BATCH) {
    throw new ApiError(`Choose between 1 and ${MAX_BATCH} cards to remove.`);
  }
  return unique;
}

/** Removes whole collection entries, every copy in each. All or nothing. */
export async function bulkDeleteCollection(
  client: PokeCollectorClient,
  itemIds: readonly number[],
): Promise<BulkRemoveResult> {
  return client.request('/api/collection/bulk-delete', {
    method: 'POST',
    json: { item_ids: checkBatch(itemIds) },
    schema: BulkRemoveResultSchema,
  });
}

/** Takes entries out of one binder; the copies stay in the collection. */
export async function bulkDeleteBinderEntries(
  client: PokeCollectorClient,
  binderId: number,
  entryIds: readonly number[],
): Promise<BulkRemoveResult> {
  return client.request(`/api/binders/${binderId}/entries/bulk-delete`, {
    method: 'POST',
    json: { item_ids: checkBatch(entryIds) },
    schema: BulkRemoveResultSchema,
  });
}

/** Takes cards out of one deck; a Real Deck's copies are released, not removed. */
export async function bulkDeleteDeckEntries(
  client: PokeCollectorClient,
  deckId: number,
  entryIds: readonly number[],
): Promise<BulkRemoveResult> {
  return client.request(`/api/decks/${deckId}/entries/bulk-delete`, {
    method: 'POST',
    json: { item_ids: checkBatch(entryIds) },
    schema: BulkRemoveResultSchema,
  });
}

/** Takes the listed copies out of their binders and decks; the collection stays. */
export function releaseAssignments(
  client: PokeCollectorClient,
  body: ReleaseBody,
): Promise<unknown> {
  return client.request(RELEASE_PATH, { method: 'POST', json: body });
}

/** Unlinks the listed copies from their products; nothing is sold or removed. */
export function bulkUnlinkProducts(
  client: PokeCollectorClient,
  body: UnlinkBody,
): Promise<unknown> {
  return client.request(UNLINK_PATH, { method: 'POST', json: body });
}
