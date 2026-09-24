/*
# Create orders, purchases, and transaction tables (single-tenant, no auth)

1. Overview
Creates the sales and purchasing transaction tables plus a unified transactions table
that records every money movement across cash, bank, jazzcash, easypaisa accounts.

2. New Tables
- `orders` — sales orders (POS), with customer, totals, payment status, hold/cancel/return states
- `order_items` — line items per order (product, qty, price, discount, tax)
- `order_payments` — split payments per order (method, amount, account)
- `purchase_orders` — purchases from suppliers, with totals and status
- `purchase_items` — line items per purchase (product, qty, cost)
- `transactions` — unified ledger of all money movements (cash in/out, deposits, transfers, payments received/sent)

3. Security
- RLS enabled on every table.
- All CRUD allowed for `anon, authenticated` (single-tenant no-auth app).
*/

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  subtotal numeric(12,2) DEFAULT 0,
  discount numeric(12,2) DEFAULT 0,
  tax numeric(12,2) DEFAULT 0,
  total numeric(12,2) DEFAULT 0,
  paid_amount numeric(12,2) DEFAULT 0,
  status text DEFAULT 'completed',
  payment_status text DEFAULT 'paid',
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_orders" ON orders;
CREATE POLICY "anon_select_orders" ON orders FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_orders" ON orders;
CREATE POLICY "anon_insert_orders" ON orders FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_orders" ON orders;
CREATE POLICY "anon_update_orders" ON orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_orders" ON orders;
CREATE POLICY "anon_delete_orders" ON orders FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) DEFAULT 0,
  tax numeric(12,2) DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_order_items" ON order_items;
CREATE POLICY "anon_select_order_items" ON order_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_order_items" ON order_items;
CREATE POLICY "anon_insert_order_items" ON order_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_order_items" ON order_items;
CREATE POLICY "anon_update_order_items" ON order_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_order_items" ON order_items;
CREATE POLICY "anon_delete_order_items" ON order_items FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

CREATE TABLE IF NOT EXISTS order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  method text NOT NULL,
  account_type text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_order_payments" ON order_payments;
CREATE POLICY "anon_select_order_payments" ON order_payments FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_order_payments" ON order_payments;
CREATE POLICY "anon_insert_order_payments" ON order_payments FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_order_payments" ON order_payments;
CREATE POLICY "anon_update_order_payments" ON order_payments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_order_payments" ON order_payments;
CREATE POLICY "anon_delete_order_payments" ON order_payments FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  subtotal numeric(12,2) DEFAULT 0,
  tax numeric(12,2) DEFAULT 0,
  total numeric(12,2) DEFAULT 0,
  paid_amount numeric(12,2) DEFAULT 0,
  status text DEFAULT 'pending',
  payment_status text DEFAULT 'unpaid',
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_purchase_orders" ON purchase_orders;
CREATE POLICY "anon_select_purchase_orders" ON purchase_orders FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_purchase_orders" ON purchase_orders;
CREATE POLICY "anon_insert_purchase_orders" ON purchase_orders FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_purchase_orders" ON purchase_orders;
CREATE POLICY "anon_update_purchase_orders" ON purchase_orders FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_purchase_orders" ON purchase_orders;
CREATE POLICY "anon_delete_purchase_orders" ON purchase_orders FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_created ON purchase_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);

CREATE TABLE IF NOT EXISTS purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text,
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0
);

ALTER TABLE purchase_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_purchase_items" ON purchase_items;
CREATE POLICY "anon_select_purchase_items" ON purchase_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_purchase_items" ON purchase_items;
CREATE POLICY "anon_insert_purchase_items" ON purchase_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_purchase_items" ON purchase_items;
CREATE POLICY "anon_update_purchase_items" ON purchase_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_purchase_items" ON purchase_items;
CREATE POLICY "anon_delete_purchase_items" ON purchase_items FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON purchase_items(product_id);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  account_type text,
  from_account text,
  to_account text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  reference_type text,
  reference_id uuid,
  party_type text,
  party_id uuid,
  note text,
  date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_transactions" ON transactions;
CREATE POLICY "anon_select_transactions" ON transactions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_transactions" ON transactions;
CREATE POLICY "anon_insert_transactions" ON transactions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_transactions" ON transactions;
CREATE POLICY "anon_update_transactions" ON transactions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_transactions" ON transactions;
CREATE POLICY "anon_delete_transactions" ON transactions FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_type);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
