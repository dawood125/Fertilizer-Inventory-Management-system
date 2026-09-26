import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { api, resolveImageUrl } from '@/lib/api';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/Button';
import { Field, Input, Select, Textarea, SearchableSelect } from '@/components/Form';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { logAuditAction } from '@/lib/audit';
import { formatCurrency, formatDate, formatDateTime, cn, generateDocNumber } from '@/lib/utils';
import { returnStockBatch } from '@/lib/fifo';
import {
  Plus,
  RotateCcw,
  Eye,
  Search,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  ArrowDownLeft,
  Printer,
  CheckSquare,
  Square,
  Package,
  Layers,
  HelpCircle,
  Minus,
  Wallet,
  CreditCard,
  Receipt,
  Calendar,
  User,
  Clock,
  Info,
  RefreshCw,
} from 'lucide-react';
import { DateTimeFilter, type DateFilterValue, isWithinDateRange } from '@/components/DateTimeFilter';

const reasonVariant: Record<string, 'red' | 'amber' | 'gray'> = {
  damaged: 'red',
  expired: 'red',
  wrong_product: 'amber',
  unsold_goods: 'gray',
};

interface ReturnItemPayload {
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  unit: string;
  reason: string;
  total_amount: number;
}

export function SalesReturns() {
  const { symbol } = useSettings();
  const { user } = useAuth();
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [initialOrderId, setInitialOrderId] = useState<string>('');
  const [viewing, setViewing] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({ preset: 'all' });
  const [isCreatingReturn, setIsCreatingReturn] = useState(false);
  const isCreatingReturnRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, o, oi, p, c, acc, b] = await Promise.all([
        api.get<any[]>('/api/data/sales_returns?limit=1000'),
        api.get<any[]>('/api/data/orders?limit=1000'),
        api.get<any[]>('/api/data/order_items?limit=5000'),
        api.get<any[]>('/api/data/products?limit=10000'),
        api.get<any[]>('/api/data/customers?limit=1000'),
        api.get<any[]>('/api/data/payment_accounts'),
        api.get<any[]>('/api/data/brands'),
      ]);

      const customerMap = new Map((c || []).map((cust) => [cust.id, cust]));
      const orderMap = new Map((o || []).map((ord) => [ord.id, ord]));

      setCustomers(c || []);
      setProducts(p || []);
      setOrderItems(oi || []);
      setAccounts(acc || []);
      setBrands(b || []);

      const orderList = (o || [])
        .map((ord) => ({
          ...ord,
          customers: ord.customer_id ? { name: customerMap.get(ord.customer_id)?.name } : null,
        }))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

      setOrders(orderList);

      setItems(
        (r || [])
          .map((ret) => ({
            ...ret,
            customers: ret.customer_id ? { name: customerMap.get(ret.customer_id)?.name } : null,
            orders: ret.order_id ? { order_number: orderMap.get(ret.order_id)?.order_number } : null,
          }))
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      );
    } catch {
      setItems([]);
      setOrders([]);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Handle URL param: #/sales-returns?order_id=...
  useEffect(() => {
    const hash = window.location.hash || '';
    if (hash.includes('order_id=')) {
      const urlParams = new URLSearchParams(hash.split('?')[1]);
      const oid = urlParams.get('order_id');
      if (oid) {
        setInitialOrderId(oid);
        setShowForm(true);
      }
    }
  }, [orders]);

  const createBatch = async (data: {
    order_id: string;
    customer_id: string | null;
    items: ReturnItemPayload[];
    resolution: string;
    account_type: string;
    status: string;
    note: string;
  }) => {
    if (isCreatingReturnRef.current) return;
    isCreatingReturnRef.current = true;
    setIsCreatingReturn(true);

    try {
      const order = orders.find((o) => o.id === data.order_id);
      const custName = data.customer_id ? customers.find((c) => c.id === data.customer_id)?.name : 'Walk-in Customer';
      const grandTotal = data.items.reduce((s, it) => s + Number(it.total_amount || 0), 0);
      const totalCartons = data.items.reduce((s, it) => s + Number(it.quantity || 0), 0);

      // 1. Process each returned product item
      for (const it of data.items) {
        const retNum = generateDocNumber('SR');
        const returnRecord = await api.post<any>('/api/data/sales_returns', {
          return_number: retNum,
          order_id: data.order_id || null,
          customer_id: data.customer_id || null,
          product_id: it.product_id || null,
          product_name: it.product_name,
          quantity: it.quantity,
          unit_price: it.unit_price,
          total_amount: it.total_amount,
          reason: it.reason,
          resolution: data.resolution,
          status: data.status || 'approved',
          note: data.note,
        });

        // Restock warehouse product inventory
        if (it.product_id) {
          const prod = await api.get<any>(`/api/data/products/${it.product_id}`);
          if (prod) {
            await api.put(`/api/data/products/${it.product_id}`, {
              stock_quantity: Number(prod.stock_quantity || 0) + Number(it.quantity),
            });
            await returnStockBatch(it.product_id, Number(it.quantity), prod.purchase_price);
            await api.post('/api/data/stock_movements', {
              product_id: it.product_id,
              type: 'in',
              quantity: Number(it.quantity),
              reference_type: 'sales_return',
              reference_id: returnRecord.id,
              note: `Sales return ${retNum} (${it.quantity} ${it.unit || 'ctn'}) on Order #${order?.order_number || ''}`,
            });
          }
        }
      }

      // 2. Financial Settlement & Update Pending Order Debt
      if (grandTotal > 0 && (data.status || 'approved') === 'approved') {
        const oldTotal = Number(order?.total || 0);
        const oldPaid = Number(order?.paid_amount || 0);
        const unpaidDebt = Math.max(0, oldTotal - oldPaid);
        const debtWiped = Math.min(grandTotal, unpaidDebt);
        const excessCredit = Math.max(0, grandTotal - unpaidDebt);

        const netKeptTotal = Math.max(0, oldTotal - grandTotal);
        const netAllocatedPaid = Math.min(oldPaid, netKeptTotal);
        const newPaymentStatus = (netKeptTotal <= netAllocatedPaid) ? 'paid' : (netAllocatedPaid > 0 ? 'partial' : 'unpaid');

        // Update order cleanly: total and paid_amount never produce negative due!
        if (order) {
          await api.put(`/api/data/orders/${order.id}`, {
            total: netKeptTotal,
            paid_amount: netAllocatedPaid,
            payment_status: newPaymentStatus,
          });
        }

        if (data.resolution === 'refund') {
          // Cash Refund: Physical cash handed to customer from Cash Drawer
          // NOTE: A customer cannot be refunded more cash than they actually paid on this order (oldPaid)!
          // Any remaining return value above oldPaid simply wipes out their unpaid credit bill.
          const maxCashRefund = Math.min(grandTotal, oldPaid);
          const targetAccType = data.account_type || 'cash';
          const acc = accounts.find((a) => a.type === targetAccType) || accounts.find((a) => a.type === 'cash') || accounts[0];

          if (acc && maxCashRefund > 0) {
            const currentBal = Number(acc.balance || 0);
            await api.put(`/api/data/payment_accounts/${acc.id}`, {
              balance: currentBal - maxCashRefund,
            });
            await api.post('/api/data/transactions', {
              type: 'cash_out',
              account_type: acc.type || 'cash',
              amount: maxCashRefund,
              reference_type: 'sales_return',
              reference_id: data.order_id,
              party_type: 'customer',
              party_id: data.customer_id || null,
              note: `Sales Return Cash Refund (Order #${order?.order_number || ''}, ${data.items.length} item(s)) — Cash: ${formatCurrency(maxCashRefund, symbol)}${debtWiped > 0 ? `, Unpaid debt cancelled: ${formatCurrency(debtWiped, symbol)}` : ''}`,
              date: new Date().toISOString().slice(0, 10),
            });
          }

          // If there was unpaid debt on customer balance, reduce customer debt by debtWiped
          if (data.customer_id && debtWiped > 0) {
            const cust = await api.get<any>(`/api/data/customers/${data.customer_id}`);
            if (cust) {
              await api.put(`/api/data/customers/${data.customer_id}`, {
                balance: Number(cust.balance || 0) - debtWiped,
              });
            }
          }
        } else if (data.resolution === 'credit_note') {
          // Credit Note: Deduct entire return value from customer's receivable ledger
          // If customer has less debt than grandTotal, their balance becomes negative (meaning customer has Store Credit!)
          if (data.customer_id) {
            const cust = await api.get<any>(`/api/data/customers/${data.customer_id}`);
            if (cust) {
              await api.put(`/api/data/customers/${data.customer_id}`, {
                balance: Number(cust.balance || 0) - grandTotal,
              });
            }
            await api.post('/api/data/transactions', {
              type: 'credit_note',
              account_type: 'receivable',
              amount: grandTotal,
              reference_type: 'sales_return',
              reference_id: data.order_id,
              party_type: 'customer',
              party_id: data.customer_id,
              note: `Sales Return Credit Note (Order #${order?.order_number || ''}): reduced pending invoice & customer debt by ${formatCurrency(debtWiped, symbol)}${excessCredit > 0 ? `, Store Credit granted: ${formatCurrency(excessCredit, symbol)}` : ''} for ${custName}`,
              date: new Date().toISOString().slice(0, 10),
            });
          }
        }
      }

      // 3. Record Combined Audit Log
      await logAuditAction({
        action: 'SALES_RETURN',
        entity_type: 'sales_returns',
        entity_id: data.order_id,
        user_name: user?.name || 'Cashier',
        details: `Cashier ${user?.name || 'User'} processed Sales Return for Order #${order?.order_number || 'N/A'}: ${data.items.length} product(s), ${totalCartons} total unit(s) (Refund: ${formatCurrency(grandTotal, symbol)}, Resolution: ${data.resolution === 'refund' ? 'Cash Drawer Refund' : data.resolution === 'credit_note' ? 'Customer Balance Credit' : 'Replacement'})`,
      });

      notify(
        `Sales return created successfully for ${data.items.length} item(s) (${formatCurrency(grandTotal, symbol)})!`,
        'success'
      );
      setShowForm(false);
      setInitialOrderId('');
      await load();
    } catch (err: any) {
      notify(err?.message || 'Failed to create returns', 'error');
    } finally {
      isCreatingReturnRef.current = false;
      setIsCreatingReturn(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const returnItem = items.find((r) => r.id === id);
      await api.put(`/api/data/sales_returns/${id}`, { status });

      // If approving a previously pending return, apply financial settlement
      if (status === 'approved' && returnItem && returnItem.status !== 'approved') {
        const total = Number(returnItem.total_amount || 0);
        if (total > 0 && returnItem.resolution === 'refund') {
          const acc = accounts.find((a) => a.type === 'cash') || accounts[0];
          if (acc) {
            await api.put(`/api/data/payment_accounts/${acc.id}`, {
              balance: Number(acc.balance || 0) - total,
            });
            await api.post('/api/data/transactions', {
              type: 'cash_out',
              account_type: acc.type || 'cash',
              amount: total,
              reference_type: 'sales_return',
              reference_id: returnItem.id,
              party_type: 'customer',
              party_id: returnItem.customer_id || null,
              note: `Sales Return Refund Approved: ${returnItem.return_number}`,
              date: new Date().toISOString().slice(0, 10),
            });
          }
        } else if (total > 0 && returnItem.resolution === 'credit_note' && returnItem.customer_id) {
          const cust = await api.get<any>(`/api/data/customers/${returnItem.customer_id}`);
          if (cust) {
            await api.put(`/api/data/customers/${returnItem.customer_id}`, {
              balance: Number(cust.balance || 0) - total,
            });
          }
        }

        // Also adjust order total cleanly so due is never negative
        if (returnItem.order_id && total > 0) {
          const ord = await api.get<any>(`/api/data/orders/${returnItem.order_id}`);
          if (ord) {
            const oldTotal = Number(ord.total || 0);
            const oldPaid = Number(ord.paid_amount || 0);
            const netKeptTotal = Math.max(0, oldTotal - total);
            const netAllocatedPaid = Math.min(oldPaid, netKeptTotal);
            const newPaymentStatus = (netKeptTotal <= netAllocatedPaid) ? 'paid' : (netAllocatedPaid > 0 ? 'partial' : 'unpaid');
            await api.put(`/api/data/orders/${ord.id}`, {
              total: netKeptTotal,
              paid_amount: netAllocatedPaid,
              payment_status: newPaymentStatus,
            });
          }
        }
      }

      await logAuditAction({
        action: 'RETURN_STATUS',
        entity_type: 'sales_returns',
        entity_id: id,
        user_name: user?.name || 'Cashier',
        details: `${user?.name || 'Staff'} changed Sales Return #${returnItem?.return_number || id} status to "${status}"`,
      });

      notify(`Return status updated to ${status}`, 'success');
      setViewing(null);
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to update status', 'error');
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Sales Returns" />
        <Spinner />
      </div>
    );
  }

  const q = search.toLowerCase().trim();
  const filtered = items.filter(
    (r) =>
      (!q ||
      r.return_number?.toLowerCase().includes(q) ||
      r.orders?.order_number?.toLowerCase().includes(q) ||
      r.customers?.name?.toLowerCase().includes(q) ||
      r.product_name?.toLowerCase().includes(q)) &&
      isWithinDateRange(r.created_at, dateFilter)
  );

  const totalAmount = filtered.reduce((s, r) => s + Number(r.total_amount || 0), 0);
  const totalQty = filtered.reduce((s, r) => s + Number(r.quantity || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Returns"
        subtitle={`${items.length} total return line item(s) recorded`}
        actions={
          <Button icon={<Plus size={18} />} onClick={() => { setInitialOrderId(''); setShowForm(true); }}>
            Create Sales Return
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-rose-50 to-white border-rose-100">
          <div className="rounded-xl bg-rose-500/10 p-3 text-rose-600">
            <RotateCcw size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Returns Value</p>
            <p className="text-xl font-bold text-slate-800">{formatCurrency(totalAmount, symbol)}</p>
            <p className="text-xs text-rose-600 mt-0.5">{items.length} return claim item(s)</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-amber-50 to-white border-amber-100">
          <div className="rounded-xl bg-amber-500/10 p-3 text-amber-600">
            <ArrowDownLeft size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Items Restocked</p>
            <p className="text-xl font-bold text-slate-800">{totalQty.toLocaleString()} units/cartons</p>
            <p className="text-xs text-amber-600 mt-0.5">Returned back into warehouse</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
          <div className="rounded-xl bg-emerald-500/10 p-3 text-emerald-600">
            <DollarSign size={24} />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cash Drawer / Refunds</p>
            <p className="text-xl font-bold text-slate-800">
              {formatCurrency(
                items.filter((r) => r.resolution === 'refund').reduce((s, r) => s + Number(r.total_amount || 0), 0),
                symbol
              )}
            </p>
            <p className="text-xs text-emerald-600 mt-0.5">Cash refunded to customers</p>
          </div>
        </Card>
      </div>

      {/* Search Toolbar */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by return #, order #, customer name, or product..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </div>
        <DateTimeFilter value={dateFilter} onChange={setDateFilter} />
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500 px-1 -mt-3">
        <span>Showing <strong className="text-slate-700">{filtered.length}</strong> of <strong className="text-slate-700">{items.length}</strong> sales returns</span>
        {filtered.length > 0 && (
          <span>Total: <strong className="text-rose-600 font-semibold">{formatCurrency(totalAmount, symbol)}</strong></span>
        )}
      </div>

      {/* Table */}
      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<RotateCcw size={32} />}
            title="No sales returns found"
            description="Create a return to refund sold goods or issue credit notes to customers."
            action={
              <Button icon={<Plus size={18} />} onClick={() => { setInitialOrderId(''); setShowForm(true); }}>
                Create Sales Return
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Return #</th>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th>Total Amount</th>
                  <th>Resolution</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Date & Time</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="font-semibold text-slate-800">{r.return_number}</td>
                    <td>
                      <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {r.orders?.order_number || '—'}
                      </span>
                    </td>
                    <td className="font-medium text-slate-700">{r.customers?.name || 'Walk-in Customer'}</td>
                    <td>
                      <span className="font-medium text-slate-800">{r.product_name}</span>
                    </td>
                    <td>
                      <Badge variant="gray">{r.quantity}</Badge>
                    </td>
                    <td className="text-slate-600">{formatCurrency(r.unit_price, symbol)}</td>
                    <td className="font-bold text-slate-900">{formatCurrency(r.total_amount, symbol)}</td>
                    <td>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full',
                          r.resolution === 'refund'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : r.resolution === 'credit_note'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-purple-50 text-purple-700 border border-purple-200'
                        )}
                      >
                        {r.resolution === 'refund' ? 'Cash Refund' : r.resolution === 'credit_note' ? 'Credit Note' : 'Replacement'}
                      </span>
                    </td>
                    <td>
                      <Badge variant={reasonVariant[r.reason] || 'gray'}>{r.reason.replace('_', ' ')}</Badge>
                    </td>
                    <td>
                      <Badge variant={r.status === 'approved' ? 'green' : r.status === 'pending' ? 'amber' : 'red'}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => setViewing(r)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                          title="View Details"
                        >
                          <Eye size={16} />
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

      {/* Multi-Item Return Form Modal */}
      <MultiItemReturnForm
        open={showForm}
        onClose={() => {
          if (!isCreatingReturn) {
            setShowForm(false);
            setInitialOrderId('');
          }
        }}
        onCreate={createBatch}
        orders={orders}
        orderItems={orderItems}
        products={products}
        customers={customers}
        accounts={accounts}
        brands={brands}
        existingReturns={items}
        symbol={symbol}
        initialOrderId={initialOrderId}
        submitting={isCreatingReturn}
      />

      {/* View Return Modal */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `Sales Return ${viewing.return_number}` : ''}
        size="xl"
        footer={
          <>
            {viewing?.status === 'pending' && (
              <>
                <Button variant="success" onClick={() => updateStatus(viewing.id, 'approved')}>
                  Approve & Settle
                </Button>
                <Button variant="danger" onClick={() => updateStatus(viewing.id, 'rejected')}>
                  Reject
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => window.print()} icon={<Printer size={16} />}>
              Print Slip
            </Button>
            <Button onClick={() => setViewing(null)}>Close</Button>
          </>
        }
      >
        {viewing && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <p className="text-xs text-slate-400">Return Number</p>
                <p className="text-base font-bold text-slate-800">{viewing.return_number}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">Date & Time</p>
                <p className="font-medium text-slate-700">{formatDateTime(viewing.created_at)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-400">Customer</p>
                <p className="font-semibold text-slate-800">{viewing.customers?.name || 'Walk-in Customer'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Sales Order #</p>
                <p className="font-mono font-medium text-slate-700">{viewing.orders?.order_number || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Returned Product</p>
                <p className="font-medium text-slate-800">{viewing.product_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Returned Quantity</p>
                <p className="font-semibold text-slate-800">{viewing.quantity} unit(s) / carton(s)</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Unit Price</p>
                <p className="font-medium text-slate-700">{formatCurrency(viewing.unit_price, symbol)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Resolution</p>
                <p className="font-semibold capitalize text-slate-800">
                  {viewing.resolution === 'refund' ? 'Cash Refund (Paid to Customer)' : viewing.resolution === 'credit_note' ? 'Credit Note (Ledger adjusted)' : 'Product Replacement'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Reason</p>
                <p className="font-medium capitalize text-slate-800">{viewing.reason?.replace('_', ' ')}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Status</p>
                <Badge variant={viewing.status === 'approved' ? 'green' : viewing.status === 'pending' ? 'amber' : 'red'}>
                  {viewing.status}
                </Badge>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
              <div className="flex justify-between items-center">
                <span className="text-slate-600 font-medium">Total Return Amount</span>
                <span className="text-xl font-bold text-rose-600">{formatCurrency(viewing.total_amount, symbol)}</span>
              </div>
            </div>

            {viewing.note && (
              <div>
                <p className="text-xs text-slate-400">Note / Reason Details</p>
                <p className="text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200">{viewing.note}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

interface ItemRowState {
  item_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  unit: string;
  soldQty: number;
  alreadyReturned: number;
  remainingReturnable: number;
  selected: boolean;
  returnQty: number;
  reason: string;
}

/**
 * Multi-Item & Whole Bill Return Form Component
 * Supports selecting individual products or returning the entire invoice with 1 click.
 */
function MultiItemReturnForm({
  open,
  onClose,
  onCreate,
  orders,
  orderItems,
  products,
  customers,
  accounts,
  brands = [],
  existingReturns,
  symbol,
  initialOrderId,
  submitting = false,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (d: any) => void;
  orders: any[];
  orderItems: any[];
  products: any[];
  customers: any[];
  accounts: any[];
  brands?: any[];
  existingReturns: any[];
  symbol: string;
  initialOrderId?: string;
  submitting?: boolean;
}) {
  const [orderId, setOrderId] = useState('');
  const [resolution, setResolution] = useState('refund');
  const [accountType, setAccountType] = useState('cash');
  const [status, setStatus] = useState('approved');
  const [note, setNote] = useState('');
  const [rowStates, setRowStates] = useState<ItemRowState[]>([]);

  // Selected Order & Customer
  const selectedOrder = useMemo(() => orders.find((o) => o.id === orderId), [orders, orderId]);
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedOrder?.customer_id),
    [customers, selectedOrder]
  );

  // Financial status of selected order
  const orderFinancials = useMemo(() => {
    if (!selectedOrder) return null;
    const orderTotal = Number(selectedOrder.total || 0);
    const paidAmount = Number(selectedOrder.paid_amount || 0);
    const dueAmount = Math.max(0, orderTotal - paidAmount);
    const customerDebt = Number(selectedCustomer?.balance || 0);

    let mode: 'credit' | 'partial' | 'paid' = 'paid';
    if (orderTotal > 0 && paidAmount <= 0) {
      mode = 'credit';
    } else if (dueAmount > 0) {
      mode = 'partial';
    }

    return {
      orderTotal,
      paidAmount,
      dueAmount,
      customerDebt,
      mode,
    };
  }, [selectedOrder, selectedCustomer]);

  // Load Order Items & State whenever modal opens
  useEffect(() => {
    if (!open) return;
    const initialId = initialOrderId || '';
    setOrderId(initialId);
    setStatus('approved');
    setNote('');
  }, [open, initialOrderId]);

  // Auto-select resolution based on order payment mode
  useEffect(() => {
    if (!orderFinancials) return;
    if (orderFinancials.dueAmount > 0) {
      setResolution('credit_note');
    } else {
      setResolution('refund');
    }
  }, [orderFinancials?.dueAmount]);

  // Synchronize rows when orderId changes
  useEffect(() => {
    if (!orderId) {
      setRowStates([]);
      return;
    }

    const itemsForOrder = orderItems.filter((it) => it.order_id === orderId);

    const rows: ItemRowState[] = itemsForOrder.map((it) => {
      const alreadyReturned = existingReturns
        .filter(
          (r) =>
            r.order_id === orderId &&
            (r.product_id === it.product_id || r.product_name === it.product_name) &&
            r.status !== 'rejected'
        )
        .reduce((sum, r) => sum + Number(r.quantity || 0), 0);

      const soldQty = Number(it.quantity || 0);
      const remainingReturnable = Math.max(0, soldQty - alreadyReturned);

      return {
        item_id: it.id,
        product_id: it.product_id || null,
        product_name: it.product_name || 'Product',
        unit_price: Number(it.unit_price || 0),
        unit: it.unit || 'carton',
        soldQty,
        alreadyReturned,
        remainingReturnable,
        selected: false,
        returnQty: remainingReturnable > 0 ? remainingReturnable : 0,
        reason: 'damaged',
      };
    });

    setRowStates(rows);
  }, [orderId, orderItems, existingReturns]);

  // Toggle Selection of an item
  const toggleSelect = (itemId: string) => {
    setRowStates((prev) =>
      prev.map((r) => {
        if (r.item_id === itemId && r.remainingReturnable > 0) {
          const nextSelected = !r.selected;
          return {
            ...r,
            selected: nextSelected,
            returnQty: nextSelected && r.returnQty <= 0 ? r.remainingReturnable : r.returnQty,
          };
        }
        return r;
      })
    );
  };

  // Change Return Quantity for a row
  const handleQtyChange = (itemId: string, newQty: number) => {
    setRowStates((prev) =>
      prev.map((r) => {
        if (r.item_id === itemId) {
          const val = Math.max(0, Math.min(newQty, r.remainingReturnable));
          return {
            ...r,
            returnQty: val,
            selected: val > 0,
          };
        }
        return r;
      })
    );
  };

  // Change Reason for a row
  const handleReasonChange = (itemId: string, newReason: string) => {
    setRowStates((prev) =>
      prev.map((r) => (r.item_id === itemId ? { ...r, reason: newReason } : r))
    );
  };

  // "Select All / Return Whole Bill" Action
  const selectAll = () => {
    setRowStates((prev) =>
      prev.map((r) => ({
        ...r,
        selected: r.remainingReturnable > 0,
        returnQty: r.remainingReturnable,
      }))
    );
  };

  // "Deselect All" Action
  const deselectAll = () => {
    setRowStates((prev) =>
      prev.map((r) => ({
        ...r,
        selected: false,
      }))
    );
  };

  // Selected items summary
  const selectedRows = useMemo(() => rowStates.filter((r) => r.selected && r.returnQty > 0), [rowStates]);
  const totalReturnAmount = useMemo(
    () => selectedRows.reduce((sum, r) => sum + r.returnQty * r.unit_price, 0),
    [selectedRows]
  );
  const totalReturnUnits = useMemo(
    () => selectedRows.reduce((sum, r) => sum + r.returnQty, 0),
    [selectedRows]
  );

  const canSubmit = orderId && selectedRows.length > 0 && totalReturnAmount > 0;

  const handleSubmit = () => {
    if (!canSubmit || submitting) return;

    const payloadItems: ReturnItemPayload[] = selectedRows.map((r) => ({
      product_id: r.product_id,
      product_name: r.product_name,
      quantity: r.returnQty,
      unit_price: r.unit_price,
      unit: r.unit,
      reason: r.reason,
      total_amount: r.returnQty * r.unit_price,
    }));

    onCreate({
      order_id: orderId,
      customer_id: selectedOrder?.customer_id || null,
      items: payloadItems,
      resolution,
      account_type: accountType,
      status,
      note,
    });
  };

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title="Create Sales Return"
      size="xl"
      className="my-1 sm:my-2"
      bodyClassName="px-4 py-3"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-500">
            {selectedRows.length > 0 ? (
              <span>
                <strong>{selectedRows.length}</strong> product(s) selected ({totalReturnUnits} units) · Total Value:{' '}
                <strong className="text-emerald-700 font-bold">{formatCurrency(totalReturnAmount, symbol)}</strong>
              </span>
            ) : (
              <span>No products selected for return</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              icon={submitting ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            >
              {submitting ? 'Processing Return...' : `Confirm Return (${formatCurrency(totalReturnAmount, symbol)})`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Order Selector */}
        <Field label="Select Sales Order (Invoice)">
          <SearchableSelect
            value={orderId}
            onChange={(val) => setOrderId(val)}
            options={orders.map((o) => {
              const cust = customers.find((c) => c.id === o.customer_id);
              const due = Math.max(0, Number(o.total || 0) - Number(o.paid_amount || 0));
              const statusTag = due > 0 ? ` [Due: ${formatCurrency(due, symbol)}]` : ' [Paid]';
              return {
                value: o.id,
                label: `${o.order_number} — ${cust?.name || 'Walk-in'} (${formatCurrency(o.total, symbol)})${statusTag} [${formatDate(o.created_at)}]`,
                searchText: `${o.order_number} ${cust?.name || 'walk-in'} ${o.invoice_number || ''}`,
              };
            })}
            placeholder="Search invoice / order number or customer..."
          />
        </Field>

        {orderId && selectedOrder && orderFinancials ? (
          <>
            {/* Compact Header & Financial Strip */}
            <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 via-sky-50/40 to-slate-50 p-2.5 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-slate-800 text-sm">
                    {selectedCustomer?.name || 'Walk-in Customer'}
                  </span>
                  <span className="text-xs font-mono text-slate-500">
                    Invoice #{selectedOrder.order_number}
                  </span>
                  {orderFinancials.mode === 'credit' && (
                    <Badge variant="amber">Credit Bill (100% Due)</Badge>
                  )}
                  {orderFinancials.mode === 'partial' && (
                    <Badge variant="amber">Partial Payment (Due Pending)</Badge>
                  )}
                  {orderFinancials.mode === 'paid' && (
                    <Badge variant="green">Paid in Full</Badge>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs shadow-sm transition-colors"
                  >
                    <CheckSquare size={13} />
                    Return Whole Bill (Select All)
                  </button>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs hover:bg-slate-100 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Financial Inline Chips */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs pt-1 border-t border-slate-200/70">
                <span className="text-slate-600">
                  Bill Total: <strong className="text-slate-800">{formatCurrency(orderFinancials.orderTotal, symbol)}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-600">
                  Paid: <strong className="text-emerald-600">{formatCurrency(orderFinancials.paidAmount, symbol)}</strong>
                </span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-600">
                  Due: <strong className={orderFinancials.dueAmount > 0 ? 'text-amber-600' : 'text-slate-700'}>{formatCurrency(orderFinancials.dueAmount, symbol)}</strong>
                </span>
                {orderFinancials.customerDebt > 0 && (
                  <>
                    <span className="text-slate-300">|</span>
                    <span className="text-slate-600">
                      Customer Debt: <strong className="text-rose-600">{formatCurrency(orderFinancials.customerDebt, symbol)}</strong>
                    </span>
                  </>
                )}
                <div className="ml-auto">
                  {orderFinancials.dueAmount > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-800 border border-amber-200/60">
                      <Info size={12} className="shrink-0 text-amber-600" />
                      Auto-applies Credit Note to deduct unpaid bill
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-100 text-emerald-800 border border-emerald-200/60">
                      <Info size={12} className="shrink-0 text-emerald-600" />
                      Paid in Full · Cash Refund or Credit Note
                    </span>
                  )}
                </div>
              </div>

              {/* Dynamic Live Settlement Breakdown */}
              {totalReturnAmount > 0 && (() => {
                const paidAmount = Number(orderFinancials.paidAmount || 0);
                const dueAmount = Number(orderFinancials.dueAmount || 0);
                const debtWiped = Math.min(totalReturnAmount, dueAmount);
                const excessAmount = Math.max(0, totalReturnAmount - dueAmount);
                const maxCashRefund = Math.min(totalReturnAmount, paidAmount);

                if (resolution === 'credit_note') {
                  return totalReturnAmount <= dueAmount ? (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900 mt-2">
                      <Info size={15} className="shrink-0 text-amber-600 mt-0.5" />
                      <div>
                        <strong>Credit Note Adjustment:</strong> This return of <strong>{formatCurrency(totalReturnAmount, symbol)}</strong> will reduce the customer's unpaid bill from {formatCurrency(dueAmount, symbol)} down to <strong>{formatCurrency(dueAmount - totalReturnAmount, symbol)}</strong>. Customer debt balance will be updated accordingly.
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-300 rounded-lg p-2.5 text-xs text-emerald-900 mt-2">
                      <CheckCircle2 size={16} className="shrink-0 text-emerald-600 mt-0.5" />
                      <div>
                        <p className="font-bold text-emerald-800">Debt Cleared + Store Credit Granted</p>
                        <p className="mt-0.5">
                          • <strong>{formatCurrency(debtWiped, symbol)}</strong> clears the customer's remaining bill debt to 0 (Invoice marked Settled).
                        </p>
                        <p className="mt-0.5">
                          • The remaining <strong>{formatCurrency(excessAmount, symbol)}</strong> will be added to the customer's account as <strong>Store Credit</strong> for future orders!
                        </p>
                      </div>
                    </div>
                  );
                } else if (resolution === 'refund') {
                  return paidAmount <= 0 ? (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900 mt-2">
                      <Info size={15} className="shrink-0 text-amber-600 mt-0.5" />
                      <div>
                        <strong>Notice:</strong> Customer paid {formatCurrency(0, symbol)} on this invoice. Cash refund from drawer is {formatCurrency(0, symbol)}. Return will cancel {formatCurrency(debtWiped, symbol)} of unpaid credit bill.
                      </div>
                    </div>
                  ) : totalReturnAmount > paidAmount ? (
                    <div className="flex items-start gap-2 bg-sky-50 border border-sky-200 rounded-lg p-2.5 text-xs text-sky-900 mt-2">
                      <Info size={15} className="shrink-0 text-sky-600 mt-0.5" />
                      <div>
                        <strong>Capped Cash Refund:</strong> Customer originally paid {formatCurrency(paidAmount, symbol)}. Cash refund from drawer is capped at <strong>{formatCurrency(maxCashRefund, symbol)}</strong>. The remaining <strong>{formatCurrency(totalReturnAmount - maxCashRefund, symbol)}</strong> cancels unpaid bill debt.
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 bg-sky-50 border border-sky-200 rounded-lg p-2.5 text-xs text-sky-900 mt-2">
                      <Info size={15} className="shrink-0 text-sky-600 mt-0.5" />
                      <div>
                        <strong>Cash Refund:</strong> <strong>{formatCurrency(totalReturnAmount, symbol)}</strong> will be refunded to customer from <strong>{accountType}</strong> register.
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>

            {/* Products on this Invoice Table - Immediately visible without scrolling! */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-bold uppercase tracking-wider text-slate-600">
                  Products on this Invoice ({rowStates.length})
                </span>
                <span>Select products to return and specify quantities:</span>
              </div>

              {rowStates.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 text-center">
                  No items recorded on this order.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 sticky top-0 z-10">
                      <tr>
                        <th className="py-2 px-2.5 w-8"></th>
                        <th className="py-2 px-2.5">Product</th>
                        <th className="py-2 px-2 text-center">Sold</th>
                        <th className="py-2 px-2 text-center">Prev. Returned</th>
                        <th className="py-2 px-2 text-center">Returnable</th>
                        <th className="py-2 px-2.5 text-right">Billed Rate</th>
                        <th className="py-2 px-2.5 w-40 text-center">Return Qty</th>
                        <th className="py-2 px-2.5 w-36">Return Reason</th>
                        <th className="py-2 px-2.5 text-right">Refund Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {rowStates.map((row) => {
                        const isFullyReturned = row.remainingReturnable <= 0;
                        const lineTotal = row.returnQty * row.unit_price;

                        const prodInfo = products.find((p) => p.id === row.product_id);
                        const brandInfo = brands.find((b) => b.id === prodInfo?.brand_id);
                        const photoUrl = resolveImageUrl(prodInfo?.image_url) || resolveImageUrl(brandInfo?.logo_url);

                        return (
                          <tr
                            key={row.item_id}
                            className={cn(
                              'transition-colors',
                              row.selected ? 'bg-sky-50/60' : 'hover:bg-slate-50/60',
                              isFullyReturned && 'opacity-50 bg-slate-50 cursor-not-allowed'
                            )}
                          >
                            <td className="py-2 px-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={row.selected}
                                disabled={isFullyReturned}
                                onChange={() => toggleSelect(row.item_id)}
                                className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer disabled:cursor-not-allowed"
                              />
                            </td>

                            <td className="py-2 px-2.5">
                              <div className="flex items-center gap-2">
                                <div className="h-8 w-8 shrink-0 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
                                  {photoUrl ? (
                                    <img
                                      src={photoUrl}
                                      alt={row.product_name}
                                      className="h-full w-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLElement).style.display = 'none';
                                      }}
                                    />
                                  ) : (
                                    <Package size={15} className="text-slate-400" />
                                  )}
                                </div>
                                <div>
                                  <span className="font-semibold text-slate-800 block leading-tight">{row.product_name}</span>
                                  <span className="text-[10px] text-slate-400 capitalize">
                                    {brandInfo?.name ? `${brandInfo.name} · ` : ''}{row.unit}
                                  </span>
                                </div>
                              </div>
                            </td>

                            <td className="py-2 px-2 text-center font-medium text-slate-700">
                              {row.soldQty}
                            </td>

                            <td className="py-2 px-2 text-center text-rose-600 font-medium">
                              {row.alreadyReturned}
                            </td>

                            <td className="py-2 px-2 text-center">
                              {isFullyReturned ? (
                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600">
                                  None
                                </span>
                              ) : (
                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  {row.remainingReturnable}
                                </span>
                              )}
                            </td>

                            <td className="py-2 px-2.5 text-right font-medium text-slate-700">
                              {formatCurrency(row.unit_price, symbol)}
                            </td>

                            <td className="py-1.5 px-2.5">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  disabled={isFullyReturned || row.returnQty <= 0}
                                  onClick={() => handleQtyChange(row.item_id, Math.max(0, row.returnQty - 1))}
                                  className="h-6 w-6 flex items-center justify-center rounded border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Decrease"
                                >
                                  <Minus size={11} />
                                </button>
                                <input
                                  type="number"
                                  min={0}
                                  max={row.remainingReturnable}
                                  value={row.returnQty || ''}
                                  disabled={isFullyReturned}
                                  onChange={(e) => handleQtyChange(row.item_id, Number(e.target.value))}
                                  className={cn(
                                    'w-12 rounded-md border text-center py-0.5 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-sky-500/20',
                                    row.selected ? 'border-sky-400 bg-white text-slate-800' : 'border-slate-300 bg-slate-50 text-slate-400'
                                  )}
                                />
                                <button
                                  type="button"
                                  disabled={isFullyReturned || row.returnQty >= row.remainingReturnable}
                                  onClick={() => handleQtyChange(row.item_id, Math.min(row.remainingReturnable, row.returnQty + 1))}
                                  className="h-6 w-6 flex items-center justify-center rounded border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Increase"
                                >
                                  <Plus size={11} />
                                </button>
                                <button
                                  type="button"
                                  disabled={isFullyReturned}
                                  onClick={() => handleQtyChange(row.item_id, row.remainingReturnable)}
                                  className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-sky-100 hover:bg-sky-200 text-sky-800 border border-sky-200 disabled:opacity-30"
                                  title="Set Max"
                                >
                                  Max
                                </button>
                              </div>
                            </td>

                            <td className="py-1.5 px-2.5">
                              <select
                                value={row.reason}
                                disabled={isFullyReturned || !row.selected}
                                onChange={(e) => handleReasonChange(row.item_id, e.target.value)}
                                className="w-full rounded-md border border-slate-300 bg-white p-1 text-xs text-slate-700 focus:border-sky-500 focus:outline-none disabled:bg-slate-100"
                              >
                                <option value="damaged">Damaged Goods</option>
                                <option value="expired">Expired Goods</option>
                                <option value="wrong_product">Wrong Product</option>
                                <option value="unsold_goods">Unsold Goods</option>
                              </select>
                            </td>

                            <td className="py-2 px-2.5 text-right font-bold text-slate-900">
                              {formatCurrency(lineTotal, symbol)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Compact Settlement Configuration */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1 border-t border-slate-200">
              <Field label="Resolution (Financial Settlement)">
                <Select value={resolution} onChange={(e) => setResolution(e.target.value)}>
                  <option value="credit_note">Credit Note (Deduct Balance & Bill)</option>
                  <option value="refund">Cash Refund (From Drawer)</option>
                  <option value="replacement">Product Replacement (Exchange)</option>
                </Select>
              </Field>

              {resolution === 'refund' ? (
                <Field label="Refund From Cash Account">
                  <Select value={accountType} onChange={(e) => setAccountType(e.target.value)}>
                    <option value="cash">Cash Drawer (Cash in Hand)</option>
                    {accounts.filter((a) => a.type !== 'cash').map((acc) => (
                      <option key={acc.id} value={acc.type}>
                        {acc.name || acc.type} ({formatCurrency(acc.balance, symbol)})
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <Field label="Return Status">
                  <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="approved">Approved & Settle Immediately</option>
                    <option value="pending">Pending Approval</option>
                  </Select>
                </Field>
              )}

              <Field label="Note / Reference (Optional)">
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Returned damaged batch"
                />
              </Field>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center bg-slate-50/50">
            <Package size={36} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">Please Select a Sales Order (Invoice)</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Select an invoice above to view only the products sold on this bill, check returnable limits, and process customer returns.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
