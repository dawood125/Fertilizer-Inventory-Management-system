/*
# Create settings tables and seed default data (single-tenant, no auth)

1. Overview
Creates a settings table for business info, tax, invoice config, and users table for staff.
Seeds default payment accounts (cash, bank, jazzcash, easypaisa), a default tax rate,
and default business settings.

2. New Tables
- `settings` — key/value store for business, tax, invoice, backup configuration (single row)
- `app_users` — staff users (name, email, role, password hash placeholder, active)
- `tax_rates` — tax rates (name, percentage, inclusive/exclusive)

3. Security
- RLS enabled on every table.
- All CRUD allowed for `anon, authenticated` (single-tenant no-auth app).
*/

CREATE TABLE IF NOT EXISTS settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name text DEFAULT 'My Store',
  logo_url text,
  address text,
  phone text,
  email text,
  currency text DEFAULT 'PKR',
  currency_symbol text DEFAULT 'Rs',
  timezone text DEFAULT 'Asia/Karachi',
  receipt_footer text,
  invoice_prefix text DEFAULT 'INV',
  receipt_size text DEFAULT '80mm',
  terms_conditions text,
  barcode_on_invoice boolean DEFAULT true,
  tax_inclusive boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_settings" ON settings;
CREATE POLICY "anon_select_settings" ON settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_settings" ON settings;
CREATE POLICY "anon_insert_settings" ON settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_settings" ON settings;
CREATE POLICY "anon_update_settings" ON settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_settings" ON settings;
CREATE POLICY "anon_delete_settings" ON settings FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE,
  role text DEFAULT 'staff',
  phone text,
  active boolean DEFAULT true,
  last_login timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_app_users" ON app_users;
CREATE POLICY "anon_select_app_users" ON app_users FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_app_users" ON app_users;
CREATE POLICY "anon_insert_app_users" ON app_users FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_app_users" ON app_users;
CREATE POLICY "anon_update_app_users" ON app_users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_app_users" ON app_users;
CREATE POLICY "anon_delete_app_users" ON app_users FOR DELETE TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  percentage numeric(5,2) NOT NULL DEFAULT 0,
  inclusive boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_tax_rates" ON tax_rates;
CREATE POLICY "anon_select_tax_rates" ON tax_rates FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_tax_rates" ON tax_rates;
CREATE POLICY "anon_insert_tax_rates" ON tax_rates FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_tax_rates" ON tax_rates;
CREATE POLICY "anon_update_tax_rates" ON tax_rates FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_tax_rates" ON tax_rates;
CREATE POLICY "anon_delete_tax_rates" ON tax_rates FOR DELETE TO anon, authenticated USING (true);

-- Seed default settings row
INSERT INTO settings (store_name)
SELECT 'My Store'
WHERE NOT EXISTS (SELECT 1 FROM settings);

-- Seed default payment accounts
INSERT INTO payment_accounts (type, name, balance)
SELECT 'cash', 'Cash', 0
WHERE NOT EXISTS (SELECT 1 FROM payment_accounts WHERE type = 'cash');

INSERT INTO payment_accounts (type, name, balance)
SELECT 'bank', 'Bank', 0
WHERE NOT EXISTS (SELECT 1 FROM payment_accounts WHERE type = 'bank');

INSERT INTO payment_accounts (type, name, balance)
SELECT 'jazzcash', 'JazzCash', 0
WHERE NOT EXISTS (SELECT 1 FROM payment_accounts WHERE type = 'jazzcash');

INSERT INTO payment_accounts (type, name, balance)
SELECT 'easypaisa', 'EasyPaisa', 0
WHERE NOT EXISTS (SELECT 1 FROM payment_accounts WHERE type = 'easypaisa');

-- Seed default tax rate
INSERT INTO tax_rates (name, percentage, inclusive)
SELECT 'GST', 17.00, false
WHERE NOT EXISTS (SELECT 1 FROM tax_rates);

-- Seed default expense categories
INSERT INTO expense_categories (name)
SELECT 'Rent' WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Rent');
INSERT INTO expense_categories (name)
SELECT 'Utilities' WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Utilities');
INSERT INTO expense_categories (name)
SELECT 'Salaries' WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Salaries');
INSERT INTO expense_categories (name)
SELECT 'Transport' WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Transport');
INSERT INTO expense_categories (name)
SELECT 'Miscellaneous' WHERE NOT EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Miscellaneous');
