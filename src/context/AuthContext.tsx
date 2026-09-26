import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, apiRequest, getStoredToken, getStoredUser, initApiBase, setAuthSession } from '@/lib/api';

export type AuthUser = {
  id: string;
  name: string;
  email: string | null;
  role: 'admin' | 'manager' | 'staff' | string;
  phone?: string | null;
  active?: boolean;
  permissions?: string[];
};

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
  isStaff: boolean;
  canAccess: (path: string) => boolean;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Nav/path access by role and customized permissions */
export function roleCanAccess(userOrRole: AuthUser | string | undefined | null, path: string): boolean {
  if (!userOrRole) return false;
  const role = typeof userOrRole === 'string' ? userOrRole : userOrRole.role;
  const permissions = typeof userOrRole === 'object' && userOrRole ? userOrRole.permissions : undefined;
  if (!role) return false;
  if (role === 'admin') return true;

  if (Array.isArray(permissions) && permissions.length > 0) {
    if (path === '/') return true;
    if (path === '/pos' || path.startsWith('/pos/')) return permissions.includes('pos');
    if (path === '/orders' || path.startsWith('/orders/')) return permissions.includes('orders');
    if (path === '/products' || path.startsWith('/products/') || path === '/stock' || path.startsWith('/stock/')) {
      return permissions.includes('inventory');
    }
    if (path === '/purchases' || path.startsWith('/purchases/') || path === '/purchase-orders' || path.startsWith('/purchase-orders/')) {
      return permissions.includes('purchases');
    }
    if (path === '/customers' || path.startsWith('/customers/')) return permissions.includes('customers');
    if (path === '/suppliers' || path.startsWith('/suppliers/')) return permissions.includes('suppliers');
    if (path === '/expenses' || path.startsWith('/expenses/')) return permissions.includes('expenses');
    if (path === '/reports' || path.startsWith('/reports/')) return permissions.includes('reports');
    if (path === '/pending-payments' || path.startsWith('/pending-payments/')) {
      return permissions.includes('pos') || permissions.includes('purchases');
    }
    if (path === '/settings' || path.startsWith('/settings/')) return permissions.includes('settings');
    return false;
  }

  if (role === 'staff') {
    const allowed = ['/', '/pos', '/orders', '/customers', '/products'];
    return allowed.some((p) => (p === '/' ? path === '/' : path === p || path.startsWith(`${p}/`)));
  }

  if (role === 'manager') {
    return true;
  }

  return false;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser<AuthUser>());
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api.get<{ user: AuthUser }>('/api/auth/me');
      setUser(data.user);
      setAuthSession(token, data.user);
    } catch {
      setAuthSession(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await initApiBase();
      if (!mounted) return;
      await refreshMe();
    })();

    const onUnauthorized = () => {
      setUser(null);
      setAuthSession(null);
    };
    window.addEventListener('ims:unauthorized', onUnauthorized);
    return () => {
      mounted = false;
      window.removeEventListener('ims:unauthorized', onUnauthorized);
    };
  }, [refreshMe]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiRequest<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
    setAuthSession(data.token, data.user);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      // ignore network errors on logout
    }
    setAuthSession(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      logout,
      refreshMe,
      isAdmin: user?.role === 'admin',
      isManager: user?.role === 'manager' || user?.role === 'admin',
      isStaff: user?.role === 'staff',
      canAccess: (path: string) => roleCanAccess(user, path),
      hasPermission: (perm: string) => {
        if (!user) return false;
        if (user.role === 'admin') return true;
        if (Array.isArray(user.permissions) && user.permissions.length > 0) {
          return user.permissions.includes(perm);
        }
        if (user.role === 'manager') return perm !== 'settings';
        if (user.role === 'staff') {
          return ['pos', 'orders', 'customers', 'inventory'].includes(perm);
        }
        return false;
      },
    }),
    [user, loading, login, logout, refreshMe]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
