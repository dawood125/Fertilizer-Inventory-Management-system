import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/Button';
import { Field, Input, Select, Textarea } from '@/components/Form';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import {
  Wallet,
  Landmark,
  Smartphone,
  ArrowDownRight,
  ArrowUpRight,
  ArrowLeftRight,
  Clock,
  Search,
  Plus,
  Sliders,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { DateTimeFilter, type DateFilterValue, isWithinDateRange } from '@/components/DateTimeFilter';

const ACCOUNTS = [
  { type: 'cash', label: 'Cash Drawer', icon: <Wallet size={20} />, color: 'from-emerald-500 to-emerald-600' },
  { type: 'bank', label: 'Bank Account', icon: <Landmark size={20} />, color: 'from-sky-500 to-sky-600' },
  { type: 'jazzcash', label: 'JazzCash', icon: <Smartphone size={20} />, color: 'from-rose-500 to-rose-600' },
  { type: 'easypaisa', label: 'EasyPaisa', icon: <Smartphone size={20} />, color: 'from-violet-500 to-violet-600' },
];

export function Finance() {
  const { symbol } = useSettings();
  const { notify } = useToast();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [modal, setModal] = useState<{ type: string; account: string } | null>(null);
  const [addTxModal, setAddTxModal] = useState(false);
  const [transferModal, setTransferModal] = useState(false);
  const [adjustModal, setAdjustModal] = useState<any | null>(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [flowFilter, setFlowFilter] = useState('all'); // all, in, out, transfer
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({ preset: 'all' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, t] = await Promise.all([
        api.get<any[]>('/api/data/payment_accounts'),
        api.get<any[]>('/api/data/transactions?limit=1000'),
      ]);
      setAccounts(a || []);
      setTransactions(
        (t || []).sort((x, y) => String(y.created_at || y.date).localeCompare(String(x.created_at || x.date)))
      );
    } catch {
      setAccounts([]);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const getBal = (type: string) => accounts.find((a) => a.type === type)?.balance || 0;

  // Record In/Out transaction
  const doTransaction = async (data: { type: string; account: string; amount: number; note: string }) => {
    try {
      const acc = accounts.find((a) => a.type === data.account);
      if (!acc) {
        notify(`Account ${data.account} not found`, 'error');
        return;
      }
      const delta = data.type === 'cash_in' || data.type === 'deposit' ? data.amount : -data.amount;
      await api.put(`/api/data/payment_accounts/${acc.id}`, { balance: Number(acc.balance || 0) + delta });
      await api.post('/api/data/transactions', {
        type: data.type,
        account_type: data.account,
        amount: data.amount,
        note: data.note,
        date: new Date().toISOString().slice(0, 10),
      });
      notify('Transaction recorded and balance updated', 'success');
      setModal(null);
      setAddTxModal(false);
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to record transaction', 'error');
    }
  };

  // Transfer between accounts
  const doTransfer = async (from: string, to: string, amount: number, note: string) => {
    try {
      const fromAcc = accounts.find((a) => a.type === from);
      const toAcc = accounts.find((a) => a.type === to);
      if (!fromAcc || !toAcc || from === to) {
        notify('Invalid transfer accounts selected', 'error');
        return;
      }
      if (Number(fromAcc.balance || 0) < amount) {
        notify('Insufficient balance in source account', 'error');
        return;
      }
      await api.put(`/api/data/payment_accounts/${fromAcc.id}`, { balance: Number(fromAcc.balance || 0) - amount });
      await api.put(`/api/data/payment_accounts/${toAcc.id}`, { balance: Number(toAcc.balance || 0) + amount });
      await api.post('/api/data/transactions', {
        type: 'transfer',
        from_account: from,
        to_account: to,
        amount,
        note: note || `Transfer ${from} → ${to}`,
        date: new Date().toISOString().slice(0, 10),
      });
      notify('Transfer completed successfully', 'success');
      setTransferModal(false);
      load();
    } catch (e: any) {
      notify(e.message || 'Transfer failed', 'error');
    }
  };

  // Adjust / Set Account Balance
  const doAdjustBalance = async (accountId: string, newBalance: number, note: string) => {
    try {
      const acc = accounts.find((a) => a.id === accountId);
      if (!acc) return;
      const current = Number(acc.balance || 0);
      const diff = newBalance - current;
      if (diff === 0) {
        setAdjustModal(null);
        return;
      }
      await api.put(`/api/data/payment_accounts/${acc.id}`, { balance: newBalance });
      const isIncrease = diff > 0;
      await api.post('/api/data/transactions', {
        type: isIncrease ? 'cash_in' : 'cash_out',
        account_type: acc.type,
        amount: Math.abs(diff),
        note: note.trim() || `Balance adjustment from ${formatCurrency(current, symbol)} to ${formatCurrency(newBalance, symbol)}`,
        date: new Date().toISOString().slice(0, 10),
      });
      notify(`Balance updated for ${acc.name || acc.type}`, 'success');
      setAdjustModal(null);
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to adjust balance', 'error');
    }
  };

  const totalBalance = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  const cashInHand = getBal('cash');

  // Calculate today's inflow and outflow
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTx = transactions.filter((t) => (t.created_at || t.date || '').startsWith(todayStr));
  const todayIn = todayTx
    .filter((t) => t.type === 'cash_in' || t.type === 'deposit' || t.type === 'sale_payment' || t.type === 'purchase_return')
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const todayOut = todayTx
    .filter((t) => t.type === 'cash_out' || t.type === 'withdraw' || t.type === 'expense' || t.type === 'supplier_payment')
    .reduce((s, t) => s + Number(t.amount || 0), 0);

  // Filtered transactions
  const q = search.toLowerCase().trim();
  const filteredTx = useMemo(() => {
    return transactions.filter((t) => {
      // Account filter
      if (accountFilter !== 'all') {
        const matchAcc = t.account_type === accountFilter || t.from_account === accountFilter || t.to_account === accountFilter;
        if (!matchAcc) return false;
      }

      const isIn =
        t.type === 'cash_in' ||
        t.type === 'deposit' ||
        t.type === 'sale_payment' ||
        t.type === 'purchase_return';
      const isOut =
        t.type === 'cash_out' ||
        t.type === 'withdraw' ||
        t.type === 'expense' ||
        t.type === 'supplier_payment';
      const isTransfer = t.type === 'transfer';

      // Flow filter
      if (flowFilter === 'in' && !isIn) return false;
      if (flowFilter === 'out' && !isOut) return false;
      if (flowFilter === 'transfer' && !isTransfer) return false;

      // Date & Time filter
      const matchDate = isWithinDateRange(t.date || t.created_at, dateFilter);
      if (!matchDate) return false;

      // Text search
      if (!q) return true;
      return (
        t.type?.toLowerCase().includes(q) ||
        t.account_type?.toLowerCase().includes(q) ||
        t.from_account?.toLowerCase().includes(q) ||
        t.to_account?.toLowerCase().includes(q) ||
        t.note?.toLowerCase().includes(q) ||
        String(t.amount).includes(q)
      );
    });
  }, [transactions, accountFilter, flowFilter, q, dateFilter]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Finance & Cash" />
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance & Cash"
        subtitle={`Total Available Balance: ${formatCurrency(totalBalance, symbol)}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" icon={<ArrowLeftRight size={16} />} onClick={() => setTransferModal(true)}>
              Transfer
            </Button>
            <Button icon={<Plus size={16} />} onClick={() => setAddTxModal(true)}>
              Add Transaction
            </Button>
          </div>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 border-l-4 border-l-emerald-500 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Total Net Balance</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{formatCurrency(totalBalance, symbol)}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
              <Wallet size={24} />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Across all accounts</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-sky-500 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Cash in Drawer</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{formatCurrency(cashInHand, symbol)}</p>
            </div>
            <div className="rounded-xl bg-sky-50 p-2.5 text-sky-600">
              <Wallet size={24} />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Physical shop cash</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-600 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Today's Inflow</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600">+{formatCurrency(todayIn, symbol)}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
              <TrendingUp size={24} />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Sales & cash receipts today</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-rose-500 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400">Today's Outflow</p>
              <p className="mt-1 text-2xl font-bold text-rose-600">−{formatCurrency(todayOut, symbol)}</p>
            </div>
            <div className="rounded-xl bg-rose-50 p-2.5 text-rose-600">
              <TrendingDown size={24} />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Expenses & supplier payments</p>
        </Card>
      </div>

      {/* Account Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ACCOUNTS.map((a) => {
          const accRow = accounts.find((x) => x.type === a.type);
          return (
            <Card key={a.type} className="overflow-hidden border border-slate-200">
              <div className={cn('flex items-center justify-between bg-gradient-to-br p-4 text-white', a.color)}>
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">{a.icon}</div>
                  <div>
                    <p className="text-xs uppercase tracking-wider opacity-85 font-medium">{a.label}</p>
                    <p className="text-xl font-bold">{formatCurrency(getBal(a.type), symbol)}</p>
                  </div>
                </div>
                {accRow && (
                  <button
                    onClick={() => setAdjustModal(accRow)}
                    title="Adjust or set starting balance"
                    className="rounded-lg bg-white/20 p-1.5 text-white transition hover:bg-white/30"
                  >
                    <Sliders size={16} />
                  </button>
                )}
              </div>
              <div className="flex gap-2 p-3 bg-white">
                <Button
                  size="sm"
                  variant="success"
                  className="flex-1"
                  icon={<ArrowDownRight size={15} />}
                  onClick={() => setModal({ type: a.type === 'bank' ? 'deposit' : 'cash_in', account: a.type })}
                >
                  In
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  className="flex-1"
                  icon={<ArrowUpRight size={15} />}
                  onClick={() => setModal({ type: a.type === 'bank' ? 'withdraw' : 'cash_out', account: a.type })}
                >
                  Out
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Transaction Ledger Card */}
      <Card title="Finance & Cash Ledger">
        {/* Filters and Search toolbar */}
        <div className="p-4 border-b border-slate-100 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between bg-slate-50/50 rounded-t-xl">
          <div className="relative flex-1 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by note, type, account or amount..."
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-xs focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Account filter chips */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 text-xs">
              <button
                onClick={() => setAccountFilter('all')}
                className={cn('px-2 py-1 rounded font-medium transition', accountFilter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
              >
                All Accounts
              </button>
              {ACCOUNTS.map((a) => (
                <button
                  key={a.type}
                  onClick={() => setAccountFilter(a.type)}
                  className={cn(
                    'px-2 py-1 rounded font-medium transition capitalize',
                    accountFilter === a.type ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  {a.type}
                </button>
              ))}
            </div>

            {/* Flow filter */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 text-xs">
              <button
                onClick={() => setFlowFilter('all')}
                className={cn('px-2 py-1 rounded font-medium transition', flowFilter === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100')}
              >
                All
              </button>
              <button
                onClick={() => setFlowFilter('in')}
                className={cn('px-2 py-1 rounded font-medium transition text-emerald-700', flowFilter === 'in' ? 'bg-emerald-600 text-white' : 'hover:bg-emerald-50')}
              >
                In (+)
              </button>
              <button
                onClick={() => setFlowFilter('out')}
                className={cn('px-2 py-1 rounded font-medium transition text-rose-700', flowFilter === 'out' ? 'bg-rose-600 text-white' : 'hover:bg-rose-50')}
              >
                Out (−)
              </button>
              <button
                onClick={() => setFlowFilter('transfer')}
                className={cn('px-2 py-1 rounded font-medium transition text-blue-700', flowFilter === 'transfer' ? 'bg-blue-600 text-white' : 'hover:bg-blue-50')}
              >
                Transfer
              </button>
            </div>

            {/* Date & Time filter */}
            <DateTimeFilter value={dateFilter} onChange={setDateFilter} compact />
          </div>
        </div>

        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Showing <strong className="text-slate-700">{filteredTx.length}</strong> of <strong className="text-slate-700">{transactions.length}</strong> ledger entries</span>
        </div>

        {filteredTx.length === 0 ? (
          <EmptyState icon={<Clock size={32} />} title="No transactions found" description="Transactions recorded in POS, Payments, Expenses, and Returns will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Type</th>
                  <th>Account</th>
                  <th>Note / Details</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredTx.map((t) => {
                  const isIn =
                    t.type === 'cash_in' ||
                    t.type === 'deposit' ||
                    t.type === 'sale_payment' ||
                    t.type === 'purchase_return';
                  const isTransfer = t.type === 'transfer';
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70 transition">
                      <td className="text-slate-600 text-xs whitespace-nowrap">
                        {formatDateTime(t.created_at || t.date)}
                      </td>
                      <td>
                        <Badge
                          variant={
                            isIn ? 'green' : isTransfer ? 'blue' : 'red'
                          }
                        >
                          {t.type.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="capitalize font-medium text-slate-700">
                        {isTransfer
                          ? `${t.from_account || 'cash'} → ${t.to_account || 'bank'}`
                          : t.account_type || 'cash'}
                      </td>
                      <td className="text-slate-600 max-w-xs truncate" title={t.note || ''}>
                        {t.note || '—'}
                      </td>
                      <td
                        className={cn(
                          'text-right font-bold whitespace-nowrap',
                          isIn ? 'text-emerald-600' : isTransfer ? 'text-blue-600' : 'text-rose-600'
                        )}
                      >
                        {isIn ? '+' : isTransfer ? '⇄ ' : '− '}
                        {formatCurrency(t.amount, symbol)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Quick In/Out Modal */}
      <TransactionModal modal={modal} onClose={() => setModal(null)} onSubmit={doTransaction} symbol={symbol} />

      {/* General Add Transaction Modal */}
      <AddTransactionModal
        open={addTxModal}
        onClose={() => setAddTxModal(false)}
        onSubmit={doTransaction}
        accounts={accounts}
        symbol={symbol}
      />

      {/* Transfer Modal */}
      <TransferModal
        open={transferModal}
        onClose={() => setTransferModal(false)}
        accounts={accounts}
        onTransfer={doTransfer}
        symbol={symbol}
      />

      {/* Adjust Balance Modal */}
      <AdjustBalanceModal
        account={adjustModal}
        onClose={() => setAdjustModal(null)}
        onSave={doAdjustBalance}
        symbol={symbol}
      />
    </div>
  );
}

// Subcomponents
function TransactionModal({
  modal,
  onClose,
  onSubmit,
  symbol,
}: {
  modal: { type: string; account: string } | null;
  onClose: () => void;
  onSubmit: (d: any) => void;
  symbol: string;
}) {
  const [amount, setAmount] = useState<number | ''>('');
  const [note, setNote] = useState('');
  useEffect(() => {
    setAmount('');
    setNote('');
  }, [modal]);

  if (!modal) return null;
  const isIn = modal.type === 'cash_in' || modal.type === 'deposit';

  return (
    <Modal
      open={!!modal}
      onClose={onClose}
      title={`${isIn ? 'Record Inflow (Cash In)' : 'Record Outflow (Cash Out)'} — ${modal.account}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={isIn ? 'success' : 'danger'}
            onClick={() => {
              if (Number(amount) > 0) onSubmit({ ...modal, amount: Number(amount), note });
            }}
            disabled={!amount || Number(amount) <= 0}
          >
            Confirm
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label={`Amount (${symbol})`} required>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
            autoFocus
            placeholder="0"
          />
        </Field>
        <Field label="Note / Reason">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. Daily cash injection, utility bill, lunch, transport"
          />
        </Field>
      </div>
    </Modal>
  );
}

function AddTransactionModal({
  open,
  onClose,
  onSubmit,
  accounts,
  symbol,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (d: any) => void;
  accounts: any[];
  symbol: string;
}) {
  const [type, setType] = useState<'cash_in' | 'cash_out'>('cash_in');
  const [account, setAccount] = useState('cash');
  const [amount, setAmount] = useState<number | ''>('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setType('cash_in');
      setAccount('cash');
      setAmount('');
      setNote('');
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Finance Transaction"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={type === 'cash_in' ? 'success' : 'danger'}
            onClick={() => {
              if (Number(amount) > 0) onSubmit({ type, account, amount: Number(amount), note });
            }}
            disabled={!amount || Number(amount) <= 0}
          >
            Save Transaction
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Flow Direction">
            <Select value={type} onChange={(e) => setType(e.target.value as any)}>
              <option value="cash_in">Money In (Income / Cash In)</option>
              <option value="cash_out">Money Out (Expense / Cash Out)</option>
            </Select>
          </Field>
          <Field label="Target Account">
            <Select value={account} onChange={(e) => setAccount(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.type}>
                  {a.name || a.type} ({formatCurrency(a.balance, symbol)})
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={`Amount (${symbol})`} required>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
            autoFocus
            placeholder="0"
          />
        </Field>
        <Field label="Reason / Description">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Reason for this transaction..."
          />
        </Field>
      </div>
    </Modal>
  );
}

function TransferModal({
  open,
  onClose,
  accounts,
  onTransfer,
  symbol,
}: {
  open: boolean;
  onClose: () => void;
  accounts: any[];
  onTransfer: (f: string, t: string, a: number, n: string) => void;
  symbol: string;
}) {
  const [from, setFrom] = useState('cash');
  const [to, setTo] = useState('bank');
  const [amount, setAmount] = useState<number | ''>('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setAmount('');
      setNote('');
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Transfer Money Between Accounts"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onTransfer(from, to, Number(amount), note)}
            disabled={!amount || Number(amount) <= 0 || from === to}
          >
            Transfer Funds
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="From Account">
            <Select value={from} onChange={(e) => setFrom(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.type}>
                  {a.name || a.type} ({formatCurrency(a.balance, symbol)})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To Account">
            <Select value={to} onChange={(e) => setTo(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.type}>
                  {a.name || a.type} ({formatCurrency(a.balance, symbol)})
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={`Amount (${symbol})`} required>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
            autoFocus
            placeholder="0"
          />
        </Field>
        <Field label="Transfer Note">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Bank deposit from cash drawer"
          />
        </Field>
      </div>
    </Modal>
  );
}

function AdjustBalanceModal({
  account,
  onClose,
  onSave,
  symbol,
}: {
  account: any | null;
  onClose: () => void;
  onSave: (id: string, newBal: number, note: string) => void;
  symbol: string;
}) {
  const [newBal, setNewBal] = useState<number | ''>('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (account) {
      setNewBal(Number(account.balance || 0));
      setNote('Physical balance count reconciliation');
    }
  }, [account]);

  if (!account) return null;

  return (
    <Modal
      open={!!account}
      onClose={onClose}
      title={`Adjust Balance — ${account.name || account.type}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => onSave(account.id, Number(newBal), note)}
            disabled={newBal === '' || Number(newBal) < 0}
          >
            Update Balance
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg bg-slate-50 p-3 text-xs flex justify-between">
          <span className="text-slate-500">Current System Balance:</span>
          <span className="font-bold text-slate-800">{formatCurrency(account.balance, symbol)}</span>
        </div>
        <Field label={`New Physical Balance (${symbol})`} required>
          <Input
            type="number"
            value={newBal}
            onChange={(e) => setNewBal(e.target.value === '' ? '' : Number(e.target.value))}
            autoFocus
            placeholder="0"
          />
        </Field>
        <Field label="Reconciliation Note">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </Field>
      </div>
    </Modal>
  );
}
