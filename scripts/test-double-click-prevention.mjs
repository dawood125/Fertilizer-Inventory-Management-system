/**
 * Verification Test: Double-Click & Rapid Duplicate Submission Guard
 */
import { startServer } from '../server/index.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { closeDatabase } from '../server/database/connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDataDir = path.join(__dirname, '../data_test_double_click');

if (fs.existsSync(testDataDir)) {
  fs.rmSync(testDataDir, { recursive: true, force: true });
}
fs.mkdirSync(testDataDir, { recursive: true });

function assert(cond, msg) {
  if (!cond) {
    console.error(`❌ FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

async function run() {
  console.log('Testing Rapid Duplicate Order Safeguard...');
  const port = 3988;
  const { server } = await startServer({ userDataPath: testDataDir, port });
  const apiBase = `http://127.0.0.1:${port}`;

  try {
    // 1. Login
    const loginRes = await fetch(`${apiBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@store.com', password: 'Admin@123' }),
    });
    const { token } = await loginRes.json();
    assert(token, 'Admin logged in');

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    // Create a customer
    const custRes = await fetch(`${apiBase}/api/data/customers`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'Dawood Ahmed', type: 'retailer', balance: 0 }),
    });
    const cust = await custRes.json();
    if (!custRes.ok) console.error('Customer creation error:', cust);
    assert(cust.id, 'Customer created');

    // Simulate 2 rapid concurrent clicks to complete order
    const orderPayload1 = {
      order_number: 'ORD-CLICK-1',
      invoice_number: 'INV-CLICK-1',
      customer_id: cust.id,
      subtotal: 8300,
      total: 8300,
      paid_amount: 8300,
      status: 'completed',
      payment_status: 'paid',
    };

    const orderPayload2 = {
      order_number: 'ORD-CLICK-2',
      invoice_number: 'INV-CLICK-2',
      customer_id: cust.id,
      subtotal: 8300,
      total: 8300,
      paid_amount: 8300,
      status: 'completed',
      payment_status: 'paid',
    };

    console.log('Firing 2 simultaneous rapid order posts...');
    const [res1, res2] = await Promise.all([
      fetch(`${apiBase}/api/data/orders`, { method: 'POST', headers, body: JSON.stringify(orderPayload1) }),
      fetch(`${apiBase}/api/data/orders`, { method: 'POST', headers, body: JSON.stringify(orderPayload2) }),
    ]);

    const ord1 = await res1.json();
    const ord2 = await res2.json();

    console.log(`Order 1 ID: ${ord1.id}, Order 2 ID: ${ord2.id}`);
    assert(ord1.id === ord2.id, 'Both concurrent calls resolved to the SAME order ID (duplicate prevented!)');

    // Verify orders table has only 1 order
    const allOrdersRes = await fetch(`${apiBase}/api/data/orders`, { headers });
    const allOrders = await allOrdersRes.json();
    assert(allOrders.length === 1, `Orders table contains exactly 1 order (got ${allOrders.length})`);

    console.log('✅ Rapid Duplicate Prevention verified with 100% success!\n');
  } finally {
    server.close();
    closeDatabase();
    await new Promise((r) => setTimeout(r, 200));
    if (fs.existsSync(testDataDir)) {
      try { fs.rmSync(testDataDir, { recursive: true, force: true }); } catch {}
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
