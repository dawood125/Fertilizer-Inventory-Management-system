import bcrypt from 'bcryptjs';
import { uuid, nowISO, queryOne } from '../connection.js';

export async function seedDatabase(db) {
  const now = nowISO();

  // Settings
  const settings = queryOne('SELECT id FROM settings LIMIT 1');
  if (!settings) {
    db.run(
      `INSERT INTO settings (
        id, store_name, currency, currency_symbol, timezone,
        invoice_prefix, receipt_size, barcode_on_invoice, tax_inclusive,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid(),
        'Fertilizer & Agri Distribution',
        'PKR',
        'Rs',
        'Asia/Karachi',
        'INV',
        'A5',
        1,
        0,
        now,
        now,
      ]
    );
  } else {
    // Enforce A5 default for existing DBs that still have thermal sizes & modernize store name
    db.run(`UPDATE settings SET receipt_size = 'A5' WHERE receipt_size IS NULL OR receipt_size IN ('58mm','80mm')`);
    db.run(`UPDATE settings SET store_name = 'Fertilizer & Agri Distribution' WHERE store_name = 'Biscuit Distributor'`);
  }

  // Payment accounts
  const accounts = [
    ['cash', 'Cash'],
    ['bank', 'Bank'],
    ['jazzcash', 'JazzCash'],
    ['easypaisa', 'EasyPaisa'],
  ];
  for (const [type, name] of accounts) {
    const exists = queryOne('SELECT id FROM payment_accounts WHERE type = ?', [type]);
    if (!exists) {
      db.run(
        `INSERT INTO payment_accounts (id, type, name, balance, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)`,
        [uuid(), type, name, now, now]
      );
    }
  }

  // Tax rate
  const tax = queryOne('SELECT id FROM tax_rates LIMIT 1');
  if (!tax) {
    db.run(
      `INSERT INTO tax_rates (id, name, percentage, inclusive, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)`,
      [uuid(), 'GST', 17, now, now]
    );
  }

  // Expense categories
  const expenseCats = [
    'Rent', 'Utilities', 'Salaries', 'Transport', 'Miscellaneous',
    'Fuel', 'Electricity', 'Internet', 'Vehicle Maintenance', 'Office Supplies', 'Marketing',
  ];
  for (const name of expenseCats) {
    const exists = queryOne('SELECT id FROM expense_categories WHERE name = ?', [name]);
    if (!exists) {
      db.run(
        `INSERT INTO expense_categories (id, name, description, created_at, updated_at) VALUES (?, ?, NULL, ?, ?)`,
        [uuid(), name, now, now]
      );
    }
  }

  // Admin user — change password after first login
  const admin = queryOne('SELECT id FROM users WHERE email = ?', ['admin@store.com']);
  if (!admin) {
    const hash = bcrypt.hashSync('Admin@123', 10);
    db.run(
      `INSERT INTO users (id, name, email, password_hash, role, phone, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [uuid(), 'Super Admin', 'admin@store.com', hash, 'admin', null, now, now]
    );
    console.log('[db] Seeded admin user: admin@store.com / Admin@123');
  }

  console.log('[db] Seeds complete');
}
