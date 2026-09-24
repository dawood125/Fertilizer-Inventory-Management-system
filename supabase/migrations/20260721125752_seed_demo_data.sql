/*
# Seed demo catalog data (single-tenant, no auth)

1. Overview
Inserts sample categories, brands, products, customers, and suppliers so the app
has data to display on first load. Uses ON CONFLICT guards via WHERE NOT EXISTS.
This is sample/demo data only — the user can edit or delete it from the UI.
*/

INSERT INTO categories (name, description, color)
SELECT 'Electronics', 'Electronic devices and accessories', '#0ea5e9'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Electronics');

INSERT INTO categories (name, description, color)
SELECT 'Groceries', 'Food and household items', '#16a34a'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Groceries');

INSERT INTO categories (name, description, color)
SELECT 'Beverages', 'Drinks and refreshments', '#f59e0b'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Beverages');

INSERT INTO categories (name, description, color)
SELECT 'Stationery', 'Office and school supplies', '#8b5cf6'
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Stationery');

INSERT INTO brands (name)
SELECT 'Samsung' WHERE NOT EXISTS (SELECT 1 FROM brands WHERE name = 'Samsung');
INSERT INTO brands (name)
SELECT 'Nestle' WHERE NOT EXISTS (SELECT 1 FROM brands WHERE name = 'Nestle');
INSERT INTO brands (name)
SELECT 'Coca-Cola' WHERE NOT EXISTS (SELECT 1 FROM brands WHERE name = 'Coca-Cola');
INSERT INTO brands (name)
SELECT 'Dell' WHERE NOT EXISTS (SELECT 1 FROM brands WHERE name = 'Dell');

INSERT INTO products (name, sku, barcode, category_id, brand_id, purchase_price, retail_price, wholesale_price, dealer_price, stock_quantity, min_stock_level, unit)
SELECT 'Samsung Galaxy A14', 'SAM-A14', '8801643000001',
  c.id, b.id, 42000, 48000, 45000, 43500, 25, 5, 'pcs'
FROM categories c, brands b
WHERE c.name = 'Electronics' AND b.name = 'Samsung'
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'SAM-A14');

INSERT INTO products (name, sku, barcode, category_id, brand_id, purchase_price, retail_price, wholesale_price, dealer_price, stock_quantity, min_stock_level, unit)
SELECT 'Dell Keyboard', 'DEL-KB1', '8801643000002',
  c.id, b.id, 1200, 1800, 1500, 1350, 40, 10, 'pcs'
FROM categories c, brands b
WHERE c.name = 'Electronics' AND b.name = 'Dell'
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'DEL-KB1');

INSERT INTO products (name, sku, barcode, category_id, brand_id, purchase_price, retail_price, wholesale_price, dealer_price, stock_quantity, min_stock_level, unit)
SELECT 'Nestle Milk 1L', 'NES-MLK1', '8801643000003',
  c.id, b.id, 180, 220, 200, 190, 60, 20, 'pcs'
FROM categories c, brands b
WHERE c.name = 'Groceries' AND b.name = 'Nestle'
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'NES-MLK1');

INSERT INTO products (name, sku, barcode, category_id, brand_id, purchase_price, retail_price, wholesale_price, dealer_price, stock_quantity, min_stock_level, unit)
SELECT 'Coca-Cola 1.5L', 'COK-15L', '8801643000004',
  c.id, b.id, 90, 120, 105, 100, 100, 30, 'pcs'
FROM categories c, brands b
WHERE c.name = 'Beverages' AND b.name = 'Coca-Cola'
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'COK-15L');

INSERT INTO products (name, sku, barcode, category_id, brand_id, purchase_price, retail_price, wholesale_price, dealer_price, stock_quantity, min_stock_level, unit)
SELECT 'A4 Paper Ream', 'STA-A4R', '8801643000005',
  c.id, b.id, 350, 500, 420, 400, 3, 10, 'pcs'
FROM categories c, brands b
WHERE c.name = 'Stationery' AND b.name = 'Dell'
  AND NOT EXISTS (SELECT 1 FROM products WHERE sku = 'STA-A4R');

INSERT INTO customers (name, phone, email, address, balance, loyalty_points)
SELECT 'Ahmed Khan', '03001234567', 'ahmed@example.com', 'Lahore', 0, 100
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '03001234567');

INSERT INTO customers (name, phone, email, address, balance, loyalty_points)
SELECT 'Sara Ali', '03219876543', 'sara@example.com', 'Karachi', 1500, 250
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '03219876543');

INSERT INTO customers (name, phone, email, address, balance, loyalty_points)
SELECT 'Bilal Ahmed', '03334567890', 'bilal@example.com', 'Islamabad', 0, 50
WHERE NOT EXISTS (SELECT 1 FROM customers WHERE phone = '03334567890');

INSERT INTO suppliers (name, phone, email, address, balance)
SELECT 'Tech Distributors', '04211122233', 'sales@techdist.com', 'Lahore', 5000
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE phone = '04211122233');

INSERT INTO suppliers (name, phone, email, address, balance)
SELECT 'Global Foods', '02144455566', 'info@globalfoods.com', 'Karachi', 0
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE phone = '02144455566');
