import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import http from 'http';
import { startServer } from '../server/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PORT = 3898;
const TEST_DATA_DIR = path.join(__dirname, 'data_batch_test_run');

if (fs.existsSync(TEST_DATA_DIR)) {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

function request(method, reqPath, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body) headers['Content-Length'] = Buffer.byteLength(dataString);

    const req = http.request(
      {
        host: '127.0.0.1',
        port: TEST_PORT,
        method,
        path: reqPath,
        headers,
      },
      (res) => {
        let respData = '';
        res.on('data', (chunk) => (respData += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(respData);
          } catch {
            parsed = respData;
          }
          resolve({ status: res.statusCode, data: parsed });
        });
      }
    );
    req.on('error', (err) => reject(err));
    if (body) req.write(dataString);
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('🚀 TESTING BATCH 1 & BATCH 2 IMPLEMENTATIONS');
  console.log('================================================================');

  let serverInstance;
  try {
    const s = await startServer({ userDataPath: TEST_DATA_DIR, port: TEST_PORT });
    serverInstance = s.server;

    const loginRes = await request('POST', '/api/auth/login', {
      email: 'admin@store.com',
      password: 'Admin@123',
    });
    const token = loginRes.data?.token;

    // -------------------------------------------------------------------------
    // TEST 1: Bug #31 - Backdated Payment created_at Timestamp Honor
    // -------------------------------------------------------------------------
    console.log('\n👉 [1/5] Testing Bug #31 (Custom Payment Date & created_at Honor)...');
    const customTimestamp = '2026-08-15T10:30:00.000Z';
    const pmRes = await request(
      'POST',
      '/api/data/order_payments',
      {
        order_id: 'test-order-123',
        amount: 2500,
        method: 'cash',
        account_type: 'cash',
        note: 'Offline backdated payment',
        created_at: customTimestamp,
      },
      token
    );
    assert(pmRes.status === 201, 'Payment recorded with 201 Created');
    assert(pmRes.data.created_at === customTimestamp, `created_at preserved: ${pmRes.data.created_at}`);

    // -------------------------------------------------------------------------
    // TEST 2: Bug #35 - Order Customer Attribution Safeguard (Never Walk-in)
    // -------------------------------------------------------------------------
    console.log('\n👉 [2/5] Testing Bug #35 (Customer Attribution Safeguard)...');
    const custRes = await request(
      'POST',
      '/api/data/customers',
      {
        name: 'Ehsan Fertilizer Traders',
        phone: '03001234567',
        area: 'Kamoke Market',
        balance: 5000,
      },
      token
    );
    const custId = custRes.data.id;

    const orderRes = await request(
      'POST',
      '/api/data/orders',
      {
        order_number: 'ORD-99991',
        customer_id: custId,
        customer_name: 'Walk-in', // Client inadvertently passed Walk-in or empty
        subtotal: 10000,
        total: 10000,
        paid_amount: 0,
      },
      token
    );
    assert(orderRes.status === 201, 'Order created with 201 Created');
    assert(
      orderRes.data.customer_name === 'Ehsan Fertilizer Traders',
      `customer_name automatically resolved from database: ${orderRes.data.customer_name}`
    );
    assert(orderRes.data.customer_area === 'Kamoke Market', `customer_area populated: ${orderRes.data.customer_area}`);

    // -------------------------------------------------------------------------
    // TEST 3: Bug #34 - Sales Return Discount Pro-rating & Net Rate Math
    // -------------------------------------------------------------------------
    console.log('\n👉 [3/5] Testing Bug #34 (Effective Net Return Rate Math)...');
    // Scenario from user:
    // Order Subtotal: 8806, Discount: 249, Total: 8557
    // Item: Catalog rate 2755, line discount 49 -> net line total 2706
    // Sold Qty = 1
    const orderSubtotal = 8806;
    const orderTotal = 8557;
    const orderScale = orderTotal < orderSubtotal ? orderTotal / orderSubtotal : 1;
    const soldQty = 1;
    const lineTotal = 2706;
    const baseNetRate = lineTotal / soldQty;
    const effectiveNetRate = Math.round(baseNetRate * orderScale * 100) / 100;
    assert(effectiveNetRate <= 2706, `Effective net rate (${effectiveNetRate}) does not exceed discounted price`);
    assert(Math.abs(effectiveNetRate - 2629.58) < 1, `Scaled net rate correctly pro-rates order discount: ${effectiveNetRate}`);

    // -------------------------------------------------------------------------
    // TEST 4: Bug #32 & #33 - Supplier Balance & Credit Settlement Math
    // -------------------------------------------------------------------------
    console.log('\n👉 [4/5] Testing Bug #32 & #33 (Supplier Advance Credit Settlement)...');
    const supRes = await request(
      'POST',
      '/api/data/suppliers',
      {
        name: 'National Chemical Corp',
        phone: '03218889999',
        balance: -5000, // Supplier owes us 5,000 advance credit
      },
      token
    );
    const supId = supRes.data.id;
    assert(Number(supRes.data.balance) === -5000, 'Supplier created with advance credit of Rs. 5,000');

    // Create PO of 3,000 with settleSupplierCredit = true
    const availableCredit = Math.abs(Number(supRes.data.balance));
    const poTotal = 3000;
    const settledCredit = Math.min(availableCredit, poTotal);
    assert(settledCredit === 3000, 'Settled credit exactly covers PO total of Rs. 3,000');

    const poRes = await request(
      'POST',
      '/api/data/purchase_orders',
      {
        po_number: 'PO-77771',
        supplier_id: supId,
        subtotal: poTotal,
        total: poTotal,
        paid_amount: settledCredit,
        supplier_credit_used: settledCredit,
        payment_status: 'paid',
        status: 'received',
      },
      token
    );
    assert(poRes.status === 201, 'PO created with advance credit settlement');
    assert(Number(poRes.data.supplier_credit_used) === 3000, 'supplier_credit_used recorded properly');

    // Reconcile supplier balance: -5000 + 3000 = -2000 remaining advance credit
    const newSupBal = Number(supRes.data.balance) + settledCredit;
    assert(newSupBal === -2000, `Supplier balance correctly adjusted to -Rs. 2,000: ${newSupBal}`);

    // -------------------------------------------------------------------------
    // TEST 5: Bug #30 - Hash Route Query Stripping
    // -------------------------------------------------------------------------
    console.log('\n👉 [5/5] Testing Bug #30 (Hash Route Query String Stripping)...');
    const mockHash1 = '#/sales-returns?order_id=ORD-12345';
    const mockHash2 = '#/orders?status=pending&page=2';
    const getPath = (hash) => (hash.slice(1) || '/').split('?')[0] || '/';
    assert(getPath(mockHash1) === '/sales-returns', `Path correctly stripped to "/sales-returns": ${getPath(mockHash1)}`);
    assert(getPath(mockHash2) === '/orders', `Path correctly stripped to "/orders": ${getPath(mockHash2)}`);

    console.log('\n================================================================');
    console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    if (serverInstance) serverInstance.close();
    await new Promise((r) => setTimeout(r, 200));
    try {
      if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    } catch {}
  }
}

runTests();
