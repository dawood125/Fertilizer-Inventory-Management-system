/**
 * Full SQLite schema for wholesale biscuits inventory.
 * Money columns: INTEGER (paisa). Dates: TEXT ISO.
 */

export function runMigrations(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = {};
  const stmt = db.prepare('SELECT name FROM schema_migrations');
  while (stmt.step()) {
    applied[stmt.getAsObject().name] = true;
  }
  stmt.free();

  const migrations = [
    { name: '001_core_tables', sql: MIGRATION_001 },
    { name: '002_orders_purchases', sql: MIGRATION_002 },
    { name: '003_settings_users', sql: MIGRATION_003 },
    { name: '004_fmcg_extension', sql: MIGRATION_004 },
    { name: '005_held_orders_auth', sql: MIGRATION_005 },
    { name: '006_ntn_customer_prices', sql: MIGRATION_006 },
    { name: '007_brand_logo', sql: MIGRATION_007 },
    { name: '008_order_payments_note', sql: MIGRATION_008 },
    { name: '009_supplier_payments_and_returns', sql: MIGRATION_009 },
    { name: '010_default_receipt_a5', sql: MIGRATION_010 },
    { name: '011_fifo_inventory_batches', sql: MIGRATION_011 },
    { name: '012_purchase_item_selling_prices', sql: MIGRATION_012 },
    { name: '013_fertilizer_po_batches', sql: MIGRATION_013 },
  ];

  for (const m of migrations) {
    if (applied[m.name]) continue;
    console.log('[db] Applying migration:', m.name);
    try {
      db.exec(m.sql);
    } catch (err) {
      if (String(err?.message || '').toLowerCase().includes('duplicate column')) {
        console.log(`[db] Column already exists in ${m.name}, continuing`);
      } else {
        throw err;
      }
    }
    db.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', [
      m.name,
      new Date().toISOString(),
    ]);
  }

  console.log('[db] Migrations complete');
}

const MIGRATION_001 = `
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#0ea5e9',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  image_url TEXT,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  brand_id TEXT REFERENCES brands(id) ON DELETE SET NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  purchase_price INTEGER DEFAULT 0,
  retail_price INTEGER DEFAULT 0,
  wholesale_price INTEGER DEFAULT 0,
  dealer_price INTEGER DEFAULT 0,
  special_price INTEGER DEFAULT 0,
  cost_price INTEGER DEFAULT 0,
  promotional_price INTEGER DEFAULT 0,
  min_selling_price INTEGER DEFAULT 0,
  stock_quantity REAL DEFAULT 0,
  min_stock_level REAL DEFAULT 0,
  unit TEXT DEFAULT 'pcs',
  status TEXT DEFAULT 'active',
  description TEXT,
  carton_to_box REAL DEFAULT 0,
  box_to_pack REAL DEFAULT 0,
  pack_to_piece REAL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);

CREATE TABLE IF NOT EXISTS routes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  area TEXT,
  driver_name TEXT,
  vehicle TEXT,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_reps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  route_id TEXT REFERENCES routes(id) ON DELETE SET NULL,
  commission_rate REAL DEFAULT 0,
  target_monthly INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  balance INTEGER DEFAULT 0,
  loyalty_points INTEGER DEFAULT 0,
  type TEXT DEFAULT 'retailer',
  owner_name TEXT,
  cnic TEXT,
  area TEXT,
  route_id TEXT REFERENCES routes(id) ON DELETE SET NULL,
  sales_rep_id TEXT REFERENCES sales_reps(id) ON DELETE SET NULL,
  credit_limit INTEGER DEFAULT 0,
  opening_balance INTEGER DEFAULT 0,
  default_price_type TEXT DEFAULT 'retail',
  allow_manual_override INTEGER DEFAULT 0,
  custom_price INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customers_type ON customers(type);
CREATE INDEX IF NOT EXISTS idx_customers_route ON customers(route_id);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  balance INTEGER DEFAULT 0,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  opening_balance INTEGER DEFAULT 0,
  contact_person TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES products(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  quantity REAL NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);

CREATE TABLE IF NOT EXISTS expense_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category_id TEXT REFERENCES expense_categories(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  payment_method TEXT DEFAULT 'cash',
  note TEXT,
  receipt_note TEXT,
  status TEXT DEFAULT 'approved',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_accounts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL UNIQUE,
  name TEXT,
  balance INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const MIGRATION_002 = `
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  subtotal INTEGER DEFAULT 0,
  discount INTEGER DEFAULT 0,
  tax INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  paid_amount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'completed',
  payment_status TEXT DEFAULT 'paid',
  note TEXT,
  sales_rep_id TEXT REFERENCES sales_reps(id) ON DELETE SET NULL,
  route_id TEXT REFERENCES routes(id) ON DELETE SET NULL,
  delivery_date TEXT,
  invoice_number TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL DEFAULT 0,
  discount INTEGER DEFAULT 0,
  tax INTEGER DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  free_items REAL DEFAULT 0,
  unit TEXT DEFAULT 'piece'
);

CREATE TABLE IF NOT EXISTS order_payments (
  id TEXT PRIMARY KEY,
  order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  account_type TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  po_number TEXT NOT NULL,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  subtotal INTEGER DEFAULT 0,
  tax INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  paid_amount INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',
  payment_status TEXT DEFAULT 'unpaid',
  note TEXT,
  expected_delivery_date TEXT,
  received_date TEXT,
  discount INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_items (
  id TEXT PRIMARY KEY,
  purchase_id TEXT REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT,
  quantity REAL NOT NULL DEFAULT 1,
  unit_cost INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  account_type TEXT,
  from_account TEXT,
  to_account TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  reference_type TEXT,
  reference_id TEXT,
  party_type TEXT,
  party_id TEXT,
  note TEXT,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
`;

const MIGRATION_003 = `
CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  store_name TEXT DEFAULT 'My Store',
  logo_url TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  currency TEXT DEFAULT 'PKR',
  currency_symbol TEXT DEFAULT 'Rs',
  timezone TEXT DEFAULT 'Asia/Karachi',
  receipt_footer TEXT,
  invoice_prefix TEXT DEFAULT 'INV',
  receipt_size TEXT DEFAULT 'A4',
  terms_conditions TEXT,
  barcode_on_invoice INTEGER DEFAULT 1,
  tax_inclusive INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT DEFAULT 'staff',
  phone TEXT,
  active INTEGER DEFAULT 1,
  last_login TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tax_rates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  percentage REAL NOT NULL DEFAULT 0,
  inclusive INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const MIGRATION_004 = `
CREATE TABLE IF NOT EXISTS product_batches (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  manufacturing_date TEXT,
  expiry_date TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  damaged_quantity REAL DEFAULT 0,
  batch_cost INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_batches_product ON product_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON product_batches(expiry_date);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  challan_number TEXT NOT NULL,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  route_id TEXT REFERENCES routes(id) ON DELETE SET NULL,
  vehicle TEXT,
  driver_name TEXT,
  dispatch_date TEXT NOT NULL,
  delivered_date TEXT,
  status TEXT DEFAULT 'pending',
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_items (
  id TEXT PRIMARY KEY,
  delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT,
  ordered_quantity REAL NOT NULL DEFAULT 0,
  delivered_quantity REAL DEFAULT 0,
  pending_quantity REAL DEFAULT 0,
  batch_number TEXT
);

CREATE TABLE IF NOT EXISTS sales_returns (
  id TEXT PRIMARY KEY,
  return_number TEXT NOT NULL,
  order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  unit_price INTEGER DEFAULT 0,
  total_amount INTEGER DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'damaged',
  resolution TEXT DEFAULT 'refund',
  status TEXT DEFAULT 'pending',
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id TEXT PRIMARY KEY,
  return_number TEXT NOT NULL,
  purchase_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  unit_cost INTEGER DEFAULT 0,
  total_amount INTEGER DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'damaged',
  status TEXT DEFAULT 'pending',
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  claim_number TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'damage',
  party_type TEXT,
  party_id TEXT,
  product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT,
  quantity REAL DEFAULT 0,
  amount INTEGER DEFAULT 0,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  resolution TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);
`;

const MIGRATION_005 = `
CREATE TABLE IF NOT EXISTS held_orders (
  id TEXT PRIMARY KEY,
  label TEXT,
  payload TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const MIGRATION_006 = `
ALTER TABLE settings ADD COLUMN ntn TEXT;
ALTER TABLE customers ADD COLUMN ntn TEXT;

CREATE TABLE IF NOT EXISTS customer_product_prices (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_price INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(customer_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cpp_customer ON customer_product_prices(customer_id);
CREATE INDEX IF NOT EXISTS idx_cpp_product ON customer_product_prices(product_id);
`;

const MIGRATION_007 = `
ALTER TABLE brands ADD COLUMN logo_url TEXT;
`;

const MIGRATION_008 = `
ALTER TABLE order_payments ADD COLUMN note TEXT;
`;

const MIGRATION_009 = `
CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY,
  supplier_id TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  purchase_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
  payment_number TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'cash',
  account_type TEXT DEFAULT 'cash',
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_purchase ON supplier_payments(purchase_id);

ALTER TABLE purchase_returns ADD COLUMN resolution TEXT DEFAULT 'cash';
ALTER TABLE purchase_returns ADD COLUMN refund_account TEXT DEFAULT 'cash';
`;

const MIGRATION_010 = `
UPDATE settings SET receipt_size = 'A5' WHERE receipt_size = 'A4';
`;

const MIGRATION_011 = `
ALTER TABLE order_items ADD COLUMN cost_price INTEGER DEFAULT 0;
ALTER TABLE order_items ADD COLUMN total_cost INTEGER DEFAULT 0;
ALTER TABLE product_batches ADD COLUMN purchase_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_cost ON order_items(cost_price);
CREATE INDEX IF NOT EXISTS idx_batches_product_status ON product_batches(product_id, status);

-- Backfill initial batches for any existing products that have stock but no active batch
INSERT INTO product_batches (id, product_id, batch_number, quantity, batch_cost, status, created_at, updated_at)
SELECT lower(hex(randomblob(16))), id, 'INITIAL-STOCK', stock_quantity, COALESCE(purchase_price, cost_price, 0), 'active', datetime('now'), datetime('now')
FROM products
WHERE stock_quantity > 0 AND id NOT IN (SELECT DISTINCT product_id FROM product_batches WHERE status = 'active');

-- Backfill existing order items cost_price from product's purchase_price or cost_price
UPDATE order_items 
SET cost_price = COALESCE((SELECT purchase_price FROM products WHERE products.id = order_items.product_id), 0),
    total_cost = COALESCE((SELECT purchase_price FROM products WHERE products.id = order_items.product_id), 0) * quantity
WHERE (cost_price IS NULL OR cost_price = 0);
`;

const MIGRATION_012 = `
ALTER TABLE purchase_items ADD COLUMN retail_price INTEGER DEFAULT 0;
ALTER TABLE purchase_items ADD COLUMN wholesale_price INTEGER DEFAULT 0;
ALTER TABLE purchase_items ADD COLUMN dealer_price INTEGER DEFAULT 0;
`;

const MIGRATION_013 = `
ALTER TABLE purchase_items ADD COLUMN batch_number TEXT;
ALTER TABLE purchase_items ADD COLUMN cartons REAL DEFAULT 0;
ALTER TABLE purchase_items ADD COLUMN pieces_per_carton REAL DEFAULT 1;
ALTER TABLE order_items ADD COLUMN batch_number TEXT;
`;
