/**
 * The add and edit form for a sealed product: its fields as typed, checked
 * the way upstream checks them (api/products.py), and turned into what the
 * request sends. Upstream's rules, which the form follows rather than
 * meeting as a 409:
 *
 * - a product with pulls or sales is opened, and cannot be marked sealed or
 *   sold sealed;
 * - a sold product is one with a sale price; a sale date needs one;
 * - an opened product cannot also be sold sealed;
 * - clearing a sale without saying what it is now leaves it "needs review".
 */
import type { NewProduct, ProductChanges } from '@/api/endpoints';
import type { Product } from '@/api/schemas';

import { isCardmarketProductUrl, isPurchaseDate, parseMoney, today } from './products';

export interface ProductForm {
  name: string;
  type: string | null;
  price: string;
  date: string;
  /** How many identical ones to add; adding only. */
  quantity: number;
  status: 'sealed' | 'opened';
  /** Its value now, while sealed; empty counts what was paid. */
  value: string;
  soldFor: string;
  soldOn: string;
  cardmarketUrl: string;
  notes: string;
}

export type ProductFormErrors = Partial<Record<keyof ProductForm, string>>;

/** What the form can change about this product. */
export interface ProductFormRules {
  /** Sealed or opened can be chosen: not once it has pulls, nor while in review. */
  canChooseStatus: boolean;
  /** A sale of the sealed product can be recorded: editing, while not opened. */
  canSell: boolean;
}

export function productFormRules(form: ProductForm, product?: Product): ProductFormRules {
  const hasHistory = product?.value_source === 'linked_cards';
  const inReview = product?.lifecycle_status === 'review';
  return {
    canChooseStatus: !hasHistory && !inReview,
    canSell: !!product && !hasHistory && form.status === 'sealed',
  };
}

function money(value: number | null | undefined): string {
  return typeof value === 'number' ? String(value) : '';
}

export function emptyProductForm(now: Date = new Date()): ProductForm {
  return {
    name: '',
    type: null,
    price: '',
    date: today(now),
    quantity: 1,
    status: 'sealed',
    value: '',
    soldFor: '',
    soldOn: '',
    cardmarketUrl: '',
    notes: '',
  };
}

export function productToForm(product: Product): ProductForm {
  return {
    name: product.product_name,
    type: product.product_type ?? null,
    price: money(product.purchase_price),
    date: product.purchase_date,
    quantity: 1,
    status: product.lifecycle_status === 'opened' ? 'opened' : 'sealed',
    value: money(product.current_value),
    soldFor: money(product.sold_price),
    soldOn: product.sold_date ?? '',
    cardmarketUrl: product.cardmarket_url ?? '',
    notes: product.notes ?? '',
  };
}

export type ProductFormResult =
  | { ok: true; create: NewProduct; quantity: number }
  | { ok: true; update: ProductChanges }
  | { ok: false; errors: ProductFormErrors };

/** Checks the form, and gives what to send to add the product, or to change `product`. */
export function readProductForm(
  form: ProductForm,
  product?: Product,
  now: Date = new Date(),
): ProductFormResult {
  const rules = productFormRules(form, product);
  const errors: ProductFormErrors = {};
  const sealed = form.status === 'sealed';

  const name = form.name.trim();
  if (!name) errors.name = 'Enter a name.';

  const price = parseMoney(form.price);
  if (price === null) errors.price = 'Enter what you paid, like 59.99.';

  if (!isPurchaseDate(form.date, now)) {
    errors.date = 'Enter a date like 2026-10-11, not in the future.';
  }

  const value = form.value.trim() ? parseMoney(form.value) : null;
  if (sealed && form.value.trim() && value === null) errors.value = 'Enter a value, like 75.';

  const selling = rules.canSell && form.soldFor.trim() !== '';
  const soldFor = selling ? parseMoney(form.soldFor) : null;
  if (selling && soldFor === null) errors.soldFor = 'Enter what it sold for, like 80.';
  if (selling && !isPurchaseDate(form.soldOn, now)) {
    errors.soldOn = 'Enter a date like 2026-10-11, not in the future.';
  } else if (selling && form.soldOn < form.date) {
    errors.soldOn = 'It cannot have sold before it was bought.';
  }

  const url = form.cardmarketUrl.trim();
  if (url && !isCardmarketProductUrl(url)) {
    errors.cardmarketUrl = 'Paste the product’s page on cardmarket.com.';
  }

  if (Object.keys(errors).length > 0 || price === null) return { ok: false, errors };

  const fields = {
    product_name: name,
    product_type: form.type,
    purchase_price: price,
    purchase_date: form.date,
    cardmarket_url: url || null,
    notes: form.notes.trim() || null,
  };

  if (!product) {
    return {
      ok: true,
      quantity: Math.max(1, form.quantity),
      create: {
        ...fields,
        lifecycle_status: form.status,
        current_value: sealed ? value : null,
      },
    };
  }

  const update: ProductChanges = { ...fields };
  // The value applies while sealed; an opened one is valued by its pulls.
  if (sealed) update.current_value = value;
  if (rules.canSell) {
    update.sold_price = soldFor;
    update.sold_date = selling ? form.soldOn : null;
  }
  const wasSold = product.lifecycle_status === 'sold';
  if (wasSold && !rules.canSell) {
    // Opened now: it cannot also have been sold sealed.
    update.sold_price = null;
    update.sold_date = null;
  }
  if (rules.canChooseStatus && !selling && (wasSold || form.status !== product.lifecycle_status)) {
    // Said outright when a sale is cleared, or upstream leaves it in review.
    update.lifecycle_status = form.status;
  }
  return { ok: true, update };
}
