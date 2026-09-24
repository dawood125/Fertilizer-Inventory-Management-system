import type { Product } from '@/lib/types';

/** Sale unit: pieces or cartons. Default sales are in pieces. */
export type SaleUnit = 'piece' | 'carton' | 'box';

export type PriceType = 'retail' | 'wholesale' | 'dealer' | 'promotional' | 'custom';

/** Pieces per carton (aliased with carton_to_box for schema compatibility). */
export function piecesPerCarton(product: Pick<Product, 'carton_to_box'>): number {
  const n = Number(product.carton_to_box) || 0;
  return n > 0 ? n : 1;
}

/** Backward-compatible alias */
export const boxesPerCarton = piecesPerCarton;

/** Convert a quantity in piece/carton into total pieces for piece-level stock. */
export function toPieces(
  product: Pick<Product, 'carton_to_box'>,
  unit: SaleUnit,
  qty: number
): number {
  const q = Number(qty) || 0;
  if (unit === 'carton') return q * piecesPerCarton(product);
  return q;
}

/** Convert a sale qty into carton-equivalents. */
export function toCartons(
  product: Pick<Product, 'carton_to_box'>,
  unit: SaleUnit,
  qty: number
): number {
  const q = Number(qty) || 0;
  if (unit === 'carton') return q;
  return q / piecesPerCarton(product);
}

/** Available quantity for the selected unit (stock is tracked in pieces). */
export function stockInUnit(
  product: Pick<Product, 'stock_quantity' | 'carton_to_box'>,
  unit: SaleUnit
): number {
  const stock = Number(product.stock_quantity) || 0;
  if (unit === 'carton') return Math.floor(stock / piecesPerCarton(product));
  return Math.floor(stock);
}

/** Base piece rate for product + price type. */
export function piecePriceForProduct(
  product: Product,
  priceType: PriceType,
  customPrice = 0
): number {
  const retail = Number(product.retail_price) || 0;
  const wholesale = Number(product.wholesale_price) || 0;
  const dealer = Number(product.dealer_price) || 0;
  const promotional = Number(product.promotional_price) || 0;
  const buyRate = Number(product.purchase_price) || 0;

  const anyPrice = retail || wholesale || dealer || promotional || buyRate || 0;

  switch (priceType) {
    case 'retail':
      return retail || wholesale || dealer || anyPrice;
    case 'wholesale':
      return wholesale || dealer || retail || anyPrice;
    case 'dealer':
      return dealer || wholesale || retail || anyPrice;
    case 'promotional':
      return promotional || retail || wholesale || dealer || anyPrice;
    case 'custom':
      return customPrice || retail || wholesale || dealer || anyPrice;
    default:
      return retail || anyPrice;
  }
}

/** Legacy alias: returns carton price from piece price */
export function cartonPriceForProduct(
  product: Product,
  priceType: PriceType,
  customPrice = 0
): number {
  const piecePrice = piecePriceForProduct(product, priceType, customPrice);
  return piecePrice * piecesPerCarton(product);
}

/** Unit price for POS:
 *  - piece = piece rate
 *  - carton = piece rate × pieces per carton
 *  Optional `customerPrice` overrides the tier (remembered last sale per piece).
 */
export function priceForUnit(
  product: Product,
  priceType: PriceType,
  unit: SaleUnit,
  customPrice = 0,
  customerPrice?: number | null
): number {
  const basePiecePrice =
    customerPrice != null && Number(customerPrice) > 0
      ? Number(customerPrice)
      : piecePriceForProduct(product, priceType, customPrice);

  if (unit === 'carton') {
    return basePiecePrice * piecesPerCarton(product);
  }
  return basePiecePrice;
}

/** Convert a sold unit price back to base piece rate for customer price memory. */
export function toPieceRate(
  product: Pick<Product, 'carton_to_box'>,
  unit: SaleUnit,
  unitPrice: number
): number {
  const rate = Number(unitPrice) || 0;
  if (unit === 'carton') return rate / piecesPerCarton(product);
  return rate;
}

/** Backward-compatible alias for customer price memory */
export const toCartonRate = toPieceRate;

export function cartonRateFromPiece(piecePrice: number, packing: number): number {
  const p = packing > 0 ? packing : 1;
  return piecePrice * p;
}

export function pieceRateFromCarton(cartonPrice: number, packing: number): number {
  const p = packing > 0 ? packing : 1;
  return cartonPrice / p;
}

/** Backward-compatible alias */
export const boxRateFromCarton = pieceRateFromCarton;
