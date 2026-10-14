export const formatCurrency = (amount: number, symbol = 'Rs'): string => {
  const formatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount || 0);
  return `${symbol} ${formatted}`;
};

export const formatNumber = (n: number): string => {
  return new Intl.NumberFormat('en-PK').format(n || 0);
};

export const formatDate = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const formatDateTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const todayISO = (): string => new Date().toISOString().split('T')[0];

export const monthStartISO = (): string => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
};

export const generateDocNumber = (prefix: string): string => {
  if (prefix === 'INV') {
    return String(Math.floor(10000 + Math.random() * 90000));
  }
  if (prefix === 'ORD' || prefix === 'OB' || prefix === 'SR' || prefix === 'PO' || prefix === 'PO-OB' || prefix === 'PR') {
    return `${prefix}-${Math.floor(10000 + Math.random() * 90000)}`;
  }
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}-${stamp}-${rand}`;
};

export const cn = (...classes: (string | false | null | undefined)[]): string =>
  classes.filter(Boolean).join(' ');

export interface ProductExpiryStatus {
  status: 'expired' | 'near_expiry' | 'valid' | 'none';
  daysRemaining?: number;
  label: string;
}

export const getProductExpiryStatus = (expiryDate?: string | null): ProductExpiryStatus => {
  if (!expiryDate) {
    return { status: 'none', label: 'No Expiry' };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate);
  exp.setHours(0, 0, 0, 0);

  if (isNaN(exp.getTime())) {
    return { status: 'none', label: 'Invalid Date' };
  }

  const diffTime = exp.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      status: 'expired',
      daysRemaining: diffDays,
      label: `Expired (${Math.abs(diffDays)}d ago)`,
    };
  }
  if (diffDays <= 30) {
    return {
      status: 'near_expiry',
      daysRemaining: diffDays,
      label: diffDays === 0 ? 'Expires today' : `Expires in ${diffDays}d`,
    };
  }
  return {
    status: 'valid',
    daysRemaining: diffDays,
    label: `Exp: ${expiryDate}`,
  };
};

