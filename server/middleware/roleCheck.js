/**
 * Role checks:
 * admin   → full access
 * manager → most features, no user management, limited settings
 * staff   → POS, Orders, Customers (and related read)
 */

const ROLE_RANK = { staff: 1, manager: 2, admin: 3 };

export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

export function requireMinRole(minRole) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const userRank = ROLE_RANK[req.user.role] || 0;
    const needed = ROLE_RANK[minRole] || 99;
    if (userRank < needed) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/** Routes staff cannot access */
export const STAFF_BLOCKED_PREFIXES = [
  '/api/finance',
  '/api/reports',
  '/api/users',
  '/api/settings/users',
];

export function canAccessPath(role, path) {
  if (role === 'admin') return true;
  if (role === 'manager') {
    if (path.startsWith('/api/users')) return false;
    return true;
  }
  // staff
  if (
    path.startsWith('/api/finance') ||
    path.startsWith('/api/reports') ||
    path.startsWith('/api/users') ||
    path.startsWith('/api/expenses') ||
    path.startsWith('/api/payment-accounts') && path.includes('transfer')
  ) {
    return false;
  }
  return true;
}
