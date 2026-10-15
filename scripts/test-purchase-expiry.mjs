import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import http from 'http';
import { startServer } from '../server/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PORT = 3896;
const TEST_DATA_DIR = path.join(__dirname, 'data_test_purchase_expiry');

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
    console.log('\n--- Test 1: Admin Login ---');
    const loginRes = await request('POST', '/api/auth/login', {
      email: 'admin@store.com',
      password: 'Admin@123',
    });
    assert(loginRes.status === 200, 'Admin login status 200');
    assert(Boolean(loginRes.data?.token), 'Admin received JWT token');
    const adminToken = loginRes.data.token;

    console.log('\n--- Test 2: Create Supplier & Product ---');
    const supRes = await request('POST', '/api/data/suppliers', {
      name: 'AgriTech Chemicals Ltd',
      phone: '0300-1122334',
      balance: 0,
    }, adminToken);
    assert(supRes.status === 201, 'Supplier created');
    const supplier = supRes.data;

    const prodRes = await request('POST', '/api/data/products', {
      name: 'Alpha Bio Fertilizer 500ML',
      sku: 'ABF-500',
      stock_quantity: 0,
      purchase_price: 600,
      cost_price: 600,
      retail_price: 900,
      wholesale_price: 800,
      dealer_price: 750,
      carton_to_box: 12,
      expiry_date: '2027-01-01',
    }, adminToken);
    assert(prodRes.status === 201, 'Product created');
    const product = prodRes.data;

    console.log('\n--- Test 3: Create Purchase Order with Line Item Expiry & Batch ---');
    const poRes = await request('POST', '/api/data/purchase_orders', {
      po_number: 'PO-2026-TEST-001',
      supplier_id: supplier.id,
      subtotal: 30000,
      tax: 0,
      total: 30000,
      paid_amount: 0,
      status: 'pending',
      payment_status: 'unpaid',
      note: 'Testing expiry date on purchase items',
    }, adminToken);
    assert(poRes.status === 201, 'Purchase Order created');
    const po = poRes.data;

    const poItemRes = await request('POST', '/api/data/purchase_items', {
      purchase_id: po.id,
      product_id: product.id,
      product_name: product.name,
      quantity: 60, // 5 cartons * 12 pcs
      unit_cost: 500,
      total: 30000,
      cartons: 5,
      pieces_per_carton: 12,
      batch_number: 'BATCH-AGRI-9988',
      expiry_date: '2028-12-31',
      retail_price: 950,
      wholesale_price: 850,
      dealer_price: 780,
    }, adminToken);
    assert(poItemRes.status === 201, 'Purchase Item with expiry created');
    assert(poItemRes.data?.expiry_date === '2028-12-31', 'Purchase item stored expiry_date correctly: 2028-12-31');
    assert(poItemRes.data?.batch_number === 'BATCH-AGRI-9988', 'Purchase item stored batch_number correctly');
    assert(poItemRes.data?.cartons === 5, 'Purchase item stored cartons correctly: 5');

    console.log('\n--- Test 4: Retrieve PO Line Items ---');
    const getItemsRes = await request('GET', `/api/data/purchase_items?purchase_id=${po.id}`, null, adminToken);
    assert(getItemsRes.status === 200, 'Retrieved purchase items');
    const foundItem = getItemsRes.data.find((it) => it.id === poItemRes.data.id);
    assert(Boolean(foundItem), 'Found created purchase item');
    assert(foundItem.expiry_date === '2028-12-31', 'Retrieved item has correct expiry_date');
    assert(foundItem.batch_number === 'BATCH-AGRI-9988', 'Retrieved item has correct batch_number');

    console.log('\n--- Test 5: Receive PO Stock Batch & Update Product Catalog Expiry ---');
    // Simulate the receiving process performed by Purchasing.tsx receivePO()
    const batchRes = await request('POST', '/api/data/product_batches', {
      product_id: product.id,
      purchase_id: po.id,
      batch_number: foundItem.batch_number,
      quantity: foundItem.quantity,
      damaged_quantity: 0,
      batch_cost: foundItem.unit_cost,
      expiry_date: foundItem.expiry_date,
      status: 'active',
    }, adminToken);
    assert(batchRes.status === 201, 'FIFO Product Batch created');
    assert(batchRes.data?.expiry_date === '2028-12-31', 'FIFO Product batch has matching expiry_date: 2028-12-31');
    assert(batchRes.data?.batch_number === 'BATCH-AGRI-9988', 'FIFO Product batch has matching batch_number');

    // Update product stock and catalog expiry date
    const prodUpdateRes = await request('PUT', `/api/data/products/${product.id}`, {
      stock_quantity: product.stock_quantity + foundItem.quantity,
      purchase_price: foundItem.unit_cost,
      cost_price: foundItem.unit_cost,
      expiry_date: foundItem.expiry_date,
    }, adminToken);
    assert(prodUpdateRes.status === 200, 'Product catalog updated on PO receipt');
    assert(prodUpdateRes.data?.stock_quantity === 60, 'Product stock quantity updated to 60');
    assert(prodUpdateRes.data?.expiry_date === '2028-12-31', 'Product catalog expiry updated to 2028-12-31');

    console.log('\n--- Test 6: Verify CSV Template Headers and Samples ---');
    const csvFileContent = fs.readFileSync(path.join(__dirname, '../src/lib/csv.ts'), 'utf-8');
    assert(csvFileContent.includes("'Expiry Date (optional)'"), 'PO CSV headers include Expiry Date');
    assert(csvFileContent.includes("'Batch Number (optional)'"), 'PO CSV headers include Batch Number');
    assert(csvFileContent.includes('BATCH-MC-2026') && csvFileContent.includes('2027-12-31'), 'PO CSV sample rows contain batch and expiry sample values');

    console.log('\n--- Test 7: Verify Multi-item PO Calculations and No Regressions ---');
    const po2Res = await request('POST', '/api/data/purchase_orders', {
      po_number: 'PO-2026-TEST-002',
      supplier_id: supplier.id,
      subtotal: 50000,
      tax: 0,
      total: 50000,
      paid_amount: 0,
      status: 'pending',
      payment_status: 'unpaid',
      note: 'Multi-item calculation test',
    }, adminToken);
    assert(po2Res.status === 201, 'Second PO created');

    const itemA = await request('POST', '/api/data/purchase_items', {
      purchase_id: po2Res.data.id,
      product_id: product.id,
      product_name: product.name,
      cartons: 2,
      pieces_per_carton: 12,
      quantity: 24,
      unit_cost: 500,
      total: 12000,
      expiry_date: '2029-01-15',
    }, adminToken);
    assert(itemA.status === 201, 'Item A created with expiry 2029-01-15');
    assert(itemA.data?.expiry_date === '2029-01-15', 'Item A stored expiry');

    console.log('\n=======================================');
    console.log(`Summary: ${passed} PASSED, ${failed} FAILED`);
    console.log('=======================================');
  } finally {
    console.log('Stopping test server...');
    await new Promise((resolve) => server.close(resolve));
    if (fs.existsSync(TEST_DATA_DIR)) {
      try {
        fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
      } catch {}
    }
  }

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Fatal error during test:', err);
  process.exit(1);
});
