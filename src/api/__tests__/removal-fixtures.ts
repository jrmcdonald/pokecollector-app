/**
 * Upstream 1.59.0's answers to removing collection copies, captured from its
 * own test harness (`tests/test_bulk_removal.py`'s fixtures): a copy in a
 * collection binder and a Real Deck, and a copy linked to a sealed product.
 */
export const assigned = {
  detail: {
    product_sources: [],
    conflicts: [
      {
        item_id: 1,
        card_id: 'bulk-1_en',
        name: 'First card',
        variant: 'Normal',
        condition: 'NM',
        lang: 'en',
        quantity: 3,
        assignments: [
          {
            assignment_id: 1,
            list_id: 1,
            item_id: 1,
            quantity: 1,
            list_name: 'Physical binder',
            list_type: 'collection',
          },
          {
            assignment_id: 3,
            list_id: 3,
            item_id: 1,
            quantity: 2,
            list_name: 'Real deck',
            list_type: 'physical_deck',
          },
        ],
        products: [],
      },
    ],
    resolutions: [
      {
        method: 'POST',
        path: '/api/collection/release-assignments',
        requires_confirmation: true,
        body: {
          item_ids: [1],
          assignments: [
            {
              assignment_id: 1,
              list_id: 1,
              item_id: 1,
              quantity: 1,
            },
            {
              assignment_id: 3,
              list_id: 3,
              item_id: 1,
              quantity: 2,
            },
          ],
        },
      },
    ],
    code: 'collection_assignment_conflict',
    message: 'Some selected cards are still assigned to binders or decks. Nothing was removed.',
    changed: false,
    blockers: [
      {
        item_id: 1,
        card_id: 'bulk-1_en',
        name: 'First card',
        variant: 'Normal',
        condition: 'NM',
        lang: 'en',
        code: 'assigned_to_lists',
        resource: 'collection_item',
        assignments: [
          {
            assignment_id: 1,
            list_id: 1,
            item_id: 1,
            quantity: 1,
            list_name: 'Physical binder',
            list_type: 'collection',
          },
          {
            assignment_id: 3,
            list_id: 3,
            item_id: 1,
            quantity: 2,
            list_name: 'Real deck',
            list_type: 'physical_deck',
          },
        ],
        action: 'release_assignments',
      },
    ],
  },
} as const;

export const productLinked = {
  detail: {
    product_sources: [
      {
        product_card_id: 1,
        product_id: 1,
        product_name: 'Test product',
        product_type: null,
        purchase_date: '2026-01-01',
        active_quantity: 1,
        initial_quantity: 1,
        linked_at: '2026-01-02T10:00:00',
        can_unlink: true,
        unlink_blocked_reason: null,
      },
    ],
    conflicts: [
      {
        item_id: 2,
        card_id: 'bulk-2_en',
        name: 'Second card',
        variant: 'Normal',
        condition: 'NM',
        lang: 'en',
        quantity: 2,
        assignments: [],
        products: [
          {
            product_card_id: 1,
            product_id: 1,
            product_name: 'Test product',
            product_type: null,
            purchase_date: '2026-01-01',
            active_quantity: 1,
            initial_quantity: 1,
            linked_at: '2026-01-02T10:00:00',
            can_unlink: true,
            unlink_blocked_reason: null,
          },
        ],
      },
    ],
    resolutions: [
      {
        method: 'POST',
        path: '/api/products/cards/bulk-unlink',
        requires_confirmation: true,
        can_execute: true,
        blocked_by_history: [],
        body: {
          links: [
            {
              product_id: 1,
              product_card_id: 1,
              collection_item_id: 2,
              active_quantity: 1,
            },
          ],
        },
      },
    ],
    code: 'collection_product_link_conflict',
    message:
      'A selected collection item is linked to a product. Sell or unlink it before removal. Nothing was removed.',
    changed: false,
    blockers: [
      {
        item_id: 2,
        card_id: 'bulk-2_en',
        name: 'Second card',
        variant: 'Normal',
        condition: 'NM',
        lang: 'en',
        code: 'linked_to_products',
        resource: 'collection_item',
        products: [
          {
            product_card_id: 1,
            product_id: 1,
            product_name: 'Test product',
            product_type: null,
            purchase_date: '2026-01-01',
            active_quantity: 1,
            initial_quantity: 1,
            linked_at: '2026-01-02T10:00:00',
            can_unlink: true,
            unlink_blocked_reason: null,
          },
        ],
        action: 'unlink_products',
      },
    ],
  },
} as const;

export const both = {
  detail: {
    product_sources: [
      {
        product_card_id: 1,
        product_id: 1,
        product_name: 'Test product',
        product_type: null,
        purchase_date: '2026-01-01',
        active_quantity: 1,
        initial_quantity: 1,
        linked_at: '2026-01-02T10:00:00',
        can_unlink: true,
        unlink_blocked_reason: null,
      },
    ],
    conflicts: [
      {
        item_id: 1,
        card_id: 'bulk-1_en',
        name: 'First card',
        variant: 'Normal',
        condition: 'NM',
        lang: 'en',
        quantity: 3,
        assignments: [
          {
            assignment_id: 1,
            list_id: 1,
            item_id: 1,
            quantity: 1,
            list_name: 'Physical binder',
            list_type: 'collection',
          },
          {
            assignment_id: 3,
            list_id: 3,
            item_id: 1,
            quantity: 2,
            list_name: 'Real deck',
            list_type: 'physical_deck',
          },
        ],
        products: [],
      },
      {
        item_id: 2,
        card_id: 'bulk-2_en',
        name: 'Second card',
        variant: 'Normal',
        condition: 'NM',
        lang: 'en',
        quantity: 2,
        assignments: [],
        products: [
          {
            product_card_id: 1,
            product_id: 1,
            product_name: 'Test product',
            product_type: null,
            purchase_date: '2026-01-01',
            active_quantity: 1,
            initial_quantity: 1,
            linked_at: '2026-01-02T10:00:00',
            can_unlink: true,
            unlink_blocked_reason: null,
          },
        ],
      },
    ],
    resolutions: [
      {
        method: 'POST',
        path: '/api/collection/release-assignments',
        requires_confirmation: true,
        body: {
          item_ids: [1, 2],
          assignments: [
            {
              assignment_id: 1,
              list_id: 1,
              item_id: 1,
              quantity: 1,
            },
            {
              assignment_id: 3,
              list_id: 3,
              item_id: 1,
              quantity: 2,
            },
          ],
        },
      },
      {
        method: 'POST',
        path: '/api/products/cards/bulk-unlink',
        requires_confirmation: true,
        can_execute: true,
        blocked_by_history: [],
        body: {
          links: [
            {
              product_id: 1,
              product_card_id: 1,
              collection_item_id: 2,
              active_quantity: 1,
            },
          ],
        },
      },
    ],
    code: 'collection_assignment_conflict',
    message: 'Some selected cards are still assigned to binders or decks. Nothing was removed.',
    changed: false,
    blockers: [
      {
        item_id: 1,
        card_id: 'bulk-1_en',
        name: 'First card',
        variant: 'Normal',
        condition: 'NM',
        lang: 'en',
        code: 'assigned_to_lists',
        resource: 'collection_item',
        assignments: [
          {
            assignment_id: 1,
            list_id: 1,
            item_id: 1,
            quantity: 1,
            list_name: 'Physical binder',
            list_type: 'collection',
          },
          {
            assignment_id: 3,
            list_id: 3,
            item_id: 1,
            quantity: 2,
            list_name: 'Real deck',
            list_type: 'physical_deck',
          },
        ],
        action: 'release_assignments',
      },
      {
        item_id: 2,
        card_id: 'bulk-2_en',
        name: 'Second card',
        variant: 'Normal',
        condition: 'NM',
        lang: 'en',
        code: 'linked_to_products',
        resource: 'collection_item',
        products: [
          {
            product_card_id: 1,
            product_id: 1,
            product_name: 'Test product',
            product_type: null,
            purchase_date: '2026-01-01',
            active_quantity: 1,
            initial_quantity: 1,
            linked_at: '2026-01-02T10:00:00',
            can_unlink: true,
            unlink_blocked_reason: null,
          },
        ],
        action: 'unlink_products',
      },
    ],
  },
} as const;

export const assignmentsChanged = {
  detail: {
    product_sources: [],
    conflicts: [
      {
        item_id: 1,
        card_id: 'bulk-1_en',
        name: 'First card',
        variant: 'Normal',
        condition: 'NM',
        lang: 'en',
        quantity: 3,
        assignments: [
          {
            assignment_id: 1,
            list_id: 1,
            item_id: 1,
            quantity: 1,
            list_name: 'Physical binder',
            list_type: 'collection',
          },
          {
            assignment_id: 3,
            list_id: 3,
            item_id: 1,
            quantity: 2,
            list_name: 'Real deck',
            list_type: 'physical_deck',
          },
        ],
        products: [],
      },
    ],
    resolutions: [
      {
        method: 'POST',
        path: '/api/collection/release-assignments',
        requires_confirmation: true,
        body: {
          item_ids: [1],
          assignments: [
            {
              assignment_id: 1,
              list_id: 1,
              item_id: 1,
              quantity: 1,
            },
            {
              assignment_id: 3,
              list_id: 3,
              item_id: 1,
              quantity: 2,
            },
          ],
        },
      },
    ],
    code: 'collection_assignments_changed',
    message: 'Assignments changed. Review the updated list before trying again.',
    changed: false,
    blockers: [
      {
        item_id: 1,
        card_id: 'bulk-1_en',
        name: 'First card',
        variant: 'Normal',
        condition: 'NM',
        lang: 'en',
        code: 'assigned_to_lists',
        resource: 'collection_item',
        assignments: [
          {
            assignment_id: 1,
            list_id: 1,
            item_id: 1,
            quantity: 1,
            list_name: 'Physical binder',
            list_type: 'collection',
          },
          {
            assignment_id: 3,
            list_id: 3,
            item_id: 1,
            quantity: 2,
            list_name: 'Real deck',
            list_type: 'physical_deck',
          },
        ],
        action: 'release_assignments',
      },
      {
        code: 'assignments_changed',
        resource: 'assignment',
        action: 'refresh_confirmation',
        current_assignments: [
          {
            assignment_id: 1,
            list_id: 1,
            item_id: 1,
            quantity: 1,
          },
          {
            assignment_id: 3,
            list_id: 3,
            item_id: 1,
            quantity: 2,
          },
        ],
      },
    ],
  },
} as const;

export const unavailable = {
  detail: {
    product_sources: [],
    conflicts: [
      {
        item_id: 1,
        card_id: 'bulk-1_en',
        name: 'First card',
        variant: 'Normal',
        condition: 'NM',
        lang: 'en',
        quantity: 3,
        assignments: [
          {
            assignment_id: 1,
            list_id: 1,
            item_id: 1,
            quantity: 1,
            list_name: 'Physical binder',
            list_type: 'collection',
          },
          {
            assignment_id: 3,
            list_id: 3,
            item_id: 1,
            quantity: 2,
            list_name: 'Real deck',
            list_type: 'physical_deck',
          },
        ],
        products: [],
      },
    ],
    resolutions: [
      {
        method: 'POST',
        path: '/api/collection/release-assignments',
        requires_confirmation: true,
        body: {
          item_ids: [1],
          assignments: [
            {
              assignment_id: 1,
              list_id: 1,
              item_id: 1,
              quantity: 1,
            },
            {
              assignment_id: 3,
              list_id: 3,
              item_id: 1,
              quantity: 2,
            },
          ],
        },
      },
    ],
    code: 'collection_entries_unavailable',
    message: 'Some collection entries were not found or are not accessible. Nothing was changed.',
    changed: false,
    blockers: [
      {
        code: 'not_found_or_not_accessible',
        resource: 'collection_item',
        item_id: 999999,
        action: 'remove_from_request',
      },
      {
        item_id: 1,
        card_id: 'bulk-1_en',
        name: 'First card',
        variant: 'Normal',
        condition: 'NM',
        lang: 'en',
        code: 'assigned_to_lists',
        resource: 'collection_item',
        assignments: [
          {
            assignment_id: 1,
            list_id: 1,
            item_id: 1,
            quantity: 1,
            list_name: 'Physical binder',
            list_type: 'collection',
          },
          {
            assignment_id: 3,
            list_id: 3,
            item_id: 1,
            quantity: 2,
            list_name: 'Real deck',
            list_type: 'physical_deck',
          },
        ],
        action: 'release_assignments',
      },
    ],
  },
} as const;
