import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import http from 'http';
import { startServer } from '../server/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PORT = 3897;
const TEST_DATA_DIR = path.join(__dirname, 'data_test_opening_bal');

if (fs.existsSync(TEST_DATA_DIR)) {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

function request(method, path, body = null, token = null) {
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
        path,
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

async function run() {
  console.log('🚀 Starting server on port', TEST_PORT);
  const s = await startServer({ userDataPath: TEST_DATA_DIR, port: TEST_PORT });
  const server = s.server;

  try {
    // 1. Authenticate as admin
    const loginRes = await request('POST', '/api/auth/login', {
      email: 'admin@store.com',
      password: 'Admin@123',
    });
    assert(loginRes.status === 200 && loginRes.data?.token, 'Admin login successful');
    const token = loginRes.data.token;

    // Fetch initial accounts
    const accsRes = await request('GET', '/api/data/payment_accounts', null, token);
    const cashAcc = (accsRes.data || []).find((a) => a.type === 'cash') || accsRes.data[0];
    const initialCash = Number(cashAcc?.balance || 0);

    // =========================================================================
    // TEST 1: Customer Creation with Opening Balance
    // =========================================================================
    console.log('\n--- TEST 1: Customer Creation with Opening Balance ---');
    const custCreateRes = await request(
      'POST',
      '/api/data/customers',
      {
        name: 'Haji Aslam Agrochemicals',
        phone: '03001234567',
        area: 'Chowk Azam',
        type: 'wholesaler',
        opening_balance: 50000,
        balance: 50000,
      },
      token
    );
    assert(custCreateRes.status === 201, 'Customer created with status 201');
    const custId = custCreateRes.data.id;
    assert(Number(custCreateRes.data.balance) === 50000, 'Customer balance is 50,000');
    assert(Number(custCreateRes.data.opening_balance) === 50000, 'Customer opening_balance is 50,000');

    // Create OB order for customer (simulating frontend customer save flow)
    const obOrderRes = await request(
      'POST',
      '/api/data/orders',
      {
        order_number: 'OB-99001',
        invoice_number: 'INV-99001',
        customer_id: custId,
        customer_name: 'Haji Aslam Agrochemicals',
        subtotal: 50000,
        total: 50000,
        paid_amount: 0,
        status: 'completed',
        payment_status: 'unpaid',
        note: 'Initial Opening Balance / Previous Pending Due',
      },
      token
    );
    assert(obOrderRes.status === 201, 'OB order created with status 201');
    const obOrderId = obOrderRes.data.id;

    const obItemRes = await request(
      'POST',
      '/api/data/order_items',
      {
        order_id: obOrderId,
        product_id: null,
        product_name: 'Opening Balance / Previous Pending Due',
        quantity: 1,
        unit_price: 50000,
        total: 50000,
        unit: 'balance',
      },
      token
    );
    assert(obItemRes.status === 201, 'OB order item created with status 201');

    // =========================================================================
    // TEST 2: Customer Opening Balance Edit (Synchronizes OB Order)
    // =========================================================================
    console.log('\n--- TEST 2: Customer Opening Balance Edit ---');
    const newCustOpening = 75000;
    const oldCustOpening = 50000;
    const custDelta = newCustOpening - oldCustOpening;
    const newCustBalance = 50000 + custDelta;

    // Update customer
    const custUpdateRes = await request(
      'PUT',
      `/api/data/customers/${custId}`,
      {
        opening_balance: newCustOpening,
        balance: newCustBalance,
      },
      token
    );
    assert(custUpdateRes.status === 200, 'Customer updated successfully');
    assert(Number(custUpdateRes.data.balance) === 75000, 'Customer balance updated to 75,000');
    assert(Number(custUpdateRes.data.opening_balance) === 75000, 'Customer opening_balance updated to 75,000');

    // Synchronize OB order
    const obOrderUpdateRes = await request(
      'PUT',
      `/api/data/orders/${obOrderId}`,
      {
        subtotal: newCustOpening,
        total: newCustOpening,
      },
      token
    );
    assert(obOrderUpdateRes.status === 200, 'OB order updated with new total 75,000');
    assert(Number(obOrderUpdateRes.data.total) === 75000, 'OB order total is 75,000');

    // =========================================================================
    // TEST 3: Customer Payment Collection against Opening Balance Invoice
    // =========================================================================
    console.log('\n--- TEST 3: Payment Collection on OB Invoice ---');
    const payCustAmount = 30000;
    // 1. Update order
    const orderPayRes = await request(
      'PUT',
      `/api/data/orders/${obOrderId}`,
      {
        paid_amount: payCustAmount,
        payment_status: 'partial',
      },
      token
    );
    assert(orderPayRes.status === 200, 'Order paid_amount updated to 30,000');
    assert(orderPayRes.data.payment_status === 'partial', 'Order status marked partial');

    // 2. Post payment record
    const postPayRes = await request(
      'POST',
      '/api/data/order_payments',
      {
        order_id: obOrderId,
        method: 'cash',
        amount: payCustAmount,
        note: 'Payment for OB invoice',
      },
      token
    );
    assert(postPayRes.status === 201, 'Order payment record created');

    // 3. Update customer balance
    const custAfterPayRes = await request(
      'PUT',
      `/api/data/customers/${custId}`,
      {
        balance: 75000 - payCustAmount,
      },
      token
    );
    assert(Number(custAfterPayRes.data.balance) === 45000, 'Customer balance reduced to 45,000');

    // =========================================================================
    // TEST 4: Supplier Creation with Opening Balance (Defensive purchase_items test)
    // =========================================================================
    console.log('\n--- TEST 4: Supplier Creation with Opening Balance ---');
    const supCreateRes = await request(
      'POST',
      '/api/data/suppliers',
      {
        name: 'Fatima Fertilizer Corp',
        contact_person: 'Tariq Mehmood',
        phone: '03112233445',
        opening_balance: 60000,
        balance: 60000,
      },
      token
    );
    assert(supCreateRes.status === 201, 'Supplier created with status 201');
    const supId = supCreateRes.data.id;
    assert(Number(supCreateRes.data.balance) === 60000, 'Supplier balance is 60,000');
    assert(Number(supCreateRes.data.opening_balance) === 60000, 'Supplier opening_balance is 60,000');

    // Create PO-OB order
    const poObRes = await request(
      'POST',
      '/api/data/purchase_orders',
      {
        po_number: 'PO-OB-88001',
        supplier_id: supId,
        subtotal: 60000,
        total: 60000,
        paid_amount: 0,
        status: 'received',
        payment_status: 'unpaid',
        note: 'Initial Opening Balance / Previous Supplier Due',
      },
      token
    );
    assert(poObRes.status === 201, 'PO-OB record created with status 201');
    const poObId = poObRes.data.id;

    // Post purchase item with stray 'unit' column (verifies Bug fix / defensive stripping)
    const poItemRes = await request(
      'POST',
      '/api/data/purchase_items',
      {
        purchase_id: poObId,
        product_id: null,
        product_name: 'Opening Balance / Previous Supplier Due',
        quantity: 1,
        unit_cost: 60000,
        total: 60000,
        unit: 'balance', // stray unit field must NOT crash SQLite!
      },
      token
    );
    assert(poItemRes.status === 201, 'purchase_items successfully created without SQLite column error');
    assert(Number(poItemRes.data.unit_cost) === 60000, 'purchase_items unit_cost is 60,000');

    // =========================================================================
    // TEST 5: Supplier Opening Balance Edit (Synchronizes PO-OB)
    // =========================================================================
    console.log('\n--- TEST 5: Supplier Opening Balance Edit ---');
    const newSupOpening = 90000;
    const oldSupOpening = 60000;
    const supDelta = newSupOpening - oldSupOpening;
    const newSupBalance = 60000 + supDelta;

    const supUpdateRes = await request(
      'PUT',
      `/api/data/suppliers/${supId}`,
      {
        opening_balance: newSupOpening,
        balance: newSupBalance,
      },
      token
    );
    assert(supUpdateRes.status === 200, 'Supplier updated successfully');
    assert(Number(supUpdateRes.data.balance) === 90000, 'Supplier balance updated to 90,000');
    assert(Number(supUpdateRes.data.opening_balance) === 90000, 'Supplier opening_balance updated to 90,000');

    // Synchronize PO-OB
    const poObUpdateRes = await request(
      'PUT',
      `/api/data/purchase_orders/${poObId}`,
      {
        subtotal: newSupOpening,
        total: newSupOpening,
      },
      token
    );
    assert(poObUpdateRes.status === 200, 'PO-OB updated to 90,000');
    assert(Number(poObUpdateRes.data.total) === 90000, 'PO-OB total is 90,000');

    // =========================================================================
    // TEST 6: Supplier Reconciliation Stability when Normal PO is Added
    // =========================================================================
    console.log('\n--- TEST 6: Normal Purchase Order Added & Reconciliation Stability ---');
    // Add normal purchase order of 25,000
    const normalPORes = await request(
      'POST',
      '/api/data/purchase_orders',
      {
        po_number: 'PO-2026-001',
        supplier_id: supId,
        subtotal: 25000,
        total: 25000,
        paid_amount: 0,
        status: 'received',
        payment_status: 'unpaid',
        note: 'Urea Sona bags procurement',
      },
      token
    );
    assert(normalPORes.status === 201, 'Normal PO created');

    // Fetch all POs for supplier
    const allSupPOsRes = await request('GET', '/api/data/purchase_orders', null, token);
    const supPOs = (allSupPOsRes.data || []).filter((p) => p.supplier_id === supId);
    assert(supPOs.length === 2, 'Supplier has 2 purchase orders (PO-OB and PO-2026-001)');

    // Run reconciliation logic
    const totalDue = supPOs.reduce((acc, p) => acc + Math.max(0, Number(p.total || 0) - Number(p.paid_amount || 0)), 0);
    assert(totalDue === 115000, 'Reconciled total due is 115,000 (90,000 opening + 25,000 new PO)');

    // Ensure supplier balance is updated to reconciled trueBal
    const recSupRes = await request(
      'PUT',
      `/api/data/suppliers/${supId}`,
      { balance: totalDue },
      token
    );
    assert(Number(recSupRes.data.balance) === 115000, 'Supplier balance preserved with opening balance + new PO!');

    // =========================================================================
    // TEST 7: Payment to Supplier against Opening Balance PO
    // =========================================================================
    console.log('\n--- TEST 7: Payment Recorded on Supplier Opening Balance ---');
    const paySupAmount = 40000;
    // Update PO-OB
    const payPORes = await request(
      'PUT',
      `/api/data/purchase_orders/${poObId}`,
      {
        paid_amount: paySupAmount,
        payment_status: 'partial',
      },
      token
    );
    assert(Number(payPORes.data.paid_amount) === 40000, 'PO-OB paid_amount updated to 40,000');
    assert(payPORes.data.payment_status === 'partial', 'PO-OB status is partial');

    // Post supplier payment
    const postSupPayRes = await request(
      'POST',
      '/api/data/supplier_payments',
      {
        purchase_id: poObId,
        supplier_id: supId,
        method: 'cash',
        amount: paySupAmount,
        note: 'Payment towards initial opening balance',
      },
      token
    );
    assert(postSupPayRes.status === 201, 'Supplier payment created');

    // Update supplier balance
    const supAfterPayRes = await request(
      'PUT',
      `/api/data/suppliers/${supId}`,
      {
        balance: 115000 - paySupAmount,
      },
      token
    );
    assert(Number(supAfterPayRes.data.balance) === 75000, 'Supplier balance accurately reduced to 75,000');

    // =========================================================================
    // TEST 8: Setting Opening Balance from 0 to Positive on Edit
    // =========================================================================
    console.log('\n--- TEST 8: Customer Created with 0 Opening Bal, then Edited to 35,000 ---');
    const zeroCustRes = await request(
      'POST',
      '/api/data/customers',
      {
        name: 'Bismillah Kissan Shop',
        type: 'dealer',
        opening_balance: 0,
        balance: 0,
      },
      token
    );
    const zeroCustId = zeroCustRes.data.id;
    assert(Number(zeroCustRes.data.balance) === 0, 'Customer created with 0 balance');

    // Edit customer opening balance to 35,000
    const editZeroCustRes = await request(
      'PUT',
      `/api/data/customers/${zeroCustId}`,
      {
        opening_balance: 35000,
        balance: 35000,
      },
      token
    );
    assert(Number(editZeroCustRes.data.balance) === 35000, 'Customer balance updated to 35,000');

    // Simulate creation of new OB order during edit
    const lateOBRes = await request(
      'POST',
      '/api/data/orders',
      {
        order_number: 'OB-99002',
        invoice_number: 'INV-99002',
        customer_id: zeroCustId,
        subtotal: 35000,
        total: 35000,
        paid_amount: 0,
        status: 'completed',
        payment_status: 'unpaid',
        note: 'Initial Opening Balance / Previous Pending Due',
      },
      token
    );
    assert(lateOBRes.status === 201, 'Late OB order successfully created for newly assigned balance');

    console.log('\n=======================================');
    console.log(`TOTAL TESTS: ${passed + failed}`);
    console.log(`PASSED: ${passed}`);
    console.log(`FAILED: ${failed}`);
    console.log('=======================================');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    if (server) {
      server.close();
      console.log('🛑 Test server stopped.');
    }
    if (fs.existsSync(TEST_DATA_DIR)) {
      try {
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
      } catch {}
    }
  }
}

run().catch((e) => {
  console.error('Test execution error:', e);
  process.exit(1);
});
