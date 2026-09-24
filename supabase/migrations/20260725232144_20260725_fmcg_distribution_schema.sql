/*
# FMCG Biscuit Distribution Management System — Schema Extension

1. Overview
Transforms the generic inventory system into a full FMCG (biscuits & snacks) distribution
management system with the complete business flow: Purchase → GRN → Inventory → Sales Order →
Delivery → Invoice → Payment → Returns → Reports → Finance.

This migration:
  - Adds new tables: companies, routes, sales_reps, product_batches, deliveries, delivery_items,
    sales_returns, purchase_returns, claims, audit_logs.
  - Extends existing tables (products, customers, suppliers, orders, purchase_orders) with
    FMCG-specific columns using ADD COLUMN IF NOT EXISTS (non-destructive).
  - Seeds default FMCG expense categories.

2. New Tables
- `companies` — FMCG manufacturers (LU, Bisconni, Cakes, etc.) with contact details.
- `routes` — delivery routes assigned to sales reps and drivers.
- `sales_reps` — sales representatives with commission rates and assigned routes.
- `product_batches` — batch tracking with manufacturing date, expiry date, batch cost, quantity.
- `deliveries` — delivery challans linking orders to vehicles, drivers, routes.
- `delivery_items` — line items per delivery with delivered vs pending quantities.
- `sales_returns` — customer returns with reason and resolution (refund/replacement/credit note).
- `purchase_returns` — returns to suppliers with reason and credit note.
- `claims` — damage/expired/supplier claims with status tracking.
- `audit_logs` — audit trail of every transaction type.

3. Modified Tables
- `products`: + company_id, cost_price, promotional_price, min_selling_price, description,
  carton_to_box, box_to_pack, pack_to_piece (unit conversion factors).
- `customers`: + type (retailer/wholesaler/dealer), owner_name, cnic, area, route_id,
  sales_rep_id, credit_limit, opening_balance.
- `suppliers`: + company_id, opening_balance, contact_person.
- `orders`: + sales_rep_id, route_id, delivery_date, invoice_number.
- `purchase_orders`: + expected_delivery_date, received_date.

4. Security
- RLS enabled on every new table.
- All CRUD allowed for `anon, authenticated` (single-tenant no-auth app, intentionally shared data).
- 4 separate policies per table (select/insert/update/delete), no FOR ALL.

5. Notes
- All ADD COLUMN statements use IF NOT EXISTS so the migration is safe to re-run.
- No existing columns are dropped, renamed, or type-changed — no data loss risk.
- Foreign keys use ON DELETE SET NULL for optional references, ON DELETE CASCADE for child rows.
*/

-- ============================================================
-- NEW TABLE: companies
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_companies" ON companies;
CREATE POLICY "anon_select_companies" ON companies FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_companies" ON companies;
CREATE POLICY "anon_insert_companies" ON companies FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_companies" ON companies;
CREATE POLICY "anon_update_companies" ON companies FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_companies" ON companies;
CREATE POLICY "anon_delete_companies" ON companies FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- NEW TABLE: routes
-- ============================================================
CREATE TABLE IF NOT EXISTS routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  area text,
  driver_name text,
  vehicle text,
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_routes" ON routes;
CREATE POLICY "anon_select_routes" ON routes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_routes" ON routes;
CREATE POLICY "anon_insert_routes" ON routes FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_routes" ON routes;
CREATE POLICY "anon_update_routes" ON routes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_routes" ON routes;
CREATE POLICY "anon_delete_routes" ON routes FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- NEW TABLE: sales_reps
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_reps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  route_id uuid REFERENCES routes(id) ON DELETE SET NULL,
  commission_rate numeric(5,2) DEFAULT 0,
  target_monthly numeric(12,2) DEFAULT 0,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sales_reps ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_sales_reps" ON sales_reps;
CREATE POLICY "anon_select_sales_reps" ON sales_reps FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_sales_reps" ON sales_reps;
CREATE POLICY "anon_insert_sales_reps" ON sales_reps FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_sales_reps" ON sales_reps;
CREATE POLICY "anon_update_sales_reps" ON sales_reps FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_sales_reps" ON sales_reps;
CREATE POLICY "anon_delete_sales_reps" ON sales_reps FOR DELETE TO anon, authenticated USING (true);

-- ============================================================
-- EXTEND: products — add FMCG columns
-- ============================================================
DO $$ BEGIN
  ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price numeric(12,2) DEFAULT 0;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS promotional_price numeric(12,2) DEFAULT 0;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS min_selling_price numeric(12,2) DEFAULT 0;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS description text;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS carton_to_box numeric(14,3) DEFAULT 0;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS box_to_pack numeric(14,3) DEFAULT 0;
  ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_to_piece numeric(14,3) DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);

-- ============================================================
-- EXTEND: customers — add FMCG columns
-- ============================================================
DO $$ BEGIN
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS type text DEFAULT 'retailer';
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS owner_name text;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS cnic text;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS area text;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS route_id uuid REFERENCES routes(id) ON DELETE SET NULL;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS sales_rep_id uuid REFERENCES sales_reps(id) ON DELETE SET NULL;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit numeric(12,2) DEFAULT 0;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS opening_balance numeric(12,2) DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(type);
CREATE INDEX IF NOT EXISTS idx_customers_route ON customers(route_id);
CREATE INDEX IF NOT EXISTS idx_customers_sales_rep ON customers(sales_rep_id);

-- ============================================================
-- EXTEND: suppliers — add FMCG columns
-- ============================================================
DO $$ BEGIN
  ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL;
  ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS opening_balance numeric(12,2) DEFAULT 0;
  ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_person text;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers(company_id);

-- ============================================================
-- EXTEND: orders — add FMCG columns
-- ============================================================
DO $$ BEGIN
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS sales_rep_id uuid REFERENCES sales_reps(id) ON DELETE SET NULL;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS route_id uuid REFERENCES routes(id) ON DELETE SET NULL;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_date date;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_number text;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_orders_sales_rep ON orders(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_orders_invoice ON orders(invoice_number);

-- ============================================================
-- EXTEND: purchase_orders — add FMCG columns
-- ============================================================
DO $$ BEGIN
  ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS expected_delivery_date date;
  ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_date date;
  ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS discount numeric(12,2) DEFAULT 0;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ============================================================
-- NEW TABLE: product_batches
-- ============================================================
CREATE TABLE IF NOT EXISTS product_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  batch_number text NOT NULL,
  manufacturing_date date,
  expiry_date date,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  damaged_quantity numeric(14,3) DEFAULT 0,
  batch_cost numeric(12,2) DEFAULT 0,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE product_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_product_batches" ON product_batches;
CREATE POLICY "anon_select_product_batches" ON product_batches FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_product_batches" ON product_batches;
CREATE POLICY "anon_insert_product_batches" ON product_batches FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_product_batches" ON product_batches;
CREATE POLICY "anon_update_product_batches" ON product_batches FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_product_batches" ON product_batches;
CREATE POLICY "anon_delete_product_batches" ON product_batches FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_batches_product ON product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON product_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_batches_status ON product_batches(status);

-- ============================================================
-- NEW TABLE: deliveries
-- ============================================================
CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_number text NOT NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  route_id uuid REFERENCES routes(id) ON DELETE SET NULL,
  vehicle text,
  driver_name text,
  dispatch_date date NOT NULL DEFAULT CURRENT_DATE,
  delivered_date date,
  status text DEFAULT 'pending',
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_deliveries" ON deliveries;
CREATE POLICY "anon_select_deliveries" ON deliveries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_deliveries" ON deliveries;
CREATE POLICY "anon_insert_deliveries" ON deliveries FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_deliveries" ON deliveries;
CREATE POLICY "anon_update_deliveries" ON deliveries FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_deliveries" ON deliveries;
CREATE POLICY "anon_delete_deliveries" ON deliveries FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_deliveries_order ON deliveries(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_route ON deliveries(route_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);

-- ============================================================
-- NEW TABLE: delivery_items
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text,
  ordered_quantity numeric(14,3) NOT NULL DEFAULT 0,
  delivered_quantity numeric(14,3) DEFAULT 0,
  pending_quantity numeric(14,3) DEFAULT 0,
  batch_number text
);

ALTER TABLE delivery_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_delivery_items" ON delivery_items;
CREATE POLICY "anon_select_delivery_items" ON delivery_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_delivery_items" ON delivery_items;
CREATE POLICY "anon_insert_delivery_items" ON delivery_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_delivery_items" ON delivery_items;
CREATE POLICY "anon_update_delivery_items" ON delivery_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_delivery_items" ON delivery_items;
CREATE POLICY "anon_delete_delivery_items" ON delivery_items FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_delivery_items_delivery ON delivery_items(delivery_id);

-- ============================================================
-- NEW TABLE: sales_returns
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text NOT NULL,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  unit_price numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) DEFAULT 0,
  reason text NOT NULL DEFAULT 'damaged',
  resolution text DEFAULT 'refund',
  status text DEFAULT 'pending',
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE sales_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_sales_returns" ON sales_returns;
CREATE POLICY "anon_select_sales_returns" ON sales_returns FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_sales_returns" ON sales_returns;
CREATE POLICY "anon_insert_sales_returns" ON sales_returns FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_sales_returns" ON sales_returns;
CREATE POLICY "anon_update_sales_returns" ON sales_returns FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_sales_returns" ON sales_returns;
CREATE POLICY "anon_delete_sales_returns" ON sales_returns FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_sales_returns_customer ON sales_returns(customer_id);
CREATE INDEX IF NOT EXISTS idx_sales_returns_order ON sales_returns(order_id);

-- ============================================================
-- NEW TABLE: purchase_returns
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_number text NOT NULL,
  purchase_id uuid REFERENCES purchase_orders(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text,
  quantity numeric(14,3) NOT NULL DEFAULT 0,
  unit_cost numeric(12,2) DEFAULT 0,
  total_amount numeric(12,2) DEFAULT 0,
  reason text NOT NULL DEFAULT 'damaged',
  status text DEFAULT 'pending',
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE purchase_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_purchase_returns" ON purchase_returns;
CREATE POLICY "anon_select_purchase_returns" ON purchase_returns FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_purchase_returns" ON purchase_returns;
CREATE POLICY "anon_insert_purchase_returns" ON purchase_returns FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_purchase_returns" ON purchase_returns;
CREATE POLICY "anon_update_purchase_returns" ON purchase_returns FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_purchase_returns" ON purchase_returns;
CREATE POLICY "anon_delete_purchase_returns" ON purchase_returns FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier ON purchase_returns(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_returns_purchase ON purchase_returns(purchase_id);

-- ============================================================
-- NEW TABLE: claims
-- ============================================================
CREATE TABLE IF NOT EXISTS claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number text NOT NULL,
  type text NOT NULL DEFAULT 'damage',
  party_type text,
  party_id uuid,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text,
  quantity numeric(14,3) DEFAULT 0,
  amount numeric(12,2) DEFAULT 0,
  reason text,
  status text DEFAULT 'pending',
  resolution text,
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_claims" ON claims;
CREATE POLICY "anon_select_claims" ON claims FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_claims" ON claims;
CREATE POLICY "anon_insert_claims" ON claims FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_claims" ON claims;
CREATE POLICY "anon_update_claims" ON claims FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_claims" ON claims;
CREATE POLICY "anon_delete_claims" ON claims FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_claims_type ON claims(type);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);

-- ============================================================
-- NEW TABLE: audit_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_audit_logs" ON audit_logs;
CREATE POLICY "anon_select_audit_logs" ON audit_logs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_audit_logs" ON audit_logs;
CREATE POLICY "anon_insert_audit_logs" ON audit_logs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_audit_logs" ON audit_logs;
CREATE POLICY "anon_update_audit_logs" ON audit_logs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_audit_logs" ON audit_logs;
CREATE POLICY "anon_delete_audit_logs" ON audit_logs FOR DELETE TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- ============================================================
-- SEED: FMCG expense categories
-- ============================================================
INSERT INTO expense_categories (name)
SELECT 'Fuel' WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Fuel');
INSERT INTO expense_categories (name)
SELECT 'Electricity' WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Electricity');
INSERT INTO expense_categories (name)
SELECT 'Internet' WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Internet');
INSERT INTO expense_categories (name)
SELECT 'Vehicle Maintenance' WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Vehicle Maintenance');
INSERT INTO expense_categories (name)
SELECT 'Office Supplies' WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Office Supplies');
INSERT INTO expense_categories (name)
SELECT 'Marketing' WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Marketing');
