import jwt from 'jsonwebtoken';
import { queryOne } from '../database/connection.js';

const JWT_SECRET = process.env.JWT_SECRET || 'inventory-biscuits-distributor-jwt-secret-change-in-prod';
const JWT_EXPIRES = '8h';

export function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

export function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = queryOne(
      'SELECT id, name, email, role, phone, active FROM users WHERE id = ?',
      [payload.id]
    );
    if (!user || !user.active) {
      return res.status(401).json({ error: 'User inactive or not found' });
    }
    req.user = {
      ...user,
      active: Boolean(user.active),
    };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = payload;
    } catch {
      // ignore
    }
  }
  next();
}
