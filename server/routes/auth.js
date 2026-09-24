import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { queryOne, queryAll, execute, uuid, nowISO } from '../database/connection.js';
import { signToken, authRequired } from '../middleware/auth.js';
import { requireRole } from '../middleware/roleCheck.js';

const router = Router();

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    phone: row.phone,
    active: Boolean(row.active),
    last_login: row.last_login,
    created_at: row.created_at,
  };
}

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = queryOne('SELECT * FROM users WHERE lower(email) = lower(?)', [String(email).trim()]);
  if (!user || !user.password_hash) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (!user.active) {
    return res.status(401).json({ error: 'Account is inactive' });
  }

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const now = nowISO();
  execute('UPDATE users SET last_login = ?, updated_at = ? WHERE id = ?', [now, now, user.id]);

  try {
    execute(
      'INSERT INTO audit_logs (id, user_name, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuid(), user.name, 'LOGIN', 'auth', user.id, `User signed in successfully (${user.role})`, now]
    );
  } catch (e) {
    console.error('Audit login failed:', e.message);
  }

  const token = signToken(user);
  res.json({ token, user: publicUser({ ...user, last_login: now }) });
});

router.post('/logout', authRequired, (req, res) => {
  try {
    const now = nowISO();
    execute(
      'INSERT INTO audit_logs (id, user_name, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uuid(), req.user?.name || 'User', 'LOGOUT', 'auth', req.user?.id || null, 'User signed out', now]
    );
  } catch (e) {
    console.error('Audit logout failed:', e.message);
  }
  res.json({ ok: true });
});

router.get('/me', authRequired, (req, res) => {
  const user = queryOne('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ user: publicUser(user) });
});

// User management (admin only)
router.get('/users', authRequired, requireRole('admin'), (_req, res) => {
  const users = queryAll('SELECT * FROM users ORDER BY name');
  res.json(users.map(publicUser));
});

router.post('/users', authRequired, requireRole('admin'), (req, res) => {
  const { name, email, password, role, phone, active } = req.body || {};
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  const existing = queryOne('SELECT id FROM users WHERE lower(email) = lower(?)', [email]);
  if (existing) {
    return res.status(400).json({ error: 'Email already exists' });
  }

  const id = uuid();
  const now = nowISO();
  const hash = password ? bcrypt.hashSync(password, 10) : null;
  const userRole = ['admin', 'manager', 'staff'].includes(role) ? role : 'staff';

  execute(
    `INSERT INTO users (id, name, email, password_hash, role, phone, active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, name, email, hash, userRole, phone || null, active === false ? 0 : 1, now, now]
  );

  const user = queryOne('SELECT * FROM users WHERE id = ?', [id]);
  res.status(201).json(publicUser(user));
});

router.put('/users/:id', authRequired, requireRole('admin'), (req, res) => {
  const existing = queryOne('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  const { name, email, password, role, phone, active } = req.body || {};
  const now = nowISO();
  let hash = existing.password_hash;
  if (password) hash = bcrypt.hashSync(password, 10);

  const userRole = role && ['admin', 'manager', 'staff'].includes(role) ? role : existing.role;

  execute(
    `UPDATE users SET name = ?, email = ?, password_hash = ?, role = ?, phone = ?, active = ?, updated_at = ?
     WHERE id = ?`,
    [
      name ?? existing.name,
      email ?? existing.email,
      hash,
      userRole,
      phone !== undefined ? phone : existing.phone,
      active === undefined ? existing.active : (active ? 1 : 0),
      now,
      req.params.id,
    ]
  );

  const user = queryOne('SELECT * FROM users WHERE id = ?', [req.params.id]);
  res.json(publicUser(user));
});

router.delete('/users/:id', authRequired, requireRole('admin'), (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  const existing = queryOne('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'User not found' });

  // Soft delete
  execute('UPDATE users SET active = 0, updated_at = ? WHERE id = ?', [nowISO(), req.params.id]);
  res.json({ ok: true });
});

export default router;
