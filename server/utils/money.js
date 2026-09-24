/** Money helpers: DB stores INTEGER paisa; API/UI use decimal rupees. */

export function toPaisa(rupees) {
  if (rupees === null || rupees === undefined || rupees === '') return 0;
  const n = Number(rupees);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromPaisa(paisa) {
  if (paisa === null || paisa === undefined) return 0;
  return Number(paisa) / 100;
}

/** Convert known money fields on a row from paisa → rupees for API responses */
export function moneyOut(row, fields) {
  if (!row) return row;
  const out = { ...row };
  for (const f of fields) {
    if (f in out && out[f] !== null && out[f] !== undefined) {
      out[f] = fromPaisa(out[f]);
    }
  }
  return out;
}

export function moneyIn(data, fields) {
  if (!data) return data;
  const out = { ...data };
  for (const f of fields) {
    if (f in out && out[f] !== null && out[f] !== undefined) {
      out[f] = toPaisa(out[f]);
    }
  }
  return out;
}

export const PRODUCT_MONEY = [
  'purchase_price', 'retail_price', 'wholesale_price', 'dealer_price',
  'special_price', 'cost_price', 'promotional_price', 'min_selling_price',
];

export const CUSTOMER_MONEY = ['balance', 'loyalty_points', 'credit_limit', 'opening_balance', 'custom_price'];
export const SUPPLIER_MONEY = ['balance', 'opening_balance'];
export const ORDER_MONEY = ['subtotal', 'discount', 'tax', 'total', 'paid_amount'];
export const ORDER_ITEM_MONEY = ['unit_price', 'discount', 'tax', 'total', 'cost_price', 'total_cost'];
export const ORDER_PAYMENT_MONEY = ['amount'];
export const SUPPLIER_PAYMENT_MONEY = ['amount'];
export const PO_MONEY = ['subtotal', 'tax', 'total', 'paid_amount', 'discount'];
export const PO_ITEM_MONEY = ['unit_cost', 'total', 'retail_price', 'wholesale_price', 'dealer_price'];
export const EXPENSE_MONEY = ['amount'];
export const ACCOUNT_MONEY = ['balance'];
export const TX_MONEY = ['amount'];
export const BATCH_MONEY = ['batch_cost'];
export const SALES_RETURN_MONEY = ['unit_price', 'total_amount'];
export const PURCHASE_RETURN_MONEY = ['unit_cost', 'total_amount'];
export const CLAIM_MONEY = ['amount'];
export const CUSTOMER_PRODUCT_PRICE_MONEY = ['unit_price'];
export const TAX_MONEY = []; // percentage stays as number
