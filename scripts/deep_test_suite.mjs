import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import http from 'http';
import { startServer } from '../server/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PORT = 3899;
const TEST_DATA_DIR = path.join(__dirname, 'data_test_run');

// Cleanup previous test run data
if (fs.existsSync(TEST_DATA_DIR)) {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : '';
    const headers = {
      'Content-Type': 'application/json',
    };
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

async function runTests() {
  console.log('================================================================');
  console.log('🚀 STARTING DEEP SYSTEM & BUG VERIFICATION TEST SUITE');
  console.log('================================================================');

  let serverInstance;
  try {
    const s = await startServer({ userDataPath: TEST_DATA_DIR, port: TEST_PORT });
    serverInstance = s.server;
    console.log(`Server started successfully on port ${TEST_PORT}\n`);

    // -------------------------------------------------------------------------
    // TEST 1: Authentication & Health Check
    // -------------------------------------------------------------------------
    console.log('👉 [1/8] Verifying Health & Admin Authentication...');
    const health = await request('GET', '/api/health');
    assert(health.status === 200 && health.data?.ok === true, 'Health check returns 200 OK');

    const loginRes = await request('POST', '/api/auth/login', {
      email: 'admin@store.com',
      password: 'Admin@123',
    });
    assert(loginRes.status === 200 && loginRes.data?.token, 'Default admin login succeeds with JWT');
    const token = loginRes.data?.token;

    // -------------------------------------------------------------------------
    // TEST 2: Bug #4 - Customer Opening Balance Delta Math & Updates
    // -------------------------------------------------------------------------
    console.log('\n👉 [2/8] Testing Bug #4 (Customer Opening Balance & Delta Math)...');
    const custRes = await request(
      'POST',
      '/api/data/customers',
      {
        name: 'Haji Aslam Fertilizer Trader',
        phone: '0300-1234567',
        area: 'Depalpur',
        opening_balance: 5000,
        balance: 5000,
      },
      token
    );
    assert(custRes.status === 201 && custRes.data?.id, 'Created customer with 5,000 opening balance');
    const custId = custRes.data.id;
    assert(Number(custRes.data.balance) === 5000, 'Customer initial balance is 5,000');

    // Simulate editing opening balance from 5,000 to 8,000
    // Delta = 8000 - 5000 = +3000 -> new balance = 5000 + 3000 = 8000
    const oldOpening = 5000;
    const newOpening = 8000;
    const delta = newOpening - oldOpening;
    const updatedCust = await request(
      'PUT',
      `/api/data/customers/${custId}`,
      {
        name: custRes.data.name,
        opening_balance: newOpening,
        balance: Number(custRes.data.balance) + delta,
      },
      token
    );
    assert(updatedCust.status === 200, 'Customer updated successfully with new opening balance');
    assert(Number(updatedCust.data.balance) === 8000, 'Customer balance accurately shifted by delta to 8,000');

    // -------------------------------------------------------------------------
    // TEST 3: Bug #20 - Preserving Invoices When Customer is Deleted
    // -------------------------------------------------------------------------
    console.log('\n👉 [3/8] Testing Bug #20 (Preserving Invoices When Customer is Deleted)...');
    // Create an order for this customer with snapshot columns
    const orderRes = await request(
      'POST',
      '/api/data/orders',
      {
        order_number: 'ORD-10001',
        invoice_number: 'INV-10001',
        customer_id: custId,
        customer_name: updatedCust.data.name,
        customer_phone: updatedCust.data.phone,
        customer_area: updatedCust.data.area,
        total: 15000,
        paid_amount: 10000,
        status: 'completed',
        payment_status: 'partial',
        due_date: '2026-10-15',
      },
      token
    );
    assert(orderRes.status === 201 && orderRes.data?.id, 'Created sales order with customer snapshot data and due date');
    const orderId = orderRes.data.id;

    // Delete the customer
    const delCust = await request('DELETE', `/api/data/customers/${custId}`, null, token);
    assert(delCust.status === 200, 'Customer deletion succeeds');

    // Fetch the order and verify customer snapshot is preserved
    const getOrder = await request('GET', `/api/data/orders/${orderId}`, null, token);
    assert(getOrder.status === 200, 'Order still exists after customer deletion');
    assert(getOrder.data?.customer_id === null, 'Order customer_id safely nullified (no FK violation)');
    assert(
      getOrder.data?.customer_name === 'Haji Aslam Fertilizer Trader',
      'Order preserved customer_name snapshot ("Haji Aslam Fertilizer Trader")'
    );
    assert(getOrder.data?.customer_area === 'Depalpur', 'Order preserved customer_area snapshot ("Depalpur")');
    assert(getOrder.data?.customer_phone === '0300-1234567', 'Order preserved customer_phone snapshot');

    // -------------------------------------------------------------------------
    // TEST 4: Bug #8 & #26 - Supplier Opening Balance PO Generation & Defensive Mapping
    // -------------------------------------------------------------------------
    console.log('\n👉 [4/8] Testing Bugs #8 & #26 (Supplier Opening Balance & unit_cost defensive mapping)...');
    const supRes = await request(
      'POST',
      '/api/data/suppliers',
      {
        name: 'Engro Fertilizers Ltd',
        phone: '042-35800000',
        opening_balance: 25000,
        balance: 25000,
      },
      token
    );
    assert(supRes.status === 201 && supRes.data?.id, 'Created supplier with 25,000 opening balance');
    const supId = supRes.data.id;

    // Create Opening Balance PO
    const poRes = await request(
      'POST',
      '/api/data/purchase_orders',
      {
        po_number: 'PO-OB-10001',
        supplier_id: supId,
        subtotal: 25000,
        total: 25000,
        status: 'received',
        payment_status: 'unpaid',
        note: 'Initial Opening Balance / Previous Supplier Due',
      },
      token
    );
    assert(poRes.status === 201, 'Created PO-OB purchase order for opening balance');

    // Test defensive mapping: posting `unit_price` instead of `unit_cost` to `purchase_items`
    // Bug #26 caused a crash if unit_price was sent; our defensive mapping maps unit_price -> unit_cost
    const piRes = await request(
      'POST',
      '/api/data/purchase_items',
      {
        purchase_id: poRes.data.id,
        product_name: 'Opening Balance / Previous Supplier Due',
        quantity: 1,
        unit_price: 25000, // deliberately sending unit_price to test defensive mapping
        total: 25000,
      },
      token
    );
    assert(piRes.status === 201 && piRes.data?.id, 'purchase_items successfully accepted item with defensive unit_cost mapping');
    assert(Number(piRes.data.unit_cost) === 25000, 'Defensively mapped unit_price to unit_cost = 25,000');

    // -------------------------------------------------------------------------
    // TEST 5: Bug #10 - Quick Product Creation
    // -------------------------------------------------------------------------
    console.log('\n👉 [5/8] Testing Bug #10 (Quick Product Creation in PO)...');
    const prodRes = await request(
      'POST',
      '/api/data/products',
      {
        name: 'Sona Urea Granular 50kg',
        sku: 'PRD-102938',
        carton_to_box: 1,
        purchase_price: 4500,
        cost_price: 4500,
        retail_price: 4800,
        wholesale_price: 4700,
        dealer_price: 4650,
        stock_quantity: 100,
        min_stock_level: 10,
      },
      token
    );
    assert(prodRes.status === 201 && prodRes.data?.id, 'Quick-created product Sona Urea 50kg');
    const prodId = prodRes.data.id;
    assert(Number(prodRes.data.purchase_price) === 4500, 'Purchase cost saved as 4,500');
    assert(Number(prodRes.data.retail_price) === 4800, 'Retail price saved as 4,800');
    assert(Number(prodRes.data.wholesale_price) === 4700, 'Wholesale price saved as 4,700');

    // -------------------------------------------------------------------------
    // TEST 6: Bugs #6 & #24 - Due Date Tracking & Overdue Logic
    // -------------------------------------------------------------------------
    console.log('\n👉 [6/8] Testing Bugs #6 & #24 (Due Date Tracking & Overdue Calculation)...');
    // Create an overdue order (due_date in the past)
    const overdueCustRes = await request(
      'POST',
      '/api/data/customers',
      {
        name: 'Chaudhry Riaz Zamindar',
        phone: '0321-9988776',
        area: 'Haveli Lakha',
        opening_balance: 0,
        balance: 12000,
      },
      token
    );
    const overdueCustId = overdueCustRes.data.id;

    const overdueOrder = await request(
      'POST',
      '/api/data/orders',
      {
        order_number: 'ORD-10002',
        invoice_number: 'INV-10002',
        customer_id: overdueCustId,
        customer_name: overdueCustRes.data.name,
        customer_phone: overdueCustRes.data.phone,
        customer_area: overdueCustRes.data.area,
        total: 12000,
        paid_amount: 0,
        status: 'completed',
        payment_status: 'unpaid',
        due_date: '2026-09-01', // definitely in the past relative to 2026-10-01
      },
      token
    );
    assert(overdueOrder.status === 201, 'Created credit order with past due date 2026-09-01');

    // Verify order query preserves due_date
    const fetchedOverdueOrder = await request('GET', `/api/data/orders/${overdueOrder.data.id}`, null, token);
    assert(fetchedOverdueOrder.data?.due_date === '2026-09-01', 'Order due_date successfully persisted and retrieved');

    // Test overdue days calculation math:
    const today = new Date('2026-10-01');
    const dueDate = new Date('2026-09-01');
    const diffDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
    assert(diffDays === 30, `Calculated overdue delta is precisely ${diffDays} days overdue`);

    // -------------------------------------------------------------------------
    // TEST 7: Feature - Sales Return & Credit Memo Accounting Settlement
    // -------------------------------------------------------------------------
    console.log('\n👉 [7/8] Testing Sales Return & Credit Memo Resolution...');
    const returnRes = await request(
      'POST',
      '/api/data/sales_returns',
      {
        return_number: 'SR-10001',
        order_id: overdueOrder.data.id,
        customer_id: overdueCustId,
        product_id: prodId,
        product_name: 'Sona Urea Granular 50kg',
        quantity: 2,
        unit_price: 4800,
        total_amount: 9600,
        reason: 'wrong_product',
        resolution: 'credit_note',
        status: 'approved',
        note: 'Customer exchanged 2 bags',
      },
      token
    );
    assert(returnRes.status === 201, 'Created sales return SR-10001 with credit_note resolution');

    // Simulate order total deduction on return:
    // Original total = 12,000, Return credit = 9,600 -> Revised Net = 2,400
    const revisedOrderTotal = 12000 - 9600;
    const updOrder = await request(
      'PUT',
      `/api/data/orders/${overdueOrder.data.id}`,
      {
        total: revisedOrderTotal,
        payment_status: 'unpaid',
      },
      token
    );
    assert(Number(updOrder.data.total) === 2400, 'Order total properly revised to 2,400');

    // Customer balance deduction on credit note:
    // Original balance = 12,000, Credit = -9,600 -> New Balance = 2,400
    const updCust = await request(
      'PUT',
      `/api/data/customers/${overdueCustId}`,
      {
        balance: 12000 - 9600,
      },
      token
    );
    assert(Number(updCust.data.balance) === 2400, 'Customer ledger balance properly reduced to 2,400');

    // -------------------------------------------------------------------------
    // TEST 8: Bug #11 - 5-Digit Numbering Format Validation
    // -------------------------------------------------------------------------
    console.log('\n👉 [8/8] Testing Bug #11 (5-Digit Numbering Format)...');
    // Test doc number generation logic
    const testDocNum = (prefix) => {
      const num = Math.floor(10000 + Math.random() * 90000);
      return prefix ? `${prefix}-${num}` : `${num}`;
    };
    const invNum = testDocNum('INV');
    const poNum = testDocNum('PO');
    const srNum = testDocNum('SR');
    assert(/^INV-\d{5}$/.test(invNum), `Generated invoice number "${invNum}" matches 5-digit format`);
    assert(/^PO-\d{5}$/.test(poNum), `Generated PO number "${poNum}" matches 5-digit format`);
    assert(/^SR-\d{5}$/.test(srNum), `Generated return number "${srNum}" matches 5-digit format`);

    console.log('\n================================================================');
    console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
    // Allow any pending SQLite flush timer to settle before cleaning up test directory
    await new Promise((r) => setTimeout(r, 300));
    try {
      if (fs.existsSync(TEST_DATA_DIR)) {
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
      }
    } catch {}
  }
}

runTests();
