/*
# Seed FMCG demo data (biscuits & snacks distribution)

1. Overview
Inserts FMCG-specific demo data: companies (LU, Bisconni, etc.), brands, categories,
biscuit/snack products with unit conversions, routes, sales reps, and typed customers.
All inserts use WHERE NOT EXISTS guards so re-running is safe.
*/

-- Companies
INSERT INTO companies (name, contact_person, phone, email, address)
SELECT 'LU Biscuits', 'Asad Khan', '042111000111', 'orders@lubiscuits.pk', 'Lahore'
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = 'LU Biscuits');

INSERT INTO companies (name, contact_person, phone, email, address)
SELECT 'Bisconni', 'Faisal Rana', '021222333444', 'info@bisconni.pk', 'Karachi'
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = 'Bisconni');

INSERT INTO companies (name, contact_person, phone, email, address)
SELECT 'Cakes & Co', 'Imran Sheikh', '042333444555', 'sales@cakesco.pk', 'Lahore'
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = 'Cakes & Co');

INSERT INTO companies (name, contact_person, phone, email, address)
SELECT 'Snack World', 'Bilal Ahmed', '051666777888', 'contact@snackworld.pk', 'Islamabad'
WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = 'Snack World');

-- Categories (FMCG-specific)
INSERT INTO categories (name, description, color)
SELECT 'Biscuits', 'All biscuit varieties', '#f59e0b'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Biscuits');

INSERT INTO categories (name, description, color)
SELECT 'Snacks', 'Chips, wafers and savory snacks', '#ef4444'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Snacks');

INSERT INTO categories (name, description, color)
SELECT 'Cakes', 'Cakes and pastries', '#ec4899'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Cakes');

INSERT INTO categories (name, description, color)
SELECT 'Confectionery', 'Candies and sweets', '#8b5cf6'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Confectionery');

-- Brands
INSERT INTO brands (name)
SELECT 'LU' WHERE NOT EXISTS (SELECT 1 FROM brands WHERE name = 'LU');
INSERT INTO brands (name)
SELECT 'Bisconni' WHERE NOT EXISTS (SELECT 1 FROM brands WHERE name = 'Bisconni');
INSERT INTO brands (name)
SELECT 'Cakes & Co' WHERE NOT EXISTS (SELECT 1 FROM brands WHERE name = 'Cakes & Co');
INSERT INTO brands (name)
SELECT 'Snack World' WHERE NOT EXISTS (SELECT 1 FROM brands WHERE name = 'Snack World');

-- Routes
INSERT INTO routes (name, area, driver_name, vehicle)
SELECT 'Route A - Gulberg', 'Gulberg, Lahore', 'Rashid', 'LEB-1234'
WHERE NOT EXISTS (SELECT 1 FROM routes WHERE name = 'Route A - Gulberg');

INSERT INTO routes (name, area, driver_name, vehicle)
SELECT 'Route B - Model Town', 'Model Town, Lahore', 'Naveed', 'LEB-5678'
WHERE NOT EXISTS (SELECT 1 FROM routes WHERE name = 'Route B - Model Town');

INSERT INTO routes (name, area, driver_name, vehicle)
SELECT 'Route C - Johar Town', 'Johar Town, Lahore', 'Tariq', 'LEB-9012'
WHERE NOT EXISTS (SELECT 1 FROM routes WHERE name = 'Route C - Johar Town');

-- Sales Reps
INSERT INTO sales_reps (name, phone, route_id, commission_rate, target_monthly, status)
SELECT 'Kamran Ali', '03011112222',
  (SELECT id FROM routes WHERE name = 'Route A - Gulberg'),
  2.00, 500000, 'active'
WHERE NOT EXISTS (SELECT 1 FROM sales_reps WHERE name = 'Kamran Ali');

INSERT INTO sales_reps (name, phone, route_id, commission_rate, target_monthly, status)
SELECT 'Usman Tariq', '03022223333',
  (SELECT id FROM routes WHERE name = 'Route B - Model Town'),
  2.50, 600000, 'active'
WHERE NOT EXISTS (SELECT 1 FROM sales_reps WHERE name = 'Usman Tariq');

INSERT INTO sales_reps (name, phone, route_id, commission_rate, target_monthly, status)
SELECT 'Hamza Khan', '03033334444',
  (SELECT id FROM routes WHERE name = 'Route C - Johar Town'),
  2.00, 450000, 'active'
WHERE NOT EXISTS (SELECT 1 FROM sales_reps WHERE name = 'Hamza Khan');

-- Products (biscuits & snacks with unit conversions)
-- LU Cocomo
INSERT INTO products (name, sku, barcode, category_id, brand_id, company_id,
  purchase_price, cost_price, retail_price, wholesale_price, dealer_price,
  promotional_price, min_selling_price, stock_quantity, min_stock_level, unit,
  carton_to_box, box_to_pack, pack_to_piece, description, status)
SELECT 'LU Cocomo 12g', 'LU-COC-12', '8801234500011',
  c.id, b.id, co.id,
  8, 8.5, 12, 10, 9.5, 11, 9,
  5000, 500, 'pack',
  24, 30, 12,
  'Chocolate filled biscuits, 12g pack', 'active'
FROM categories c, brands b, companies co
WHERE c.name = 'Biscuits' AND b.name = 'LU' AND co.name = 'LU Biscuits'
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'LU-COC-12');

-- LU Chocolate Chip
INSERT INTO products (name, sku, barcode, category_id, brand_id, company_id,
  purchase_price, cost_price, retail_price, wholesale_price, dealer_price,
  promotional_price, min_selling_price, stock_quantity, min_stock_level, unit,
  carton_to_box, box_to_pack, pack_to_piece, description, status)
SELECT 'LU Chocolate Chip 18g', 'LU-CC-18', '8801234500028',
  c.id, b.id, co.id,
  12, 12.5, 18, 15, 14, 17, 13,
  3000, 300, 'pack',
  20, 24, 10,
  'Chocolate chip cookies, 18g pack', 'active'
FROM categories c, brands b, companies co
WHERE c.name = 'Biscuits' AND b.name = 'LU' AND co.name = 'LU Biscuits'
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'LU-CC-18');

-- Bisconni Chocolate
INSERT INTO products (name, sku, barcode, category_id, brand_id, company_id,
  purchase_price, cost_price, retail_price, wholesale_price, dealer_price,
  promotional_price, min_selling_price, stock_quantity, min_stock_level, unit,
  carton_to_box, box_to_pack, pack_to_piece, description, status)
SELECT 'Bisconni Chocolate 10g', 'BIS-CHC-10', '8801234500035',
  c.id, b.id, co.id,
  6, 6.5, 10, 8, 7.5, 9, 7,
  8000, 800, 'pack',
  30, 24, 12,
  'Chocolate biscuits, 10g pack', 'active'
FROM categories c, brands b, companies co
WHERE c.name = 'Biscuits' AND b.name = 'Bisconni' AND co.name = 'Bisconni'
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'BIS-CHC-10');

-- Bisconni Nicot
INSERT INTO products (name, sku, barcode, category_id, brand_id, company_id,
  purchase_price, cost_price, retail_price, wholesale_price, dealer_price,
  promotional_price, min_selling_price, stock_quantity, min_stock_level, unit,
  carton_to_box, box_to_pack, pack_to_piece, description, status)
SELECT 'Bisconni Nicot 15g', 'BIS-NIC-15', '8801234500042',
  c.id, b.id, co.id,
  7, 7.5, 12, 10, 9, 11, 8,
  6000, 600, 'pack',
  24, 30, 10,
  'Nicot biscuits, 15g pack', 'active'
FROM categories c, brands b, companies co
WHERE c.name = 'Biscuits' AND b.name = 'Bisconni' AND co.name = 'Bisconni'
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'BIS-NIC-15');

-- Snack World Chips
INSERT INTO products (name, sku, barcode, category_id, brand_id, company_id,
  purchase_price, cost_price, retail_price, wholesale_price, dealer_price,
  promotional_price, min_selling_price, stock_quantity, min_stock_level, unit,
  carton_to_box, box_to_pack, pack_to_piece, description, status)
SELECT 'Snack World Chips 15g', 'SW-CHP-15', '8801234500059',
  c.id, b.id, co.id,
  10, 10.5, 15, 13, 12, 14, 11,
  2000, 200, 'pack',
  20, 20, 10,
  'Potato chips, 15g pack', 'active'
FROM categories c, brands b, companies co
WHERE c.name = 'Snacks' AND b.name = 'Snack World' AND co.name = 'Snack World'
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'SW-CHP-15');

-- Cakes & Co Swiss Roll
INSERT INTO products (name, sku, barcode, category_id, brand_id, company_id,
  purchase_price, cost_price, retail_price, wholesale_price, dealer_price,
  promotional_price, min_selling_price, stock_quantity, min_stock_level, unit,
  carton_to_box, box_to_pack, pack_to_piece, description, status)
SELECT 'Cakes & Co Swiss Roll 30g', 'CC-SR-30', '8801234500066',
  c.id, b.id, co.id,
  15, 16, 25, 20, 18, 22, 17,
  1500, 150, 'pack',
  20, 24, 8,
  'Swiss roll cake, 30g pack', 'active'
FROM categories c, brands b, companies co
WHERE c.name = 'Cakes' AND b.name = 'Cakes & Co' AND co.name = 'Cakes & Co'
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'CC-SR-30');

-- Low stock product for alerts
INSERT INTO products (name, sku, barcode, category_id, brand_id, company_id,
  purchase_price, cost_price, retail_price, wholesale_price, dealer_price,
  promotional_price, min_selling_price, stock_quantity, min_stock_level, unit,
  carton_to_box, box_to_pack, pack_to_piece, description, status)
SELECT 'LU Prince 25g', 'LU-PRI-25', '8801234500073',
  c.id, b.id, co.id,
  14, 15, 22, 18, 17, 20, 16,
  50, 300, 'pack',
  24, 20, 10,
  'Prince sandwich biscuit, 25g pack', 'active'
FROM categories c, brands b, companies co
WHERE c.name = 'Biscuits' AND b.name = 'LU' AND co.name = 'LU Biscuits'
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'LU-PRI-25');

-- Out of stock product
INSERT INTO products (name, sku, barcode, category_id, brand_id, company_id,
  purchase_price, cost_price, retail_price, wholesale_price, dealer_price,
  promotional_price, min_selling_price, stock_quantity, min_stock_level, unit,
  carton_to_box, box_to_pack, pack_to_piece, description, status)
SELECT 'Bisconni Party 20g', 'BIS-PRT-20', '8801234500080',
  c.id, b.id, co.id,
  9, 9.5, 15, 12, 11, 13, 10,
  0, 400, 'pack',
  24, 24, 12,
  'Party biscuits, 20g pack', 'active'
FROM categories c, brands b, companies co
WHERE c.name = 'Biscuits' AND b.name = 'Bisconni' AND co.name = 'Bisconni'
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'BIS-PRT-20');

-- Suppliers
INSERT INTO suppliers (name, phone, email, address, balance, company_id, contact_person)
SELECT 'LU Distribution Co', '042999888777', 'dist@ludist.pk', 'Lahore', 25000,
  (SELECT id FROM companies WHERE name = 'LU Biscuits'), 'Asad Khan'
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE phone = '042999888777');

INSERT INTO suppliers (name, phone, email, address, balance, company_id, contact_person)
SELECT 'Bisconni Wholesale', '021888777666', 'wholesale@bisconni.pk', 'Karachi', 0,
  (SELECT id FROM companies WHERE name = 'Bisconni'), 'Faisal Rana'
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE phone = '021888777666');

-- Customers (FMCG typed)
INSERT INTO customers (name, phone, email, address, balance, type, owner_name, area, route_id, sales_rep_id, credit_limit, opening_balance)
SELECT 'Al-Madina Store', '030145678901', 'almadina@store.pk', 'Gulberg III, Lahore', 12000,
  'retailer', 'Haji Saeed', 'Gulberg',
  (SELECT id FROM routes WHERE name = 'Route A - Gulberg'),
  (SELECT id FROM sales_reps WHERE name = 'Kamran Ali'),
  50000, 5000
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '030145678901');

INSERT INTO customers (name, phone, email, address, balance, type, owner_name, area, route_id, sales_rep_id, credit_limit, opening_balance)
SELECT 'Khan Wholesale', '030256789012', 'khan@wholesale.pk', 'Model Town, Lahore', 35000,
  'wholesaler', 'Kamran Khan', 'Model Town',
  (SELECT id FROM routes WHERE name = 'Route B - Model Town'),
  (SELECT id FROM sales_reps WHERE name = 'Usman Tariq'),
  100000, 20000
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '030256789012');

INSERT INTO customers (name, phone, email, address, balance, type, owner_name, area, route_id, sales_rep_id, credit_limit, opening_balance)
SELECT 'City Dealers', '030367890123', 'city@dealers.pk', 'Johar Town, Lahore', 5000,
  'dealer', 'Asif City', 'Johar Town',
  (SELECT id FROM routes WHERE name = 'Route C - Johar Town'),
  (SELECT id FROM sales_reps WHERE name = 'Hamza Khan'),
  80000, 0
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '030367890123');

INSERT INTO customers (name, phone, email, address, balance, type, owner_name, area, route_id, sales_rep_id, credit_limit, opening_balance)
SELECT 'New Mart Retailer', '030478901234', 'newmart@retail.pk', 'Gulberg II, Lahore', 0,
  'retailer', 'Ahmed New', 'Gulberg',
  (SELECT id FROM routes WHERE name = 'Route A - Gulberg'),
  (SELECT id FROM sales_reps WHERE name = 'Kamran Ali'),
  30000, 0
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '030478901234');

-- Product batches with expiry tracking
INSERT INTO product_batches (product_id, batch_number, manufacturing_date, expiry_date, quantity, batch_cost, status)
SELECT p.id, 'LU-COC-2026-01', '2026-01-15', '2026-07-15', 2000, 8, 'active'
FROM products p WHERE p.sku = 'LU-COC-12'
  AND NOT EXISTS (SELECT 1 FROM product_batches WHERE batch_number = 'LU-COC-2026-01');

INSERT INTO product_batches (product_id, batch_number, manufacturing_date, expiry_date, quantity, batch_cost, status)
SELECT p.id, 'LU-COC-2026-03', '2026-03-20', '2026-09-20', 3000, 8, 'active'
FROM products p WHERE p.sku = 'LU-COC-12'
  AND NOT EXISTS (SELECT 1 FROM product_batches WHERE batch_number = 'LU-COC-2026-03');

INSERT INTO product_batches (product_id, batch_number, manufacturing_date, expiry_date, quantity, batch_cost, status)
SELECT p.id, 'BIS-CHC-2026-02', '2026-02-10', '2026-08-10', 4000, 6, 'active'
FROM products p WHERE p.sku = 'BIS-CHC-10'
  AND NOT EXISTS (SELECT 1 FROM product_batches WHERE batch_number = 'BIS-CHC-2026-02');

-- Near expiry batch
INSERT INTO product_batches (product_id, batch_number, manufacturing_date, expiry_date, quantity, batch_cost, status)
SELECT p.id, 'BIS-NIC-2025-12', '2025-12-01', '2026-06-30', 1000, 7, 'active'
FROM products p WHERE p.sku = 'BIS-NIC-15'
  AND NOT EXISTS (SELECT 1 FROM product_batches WHERE batch_number = 'BIS-NIC-2025-12');
