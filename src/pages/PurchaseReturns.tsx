import { useEffect, useState, useCallback, useMemo } from 'react';
import { api, resolveImageUrl } from '@/lib/api';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/Button';
import { Field, Input, Select, Textarea, SearchableSelect } from '@/components/Form';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal, ConfirmModal } from '@/components/Modal';
import { formatCurrency, formatDate, formatDateTime, generateDocNumber, cn } from '@/lib/utils';
import {
  Plus,
  RotateCcw,
  Eye,
  Search,
  CheckCircle2,
  DollarSign,
  CreditCard,
  Trash2,
  XCircle,
  Package,
  Minus,
  CheckSquare,
  Info,
} from 'lucide-react';
import { DateTimeFilter, type DateFilterValue, isWithinDateRange } from '@/components/DateTimeFilter';

export function PurchaseReturns() {
  const { symbol } = useSettings();
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [purchaseItems, setPurchaseItems] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({ preset: 'all' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, p, s, pr, acc, pi, b] = await Promise.all([
        api.get<any[]>('/api/data/purchase_returns'),
        api.get<any[]>('/api/data/purchase_orders'),
        api.get<any[]>('/api/data/suppliers'),
        api.get<any[]>('/api/data/products?limit=10000'),
        api.get<any[]>('/api/data/payment_accounts'),
        api.get<any[]>('/api/data/purchase_items'),
        api.get<any[]>('/api/data/brands'),
      ]);
      const supplierList = (s || []).sort((a, b) => a.name.localeCompare(b.name));
      const supplierMap = new Map(supplierList.map((x) => [x.id, x]));
      const poList = (p || [])
        .map((po) => ({
          ...po,
          suppliers: po.supplier_id ? { name: supplierMap.get(po.supplier_id)?.name } : null,
        }))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const poMap = new Map(poList.map((x) => [x.id, x]));
      setSuppliers(supplierList);
      setPos(poList);
      setProducts((pr || []).sort((a, b) => a.name.localeCompare(b.name)));
      setAccounts(acc || []);
      setPurchaseItems(pi || []);
      setBrands(b || []);
      setItems(
        (r || [])
          .map((ret) => ({
            ...ret,
            suppliers: ret.supplier_id ? { name: supplierMap.get(ret.supplier_id)?.name } : null,
            purchase_orders: ret.purchase_id
              ? { po_number: poMap.get(ret.purchase_id)?.po_number }
              : null,
          }))
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      );
    } catch {
      setItems([]);
      setPos([]);
      setSuppliers([]);
      setProducts([]);
      setAccounts([]);
      setPurchaseItems([]);
      setBrands([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (data: any) => {
    try {
      const itemsList = Array.isArray(data.items) ? data.items : [data];
      const grandTotal = itemsList.reduce((s: number, it: any) => s + Number(it.quantity) * Number(it.unit_cost), 0);
      const isApproved = data.status === 'approved';
      const isCash = data.resolution === 'cash';
      const supplier = suppliers.find((s) => s.id === data.supplier_id);

      for (const item of itemsList) {
        const product = products.find((p) => p.id === item.product_id);
        const itemTotal = Number(item.quantity) * Number(item.unit_cost);
        const retNum = generateDocNumber('PR');

        const res = await api.post<any>('/api/data/purchase_returns', {
          return_number: retNum,
          purchase_id: data.purchase_id || null,
          supplier_id: data.supplier_id || null,
          product_id: item.product_id || null,
          product_name: product?.name || item.product_name,
          quantity: Number(item.quantity),
          unit_cost: Number(item.unit_cost),
          total_amount: itemTotal,
          reason: item.reason || data.reason || 'damaged',
          resolution: data.resolution || 'credit_note',
          refund_account: data.refund_account || 'cash',
          status: data.status || 'approved',
          note: data.note,
        });

        // 1. Deduct Product Stock & Log movement
        if (item.product_id && Number(item.quantity) > 0) {
          const prod = await api.get<any>(`/api/data/products/${item.product_id}`);
          if (prod) {
            await api.put(`/api/data/products/${item.product_id}`, {
              stock_quantity: Math.max(0, Number(prod.stock_quantity) - Number(item.quantity)),
            });
            await api.post('/api/data/stock_movements', {
              product_id: item.product_id,
              type: 'out',
              quantity: Number(item.quantity),
              reference_type: 'purchase_return',
              reference_id: res.id,
              note: `Purchase return ${retNum}`,
            });
          }
        }
      }

      // 2. Financial settlement if approved immediately
      if (isApproved && grandTotal > 0) {
        const po = pos.find((p) => p.id === data.purchase_id);
        const currentPoTotal = Number(po?.total || 0);
        const currentPaid = Number(po?.paid_amount || 0);
        const unpaidDebt = Math.max(0, currentPoTotal - currentPaid);
        const debtWiped = Math.min(grandTotal, unpaidDebt);
        const excessCredit = Math.max(0, grandTotal - unpaidDebt);

        const netKeptTotal = Math.max(0, currentPoTotal - grandTotal);
        const netAllocatedPaid = Math.min(currentPaid, netKeptTotal);
        const newPaymentStatus = (netKeptTotal <= netAllocatedPaid) ? 'paid' : (netAllocatedPaid > 0 ? 'partial' : 'unpaid');

        if (isCash) {
          // Cash Refund: Increment cash account balance and record transaction
          const targetAccount = data.refund_account || 'cash';
          const acc = accounts.find((a) => a.type === targetAccount);
          if (acc) {
            await api.put(`/api/data/payment_accounts/${acc.id}`, {
              balance: Number(acc.balance || 0) + grandTotal,
            });
          }
          await api.post('/api/data/transactions', {
            type: 'cash_in',
            account_type: targetAccount,
            amount: grandTotal,
            reference_type: 'purchase_return',
            reference_id: data.purchase_id || null,
            party_type: 'supplier',
            party_id: data.supplier_id || null,
            note: `Cash refund: PR (${supplier?.name || 'Supplier'}) on PO #${po?.po_number || ''}`,
            date: new Date().toISOString().slice(0, 10),
          });

          // Adjust PO total so it cleanly reflects returned items
          if (po) {
            await api.put(`/api/data/purchase_orders/${po.id}`, {
              total: netKeptTotal,
              paid_amount: netAllocatedPaid,
              payment_status: newPaymentStatus,
            });
          }
        } else {
          // Credit Note: Reduce supplier payable liability
          // IMPORTANT: Do NOT clamp with Math.max(0, ...)!
          // If return exceeds supplier payable balance, supplier balance becomes negative (meaning supplier owes refund to store / advance credit)
          if (data.supplier_id) {
            const sup = await api.get<any>(`/api/data/suppliers/${data.supplier_id}`);
            if (sup) {
              const newBal = Number(sup.balance || 0) - grandTotal;
              await api.put(`/api/data/suppliers/${data.supplier_id}`, {
                balance: newBal,
              });
            }
          }
          // Also adjust purchase order cleanly so due is never negative
          if (po) {
            await api.put(`/api/data/purchase_orders/${po.id}`, {
              total: netKeptTotal,
              paid_amount: netAllocatedPaid,
              payment_status: newPaymentStatus,
            });
          }

          // Record Credit Note transaction
          await api.post('/api/data/transactions', {
            type: 'credit_note',
            account_type: 'payable',
            amount: grandTotal,
            reference_type: 'purchase_return',
            reference_id: data.purchase_id || null,
            party_type: 'supplier',
            party_id: data.supplier_id || null,
            note: `Credit Note: PR (${supplier?.name || 'Supplier'}) on PO #${po?.po_number || ''} — Debt cancelled: ${formatCurrency(debtWiped, symbol)}${excessCredit > 0 ? `, Advance Credit owed by supplier: ${formatCurrency(excessCredit, symbol)}` : ''}`,
            date: new Date().toISOString().slice(0, 10),
          });
        }
      }

      notify(`Purchase return recorded successfully (${formatCurrency(grandTotal, symbol)})`, 'success');
      setShowForm(false);
      load();
    } catch {
      notify('Failed to create purchase return', 'error');
    }
  };

  // Approve pending return with Cash Refund
  const approveWithCash = async (item: any) => {
    try {
      const total = Number(item.total_amount || 0);
      const targetAccount = item.refund_account || 'cash';
      const acc = accounts.find((a) => a.type === targetAccount) || accounts.find((a) => a.type === 'cash');

      if (acc && total > 0) {
        await api.put(`/api/data/payment_accounts/${acc.id}`, {
          balance: Number(acc.balance || 0) + total,
        });
      }

      await api.post('/api/data/transactions', {
        type: 'cash_in',
        account_type: acc?.type || 'cash',
        amount: total,
        reference_type: 'purchase_return',
        reference_id: item.id,
        party_type: 'supplier',
        party_id: item.supplier_id || null,
        note: `Cash refund: PR ${item.return_number} (${item.suppliers?.name || 'Supplier'})`,
        date: new Date().toISOString().slice(0, 10),
      });

      await api.put(`/api/data/purchase_returns/${item.id}`, {
        status: 'approved',
        resolution: 'cash',
        refund_account: acc?.type || 'cash',
      });

      notify(`Cash refund of ${formatCurrency(total, symbol)} added to ${acc?.name || 'Cash'}`, 'success');
      setViewing(null);
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to approve return', 'error');
    }
  };

  // Approve pending return as Supplier Credit Note
  const approveWithCredit = async (item: any) => {
    try {
      const total = Number(item.total_amount || 0);
      if (item.supplier_id && total > 0) {
        const sup = await api.get<any>(`/api/data/suppliers/${item.supplier_id}`);
        if (sup) {
          await api.put(`/api/data/suppliers/${item.supplier_id}`, {
            balance: Number(sup.balance || 0) - total,
          });
        }
      }

      if (item.purchase_id && total > 0) {
        const po = await api.get<any>(`/api/data/purchase_orders/${item.purchase_id}`);
        if (po) {
          const currentPoTotal = Number(po.total || 0);
          const currentPaid = Number(po.paid_amount || 0);
          const netKeptTotal = Math.max(0, currentPoTotal - total);
          const netAllocatedPaid = Math.min(currentPaid, netKeptTotal);
          const newPaymentStatus = (netKeptTotal <= netAllocatedPaid) ? 'paid' : (netAllocatedPaid > 0 ? 'partial' : 'unpaid');
          await api.put(`/api/data/purchase_orders/${po.id}`, {
            total: netKeptTotal,
            paid_amount: netAllocatedPaid,
            payment_status: newPaymentStatus,
          });
        }
      }

      await api.put(`/api/data/purchase_returns/${item.id}`, {
        status: 'approved',
        resolution: 'credit_note',
      });

      notify(`Supplier balance credited by ${formatCurrency(total, symbol)}`, 'success');
      setViewing(null);
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to approve return', 'error');
    }
  };

  // Reject return and restore stock
  const rejectReturn = async (item: any) => {
    try {
      if (item.product_id && Number(item.quantity) > 0) {
        const prod = await api.get<any>(`/api/data/products/${item.product_id}`);
        if (prod) {
          await api.put(`/api/data/products/${item.product_id}`, {
            stock_quantity: Number(prod.stock_quantity) + Number(item.quantity),
          });
          await api.post('/api/data/stock_movements', {
            product_id: item.product_id,
            type: 'in',
            quantity: Number(item.quantity),
            reference_type: 'purchase_return_rejected',
            reference_id: item.id,
            note: `Restored: PR ${item.return_number} rejected`,
          });
        }
      }

      await api.put(`/api/data/purchase_returns/${item.id}`, {
        status: 'rejected',
      });

      notify('Return rejected and product stock restored', 'info');
      setViewing(null);
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to reject return', 'error');
    }
  };

  // Delete Return with complete reversal
  const deleteReturn = async (item: any) => {
    try {
      const total = Number(item.total_amount || 0);
      const isApproved = item.status === 'approved';

      // 1. Restore product stock
      if (item.product_id && Number(item.quantity) > 0 && item.status !== 'rejected') {
        const prod = await api.get<any>(`/api/data/products/${item.product_id}`);
        if (prod) {
          await api.put(`/api/data/products/${item.product_id}`, {
            stock_quantity: Number(prod.stock_quantity) + Number(item.quantity),
          });
        }
      }

      // 2. Reverse finances if approved
      if (isApproved && total > 0) {
        if (item.resolution === 'cash') {
          // Re-deduct from cash
          const accType = item.refund_account || 'cash';
          const acc = accounts.find((a) => a.type === accType) || accounts.find((a) => a.type === 'cash');
          if (acc) {
            await api.put(`/api/data/payment_accounts/${acc.id}`, {
              balance: Math.max(0, Number(acc.balance || 0) - total),
            });
          }
          // Remove transaction
          const txs = await api.get<any[]>('/api/data/transactions');
          const match = (txs || []).find((t) => t.reference_type === 'purchase_return' && t.reference_id === item.id);
          if (match) {
            await api.delete(`/api/data/transactions/${match.id}`);
          }
        } else if (item.resolution === 'credit_note') {
          // Restore supplier payable balance
          if (item.supplier_id) {
            const sup = await api.get<any>(`/api/data/suppliers/${item.supplier_id}`);
            if (sup) {
              await api.put(`/api/data/suppliers/${item.supplier_id}`, {
                balance: Number(sup.balance || 0) + total,
              });
            }
          }
          if (item.purchase_id) {
            const po = await api.get<any>(`/api/data/purchase_orders/${item.purchase_id}`);
            if (po) {
              const restoredTotal = Number(po.total || 0) + total;
              const currentPaid = Number(po.paid_amount || 0);
              const restoredStatus = currentPaid >= restoredTotal ? 'paid' : currentPaid > 0 ? 'partial' : 'unpaid';
              await api.put(`/api/data/purchase_orders/${po.id}`, {
                total: restoredTotal,
                payment_status: restoredStatus,
              });
            }
          }
        }
      }

      await api.delete(`/api/data/purchase_returns/${item.id}`);
      notify('Purchase return deleted and balances/stock reversed', 'success');
      setDeleteTarget(null);
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to delete return', 'error');
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Purchase Returns" />
        <Spinner />
      </div>
    );
  }

  const q = search.toLowerCase().trim();
  const filtered = items.filter(
    (r) =>
      (!q ||
      r.return_number?.toLowerCase().includes(q) ||
      r.suppliers?.name?.toLowerCase().includes(q) ||
      r.product_name?.toLowerCase().includes(q)) &&
      isWithinDateRange(r.created_at, dateFilter)
  );
  const totalAmount = filtered.reduce((s, r) => s + Number(r.total_amount || 0), 0);

  return (
    <div>
      <PageHeader
        title="Purchase Returns"
        subtitle={`${formatCurrency(totalAmount, symbol)} total returns`}
        actions={
          <Button icon={<Plus size={18} />} onClick={() => setShowForm(true)}>
            Add Return
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search return #, supplier or product..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </div>
        <DateTimeFilter value={dateFilter} onChange={setDateFilter} />
      </div>

      <div className="mb-2 flex items-center justify-between text-xs text-slate-500 px-1">
        <span>Showing <strong className="text-slate-700">{filtered.length}</strong> of <strong className="text-slate-700">{items.length}</strong> purchase returns</span>
        {filtered.length > 0 && (
          <span>Total: <strong className="text-indigo-600 font-semibold">{formatCurrency(totalAmount, symbol)}</strong></span>
        )}
      </div>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<RotateCcw size={32} />}
            title="No purchase returns"
            description="Returns recorded to suppliers will appear here."
            action={
              <Button icon={<Plus size={18} />} onClick={() => setShowForm(true)}>
                Add Return
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Return #</th>
                  <th>Supplier</th>
                  <th>Product</th>
                  <th>Qty</th>
                  <th>Amount</th>
                  <th>Resolution</th>
                  <th>Status</th>
                  <th>Date & Time</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const isPending = r.status === 'pending';
                  return (
                    <tr key={r.id}>
                      <td className="font-semibold text-slate-800">{r.return_number}</td>
                      <td>{r.suppliers?.name || '—'}</td>
                      <td>{r.product_name}</td>
                      <td className="font-medium">{r.quantity}</td>
                      <td className="font-bold text-slate-800">{formatCurrency(r.total_amount, symbol)}</td>
                      <td>
                        <Badge variant={r.resolution === 'cash' ? 'green' : 'blue'}>
                          {r.resolution === 'cash' ? 'Cash Refund' : 'Credit Note'}
                        </Badge>
                      </td>
                      <td>
                        <Badge
                          variant={
                            r.status === 'approved'
                              ? 'green'
                              : r.status === 'rejected'
                              ? 'red'
                              : 'amber'
                          }
                        >
                          {r.status}
                        </Badge>
                      </td>
                      <td className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                      <td>
                        <div className="flex justify-end items-center gap-1">
                          <button
                            onClick={() => setViewing(r)}
                            title="View Return Details"
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                          >
                            <Eye size={16} />
                          </button>

                          {isPending && (
                            <>
                              <button
                                onClick={() => approveWithCash(r)}
                                title="Approve & Receive Cash Refund"
                                className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                              >
                                <DollarSign size={16} />
                              </button>
                              <button
                                onClick={() => approveWithCredit(r)}
                                title="Approve as Supplier Credit Note"
                                className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50"
                              >
                                <CreditCard size={16} />
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => setDeleteTarget(r)}
                            title="Delete Return"
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 size={16} />
                          </button>
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

      <ReturnForm
        open={showForm}
        onClose={() => setShowForm(false)}
        onCreate={create}
        pos={pos}
        suppliers={suppliers}
        products={products}
        accounts={accounts}
        purchaseItems={purchaseItems}
        existingReturns={items}
        brands={brands}
        symbol={symbol}
      />

      {/* Viewing Return Details Modal */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `Purchase Return ${viewing.return_number}` : ''}
        size="md"
        footer={
          <div className="flex w-full justify-between items-center">
            <div>
              {viewing?.status === 'pending' && (
                <div className="flex gap-2">
                  <Button variant="success" icon={<DollarSign size={16} />} onClick={() => approveWithCash(viewing)}>
                    Receive Cash
                  </Button>
                  <Button variant="outline" icon={<CreditCard size={16} />} onClick={() => approveWithCredit(viewing)}>
                    Credit Note
                  </Button>
                  <Button variant="danger" icon={<XCircle size={16} />} onClick={() => rejectReturn(viewing)}>
                    Reject
                  </Button>
                </div>
              )}
            </div>
            <Button onClick={() => setViewing(null)}>Close</Button>
          </div>
        }
      >
        {viewing && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-400 font-medium">Supplier</p>
                <p className="font-semibold text-slate-800">{viewing.suppliers?.name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Date & Time</p>
                <p className="font-semibold text-slate-800">{formatDateTime(viewing.created_at)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Product</p>
                <p className="font-semibold text-slate-800">{viewing.product_name}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Quantity Returned</p>
                <p className="font-semibold text-slate-800">{viewing.quantity} cartons</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Unit Cost</p>
                <p className="font-medium text-slate-700">{formatCurrency(viewing.unit_cost, symbol)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Return Reason</p>
                <p className="font-medium capitalize text-slate-700">{viewing.reason?.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Resolution</p>
                <Badge variant={viewing.resolution === 'cash' ? 'green' : 'blue'}>
                  {viewing.resolution === 'cash' ? 'Cash Refund' : 'Supplier Credit'}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Current Status</p>
                <Badge
                  variant={
                    viewing.status === 'approved'
                      ? 'green'
                      : viewing.status === 'rejected'
                      ? 'red'
                      : 'amber'
                  }
                >
                  {viewing.status}
                </Badge>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 p-4 border border-slate-200">
              <div className="flex justify-between items-center text-base">
                <span className="text-slate-600 font-medium">Total Refund Value:</span>
                <span className="font-bold text-slate-900 text-lg">
                  {formatCurrency(viewing.total_amount, symbol)}
                </span>
              </div>
            </div>

            {viewing.note && (
              <div className="rounded-lg bg-slate-50/80 p-3 text-xs text-slate-600">
                <span className="font-semibold text-slate-700">Note: </span>
                {viewing.note}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteReturn(deleteTarget)}
        title="Delete Purchase Return"
        message={
          deleteTarget
            ? `Delete return ${deleteTarget.return_number}? Product stock and financial balances will be automatically restored.`
            : ''
        }
        confirmLabel="Delete Return"
        danger
      />
    </div>
  );
}

interface PurchaseItemRowState {
  item_id: string;
  product_id: string;
  product_name: string;
  unit_cost: number;
  unit: string;
  purchasedQty: number;
  alreadyReturned: number;
  remainingReturnable: number;
  selected: boolean;
  returnQty: number;
  reason: string;
}

function ReturnForm({
  open,
  onClose,
  onCreate,
  pos,
  suppliers,
  products,
  accounts,
  purchaseItems,
  existingReturns,
  brands = [],
  symbol,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (d: any) => void;
  pos: any[];
  suppliers: any[];
  products: any[];
  accounts: any[];
  purchaseItems: any[];
  existingReturns: any[];
  brands?: any[];
  symbol: string;
}) {
  const [purchaseId, setPurchaseId] = useState('');
  const [resolution, setResolution] = useState('credit_note');
  const [refundAccount, setRefundAccount] = useState('cash');
  const [status, setStatus] = useState('approved');
  const [note, setNote] = useState('');
  const [rowStates, setRowStates] = useState<PurchaseItemRowState[]>([]);

  // Selected PO & Supplier
  const selectedPo = useMemo(() => pos.find((p) => p.id === purchaseId), [pos, purchaseId]);
  const selectedSupplier = useMemo(
    () => suppliers.find((s) => s.id === selectedPo?.supplier_id),
    [suppliers, selectedPo]
  );

  // Reset when opened
  useEffect(() => {
    if (open) {
      setPurchaseId('');
      setResolution('credit_note');
      setRefundAccount('cash');
      setStatus('approved');
      setNote('');
      setRowStates([]);
    }
  }, [open]);

  // Synchronize rows when purchaseId changes: strictly show ONLY products on that PO!
  useEffect(() => {
    if (!purchaseId) {
      setRowStates([]);
      return;
    }

    const itemsOnPo = purchaseItems.filter((it) => it.purchase_id === purchaseId);

    const rows: PurchaseItemRowState[] = itemsOnPo.map((it) => {
      const prod = products.find((p) => p.id === it.product_id);
      const purchasedQty = Number(it.quantity || 0);

      const alreadyReturned = existingReturns
        .filter(
          (r) =>
            r.purchase_id === purchaseId &&
            (r.product_id === it.product_id || r.product_name === prod?.name) &&
            r.status !== 'rejected'
        )
        .reduce((sum, r) => sum + Number(r.quantity || 0), 0);

      const remainingReturnable = Math.max(0, purchasedQty - alreadyReturned);

      return {
        item_id: it.id,
        product_id: it.product_id,
        product_name: prod?.name || 'Product',
        unit_cost: Number(it.unit_cost || prod?.purchase_price || 0),
        unit: prod?.unit || 'carton',
        purchasedQty,
        alreadyReturned,
        remainingReturnable,
        selected: false,
        returnQty: remainingReturnable > 0 ? remainingReturnable : 0,
        reason: 'damaged',
      };
    });

    setRowStates(rows);

    // Auto-select resolution: if supplier has payable balance, default to credit_note
    const sup = suppliers.find((s) => s.id === selectedPo?.supplier_id);
    if (Number(sup?.balance || 0) > 0) {
      setResolution('credit_note');
    } else {
      setResolution('cash');
    }
  }, [purchaseId, purchaseItems, products, existingReturns, suppliers, selectedPo]);

  // Toggle selection
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

  // Change Return Quantity
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

  // Change Reason
  const handleReasonChange = (itemId: string, newReason: string) => {
    setRowStates((prev) =>
      prev.map((r) => (r.item_id === itemId ? { ...r, reason: newReason } : r))
    );
  };

  // Select All / Return Whole PO
  const selectAll = () => {
    setRowStates((prev) =>
      prev.map((r) => ({
        ...r,
        selected: r.remainingReturnable > 0,
        returnQty: r.remainingReturnable,
      }))
    );
  };

  // Deselect All
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
    () => selectedRows.reduce((sum, r) => sum + r.returnQty * r.unit_cost, 0),
    [selectedRows]
  );
  const totalReturnUnits = useMemo(
    () => selectedRows.reduce((sum, r) => sum + r.returnQty, 0),
    [selectedRows]
  );

  const canSubmit = purchaseId && selectedRows.length > 0 && totalReturnAmount > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;

    const payloadItems = selectedRows.map((r) => ({
      product_id: r.product_id,
      product_name: r.product_name,
      quantity: r.returnQty,
      unit_cost: r.unit_cost,
      total_amount: r.returnQty * r.unit_cost,
      reason: r.reason,
    }));

    onCreate({
      purchase_id: purchaseId,
      supplier_id: selectedSupplier?.id || null,
      items: payloadItems,
      resolution,
      refund_account: refundAccount,
      status,
      note,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Purchase Return"
      size="xl"
      className="my-1 sm:my-2"
      bodyClassName="px-4 py-3"
      footer={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-500">
            {selectedRows.length > 0 ? (
              <span>
                <strong>{selectedRows.length}</strong> product(s) selected ({totalReturnUnits} cartons) · Return Value:{' '}
                <strong className="text-emerald-700 font-bold">{formatCurrency(totalReturnAmount, symbol)}</strong>
              </span>
            ) : (
              <span>No products selected for return</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit}
              icon={<CheckCircle2 size={16} />}
            >
              Confirm Return ({formatCurrency(totalReturnAmount, symbol)})
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Select Purchase Order */}
        <Field label="Select Purchase Order (Shows Only Products Purchased on this PO)">
          <SearchableSelect
            value={purchaseId}
            onChange={(val) => setPurchaseId(val)}
            options={pos.map((p) => ({
              value: p.id,
              label: `${p.po_number} — ${p.suppliers?.name || 'Supplier'} (${formatCurrency(p.total, symbol)}) [${formatDate(p.created_at)}]`,
              searchText: `${p.po_number} ${p.suppliers?.name || ''}`,
            }))}
            placeholder="Search PO # or supplier name..."
          />
        </Field>

        {/* Supplier & PO Overview Card */}
        {selectedPo && (
          <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-amber-50/30 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800 text-sm">
                    {selectedSupplier?.name || 'Supplier'}
                  </span>
                  <Badge variant="blue">Purchase Order #{selectedPo.po_number}</Badge>
                </div>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  PO Date: {formatDate(selectedPo.created_at)}
                  {selectedSupplier?.phone && ` · Contact: ${selectedSupplier.phone}`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-sm transition-colors"
                >
                  <CheckSquare size={14} />
                  Return Whole Purchase Order (Select All)
                </button>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs hover:bg-slate-100 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Financial Status Chips */}
            {(() => {
              const poTotal = Number(selectedPo.total || 0);
              const poPaid = Number(selectedPo.paid_amount || 0);
              const poUnpaid = Math.max(0, poTotal - poPaid);
              const debtWiped = Math.min(totalReturnAmount, poUnpaid);
              const excessCredit = Math.max(0, totalReturnAmount - poUnpaid);
              const supBal = Number(selectedSupplier?.balance || 0);

              return (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-slate-400 block text-[10px] font-semibold uppercase">PO Total Cost</span>
                      <span className="font-bold text-slate-800 text-sm">{formatCurrency(poTotal, symbol)}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-slate-400 block text-[10px] font-semibold uppercase">Paid on this PO</span>
                      <span className="font-bold text-emerald-600 text-sm">{formatCurrency(poPaid, symbol)}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-slate-400 block text-[10px] font-semibold uppercase">Unpaid PO Debt</span>
                      <span className={cn('font-bold text-sm', poUnpaid > 0 ? 'text-amber-600' : 'text-slate-600')}>
                        {poUnpaid > 0 ? formatCurrency(poUnpaid, symbol) : '0 (Settled)'}
                      </span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-slate-400 block text-[10px] font-semibold uppercase">Supplier Ledger</span>
                      <span className={cn('font-bold text-sm', supBal > 0 ? 'text-rose-600' : supBal < 0 ? 'text-emerald-600' : 'text-slate-600')}>
                        {supBal > 0
                          ? `${formatCurrency(supBal, symbol)} (Payable)`
                          : supBal < 0
                          ? `${formatCurrency(Math.abs(supBal), symbol)} (Credit Owed)`
                          : 'Clear (Rs 0)'}
                      </span>
                    </div>
                  </div>

                  {/* Live Settlement Breakdown Advisory */}
                  {totalReturnAmount > 0 ? (
                    resolution === 'credit_note' ? (
                      totalReturnAmount <= poUnpaid ? (
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-900">
                          <Info size={16} className="shrink-0 text-amber-600 mt-0.5" />
                          <div>
                            <strong>Credit Note Settlement:</strong> Returning items worth{' '}
                            <strong>{formatCurrency(totalReturnAmount, symbol)}</strong> will reduce your unpaid PO debt from{' '}
                            {formatCurrency(poUnpaid, symbol)} down to{' '}
                            <strong>{formatCurrency(poUnpaid - totalReturnAmount, symbol)}</strong>. Supplier liability will be reduced accordingly.
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-300 rounded-lg p-3 text-xs text-emerald-900">
                          <CheckCircle2 size={18} className="shrink-0 text-emerald-600 mt-0.5" />
                          <div>
                            <p className="font-bold text-emerald-800 text-sm">Full Debt Cancellation + Supplier Refund Due</p>
                            <p className="mt-0.5">
                              • <strong>{formatCurrency(debtWiped, symbol)}</strong> completely clears your remaining PO debt (PO marked Settled).
                            </p>
                            <p className="mt-0.5">
                              • The remaining <strong>{formatCurrency(excessCredit, symbol)}</strong> will be recorded as an{' '}
                              <strong>Advance Credit / Refund Due</strong> from {selectedSupplier?.name || 'Supplier'}.
                            </p>
                            <p className="mt-1 text-[11px] text-emerald-700">
                              💡 You can collect this {formatCurrency(excessCredit, symbol)} in cash via Pending Payments, or apply it to your next purchase!
                            </p>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="flex items-start gap-2 bg-sky-50 border border-sky-200 rounded-lg p-2.5 text-xs text-sky-900">
                        <Info size={16} className="shrink-0 text-sky-600 mt-0.5" />
                        <div>
                          <strong>Immediate Cash Refund:</strong> You are receiving{' '}
                          <strong>{formatCurrency(totalReturnAmount, symbol)}</strong> cash immediately from the supplier. This will be deposited into your{' '}
                          <strong>{refundAccount}</strong> account.
                        </div>
                      </div>
                    )
                  ) : supBal > 0 ? (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-800">
                      <Info size={16} className="shrink-0 text-amber-600 mt-0.5" />
                      <span>
                        <strong>Supplier Balance Payable:</strong> You have an outstanding liability with{' '}
                        <strong>{selectedSupplier?.name}</strong>. Returning items under <strong>Credit Note</strong> will automatically reduce this balance!
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-xs text-emerald-800">
                      <Info size={16} className="shrink-0 text-emerald-600 mt-0.5" />
                      <span>
                        <strong>Supplier Cleared:</strong> You can receive a <strong>Cash Refund</strong> into your payment drawer or record a{' '}
                        <strong>Credit Note</strong> for future purchases.
                      </span>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* PO Products Table: Only products on this PO are shown */}
        {purchaseId ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Products Purchased on this PO ({rowStates.length})
              </h4>
              <span className="text-xs text-slate-500">
                Select products to return and adjust return quantities:
              </span>
            </div>

            {rowStates.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800 text-center">
                No items recorded on this purchase order.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3 w-8"></th>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3 text-center">Purchased</th>
                      <th className="py-2.5 px-3 text-center">Prev. Returned</th>
                      <th className="py-2.5 px-3 text-center">Returnable</th>
                      <th className="py-2.5 px-3 text-right">Unit Cost</th>
                      <th className="py-2.5 px-3 w-44 text-center">Return Qty</th>
                      <th className="py-2.5 px-3 w-36">Return Reason</th>
                      <th className="py-2.5 px-3 text-right">Refund Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {rowStates.map((row) => {
                      const isFullyReturned = row.remainingReturnable <= 0;
                      const lineTotal = row.returnQty * row.unit_cost;

                      // Find product photo or brand logo
                      const prodInfo = products.find((p) => p.id === row.product_id);
                      const brandInfo = brands.find((b) => b.id === prodInfo?.brand_id);
                      const photoUrl = resolveImageUrl(prodInfo?.image_url) || resolveImageUrl(brandInfo?.logo_url);

                      return (
                        <tr
                          key={row.item_id}
                          className={cn(
                            'transition-colors',
                            row.selected ? 'bg-amber-50/60' : 'hover:bg-slate-50/60',
                            isFullyReturned && 'opacity-50 bg-slate-50 cursor-not-allowed'
                          )}
                        >
                          {/* Checkbox */}
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              disabled={isFullyReturned}
                              onChange={() => toggleSelect(row.item_id)}
                              className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer disabled:cursor-not-allowed"
                            />
                          </td>

                          {/* Product Thumbnail & Name */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center">
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
                                  <Package size={16} className="text-slate-400" />
                                )}
                              </div>
                              <div>
                                <span className="font-semibold text-slate-800 block leading-tight">{row.product_name}</span>
                                <span className="text-[11px] text-slate-400 capitalize">
                                  {brandInfo?.name ? `${brandInfo.name} · ` : ''}{row.unit}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Purchased Qty */}
                          <td className="py-2.5 px-3 text-center font-medium text-slate-700">
                            {row.purchasedQty} {row.unit}
                          </td>

                          {/* Prev Returned */}
                          <td className="py-2.5 px-3 text-center text-rose-600 font-medium">
                            {row.alreadyReturned} {row.unit}
                          </td>

                          {/* Available Returnable */}
                          <td className="py-2.5 px-3 text-center">
                            {isFullyReturned ? (
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                                Fully Returned
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {row.remainingReturnable} {row.unit}
                              </span>
                            )}
                          </td>

                          {/* Unit Cost */}
                          <td className="py-2.5 px-3 text-right font-medium text-slate-700">
                            {formatCurrency(row.unit_cost, symbol)}
                          </td>

                          {/* Return Qty Stepper Controls */}
                          <td className="py-2 px-3">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                disabled={isFullyReturned || row.returnQty <= 0}
                                onClick={() => handleQtyChange(row.item_id, Math.max(0, row.returnQty - 1))}
                                className="h-6 w-6 flex items-center justify-center rounded border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Decrease by 1"
                              >
                                <Minus size={12} />
                              </button>
                              <input
                                type="number"
                                min={0}
                                max={row.remainingReturnable}
                                value={row.returnQty || ''}
                                disabled={isFullyReturned}
                                onChange={(e) => handleQtyChange(row.item_id, Number(e.target.value))}
                                className={cn(
                                  'w-14 rounded-md border text-center py-1 font-bold text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/20',
                                  row.selected ? 'border-amber-400 bg-white text-slate-800' : 'border-slate-300 bg-slate-50 text-slate-400'
                                )}
                              />
                              <button
                                type="button"
                                disabled={isFullyReturned || row.returnQty >= row.remainingReturnable}
                                onClick={() => handleQtyChange(row.item_id, Math.min(row.remainingReturnable, row.returnQty + 1))}
                                className="h-6 w-6 flex items-center justify-center rounded border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Increase by 1"
                              >
                                <Plus size={12} />
                              </button>
                              <button
                                type="button"
                                disabled={isFullyReturned}
                                onClick={() => handleQtyChange(row.item_id, row.remainingReturnable)}
                                className="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-amber-100 hover:bg-amber-200 text-amber-800 border border-amber-200 disabled:opacity-30"
                                title="Set to Max Returnable"
                              >
                                Max
                              </button>
                            </div>
                          </td>

                          {/* Reason */}
                          <td className="py-2 px-3">
                            <select
                              value={row.reason}
                              disabled={isFullyReturned || !row.selected}
                              onChange={(e) => handleReasonChange(row.item_id, e.target.value)}
                              className="w-full rounded-md border border-slate-300 bg-white p-1 text-xs text-slate-700 focus:border-amber-500 focus:outline-none disabled:bg-slate-100"
                            >
                              <option value="damaged">Damaged Goods</option>
                              <option value="expired">Expired Goods</option>
                              <option value="wrong_supply">Wrong Supply</option>
                              <option value="short_expiry">Short Expiry</option>
                            </select>
                          </td>

                          {/* Line Total */}
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            {formatCurrency(lineTotal, symbol)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Live Summary Bar */}
            <div className="flex flex-wrap items-center justify-between rounded-xl bg-slate-900 text-white p-4 shadow-sm mt-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Purchase Return</p>
                <p className="text-xs text-slate-300 mt-0.5">
                  {selectedRows.length} item(s) selected ({totalReturnUnits} cartons)
                </p>
              </div>
              <div className="text-right">
                <span className="text-2xl font-bold text-amber-400">{formatCurrency(totalReturnAmount, symbol)}</span>
              </div>
            </div>

            {/* Financial Settlement Configuration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <Field label="Resolution (Settlement Method)">
                <Select value={resolution} onChange={(e) => setResolution(e.target.value)}>
                  <option value="credit_note">Credit Note (Deduct from Supplier Balance)</option>
                  <option value="cash">Cash Refund (Deposit into Account)</option>
                </Select>
              </Field>

              {resolution === 'cash' ? (
                <Field label="Deposit Refund Into Account">
                  <Select value={refundAccount} onChange={(e) => setRefundAccount(e.target.value)}>
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
                    <option value="approved">Approved & Deduct Supplier Balance Immediately</option>
                    <option value="pending">Pending Review</option>
                  </Select>
                </Field>
              )}
            </div>

            {resolution === 'cash' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Return Status">
                  <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="approved">Approved & Deposit Cash Immediately</option>
                    <option value="pending">Pending Review</option>
                  </Select>
                </Field>
                <Field label="Note / Reference">
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. Return of damaged or expired batch"
                  />
                </Field>
              </div>
            )}

            {resolution !== 'cash' && (
              <Field label="Note / Reference">
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Return of damaged or expired batch"
                />
              </Field>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center bg-slate-50/50">
            <Package size={36} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-semibold text-slate-700">Please Select a Purchase Order</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              Select the purchase order above to automatically view only the products purchased on that order and their returnable limits.
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
