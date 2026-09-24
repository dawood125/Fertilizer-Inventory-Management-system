/** Shared cart / bill / print money math (PKR, 2 decimals). */

export function roundMoney(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export interface BillLineInput {
  quantity: number;
  unitPrice: number;
  discount?: number;
}

export interface BillTotalsInput {
  lines: BillLineInput[];
  orderDiscount?: number;
  taxRate?: number;
  paymentType: 'full' | 'partial' | 'credit' | 'advance' | string;
  paidAmount?: number;
}

export interface BillLineTotals {
  gross: number;
  discount: number;
  net: number;
}

export interface BillTotals {
  subtotalGross: number;
  lineDiscountTotal: number;
  subtotalNet: number;
  orderDiscount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  effectivePaid: number;
  remaining: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
}

export function lineBill(line: BillLineInput): BillLineTotals {
  const gross = roundMoney((Number(line.quantity) || 0) * (Number(line.unitPrice) || 0));
  const discount = roundMoney(Math.max(0, Number(line.discount) || 0));
  const net = roundMoney(Math.max(0, gross - discount));
  return { gross, discount, net };
}

export function computeBillTotals(input: BillTotalsInput): BillTotals {
  const lines = (input.lines || []).map(lineBill);
  const subtotalGross = roundMoney(lines.reduce((s, l) => s + l.gross, 0));
  const lineDiscountTotal = roundMoney(lines.reduce((s, l) => s + l.discount, 0));
  const subtotalNet = roundMoney(lines.reduce((s, l) => s + l.net, 0));
  const orderDiscount = roundMoney(Math.max(0, Number(input.orderDiscount) || 0));
  const taxRate = Number(input.taxRate) || 0;
  const taxable = Math.max(0, subtotalNet - orderDiscount);
  const taxAmount = roundMoney(taxable * (taxRate / 100));
  const total = roundMoney(taxable + taxAmount);

  const paymentType = input.paymentType || 'full';
  let effectivePaid = 0;
  if (paymentType === 'credit') effectivePaid = 0;
  else if (paymentType === 'full') effectivePaid = total;
  else effectivePaid = roundMoney(Math.max(0, Number(input.paidAmount) || 0));

  const remaining = roundMoney(Math.max(0, total - effectivePaid));
  const paymentStatus: BillTotals['paymentStatus'] =
    paymentType === 'credit' ? 'unpaid' : remaining <= 0 ? 'paid' : 'partial';

  return {
    subtotalGross,
    lineDiscountTotal,
    subtotalNet,
    orderDiscount,
    taxRate,
    taxAmount,
    total,
    effectivePaid,
    remaining,
    paymentStatus,
  };
}
