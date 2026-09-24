import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { queryOne, execute, uuid, nowISO, saveDatabaseNow } from '../database/connection.js';
import { authRequired } from '../middleware/auth.js';
import { requireMinRole, requireRole } from '../middleware/roleCheck.js';

const router = Router();

let uploadsDir = null;

export function setUploadsDir(dir) {
  uploadsDir = dir;
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir || path.join(process.cwd(), 'data', 'uploads')),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      cb(null, `logo-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function mapSettings(row) {
  if (!row) return null;
  return {
    ...row,
    barcode_on_invoice: Boolean(row.barcode_on_invoice),
    tax_inclusive: Boolean(row.tax_inclusive),
  };
}

router.get('/', authRequired, (_req, res) => {
  const row = queryOne('SELECT * FROM settings LIMIT 1');
  res.json(mapSettings(row));
});

router.put('/', authRequired, requireMinRole('manager'), (req, res) => {
  const existing = queryOne('SELECT * FROM settings LIMIT 1');
  if (!existing) return res.status(404).json({ error: 'Settings not found' });

  const b = req.body || {};
  const now = nowISO();

  // Allow A4 or A5 paper size selection
  const receiptSize = (b.receipt_size === 'A5') ? 'A5' : (b.receipt_size === 'A4' ? 'A4' : (existing.receipt_size || 'A5'));

  execute(
    `UPDATE settings SET
      store_name = ?, logo_url = ?, address = ?, phone = ?, email = ?, ntn = ?,
      currency = ?, currency_symbol = ?, timezone = ?, receipt_footer = ?,
      invoice_prefix = ?, receipt_size = ?, terms_conditions = ?,
      barcode_on_invoice = ?, tax_inclusive = ?, updated_at = ?
     WHERE id = ?`,
    [
      b.store_name ?? existing.store_name,
      b.logo_url !== undefined ? b.logo_url : existing.logo_url,
      b.address !== undefined ? b.address : existing.address,
      b.phone !== undefined ? b.phone : existing.phone,
      b.email !== undefined ? b.email : existing.email,
      b.ntn !== undefined ? b.ntn : existing.ntn,
      b.currency ?? existing.currency,
      b.currency_symbol ?? existing.currency_symbol,
      b.timezone ?? existing.timezone,
      b.receipt_footer !== undefined ? b.receipt_footer : existing.receipt_footer,
      b.invoice_prefix ?? existing.invoice_prefix,
      receiptSize,
      b.terms_conditions !== undefined ? b.terms_conditions : existing.terms_conditions,
      b.barcode_on_invoice === undefined ? existing.barcode_on_invoice : (b.barcode_on_invoice ? 1 : 0),
      b.tax_inclusive === undefined ? existing.tax_inclusive : (b.tax_inclusive ? 1 : 0),
      now,
      existing.id,
    ]
  );

  res.json(mapSettings(queryOne('SELECT * FROM settings LIMIT 1')));
});

router.post('/logo', authRequired, requireMinRole('manager'), upload.single('logo'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No logo file uploaded' });
  const existing = queryOne('SELECT * FROM settings LIMIT 1');
  if (!existing) return res.status(404).json({ error: 'Settings not found' });

  const logoUrl = `/uploads/${req.file.filename}`;
  execute('UPDATE settings SET logo_url = ?, updated_at = ? WHERE id = ?', [
    logoUrl,
    nowISO(),
    existing.id,
  ]);

  res.json(mapSettings(queryOne('SELECT * FROM settings LIMIT 1')));
});

router.post('/reset-database', authRequired, requireRole('admin'), (req, res) => {
  const { mode, confirmation } = req.body || {};

  if (confirmation !== 'RESET ALL DATA') {
    return res.status(400).json({ error: 'Invalid confirmation phrase. You must type "RESET ALL DATA" exactly.' });
  }

  try {
    const now = nowISO();
    const adminUser = req.user?.name || 'Admin';

    execute('PRAGMA foreign_keys = OFF;');

    if (mode === 'factory_reset') {
      const tablesToWipe = [
        'order_items', 'order_payments', 'orders', 'held_orders',
        'sales_returns', 'purchase_returns',
        'purchase_items', 'purchase_orders', 'supplier_payments',
        'delivery_items', 'deliveries', 'claims',
        'stock_movements', 'product_batches', 'customer_product_prices',
        'products', 'categories', 'brands', 'companies',
        'customers', 'suppliers', 'routes', 'sales_reps',
        'transactions', 'expenses', 'expense_categories',
        'audit_logs', 'tax_rates',
      ];

      for (const t of tablesToWipe) {
        try {
          execute(`DELETE FROM ${t}`);
        } catch (e) {
          console.warn(`[reset] failed to wipe ${t}:`, e.message);
        }
      }

      execute('UPDATE payment_accounts SET balance = 0');
      execute('PRAGMA foreign_keys = ON;');

      execute(
        'INSERT INTO audit_logs (id, user_name, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), adminUser, 'FACTORY_RESET', 'system', 'database', 'Admin executed complete factory reset. All tables wiped back to clean install.', now]
      );
    } else {
      const transactionalTables = [
        'order_items', 'order_payments', 'orders', 'held_orders',
        'sales_returns', 'purchase_returns',
        'purchase_items', 'purchase_orders', 'supplier_payments',
        'delivery_items', 'deliveries', 'claims',
        'stock_movements', 'product_batches',
        'transactions', 'expenses',
        'audit_logs',
      ];

      for (const t of transactionalTables) {
        try {
          execute(`DELETE FROM ${t}`);
        } catch (e) {
          console.warn(`[reset] failed to wipe ${t}:`, e.message);
        }
      }

      execute('UPDATE products SET stock_quantity = 0');
      execute('UPDATE customers SET balance = 0');
      execute('UPDATE suppliers SET balance = 0');
      execute('UPDATE payment_accounts SET balance = 0');
      execute('PRAGMA foreign_keys = ON;');

      execute(
        'INSERT INTO audit_logs (id, user_name, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid(), adminUser, 'TEST_DATA_RESET', 'system', 'database', 'Admin executed test data reset. Orders, returns, purchases, expenses, and balances reset to zero.', now]
      );
    }

    saveDatabaseNow();
    res.json({ ok: true, mode: mode || 'transactional_only' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to reset database' });
  }
});

export default router;
