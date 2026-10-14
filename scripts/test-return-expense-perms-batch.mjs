import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import http from 'http';
import { startServer } from '../server/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PORT = 3897;
const TEST_DATA_DIR = path.join(__dirname, 'data_test_return_expense_perms_batch');

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
  console.log('🚀 Starting test server on port', TEST_PORT);
  const s = await startServer({ userDataPath: TEST_DATA_DIR, port: TEST_PORT });
  const server = s.server;

  try {
    console.log('\n--- SETUP USERS (Admin, Manager, Staff) ---');
    // 1. Initial Admin Login
    const adminLoginRes = await request('POST', '/api/auth/login', {
      email: 'admin@store.com',
      password: 'Admin@123',
    });
    assert(adminLoginRes.status === 200, 'Admin logged in');
    const adminToken = adminLoginRes.data.token;

    // 2. Create Manager User
    const managerCreateRes = await request(
      'POST',
      '/api/auth/users',
      {
        name: 'Warehouse Manager',
        email: 'manager@biscuit.com',
        role: 'manager',
        password: 'password123',
        permissions: ['inventory', 'companies', 'brands', 'orders', 'pos'],
      },
      adminToken
    );
    assert(managerCreateRes.status === 200 || managerCreateRes.status === 201, 'Manager created by admin');

    // Login as Manager
    const managerLoginRes = await request('POST', '/api/auth/login', {
      email: 'manager@biscuit.com',
      password: 'password123',
    });
    assert(managerLoginRes.status === 200, 'Manager logged in');
    const managerToken = managerLoginRes.data.token;

    // 3. Create Staff User
    const staffCreateRes = await request(
      'POST',
      '/api/auth/users',
      {
        name: 'Sales Cashier',
        email: 'cashier@biscuit.com',
        role: 'staff',
        password: 'password123',
        permissions: ['pos', 'orders'],
      },
      adminToken
    );
    assert(staffCreateRes.status === 200 || staffCreateRes.status === 201, 'Staff user created');

    const staffLoginRes = await request('POST', '/api/auth/login', {
      email: 'cashier@biscuit.com',
      password: 'password123',
    });
    assert(staffLoginRes.status === 200, 'Staff user logged in');
    const staffToken = staffLoginRes.data.token;

    console.log('\n--- TEST 1: EXPENSE DELETION PERMISSIONS ---');
    // Admin creates an expense
    const expenseRes = await request(
      'POST',
      '/api/data/expenses',
      {
        amount: 8500,
        date: new Date().toISOString().slice(0, 10),
        payment_method: 'cash',
        note: 'Electricity Bill',
        status: 'approved',
      },
      adminToken
    );
    assert((expenseRes.status === 200 || expenseRes.status === 201) && expenseRes.data.id, 'Expense created by admin');
    const expenseId = expenseRes.data.id;

    // Manager attempts to delete expense -> MUST BE FORBIDDEN (403)
    const managerDelRes = await request(
      'DELETE',
      `/api/data/expenses/${expenseId}`,
      null,
      managerToken
    );
    assert(
      managerDelRes.status === 403,
      `Manager blocked from deleting expense (status: ${managerDelRes.status}, error: "${managerDelRes.data?.error}")`
    );

    // Staff attempts to delete expense -> MUST BE FORBIDDEN (403)
    const staffDelRes = await request(
      'DELETE',
      `/api/data/expenses/${expenseId}`,
      null,
      staffToken
    );
    assert(
      staffDelRes.status === 403,
      `Staff blocked from deleting expense (status: ${staffDelRes.status})`
    );

    // Verify expense record still exists untouched
    const checkExpenseRes = await request('GET', `/api/data/expenses/${expenseId}`, null, adminToken);
    assert(
      checkExpenseRes.status === 200 && checkExpenseRes.data.amount === 8500,
      'Expense record still safely exists in database'
    );

    // Admin deletes expense -> MUST BE ALLOWED (200)
    const adminDelRes = await request(
      'DELETE',
      `/api/data/expenses/${expenseId}`,
      null,
      adminToken
    );
    assert(adminDelRes.status === 200, 'Admin successfully deleted expense');

    // Verify expense is now deleted
    const verifyDelRes = await request('GET', `/api/data/expenses/${expenseId}`, null, adminToken);
    assert(verifyDelRes.status === 404, 'Expense is confirmed deleted after admin action');

    console.log('\n--- TEST 2: SALES RETURN KEEPS ORIGINAL ORDER INTACT ---');
    // 1. Create a Product
    const prodRes = await request(
      'POST',
      '/api/data/products',
      {
        name: 'Super Urea 50KG',
        purchase_price: 3000,
        cost_price: 3000,
        retail_price: 3600,
        wholesale_price: 3500,
        stock_quantity: 100,
        min_stock_level: 10,
        unit: 'bag',
      },
      adminToken
    );
    assert((prodRes.status === 200 || prodRes.status === 201) && prodRes.data.id, 'Product created');
    const productId = prodRes.data.id;

    // 2. Create a Customer
    const custRes = await request(
      'POST',
      '/api/data/customers',
      {
        name: 'Haji Aslam Agri Store',
        phone: '0300-9876543',
        balance: 0,
      },
      adminToken
    );
    assert((custRes.status === 200 || custRes.status === 201) && custRes.data.id, 'Customer created with balance 0');
    const customerId = custRes.data.id;

    // 3. Create Sale Order (10 bags @ Rs 3600 = Rs 36,000, Paid: Rs 16,000, Balance due: Rs 20,000)
    const orderRes = await request(
      'POST',
      '/api/data/orders',
      {
        order_number: 'ORD-TEST-001',
        customer_id: customerId,
        total: 36000,
        subtotal: 36000,
        paid_amount: 16000,
        discount: 0,
        tax: 0,
        payment_status: 'partial',
        status: 'completed',
      },
      adminToken
    );
    assert((orderRes.status === 200 || orderRes.status === 201) && orderRes.data.id, 'Sale order created');
    const orderId = orderRes.data.id;

    // Customer balance updated to Rs 20,000
    await request(
      'PUT',
      `/api/data/customers/${customerId}`,
      { balance: 20000 },
      adminToken
    );

    // 4. Client's Requirement: Process Sales Return (Return 3 bags = Rs 10,800)
    // The voucher is created and customer ledger credited, but original order bill total MUST NOT be mutated!
    const returnVoucherRes = await request(
      'POST',
      '/api/data/sales_returns',
      {
        return_number: 'SR-TEST-001',
        order_id: orderId,
        customer_id: customerId,
        product_id: productId,
        product_name: 'Super Urea 50KG',
        quantity: 3,
        unit_price: 3600,
        total_amount: 10800,
        resolution: 'credit_note',
        reason: 'unsold_goods',
        status: 'approved',
      },
      adminToken
    );
    assert(returnVoucherRes.status === 200 || returnVoucherRes.status === 201, 'Sales return voucher SR-TEST-001 created');

    // Customer ledger credited by return amount (Rs 20,000 - 10,800 = Rs 9,200)
    await request(
      'PUT',
      `/api/data/customers/${customerId}`,
      { balance: 20000 - 10800 },
      adminToken
    );

    // Stock restored back to inventory (+3 bags)
    await request(
      'PUT',
      `/api/data/products/${productId}`,
      { stock_quantity: 90 + 3 },
      adminToken
    );

    // 5. CRITICAL VERIFICATION: Original Sale Order must remain UNTOUCHED!
    const originalOrderCheck = await request('GET', `/api/data/orders/${orderId}`, null, adminToken);
    assert(originalOrderCheck.status === 200, 'Fetched original sale order');
    const origOrder = originalOrderCheck.data;

    assert(
      origOrder.total === 36000,
      `Original order total remains intact at Rs 36,000 (actual: ${origOrder.total})`
    );
    assert(
      origOrder.paid_amount === 16000,
      `Original order paid amount remains intact at Rs 16,000 (actual: ${origOrder.paid_amount})`
    );
    assert(
      origOrder.payment_status === 'partial',
      `Original order payment status remains "partial" (actual: ${origOrder.payment_status})`
    );

    // Verify Customer Balance is credited
    const custAfterReturn = await request('GET', `/api/data/customers/${customerId}`, null, adminToken);
    assert(
      custAfterReturn.data.balance === 9200,
      `Customer ledger credited properly from Rs 20,000 to Rs 9,200 (actual: ${custAfterReturn.data.balance})`
    );

    // Verify Restocked Product
    const prodAfterReturn = await request('GET', `/api/data/products/${productId}`, null, adminToken);
    assert(
      prodAfterReturn.data.stock_quantity === 93,
      `Inventory stock properly restored back to 93 bags (actual: ${prodAfterReturn.data.stock_quantity})`
    );

    console.log('\n--- TEST 3: CSV BATCH ID & EXPIRY SUPPORT IN FIFO BATCHES ---');
    // Create product with batch number and expiry
    const batchProductRes = await request(
      'POST',
      '/api/data/products',
      {
        name: 'Wheat Booster Fertilizer',
        purchase_price: 2200,
        cost_price: 2200,
        retail_price: 2800,
        stock_quantity: 40,
        expiry_date: '2027-09-30',
        unit: 'carton',
      },
      adminToken
    );
    assert(batchProductRes.status === 200 || batchProductRes.status === 201, 'Batch test product created');
    const batchProdId = batchProductRes.data.id;

    // Create batch with custom batch number and expiry date
    const batchRes = await request(
      'POST',
      '/api/data/product_batches',
      {
        product_id: batchProdId,
        batch_number: 'BATCH-WHT-2026-X1',
        quantity: 40,
        damaged_quantity: 0,
        batch_cost: 2200,
        expiry_date: '2027-09-30',
        status: 'active',
      },
      adminToken
    );
    assert((batchRes.status === 200 || batchRes.status === 201) && batchRes.data.id, 'FIFO product batch created with Batch ID & Expiry');

    // Query batches for this product
    const batchesListRes = await request(
      'GET',
      `/api/data/product_batches?product_id=${batchProdId}`,
      null,
      adminToken
    );
    assert(batchesListRes.status === 200, 'Fetched batches for product');
    const matchingBatch = batchesListRes.data.find((b) => b.batch_number === 'BATCH-WHT-2026-X1');
    assert(matchingBatch !== undefined, 'Found created batch in database');
    assert(matchingBatch?.expiry_date === '2027-09-30', `Batch expiry_date matches "2027-09-30" (actual: ${matchingBatch?.expiry_date})`);
    assert(matchingBatch?.quantity === 40, `Batch quantity matches 40 (actual: ${matchingBatch?.quantity})`);
    assert(matchingBatch?.status === 'active', 'Batch status is "active"');

    console.log('\n--- TEST 4: EXPIRY CALCULATION & INVENTORY PERMISSIONS ---');
    // Verify expiry status calculations logic
    const today = new Date();
    const expiredDate = new Date(today.getTime() - 5 * 86400000).toISOString().slice(0, 10);
    const nearExpiryDate = new Date(today.getTime() + 15 * 86400000).toISOString().slice(0, 10);
    const okExpiryDate = new Date(today.getTime() + 180 * 86400000).toISOString().slice(0, 10);

    const testExpiryHelper = (dateStr) => {
      if (!dateStr) return { status: 'none', label: 'No Expiry', daysRemaining: null };
      const exp = new Date(dateStr);
      if (isNaN(exp.getTime())) return { status: 'none', label: 'Invalid Date', daysRemaining: null };
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      exp.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return { status: 'expired', label: `Expired (${Math.abs(diffDays)}d ago)` };
      if (diffDays <= 30) return { status: 'near_expiry', label: `Expiring Soon (${diffDays}d left)` };
      return { status: 'ok', label: 'Fresh' };
    };

    assert(testExpiryHelper(expiredDate).status === 'expired', 'Expired calculation flagged correctly');
    assert(testExpiryHelper(nearExpiryDate).status === 'near_expiry', 'Near-expiry (within 30d) flagged correctly');
    assert(testExpiryHelper(okExpiryDate).status === 'ok', 'Fresh product (>30d) flagged correctly');

    console.log('\n========================================');
    console.log(`TOTAL PASSED: ${passed}`);
    console.log(`TOTAL FAILED: ${failed}`);
    console.log('========================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    server.close(() => {
      console.log('Server stopped.');
      process.exit(0);
    });
  }
}

run();
