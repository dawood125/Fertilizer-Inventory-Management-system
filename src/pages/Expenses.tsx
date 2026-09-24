import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import type { Expense, ExpenseCategory } from '@/lib/types';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/Button';
import { Field, Input, Select, Textarea } from '@/components/Form';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal, ConfirmModal } from '@/components/Modal';
import { PrintPreview } from '@/components/PrintPreview';
import { PrintDocument, PrintTd, PrintTh } from '@/components/PrintDocument';
import { formatCurrency, formatDate, formatDateTime, todayISO, cn } from '@/lib/utils';
import {
  Plus,
  Pencil,
  Trash2,
  Receipt,
  Search,
  Tag,
  Clock,
  Eye,
  Printer,
  FileText,
  Wallet,
  Landmark,
  X,
} from 'lucide-react';
import { DateTimeFilter, type DateFilterValue, isWithinDateRange } from '@/components/DateTimeFilter';

export function Expenses() {
  const { symbol, settings, logoSrc } = useSettings();
  const { notify } = useToast();
  const [expenses, setExpenses] = useState<any[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({ preset: 'all' });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [showCatForm, setShowCatForm] = useState(false);
  const [viewing, setViewing] = useState<any | null>(null);
  const [printVoucher, setPrintVoucher] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, c] = await Promise.all([
        api.get<Expense[]>('/api/data/expenses'),
        api.get<ExpenseCategory[]>('/api/data/expense_categories'),
      ]);
      const cats = (c || []).sort((a, b) => a.name.localeCompare(b.name));
      const catMap = new Map(cats.map((x) => [x.id, x]));
      setCategories(cats);
      setExpenses(
        (e || [])
          .map((exp) => ({
            ...exp,
            expense_categories: exp.category_id ? { name: catMap.get(exp.category_id)?.name || '' } : null,
          }))
          .sort((a, b) => String(b.created_at || b.date).localeCompare(String(a.created_at || a.date)))
      );
    } catch {
      setExpenses([]);
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const todayStr = todayISO();
  const currentMonthPrefix = new Date().toISOString().slice(0, 7);

  const totalThisMonth = useMemo(() => {
    return expenses
      .filter((e) => (e.date || e.created_at || '').startsWith(currentMonthPrefix))
      .reduce((s, e) => s + Number(e.amount || 0), 0);
  }, [expenses, currentMonthPrefix]);

  const monthCount = useMemo(() => {
    return expenses.filter((e) => (e.date || e.created_at || '').startsWith(currentMonthPrefix)).length;
  }, [expenses, currentMonthPrefix]);

  const todayExpenses = useMemo(() => {
    return expenses.filter(
      (e) => e.date === todayStr || String(e.created_at || '').startsWith(todayStr)
    );
  }, [expenses, todayStr]);

  const totalToday = useMemo(() => {
    return todayExpenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  }, [todayExpenses]);

  const totalCash = useMemo(() => {
    return expenses
      .filter((e) => e.payment_method === 'cash')
      .reduce((s, e) => s + Number(e.amount || 0), 0);
  }, [expenses]);

  const totalDigital = useMemo(() => {
    return expenses
      .filter((e) => ['bank', 'jazzcash', 'easypaisa'].includes(e.payment_method))
      .reduce((s, e) => s + Number(e.amount || 0), 0);
  }, [expenses]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return expenses.filter((e) => {
      const matchSearch =
        !q ||
        e.note?.toLowerCase().includes(q) ||
        e.receipt_note?.toLowerCase().includes(q) ||
        e.expense_categories?.name?.toLowerCase().includes(q) ||
        e.payment_method?.toLowerCase().includes(q);
      const matchCategory = !categoryFilter || e.category_id === categoryFilter;
      const matchMethod = !methodFilter || e.payment_method === methodFilter;
      const matchDate = isWithinDateRange(e.date || e.created_at, dateFilter);
      return matchSearch && matchCategory && matchMethod && matchDate;
    });
  }, [expenses, search, categoryFilter, methodFilter, dateFilter]);

  const hasActiveFilters = Boolean(search || categoryFilter || methodFilter || dateFilter.preset !== 'all');

  const save = async (data: any) => {
    try {
      const { payment_method, ...rest } = data;
      if (editing) {
        await api.put(`/api/data/expenses/${editing.id}`, { ...rest, payment_method });
        notify('Expense updated successfully', 'success');
      } else {
        const inserted = await api.post<any>('/api/data/expenses', { ...rest, payment_method });
        if (inserted && payment_method !== 'credit') {
          const accounts = await api.get<any[]>('/api/data/payment_accounts');
          const acc = (accounts || []).find((a) => a.type === payment_method);
          if (acc) {
            await api.put(`/api/data/payment_accounts/${acc.id}`, {
              balance: acc.balance - Number(rest.amount),
            });
          }
          await api.post('/api/data/transactions', {
            type: 'expense',
            account_type: payment_method,
            amount: Number(rest.amount),
            reference_type: 'expense',
            reference_id: inserted.id,
            note: rest.note || 'Expense',
          });
        }
        notify('Expense added with timestamp', 'success');
      }
      setShowForm(false);
      setEditing(null);
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to save expense', 'error');
    }
  };

  const remove = async (e: Expense) => {
    try {
      if (e.payment_method && e.payment_method !== 'credit' && Number(e.amount) > 0) {
        // Restore money back to the account
        const accounts = await api.get<any[]>('/api/data/payment_accounts');
        const acc = (accounts || []).find((a) => a.type === e.payment_method);
        if (acc) {
          await api.put(`/api/data/payment_accounts/${acc.id}`, {
            balance: Number(acc.balance || 0) + Number(e.amount),
          });
        }
        // Remove or cleanup associated transaction
        const txs = await api.get<any[]>('/api/data/transactions');
        const match = (txs || []).find((t) => t.reference_type === 'expense' && t.reference_id === e.id);
        if (match) {
          await api.delete(`/api/data/transactions/${match.id}`);
        }
      }
      await api.delete(`/api/data/expenses/${e.id}`);
      notify('Expense deleted and cash balance restored', 'success');
      load();
    } catch (err: any) {
      notify(err.message || 'Failed to delete', 'error');
    }
  };

  if (loading)
    return (
      <div>
        <PageHeader title="Expenses" />
        <Spinner />
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Expenses"
        subtitle={`${formatCurrency(totalThisMonth, symbol)} this month • Date & Time history tracking`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" icon={<Tag size={16} />} onClick={() => setShowCatForm(true)}>
              Categories
            </Button>
            <Button
              icon={<Plus size={18} />}
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              Add Expense
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Card className="p-4 border-l-4 border-l-rose-500">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">This Month Expenses</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{formatCurrency(totalThisMonth, symbol)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{monthCount} expense entries</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-amber-500">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Today's Expenses</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(totalToday, symbol)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{todayExpenses.length} entries today</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-emerald-500">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Cash Outflow</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(totalCash, symbol)}</p>
          <p className="text-xs text-slate-400 mt-0.5">Physical cash drawer</p>
        </Card>
        <Card className="p-4 border-l-4 border-l-sky-500">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Bank & Wallets</p>
          <p className="text-2xl font-bold text-sky-600 mt-1">{formatCurrency(totalDigital, symbol)}</p>
          <p className="text-xs text-slate-400 mt-0.5">Online & mobile accounts</p>
        </Card>
      </div>

      {/* Filters Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search expenses by note, receipt, or category..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 text-slate-700"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 text-slate-700"
        >
          <option value="">All Payment Methods</option>
          <option value="cash">Cash</option>
          <option value="bank">Bank</option>
          <option value="jazzcash">JazzCash</option>
          <option value="easypaisa">EasyPaisa</option>
          <option value="credit">Credit (Pay Later)</option>
        </select>

        <DateTimeFilter value={dateFilter} onChange={setDateFilter} />

        {hasActiveFilters && (
          <Button
            variant="outline"
            size="sm"
            icon={<X size={14} />}
            onClick={() => {
              setSearch('');
              setCategoryFilter('');
              setMethodFilter('');
              setDateFilter({ preset: 'all' });
            }}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="mb-2 flex items-center justify-between text-xs text-slate-500 px-1">
        <span>Showing <strong className="text-slate-700">{filtered.length}</strong> of <strong className="text-slate-700">{expenses.length}</strong> expenses</span>
        {filtered.length > 0 && (
          <span>Total: <strong className="text-rose-600 font-semibold">{formatCurrency(filtered.reduce((s, e) => s + Number(e.amount || 0), 0), symbol)}</strong></span>
        )}
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Receipt size={32} />}
            title={hasActiveFilters ? 'No expenses match the filter' : 'No expenses recorded'}
            action={
              hasActiveFilters ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch('');
                    setCategoryFilter('');
                    setMethodFilter('');
                    setDateFilter({ preset: 'all' });
                  }}
                >
                  Clear Filters
                </Button>
              ) : (
                <Button icon={<Plus size={18} />} onClick={() => setShowForm(true)}>
                  Add Expense
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <span className="flex items-center gap-1.5">
                      <Clock size={14} className="text-slate-400" />
                      Date & Time
                    </span>
                  </th>
                  <th>Category</th>
                  <th>Note / Description</th>
                  <th>Payment Method</th>
                  <th>Amount</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td className="font-medium text-slate-700 whitespace-nowrap">
                      {formatDateTime(e.created_at || e.date)}
                    </td>
                    <td>
                      {e.expense_categories ? (
                        <Badge variant="blue">{e.expense_categories.name}</Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td>
                      <div className="max-w-xs truncate" title={e.note || ''}>
                        <span className="text-slate-800">{e.note || '—'}</span>
                        {e.receipt_note && (
                          <span className="block text-[11px] text-slate-400 truncate">
                            {e.receipt_note}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <Badge
                        variant={
                          e.payment_method === 'cash'
                            ? 'green'
                            : e.payment_method === 'credit'
                            ? 'amber'
                            : 'blue'
                        }
                      >
                        {e.payment_method}
                      </Badge>
                    </td>
                    <td className="font-semibold text-rose-600 whitespace-nowrap">
                      {formatCurrency(e.amount, symbol)}
                    </td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setViewing(e)}
                          title="View Expense Details & History Slip"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sky-600 transition"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => {
                            setEditing(e);
                            setShowForm(true);
                          }}
                          title="Edit Expense"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 transition"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(e)}
                          title="Delete Expense & Restore Cash"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add / Edit Expense Modal */}
      <ExpenseForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        onSave={save}
        editing={editing}
        categories={categories}
      />

      {/* Delete Confirmation */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove(deleteTarget)}
        title="Delete Expense"
        message="Are you sure you want to delete this expense record? The cash or bank account balance will be automatically restored."
        confirmLabel="Delete & Restore Cash"
        danger
      />

      {/* Category Manager */}
      <CategoryManager
        open={showCatForm}
        onClose={() => setShowCatForm(false)}
        categories={categories}
        onChanged={load}
        table="expense_categories"
      />

      {/* View Expense History & Voucher Modal */}
      {viewing && (
        <Modal
          open={!!viewing}
          onClose={() => setViewing(null)}
          title="Expense Details & History Record"
          size="md"
          footer={
            <div className="flex items-center justify-between w-full">
              <Button
                variant="outline"
                icon={<Printer size={16} />}
                onClick={() => setPrintVoucher(true)}
              >
                Print Expense Voucher
              </Button>
              <Button variant="outline" onClick={() => setViewing(null)}>
                Close
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-200 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Amount Disbursed
              </p>
              <p className="text-3xl font-bold text-rose-600 mt-1">
                {formatCurrency(viewing.amount, symbol)}
              </p>
              <Badge
                variant={
                  viewing.payment_method === 'cash'
                    ? 'green'
                    : viewing.payment_method === 'credit'
                    ? 'amber'
                    : 'blue'
                }
                className="mt-2"
              >
                Paid via {viewing.payment_method}
              </Badge>
            </div>

            <div className="space-y-2.5 rounded-xl border border-slate-200 p-4 text-xs">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="text-slate-400 font-medium">Date & Time Created</span>
                <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                  <Clock size={13} className="text-slate-400" />
                  {formatDateTime(viewing.created_at || viewing.date)}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="text-slate-400 font-medium">Category</span>
                <span className="font-semibold text-slate-800">
                  {viewing.expense_categories?.name || 'General Expense'}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="text-slate-400 font-medium">Description / Purpose</span>
                <span className="font-semibold text-slate-800 text-right max-w-[240px]">
                  {viewing.note || '—'}
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <span className="text-slate-400 font-medium">Receipt / Bill Note</span>
                <span className="font-semibold text-slate-800 text-right max-w-[240px]">
                  {viewing.receipt_note || '—'}
                </span>
              </div>
              <div className="flex justify-between items-center pt-0.5">
                <span className="text-slate-400 font-medium">Record ID</span>
                <span className="font-mono text-[11px] text-slate-500">{viewing.id}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Printable Expense Voucher */}
      {viewing && printVoucher && (
        <PrintPreview
          open={printVoucher}
          onClose={() => setPrintVoucher(false)}
          title={`Expense Voucher — ${formatDate(viewing.date || viewing.created_at)}`}
          size="md"
          fileName={`expense_voucher_${String(viewing.id).slice(0, 8)}.pdf`}
        >
          <PrintDocument
            storeName={settings?.store_name || 'Expense Voucher'}
            subtitle="Official Business Expense & Outflow Voucher"
            logoSrc={logoSrc}
            fields={[
              {
                label: 'Voucher Date & Time',
                value: formatDateTime(viewing.created_at || viewing.date),
              },
              {
                label: 'Category',
                value: viewing.expense_categories?.name || 'General Expense',
              },
              {
                label: 'Paid Via',
                value: String(viewing.payment_method).toUpperCase(),
              },
              { label: 'Printed At', value: formatDateTime(new Date().toISOString()) },
            ]}
          >
            <div className="mb-4">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <PrintTh>Description / Purpose</PrintTh>
                    <PrintTh>Receipt Reference / Note</PrintTh>
                    <PrintTh align="right">Amount Paid</PrintTh>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <PrintTd className="font-medium text-slate-800">
                      {viewing.note || 'General Expense'}
                    </PrintTd>
                    <PrintTd className="text-slate-500">{viewing.receipt_note || '—'}</PrintTd>
                    <PrintTd align="right" className="font-bold text-rose-700 text-sm">
                      {formatCurrency(viewing.amount, symbol)}
                    </PrintTd>
                  </tr>
                  <tr className="border-t border-slate-300 font-bold bg-slate-50">
                    <PrintTd colSpan={2} className="text-right">
                      Total Disbursed:
                    </PrintTd>
                    <PrintTd align="right" className="text-rose-700 font-bold text-base">
                      {formatCurrency(viewing.amount, symbol)}
                    </PrintTd>
                  </tr>
                </tbody>
              </table>

              <div className="mt-12 grid grid-cols-2 gap-8 text-center text-xs">
                <div className="border-t border-slate-300 pt-2">
                  <p className="font-semibold text-slate-700">Cashier / Disbursed By</p>
                </div>
                <div className="border-t border-slate-300 pt-2">
                  <p className="font-semibold text-slate-700">Receiver / Authorized Signature</p>
                </div>
              </div>
            </div>
          </PrintDocument>
        </PrintPreview>
      )}
    </div>
  );
}

function ExpenseForm({
  open,
  onClose,
  onSave,
  editing,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (d: any) => void;
  editing: Expense | null;
  categories: ExpenseCategory[];
}) {
  const [form, setForm] = useState({
    category_id: '',
    amount: 0,
    date: todayISO(),
    payment_method: 'cash',
    note: '',
    receipt_note: '',
  });

  useEffect(() => {
    if (editing)
      setForm({
        category_id: editing.category_id || '',
        amount: editing.amount,
        date: editing.date,
        payment_method: editing.payment_method,
        note: editing.note || '',
        receipt_note: editing.receipt_note || '',
      });
    else
      setForm({
        category_id: '',
        amount: 0,
        date: todayISO(),
        payment_method: 'cash',
        note: '',
        receipt_note: '',
      });
  }, [editing, open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Expense' : 'Add Expense'}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSave(form)} disabled={form.amount <= 0}>
            Save Expense
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Category">
          <Select
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
          >
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Amount" required>
          <Input
            type="number"
            value={form.amount || ''}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            autoFocus
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </Field>
          <Field label="Payment Method">
            <Select
              value={form.payment_method}
              onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
            >
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
              <option value="jazzcash">JazzCash</option>
              <option value="easypaisa">EasyPaisa</option>
              <option value="credit">Credit (Pay Later)</option>
            </Select>
          </Field>
        </div>
        <Field label="Note / Purpose">
          <Input
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="e.g. Shop electricity bill, refreshments, fuel"
          />
        </Field>
        <Field label="Receipt Note / Reference">
          <Textarea
            value={form.receipt_note}
            onChange={(e) => setForm({ ...form, receipt_note: e.target.value })}
            rows={2}
            placeholder="Receipt #, vendor info, or tracking remarks"
          />
        </Field>
      </div>
    </Modal>
  );
}

export function CategoryManager({
  open,
  onClose,
  categories,
  onChanged,
  table,
}: {
  open: boolean;
  onClose: () => void;
  categories: any[];
  onChanged: () => void;
  table: string;
}) {
  const { notify } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const add = async () => {
    if (!name) return;
    try {
      await api.post(`/api/data/${table}`, { name, description });
      setName('');
      setDescription('');
      notify('Category added', 'success');
      onChanged();
    } catch (e: any) {
      notify(e.message || 'Failed to add category', 'error');
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/api/data/${table}/${id}`);
      notify('Category deleted', 'success');
      onChanged();
    } catch (e: any) {
      notify(e.message || 'Failed to delete', 'error');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Manage Categories" size="md">
      <div className="space-y-4">
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          <Field label="New Category Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Category name"
            />
          </Field>
          <Field label="Description">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </Field>
          <Button size="sm" icon={<Plus size={16} />} onClick={add} disabled={!name}>
            Add Category
          </Button>
        </div>
        <div className="space-y-1.5">
          {categories.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-lg border border-slate-200 p-2.5"
            >
              <div>
                <p className="text-sm font-medium text-slate-700">{c.name}</p>
                <p className="text-xs text-slate-400">{c.description || 'No description'}</p>
              </div>
              <button
                onClick={() => remove(c.id)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {categories.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-400">No categories yet</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
