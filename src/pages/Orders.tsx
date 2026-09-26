import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { Order, OrderItem, OrderPayment, Product } from '@/lib/types';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/Button';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal, ConfirmModal } from '@/components/Modal';
import { Pagination } from '@/components/Pagination';
import { PrintPreview } from '@/components/PrintPreview';
import { SalesInvoiceDocument } from '@/components/SalesInvoiceDocument';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import { toCartons, type SaleUnit } from '@/lib/units';
import { Search, Eye, Printer, Ban, RotateCcw, Receipt } from 'lucide-react';
import { DateTimeFilter, type DateFilterValue, isWithinDateRange } from '@/components/DateTimeFilter';

const statusVariant: Record<string, 'green' | 'amber' | 'red' | 'gray' | 'blue'> = {
  completed: 'green',
  held: 'amber',
  cancelled: 'red',
  returned: 'gray',
};
const payVariant: Record<string, 'green' | 'amber' | 'red'> = {
  paid: 'green',
  partial: 'amber',
  unpaid: 'red',
};

export function Orders() {
  const { symbol, settings, logoSrc } = useSettings();
  const { notify } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({ preset: 'all' });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [viewOrder, setViewOrder] = useState<any>(null);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [printPreview, setPrintPreview] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersData, customers] = await Promise.all([
        api.get<Order[]>('/api/data/orders'),
        api.get<any[]>('/api/data/customers'),
      ]);
      const customerMap = new Map((customers || []).map((c) => [c.id, c]));
      setOrders(
        (ordersData || [])
          .map((o) => ({
            ...o,
            customers: o.customer_id
              ? customerMap.get(o.customer_id) || null
              : null,
          }))
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      );
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter, dateFilter]);

  const filtered = orders.filter((o) => {
    const q = search.toLowerCase();
    const matchSearch = !q || o.order_number?.toLowerCase().includes(q) || o.customers?.name?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || o.status === statusFilter;
    const matchDate = isWithinDateRange(o.created_at, dateFilter);
    return matchSearch && matchStatus && matchDate;
  });

  const openView = async (order: Order) => {
    try {
      const [allItems, allPayments, products] = await Promise.all([
        api.get<OrderItem[]>('/api/data/order_items'),
        api.get<OrderPayment[]>('/api/data/order_payments'),
        api.get<Product[]>('/api/data/products?limit=10000'),
      ]);
      const productMap = new Map((products || []).map((p) => [p.id, p]));
      const items = (allItems || [])
        .filter((i) => i.order_id === order.id)
        .map((i) => ({
          ...i,
          product: i.product_id ? productMap.get(i.product_id) : null,
        }));
      setViewOrder({
        ...order,
        items,
        payments: (allPayments || []).filter((p) => p.order_id === order.id),
      });
      setPrintPreview(false);
    } catch {
      setViewOrder({ ...order, items: [], payments: [] });
    }
  };

  const cancelOrder = async (order: any) => {
    try {
      let items = order.items || [];
      if (!items.length) {
        const allItems = await api.get<OrderItem[]>('/api/data/order_items');
        items = (allItems || []).filter((i) => i.order_id === order.id);
      }
      for (const item of items) {
        if (item.product_id) {
          try {
            const prod = await api.get<any>(`/api/data/products/${item.product_id}`);
            if (prod) {
              const unit = ((item as any).unit === 'box' ? 'box' : 'carton') as SaleUnit;
              const restoreQty = toCartons(prod, unit, Number(item.quantity))
                + toCartons(prod, unit, Number((item as any).free_items || 0));
              await api.put(`/api/data/products/${item.product_id}`, {
                stock_quantity: Number(prod.stock_quantity) + restoreQty,
              });
              await api.post('/api/data/stock_movements', {
                product_id: item.product_id,
                type: 'adjustment',
                quantity: restoreQty,
                reference_type: 'order',
                reference_id: order.id,
                note: `Order ${order.order_number} cancelled`,
              });
            }
          } catch {
            // continue restoring other items
          }
        }
      }
      await api.put(`/api/data/orders/${order.id}`, { status: 'cancelled' });
      notify('Order cancelled and stock restored', 'success');
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to cancel order', 'error');
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Orders" />
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Orders" subtitle="View and manage all sales orders" />

      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order number or customer..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="returned">Returned</option>
        </select>
        <DateTimeFilter value={dateFilter} onChange={setDateFilter} />
      </div>

      <div className="mb-2 flex items-center justify-between text-xs text-slate-500 px-1">
        <span>Showing <strong className="text-slate-700">{filtered.length}</strong> of <strong className="text-slate-700">{orders.length}</strong> orders</span>
        {filtered.length > 0 && (
          <span>Total: <strong className="text-emerald-600 font-semibold">{formatCurrency(filtered.reduce((s, o) => s + Number(o.total || 0), 0), symbol)}</strong></span>
        )}
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState icon={<Receipt size={32} />} title="No orders found" description="Orders will appear here after sales" />
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((o) => (
                    <tr key={o.id}>
                      <td className="font-medium text-slate-800">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span>{o.order_number}</span>
                          {o.order_number?.startsWith('OB-') && (
                            <Badge variant="blue">Opening Balance</Badge>
                          )}
                        </div>
                      </td>
                      <td>{o.customers?.name || 'Walk-in'}</td>
                      <td className="text-slate-500">{formatDateTime(o.created_at)}</td>
                      <td className="font-semibold">{formatCurrency(o.total, symbol)}</td>
                      <td><Badge variant={statusVariant[o.status] || 'gray'}>{o.status}</Badge></td>
                      <td><Badge variant={payVariant[o.payment_status] || 'gray'}>{o.payment_status}</Badge></td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openView(o)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="View">
                            <Eye size={16} />
                          </button>
                          {o.status === 'completed' && (
                            <button onClick={() => setCancelTarget(o)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Cancel">
                              <Ban size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={currentPage}
              totalItems={filtered.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[10, 25, 50, 100]}
              itemLabel="orders"
              className="border-t border-slate-100 rounded-t-none"
            />
          </div>
        )}
      </Card>

      {/* View order modal */}
      <Modal
        open={!!viewOrder && !printPreview}
        onClose={() => setViewOrder(null)}
        title={viewOrder ? `Order #${viewOrder.order_number}` : ''}
        size="xl"
        footer={
          <>
            <Button
              variant="outline"
              icon={<RotateCcw size={16} />}
              onClick={() => {
                const oid = viewOrder.id;
                setViewOrder(null);
                window.location.hash = `#/sales-returns?order_id=${oid}`;
              }}
            >
              Return Items
            </Button>
            <Button variant="outline" icon={<Printer size={16} />} onClick={() => setPrintPreview(true)}>Print Preview</Button>
            <Button onClick={() => setViewOrder(null)}>Close</Button>
          </>
        }
      >
        {viewOrder && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-xs">
              <div>
                <span className="text-slate-400">Customer: </span>
                <span className="font-semibold text-slate-800">{viewOrder.customers?.name || 'Walk-in Customer'}</span>
                {viewOrder.customers?.phone && <span className="text-slate-500 ml-1">({viewOrder.customers.phone})</span>}
              </div>
              <div>
                <span className="text-slate-400">Date & Time: </span>
                <span className="font-semibold text-slate-800">{formatDateTime(viewOrder.created_at)}</span>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="data-table text-xs">
                <thead>
                  <tr><th>Product</th><th>Batch #</th><th>Qty</th><th>Unit</th><th>Rate</th><th className="text-right">Total</th></tr>
                </thead>
                <tbody>
                  {viewOrder.items?.map((it: any) => (
                    <tr key={it.id}>
                      <td className="font-medium text-slate-800">{it.product_name}</td>
                      <td className="font-mono text-[11px] text-slate-600">{it.batch_number || '—'}</td>
                      <td>{it.quantity}</td>
                      <td className="capitalize">{it.unit || 'piece'}</td>
                      <td>{formatCurrency(it.unit_price, symbol)}</td>
                      <td className="text-right font-medium">{formatCurrency(it.total, symbol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 items-start pt-1">
              {/* Left Column: Payment History */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Payment History & Timestamps</p>
                {viewOrder.payments?.length > 0 ? (
                  <div className="space-y-1.5">
                    {viewOrder.payments.map((p: OrderPayment) => (
                      <div key={p.id} className="flex items-center justify-between rounded-lg bg-white border border-slate-200/80 px-3 py-1.5 text-xs">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold capitalize text-slate-700">{p.method}</span>
                            {p.note && <span className="text-[11px] text-slate-400">({p.note})</span>}
                          </div>
                          <p className="text-[10px] text-slate-400">{formatDateTime(p.created_at)}</p>
                        </div>
                        <span className="font-bold text-emerald-600">+{formatCurrency(p.amount, symbol)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No payment recorded</p>
                )}
              </div>

              {/* Right Column: Order Totals Summary */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-500"><span>Subtotal</span><span className="font-medium text-slate-700">{formatCurrency(viewOrder.subtotal, symbol)}</span></div>
                {Number(viewOrder.discount) > 0 && <div className="flex justify-between text-rose-500"><span>Discount</span><span className="font-medium">- {formatCurrency(viewOrder.discount, symbol)}</span></div>}
                {Number(viewOrder.tax) > 0 && <div className="flex justify-between text-slate-500"><span>Tax</span><span className="font-medium text-slate-700">{formatCurrency(viewOrder.tax, symbol)}</span></div>}
                <div className="flex justify-between border-t border-slate-200 pt-1.5 text-sm font-bold text-slate-900"><span>Total</span><span>{formatCurrency(viewOrder.total, symbol)}</span></div>
                <div className="flex justify-between text-slate-600"><span>Paid Amount</span><span className="font-semibold text-emerald-600">{formatCurrency(viewOrder.paid_amount, symbol)}</span></div>
                {Number(viewOrder.total) - Number(viewOrder.paid_amount) > 0 && (
                  <div className="flex justify-between text-rose-600 font-bold border-t border-slate-200/60 pt-1">
                    <span>Outstanding Due</span>
                    <span>{formatCurrency(Number(viewOrder.total) - Number(viewOrder.paid_amount), symbol)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {viewOrder && (
        <PrintPreview
          open={printPreview}
          onClose={() => setPrintPreview(false)}
          title={`Print Preview — ${viewOrder.invoice_number || viewOrder.order_number}`}
          size="xl"
          fileName={`invoice_${String(viewOrder.invoice_number || viewOrder.order_number).replace(/[<>:"/\\|?*]+/g, '-')}.pdf`}
          halfPage={settings?.receipt_size !== 'A4'}
        >
          <SalesInvoiceDocument
            storeName={settings?.store_name || 'Sales Invoice'}
            phone={settings?.phone}
            address={settings?.address}
            email={settings?.email}
            ntn={settings?.ntn}
            logoSrc={logoSrc}
            invoiceNumber={viewOrder.invoice_number || viewOrder.order_number}
            orderNumber={viewOrder.order_number}
            date={viewOrder.created_at}
            customerName={viewOrder.customers?.name}
            customerPhone={viewOrder.customers?.phone}
            customerArea={viewOrder.customers?.area}
            customerAddress={viewOrder.customers?.address}
            customerNtn={viewOrder.customers?.ntn}
            items={(viewOrder.items || []).map((it: any) => ({
              product: it.product || {
                id: it.product_id || '',
                name: it.product_name,
                carton_to_box: 1,
              } as Product,
              productName: it.product_name,
              quantity: Number(it.quantity),
              unit: (it.unit || 'piece') as SaleUnit,
              unitPrice: Number(it.unit_price),
              discount: Number(it.discount || 0),
              freeItems: Number(it.free_items || 0),
              batch_number: it.batch_number || null,
            }))}
            subtotal={Number(viewOrder.subtotal)}
            discount={Number(viewOrder.discount)}
            tax={Number(viewOrder.tax)}
            total={Number(viewOrder.total)}
            paidAmount={Number(viewOrder.paid_amount)}
            remaining={Math.max(0, Number(viewOrder.total) - Number(viewOrder.paid_amount || 0))}
            paymentMethod={
              (viewOrder.payments && viewOrder.payments.length > 0)
                ? Array.from(new Set(viewOrder.payments.map((p: any) => p.method).filter(Boolean)))
                    .map((m: any) => String(m).charAt(0).toUpperCase() + String(m).slice(1).toLowerCase())
                    .join(', ')
                : (Number(viewOrder.paid_amount || 0) === 0 ? 'Credit' : 'Cash')
            }
            previousBalance={
              viewOrder.customers?.balance != null
                ? Number(viewOrder.customers.balance) - Math.max(0, Number(viewOrder.total) - Number(viewOrder.paid_amount || 0))
                : undefined
            }
            currentBalance={viewOrder.customers?.balance != null ? Number(viewOrder.customers.balance) : undefined}
            symbol={symbol}
            paperSize={settings?.receipt_size === 'A4' ? 'A4' : 'A5'}
          />
        </PrintPreview>
      )}

      <ConfirmModal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelOrder(cancelTarget)}
        title="Cancel Order"
        message={`Cancel order ${cancelTarget?.order_number}? Stock will be restored.`}
        confirmLabel="Cancel Order"
        danger
      />
    </div>
  );
}
