import { api } from './api';
import type { ProductBatch } from './types';

export interface BatchAllocation {
  batchId: string;
  batchNumber: string;
  qty: number;
  unitCost: number;
}

export interface FifoCostResult {
  unitCost: number;
  totalCost: number;
  batchAllocations: BatchAllocation[];
}

/**
 * Consumes stock from product_batches using true FIFO (First-In, First-Out).
 * Deducts quantity from oldest active batches first and marks depleted batches.
 * Returns the exact blended unit cost and total cost.
 */
export async function allocateFifoCost(
  productId: string,
  neededCartons: number,
  fallbackRate: number
): Promise<FifoCostResult> {
  const qtyToAllocate = Math.max(0, Number(neededCartons) || 0);
  const safeFallback = Math.max(0, Number(fallbackRate) || 0);

  if (qtyToAllocate === 0) {
    return { unitCost: safeFallback, totalCost: 0, batchAllocations: [] };
  }

  try {
    const batches = await api.get<ProductBatch[]>(`/api/data/product_batches?product_id=${productId}`);
    const activeBatches = (batches || [])
      .filter((b) => b.product_id === productId && b.status === 'active' && Number(b.quantity) > 0)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (activeBatches.length === 0) {
      const totalCost = Math.round(qtyToAllocate * safeFallback * 100) / 100;
      return { unitCost: safeFallback, totalCost, batchAllocations: [] };
    }

    let remainingNeeded = qtyToAllocate;
    let accumulatedCost = 0;
    const batchAllocations: BatchAllocation[] = [];

    for (const b of activeBatches) {
      if (remainingNeeded <= 0) break;

      const availableInBatch = Number(b.quantity || 0);
      if (availableInBatch <= 0) continue;

      const takeQty = Math.min(availableInBatch, remainingNeeded);
      const batchUnitCost = Number(b.batch_cost || safeFallback);
      const lineCost = takeQty * batchUnitCost;

      accumulatedCost += lineCost;
      remainingNeeded -= takeQty;

      batchAllocations.push({
        batchId: b.id,
        batchNumber: b.batch_number,
        qty: takeQty,
        unitCost: batchUnitCost,
      });

      const updatedQty = Math.max(0, availableInBatch - takeQty);
      const updatedStatus = updatedQty <= 0.0001 ? 'depleted' : 'active';

      await api.put(`/api/data/product_batches/${b.id}`, {
        quantity: updatedQty,
        status: updatedStatus,
      });
    }

    // If needed quantity exceeds all active batches (e.g. stock was below 0)
    if (remainingNeeded > 0) {
      accumulatedCost += remainingNeeded * safeFallback;
    }

    const totalCost = Math.round(accumulatedCost * 100) / 100;
    const unitCost = qtyToAllocate > 0 ? Math.round((totalCost / qtyToAllocate) * 100) / 100 : safeFallback;

    return {
      unitCost,
      totalCost,
      batchAllocations,
    };
  } catch (err) {
    console.error('[FIFO] Allocation error for product', productId, err);
    const totalCost = Math.round(qtyToAllocate * safeFallback * 100) / 100;
    return { unitCost: safeFallback, totalCost, batchAllocations: [] };
  }
}

/**
 * Registers a new FIFO stock batch when a Purchase Order is marked as received.
 */
export async function receiveStockBatch(
  productId: string,
  poNumber: string,
  quantity: number,
  unitCost: number,
  purchaseId?: string | null,
  batchNumberCustom?: string
): Promise<ProductBatch | null> {
  const qty = Math.max(0, Number(quantity) || 0);
  const cost = Math.max(0, Number(unitCost) || 0);

  if (qty <= 0) return null;

  try {
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const batchNumber = batchNumberCustom?.trim() || `${poNumber}-${randomSuffix}`;

    const batch = await api.post<ProductBatch>('/api/data/product_batches', {
      product_id: productId,
      purchase_id: purchaseId || null,
      batch_number: batchNumber,
      quantity: qty,
      damaged_quantity: 0,
      batch_cost: cost,
      status: 'active',
    });

    return batch;
  } catch (err) {
    console.error('[FIFO] Failed to create stock batch:', err);
    return null;
  }
}

/**
 * Restores returned stock back into the FIFO batch pool (used on sales returns or order cancellations).
 */
export async function returnStockBatch(
  productId: string,
  quantity: number,
  unitCost?: number
): Promise<void> {
  const qty = Math.max(0, Number(quantity) || 0);
  if (qty <= 0) return;

  try {
    const batches = await api.get<ProductBatch[]>(`/api/data/product_batches?product_id=${productId}`);
    const activeBatches = (batches || [])
      .filter((b) => b.product_id === productId && b.status === 'active')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); // newest active first

    if (activeBatches.length > 0) {
      const latestBatch = activeBatches[0];
      await api.put(`/api/data/product_batches/${latestBatch.id}`, {
        quantity: Number(latestBatch.quantity || 0) + qty,
        status: 'active',
      });
    } else {
      // Create a dedicated returned stock batch
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      await api.post('/api/data/product_batches', {
        product_id: productId,
        batch_number: `RETURN-${randomSuffix}`,
        quantity: qty,
        damaged_quantity: 0,
        batch_cost: Number(unitCost || 0),
        status: 'active',
      });
    }
  } catch (err) {
    console.error('[FIFO] Failed to restore stock batch:', err);
  }
}
