/**
 * Bulk removal and its 409s (upstream 1.57.0, #456), read from upstream's
 * own answers (`removal-fixtures.ts`, captured from its test harness).
 */
import { PokeCollectorClient } from '../client';
import { ConflictError, NotFoundError } from '../errors';
import {
  bulkDeleteBinderEntries,
  bulkDeleteCollection,
  bulkDeleteDeckEntries,
  bulkUnlinkProducts,
  releaseAssignments,
  releasePlan,
  removalConflict,
  unlinkPlan,
} from '../removal';
import { CREDENTIALS, fakeFetch } from './fake-server';
import { assigned, assignmentsChanged, both, productLinked, unavailable } from './removal-fixtures';

const conflictFrom = (body: { detail: unknown }) => new ConflictError('x', 409, body.detail);

describe('reading a 409', () => {
  it('finds each blocked card, its binders and decks, and its products', () => {
    const conflict = removalConflict(conflictFrom(both));
    expect(conflict?.code).toBe('collection_assignment_conflict');
    expect(
      conflict?.conflicts.map((c) => [c.name, c.assignments.length, c.products.length]),
    ).toEqual([
      ['First card', 2, 0],
      ['Second card', 0, 1],
    ]);
    expect(conflict?.conflicts[0]?.assignments.map((a) => [a.list_name, a.list_type])).toEqual([
      ['Physical binder', 'collection'],
      ['Real deck', 'physical_deck'],
    ]);
  });

  it('reads the product-only and the changed-assignments codes', () => {
    expect(removalConflict(conflictFrom(productLinked))?.code).toBe(
      'collection_product_link_conflict',
    );
    expect(removalConflict(conflictFrom(assignmentsChanged))?.code).toBe(
      'collection_assignments_changed',
    );
  });

  it('is null for anything else: a string 409, a 404, another error', () => {
    expect(removalConflict(new ConflictError('Release those copies first.', 409))).toBeNull();
    expect(removalConflict(new NotFoundError('x', 404, unavailable.detail))).toBeNull();
    expect(removalConflict(new Error('x'))).toBeNull();
  });
});

describe('plans', () => {
  it('release exactly the assignments upstream reported, in its own body', () => {
    const conflict = removalConflict(conflictFrom(assigned));
    expect(conflict && releasePlan(conflict)).toEqual({
      item_ids: [1],
      assignments: [
        { assignment_id: 1, list_id: 1, item_id: 1, quantity: 1 },
        { assignment_id: 3, list_id: 3, item_id: 1, quantity: 2 },
      ],
    });
    expect(conflict && unlinkPlan(conflict)).toBeNull();
  });

  it('build the release from the list when upstream sends no resolution', () => {
    const conflict = removalConflict(conflictFrom(assigned));
    expect(conflict && releasePlan({ ...conflict, resolutions: [] })?.assignments).toHaveLength(2);
  });

  it('unlink products only as far as upstream says it can', () => {
    const conflict = removalConflict(conflictFrom(productLinked));
    const plan = conflict && unlinkPlan(conflict);
    expect(plan).toEqual({
      canExecute: true,
      body: {
        links: [{ product_id: 1, product_card_id: 1, collection_item_id: 2, active_quantity: 1 }],
      },
    });
    const blocked = conflict && {
      ...conflict,
      resolutions: conflict.resolutions.map((r) => ({ ...r, can_execute: false })),
    };
    expect(blocked && unlinkPlan(blocked)?.canExecute).toBe(false);
    expect(conflict && releasePlan(conflict)).toBeNull();
  });
});

describe('requests', () => {
  function client() {
    const { fetch, calls } = fakeFetch(() => ({
      status: 200,
      body: { removed_ids: [3, 7], removed_entries: 2, removed_copies: 5 },
    }));
    return { c: new PokeCollectorClient(CREDENTIALS, fetch, { token: 't' }), calls };
  }

  it('remove from the collection, a binder and a deck, each ids once', async () => {
    const { c, calls } = client();
    await expect(bulkDeleteCollection(c, [7, 3, 7])).resolves.toMatchObject({ removed_copies: 5 });
    await bulkDeleteBinderEntries(c, 4, [3]);
    await bulkDeleteDeckEntries(c, 9, [3]);
    expect(
      calls.map((call) => [call.method, call.url.replace(CREDENTIALS.primaryUrl, ''), call.body]),
    ).toEqual([
      ['POST', '/api/collection/bulk-delete', '{"item_ids":[7,3]}'],
      ['POST', '/api/binders/4/entries/bulk-delete', '{"item_ids":[3]}'],
      ['POST', '/api/decks/9/entries/bulk-delete', '{"item_ids":[3]}'],
    ]);
  });

  it('refuse an empty batch or one over 500 before asking', async () => {
    const { c, calls } = client();
    await expect(bulkDeleteCollection(c, [])).rejects.toThrow('between 1 and 500');
    await expect(
      bulkDeleteCollection(
        c,
        Array.from({ length: 501 }, (_, i) => i + 1),
      ),
    ).rejects.toThrow('between 1 and 500');
    expect(calls).toHaveLength(0);
  });

  it('release and unlink with the bodies the plans give', async () => {
    const { c, calls } = client();
    const release = releasePlan(removalConflict(conflictFrom(assigned))!)!;
    const unlink = unlinkPlan(removalConflict(conflictFrom(productLinked))!)!;
    await releaseAssignments(c, release);
    await bulkUnlinkProducts(c, unlink.body);
    expect(calls[0]?.url).toBe(`${CREDENTIALS.primaryUrl}/api/collection/release-assignments`);
    expect(JSON.parse(String(calls[0]?.body))).toEqual(release);
    expect(calls[1]?.url).toBe(`${CREDENTIALS.primaryUrl}/api/products/cards/bulk-unlink`);
    expect(JSON.parse(String(calls[1]?.body))).toEqual(unlink.body);
  });
});
