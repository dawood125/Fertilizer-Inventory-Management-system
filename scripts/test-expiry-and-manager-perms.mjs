import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import http from 'http';
import { startServer } from '../server/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PORT = 3899;
const TEST_DATA_DIR = path.join(__dirname, 'data_test_expiry_perms');

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

    console.log('\n--- Test 2: Product Expiry Tracking ---');
    const pastDate = '2025-05-10';
    const soonDate = new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0];
    const farDate = new Date(Date.now() + 120 * 86400000).toISOString().split('T')[0];

    // Create expired product
    const pExpiredRes = await request(
      'POST',
      '/api/data/products',
      {
        name: 'Expired Biscuit Batch',
        sku: 'EXP-001',
        purchase_price: 50,
        cost_price: 50,
        retail_price: 70,
        stock_quantity: 20,
        min_stock_level: 5,
        expiry_date: pastDate,
      },
      adminToken
    );
    assert(pExpiredRes.status === 201 || pExpiredRes.status === 200, 'Created expired product');
    assert(pExpiredRes.data?.expiry_date === pastDate, 'Expired product has correct expiry_date');

    // Create near-expiry product
    const pSoonRes = await request(
      'POST',
      '/api/data/products',
      {
        name: 'Soon Expiring Fertilizer',
        sku: 'SOON-002',
        purchase_price: 1500,
        cost_price: 1500,
        retail_price: 1800,
        stock_quantity: 15,
        min_stock_level: 2,
        expiry_date: soonDate,
      },
      adminToken
    );
    assert(pSoonRes.status === 201 || pSoonRes.status === 200, 'Created near-expiry product');
    assert(pSoonRes.data?.expiry_date === soonDate, 'Near-expiry product has correct expiry_date');

    // Create valid product
    const pValidRes = await request(
      'POST',
      '/api/data/products',
      {
        name: 'Fresh Stock Product',
        sku: 'FRESH-003',
        purchase_price: 200,
        cost_price: 200,
        retail_price: 250,
        stock_quantity: 100,
        min_stock_level: 10,
        expiry_date: farDate,
      },
      adminToken
    );
    assert(pValidRes.status === 201 || pValidRes.status === 200, 'Created fresh product');
    assert(pValidRes.data?.expiry_date === farDate, 'Fresh product has correct expiry_date');

    // Update product expiry date
    const updatedDate = '2026-12-31';
    const updateRes = await request(
      'PUT',
      `/api/data/products/${pExpiredRes.data.id}`,
      {
        ...pExpiredRes.data,
        expiry_date: updatedDate,
      },
      adminToken
    );
    assert(updateRes.status === 200, 'Updated product expiry date');
    assert(updateRes.data?.expiry_date === updatedDate, 'Product has updated expiry date');

    // Fetch all products
    const listRes = await request('GET', '/api/data/products', null, adminToken);
    assert(listRes.status === 200, 'Fetched products list');
    assert(Array.isArray(listRes.data), 'Products response is an array');
    const fetchedProduct = (listRes.data || []).find((p) => p.id === pExpiredRes.data.id);
    assert(fetchedProduct?.expiry_date === updatedDate, 'GET /api/data/products returns expiry_date column');

    console.log('\n--- Test 3: Manager Role & Company / Brand Permissions ---');
    // Admin creates a manager user
    const managerEmail = `manager_${Date.now()}@store.com`;
    const createMgrRes = await request(
      'POST',
      '/api/auth/users',
      {
        name: 'Store Manager',
        email: managerEmail,
        password: 'managerpassword123',
        role: 'manager',
        permissions: ['companies', 'brands', 'inventory', 'customers', 'suppliers', 'pos'],
      },
      adminToken
    );
    assert(createMgrRes.status === 201 || createMgrRes.status === 200, 'Manager user created by admin');

    // Manager logs in
    const mgrLoginRes = await request('POST', '/api/auth/login', {
      email: managerEmail,
      password: 'managerpassword123',
    });
    assert(mgrLoginRes.status === 200, 'Manager login successful');
    assert(mgrLoginRes.data?.user?.role === 'manager', 'Logged in user has role manager');
    const mgrToken = mgrLoginRes.data.token;

    // Manager creates a Company
    const createCoRes = await request(
      'POST',
      '/api/data/companies',
      {
        name: 'Manager Agro Chemicals Ltd',
        contact_person: 'Mr. Tariq',
        phone: '03001234567',
      },
      mgrToken
    );
    assert(createCoRes.status === 201 || createCoRes.status === 200, 'Manager successfully created a Company');
    const companyId = createCoRes.data?.id;

    // Manager creates a Brand
    const createBrandRes = await request(
      'POST',
      '/api/data/brands',
      {
        name: 'Manager Super Urea',
        description: 'High quality brand created by manager',
      },
      mgrToken
    );
    assert(createBrandRes.status === 201 || createBrandRes.status === 200, 'Manager successfully created a Brand');
    const brandId = createBrandRes.data?.id;

    // Manager updates Company
    const updateCoRes = await request(
      'PUT',
      `/api/data/companies/${companyId}`,
      {
        ...createCoRes.data,
        contact_person: 'Mr. Tariq Khan',
      },
      mgrToken
    );
    assert(updateCoRes.status === 200, 'Manager successfully updated Company');

    // Manager updates Brand
    const updateBrandRes = await request(
      'PUT',
      `/api/data/brands/${brandId}`,
      {
        ...createBrandRes.data,
        description: 'Updated brand description by manager',
      },
      mgrToken
    );
    assert(updateBrandRes.status === 200, 'Manager successfully updated Brand');

    // Manager creates a Product linking to the Company and Brand
    const mgrProdRes = await request(
      'POST',
      '/api/data/products',
      {
        name: 'Manager Nitro Pak',
        sku: 'MGR-001',
        company_id: companyId,
        brand_id: brandId,
        purchase_price: 3200,
        retail_price: 3500,
        stock_quantity: 40,
        min_stock_level: 5,
        expiry_date: '2027-03-31',
      },
      mgrToken
    );
    assert(mgrProdRes.status === 201 || mgrProdRes.status === 200, 'Manager successfully created Product with Company & Brand');
    assert(mgrProdRes.data?.company_id === companyId, 'Product links to Company created by manager');
    assert(mgrProdRes.data?.brand_id === brandId, 'Product links to Brand created by manager');
    assert(mgrProdRes.data?.expiry_date === '2027-03-31', 'Product has expiry_date set by manager');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    console.log('\n--- Closing test server ---');
    await new Promise((res) => server.close(res));
    if (fs.existsSync(TEST_DATA_DIR)) {
      fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
    }
    console.log(`\n========================================`);
    console.log(`Results: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

run();
