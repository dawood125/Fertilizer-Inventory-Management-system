/*
# Create core inventory management tables (single-tenant, no auth)

1. Overview
This migration creates the foundational tables for a single-store Inventory Management System.
The app has no sign-in screen, so all policies use `TO anon, authenticated` with `USING (true)` —
the data is intentionally shared/public within the single store.

2. New Tables
- `categories` — product categories (name, description, color)
- `brands` — product brands (name, description)
- `products` — the core catalog (name, sku, barcode, prices, stock, category, brand)
- `customers` — customer records (name, phone, email, address, balance, loyalty points)
- `suppliers` — supplier records (name, phone, email, address, balance)
- `stock_movements` — audit log of every stock change (in/out/adjustment/damaged/expired)
- `expense_categories` — categories for expenses
- `expenses` — expense records (amount, category, date, receipt note)
- `payment_accounts` — cash, bank, jazzcash, easypaisa balances (single-row per account type)

3. Security
- RLS enabled on every table.
- All CRUD allowed for `anon, authenticated` because this is a single-tenant no-auth app.
*/

CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  color text DEFAULT '#0ea5e9',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_categories" ON categories;
CREATE POLICY "anon_select_categories" ON categories FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_categories" ON categories;
CREATE POLICY "anon_insert_categories" ON categories FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_categories" ON categories;
CREATE POLICY "anon_update_categories" ON categories FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_categories" ON categories;
CREATE POLICY "anon_delete_categories" ON categories FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_brands" ON brands;
CREATE POLICY "anon_select_brands" ON brands FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_brands" ON brands;
CREATE POLICY "anon_insert_brands" ON brands FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_brands" ON brands;
CREATE POLICY "anon_update_brands" ON brands FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_brands" ON brands;
CREATE POLICY "anon_delete_brands" ON brands FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sku text,
  barcode text,
  image_url text,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  brand_id uuid REFERENCES brands(id) ON DELETE SET NULL,
  purchase_price numeric(12,2) DEFAULT 0,
  retail_price numeric(12,2) DEFAULT 0,
  wholesale_price numeric(12,2) DEFAULT 0,
  dealer_price numeric(12,2) DEFAULT 0,
  special_price numeric(12,2) DEFAULT 0,
  stock_quantity numeric(14,3) DEFAULT 0,
  min_stock_level numeric(14,3) DEFAULT 0,
  unit text DEFAULT 'pcs',
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_products" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_products" ON products;
CREATE POLICY "anon_insert_products" ON products FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_products" ON products;
CREATE POLICY "anon_update_products" ON products FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_products" ON products;
CREATE POLICY "anon_delete_products" ON products FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  address text,
  balance numeric(12,2) DEFAULT 0,
  loyalty_points numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_customers" ON customers;
CREATE POLICY "anon_select_customers" ON customers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_customers" ON customers;
CREATE POLICY "anon_insert_customers" ON customers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_customers" ON customers;
CREATE POLICY "anon_update_customers" ON customers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_customers" ON customers;
CREATE POLICY "anon_delete_customers" ON customers FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  address text,
  balance numeric(12,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_suppliers" ON suppliers;
CREATE POLICY "anon_select_suppliers" ON suppliers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_suppliers" ON suppliers;
CREATE POLICY "anon_insert_suppliers" ON suppliers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_suppliers" ON suppliers;
CREATE POLICY "anon_update_suppliers" ON suppliers FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_suppliers" ON suppliers;
CREATE POLICY "anon_delete_suppliers" ON suppliers FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) ON DELETE CASCADE,
  type text NOT NULL,
  quantity numeric(14,3) NOT NULL,
  reference_type text,
  reference_id uuid,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_stock_movements" ON stock_movements;
CREATE POLICY "anon_select_stock_movements" ON stock_movements FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_stock_movements" ON stock_movements;
CREATE POLICY "anon_insert_stock_movements" ON stock_movements FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_stock_movements" ON stock_movements;
CREATE POLICY "anon_update_stock_movements" ON stock_movements FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_stock_movements" ON stock_movements;
CREATE POLICY "anon_delete_stock_movements" ON stock_movements FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at);

CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_expense_categories" ON expense_categories;
CREATE POLICY "anon_select_expense_categories" ON expense_categories FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_expense_categories" ON expense_categories;
CREATE POLICY "anon_insert_expense_categories" ON expense_categories FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_expense_categories" ON expense_categories;
CREATE POLICY "anon_update_expense_categories" ON expense_categories FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_expense_categories" ON expense_categories;
CREATE POLICY "anon_delete_expense_categories" ON expense_categories FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid REFERENCES expense_categories(id) ON DELETE SET NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  payment_method text DEFAULT 'cash',
  note text,
  receipt_note text,
  status text DEFAULT 'approved',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_expenses" ON expenses;
CREATE POLICY "anon_select_expenses" ON expenses FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_expenses" ON expenses;
CREATE POLICY "anon_insert_expenses" ON expenses FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_expenses" ON expenses;
CREATE POLICY "anon_update_expenses" ON expenses FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_expenses" ON expenses;
CREATE POLICY "anon_delete_expenses" ON expenses FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);

CREATE TABLE IF NOT EXISTS payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL UNIQUE,
  name text,
  balance numeric(14,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payment_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_payment_accounts" ON payment_accounts;
CREATE POLICY "anon_select_payment_accounts" ON payment_accounts FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_payment_accounts" ON payment_accounts;
CREATE POLICY "anon_insert_payment_accounts" ON payment_accounts FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_payment_accounts" ON payment_accounts;
CREATE POLICY "anon_update_payment_accounts" ON payment_accounts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_payment_accounts" ON payment_accounts;
CREATE POLICY "anon_delete_payment_accounts" ON payment_accounts FOR DELETE TO anon, authenticated USING (true);
