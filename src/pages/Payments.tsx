import { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import { api } from '@/lib/api';
import type { PaymentAccount, Transaction, OrderPayment, SupplierPayment } from '@/lib/types';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/Button';
import { Field, Input, Select, Textarea } from '@/components/Form';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { formatCurrency, formatDateTime, formatDate, cn } from '@/lib/utils';
import { sanitizePdfName } from '@/lib/printPdf';
import { PrintPreview } from '@/components/PrintPreview';
import { PrintDocument, PrintTd, PrintTh } from '@/components/PrintDocument';
import { DateTimeFilter, type DateFilterValue, DEFAULT_DATE_FILTER, isWithinDateRange } from '@/components/DateTimeFilter';
import {
  Wallet,
  Landmark,
  Smartphone,
  ArrowDownRight,
  ArrowUpRight,
  ArrowLeftRight,
  Clock,
  Search,
  Printer,
  History,
  FileText,
  Calendar,
  Layers,
  ArrowDownLeft,
  CheckCircle2,
} from 'lucide-react';

const ACCOUNTS = [
  { type: 'cash', label: 'Cash', icon: <Wallet size={20} />, color: 'from-emerald-500 to-emerald-600' },
  { type: 'bank', label: 'Bank', icon: <Landmark size={20} />, color: 'from-sky-500 to-sky-600' },
  { type: 'jazzcash', label: 'JazzCash', icon: <Smartphone size={20} />, color: 'from-rose-500 to-rose-600' },
  { type: 'easypaisa', label: 'EasyPaisa', icon: <Smartphone size={20} />, color: 'from-violet-500 to-violet-600' },
];

export function Payments() {
  const { symbol } = useSettings();
  const { notify } = useToast();
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ type: string; account: string } | null>(null);
  const [transferModal, setTransferModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, t] = await Promise.all([
        api.get<PaymentAccount[]>('/api/data/payment_accounts'),
        api.get<Transaction[]>('/api/data/transactions'),
      ]);
      setAccounts(a || []);
      setTransactions(
        (t || []).sort((x, y) => String(y.created_at).localeCompare(String(x.created_at))).slice(0, 50)
      );
    } catch {
      setAccounts([]);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getBal = (type: string) => accounts.find((a) => a.type === type)?.balance || 0;

  const doTransaction = async (data: { type: string; account: string; amount: number; note: string }) => {
    try {
      const acc = accounts.find((a) => a.type === data.account);
      if (!acc) return;
      const delta = data.type === 'cash_in' || data.type === 'deposit' ? data.amount : -data.amount;
      await api.put(`/api/data/payment_accounts/${acc.id}`, { balance: acc.balance + delta });
      await api.post('/api/data/transactions', {
        type: data.type, account_type: data.account, amount: data.amount, note: data.note,
      });
      notify(`${data.type === 'cash_in' || data.type === 'deposit' ? 'Received' : 'Paid'} ${formatCurrency(data.amount, symbol)}`, 'success');
      setModal(null); load();
    } catch (e: any) {
      notify(e.message || 'Failed', 'error');
    }
  };

  const doTransfer = async (from: string, to: string, amount: number, note: string) => {
    try {
      const fromAcc = accounts.find((a) => a.type === from);
      const toAcc = accounts.find((a) => a.type === to);
      if (!fromAcc || !toAcc || from === to) { notify('Invalid transfer', 'error'); return; }
      if (fromAcc.balance < amount) { notify('Insufficient balance', 'error'); return; }
      await api.put(`/api/data/payment_accounts/${fromAcc.id}`, { balance: fromAcc.balance - amount });
      await api.put(`/api/data/payment_accounts/${toAcc.id}`, { balance: toAcc.balance + amount });
      await api.post('/api/data/transactions', { type: 'transfer', from_account: from, to_account: to, amount, note });
      notify('Transfer completed', 'success');
      setTransferModal(false); load();
    } catch (e: any) {
      notify(e.message || 'Transfer failed', 'error');
    }
  };

  if (loading) return <div><PageHeader title="Payments" /><Spinner /></div>;

  return (
    <div>
      <PageHeader title="Payments" subtitle="Manage cash, bank, and mobile wallet balances" actions={<Button variant="outline" icon={<ArrowLeftRight size={18} />} onClick={() => setTransferModal(true)}>Transfer</Button>} />

      {/* Account cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ACCOUNTS.map((a) => (
          <Card key={a.type} className="overflow-hidden">
            <div className={cn('flex items-center gap-3 bg-gradient-to-br p-4 text-white', a.color)}>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20">{a.icon}</div>
              <div><p className="text-xs uppercase tracking-wider opacity-80">{a.label}</p><p className="text-xl font-bold">{formatCurrency(getBal(a.type), symbol)}</p></div>
            </div>
            <div className="flex gap-2 p-3">
              <Button size="sm" variant="success" className="flex-1" icon={<ArrowDownRight size={15} />} onClick={() => setModal({ type: a.type === 'bank' ? 'deposit' : 'cash_in', account: a.type })}>In</Button>
              <Button size="sm" variant="danger" className="flex-1" icon={<ArrowUpRight size={15} />} onClick={() => setModal({ type: a.type === 'bank' ? 'withdraw' : 'cash_out', account: a.type })}>Out</Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Recent transactions */}
      <Card title="Recent Transactions" className="mt-4">
        {transactions.length === 0 ? <EmptyState icon={<Clock size={28} />} title="No transactions yet" /> : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Type</th><th>Account</th><th>Amount</th><th>Note</th><th>Date</th></tr></thead>
              <tbody>
                {transactions.map((t) => {
                  const isIn = t.type === 'cash_in' || t.type === 'deposit' || (t.type === 'transfer' && t.to_account);
                  return (
                    <tr key={t.id}>
                      <td><Badge variant={isIn ? 'green' : t.type === 'transfer' ? 'blue' : 'red'}>{t.type.replace('_', ' ')}</Badge></td>
                      <td>{t.from_account && t.to_account ? `${t.from_account} → ${t.to_account}` : t.account_type || '—'}</td>
                      <td className={cn('font-semibold', isIn ? 'text-emerald-600' : 'text-rose-600')}>{isIn ? '+' : '−'} {formatCurrency(t.amount, symbol)}</td>
                      <td className="text-slate-500">{t.note || '—'}</td>
                      <td className="text-slate-500">{formatDateTime(t.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <TransactionModal modal={modal} onClose={() => setModal(null)} onSubmit={doTransaction} symbol={symbol} />
      <TransferModal open={transferModal} onClose={() => setTransferModal(false)} accounts={accounts} onTransfer={doTransfer} symbol={symbol} />
    </div>
  );
}

function TransactionModal({ modal, onClose, onSubmit, symbol }: { modal: { type: string; account: string } | null; onClose: () => void; onSubmit: (d: any) => void; symbol: string }) {
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  useEffect(() => { setAmount(0); setNote(''); }, [modal]);
  if (!modal) return null;
  const isIn = modal.type === 'cash_in' || modal.type === 'deposit';
  return (
    <Modal open={!!modal} onClose={onClose} title={`${isIn ? 'Receive' : 'Pay Out'} — ${modal.account}`} size="sm" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant={isIn ? 'success' : 'danger'} onClick={() => { if (amount > 0) onSubmit({ ...modal, amount, note }); }} disabled={amount <= 0}>Confirm</Button></>}>
      <div className="space-y-3">
        <Field label="Amount" required><Input type="number" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} autoFocus /></Field>
        <Field label="Note"><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Reason" /></Field>
      </div>
    </Modal>
  );
}

function TransferModal({ open, onClose, accounts, onTransfer, symbol }: { open: boolean; onClose: () => void; accounts: PaymentAccount[]; onTransfer: (f: string, t: string, a: number, n: string) => void; symbol: string }) {
  const [from, setFrom] = useState('cash');
  const [to, setTo] = useState('bank');
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  useEffect(() => { if (open) { setAmount(0); setNote(''); } }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Transfer Money" size="sm" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onTransfer(from, to, amount, note)} disabled={amount <= 0 || from === to}>Transfer</Button></>}>
      <div className="space-y-3">
        <Field label="From Account"><Select value={from} onChange={(e) => setFrom(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.type}>{a.name} ({formatCurrency(a.balance, symbol)})</option>)}</Select></Field>
        <Field label="To Account"><Select value={to} onChange={(e) => setTo(e.target.value)}>{accounts.map((a) => <option key={a.id} value={a.type}>{a.name}</option>)}</Select></Field>
        <Field label="Amount" required><Input type="number" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} autoFocus /></Field>
        <Field label="Note"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

// ===== PENDING PAYMENTS =====
export function PendingPayments() {
  const { symbol, settings, logoSrc } = useSettings();
  const { notify } = useToast();
  const [pendingOrders, setPendingOrders] = useState<any[]>([]);
  const [pendingPOs, setPendingPOs] = useState<any[]>([]);
  const [orderPayments, setOrderPayments] = useState<OrderPayment[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(DEFAULT_DATE_FILTER);
  const [activeTab, setActiveTab] = useState<'pending' | 'history'>('pending');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'customer' | 'supplier'>('all');
  const [rawOrdersMap, setRawOrdersMap] = useState<Map<string, any>>(new Map());
  const [rawPOsMap, setRawPOsMap] = useState<Map<string, any>>(new Map());

  const [payModal, setPayModal] = useState<{
    type: 'customer' | 'supplier';
    id: string;
    name: string;
    total: number;
    paid_amount: number;
    amount: number;
    order_number?: string;
  } | null>(null);
  const [historyModal, setHistoryModal] = useState<{ order: any; payments: OrderPayment[] } | null>(null);
  const [supplierHistoryModal, setSupplierHistoryModal] = useState<{ po: any; payments: SupplierPayment[] } | null>(null);
  const [proofOrder, setProofOrder] = useState<{ order: any; payments: OrderPayment[] } | null>(null);
  const [supplierProof, setSupplierProof] = useState<{ po: any; payments: SupplierPayment[] } | null>(null);
  const [printPreview, setPrintPreview] = useState(false);
  const [allSuppliers, setAllSuppliers] = useState<any[]>([]);
  const [allCustomers, setAllCustomers] = useState<any[]>([]);
  const [paymentAccounts, setPaymentAccounts] = useState<any[]>([]);
  const [supplierRefundModal, setSupplierRefundModal] = useState<{ supplier: any; creditAmount: number } | null>(null);
  const [customerRefundModal, setCustomerRefundModal] = useState<{ customer: any; creditAmount: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [o, p, customers, suppliers, payments, sPayments, pAccounts] = await Promise.all([
        api.get<any[]>('/api/data/orders'),
        api.get<any[]>('/api/data/purchase_orders'),
        api.get<any[]>('/api/data/customers'),
        api.get<any[]>('/api/data/suppliers'),
        api.get<OrderPayment[]>('/api/data/order_payments').catch(() => []),
        api.get<SupplierPayment[]>('/api/data/supplier_payments').catch(() => []),
        api.get<any[]>('/api/data/payment_accounts').catch(() => []),
      ]);
      const customerMap = new Map((customers || []).map((c) => [c.id, c]));
      const supplierMap = new Map((suppliers || []).map((s) => [s.id, s]));

      setAllSuppliers(suppliers || []);
      setAllCustomers(customers || []);
      setPaymentAccounts(pAccounts || []);

      const fullOrderMap = new Map((o || []).map((ord) => {
        const cust = ord.customer_id ? customerMap.get(ord.customer_id) : null;
        return [ord.id, {
          ...ord,
          customers: cust ? { name: cust.name, area: cust.area || '', phone: cust.phone || '' } : null,
        }];
      }));

      const fullPOMap = new Map((p || []).map((po) => {
        const sup = po.supplier_id ? supplierMap.get(po.supplier_id) : null;
        return [po.id, {
          ...po,
          suppliers: sup ? { name: sup.name, phone: sup.phone || '' } : null,
        }];
      }));

      setRawOrdersMap(fullOrderMap);
      setRawPOsMap(fullPOMap);
      setOrderPayments(payments || []);
      setSupplierPayments(sPayments || []);

      setPendingOrders(
        (o || [])
          .filter((ord) => ord.payment_status !== 'paid' && (Number(ord.total || 0) - Number(ord.paid_amount || 0)) > 0)
          .map((ord) => fullOrderMap.get(ord.id) || ord)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      );
      setPendingPOs(
        (p || [])
          .filter((po) => po.payment_status !== 'paid' && (Number(po.total || 0) - Number(po.paid_amount || 0)) > 0)
          .map((po) => fullPOMap.get(po.id) || po)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      );
    } catch {
      setPendingOrders([]);
      setPendingPOs([]);
      setOrderPayments([]);
      setSupplierPayments([]);
      setAllSuppliers([]);
      setAllCustomers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const paymentsByOrder = useMemo(() => {
    const map = new Map<string, OrderPayment[]>();
    for (const pm of orderPayments) {
      if (!map.has(pm.order_id)) map.set(pm.order_id, []);
      map.get(pm.order_id)!.push(pm);
    }
    for (const list of map.values()) {
      list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }
    return map;
  }, [orderPayments]);

  const paymentsByPO = useMemo(() => {
    const map = new Map<string, SupplierPayment[]>();
    for (const pm of supplierPayments) {
      if (pm.purchase_id) {
        if (!map.has(pm.purchase_id)) map.set(pm.purchase_id, []);
        map.get(pm.purchase_id)!.push(pm);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }
    return map;
  }, [supplierPayments]);

  const allCollections = useMemo(() => {
    const list: Array<{
      id: string;
      type: 'customer' | 'supplier';
      created_at: string;
      amount: number;
      method: string;
      note: string;
      partyName: string;
      docNumber: string;
      area?: string;
    }> = [];

    const supplierMap = new Map((allSuppliers || []).map((s) => [s.id, s]));

    for (const pm of orderPayments) {
      const ord = pm.order_id ? rawOrdersMap.get(pm.order_id) : null;
      // Skip orphaned customer payments whose parent order was deleted
      if (pm.order_id && !ord) {
        continue;
      }
      list.push({
        id: pm.id,
        type: 'customer',
        created_at: pm.created_at,
        amount: Number(pm.amount || 0),
        method: pm.method,
        note: pm.note || '',
        partyName: ord?.customers?.name || 'Walk-in',
        docNumber: ord?.order_number || 'Order',
        area: ord?.customers?.area || '',
      });
    }

    for (const pm of supplierPayments) {
      const po = pm.purchase_id ? rawPOsMap.get(pm.purchase_id) : null;
      const sup = pm.supplier_id ? supplierMap.get(pm.supplier_id) : (po?.suppliers || null);

      // Skip orphaned supplier payments whose parent PO/supplier was deleted
      if (!po && !sup && (pm.purchase_id || pm.supplier_id)) {
        continue;
      }

      list.push({
        id: pm.id,
        type: 'supplier',
        created_at: pm.created_at,
        amount: Number(pm.amount || 0),
        method: pm.method,
        note: pm.note || '',
        partyName: sup?.name || po?.suppliers?.name || 'Supplier',
        docNumber: po?.po_number || 'PO',
      });
    }

    return list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }, [orderPayments, supplierPayments, rawOrdersMap, rawPOsMap, allSuppliers]);

  // Suppliers holding advance credit / refund owed to our store (balance < 0)
  const supplierCredits = useMemo(() => {
    return allSuppliers
      .filter((s) => Number(s.balance || 0) < 0)
      .map((s) => ({
        ...s,
        creditAmount: Math.abs(Number(s.balance || 0)),
      }))
      .sort((a, b) => b.creditAmount - a.creditAmount);
  }, [allSuppliers]);

  // Customers holding store credit (balance < 0)
  const customerCredits = useMemo(() => {
    return allCustomers
      .filter((c) => Number(c.balance || 0) < 0)
      .map((c) => ({
        ...c,
        creditAmount: Math.abs(Number(c.balance || 0)),
      }))
      .sort((a, b) => b.creditAmount - a.creditAmount);
  }, [allCustomers]);

  const pay = async (method: string, amount: number, note: string) => {
    if (!payModal) return;
    try {
      if (payModal.type === 'customer') {
        const order = pendingOrders.find((o) => o.id === payModal.id);
        const newPaid = Number(order?.paid_amount || 0) + amount;
        const status = newPaid >= Number(order?.total || 0) ? 'paid' : 'partial';
        await api.put(`/api/data/orders/${payModal.id}`, { paid_amount: newPaid, payment_status: status });

        await api.post('/api/data/order_payments', {
          order_id: payModal.id,
          method,
          account_type: method,
          amount,
          note: note.trim() || `Payment for ${order?.order_number || 'Invoice'}`,
        });

        if (method !== 'credit') {
          const accounts = await api.get<any[]>('/api/data/payment_accounts');
          const account = (accounts || []).find((a) => a.type === method);
          if (account) await api.put(`/api/data/payment_accounts/${account.id}`, { balance: account.balance + amount });
          await api.post('/api/data/transactions', {
            type: 'sale_payment',
            account_type: method,
            amount,
            reference_type: 'order',
            reference_id: payModal.id,
            note: note.trim() || `Payment for ${order?.order_number || 'Invoice'}`,
          });
        }
        if (order?.customer_id) {
          const cust = await api.get<any>(`/api/data/customers/${order.customer_id}`);
          if (cust) await api.put(`/api/data/customers/${order.customer_id}`, { balance: Number(cust.balance || 0) - amount });
        }
      } else {
        const po = pendingPOs.find((p) => p.id === payModal.id);
        const newPaid = Number(po?.paid_amount || 0) + amount;
        const status = newPaid >= Number(po?.total || 0) ? 'paid' : 'partial';
        await api.put(`/api/data/purchase_orders/${payModal.id}`, { paid_amount: newPaid, payment_status: status });

        await api.post('/api/data/supplier_payments', {
          purchase_id: payModal.id,
          supplier_id: po?.supplier_id || null,
          method,
          account_type: method,
          amount,
          note: note.trim() || `Payment for ${po?.po_number || 'PO'}`,
        });

        if (method !== 'credit') {
          const accounts = await api.get<any[]>('/api/data/payment_accounts');
          const account = (accounts || []).find((a) => a.type === method);
          if (account) await api.put(`/api/data/payment_accounts/${account.id}`, { balance: account.balance - amount });
          await api.post('/api/data/transactions', {
            type: 'supplier_payment',
            account_type: method,
            amount,
            reference_type: 'purchase',
            reference_id: payModal.id,
            note: note.trim() || `Payment for ${po?.po_number || 'PO'}`,
          });
        }
        if (po?.supplier_id) {
          const sup = await api.get<any>(`/api/data/suppliers/${po.supplier_id}`);
          if (sup) await api.put(`/api/data/suppliers/${po.supplier_id}`, { balance: Number(sup.balance || 0) - amount });
        }
      }
      notify(`Payment of ${formatCurrency(amount, symbol)} recorded with date & time`, 'success');
      setPayModal(null);
      load();
    } catch (e: any) {
      notify(e.message || 'Payment failed', 'error');
    }
  };

  const handleReceiveSupplierRefund = async (supplierId: string, amount: number, accountType: string, note: string) => {
    try {
      const accounts = await api.get<any[]>('/api/data/payment_accounts');
      const acc = (accounts || []).find((a) => a.type === accountType) || (accounts || [])[0];
      if (acc) {
        await api.put(`/api/data/payment_accounts/${acc.id}`, { balance: Number(acc.balance || 0) + amount });
      }
      const sup = await api.get<any>(`/api/data/suppliers/${supplierId}`);
      if (sup) {
        await api.put(`/api/data/suppliers/${supplierId}`, {
          balance: Number(sup.balance || 0) + amount,
        });
      }
      await api.post('/api/data/transactions', {
        type: 'cash_in',
        account_type: acc?.type || accountType,
        amount,
        party_type: 'supplier',
        party_id: supplierId,
        note: note.trim() || `Refund collected from supplier ${sup?.name || ''}`,
        date: new Date().toISOString().slice(0, 10),
      });
      notify(`Collected ${formatCurrency(amount, symbol)} refund from ${sup?.name || 'Supplier'} into ${acc?.name || accountType}`, 'success');
      setSupplierRefundModal(null);
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to collect refund', 'error');
    }
  };

  const handleRefundCustomer = async (customerId: string, amount: number, accountType: string, note: string) => {
    try {
      const accounts = await api.get<any[]>('/api/data/payment_accounts');
      const acc = (accounts || []).find((a) => a.type === accountType) || (accounts || [])[0];
      if (acc) {
        await api.put(`/api/data/payment_accounts/${acc.id}`, { balance: Number(acc.balance || 0) - amount });
      }
      const cust = await api.get<any>(`/api/data/customers/${customerId}`);
      if (cust) {
        await api.put(`/api/data/customers/${customerId}`, {
          balance: Number(cust.balance || 0) + amount,
        });
      }
      await api.post('/api/data/transactions', {
        type: 'cash_out',
        account_type: acc?.type || accountType,
        amount,
        party_type: 'customer',
        party_id: customerId,
        note: note.trim() || `Store credit refund paid to customer ${cust?.name || ''}`,
        date: new Date().toISOString().slice(0, 10),
      });
      notify(`Refunded ${formatCurrency(amount, symbol)} store credit to ${cust?.name || 'Customer'} from ${acc?.name || accountType}`, 'success');
      setCustomerRefundModal(null);
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to refund store credit', 'error');
    }
  };

  if (loading) return <div><PageHeader title="Pending Payments" /><Spinner /></div>;

  const q = search.toLowerCase().trim();

  // Filter pending orders by Search, Area, and Date/Time
  const filteredOrders = pendingOrders.filter((o) => {
    const area = (o.customers?.area || '').trim();
    const matchArea = !areaFilter
      || (areaFilter === '__none__' ? !area : area.toLowerCase() === areaFilter.toLowerCase());
    const matchSearch = !q
      || o.order_number?.toLowerCase().includes(q)
      || o.customers?.name?.toLowerCase().includes(q)
      || area.toLowerCase().includes(q)
      || (!o.customers?.name && 'walk-in'.includes(q));
    const matchDate = isWithinDateRange(o.created_at, dateFilter);
    return matchArea && matchSearch && matchDate;
  });

  // Filter pending POs by Search and Date/Time
  const filteredPOs = pendingPOs.filter((p) => {
    const matchSearch = !q
      || p.po_number?.toLowerCase().includes(q)
      || p.suppliers?.name?.toLowerCase().includes(q);
    const matchDate = isWithinDateRange(p.created_at, dateFilter);
    return matchSearch && matchDate;
  });

  // Filter collection history feed by Search, Type, and Date/Time
  const filteredCollections = allCollections.filter((c) => {
    const matchType = historyTypeFilter === 'all' || c.type === historyTypeFilter;
    const matchSearch = !q
      || c.docNumber.toLowerCase().includes(q)
      || c.partyName.toLowerCase().includes(q)
      || c.method.toLowerCase().includes(q)
      || c.note.toLowerCase().includes(q)
      || (c.area || '').toLowerCase().includes(q);
    const matchDate = isWithinDateRange(c.created_at, dateFilter);
    return matchType && matchSearch && matchDate;
  });

  const totalCollectedCustomer = filteredCollections
    .filter((c) => c.type === 'customer')
    .reduce((sum, c) => sum + c.amount, 0);

  const totalDisbursedSupplier = filteredCollections
    .filter((c) => c.type === 'supplier')
    .reduce((sum, c) => sum + c.amount, 0);

  const areaOptions = Array.from(
    new Set(
      pendingOrders
        .map((o) => (o.customers?.area || '').trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b));
  const hasNoArea = pendingOrders.some((o) => !(o.customers?.area || '').trim());

  const ordersByArea = filteredOrders.reduce<Record<string, typeof filteredOrders>>((acc, o) => {
    const key = (o.customers?.area || '').trim() || 'No area';
    if (!acc[key]) acc[key] = [];
    acc[key].push(o);
    return acc;
  }, {});
  const areaKeys = Object.keys(ordersByArea).sort((a, b) => {
    if (a === 'No area') return 1;
    if (b === 'No area') return -1;
    return a.localeCompare(b);
  });

  const totalCustomer = filteredOrders.reduce((s, o) => s + (Number(o.total) - Number(o.paid_amount || 0)), 0);
  const totalSupplier = filteredPOs.reduce((s, p) => s + (Number(p.total) - Number(p.paid_amount || 0)), 0);

  const totalSupplierCredits = supplierCredits.reduce((s, c) => s + c.creditAmount, 0);
  const totalCustomerCredits = customerCredits.reduce((s, c) => s + c.creditAmount, 0);

  return (
    <div>
      <PageHeader
        title="Pending Payments"
        subtitle="Outstanding customer and supplier balances with timestamped collection history"
        actions={
          <Button
            variant="outline"
            icon={<Printer size={16} />}
            onClick={() => setPrintPreview(true)}
            disabled={filteredOrders.length === 0}
          >
            Print collection sheet
          </Button>
        }
      />

      {/* View Switcher Tabs */}
      <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2.5">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={cn(
            'px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2',
            activeTab === 'pending'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          )}
        >
          <Clock size={15} />
          <span>Outstanding Invoices & Bills</span>
          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', activeTab === 'pending' ? 'bg-sky-700 text-white' : 'bg-slate-200 text-slate-700')}>
            {filteredOrders.length + filteredPOs.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={cn(
            'px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2',
            activeTab === 'history'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          )}
        >
          <History size={15} />
          <span>Payment Collection History</span>
          <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', activeTab === 'history' ? 'bg-sky-700 text-white' : 'bg-slate-200 text-slate-700')}>
            {filteredCollections.length}
          </span>
        </button>
      </div>

      {/* Unified Filter Toolbar with DateTimeFilter */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">Search</label>
          <div className="relative">
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                activeTab === 'pending'
                  ? 'Search order #, PO #, customer, area or supplier...'
                  : 'Search party, invoice/PO, payment method, note...'
              }
              className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-xs font-medium focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 shadow-sm"
            />
          </div>
        </div>

        {/* Universal Date and Time Filter */}
        <div className="shrink-0">
          <DateTimeFilter
            value={dateFilter}
            onChange={setDateFilter}
            label="Date & Time Filter"
          />
        </div>

        {activeTab === 'pending' ? (
          <div className="w-full shrink-0 sm:w-60">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Customer Area</label>
            <Select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
              <option value="">All areas</option>
              {areaOptions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
              {hasNoArea && <option value="__none__">No area set</option>}
            </Select>
          </div>
        ) : (
          <div className="w-full shrink-0 sm:w-56">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Payment Type</label>
            <Select value={historyTypeFilter} onChange={(e: any) => setHistoryTypeFilter(e.target.value)}>
              <option value="all">All Payments</option>
              <option value="customer">Customer Collections In (+)</option>
              <option value="supplier">Supplier Disbursements Out (-)</option>
            </Select>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      {activeTab === 'pending' ? (
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-5">
            <p className="text-xs uppercase text-slate-400 font-semibold">Customer Receivables</p>
            <p className="mt-1 text-2xl font-bold text-amber-600">{formatCurrency(totalCustomer, symbol)}</p>
            <p className="mt-0.5 text-xs text-slate-500">{filteredOrders.length} pending invoice{filteredOrders.length === 1 ? '' : 's'}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs uppercase text-slate-400 font-semibold">Supplier Payables</p>
            <p className="mt-1 text-2xl font-bold text-rose-600">{formatCurrency(totalSupplier, symbol)}</p>
            <p className="mt-0.5 text-xs text-slate-500">{filteredPOs.length} pending purchase{filteredPOs.length === 1 ? '' : 's'}</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs uppercase text-slate-400 font-semibold">Supplier Credits (Due to Us)</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">+{formatCurrency(totalSupplierCredits, symbol)}</p>
            <p className="mt-0.5 text-xs text-slate-500">{supplierCredits.length} refund{supplierCredits.length === 1 ? '' : 's'} owed by suppliers</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs uppercase text-slate-400 font-semibold">Customer Store Credits</p>
            <p className="mt-1 text-2xl font-bold text-sky-600">{formatCurrency(totalCustomerCredits, symbol)}</p>
            <p className="mt-0.5 text-xs text-slate-500">{customerCredits.length} customer credit balance{customerCredits.length === 1 ? '' : 's'}</p>
          </Card>
        </div>
      ) : (
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="p-5">
            <p className="text-xs uppercase text-slate-400 font-semibold">Customer Received</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">+ {formatCurrency(totalCollectedCustomer, symbol)}</p>
            <p className="mt-0.5 text-xs text-slate-500">Collected in filtered period</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs uppercase text-slate-400 font-semibold">Supplier Paid</p>
            <p className="mt-1 text-2xl font-bold text-rose-600">- {formatCurrency(totalDisbursedSupplier, symbol)}</p>
            <p className="mt-0.5 text-xs text-slate-500">Paid out in filtered period</p>
          </Card>
          <Card className="p-5">
            <p className="text-xs uppercase text-slate-400 font-semibold">Net Collections Flow</p>
            <p className={cn('mt-1 text-2xl font-bold', totalCollectedCustomer - totalDisbursedSupplier >= 0 ? 'text-emerald-600' : 'text-rose-600')}>
              {formatCurrency(totalCollectedCustomer - totalDisbursedSupplier, symbol)}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{filteredCollections.length} transaction{filteredCollections.length === 1 ? '' : 's'}</p>
          </Card>
        </div>
      )}

      {/* Main Content Area */}
      {activeTab === 'pending' ? (
        <>
          <Card title="Customer Outstanding Invoices" className="mb-4">
            {filteredOrders.length === 0 ? <EmptyState title="No pending customer payments matching the filter" /> : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead><tr><th>Order #</th><th>Customer</th><th>Area</th><th>Date & Time</th><th>Total</th><th>Paid</th><th>Due</th><th className="text-right">Action</th></tr></thead>
                  <tbody>
                    {areaKeys.map((area) => (
                      <Fragment key={area}>
                        <tr className="bg-slate-50">
                          <td colSpan={8} className="py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            {area} — {ordersByArea[area].length} invoice{ordersByArea[area].length === 1 ? '' : 's'}
                          </td>
                        </tr>
                        {ordersByArea[area].map((o) => {
                          const due = Number(o.total) - Number(o.paid_amount || 0);
                          const payments = paymentsByOrder.get(o.id) || [];
                          return (
                            <tr key={o.id}>
                              <td className="font-medium">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span>{o.order_number}</span>
                                  {o.order_number?.startsWith('OB-') && (
                                    <Badge variant="blue">Opening Balance</Badge>
                                  )}
                                </div>
                              </td>
                              <td>{o.customers?.name || 'Walk-in'}</td>
                              <td className="text-slate-500">{(o.customers?.area || '').trim() || '—'}</td>
                              <td className="text-slate-600 text-xs font-medium">{formatDateTime(o.created_at)}</td>
                              <td>{formatCurrency(o.total, symbol)}</td>
                              <td>
                                <span className={cn('font-medium', Number(o.paid_amount || 0) > 0 ? 'text-emerald-600' : 'text-slate-500')}>
                                  {formatCurrency(o.paid_amount || 0, symbol)}
                                </span>
                              </td>
                              <td className="font-semibold text-rose-600">{formatCurrency(due, symbol)}</td>
                              <td className="text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    icon={<History size={14} />}
                                    onClick={() => setHistoryModal({ order: o, payments })}
                                    title="View timestamped payment history"
                                  >
                                    History ({payments.length})
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={() => setPayModal({
                                      type: 'customer',
                                      id: o.id,
                                      name: o.customers?.name || 'Walk-in',
                                      total: Number(o.total),
                                      paid_amount: Number(o.paid_amount || 0),
                                      amount: due,
                                      order_number: o.order_number,
                                    })}
                                  >
                                    Receive
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Supplier Outstanding Purchases">
            {filteredPOs.length === 0 ? <EmptyState title="No pending supplier payments matching the filter" /> : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead><tr><th>PO #</th><th>Supplier</th><th>Date & Time</th><th>Total</th><th>Paid</th><th>Due</th><th className="text-right">Action</th></tr></thead>
                  <tbody>
                    {filteredPOs.map((p) => {
                      const due = Number(p.total) - Number(p.paid_amount || 0);
                      const poPayments = paymentsByPO.get(p.id) || [];
                      return (
                        <tr key={p.id}>
                          <td className="font-medium">{p.po_number}</td>
                          <td>{p.suppliers?.name || '—'}</td>
                          <td className="text-slate-600 text-xs font-medium">{formatDateTime(p.created_at)}</td>
                          <td>{formatCurrency(p.total, symbol)}</td>
                          <td>{formatCurrency(p.paid_amount || 0, symbol)}</td>
                          <td className="font-semibold text-rose-600">{formatCurrency(due, symbol)}</td>
                          <td className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              {poPayments.length > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  icon={<History size={14} />}
                                  onClick={() => setSupplierHistoryModal({ po: p, payments: poPayments })}
                                >
                                  History ({poPayments.length})
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="success"
                                onClick={() => setPayModal({
                                  type: 'supplier',
                                  id: p.id,
                                  name: p.suppliers?.name || 'Supplier',
                                  total: Number(p.total),
                                  paid_amount: Number(p.paid_amount || 0),
                                  amount: due,
                                  order_number: p.po_number,
                                })}
                              >
                                Pay
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Supplier Credits & Advance Overpayments */}
          {supplierCredits.length > 0 && (
            <Card
              title={
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">Supplier Credits & Overpayments (Refunds Due to Store)</span>
                    <Badge variant="green">{supplierCredits.length} credit{supplierCredits.length === 1 ? '' : 's'}</Badge>
                  </div>
                  <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                    Total Refund Due: {formatCurrency(totalSupplierCredits, symbol)}
                  </span>
                </div>
              }
              className="mt-4 border-emerald-200 shadow-sm"
            >
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th>Contact Phone</th>
                      <th>Ledger Status</th>
                      <th>Credit Amount Owed</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierCredits.map((s) => (
                      <tr key={s.id} className="hover:bg-emerald-50/40 transition-colors">
                        <td className="font-bold text-slate-800">{s.name}</td>
                        <td className="text-slate-500 font-mono text-xs">{s.phone || '—'}</td>
                        <td>
                          <Badge variant="green">Supplier Holds Credit / Refund Due</Badge>
                        </td>
                        <td className="font-bold text-emerald-600 text-sm">
                          + {formatCurrency(s.creditAmount, symbol)}
                        </td>
                        <td className="text-right">
                          <Button
                            size="sm"
                            variant="success"
                            icon={<ArrowDownRight size={14} />}
                            onClick={() => setSupplierRefundModal({ supplier: s, creditAmount: s.creditAmount })}
                          >
                            Receive Refund
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Customer Store Credits */}
          {customerCredits.length > 0 && (
            <Card
              title={
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">Customer Store Credits (Refunds Due to Customer)</span>
                    <Badge variant="blue">{customerCredits.length} credit{customerCredits.length === 1 ? '' : 's'}</Badge>
                  </div>
                  <span className="text-xs font-bold text-sky-600 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-200">
                    Total Store Credit: {formatCurrency(totalCustomerCredits, symbol)}
                  </span>
                </div>
              }
              className="mt-4 border-sky-200 shadow-sm"
            >
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer Name</th>
                      <th>Area</th>
                      <th>Phone</th>
                      <th>Store Credit Balance</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerCredits.map((c) => (
                      <tr key={c.id} className="hover:bg-sky-50/40 transition-colors">
                        <td className="font-bold text-slate-800">{c.name}</td>
                        <td className="text-slate-500 text-xs">{c.area || '—'}</td>
                        <td className="text-slate-500 font-mono text-xs">{c.phone || '—'}</td>
                        <td className="font-bold text-sky-700 text-sm">
                          {formatCurrency(c.creditAmount, symbol)}
                        </td>
                        <td className="text-right">
                          <Button
                            size="sm"
                            variant="danger"
                            icon={<ArrowUpRight size={14} />}
                            onClick={() => setCustomerRefundModal({ customer: c, creditAmount: c.creditAmount })}
                          >
                            Refund Customer
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      ) : (
        /* Tab 2: Payment Collection & Disbursement History Feed */
        <Card title="Payment Collection & Disbursement History Feed">
          {filteredCollections.length === 0 ? (
            <EmptyState title="No payment records found matching the selected date or search" />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date & Time</th>
                    <th>Type</th>
                    <th>Party (Customer / Supplier)</th>
                    <th>Ref Doc #</th>
                    <th>Method</th>
                    <th>Note / Remarks</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCollections.map((c, idx) => (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition">
                      <td className="text-slate-400 font-medium text-xs">{idx + 1}</td>
                      <td className="font-semibold text-slate-800 whitespace-nowrap text-xs">
                        {formatDateTime(c.created_at)}
                      </td>
                      <td>
                        <Badge variant={c.type === 'customer' ? 'green' : 'red'}>
                          {c.type === 'customer' ? 'Customer In (+)' : 'Supplier Out (-)'}
                        </Badge>
                      </td>
                      <td className="font-medium text-slate-900">{c.partyName}</td>
                      <td className="font-mono text-xs text-slate-600 font-semibold">{c.docNumber}</td>
                      <td>
                        <span className="capitalize inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                          {c.method}
                        </span>
                      </td>
                      <td className="text-slate-500 text-xs">{c.note || '—'}</td>
                      <td className={cn('text-right font-bold text-sm', c.type === 'customer' ? 'text-emerald-600' : 'text-rose-600')}>
                        {c.type === 'customer' ? '+' : '-'} {formatCurrency(c.amount, symbol)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-xs">
                  <tr>
                    <td colSpan={7} className="py-2.5 px-3 text-right text-slate-700">
                      Total Collections (Customer):
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-600">
                      + {formatCurrency(totalCollectedCustomer, symbol)}
                    </td>
                  </tr>
                  {totalDisbursedSupplier > 0 && (
                    <tr>
                      <td colSpan={7} className="py-1.5 px-3 text-right text-slate-700">
                        Total Disbursements (Supplier):
                      </td>
                      <td className="py-1.5 px-3 text-right text-rose-600">
                        - {formatCurrency(totalDisbursedSupplier, symbol)}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      )}

      <PayModal
        modal={payModal}
        onClose={() => setPayModal(null)}
        onPay={pay}
        symbol={symbol}
      />

      <PaymentHistoryModal
        data={historyModal}
        onClose={() => setHistoryModal(null)}
        onReceive={(order) => {
          const due = Math.max(0, Number(order.total) - Number(order.paid_amount || 0));
          setPayModal({
            type: 'customer',
            id: order.id,
            name: order.customers?.name || 'Walk-in',
            total: Number(order.total),
            paid_amount: Number(order.paid_amount || 0),
            amount: due,
            order_number: order.order_number,
          });
        }}
        onPrintProof={(order, payments) => {
          setProofOrder({ order, payments });
        }}
        symbol={symbol}
      />

      <SupplierPaymentHistoryModal
        data={supplierHistoryModal}
        onClose={() => setSupplierHistoryModal(null)}
        onPay={(po) => {
          const due = Math.max(0, Number(po.total) - Number(po.paid_amount || 0));
          setPayModal({
            type: 'supplier',
            id: po.id,
            name: po.suppliers?.name || 'Supplier',
            total: Number(po.total),
            paid_amount: Number(po.paid_amount || 0),
            amount: due,
            order_number: po.po_number,
          });
        }}
        onPrintProof={(po, payments) => {
          setSupplierProof({ po, payments });
        }}
        symbol={symbol}
      />

      {proofOrder && (
        <PrintPreview
          open={!!proofOrder}
          onClose={() => setProofOrder(null)}
          title={`Payment Slip Proof — ${proofOrder.order.order_number}`}
          size="lg"
          fileName={`payment_slip_${String(proofOrder.order.order_number).replace(/[<>:"/\\|?*]+/g, '-')}.pdf`}
        >
          <PrintDocument
            storeName={settings?.store_name || 'Payment Receipt'}
            subtitle="Payment History & Statement of Account Proof"
            logoSrc={logoSrc}
            fields={[
              { label: 'Customer', value: proofOrder.order.customers?.name || 'Walk-in' },
              { label: 'Area', value: proofOrder.order.customers?.area || '—' },
              { label: 'Phone', value: proofOrder.order.customers?.phone || '—' },
              { label: 'Invoice #', value: proofOrder.order.invoice_number || proofOrder.order.order_number },
              { label: 'Invoice Date', value: formatDate(proofOrder.order.created_at) },
              { label: 'Printed At', value: formatDateTime(new Date().toISOString()) },
            ]}
          >
            <div className="mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Timestamped Payment History & Proof
              </h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <PrintTh className="w-8">#</PrintTh>
                    <PrintTh>Payment Date & Time</PrintTh>
                    <PrintTh>Method</PrintTh>
                    <PrintTh>Note / Remarks</PrintTh>
                    <PrintTh align="right">Amount Paid</PrintTh>
                  </tr>
                </thead>
                <tbody>
                  {proofOrder.payments.map((p, idx) => (
                    <tr key={p.id}>
                      <PrintTd>{idx + 1}</PrintTd>
                      <PrintTd className="font-medium">{formatDateTime(p.created_at)}</PrintTd>
                      <PrintTd className="capitalize">{p.method}</PrintTd>
                      <PrintTd>{p.note || 'Payment installment'}</PrintTd>
                      <PrintTd align="right" className="font-semibold text-emerald-700">
                        {formatCurrency(p.amount, symbol)}
                      </PrintTd>
                    </tr>
                  ))}
                  {proofOrder.payments.length === 0 && (
                    <tr>
                      <PrintTd colSpan={5} className="py-4 text-center text-slate-400">
                        No payments recorded yet for this invoice.
                      </PrintTd>
                    </tr>
                  )}
                  <tr className="border-t border-slate-300 font-semibold bg-slate-50">
                    <PrintTd colSpan={4} className="text-right">Total Invoice Amount:</PrintTd>
                    <PrintTd align="right">{formatCurrency(proofOrder.order.total, symbol)}</PrintTd>
                  </tr>
                  <tr className="font-semibold bg-slate-50">
                    <PrintTd colSpan={4} className="text-right text-emerald-700">Total Paid (Received):</PrintTd>
                    <PrintTd align="right" className="text-emerald-700 font-bold">{formatCurrency(proofOrder.order.paid_amount || 0, symbol)}</PrintTd>
                  </tr>
                  <tr className="font-bold bg-slate-100 text-sm">
                    <PrintTd colSpan={4} className="text-right text-rose-700">Balance Remaining Due:</PrintTd>
                    <PrintTd align="right" className="text-rose-700 font-bold">
                      {formatCurrency(Math.max(0, Number(proofOrder.order.total) - Number(proofOrder.order.paid_amount || 0)), symbol)}
                    </PrintTd>
                  </tr>
                </tbody>
              </table>

              <div className="mt-8 grid grid-cols-2 gap-8 text-center text-xs">
                <div className="border-t border-slate-300 pt-1.5">
                  <p className="font-semibold text-slate-700">Customer Signature</p>
                </div>
                <div className="border-t border-slate-300 pt-1.5">
                  <p className="font-semibold text-slate-700">Authorized Cashier Signature</p>
                </div>
              </div>
            </div>
          </PrintDocument>
        </PrintPreview>
      )}

      {supplierProof && (
        <PrintPreview
          open={!!supplierProof}
          onClose={() => setSupplierProof(null)}
          title={`Supplier Payment Voucher Slip — ${supplierProof.po.po_number || 'PO'}`}
          size="lg"
          fileName={`supplier_voucher_${String(supplierProof.po.po_number || 'PO').replace(/[<>:"/\\|?*]+/g, '-')}.pdf`}
        >
          <PrintDocument
            storeName={settings?.store_name || 'Payment Voucher'}
            subtitle="Supplier Payment History & Voucher Slip Proof"
            logoSrc={logoSrc}
            fields={[
              { label: 'Supplier', value: supplierProof.po.suppliers?.name || '—' },
              { label: 'PO #', value: supplierProof.po.po_number || '—' },
              { label: 'PO Date', value: formatDate(supplierProof.po.created_at) },
              { label: 'Printed At', value: formatDateTime(new Date().toISOString()) },
            ]}
          >
            <div className="mb-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Timestamped Payment History & Outflow Proof
              </h3>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <PrintTh className="w-8">#</PrintTh>
                    <PrintTh>Payment Date & Time</PrintTh>
                    <PrintTh>Account / Method</PrintTh>
                    <PrintTh>Note / Reference</PrintTh>
                    <PrintTh align="right">Amount Paid</PrintTh>
                  </tr>
                </thead>
                <tbody>
                  {supplierProof.payments.map((p, idx) => (
                    <tr key={p.id}>
                      <PrintTd>{idx + 1}</PrintTd>
                      <PrintTd className="font-medium">{formatDateTime(p.created_at)}</PrintTd>
                      <PrintTd className="capitalize">{p.method}</PrintTd>
                      <PrintTd>{p.note || 'Payment installment'}</PrintTd>
                      <PrintTd align="right" className="font-semibold text-emerald-700">
                        {formatCurrency(p.amount, symbol)}
                      </PrintTd>
                    </tr>
                  ))}
                  {supplierProof.payments.length === 0 && (
                    <tr>
                      <PrintTd colSpan={5} className="py-4 text-center text-slate-400">
                        No payments recorded yet for this purchase order.
                      </PrintTd>
                    </tr>
                  )}
                  <tr className="border-t border-slate-300 font-semibold bg-slate-50">
                    <PrintTd colSpan={4} className="text-right">Total Purchase Amount:</PrintTd>
                    <PrintTd align="right">{formatCurrency(supplierProof.po.total, symbol)}</PrintTd>
                  </tr>
                  <tr className="font-semibold bg-slate-50">
                    <PrintTd colSpan={4} className="text-right text-emerald-700">Total Paid:</PrintTd>
                    <PrintTd align="right" className="text-emerald-700 font-bold">{formatCurrency(supplierProof.po.paid_amount || 0, symbol)}</PrintTd>
                  </tr>
                  <tr className="font-bold bg-slate-100 text-sm">
                    <PrintTd colSpan={4} className="text-right text-rose-700">Balance Remaining Due:</PrintTd>
                    <PrintTd align="right" className="text-rose-700 font-bold">
                      {formatCurrency(Math.max(0, Number(supplierProof.po.total) - Number(supplierProof.po.paid_amount || 0)), symbol)}
                    </PrintTd>
                  </tr>
                </tbody>
              </table>

              <div className="mt-8 grid grid-cols-2 gap-8 text-center text-xs">
                <div className="border-t border-slate-300 pt-1.5">
                  <p className="font-semibold text-slate-700">Supplier / Receiver Signature</p>
                </div>
                <div className="border-t border-slate-300 pt-1.5">
                  <p className="font-semibold text-slate-700">Authorized Officer Signature</p>
                </div>
              </div>
            </div>
          </PrintDocument>
        </PrintPreview>
      )}

      <PrintPreview
        open={printPreview}
        onClose={() => setPrintPreview(false)}
        title="Print Preview — Collection sheet"
        size="xl"
        fileName={`pending_${sanitizePdfName(areaFilter && areaFilter !== '__none__' ? areaFilter : 'all_areas')}.pdf`}
      >
        <PrintDocument
          storeName={settings?.store_name || 'Pending Payments'}
          subtitle={
            areaFilter === '__none__'
              ? 'Collection Sheet — No area set'
              : areaFilter
                ? `Collection Sheet — ${areaFilter}`
                : 'Collection Sheet — All areas'
          }
          logoSrc={logoSrc}
          fields={[
            { label: 'Business', value: settings?.store_name || '—' },
            { label: 'Address', value: settings?.address || '—', span: 2 },
            { label: 'Phone', value: settings?.phone || '—' },
            { label: 'Business NTN', value: settings?.ntn?.trim() || '—' },
            { label: 'Date', value: formatDate(new Date().toISOString()) },
          ]}
        >
          {areaKeys.map((area) => {
            const rows = ordersByArea[area];
            const areaDue = rows.reduce((s, o) => s + (Number(o.total) - Number(o.paid_amount || 0)), 0);
            return (
              <div key={area} className="mb-5">
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-800">
                  {area} — {rows.length} invoice{rows.length === 1 ? '' : 's'} — Due {formatCurrency(areaDue, symbol)}
                </p>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr>
                      <PrintTh className="w-8">Sr</PrintTh>
                      <PrintTh>Customer</PrintTh>
                      <PrintTh>Phone</PrintTh>
                      <PrintTh>Invoice #</PrintTh>
                      <PrintTh>Date</PrintTh>
                      <PrintTh align="right">Total</PrintTh>
                      <PrintTh align="right">Paid</PrintTh>
                      <PrintTh align="right">Due</PrintTh>
                      <PrintTh>Received</PrintTh>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((o, idx) => {
                      const due = Number(o.total) - Number(o.paid_amount || 0);
                      return (
                        <tr key={o.id}>
                          <PrintTd>{idx + 1}</PrintTd>
                          <PrintTd className="font-medium">{o.customers?.name || 'Walk-in'}</PrintTd>
                          <PrintTd>{o.customers?.phone || '—'}</PrintTd>
                          <PrintTd>{o.order_number}</PrintTd>
                          <PrintTd>{formatDate(o.created_at)}</PrintTd>
                          <PrintTd align="right">{formatCurrency(o.total, symbol)}</PrintTd>
                          <PrintTd align="right">{formatCurrency(o.paid_amount || 0, symbol)}</PrintTd>
                          <PrintTd align="right" className="font-semibold">{formatCurrency(due, symbol)}</PrintTd>
                          <PrintTd className="h-8 w-24" />
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-50">
                      <PrintTd className="font-semibold" />
                      <PrintTd className="font-semibold" />
                      <PrintTd className="font-semibold" />
                      <PrintTd className="font-semibold" />
                      <PrintTd className="font-semibold">Area total</PrintTd>
                      <PrintTd align="right" className="font-semibold" />
                      <PrintTd align="right" className="font-semibold" />
                      <PrintTd align="right" className="font-semibold">{formatCurrency(areaDue, symbol)}</PrintTd>
                      <PrintTd />
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })}
          <div className="mt-2 flex justify-end text-sm font-bold text-slate-900">
            <span>Grand total due: {formatCurrency(totalCustomer, symbol)}</span>
          </div>
        </PrintDocument>
      </PrintPreview>

      <ReceiveSupplierRefundModal
        modal={supplierRefundModal}
        accounts={paymentAccounts}
        onClose={() => setSupplierRefundModal(null)}
        onSubmit={handleReceiveSupplierRefund}
        symbol={symbol}
      />

      <RefundCustomerModal
        modal={customerRefundModal}
        accounts={paymentAccounts}
        onClose={() => setCustomerRefundModal(null)}
        onSubmit={handleRefundCustomer}
        symbol={symbol}
      />
    </div>
  );
}

function PayModal({
  modal,
  onClose,
  onPay,
  symbol,
}: {
  modal: any;
  onClose: () => void;
  onPay: (m: string, a: number, note: string) => void;
  symbol: string;
}) {
  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState<number | string>('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (modal) {
      setAmount(modal.amount ?? '');
      setMethod('cash');
      setNote('');
    }
  }, [modal]);

  if (!modal) return null;

  const total = modal.total ?? modal.amount;
  const alreadyPaid = modal.paid_amount ?? 0;
  const due = modal.amount;
  const numAmount = Number(amount) || 0;
  const remainingAfter = Math.max(0, due - numAmount);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (numAmount <= 0) return;
    onPay(method, numAmount, note);
  };

  return (
    <Modal
      open={!!modal}
      onClose={onClose}
      title={`${modal.type === 'customer' ? 'Receive Payment' : 'Pay Supplier'} — ${modal.name}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
          <Button
            variant={modal.type === 'customer' ? 'primary' : 'success'}
            type="button"
            onClick={() => handleSubmit()}
            disabled={numAmount <= 0}
          >
            Confirm {formatCurrency(numAmount, symbol)}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3.5">
        {modal.order_number && (
          <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs">
            <div className="flex justify-between text-slate-500 mb-1">
              <span>Invoice / Order:</span>
              <span className="font-semibold text-slate-800">{modal.order_number}</span>
            </div>
            <div className="flex justify-between text-slate-500 mb-1">
              <span>Total Bill:</span>
              <span className="font-medium text-slate-700">{formatCurrency(total, symbol)}</span>
            </div>
            <div className="flex justify-between text-slate-500 mb-1">
              <span>Already Paid:</span>
              <span className="font-medium text-emerald-600">{formatCurrency(alreadyPaid, symbol)}</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold">
              <span className="text-slate-700">Currently Due:</span>
              <span className="text-rose-600 font-bold">{formatCurrency(due, symbol)}</span>
            </div>
          </div>
        )}

        <Field label="Amount to Receive" hint={`Max due: ${formatCurrency(due, symbol)}`}>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            min={1}
            max={due}
            placeholder="Enter payment amount"
          />
        </Field>

        {numAmount > 0 && (
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-slate-500">Remaining due after this payment:</span>
            <span className={cn('font-bold', remainingAfter > 0 ? 'text-amber-600' : 'text-emerald-600')}>
              {remainingAfter > 0 ? formatCurrency(remainingAfter, symbol) : 'Fully Paid (Clear)'}
            </span>
          </div>
        )}

        <Field label="Payment Method">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="jazzcash">JazzCash</option>
            <option value="easypaisa">EasyPaisa</option>
          </Select>
        </Field>

        <Field label="Note / Remarks (Optional)">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Partial cash payment at shop"
          />
        </Field>

        <div className="flex items-center gap-1.5 text-[11px] text-slate-600 bg-sky-50 px-3 py-2 rounded-lg border border-sky-100">
          <Clock size={14} className="shrink-0 text-sky-600" />
          <span>Payment will be timestamped with current date and time in history.</span>
        </div>
      </form>
    </Modal>
  );
}

function PaymentHistoryModal({
  data,
  onClose,
  onReceive,
  onPrintProof,
  symbol,
}: {
  data: { order: any; payments: OrderPayment[] } | null;
  onClose: () => void;
  onReceive: (order: any) => void;
  onPrintProof: (order: any, payments: OrderPayment[]) => void;
  symbol: string;
}) {
  const [modalDateFilter, setModalDateFilter] = useState<DateFilterValue>(DEFAULT_DATE_FILTER);
  useEffect(() => {
    if (data) setModalDateFilter(DEFAULT_DATE_FILTER);
  }, [data]);

  if (!data) return null;
  const { order, payments } = data;

  const total = Number(order.total || 0);
  const paid = Number(order.paid_amount || 0);
  const due = Math.max(0, total - paid);
  const isPaid = due === 0;

  const filteredPayments = payments.filter((p) => isWithinDateRange(p.created_at, modalDateFilter));

  return (
    <Modal
      open={!!data}
      onClose={onClose}
      title={`Payment History — ${order.order_number}`}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between">
          <Button
            variant="outline"
            icon={<Printer size={15} />}
            onClick={() => onPrintProof(order, payments)}
          >
            Print Payment Slip
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            {!isPaid && (
              <Button
                variant="primary"
                onClick={() => {
                  onClose();
                  onReceive(order);
                }}
              >
                Receive Payment
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Customer & Invoice summary card */}
        <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5 mb-2.5">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Customer</p>
              <p className="text-base font-bold text-slate-800">{order.customers?.name || 'Walk-in'}</p>
              {order.customers?.phone && (
                <p className="text-xs text-slate-500">Phone: {order.customers.phone}</p>
              )}
              {order.customers?.area && (
                <p className="text-xs text-slate-500">Area: {order.customers.area}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Invoice Date</p>
              <p className="text-sm font-medium text-slate-700">{formatDate(order.created_at)}</p>
              <Badge variant={isPaid ? 'green' : paid > 0 ? 'amber' : 'red'} className="mt-1">
                {isPaid ? 'Fully Paid' : paid > 0 ? 'Partially Paid' : 'Unpaid'}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-white p-2 rounded-lg border border-slate-200">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Total Invoice</p>
              <p className="text-sm font-bold text-slate-800">{formatCurrency(total, symbol)}</p>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Total Paid</p>
              <p className="text-sm font-bold text-emerald-600">{formatCurrency(paid, symbol)}</p>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Remaining Due</p>
              <p className="text-sm font-bold text-rose-600">{formatCurrency(due, symbol)}</p>
            </div>
          </div>
        </div>

        {/* Payments table with Date & Time */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Clock size={14} className="text-slate-400" />
              Timestamped Payment History ({filteredPayments.length}{filteredPayments.length !== payments.length ? ` of ${payments.length}` : ''})
            </h4>
            {payments.length > 1 && (
              <DateTimeFilter
                compact
                value={modalDateFilter}
                onChange={setModalDateFilter}
              />
            )}
          </div>

          {filteredPayments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center">
              <Clock size={28} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-600">No payment installments found matching filter</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {modalDateFilter.preset !== 'all' ? 'Try changing or clearing the date filter' : `The full amount of ${formatCurrency(due, symbol)} is outstanding.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Date & Time</th>
                    <th className="py-2.5 px-3">Method</th>
                    <th className="py-2.5 px-3">Note / Reference</th>
                    <th className="py-2.5 px-3 text-right">Amount Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-2.5 px-3 font-medium text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">
                        {formatDateTime(p.created_at)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="capitalize inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                          {p.method}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {p.note || 'Payment installment'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                        + {formatCurrency(p.amount, symbol)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50/80 border-t border-slate-200 font-semibold text-slate-700">
                  <tr>
                    <td colSpan={4} className="py-2 px-3 text-right">Total Received:</td>
                    <td className="py-2 px-3 text-right text-emerald-600 font-bold">
                      {formatCurrency(paid, symbol)}
                    </td>
                  </tr>
                  {due > 0 && (
                    <tr>
                      <td colSpan={4} className="py-1.5 px-3 text-right text-slate-500 font-medium">Balance Remaining Due:</td>
                      <td className="py-1.5 px-3 text-right text-rose-600 font-bold">
                        {formatCurrency(due, symbol)}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function SupplierPaymentHistoryModal({
  data,
  onClose,
  onPay,
  onPrintProof,
  symbol,
}: {
  data: { po: any; payments: SupplierPayment[] } | null;
  onClose: () => void;
  onPay: (po: any) => void;
  onPrintProof: (po: any, payments: SupplierPayment[]) => void;
  symbol: string;
}) {
  const [modalDateFilter, setModalDateFilter] = useState<DateFilterValue>(DEFAULT_DATE_FILTER);
  useEffect(() => {
    if (data) setModalDateFilter(DEFAULT_DATE_FILTER);
  }, [data]);

  if (!data) return null;
  const { po, payments } = data;
  const total = Number(po.total || 0);
  const paid = Number(po.paid_amount || 0);
  const due = Math.max(0, total - paid);
  const isPaid = due <= 0;

  const filteredPayments = payments.filter((p) => isWithinDateRange(p.created_at, modalDateFilter));

  return (
    <Modal
      open={!!data}
      onClose={onClose}
      title={`Supplier Payment History — ${po.po_number || 'PO'}`}
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button
            variant="outline"
            icon={<Printer size={16} />}
            onClick={() => onPrintProof(po, payments)}
          >
            Print Voucher Slip
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
            {!isPaid && (
              <Button
                variant="primary"
                onClick={() => {
                  onClose();
                  onPay(po);
                }}
              >
                Pay Supplier
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Supplier & PO summary card */}
        <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5 mb-2.5">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Supplier</p>
              <p className="text-base font-bold text-slate-800">{po.suppliers?.name || '—'}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">PO Date</p>
              <p className="text-sm font-medium text-slate-700">{formatDate(po.created_at)}</p>
              <Badge variant={isPaid ? 'green' : paid > 0 ? 'amber' : 'red'} className="mt-1">
                {isPaid ? 'Fully Paid' : paid > 0 ? 'Partially Paid' : 'Unpaid'}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-white p-2 rounded-lg border border-slate-200">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Total Purchase</p>
              <p className="text-sm font-bold text-slate-800">{formatCurrency(total, symbol)}</p>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Total Paid</p>
              <p className="text-sm font-bold text-emerald-600">{formatCurrency(paid, symbol)}</p>
            </div>
            <div className="bg-white p-2 rounded-lg border border-slate-200">
              <p className="text-[11px] font-semibold uppercase text-slate-400">Remaining Due</p>
              <p className="text-sm font-bold text-rose-600">{formatCurrency(due, symbol)}</p>
            </div>
          </div>
        </div>

        {/* Payments table with Date & Time */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Clock size={14} className="text-slate-400" />
              Timestamped Payment History ({filteredPayments.length}{filteredPayments.length !== payments.length ? ` of ${payments.length}` : ''})
            </h4>
            {payments.length > 1 && (
              <DateTimeFilter
                compact
                value={modalDateFilter}
                onChange={setModalDateFilter}
              />
            )}
          </div>

          {filteredPayments.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 py-8 text-center">
              <Clock size={28} className="mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-medium text-slate-600">No payment installments found matching filter</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {modalDateFilter.preset !== 'all' ? 'Try changing or clearing the date filter' : `The full amount of ${formatCurrency(due, symbol)} is outstanding.`}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Date & Time</th>
                    <th className="py-2.5 px-3">Account / Method</th>
                    <th className="py-2.5 px-3">Note / Reference</th>
                    <th className="py-2.5 px-3 text-right">Amount Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayments.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-2.5 px-3 font-medium text-slate-400">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-medium text-slate-800">
                        {formatDateTime(p.created_at)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="capitalize inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                          {p.method}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">
                        {p.note || 'Payment installment'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-600">
                        - {formatCurrency(p.amount, symbol)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50/80 border-t border-slate-200 font-semibold text-slate-700">
                  <tr>
                    <td colSpan={4} className="py-2 px-3 text-right">Total Paid:</td>
                    <td className="py-2 px-3 text-right text-emerald-600 font-bold">
                      {formatCurrency(paid, symbol)}
                    </td>
                  </tr>
                  {due > 0 && (
                    <tr>
                      <td colSpan={4} className="py-1.5 px-3 text-right text-slate-500 font-medium">Balance Remaining Due:</td>
                      <td className="py-1.5 px-3 text-right text-rose-600 font-bold">
                        {formatCurrency(due, symbol)}
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ReceiveSupplierRefundModal({
  modal,
  accounts,
  onClose,
  onSubmit,
  symbol,
}: {
  modal: { supplier: any; creditAmount: number } | null;
  accounts: any[];
  onClose: () => void;
  onSubmit: (supplierId: string, amount: number, accountType: string, note: string) => void;
  symbol: string;
}) {
  const [amount, setAmount] = useState(0);
  const [account, setAccount] = useState('cash');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (modal) {
      setAmount(modal.creditAmount);
      setAccount('cash');
      setNote(`Refund collected from ${modal.supplier.name}`);
    }
  }, [modal]);

  if (!modal) return null;

  return (
    <Modal
      open={!!modal}
      onClose={onClose}
      title={`Collect Refund from ${modal.supplier.name}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="success"
            onClick={() => {
              if (amount > 0) {
                onSubmit(modal.supplier.id, amount, account, note);
              }
            }}
            disabled={amount <= 0 || amount > modal.creditAmount}
            icon={<ArrowDownRight size={15} />}
          >
            Deposit Refund ({formatCurrency(amount, symbol)})
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-xs">
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-900">
          <p className="font-semibold">Supplier Credit Balance (Refund Due to Store)</p>
          <p className="text-lg font-bold text-emerald-700">+{formatCurrency(modal.creditAmount, symbol)}</p>
          <p className="text-[11px] text-emerald-600 mt-0.5">
            This balance exists because purchase returns exceeded your outstanding liability with this supplier.
          </p>
        </div>

        <Field label="Refund Amount Collected" required>
          <Input
            type="number"
            min={1}
            max={modal.creditAmount}
            value={amount || ''}
            onChange={(e) => setAmount(Number(e.target.value))}
            autoFocus
          />
        </Field>

        <Field label="Deposit Into Account" required>
          <Select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="cash">Cash Drawer (Cash in Hand)</option>
            {accounts.filter((a) => a.type !== 'cash').map((acc) => (
              <option key={acc.id} value={acc.type}>
                {acc.name || acc.type} ({formatCurrency(acc.balance, symbol)})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Note / Remarks">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Received cash from supplier representative"
          />
        </Field>
      </div>
    </Modal>
  );
}

function RefundCustomerModal({
  modal,
  accounts,
  onClose,
  onSubmit,
  symbol,
}: {
  modal: { customer: any; creditAmount: number } | null;
  accounts: any[];
  onClose: () => void;
  onSubmit: (customerId: string, amount: number, accountType: string, note: string) => void;
  symbol: string;
}) {
  const [amount, setAmount] = useState(0);
  const [account, setAccount] = useState('cash');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (modal) {
      setAmount(modal.creditAmount);
      setAccount('cash');
      setNote(`Store credit refund paid to ${modal.customer.name}`);
    }
  }, [modal]);

  if (!modal) return null;

  return (
    <Modal
      open={!!modal}
      onClose={onClose}
      title={`Refund Store Credit to ${modal.customer.name}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (amount > 0) {
                onSubmit(modal.customer.id, amount, account, note);
              }
            }}
            disabled={amount <= 0 || amount > modal.creditAmount}
            icon={<ArrowUpRight size={15} />}
          >
            Pay Refund ({formatCurrency(amount, symbol)})
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-xs">
        <div className="rounded-lg bg-sky-50 border border-sky-200 p-3 text-sky-900">
          <p className="font-semibold">Customer Store Credit Available</p>
          <p className="text-lg font-bold text-sky-700">{formatCurrency(modal.creditAmount, symbol)}</p>
          <p className="text-[11px] text-sky-600 mt-0.5">
            Credit balance from a previous sales return. You can disburse cash or bank payment to settle it.
          </p>
        </div>

        <Field label="Amount to Refund" required>
          <Input
            type="number"
            min={1}
            max={modal.creditAmount}
            value={amount || ''}
            onChange={(e) => setAmount(Number(e.target.value))}
            autoFocus
          />
        </Field>

        <Field label="Disburse From Account" required>
          <Select value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="cash">Cash Drawer (Cash in Hand)</option>
            {accounts.filter((a) => a.type !== 'cash').map((acc) => (
              <option key={acc.id} value={acc.type}>
                {acc.name || acc.type} ({formatCurrency(acc.balance, symbol)})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Note / Remarks">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Paid customer cash refund for return"
          />
        </Field>
      </div>
    </Modal>
  );
}

