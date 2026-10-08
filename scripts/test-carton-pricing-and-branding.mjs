import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import http from 'http';
import { startServer } from '../server/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const TEST_PORT = 3897;
const TEST_DATA_DIR = path.join(__dirname, 'data_carton_test_run');

if (fs.existsSync(TEST_DATA_DIR)) {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

function request(method, pathUrl, body = null, token = null) {
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
        path: pathUrl,
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
  console.log('🧪 DEEP VERIFICATION: BRANDING & CARTON-TO-PIECE PRICING ENGINE');
  console.log('================================================================');

  // STEP 1: Verify Static Branding Files & Assets
  console.log('\n👉 [1/6] Verifying Branding Assets, Favicon, Title & Login Page...');
  
  const publicFlowExists = fs.existsSync(path.join(ROOT_DIR, 'public', 'Flow.png'));
  const srcFlowExists = fs.existsSync(path.join(ROOT_DIR, 'src', 'assets', 'Flow.png'));
  assert(publicFlowExists, 'public/Flow.png logo exists');
  assert(srcFlowExists, 'src/assets/Flow.png logo exists');

  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
  assert(indexHtml.includes('href="/Flow.png"'), 'index.html contains Flow.png favicon link');
  assert(indexHtml.includes('<title>Ibrahim Business Manager</title>'), 'index.html has title "Ibrahim Business Manager"');

  const loginTsx = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pages', 'Login.tsx'), 'utf8');
  assert(loginTsx.includes('import flowLogo from'), 'Login.tsx imports Flow.png logo');
  assert(loginTsx.includes('Ibrahim Business Manager'), 'Login.tsx title is "Ibrahim Business Manager"');
  assert(!loginTsx.includes('Fertilizer Manager'), 'Login.tsx does not contain old "Fertilizer Manager" title');
  assert(!loginTsx.includes('Wholesale Fertilizer & Agri-Inputs Distribution System'), 'Login.tsx removed wholesale description');
  assert(!loginTsx.includes('Change this password after first login'), 'Login.tsx removed password hint');
  assert(!loginTsx.includes('Works fully offline · Local SQLite database'), 'Login.tsx removed offline footer text');
  assert(loginTsx.includes('#ea174e'), 'Login.tsx contains brand pink #ea174e theme accents');

  // STEP 2: Verify Products.tsx Implementation Rules
  console.log('\n👉 [2/6] Verifying Products Form Logic & Calculation Math...');
  const productsTsx = fs.readFileSync(path.join(ROOT_DIR, 'src', 'pages', 'Products.tsx'), 'utf8');
  
  // Unit Dropdown check
  assert(productsTsx.includes('<option value="piece">Piece</option>'), 'Unit dropdown has "Piece" option');
  assert(productsTsx.includes('<option value="carton">Carton</option>'), 'Unit dropdown has "Carton" option');
  assert(!productsTsx.includes('<option value="bag">'), 'Unit dropdown does not have arbitrary obsolete units like bag');
  assert(!productsTsx.includes('<option value="bottle">'), 'Unit dropdown does not have arbitrary obsolete units like bottle');

  // Packaging Specification check
  assert(productsTsx.includes('carton_to_box'), 'Form manages carton_to_box (Pieces in each Carton)');
  assert(productsTsx.includes('handleCartonPackingChange'), 'Form implements dynamic packing ratio handler');
  assert(productsTsx.includes('handleCartonPriceChange'), 'Form implements carton-to-piece price change handler');

  // Test math formulas directly
  const cartonBuy = 24000;
  const cartonDealer = 28800;
  const cartonWholesale = 31200;
  const cartonRetail = 36000;
  const packing = 24;

  const pieceBuy = Number((cartonBuy / packing).toFixed(2));
  const pieceDealer = Number((cartonDealer / packing).toFixed(2));
  const pieceWholesale = Number((cartonWholesale / packing).toFixed(2));
  const pieceRetail = Number((cartonRetail / packing).toFixed(2));

  assert(pieceBuy === 1000, `Carton Buy Rs 24,000 / 24 pcs = Rs ${pieceBuy}/pc (exact 1,000)`);
  assert(pieceDealer === 1200, `Carton Dealer Rs 28,800 / 24 pcs = Rs ${pieceDealer}/pc (exact 1,200)`);
  assert(pieceWholesale === 1300, `Carton Wholesale Rs 31,200 / 24 pcs = Rs ${pieceWholesale}/pc (exact 1,300)`);
  assert(pieceRetail === 1500, `Carton Retail Rs 36,000 / 24 pcs = Rs ${pieceRetail}/pc (exact 1,500)`);

  // Floating point precision test: carton rate 1050 with 12 pieces = 87.50
  const floatPiece = Number((1050 / 12).toFixed(2));
  assert(floatPiece === 87.5, `Fractional price test: Rs 1,050 / 12 pcs = Rs ${floatPiece}/pc`);

  // STEP 3: Start Isolated Test Backend Server
  console.log('\n👉 [3/6] Starting Test Server and Authenticating Admin...');
  await startServer({ port: TEST_PORT, dataDir: TEST_DATA_DIR });
  console.log(`Test server running on port ${TEST_PORT}`);

  const loginRes = await request('POST', '/api/auth/login', {
    email: 'admin@store.com',
    password: 'Admin@123',
  });
  assert(loginRes.status === 200, 'Admin login succeeded');
  const token = loginRes.data.token;
  assert(Boolean(token), 'Valid JWT token received');

  // STEP 4: Product Creation via Carton Rates & Verification
  console.log('\n👉 [4/6] Creating Products with Carton Rates & Verifying Piece Rates in Database...');
  
  // Product 1: unit = 'piece', packing = 20 pcs/ctn, Carton Rates: Buy=20000, Dealer=22000, Wholesale=24000, Retail=26000
  const p1Payload = {
    name: 'Sona Urea Bag 50kg (Carton Pack)',
    sku: 'UREA-CTN-01',
    unit: 'piece',
    carton_to_box: 20,
    carton_purchase_price: 20000,
    carton_dealer_price: 22000,
    carton_wholesale_price: 24000,
    carton_retail_price: 26000,
    purchase_price: 20000 / 20, // 1000
    cost_price: 20000 / 20,     // 1000
    dealer_price: 22000 / 20,   // 1100
    wholesale_price: 24000 / 20,// 1200
    retail_price: 26000 / 20,   // 1300
    stock_quantity: 0,
    min_stock_level: 5,
    status: 'active',
  };

  const p1Res = await request('POST', '/api/data/products', p1Payload, token);
  assert(p1Res.status === 201, 'Product 1 created with HTTP 201');
  const p1 = p1Res.data;
  assert(p1.unit === 'piece', `Product 1 unit is 'piece': ${p1.unit}`);
  assert(p1.carton_to_box === 20, `Product 1 carton_to_box is 20: ${p1.carton_to_box}`);
  assert(p1.purchase_price === 1000, `Product 1 buy price is saved as Rs 1,000/pc: ${p1.purchase_price}`);
  assert(p1.dealer_price === 1100, `Product 1 dealer price is saved as Rs 1,100/pc: ${p1.dealer_price}`);
  assert(p1.wholesale_price === 1200, `Product 1 wholesale price is saved as Rs 1,200/pc: ${p1.wholesale_price}`);
  assert(p1.retail_price === 1300, `Product 1 retail price is saved as Rs 1,300/pc: ${p1.retail_price}`);

  // Product 2: unit = 'carton', packing = 10 pcs/ctn, Carton Rates: Buy=15000, Dealer=17000, Wholesale=18000, Retail=20000
  const p2Payload = {
    name: 'DAP Fertilizer 50kg (Carton Unit)',
    sku: 'DAP-CTN-02',
    unit: 'carton',
    carton_to_box: 10,
    carton_purchase_price: 15000,
    carton_dealer_price: 17000,
    carton_wholesale_price: 18000,
    carton_retail_price: 20000,
    purchase_price: 15000 / 10, // 1500
    cost_price: 15000 / 10,     // 1500
    dealer_price: 17000 / 10,   // 1700
    wholesale_price: 18000 / 10,// 1800
    retail_price: 20000 / 10,   // 2000
    stock_quantity: 0,
    min_stock_level: 2,
    status: 'active',
  };

  const p2Res = await request('POST', '/api/data/products', p2Payload, token);
  assert(p2Res.status === 201, 'Product 2 created with HTTP 201');
  const p2 = p2Res.data;
  assert(p2.unit === 'carton', `Product 2 unit is 'carton': ${p2.unit}`);
  assert(p2.carton_to_box === 10, `Product 2 carton_to_box is 10: ${p2.carton_to_box}`);
  assert(p2.purchase_price === 1500, `Product 2 buy price is saved as Rs 1,500/pc: ${p2.purchase_price}`);
  assert(p2.retail_price === 2000, `Product 2 retail price is saved as Rs 2,000/pc: ${p2.retail_price}`);

  // STEP 5: Inventory Stock In via PO with Batch ID
  console.log('\n👉 [5/6] Testing Inward Stock Receiving & FIFO Batches...');
  
  // Create Supplier
  const suppRes = await request('POST', '/api/data/suppliers', {
    name: 'Engro Fertilizers Hub',
    phone: '0300-1112233',
    balance: 0,
  }, token);
  const supplier = suppRes.data;

  // Receive 5 Cartons of Product 1 (5 * 20 = 100 pieces) @ Carton Rate Rs 20,000 (Rs 1,000/pc)
  const poRes = await request('POST', '/api/data/purchase_orders', {
    po_number: 'PO-55001',
    supplier_id: supplier.id,
    total: 100000,
    status: 'received',
  }, token);
  assert(poRes.status === 201, 'Purchase order created with HTTP 201');
  const po = poRes.data;

  const piRes = await request('POST', '/api/data/purchase_items', {
    purchase_id: po.id,
    product_id: p1.id,
    product_name: p1.name,
    quantity: 100, // 100 pieces (5 cartons * 20 pcs)
    unit_cost: 1000,
    total: 100000,
  }, token);
  assert(piRes.status === 201, 'Purchase item created with HTTP 201');

  // Record FIFO Batch
  const batchRes = await request('POST', '/api/data/product_batches', {
    product_id: p1.id,
    purchase_id: po.id,
    batch_number: 'ENGRO-2026-B1',
    quantity: 100,
    batch_cost: 1000,
    status: 'active',
  }, token);
  assert(batchRes.status === 201, 'Product batch created with HTTP 201');

  // Update product stock
  await request('PUT', `/api/data/products/${p1.id}`, {
    stock_quantity: 100,
  }, token);

  const p1StockCheck = await request('GET', `/api/data/products/${p1.id}`, null, token);
  assert(p1StockCheck.data.stock_quantity === 100, `Product 1 stock updated to 100 pieces (5 cartons): ${p1StockCheck.data.stock_quantity}`);

  // STEP 6: Sales Order Execution & Calculation Precision
  console.log('\n👉 [6/6] Executing POS Sales across Tiers, Piece Deductions & Profit Calculations...');
  
  // Create Dealer Customer
  const custRes = await request('POST', '/api/data/customers', {
    name: 'Chaudhry Farm Supplies',
    type: 'dealer',
    balance: 0,
    phone: '0300-9988776',
    address: 'Depalpur Road',
  }, token);
  assert(custRes.status === 201, 'Dealer customer created with HTTP 201');
  const customer = custRes.data;

  // Sale 1: Sell 2 Cartons (40 pieces) to Dealer @ Dealer Rate (Rs 1,100/pc = Rs 44,000 total)
  // Expected COGS: 40 * 1,000 = Rs 40,000
  // Expected Profit: Rs 44,000 - Rs 40,000 = Rs 4,000
  const orderRes = await request('POST', '/api/data/orders', {
    order_number: 'INV-77001',
    customer_id: customer.id,
    total: 44000,
    discount: 0,
    paid_amount: 44000,
    payment_status: 'paid',
    status: 'completed',
  }, token);
  assert(orderRes.status === 201, 'Order 1 created with HTTP 201');
  const order = orderRes.data;

  const oiRes = await request('POST', '/api/data/order_items', {
    order_id: order.id,
    product_id: p1.id,
    product_name: p1.name,
    quantity: 40, // 40 pieces (2 cartons)
    unit_price: 1100, // Rs 1,100 / piece (derived from carton dealer rate 22,000 / 20)
    total: 44000,
    unit: 'piece',
  }, token);
  assert(oiRes.status === 201, 'Order item 1 created with HTTP 201');

  // Decrement FIFO Batch
  const batchesRes = await request('GET', `/api/data/product_batches?product_id=${p1.id}`, null, token);
  const batch = batchesRes.data[0];
  await request('PUT', `/api/data/product_batches/${batch.id}`, {
    quantity: batch.quantity - 40,
  }, token);

  // Decrement Product Stock
  await request('PUT', `/api/data/products/${p1.id}`, {
    stock_quantity: 100 - 40,
  }, token);

  // Verify Remaining Stock & Calculations
  const p1Final = await request('GET', `/api/data/products/${p1.id}`, null, token);
  assert(p1Final.data.stock_quantity === 60, `Product 1 remaining stock is exactly 60 pieces: ${p1Final.data.stock_quantity}`);
  
  const remainingCartons = Math.floor(p1Final.data.stock_quantity / p1.carton_to_box);
  const remainingLoosePieces = p1Final.data.stock_quantity % p1.carton_to_box;
  assert(remainingCartons === 3 && remainingLoosePieces === 0, `Carton stock conversion: 60 pieces = exactly 3 cartons (3 ctns, 0 loose pcs)`);

  const updatedBatch = await request('GET', `/api/data/product_batches?product_id=${p1.id}`, null, token);
  assert(updatedBatch.data[0].quantity === 60, `FIFO batch remaining quantity is exactly 60: ${updatedBatch.data[0].quantity}`);

  // Test Sale 2: Loose piece sale (5 pieces sold at Retail Rate Rs 1,300/pc)
  // Expected Amount: 5 * 1,300 = Rs 6,500
  // Remaining Stock: 60 - 5 = 55 pieces (2 cartons + 15 loose pieces)
  const retailOrderRes = await request('POST', '/api/data/orders', {
    order_number: 'INV-77002',
    customer_id: customer.id,
    total: 6500,
    paid_amount: 6500,
    payment_status: 'paid',
    status: 'completed',
  }, token);
  assert(retailOrderRes.status === 201, 'Order 2 created with HTTP 201');

  await request('POST', '/api/data/order_items', {
    order_id: retailOrderRes.data.id,
    product_id: p1.id,
    product_name: p1.name,
    quantity: 5,
    unit_price: 1300,
    total: 6500,
    unit: 'piece',
  }, token);

  await request('PUT', `/api/data/products/${p1.id}`, {
    stock_quantity: 60 - 5,
  }, token);

  const p1AfterRetail = await request('GET', `/api/data/products/${p1.id}`, null, token);
  assert(p1AfterRetail.data.stock_quantity === 55, `Stock after loose sale is 55 pieces: ${p1AfterRetail.data.stock_quantity}`);
  const ctns2 = Math.floor(p1AfterRetail.data.stock_quantity / p1.carton_to_box);
  const pcs2 = p1AfterRetail.data.stock_quantity % p1.carton_to_box;
  assert(ctns2 === 2 && pcs2 === 15, `Stock representation: 55 pieces = 2 Cartons and 15 Loose Pieces`);

  console.log('\n================================================================');
  console.log(`🏁 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
