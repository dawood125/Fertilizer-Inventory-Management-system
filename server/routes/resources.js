/**
 * Generic resource CRUD for Phase 1 foundation.
 * Feature-specific business logic (stock, payments, etc.) refined in Phase 2.
 */

import { Router } from 'express';
import { queryAll, queryOne, execute, uuid, nowISO } from '../database/connection.js';
import { authRequired } from '../middleware/auth.js';
import {
  moneyOut, moneyIn, fromPaisa,
  PRODUCT_MONEY, CUSTOMER_MONEY, SUPPLIER_MONEY, ORDER_MONEY,
  ORDER_ITEM_MONEY, ORDER_PAYMENT_MONEY, SUPPLIER_PAYMENT_MONEY, PO_MONEY, PO_ITEM_MONEY,
  EXPENSE_MONEY, ACCOUNT_MONEY, TX_MONEY, BATCH_MONEY,
  SALES_RETURN_MONEY, PURCHASE_RETURN_MONEY, CLAIM_MONEY,
  CUSTOMER_PRODUCT_PRICE_MONEY,
} from '../utils/money.js';

const TABLES = {
  categories: { money: [], bools: [], orderBy: 'name' },
  brands: { money: [], bools: [], orderBy: 'name' },
  companies: { money: [], bools: [], orderBy: 'name' },
  products: { money: PRODUCT_MONEY, bools: [], orderBy: 'name' },
  customers: { money: CUSTOMER_MONEY, bools: ['allow_manual_override'], orderBy: 'name' },
  suppliers: { money: SUPPLIER_MONEY, bools: [], orderBy: 'name' },
  routes: { money: [], bools: [], orderBy: 'name' },
  sales_reps: { money: ['target_monthly'], bools: [], orderBy: 'name' },
  product_batches: { money: BATCH_MONEY, bools: [], orderBy: 'created_at DESC' },
  expense_categories: { money: [], bools: [], orderBy: 'name' },
  expenses: { money: EXPENSE_MONEY, bools: [], orderBy: 'date DESC' },
  payment_accounts: { money: ACCOUNT_MONEY, bools: [], orderBy: 'type' },
  transactions: { money: TX_MONEY, bools: [], orderBy: 'created_at DESC' },
  orders: { money: ORDER_MONEY, bools: [], orderBy: 'created_at DESC' },
  order_items: { money: ORDER_ITEM_MONEY, bools: [], orderBy: 'rowid ASC' },
  order_payments: { money: ORDER_PAYMENT_MONEY, bools: [], orderBy: 'created_at DESC' },
  supplier_payments: { money: SUPPLIER_PAYMENT_MONEY, bools: [], orderBy: 'created_at DESC' },
  purchase_orders: { money: PO_MONEY, bools: [], orderBy: 'created_at DESC' },
  purchase_items: { money: PO_ITEM_MONEY, bools: [], orderBy: 'rowid ASC' },
  stock_movements: { money: [], bools: [], orderBy: 'created_at DESC' },
  sales_returns: { money: SALES_RETURN_MONEY, bools: [], orderBy: 'created_at DESC' },
  purchase_returns: { money: PURCHASE_RETURN_MONEY, bools: [], orderBy: 'created_at DESC' },
  deliveries: { money: [], bools: [], orderBy: 'created_at DESC' },
  delivery_items: { money: [], bools: [], orderBy: 'rowid ASC' },
  claims: { money: CLAIM_MONEY, bools: [], orderBy: 'created_at DESC' },
  tax_rates: { money: [], bools: ['inclusive'], orderBy: 'name' },
  held_orders: { money: [], bools: [], orderBy: 'created_at DESC' },
  customer_product_prices: { money: CUSTOMER_PRODUCT_PRICE_MONEY, bools: [], orderBy: 'updated_at DESC' },
  app_users: { money: [], bools: ['active'], orderBy: 'name', table: 'users' }, // alias
  audit_logs: { money: [], bools: [], orderBy: 'created_at DESC' },
};

function recordServerAudit(userName, action, entityType, entityId, details) {
  try {
    const id = uuid();
    const now = nowISO();
    execute(
      'INSERT INTO audit_logs (id, user_name, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, userName || 'System', action, entityType, entityId, details || '', now]
    );
  } catch (e) {
    // Non-blocking
    console.error('Audit log write error:', e.message);
  }
}

function formatAuditCreate(key, id, reqBody, data) {
  try {
    if (key === 'orders') {
      const tot = Number(reqBody.total ?? fromPaisa(data.total || 0));
      return `Completed Order #${reqBody.order_number || data.order_number || id} · Total: Rs ${tot.toLocaleString()}`;
    }
    if (key === 'sales_returns') {
      const amt = Number(reqBody.total_amount ?? fromPaisa(data.total_amount || 0));
      return `Created Sales Return #${reqBody.return_number || data.return_number || id} for ${reqBody.product_name || data.product_name || 'Product'} (Qty: ${reqBody.quantity || data.quantity || 1}, Rs ${amt.toLocaleString()}, ${reqBody.resolution || data.resolution || 'refund'})`;
    }
    if (key === 'expenses') {
      const cat = (reqBody.category_id || data.category_id)
        ? queryOne('SELECT name FROM expense_categories WHERE id = ?', [reqBody.category_id || data.category_id])
        : null;
      const amt = Number(reqBody.amount ?? fromPaisa(data.amount || 0));
      const note = reqBody.note || reqBody.description || data.note || '';
      return `Recorded Expense: Rs ${amt.toLocaleString()} · Category: ${cat?.name || 'General'} · Method: ${String(reqBody.payment_method || data.payment_method || 'cash').toUpperCase()}${note ? ` · Note: ${note}` : ''}`;
    }
    if (key === 'purchase_orders') {
      const tot = Number(reqBody.total ?? fromPaisa(data.total || 0));
      return `Created Purchase Order #${reqBody.po_number || data.po_number || id} · Total: Rs ${tot.toLocaleString()}`;
    }
    if (key === 'purchase_returns') {
      const amt = Number(reqBody.total_amount ?? fromPaisa(data.total_amount || 0));
      return `Created Purchase Return #${reqBody.return_number || data.return_number || id} (Total: Rs ${amt.toLocaleString()})`;
    }
    if (key === 'supplier_payments') {
      const amt = Number(reqBody.amount ?? fromPaisa(data.amount || 0));
      return `Recorded Supplier Payment: Rs ${amt.toLocaleString()}`;
    }
    if (key === 'transactions') {
      const amt = Number(reqBody.amount ?? fromPaisa(data.amount || 0));
      const note = reqBody.note || reqBody.description || data.note || '';
      return `Cash Transaction: ${reqBody.type || data.type || 'entry'} (Rs ${amt.toLocaleString()}) · Account: ${reqBody.account_type || data.account_type || 'cash'}${note ? ` · Note: ${note}` : ''}`;
    }
    if (key === 'products') {
      const buy = Number(reqBody.purchase_price ?? fromPaisa(data.purchase_price || 0));
      const ret = Number(reqBody.retail_price ?? fromPaisa(data.retail_price || 0));
      const stock = reqBody.stock_quantity ?? data.stock_quantity ?? 0;
      const boxes = reqBody.carton_to_box ?? data.carton_to_box;
      return `Added Product: "${reqBody.name || data.name}" (SKU: ${reqBody.sku || data.sku || 'N/A'}${boxes ? `, ${boxes} boxes/ctn` : ''}, Buy: Rs ${buy.toLocaleString()}, Retail: Rs ${ret.toLocaleString()}, Stock: ${stock} cartons)`;
    }
    if (key === 'customers') {
      return `Added Customer: "${reqBody.name || data.name}" (Phone: ${reqBody.phone || data.phone || 'N/A'}${reqBody.area ? `, Area: ${reqBody.area}` : ''})`;
    }
    if (key === 'suppliers') {
      return `Added Supplier: "${reqBody.name || data.name}" (Contact: ${reqBody.contact_person || reqBody.phone || 'N/A'})`;
    }
    if (key === 'payment_accounts') {
      const bal = Number(reqBody.balance ?? fromPaisa(data.balance || 0));
      return `Created Payment Account: "${reqBody.name || data.name || reqBody.type}" (Balance: Rs ${bal.toLocaleString()})`;
    }
    if (['categories', 'brands', 'companies', 'expense_categories', 'routes', 'sales_reps'].includes(key)) {
      return `Added ${key.replace(/_/g, ' ').replace(/ies$/, 'y').replace(/s$/, '')}: "${reqBody.name || data.name || id}"`;
    }
  } catch {}
  return `Created ${key.replace(/_/g, ' ')} record`;
}

function formatAuditUpdate(key, id, reqBody, data, existing) {
  try {
    if (key === 'payment_accounts') {
      const bal = Number(reqBody.balance ?? fromPaisa(data.balance || 0));
      return `Adjusted Account "${existing.name || existing.type}" balance to Rs ${bal.toLocaleString()}`;
    }
    if (key === 'expenses') {
      const amt = Number(reqBody.amount ?? fromPaisa(data.amount ?? existing.amount));
      const note = reqBody.note || data.note || existing.note || '';
      return `Updated Expense: Rs ${amt.toLocaleString()}${note ? ` · Note: ${note}` : ''}`;
    }
    if (key === 'products') {
      const changes = [];
      if (data.retail_price !== undefined) changes.push(`Retail: Rs ${fromPaisa(data.retail_price).toLocaleString()}`);
      if (data.stock_quantity !== undefined) changes.push(`Stock: ${data.stock_quantity} ctn`);
      if (data.carton_to_box !== undefined) changes.push(`Boxes/Ctn: ${data.carton_to_box}`);
      return `Updated Product: "${existing.name}"${changes.length ? ` (${changes.join(', ')})` : ''}`;
    }
    if (key === 'orders') {
      return `Updated Order #${existing.order_number || id} · Status: ${reqBody.status || data.status || existing.status}${data.payment_status ? ` · Payment: ${data.payment_status}` : ''}`;
    }
    if (key === 'customers') {
      return `Updated Customer: "${existing.name}"${data.balance !== undefined ? ` · Balance: Rs ${fromPaisa(data.balance).toLocaleString()}` : ''}`;
    }
    if (key === 'suppliers') {
      return `Updated Supplier: "${existing.name}"${data.balance !== undefined ? ` · Balance: Rs ${fromPaisa(data.balance).toLocaleString()}` : ''}`;
    }
    if (key === 'sales_returns') {
      return `Updated Return #${existing.return_number || id} status to ${reqBody.status || data.status}`;
    }
    if (key === 'purchase_orders') {
      return `Updated Purchase Order #${existing.po_number || id} status to ${reqBody.status || data.status}`;
    }
  } catch {}
  return `Updated ${key.replace(/_/g, ' ')}: "${existing?.name || existing?.title || existing?.order_number || id}"`;
}

function formatAuditDelete(key, id, existing) {
  try {
    if (key === 'expenses') {
      const cat = existing?.category_id
        ? queryOne('SELECT name FROM expense_categories WHERE id = ?', [existing.category_id])
        : null;
      const amt = fromPaisa(existing?.amount || 0);
      return `Deleted Expense: Rs ${amt.toLocaleString()} · Category: ${cat?.name || 'General'}${existing?.note ? ` · Note: ${existing.note}` : ''}${existing?.receipt_note ? ` (Ref: ${existing.receipt_note})` : ''}`;
    }
    if (key === 'products') {
      return `Deleted Product: "${existing?.name || 'N/A'}" (SKU: ${existing?.sku || 'N/A'}, Stock: ${existing?.stock_quantity || 0} cartons, Retail: Rs ${fromPaisa(existing?.retail_price || 0).toLocaleString()})`;
    }
    if (key === 'customers') {
      return `Deleted Customer: "${existing?.name || 'N/A'}" (Phone: ${existing?.phone || 'N/A'}, Balance: Rs ${fromPaisa(existing?.balance || 0).toLocaleString()})`;
    }
    if (key === 'suppliers') {
      return `Deleted Supplier: "${existing?.name || 'N/A'}" (Phone: ${existing?.phone || 'N/A'}, Balance: Rs ${fromPaisa(existing?.balance || 0).toLocaleString()})`;
    }
    if (key === 'transactions') {
      const amt = fromPaisa(existing?.amount || 0);
      return `Deleted Cash Transaction: ${existing?.type || 'entry'} (Rs ${amt.toLocaleString()}) · Account: ${existing?.account_type || 'cash'}${existing?.note ? ` · Note: ${existing.note}` : ''}`;
    }
    if (key === 'orders') {
      return `Deleted Sales Order #${existing?.order_number || id} (Total: Rs ${fromPaisa(existing?.total || 0).toLocaleString()}, Status: ${existing?.status || 'N/A'})`;
    }
    if (key === 'purchase_orders') {
      return `Deleted Purchase Order #${existing?.po_number || id} (Total: Rs ${fromPaisa(existing?.total || 0).toLocaleString()})`;
    }
    if (key === 'sales_returns') {
      return `Deleted Sales Return #${existing?.return_number || id} (Product: ${existing?.product_name || 'N/A'}, Qty: ${existing?.quantity || 1}, Rs ${fromPaisa(existing?.total_amount || 0).toLocaleString()})`;
    }
    if (key === 'purchase_returns') {
      return `Deleted Purchase Return #${existing?.return_number || id} (Product: ${existing?.product_name || 'N/A'}, Qty: ${existing?.quantity || 1}, Rs ${fromPaisa(existing?.total_amount || 0).toLocaleString()})`;
    }
    if (key === 'payment_accounts') {
      return `Deleted Payment Account: "${existing?.name || existing?.type || 'Account'}" (Final Balance: Rs ${fromPaisa(existing?.balance || 0).toLocaleString()})`;
    }
    if (['categories', 'brands', 'companies', 'expense_categories', 'routes', 'sales_reps'].includes(key)) {
      return `Deleted ${key.replace(/_/g, ' ').replace(/ies$/, 'y').replace(/s$/, '')}: "${existing?.name || id}"`;
    }
  } catch {}
  return `Deleted ${key.replace(/_/g, ' ')}: "${existing?.name || existing?.title || existing?.order_number || id}"`;
}

function mapRow(tableKey, row) {
  if (!row) return null;
  const cfg = TABLES[tableKey];
  let out = moneyOut({ ...row }, cfg.money);
  for (const b of cfg.bools) {
    if (b in out) out[b] = Boolean(out[b]);
  }
  return out;
}

function prepareInsert(tableKey, body, { keepId = false } = {}) {
  const cfg = TABLES[tableKey];
  let data = { ...body };
  if (!keepId) delete data.id;
  delete data.created_at;
  delete data.updated_at;
  data = moneyIn(data, cfg.money);
  for (const b of cfg.bools) {
    if (b in data) data[b] = data[b] ? 1 : 0;
  }
  return data;
}

export function createResourceRouter() {
  const router = Router();
  router.use(authRequired);

  // List
  router.get('/:resource', (req, res) => {
    const key = req.params.resource;
    const cfg = TABLES[key];
    if (!cfg) return res.status(404).json({ error: 'Unknown resource' });
    const table = cfg.table || key;
    const limit = Math.min(Number(req.query.limit) || 10000, 50000);
    const order = cfg.orderBy.includes(' ') ? cfg.orderBy : `${cfg.orderBy} ASC`;

    let sql = `SELECT * FROM ${table}`;
    const params = [];
    const wheres = [];
    // Simple filters
    if (req.query.status) {
      wheres.push('status = ?');
      params.push(req.query.status);
    }
    if (req.query.customer_id) {
      wheres.push('customer_id = ?');
      params.push(req.query.customer_id);
    }
    if (req.query.product_id) {
      wheres.push('product_id = ?');
      params.push(req.query.product_id);
    }
    if (req.query.order_id) {
      wheres.push('order_id = ?');
      params.push(req.query.order_id);
    }
    if (req.query.user_name) {
      wheres.push('user_name = ?');
      params.push(req.query.user_name);
    }
    if (req.query.action) {
      wheres.push('action = ?');
      params.push(req.query.action);
    }
    if (req.query.entity_type) {
      wheres.push('entity_type = ?');
      params.push(req.query.entity_type);
    }
    if (wheres.length) sql += ` WHERE ${wheres.join(' AND ')}`;
    sql += ` ORDER BY ${order} LIMIT ?`;
    params.push(limit);

    try {
      const rows = queryAll(sql, params).map((r) => mapRow(key, r));
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get one
  router.get('/:resource/:id', (req, res) => {
    const key = req.params.resource;
    const cfg = TABLES[key];
    if (!cfg) return res.status(404).json({ error: 'Unknown resource' });
    const table = cfg.table || key;
    const row = queryOne(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(mapRow(key, row));
  });

  // Create (supports restore mode that preserves IDs / upserts)
  router.post('/:resource', (req, res) => {
    const key = req.params.resource;
    const cfg = TABLES[key];
    if (!cfg) return res.status(404).json({ error: 'Unknown resource' });
    const table = cfg.table || key;
    const restore = req.query.restore === '1' || req.query.restore === 'true';
    const incomingId = restore && req.body?.id ? String(req.body.id) : null;
    const data = prepareInsert(key, req.body || {}, { keepId: false });
    const id = incomingId || uuid();
    const now = nowISO();

    // Opening balance → balance for customers/suppliers
    if ((key === 'customers' || key === 'suppliers') && data.opening_balance != null) {
      if (data.balance == null || data.balance === 0) {
        data.balance = data.opening_balance;
      }
    }

    // Transactions require date
    if (key === 'transactions' && !data.date) {
      data.date = now.slice(0, 10);
    }

    const noCreatedAt = ['order_items', 'purchase_items', 'delivery_items'].includes(table);
    const hasUpdated = !['stock_movements', 'order_items', 'order_payments', 'purchase_items', 'delivery_items', 'transactions', 'audit_logs'].includes(table);

    try {
      if (restore) {
        const existing = queryOne(`SELECT id FROM ${table} WHERE id = ?`, [id]);
        if (existing) {
          const keys = Object.keys(data);
          if (keys.length === 0) {
            const row = queryOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
            return res.json(mapRow(key, row));
          }
          const sets = keys.map((k) => `${k} = ?`);
          const vals = [...Object.values(data)];
          if (hasUpdated) {
            sets.push('updated_at = ?');
            vals.push(now);
          }
          vals.push(id);
          execute(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`, vals);
          const row = queryOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
          return res.json(mapRow(key, row));
        }
      }

      let finalCols = ['id', ...Object.keys(data)];
      let values = [id, ...Object.values(data)];
      if (!noCreatedAt) {
        finalCols.push('created_at');
        values.push(now);
      }
      if (hasUpdated) {
        finalCols.push('updated_at');
        values.push(now);
      }

      const placeholders = finalCols.map(() => '?').join(', ');
      execute(`INSERT INTO ${table} (${finalCols.join(', ')}) VALUES (${placeholders})`, values);
      const row = queryOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);

      // Server-side Audit Logging
      if (!['audit_logs', 'order_items', 'delivery_items', 'purchase_items'].includes(key)) {
        const uName = req.user?.name || 'Cashier / User';
        const detailMsg = formatAuditCreate(key, id, req.body || {}, data);
        recordServerAudit(uName, 'CREATE', key, id, detailMsg);
      }

      res.status(201).json(mapRow(key, row));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Update
  router.put('/:resource/:id', (req, res) => {
    const key = req.params.resource;
    const cfg = TABLES[key];
    if (!cfg) return res.status(404).json({ error: 'Unknown resource' });
    const table = cfg.table || key;
    const existing = queryOne(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const data = prepareInsert(key, req.body || {});
    const now = nowISO();
    const keys = Object.keys(data);
    if (keys.length === 0) return res.json(mapRow(key, existing));

    const sets = keys.map((k) => `${k} = ?`).join(', ');
    const hasUpdated = !['stock_movements', 'order_items', 'order_payments', 'purchase_items', 'delivery_items', 'transactions', 'audit_logs'].includes(table);
    const sql = hasUpdated
      ? `UPDATE ${table} SET ${sets}, updated_at = ? WHERE id = ?`
      : `UPDATE ${table} SET ${sets} WHERE id = ?`;
    const params = hasUpdated
      ? [...Object.values(data), now, req.params.id]
      : [...Object.values(data), req.params.id];

    try {
      execute(sql, params);
      const row = queryOne(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);

      // Server-side Audit Logging
      if (!['audit_logs', 'order_items', 'delivery_items', 'purchase_items'].includes(key)) {
        const uName = req.user?.name || 'Cashier / User';
        const detailMsg = formatAuditUpdate(key, req.params.id, req.body || {}, data, existing);
        recordServerAudit(uName, 'UPDATE', key, req.params.id, detailMsg);
      }

      res.json(mapRow(key, row));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // Delete
  router.delete('/:resource/:id', (req, res) => {
    const key = req.params.resource;
    const cfg = TABLES[key];
    if (!cfg) return res.status(404).json({ error: 'Unknown resource' });
    const table = cfg.table || key;
    const existing = queryOne(`SELECT * FROM ${table} WHERE id = ?`, [req.params.id]);

    execute(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);

    // Server-side Audit Logging
    if (!['audit_logs', 'order_items', 'delivery_items', 'purchase_items'].includes(key)) {
      const uName = req.user?.name || 'Cashier / User';
      const detailMsg = formatAuditDelete(key, req.params.id, existing);
      recordServerAudit(uName, 'DELETE', key, req.params.id, detailMsg);
    }

    res.json({ ok: true });
  });

  return router;
}
