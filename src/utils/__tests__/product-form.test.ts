import type { Product } from '@/api/schemas';

import {
  emptyProductForm,
  productFormRules,
  productToForm,
  readProductForm,
  type ProductForm,
} from '../product-form';

const NOW = new Date(2026, 9, 11, 12);

function form(fields: Partial<ProductForm> = {}): ProductForm {
  return {
    ...emptyProductForm(NOW),
    name: 'Surging Sparks Booster Box',
    type: 'Booster Box',
    price: '159.99',
    ...fields,
  };
}

const SEALED: Product = {
  id: 7,
  product_name: 'Surging Sparks Booster Box',
  product_type: 'Booster Box',
  purchase_price: 159.99,
  purchase_date: '2026-10-01',
  lifecycle_status: 'sealed',
  value_source: 'purchase_cost_fallback',
};

describe('adding', () => {
  it("starts on today's date, sealed, one of them", () => {
    expect(emptyProductForm(NOW)).toMatchObject({
      date: '2026-10-11',
      status: 'sealed',
      quantity: 1,
    });
  });

  it('sends the purchase, with how many', () => {
    expect(
      readProductForm(
        form({ quantity: 3, value: '170', cardmarketUrl: ' ', notes: ' From the LGS ' }),
        undefined,
        NOW,
      ),
    ).toEqual({
      ok: true,
      quantity: 3,
      create: {
        product_name: 'Surging Sparks Booster Box',
        product_type: 'Booster Box',
        purchase_price: 159.99,
        purchase_date: '2026-10-11',
        lifecycle_status: 'sealed',
        current_value: 170,
        cardmarket_url: null,
        notes: 'From the LGS',
      },
    });
  });

  it('leaves the value out of an opened one', () => {
    const result = readProductForm(form({ status: 'opened', value: '170' }), undefined, NOW);
    expect(result).toMatchObject({
      ok: true,
      create: { lifecycle_status: 'opened', current_value: null },
    });
  });

  it('says what is wrong, field by field', () => {
    const result = readProductForm(
      form({
        name: ' ',
        price: 'free',
        date: '2026-10-12',
        value: 'lots',
        cardmarketUrl: 'https://example.com/x',
      }),
      undefined,
      NOW,
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors).sort()).toEqual([
      'cardmarketUrl',
      'date',
      'name',
      'price',
      'value',
    ]);
  });
});

describe('editing', () => {
  it('fills the form from the product', () => {
    expect(productToForm({ ...SEALED, current_value: 175, notes: 'Top shelf' })).toMatchObject({
      price: '159.99',
      date: '2026-10-01',
      status: 'sealed',
      value: '175',
      soldFor: '',
      notes: 'Top shelf',
    });
  });

  it('sends no status when it has not changed', () => {
    const result = readProductForm(productToForm(SEALED), SEALED, NOW);
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && 'update' in result && result.update).not.toHaveProperty('lifecycle_status');
  });

  it('records a sale of the sealed product', () => {
    const result = readProductForm(
      { ...productToForm(SEALED), soldFor: '210', soldOn: '2026-10-10' },
      SEALED,
      NOW,
    );
    expect(result).toMatchObject({
      ok: true,
      update: { sold_price: 210, sold_date: '2026-10-10' },
    });
    expect(result.ok && 'update' in result && result.update).not.toHaveProperty('lifecycle_status');
  });

  it('wants a sale date, after it was bought', () => {
    const before = readProductForm(
      { ...productToForm(SEALED), soldFor: '210', soldOn: '2026-09-01' },
      SEALED,
      NOW,
    );
    expect(before).toMatchObject({ ok: false, errors: { soldOn: expect.any(String) } });
    const none = readProductForm({ ...productToForm(SEALED), soldFor: '210' }, SEALED, NOW);
    expect(none).toMatchObject({ ok: false, errors: { soldOn: expect.any(String) } });
  });

  it('says sealed when a sale is cleared, or upstream would put it in review', () => {
    const sold: Product = {
      ...SEALED,
      lifecycle_status: 'sold',
      sold_price: 210,
      sold_date: '2026-10-10',
    };
    const result = readProductForm({ ...productToForm(sold), soldFor: '', soldOn: '' }, sold, NOW);
    expect(result).toMatchObject({
      ok: true,
      update: { sold_price: null, sold_date: null, lifecycle_status: 'sealed' },
    });
  });

  it('clears the sale of a sold product marked opened', () => {
    const sold: Product = {
      ...SEALED,
      lifecycle_status: 'sold',
      sold_price: 210,
      sold_date: '2026-10-10',
    };
    const result = readProductForm({ ...productToForm(sold), status: 'opened' }, sold, NOW);
    expect(result).toMatchObject({
      ok: true,
      update: { sold_price: null, sold_date: null, lifecycle_status: 'opened' },
    });
  });

  it('never changes the status or sale of one with pulls', () => {
    const opened: Product = { ...SEALED, lifecycle_status: 'opened', value_source: 'linked_cards' };
    const values = productToForm(opened);
    expect(productFormRules(values, opened)).toEqual({ canChooseStatus: false, canSell: false });
    const result = readProductForm({ ...values, name: 'Renamed' }, opened, NOW);
    expect(result).toMatchObject({ ok: true, update: { product_name: 'Renamed' } });
    const update = result.ok && 'update' in result ? result.update : {};
    expect(update).not.toHaveProperty('lifecycle_status');
    expect(update).not.toHaveProperty('sold_price');
    expect(update).not.toHaveProperty('current_value');
  });

  it('leaves a product in review to its page to settle', () => {
    const review: Product = { ...SEALED, lifecycle_status: 'review', value_source: 'needs_review' };
    const result = readProductForm(productToForm(review), review, NOW);
    expect(result.ok && 'update' in result && result.update).not.toHaveProperty('lifecycle_status');
  });
});
