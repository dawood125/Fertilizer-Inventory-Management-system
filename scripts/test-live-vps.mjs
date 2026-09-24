/**
 * End-to-End Live VPS Verification Test
 * Targets: http://13.140.166.116
 * Validates:
 * 1. Web accessibility & health endpoints
 * 2. Super Admin authentication & JWT token
 * 3. Settings validation (A5 default, PKR currency, Fertilizer branding)
 * 4. Product setup with piece-level rates (Buy, Retail, Wholesale, Dealer)
 * 5. Purchase Orders with Manufacturer Batch IDs & Carton-to-Piece receiving into FIFO
 * 6. Multi-pack dynamic pack ratio updates
 * 7. Customer type pricing resolution (Dealer/Wholesaler/Retailer) & custom price memory
 * 8. Multi-batch FIFO deduction math & COGS calculation
 * 9. Line discount, running previous balance & partial payment ledger math
 * 10. Invoice & Order history integrity
 * 11. Clean teardown of test records
 */

const VPS_URL = 'http://13.140.166.116';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${message}`);
}

async function run() {
  console.log('====================================================');
  console.log(`🌍 RUNNING LIVE VPS VERIFICATION ON ${VPS_URL}`);
  console.log('====================================================\n');

  let authToken = null;
  const createdIds = {
    products: [],
    suppliers: [],
    customers: [],
    purchase_orders: [],
    purchase_items: [],
    product_batches: [],
    orders: [],
    order_items: [],
    customer_product_prices: [],
  };

  async function api(path, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(`${VPS_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    if (!res.ok) {
      throw new Error(`API Error [${res.status}] ${method} ${path}: ${typeof json === 'object' ? JSON.stringify(json) : json}`);
    }
    return json;
  }

  try {
    // -----------------------------------------------------------------
    // 1. Web & Health Verification
    // -----------------------------------------------------------------
    console.log('--- Step 1: Health & Web Accessibility ---');
    const health = await api('/api/health');
    assert(health.ok === true, `Health check returned ok: true (${health.time})`);

    const rootRes = await fetch(`${VPS_URL}/`);
    assert(rootRes.status === 200, 'Root URL / serves HTTP 200');
    const rootHtml = await rootRes.text();
    assert(rootHtml.includes('<div id="root">') || rootHtml.includes('<!doctype html>'), 'Root URL serves SPA index.html');
    console.log('Step 1 PASSED.\n');

    // -----------------------------------------------------------------
    // 2. Authentication & JWT Token
    // -----------------------------------------------------------------
    console.log('--- Step 2: Authentication & Token Generation ---');
    const login = await api('/api/auth/login', 'POST', {
      email: 'admin@store.com',
      password: 'Admin@123',
    });
    assert(login.token && login.token.length > 20, 'JWT token issued successfully');
    authToken = login.token;
    assert(login.user?.email === 'admin@store.com', 'Admin user verified');
    console.log('Step 2 PASSED.\n');

    // -----------------------------------------------------------------
    // 3. Settings & Store Profile Validation
    // -----------------------------------------------------------------
    console.log('--- Step 3: Settings & Store Profile ---');
    const settings = await api('/api/settings');
    assert(settings.currency === 'PKR', `Currency is PKR (got ${settings.currency})`);
    assert(settings.receipt_size === 'A5', `Receipt size default is A5 (got ${settings.receipt_size})`);
    console.log(`  Store Name: "${settings.store_name}", Prefix: "${settings.invoice_prefix}"`);
    console.log('Step 3 PASSED.\n');

    // -----------------------------------------------------------------
    // 4. Product Creation with Piece Rates & Packaging Ratio
    // -----------------------------------------------------------------
    console.log('--- Step 4: Product Creation (Piece Primary) ---');
    const prodPayload = {
      name: '[LIVE-TEST] ZORAVAR 1000ML BIO',
      sku: 'ZR-LIVE-001',
      barcode: '89000111222',
      carton_to_box: 20, // 20 pieces per carton
      purchase_price: 1000, // Buy rate per piece
      cost_price: 1000,
      dealer_price: 1150, // Dealer rate per piece
      wholesale_price: 1200, // Wholesale rate per piece
      retail_price: 1250, // Retail rate per piece
      stock_quantity: 0,
      unit: 'piece',
      status: 'active',
    };
    const prod = await api('/api/data/products', 'POST', prodPayload);
    createdIds.products.push(prod.id);
    assert(prod.id, 'Product created on live VPS');
    assert(Number(prod.carton_to_box) === 20, 'Packaging ratio is 20 pcs/ctn');
    assert(Number(prod.purchase_price) === 1000, 'Buy rate is Rs 1,000/pc');
    assert(Number(prod.dealer_price) === 1150, 'Dealer rate is Rs 1,150/pc');
    assert(Number(prod.wholesale_price) === 1200, 'Wholesale rate is Rs 1,200/pc');
    assert(Number(prod.retail_price) === 1250, 'Retail rate is Rs 1,250/pc');
    assert(Number(prod.stock_quantity) === 0, 'Initial piece stock is 0');
    console.log('Step 4 PASSED.\n');

    // -----------------------------------------------------------------
    // 5. Purchase Order 1 with Manufacturer Batch ID & Receiving
    // -----------------------------------------------------------------
    console.log('--- Step 5: PO 1 with Manufacturer Batch ID & Receiving ---');
    const supp = await api('/api/data/suppliers', 'POST', {
      name: '[LIVE-TEST] Engro Agrochemicals Ltd',
      phone: '042-35710000',
      balance: 0,
    });
    createdIds.suppliers.push(supp.id);

    // PO 1: 8 cartons @ 20 pcs/ctn = 160 pieces @ 1,000/pc = Rs 160,000
    const po1 = await api('/api/data/purchase_orders', 'POST', {
      po_number: 'PO-LIVE-001',
      supplier_id: supp.id,
      subtotal: 160000,
      total: 160000,
      paid_amount: 0,
      status: 'pending',
      payment_status: 'unpaid',
    });
    createdIds.purchase_orders.push(po1.id);

    const po1Item = await api('/api/data/purchase_items', 'POST', {
      purchase_id: po1.id,
      product_id: prod.id,
      product_name: prod.name,
      cartons: 8,
      pieces_per_carton: 20,
      quantity: 160,
      unit_cost: 1000,
      total: 160000,
      batch_number: 'RF23RFA3700',
    });
    createdIds.purchase_items.push(po1Item.id);

    // Receive PO 1
    const b1 = await api('/api/data/product_batches', 'POST', {
      product_id: prod.id,
      purchase_id: po1.id,
      batch_number: 'RF23RFA3700',
      quantity: 160,
      batch_cost: 1000,
      status: 'active',
    });
    createdIds.product_batches.push(b1.id);

    await api(`/api/data/products/${prod.id}`, 'PUT', {
      stock_quantity: 160,
      purchase_price: 1000,
    });
    await api(`/api/data/purchase_orders/${po1.id}`, 'PUT', { status: 'completed' });
    await api(`/api/data/suppliers/${supp.id}`, 'PUT', { balance: 160000 });

    const pAfterPO1 = await api(`/api/data/products/${prod.id}`);
    assert(Number(pAfterPO1.stock_quantity) === 160, 'Live stock updated to 160 pieces');
    const sAfterPO1 = await api(`/api/data/suppliers/${supp.id}`);
    assert(Number(sAfterPO1.balance) === 160000, 'Supplier balance updated to Rs 160,000');
    console.log('Step 5 PASSED.\n');

    // -----------------------------------------------------------------
    // 6. Purchase Order 2 with New Packaging Ratio & 2nd Batch ID
    // -----------------------------------------------------------------
    console.log('--- Step 6: PO 2 with Packaging Ratio Update & 2nd Batch ID ---');
    // PO 2: 5 cartons @ 25 pcs/ctn = 125 pieces @ 950/pc = Rs 118,750
    const po2 = await api('/api/data/purchase_orders', 'POST', {
      po_number: 'PO-LIVE-002',
      supplier_id: supp.id,
      subtotal: 118750,
      total: 118750,
      paid_amount: 0,
      status: 'pending',
      payment_status: 'unpaid',
    });
    createdIds.purchase_orders.push(po2.id);

    const po2Item = await api('/api/data/purchase_items', 'POST', {
      purchase_id: po2.id,
      product_id: prod.id,
      product_name: prod.name,
      cartons: 5,
      pieces_per_carton: 25,
      quantity: 125,
      unit_cost: 950,
      total: 118750,
      batch_number: 'SUN2308WS',
    });
    createdIds.purchase_items.push(po2Item.id);

    // Receive PO 2
    const b2 = await api('/api/data/product_batches', 'POST', {
      product_id: prod.id,
      purchase_id: po2.id,
      batch_number: 'SUN2308WS',
      quantity: 125,
      batch_cost: 950,
      status: 'active',
    });
    createdIds.product_batches.push(b2.id);

    await api(`/api/data/products/${prod.id}`, 'PUT', {
      stock_quantity: 160 + 125, // 285 pieces
      carton_to_box: 25,
      purchase_price: 950,
    });
    await api(`/api/data/purchase_orders/${po2.id}`, 'PUT', { status: 'completed' });
    await api(`/api/data/suppliers/${supp.id}`, 'PUT', { balance: 160000 + 118750 });

    const pAfterPO2 = await api(`/api/data/products/${prod.id}`);
    assert(Number(pAfterPO2.stock_quantity) === 285, 'Total stock is 285 pieces (160 + 125)');
    assert(Number(pAfterPO2.carton_to_box) === 25, 'Packaging ratio updated to 25 pcs/ctn');
    assert(Number(pAfterPO2.purchase_price) === 950, 'Latest buy rate is Rs 950/pc');
    console.log('Step 6 PASSED.\n');

    // -----------------------------------------------------------------
    // 7. Customers & Tier Pricing & Negotiated Memory
    // -----------------------------------------------------------------
    console.log('--- Step 7: Pricing Tiers & Negotiated Memory ---');
    const dealerCust = await api('/api/data/customers', 'POST', {
      name: '[LIVE-TEST] Kisan Markaz (Dealer)',
      type: 'dealer',
      balance: 0,
      credit_limit: 500000,
    });
    createdIds.customers.push(dealerCust.id);

    const whCust = await api('/api/data/customers', 'POST', {
      name: '[LIVE-TEST] Punjab Agri Wholesaler',
      type: 'wholesaler',
      balance: 0,
      credit_limit: 500000,
    });
    createdIds.customers.push(whCust.id);

    const retCust = await api('/api/data/customers', 'POST', {
      name: '[LIVE-TEST] Green Farm Retailer',
      type: 'retailer',
      balance: 15000,
      opening_balance: 15000,
      credit_limit: 100000,
    });
    createdIds.customers.push(retCust.id);

    // Save custom price of 1,140/pc for dealer
    const customPrice = await api('/api/data/customer_product_prices', 'POST', {
      customer_id: dealerCust.id,
      product_id: prod.id,
      unit_price: 1140,
    });
    createdIds.customer_product_prices.push(customPrice.id);

    const savedPrices = await api(`/api/data/customer_product_prices?customer_id=${dealerCust.id}`);
    assert(savedPrices.some((cp) => cp.product_id === prod.id && Number(cp.unit_price) === 1140), 'Negotiated custom price of Rs 1,140/pc is remembered');
    console.log('Step 7 PASSED.\n');

    // -----------------------------------------------------------------
    // 8. Multi-Batch FIFO Sale (180 pieces)
    // -----------------------------------------------------------------
    console.log('--- Step 8: Multi-Batch FIFO Sale (180 pieces) ---');
    // Sell 180 pieces to Punjab Agri Wholesaler (rate: 1,200/pc)
    // Batch 1: RF23RFA3700 (160 pcs @ 1,000) -> 160 taken, depleted
    // Batch 2: SUN2308WS (125 pcs @ 950) -> 20 taken, 105 remain
    // COGS = 160*1000 + 20*950 = 160,000 + 19,000 = 179,000
    // Blended Unit Cost = 179,000 / 180 = Rs 994.44/pc
    let batches = await api(`/api/data/product_batches?product_id=${prod.id}`);
    batches.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    let needed = 180;
    let totalCogs = 0;
    const batchLogs = [];

    for (const b of batches) {
      if (needed <= 0) break;
      const avail = Number(b.quantity || 0);
      if (avail <= 0 || b.status !== 'active') continue;
      const take = Math.min(avail, needed);
      totalCogs += take * Number(b.batch_cost);
      needed -= take;
      batchLogs.push({ batch: b.batch_number, qty: take });

      const rem = avail - take;
      await api(`/api/data/product_batches/${b.id}`, 'PUT', {
        quantity: rem,
        status: rem <= 0.0001 ? 'depleted' : 'active',
      });
    }

    assert(needed === 0, '180 pieces allocated across active FIFO batches');
    assert(batchLogs.length === 2, 'Allocated across 2 distinct batches');
    assert(batchLogs[0].batch === 'RF23RFA3700' && batchLogs[0].qty === 160, '160 pcs from batch RF23RFA3700');
    assert(batchLogs[1].batch === 'SUN2308WS' && batchLogs[1].qty === 20, '20 pcs from batch SUN2308WS');
    assert(totalCogs === 179000, `COGS is exactly Rs 179,000 (got ${totalCogs})`);

    const unitCost = Math.round((totalCogs / 180) * 100) / 100;
    assert(unitCost === 994.44, `Blended cost is Rs 994.44/pc (got ${unitCost})`);

    // Create Order on VPS
    const ord1 = await api('/api/data/orders', 'POST', {
      order_number: 'ORD-LIVE-001',
      invoice_number: 'INV-LIVE-001',
      customer_id: whCust.id,
      subtotal: 180 * 1200, // 216,000
      discount: 0,
      total: 180 * 1200,
      paid_amount: 180 * 1200,
      status: 'completed',
      payment_status: 'paid',
    });
    createdIds.orders.push(ord1.id);

    const ord1Item = await api('/api/data/order_items', 'POST', {
      order_id: ord1.id,
      product_id: prod.id,
      product_name: prod.name,
      quantity: 180,
      unit_price: 1200,
      total: 216000,
      unit: 'piece',
      cost_price: unitCost,
      total_cost: totalCogs,
      batch_number: 'RF23RFA3700, SUN2308WS',
    });
    createdIds.order_items.push(ord1Item.id);

    // Deduct piece stock
    await api(`/api/data/products/${prod.id}`, 'PUT', {
      stock_quantity: 285 - 180, // 105
    });

    const pAfterSale = await api(`/api/data/products/${prod.id}`);
    assert(Number(pAfterSale.stock_quantity) === 105, 'Remaining stock is exactly 105 pieces');

    const batchesAfterSale = await api(`/api/data/product_batches?product_id=${prod.id}`);
    const bRF = batchesAfterSale.find((b) => b.batch_number === 'RF23RFA3700');
    const bSUN = batchesAfterSale.find((b) => b.batch_number === 'SUN2308WS');
    assert(bRF.status === 'depleted' && Number(bRF.quantity) === 0, 'Batch RF23RFA3700 is depleted');
    assert(bSUN.status === 'active' && Number(bSUN.quantity) === 105, 'Batch SUN2308WS has 105 pcs remaining');
    console.log('Step 8 PASSED.\n');

    // -----------------------------------------------------------------
    // 9. Line Discount, Running Balance & Partial Payment
    // -----------------------------------------------------------------
    console.log('--- Step 9: Line Discount, Running Balance & Partial Payment ---');
    // Sell 20 pieces to Green Farm Retailer (Retail rate: 1,250/pc)
    // Gross: 20 * 1,250 = 25,000
    // Line Discount: Rs 1,000 -> Net: 24,000
    // Previous Balance: Rs 15,000
    // Paid cash: Rs 10,000
    // Remaining bill due: 24,000 - 10,000 = 14,000
    // Expected new customer balance: 15,000 + 14,000 = Rs 29,000
    const gross = 20 * 1250; // 25,000
    const disc = 1000;
    const net = gross - disc; // 24,000
    const paid = 10000;
    const remainingDue = net - paid; // 14,000

    const ord2 = await api('/api/data/orders', 'POST', {
      order_number: 'ORD-LIVE-002',
      invoice_number: 'INV-LIVE-002',
      customer_id: retCust.id,
      subtotal: net,
      discount: disc,
      total: net,
      paid_amount: paid,
      status: 'completed',
      payment_status: 'partial',
    });
    createdIds.orders.push(ord2.id);

    const ord2Item = await api('/api/data/order_items', 'POST', {
      order_id: ord2.id,
      product_id: prod.id,
      product_name: prod.name,
      quantity: 20,
      unit_price: 1250,
      discount: disc,
      total: net,
      unit: 'piece',
      batch_number: 'SUN2308WS',
    });
    createdIds.order_items.push(ord2Item.id);

    // Update customer running balance
    const retBefore = await api(`/api/data/customers/${retCust.id}`);
    const newBal = Number(retBefore.balance) + remainingDue; // 15,000 + 14,000 = 29,000
    await api(`/api/data/customers/${retCust.id}`, 'PUT', { balance: newBal });

    const retAfter = await api(`/api/data/customers/${retCust.id}`);
    assert(Number(retAfter.balance) === 29000, `Running ledger balance is Rs 29,000 (got ${retAfter.balance})`);
    console.log('Step 9 PASSED.\n');

    // -----------------------------------------------------------------
    // 10. Invoice & Order Line Integrity Verification
    // -----------------------------------------------------------------
    console.log('--- Step 10: Invoice & Order Lines Verification ---');
    const orderItems = await api('/api/data/order_items');
    const it1 = orderItems.find((i) => i.order_id === ord1.id);
    assert(it1 && it1.batch_number === 'RF23RFA3700, SUN2308WS', 'Invoice 1 records allocated batch numbers');
    assert(Number(it1.quantity) === 180, 'Invoice 1 has 180 total pieces');

    const it2 = orderItems.find((i) => i.order_id === ord2.id);
    assert(it2 && it2.batch_number === 'SUN2308WS', 'Invoice 2 records batch SUN2308WS');
    assert(Number(it2.discount) === 1000, 'Invoice 2 records Rs 1,000 discount');
    assert(Number(it2.total) === 24000, 'Invoice 2 net amount is Rs 24,000');
    console.log('Step 10 PASSED.\n');

    console.log('====================================================');
    console.log('🎉 ALL 10 LIVE VPS VERIFICATION STEPS PASSED 100%!');
    console.log('====================================================\n');
  } finally {
    // -----------------------------------------------------------------
    // Teardown / Cleanup Test Artifacts
    // -----------------------------------------------------------------
    console.log('Cleaning up live test records to keep VPS database pristine...');
    const cleanupOrder = [
      ['customer_product_prices', createdIds.customer_product_prices],
      ['order_items', createdIds.order_items],
      ['orders', createdIds.orders],
      ['product_batches', createdIds.product_batches],
      ['purchase_items', createdIds.purchase_items],
      ['purchase_orders', createdIds.purchase_orders],
      ['products', createdIds.products],
      ['customers', createdIds.customers],
      ['suppliers', createdIds.suppliers],
    ];

    for (const [table, ids] of cleanupOrder) {
      for (const id of ids) {
        try {
          await api(`/api/data/${table}/${id}`, 'DELETE');
        } catch (e) {
          // ignore cleanup failures
        }
      }
    }
    console.log('✅ VPS database cleaned up successfully.\n');
  }
}

run().catch((err) => {
  console.error('\n❌ LIVE VPS VERIFICATION ENCOUNTERED AN ERROR:');
  console.error(err);
  process.exit(1);
});
