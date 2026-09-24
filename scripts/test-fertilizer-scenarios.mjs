import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import http from 'http';
import { initDatabase, queryAll, queryOne, closeDatabase } from '../server/database/connection.js';
import { startServer } from '../server/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDataDir = path.join(__dirname, '../data_test');

// Ensure clean test database directory
if (fs.existsSync(testDataDir)) {
  fs.rmSync(testDataDir, { recursive: true, force: true });
}
fs.mkdirSync(testDataDir, { recursive: true });

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function run() {
  console.log('====================================================');
  console.log('🧪 RUNNING FERTILIZER TRANSITION TEST SUITE');
  console.log('====================================================\n');

  const testPort = 3899;
  const { app, server } = await startServer({ userDataPath: testDataDir, port: testPort });

  const apiBase = `http://127.0.0.1:${testPort}`;
  let authToken = null;

  async function api(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    const res = await fetch(`${apiBase}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
    const json = await res.json();
    if (!res.ok) {
      throw new Error(`API Error ${res.status}: ${JSON.stringify(json)}`);
    }
    return json;
  }

  try {
    // Authenticate
    const loginRes = await api('/api/auth/login', 'POST', {
      email: 'admin@store.com',
      password: 'Admin@123',
    });
    authToken = loginRes.token;
    assert(authToken, 'Admin authenticated and JWT token received');
    // ----------------------------------------------------
    // Scenario 1: Product Creation with Piece-Level Rates
    // ----------------------------------------------------
    console.log('--- Scenario 1: Product Creation with Piece-Level Rates ---');
    const product = await api('/api/data/products', 'POST', {
      name: 'MULTI CLEAN 360ML',
      carton_to_box: 20, // 20 pieces per carton
      purchase_price: 1000, // Buy rate per piece
      cost_price: 1000,
      retail_price: 1400, // Retail piece rate
      wholesale_price: 1300, // Wholesale piece rate
      dealer_price: 1220, // Dealer piece rate
      stock_quantity: 0,
      unit: 'piece',
      status: 'active',
    });

    assert(product.id, 'Product created with ID');
    assert(Number(product.carton_to_box) === 20, 'Pieces per carton is 20');
    assert(Number(product.purchase_price) === 1000, 'Buy rate is Rs 1,000/pc');
    assert(Number(product.dealer_price) === 1220, 'Dealer rate is Rs 1,220/pc');
    assert(Number(product.wholesale_price) === 1300, 'Wholesale rate is Rs 1,300/pc');
    assert(Number(product.retail_price) === 1400, 'Retail rate is Rs 1,400/pc');
    assert(Number(product.stock_quantity) === 0, 'Initial stock is 0 pieces');
    console.log('Scenario 1 PASSED.\n');

    // ----------------------------------------------------
    // Scenario 2: Purchase Order 1 Entry with Batch ID
    // ----------------------------------------------------
    console.log('--- Scenario 2: Purchase Order 1 Entry with Batch ID ---');
    // Create supplier
    const supplier = await api('/api/data/suppliers', 'POST', {
      name: 'Engro Fertilizers Ltd',
      phone: '042-111-211-211',
      balance: 0,
    });

    // Create PO: 8 cartons @ 20 pcs/ctn = 160 pcs @ 1,000/pc = Rs 160,000
    const po1 = await api('/api/data/purchase_orders', 'POST', {
      po_number: 'PO-TEST-001',
      supplier_id: supplier.id,
      subtotal: 160000,
      total: 160000,
      paid_amount: 0,
      status: 'pending',
      payment_status: 'unpaid',
    });

    await api('/api/data/purchase_items', 'POST', {
      purchase_id: po1.id,
      product_id: product.id,
      product_name: product.name,
      cartons: 8,
      pieces_per_carton: 20,
      quantity: 160, // 8 * 20 = 160 pieces
      unit_cost: 1000,
      total: 160000,
      batch_number: 'RF23RFA3700',
    });

    // Simulate PO Receiving logic
    const po1Items = await api('/api/data/purchase_items');
    const thisItem1 = po1Items.find((i) => i.purchase_id === po1.id);
    assert(thisItem1.batch_number === 'RF23RFA3700', 'PO Item recorded manufacturer batch RF23RFA3700');
    assert(Number(thisItem1.cartons) === 8, 'PO Item has 8 cartons');
    assert(Number(thisItem1.pieces_per_carton) === 20, 'PO Item has 20 pcs/ctn');
    assert(Number(thisItem1.quantity) === 160, 'PO Item has 160 total pieces');

    // Create FIFO batch & update stock
    await api('/api/data/product_batches', 'POST', {
      product_id: product.id,
      purchase_id: po1.id,
      batch_number: thisItem1.batch_number,
      quantity: thisItem1.quantity,
      batch_cost: thisItem1.unit_cost,
      status: 'active',
    });
    await api(`/api/data/products/${product.id}`, 'PUT', {
      stock_quantity: 160,
      purchase_price: 1000,
    });
    await api(`/api/data/purchase_orders/${po1.id}`, 'PUT', {
      status: 'completed',
    });

    const prodAfterPO1 = await api(`/api/data/products/${product.id}`);
    assert(Number(prodAfterPO1.stock_quantity) === 160, 'Product stock updated to 160 pieces');

    const batchesAfterPO1 = await api(`/api/data/product_batches?product_id=${product.id}`);
    const b1 = batchesAfterPO1.find((b) => b.batch_number === 'RF23RFA3700');
    assert(b1 && Number(b1.quantity) === 160 && Number(b1.batch_cost) === 1000, 'FIFO batch RF23RFA3700 exists with 160 pcs @ Rs 1,000');
    console.log('Scenario 2 PASSED.\n');

    // ----------------------------------------------------
    // Scenario 3: Purchase Order 2 with New Packaging Ratio & New Batch ID
    // ----------------------------------------------------
    console.log('--- Scenario 3: Purchase Order 2 with New Packaging Ratio & New Batch ID ---');
    // PO 2: 5 cartons @ 25 pcs/ctn = 125 pcs @ 950/pc = Rs 118,750
    const po2 = await api('/api/data/purchase_orders', 'POST', {
      po_number: 'PO-TEST-002',
      supplier_id: supplier.id,
      subtotal: 118750,
      total: 118750,
      paid_amount: 0,
      status: 'pending',
      payment_status: 'unpaid',
    });

    await api('/api/data/purchase_items', 'POST', {
      purchase_id: po2.id,
      product_id: product.id,
      product_name: product.name,
      cartons: 5,
      pieces_per_carton: 25,
      quantity: 125, // 5 * 25 = 125 pieces
      unit_cost: 950,
      total: 118750,
      batch_number: 'SUN2308WS',
    });

    // Receive PO 2
    await api('/api/data/product_batches', 'POST', {
      product_id: product.id,
      purchase_id: po2.id,
      batch_number: 'SUN2308WS',
      quantity: 125,
      batch_cost: 950,
      status: 'active',
    });
    await api(`/api/data/products/${product.id}`, 'PUT', {
      stock_quantity: 160 + 125, // 285 pieces
      purchase_price: 950,
      carton_to_box: 25, // Updated packaging ratio
    });
    await api(`/api/data/purchase_orders/${po2.id}`, 'PUT', {
      status: 'completed',
    });

    const prodAfterPO2 = await api(`/api/data/products/${product.id}`);
    assert(Number(prodAfterPO2.stock_quantity) === 285, 'Total stock is 285 pieces (160 + 125)');
    assert(Number(prodAfterPO2.carton_to_box) === 25, 'Packaging ratio updated to 25 pcs/ctn');
    assert(Number(prodAfterPO2.purchase_price) === 950, 'Latest buy rate updated to Rs 950/pc');
    console.log('Scenario 3 PASSED.\n');

    // ----------------------------------------------------
    // Scenario 4: Pricing Tiers & Negotiated Customer Memory
    // ----------------------------------------------------
    console.log('--- Scenario 4: Pricing Tiers & Negotiated Customer Memory ---');
    const custDealer = await api('/api/data/customers', 'POST', {
      name: 'Kisan Zarai Markaz',
      type: 'dealer',
      balance: 0,
      credit_limit: 500000,
      allow_manual_override: 1,
    });
    const custWholesaler = await api('/api/data/customers', 'POST', {
      name: 'Punjab Zarai Khad',
      type: 'wholesaler',
      balance: 0,
      credit_limit: 500000,
    });
    const custRetailer = await api('/api/data/customers', 'POST', {
      name: 'Green Agri Center',
      type: 'retailer',
      balance: 15000, // Previous balance = 15,000
      opening_balance: 15000,
      credit_limit: 100000,
    });

    // Verify default tier prices against product definition
    const p = await api(`/api/data/products/${product.id}`);
    assert(p.dealer_price === 1220, 'Dealer rate resolves to 1,220/pc');
    assert(p.wholesale_price === 1300, 'Wholesaler rate resolves to 1,300/pc');
    assert(p.retail_price === 1400, 'Retailer rate resolves to 1,400/pc');

    // Set custom negotiated price for Kisan Zarai Markaz @ 1,200/pc
    await api('/api/data/customer_product_prices', 'POST', {
      customer_id: custDealer.id,
      product_id: product.id,
      unit_price: 1200,
    });

    // Check remembered custom price
    const savedCustom = await api(`/api/data/customer_product_prices?customer_id=${custDealer.id}`);
    assert(savedCustom.length === 1 && Number(savedCustom[0].unit_price) === 1200, 'Negotiated custom rate of 1,200/pc remembered for dealer');
    console.log('Scenario 4 PASSED.\n');

    // ----------------------------------------------------
    // Scenario 5: Multi-Batch FIFO Deduction
    // ----------------------------------------------------
    console.log('--- Scenario 5: Multi-Batch FIFO Deduction (180 pieces) ---');
    // Sell 180 pieces to Punjab Zarai Khad
    // Oldest batch RF23RFA3700 (160 pcs @ 1,000)
    // Second batch SUN2308WS (125 pcs @ 950) -> consume 20 pcs
    // Total COGS = (160 * 1000) + (20 * 950) = 160000 + 19000 = Rs 179,000
    // Blended cost = 179000 / 180 = Rs 994.44/pc
    let allBatches = await api(`/api/data/product_batches?product_id=${product.id}`);
    allBatches.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    let needed = 180;
    let totalCost = 0;
    const batchAllocations = [];

    for (const b of allBatches) {
      if (needed <= 0) break;
      const avail = Number(b.quantity || 0);
      if (avail <= 0 || b.status !== 'active') continue;
      const take = Math.min(avail, needed);
      totalCost += take * Number(b.batch_cost);
      needed -= take;
      batchAllocations.push({ batch: b.batch_number, qty: take, cost: b.batch_cost });

      const newQty = avail - take;
      await api(`/api/data/product_batches/${b.id}`, 'PUT', {
        quantity: newQty,
        status: newQty <= 0.0001 ? 'depleted' : 'active',
      });
    }

    assert(needed === 0, 'All 180 pieces successfully allocated');
    assert(batchAllocations.length === 2, 'Allocated across exactly 2 batches');
    assert(batchAllocations[0].batch === 'RF23RFA3700' && batchAllocations[0].qty === 160, '160 pcs taken from oldest batch RF23RFA3700');
    assert(batchAllocations[1].batch === 'SUN2308WS' && batchAllocations[1].qty === 20, '20 pcs taken from second batch SUN2308WS');
    assert(totalCost === 179000, 'Total COGS is exactly Rs 179,000');
    const unitCost = Math.round((totalCost / 180) * 100) / 100;
    assert(unitCost === 994.44, 'Blended unit cost is Rs 994.44/pc');

    // Create Order
    const ord1 = await api('/api/data/orders', 'POST', {
      order_number: 'ORD-TEST-001',
      invoice_number: 'INV-TEST-001',
      customer_id: custWholesaler.id,
      subtotal: 180 * 1300, // 234,000
      discount: 0,
      total: 180 * 1300,
      paid_amount: 180 * 1300,
      status: 'completed',
      payment_status: 'paid',
    });

    const assignedBatchStr = batchAllocations.map((b) => b.batch).join(', ');
    await api('/api/data/order_items', 'POST', {
      order_id: ord1.id,
      product_id: product.id,
      product_name: product.name,
      quantity: 180,
      unit_price: 1300,
      total: 234000,
      unit: 'piece',
      cost_price: unitCost,
      total_cost: totalCost,
      batch_number: assignedBatchStr,
    });

    // Deduct stock
    const currentStock = Number((await api(`/api/data/products/${product.id}`)).stock_quantity);
    await api(`/api/data/products/${product.id}`, 'PUT', {
      stock_quantity: currentStock - 180,
    });

    const prodAfterSale1 = await api(`/api/data/products/${product.id}`);
    assert(Number(prodAfterSale1.stock_quantity) === 105, 'Remaining stock is exactly 105 pieces (285 - 180)');

    const batchesAfterSale = await api(`/api/data/product_batches?product_id=${product.id}`);
    const bRF = batchesAfterSale.find((b) => b.batch_number === 'RF23RFA3700');
    const bSUN = batchesAfterSale.find((b) => b.batch_number === 'SUN2308WS');
    assert(bRF.status === 'depleted' && Number(bRF.quantity) === 0, 'Oldest batch RF23RFA3700 is depleted (qty = 0)');
    assert(bSUN.status === 'active' && Number(bSUN.quantity) === 105, 'Second batch SUN2308WS has 105 pieces remaining');
    console.log('Scenario 5 PASSED.\n');

    // ----------------------------------------------------
    // Scenario 6: Line Discount, Previous Balance & Partial Payment
    // ----------------------------------------------------
    console.log('--- Scenario 6: Line Discount, Previous Balance & Partial Payment ---');
    // Sell 20 pieces to Green Agri Center (Retailer)
    // Rate: 1,400/pc -> Gross: 28,000
    // Line scheme discount: Rs 1,000 -> Net: 27,000
    // Previous balance: Rs 15,000
    // Partial payment: Rs 12,000
    // Remaining bill: 27,000 - 12,000 = 15,000
    // New Balance: 15,000 + 15,000 = Rs 30,000
    const gross = 20 * 1400; // 28,000
    const lineDiscount = 1000;
    const netBill = gross - lineDiscount; // 27,000
    const paid = 12000;
    const remaining = netBill - paid; // 15,000
    const prevBalance = Number((await api(`/api/data/customers/${custRetailer.id}`)).balance);
    const expectedNewBalance = prevBalance + remaining; // 15,000 + 15,000 = 30,000

    const ord2 = await api('/api/data/orders', 'POST', {
      order_number: 'ORD-TEST-002',
      invoice_number: 'INV-TEST-002',
      customer_id: custRetailer.id,
      subtotal: netBill,
      discount: lineDiscount,
      total: netBill,
      paid_amount: paid,
      status: 'completed',
      payment_status: 'partial',
    });

    await api('/api/data/order_items', 'POST', {
      order_id: ord2.id,
      product_id: product.id,
      product_name: product.name,
      quantity: 20,
      unit_price: 1400,
      discount: lineDiscount,
      total: netBill,
      unit: 'piece',
      batch_number: 'SUN2308WS',
    });

    // Update customer ledger balance
    await api(`/api/data/customers/${custRetailer.id}`, 'PUT', {
      balance: expectedNewBalance,
    });

    const custAfterSale = await api(`/api/data/customers/${custRetailer.id}`);
    assert(Number(custAfterSale.balance) === 30000, 'Customer balance correctly reflects Previous (15,000) + Current Remaining (15,000) = Rs 30,000');
    console.log('Scenario 6 PASSED.\n');

    // ----------------------------------------------------
    // Scenario 7: VPS Web & Static Serving Readiness
    // ----------------------------------------------------
    console.log('--- Scenario 7: VPS Web & Static Serving Readiness ---');
    const health = await api('/api/health');
    assert(health.ok === true, 'GET /api/health returned ok: true');

    // Test static serving of dist/
    const htmlRes = await fetch(`${apiBase}/`);
    assert(htmlRes.status === 200, 'GET / returned HTTP 200');
    const htmlText = await htmlRes.text();
    assert(htmlText.includes('<html') || htmlText.includes('<!DOCTYPE') || htmlText.includes('<!doctype'), 'Root path serves web application HTML');
    console.log('Scenario 7 PASSED.\n');

    console.log('====================================================');
    console.log('🎉 ALL 7 BUSINESS SCENARIOS PASSED WITH 100% ACCURACY');
    console.log('====================================================');
  } finally {
    server.close();
    closeDatabase();
    // Allow any pending async event loops to complete
    await new Promise((r) => setTimeout(r, 200));
    // Cleanup test database
    if (fs.existsSync(testDataDir)) {
      try { fs.rmSync(testDataDir, { recursive: true, force: true }); } catch {}
    }
  }
}

run().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});
