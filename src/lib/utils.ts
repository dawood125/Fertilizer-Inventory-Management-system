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
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `${prefix}-${stamp}-${rand}`;
};

export const cn = (...classes: (string | false | null | undefined)[]): string =>
  classes.filter(Boolean).join(' ');
