import { getDb, initDatabase } from '../server/database/connection.js';

async function main() {
  await initDatabase();
  const db = getDb();
  const logs = db.exec("SELECT id, user_name, action, details, created_at FROM audit_logs WHERE action LIKE '%RESET%'");
  console.log('RESET LOGS:', JSON.stringify(logs[0]?.values || []));

  const allOrders = db.exec("SELECT COUNT(*) FROM orders");
  console.log('Total orders:', allOrders[0]?.values[0][0]);

  const allPOs = db.exec("SELECT COUNT(*) FROM purchase_orders");
  console.log('Total POs:', allPOs[0]?.values[0][0]);

  const allOrderPayments = db.exec("SELECT COUNT(*) FROM order_payments");
  console.log('Total Order Payments:', allOrderPayments[0]?.values[0][0]);

  const allSupplierPayments = db.exec("SELECT COUNT(*) FROM supplier_payments");
  console.log('Total Supplier Payments:', allSupplierPayments[0]?.values[0][0]);

  const ordDates = db.exec("SELECT MIN(created_at), MAX(created_at) FROM order_payments");
  console.log('Order payments range:', ordDates[0]?.values);

  const beforeResetOrd = db.exec("SELECT COUNT(*) FROM order_payments WHERE created_at < '2026-09-11T15:27:02'");
  console.log('Order payments before reset:', beforeResetOrd[0]?.values[0][0]);

  const orphaned = db.exec("SELECT id, supplier_id, purchase_id, amount FROM supplier_payments WHERE (supplier_id IS NOT NULL AND supplier_id NOT IN (SELECT id FROM suppliers)) OR (purchase_id IS NOT NULL AND purchase_id NOT IN (SELECT id FROM purchase_orders)) OR (supplier_id IS NULL AND purchase_id IS NULL)");
  console.log('Orphaned payments:', JSON.stringify(orphaned[0]?.values, null, 2));
}

main().catch(console.error);
