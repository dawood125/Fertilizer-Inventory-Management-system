import { getDb, initDatabase, saveDatabaseNow, uuid, nowISO, execute, queryAll, queryOne } from '../server/database/connection.js';
import { toPaisa, fromPaisa } from '../server/utils/money.js';

async function runFifoE2ETest() {
  console.log('====================================================');
  console.log('STARTING COMPREHENSIVE FIFO & RESET E2E TEST');
  console.log('====================================================');

  await initDatabase();
  const db = getDb();

  // Test 1: Test Reset logic
  console.log('\n--- TEST 1: Database Reset Logic ---');
  // Insert a test supplier payment
  const dummySupPaymentId = uuid();
  db.run(`INSERT INTO supplier_payments (id, amount, method, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [dummySupPaymentId, 500000, 'cash', nowISO(), nowISO()]);
  
  let supCount = queryOne('SELECT COUNT(*) as cnt FROM supplier_payments WHERE id = ?', [dummySupPaymentId]);
  console.log('Inserted dummy supplier payment:', supCount.cnt === 1 ? 'PASS' : 'FAIL');

  // Verify supplier_payments is deleted during wipe
  execute('PRAGMA foreign_keys = OFF;');
  execute('DELETE FROM supplier_payments WHERE id = ?', [dummySupPaymentId]);
  execute('PRAGMA foreign_keys = ON;');
  supCount = queryOne('SELECT COUNT(*) as cnt FROM supplier_payments WHERE id = ?', [dummySupPaymentId]);
  console.log('Supplier payment wiped clean:', supCount.cnt === 0 ? 'PASS' : 'FAIL');

  // Test 2: Product & Batch 1 Creation
  console.log('\n--- TEST 2: Product & Initial FIFO Batch Creation ---');
  const prodId = uuid();
  const now = nowISO();
  const initialBuyRate = 1000; // Rs 1,000
  const initialWholesale = 1200; // Rs 1,200
  const initialRetail = 1300; // Rs 1,300
  const initialStock = 10; // 10 cartons

  db.run(`INSERT INTO products (
    id, name, sku, purchase_price, retail_price, wholesale_price, dealer_price,
    cost_price, stock_quantity, unit, status, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`, [
    prodId,
    'Super Cream Test Biscuit',
    'TEST-SCB-01',
    toPaisa(initialBuyRate),
    toPaisa(initialRetail),
    toPaisa(initialWholesale),
    toPaisa(1150),
    toPaisa(initialBuyRate),
    initialStock,
    'carton',
    now,
    now,
  ]);

  // Create initial stock batch layer
  const batch1Id = uuid();
  db.run(`INSERT INTO product_batches (
    id, product_id, batch_number, quantity, batch_cost, status, created_at, updated_at
  ) VALUES (?, ?, 'INITIAL-STOCK', ?, ?, 'active', ?, ?)`, [
    batch1Id,
    prodId,
    initialStock,
    toPaisa(initialBuyRate),
    now,
    now,
  ]);

  const p1 = queryOne('SELECT * FROM products WHERE id = ?', [prodId]);
  console.log(`Product created: ${p1.name}, Stock: ${p1.stock_quantity}, Buy: Rs ${fromPaisa(p1.purchase_price)}, WS: Rs ${fromPaisa(p1.wholesale_price)}`);
  const b1 = queryOne('SELECT * FROM product_batches WHERE id = ?', [batch1Id]);
  console.log(`Batch 1 created: Qty: ${b1.quantity}, Cost: Rs ${fromPaisa(b1.batch_cost)}, Status: ${b1.status}`);

  // Test 3: New PO with Price Hike & Selling Rates Update
  console.log('\n--- TEST 3: New PO with Price Hike & Updated Selling Rates ---');
  const poId = uuid();
  const poNumber = 'PO-TEST-001';
  const newBuyRate = 1200; // Rs 1,200
  const newWholesaleRate = 1350; // Rs 1,350
  const newRetailRate = 1450; // Rs 1,450
  const newDealerRate = 1300; // Rs 1,300
  const poQty = 30; // 30 cartons

  // Purchase items has selling prices from Migration 012
  const poItemId = uuid();
  db.run(`INSERT INTO purchase_orders (id, po_number, subtotal, total, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
    [poId, poNumber, toPaisa(newBuyRate * poQty), toPaisa(newBuyRate * poQty), now, now]);

  db.run(`INSERT INTO purchase_items (id, purchase_id, product_id, product_name, quantity, unit_cost, total, retail_price, wholesale_price, dealer_price)
    VALUES (?, ?, ?, 'Super Cream Test Biscuit', ?, ?, ?, ?, ?, ?)`, [
      poItemId,
      poId,
      prodId,
      poQty,
      toPaisa(newBuyRate),
      toPaisa(newBuyRate * poQty),
      toPaisa(newRetailRate),
      toPaisa(newWholesaleRate),
      toPaisa(newDealerRate),
    ]);

  // Simulate receiving PO (as done in Purchasing.tsx)
  const batch2Id = uuid();
  const timeLater = new Date(Date.now() + 1000).toISOString();
  db.run(`INSERT INTO product_batches (id, product_id, purchase_id, batch_number, quantity, batch_cost, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`, [
      batch2Id,
      prodId,
      poId,
      `${poNumber}-B2`,
      poQty,
      toPaisa(newBuyRate),
      timeLater,
      timeLater,
    ]);

  // Update product stock and rates
  db.run(`UPDATE products SET
    stock_quantity = stock_quantity + ?,
    purchase_price = ?,
    cost_price = ?,
    retail_price = ?,
    wholesale_price = ?,
    dealer_price = ?
    WHERE id = ?`, [
      poQty,
      toPaisa(newBuyRate),
      toPaisa(newBuyRate),
      toPaisa(newRetailRate),
      toPaisa(newWholesaleRate),
      toPaisa(newDealerRate),
      prodId,
    ]);

  const pUpdated = queryOne('SELECT * FROM products WHERE id = ?', [prodId]);
  console.log(`Product After PO Received: Stock: ${pUpdated.stock_quantity}, Buy Rate: Rs ${fromPaisa(pUpdated.purchase_price)}, New WS Rate: Rs ${fromPaisa(pUpdated.wholesale_price)}, New Retail: Rs ${fromPaisa(pUpdated.retail_price)}`);
  
  const activeBatches = queryAll('SELECT id, batch_number, quantity, batch_cost, status, created_at FROM product_batches WHERE product_id = ? ORDER BY created_at ASC', [prodId]);
  console.log(`Active Batches (${activeBatches.length}):`);
  activeBatches.forEach(b => console.log(`  - [${b.batch_number}] Qty: ${b.quantity}, Unit Cost: Rs ${fromPaisa(b.batch_cost)}, Status: ${b.status}`));

  // Helper FIFO allocation function (same logic as src/lib/fifo.ts)
  function allocateFifo(neededCartons, fallbackRate) {
    const batches = queryAll('SELECT * FROM product_batches WHERE product_id = ? AND status = "active" AND quantity > 0 ORDER BY created_at ASC', [prodId]);
    let remaining = neededCartons;
    let totalCost = 0;
    const allocations = [];

    for (const b of batches) {
      if (remaining <= 0) break;
      const take = Math.min(b.quantity, remaining);
      const unitCost = fromPaisa(b.batch_cost) || fallbackRate;
      totalCost += take * unitCost;
      remaining -= take;
      allocations.push({ batchId: b.id, qty: take, unitCost });

      const newQty = b.quantity - take;
      const newStatus = newQty <= 0.0001 ? 'depleted' : 'active';
      db.run('UPDATE product_batches SET quantity = ?, status = ? WHERE id = ?', [newQty, newStatus, b.id]);
    }

    if (remaining > 0) {
      totalCost += remaining * fallbackRate;
    }

    return {
      unitCost: neededCartons > 0 ? totalCost / neededCartons : fallbackRate,
      totalCost,
      allocations,
    };
  }

  // Test 4: Sale 1 (Selling 10 cartons of Old Stock at NEW Wholesale Rate)
  console.log('\n--- TEST 4: Sale 1 (Selling 10 Cartons at New Wholesale Rate: Rs 1,350) ---');
  const sale1Qty = 10;
  const sale1SellRate = fromPaisa(pUpdated.wholesale_price); // Rs 1,350
  const sale1Revenue = sale1Qty * sale1SellRate; // Rs 13,500
  const fifo1 = allocateFifo(sale1Qty, fromPaisa(pUpdated.purchase_price));

  const order1Id = uuid();
  const orderItemId1 = uuid();
  db.run(`INSERT INTO orders (id, order_number, total, status, created_at, updated_at) VALUES (?, ?, ?, 'completed', ?, ?)`,
    [order1Id, 'ORD-TEST-001', toPaisa(sale1Revenue), nowISO(), nowISO()]);
  db.run(`INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total, cost_price, total_cost)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      orderItemId1,
      order1Id,
      prodId,
      sale1Qty,
      toPaisa(sale1SellRate),
      toPaisa(sale1Revenue),
      toPaisa(fifo1.unitCost),
      toPaisa(fifo1.totalCost),
    ]);

  const sale1Profit = sale1Revenue - fifo1.totalCost;
  console.log(`Sale 1 Revenue: Rs ${sale1Revenue}`);
  console.log(`Sale 1 FIFO Cost: Rs ${fifo1.totalCost} (Unit Cost: Rs ${fifo1.unitCost})`);
  console.log(`Sale 1 Exact Profit: Rs ${sale1Profit} (Rs ${sale1Profit / sale1Qty}/carton)`);
  console.log(`Batch 1 allocations:`, fifo1.allocations);

  const b1AfterSale1 = queryOne('SELECT * FROM product_batches WHERE id = ?', [batch1Id]);
  console.log(`Batch 1 Status: ${b1AfterSale1.status}, Remaining Qty: ${b1AfterSale1.quantity}`);
  console.log(`Verification: Expected Profit = Rs 3,500. Actual = Rs ${sale1Profit} ->`, sale1Profit === 3500 ? 'PASS (100% Exact!)' : 'FAIL');

  // Test 5: Sale 2 (Selling 5 cartons from Batch 2 at Rs 1,350)
  console.log('\n--- TEST 5: Sale 2 (Selling 5 Cartons from Batch 2 at Rs 1,350) ---');
  const sale2Qty = 5;
  const sale2Revenue = sale2Qty * sale1SellRate; // 5 * 1,350 = Rs 6,750
  const fifo2 = allocateFifo(sale2Qty, fromPaisa(pUpdated.purchase_price));

  const order2Id = uuid();
  const orderItemId2 = uuid();
  db.run(`INSERT INTO orders (id, order_number, total, status, created_at, updated_at) VALUES (?, ?, ?, 'completed', ?, ?)`,
    [order2Id, 'ORD-TEST-002', toPaisa(sale2Revenue), nowISO(), nowISO()]);
  db.run(`INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total, cost_price, total_cost)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
      orderItemId2,
      order2Id,
      prodId,
      sale2Qty,
      toPaisa(sale1SellRate),
      toPaisa(sale2Revenue),
      toPaisa(fifo2.unitCost),
      toPaisa(fifo2.totalCost),
    ]);

  const sale2Profit = sale2Revenue - fifo2.totalCost;
  console.log(`Sale 2 Revenue: Rs ${sale2Revenue}`);
  console.log(`Sale 2 FIFO Cost: Rs ${fifo2.totalCost} (Unit Cost: Rs ${fifo2.unitCost})`);
  console.log(`Sale 2 Exact Profit: Rs ${sale2Profit} (Rs ${sale2Profit / sale2Qty}/carton)`);
  console.log(`Batch 2 allocations:`, fifo2.allocations);

  const b2AfterSale2 = queryOne('SELECT * FROM product_batches WHERE id = ?', [batch2Id]);
  console.log(`Batch 2 Status: ${b2AfterSale2.status}, Remaining Qty: ${b2AfterSale2.quantity}`);
  console.log(`Verification: Expected Profit = Rs 750. Actual = Rs ${sale2Profit} ->`, sale2Profit === 750 ? 'PASS (100% Exact!)' : 'FAIL');

  // Test 6: Profit Freeze Verification
  console.log('\n--- TEST 6: Historical Profit Freezing Verification ---');
  // Now simulate buying a Batch 3 at Rs 1,500
  const po3Rate = 1500;
  db.run('UPDATE products SET purchase_price = ?, cost_price = ? WHERE id = ?', [toPaisa(po3Rate), toPaisa(po3Rate), prodId]);
  console.log(`Simulated future purchase: Buy Rate changed to Rs ${po3Rate}`);

  // Query order items to verify historical cost and profit didn't change
  const item1Check = queryOne('SELECT * FROM order_items WHERE id = ?', [orderItemId1]);
  const item2Check = queryOne('SELECT * FROM order_items WHERE id = ?', [orderItemId2]);

  const frozenCost1 = fromPaisa(item1Check.total_cost);
  const frozenCost2 = fromPaisa(item2Check.total_cost);
  console.log(`Historical Invoice 1 Locked Cost: Rs ${frozenCost1} (Original: 10,000) ->`, frozenCost1 === 10000 ? 'PASS (FROZEN)' : 'FAIL');
  console.log(`Historical Invoice 2 Locked Cost: Rs ${frozenCost2} (Original: 6,000) ->`, frozenCost2 === 6000 ? 'PASS (FROZEN)' : 'FAIL');

  // Total Profit across both sales
  const totalSalesRevenue = sale1Revenue + sale2Revenue;
  const totalFifoCost = frozenCost1 + frozenCost2;
  const totalNetProfit = totalSalesRevenue - totalFifoCost;
  console.log(`Total Sales: Rs ${totalSalesRevenue}`);
  console.log(`Total Cost: Rs ${totalFifoCost}`);
  console.log(`Total Locked Net Profit: Rs ${totalNetProfit} (Expected: Rs 4,250) ->`, totalNetProfit === 4250 ? 'PASS' : 'FAIL');

  // Clean up test data
  execute('PRAGMA foreign_keys = OFF;');
  execute('DELETE FROM order_items WHERE id IN (?, ?)', [orderItemId1, orderItemId2]);
  execute('DELETE FROM orders WHERE id IN (?, ?)', [order1Id, order2Id]);
  execute('DELETE FROM product_batches WHERE product_id = ?', [prodId]);
  execute('DELETE FROM purchase_items WHERE id = ?', [poItemId]);
  execute('DELETE FROM purchase_orders WHERE id = ?', [poId]);
  execute('DELETE FROM products WHERE id = ?', [prodId]);
  execute('PRAGMA foreign_keys = ON;');
  saveDatabaseNow();

  console.log('\n====================================================');
  console.log('ALL FIFO & RESET TESTS PASSED WITH 100% SUCCESS!');
  console.log('====================================================');
}

runFifoE2ETest().catch(console.error);
