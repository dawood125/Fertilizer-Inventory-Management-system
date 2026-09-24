import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { api } from '@/lib/api';
import type { Customer, Route as RouteType, SalesRep } from '@/lib/types';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/Button';
import { Field, Input, Textarea, Select } from '@/components/Form';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal, ConfirmModal } from '@/components/Modal';
import { formatCurrency, formatDate, formatDateTime, generateDocNumber, cn } from '@/lib/utils';
import { parseCsv, generateCsv, downloadCsv, CUSTOMER_CSV_HEADERS, CUSTOMER_CSV_SAMPLE_ROWS } from '@/lib/csv';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Users,
  Phone,
  Mail,
  MapPin,
  X,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

export function Customers() {
  const { symbol } = useSettings();
  const { notify } = useToast();
  const [customers, setCustomers] = useState<any[]>([]);
  const [routes, setRoutes] = useState<RouteType[]>([]);
  const [reps, setSalesReps] = useState<SalesRep[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, r, s] = await Promise.all([
        api.get<Customer[]>('/api/data/customers'),
        api.get<RouteType[]>('/api/data/routes'),
        api.get<SalesRep[]>('/api/data/sales_reps'),
      ]);
      const routeList = (r || []).sort((a, b) => a.name.localeCompare(b.name));
      const repsList = (s || []).sort((a, b) => a.name.localeCompare(b.name));
      const routeMap = new Map(routeList.map((x) => [x.id, x]));
      const repMap = new Map(repsList.map((x) => [x.id, x]));
      setRoutes(routeList);
      setSalesReps(repsList);
      setCustomers(
        (c || [])
          .map((cust) => ({
            ...cust,
            routes: cust.route_id ? { name: routeMap.get(cust.route_id)?.name || '' } : null,
            sales_reps: cust.sales_rep_id ? { name: repMap.get(cust.sales_rep_id)?.name || '' } : null,
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch {
      setCustomers([]);
      setRoutes([]);
      setSalesReps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const areaOptions = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      const a = (c.area || '').trim();
      if (a) set.add(a);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [customers]);

  const hasNoArea = useMemo(() => {
    return customers.some((c) => !(c.area || '').trim());
  }, [customers]);

  const customerTypes = useMemo(() => {
    const defaults = ['retailer', 'wholesaler', 'dealer'];
    const set = new Set<string>(defaults);
    customers.forEach((c) => {
      const t = (c.type || '').trim().toLowerCase();
      if (t) set.add(t);
    });
    return Array.from(set);
  }, [customers]);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase().trim();
    const matchSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.phone?.toLowerCase().includes(q) ||
      c.owner_name?.toLowerCase().includes(q) ||
      c.area?.toLowerCase().includes(q) ||
      c.cnic?.toLowerCase().includes(q) ||
      c.ntn?.toLowerCase().includes(q);

    const matchType = typeFilter === 'all' || (c.type || '').toLowerCase() === typeFilter.toLowerCase();

    const area = (c.area || '').trim().toLowerCase();
    const matchArea =
      areaFilter === 'all' ||
      (areaFilter === '__none__' ? !area : area === areaFilter.toLowerCase());

    return matchSearch && matchType && matchArea;
  });

  const openView = async (c: any) => {
    try {
      const [allOrders, allPayments] = await Promise.all([
        api.get<any[]>('/api/data/orders'),
        api.get<any[]>('/api/data/order_payments'),
      ]);
      const orderList = (allOrders || [])
        .filter((o) => o.customer_id === c.id)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, 50);
      const orderIds = new Set(orderList.map((o) => o.id));
      const paymentList = (allPayments || []).filter((p) => orderIds.has(p.order_id));
      setViewing({ customer: c, orders: orderList, payments: paymentList });
    } catch {
      setViewing({ customer: c, orders: [], payments: [] });
    }
  };

  const save = async (data: any) => {
    try {
      const { routes: _r, sales_reps: _s, ...clean } = data;
      const openingDue = Math.max(0, Number(clean.opening_balance || 0));
      const payload = {
        ...clean,
        opening_balance: openingDue,
        balance: !editing ? openingDue : (clean.balance ?? openingDue),
        route_id: clean.route_id || null,
        sales_rep_id: clean.sales_rep_id || null,
      };

      if (editing) {
        await api.put(`/api/data/customers/${editing.id}`, payload);
        notify('Customer updated', 'success');
      } else {
        const createdCustomer = await api.post<any>('/api/data/customers', payload);
        // Automatically generate initial invoice and pending receivable if opening balance > 0
        if (openingDue > 0 && createdCustomer?.id) {
          const orderNum = generateDocNumber('OB');
          const invNum = generateDocNumber('INV');
          const order = await api.post<any>('/api/data/orders', {
            order_number: orderNum,
            invoice_number: invNum,
            customer_id: createdCustomer.id,
            subtotal: openingDue,
            discount: 0,
            tax: 0,
            total: openingDue,
            paid_amount: 0,
            status: 'completed',
            payment_status: 'unpaid',
            note: 'Initial Opening Balance / Previous Pending Due',
            sales_rep_id: clean.sales_rep_id || null,
            route_id: clean.route_id || null,
          });
          await api.post('/api/data/order_items', {
            order_id: order.id,
            product_id: null,
            product_name: 'Opening Balance / Previous Pending Due',
            quantity: 1,
            unit_price: openingDue,
            discount: 0,
            tax: 0,
            total: openingDue,
            free_items: 0,
            unit: 'balance',
            cost_price: 0,
            total_cost: 0,
          });
          notify(`Customer added with initial pending invoice of ${formatCurrency(openingDue, symbol)}`, 'success');
        } else {
          notify('Customer added', 'success');
        }
      }
      setShowForm(false);
      setEditing(null);
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to save customer', 'error');
    }
  };

  const remove = async (c: Customer) => {
    try {
      await api.delete(`/api/data/customers/${c.id}`);
      notify('Customer deleted', 'success');
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to delete customer', 'error');
    }
  };

  if (loading) return <div><PageHeader title="Customers" /><Spinner /></div>;

  const typeVariant: Record<string, 'blue' | 'amber' | 'green'> = { retailer: 'blue', wholesaler: 'amber', dealer: 'green' };

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={
          filtered.length === customers.length
            ? `${customers.length} customers registered`
            : `Showing ${filtered.length} of ${customers.length} customers (filtered)`
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              icon={<Upload size={16} />}
              onClick={() => setShowCsvModal(true)}
            >
              Import CSV
            </Button>
            <Button
              icon={<Plus size={18} />}
              onClick={() => { setEditing(null); setShowForm(true); }}
            >
              Add Customer
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by business name, owner, area, phone, or NTN..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Area Filter */}
          <div className="relative min-w-[150px]">
            <MapPin size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            >
              <option value="all">All Areas ({areaOptions.length})</option>
              {areaOptions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
              {hasNoArea && <option value="__none__">No Area Set</option>}
            </select>
          </div>

          {/* Customer Type Filter */}
          <div className="relative min-w-[160px]">
            <Users size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-8 text-sm text-slate-700 capitalize focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
            >
              <option value="all">All Customer Types</option>
              {customerTypes.map((t) => (
                <option key={t} value={t} className="capitalize">
                  {t === 'retailer' ? 'Retailer' : t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Clear Filters Button */}
          {(areaFilter !== 'all' || typeFilter !== 'all' || search) && (
            <button
              onClick={() => {
                setAreaFilter('all');
                setTypeFilter('all');
                setSearch('');
              }}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition"
              title="Reset all filters"
            >
              <X size={14} />
              Clear
            </button>
          )}
        </div>
      </div>

      <Card>
        {filtered.length === 0 ? (
          customers.length === 0 ? (
            <EmptyState
              icon={<Users size={32} />}
              title="No customers yet"
              description="Add your first customer or import your customer list from CSV."
              action={
                <div className="flex gap-2">
                  <Button variant="outline" icon={<Upload size={16} />} onClick={() => setShowCsvModal(true)}>Import CSV</Button>
                  <Button icon={<Plus size={18} />} onClick={() => setShowForm(true)}>Add Customer</Button>
                </div>
              }
            />
          ) : (
            <EmptyState
              icon={<Users size={32} />}
              title="No matching customers"
              description="No customers found matching the search or filters"
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setAreaFilter('all');
                    setTypeFilter('all');
                    setSearch('');
                  }}
                >
                  Clear Filters
                </Button>
              }
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="p-3">Customer / Business</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Owner</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Area</th>
                  <th className="p-3">Route</th>
                  <th className="p-3">Balance</th>
                  <th className="p-3">Credit Limit</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3 font-medium text-slate-800">
                      <div>{c.name}</div>
                      {c.ntn && <span className="text-[11px] text-slate-400">NTN: {c.ntn}</span>}
                    </td>
                    <td className="p-3"><Badge variant={typeVariant[c.type] || 'gray'}>{c.type === 'retailer' ? 'Retailer' : c.type}</Badge></td>
                    <td className="p-3 text-slate-600">{c.owner_name || '—'}</td>
                    <td className="p-3 text-slate-600 font-mono text-xs">{c.phone || '—'}</td>
                    <td className="p-3 text-slate-600">{c.area || '—'}</td>
                    <td className="p-3 text-slate-600">{c.routes?.name || '—'}</td>
                    <td className="p-3">
                      {Number(c.balance) > 0 ? (
                        <Badge variant="red">{formatCurrency(c.balance, symbol)} (Due)</Badge>
                      ) : Number(c.balance) < 0 ? (
                        <Badge variant="green">Store Credit: {formatCurrency(Math.abs(c.balance), symbol)}</Badge>
                      ) : (
                        <Badge variant="green">Clear</Badge>
                      )}
                    </td>
                    <td className="p-3 text-slate-600">{c.credit_limit ? formatCurrency(c.credit_limit, symbol) : '—'}</td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openView(c)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="View Profile & Invoices"><Eye size={16} /></button>
                        <button onClick={() => { setEditing(c); setShowForm(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" title="Edit"><Pencil size={16} /></button>
                        <button onClick={() => setDeleteTarget(c)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="Delete"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CustomerForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        onSave={save}
        editing={editing}
        routes={routes}
        reps={reps}
      />

      <CustomerCsvImportModal
        open={showCsvModal}
        onClose={() => setShowCsvModal(false)}
        onSuccess={() => { setShowCsvModal(false); load(); }}
        routes={routes}
        reps={reps}
      />

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove(deleteTarget)}
        title="Delete Customer"
        message={`Delete ${deleteTarget?.name}? All orders will be retained.`}
        confirmLabel="Delete"
        danger
      />

      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Customer Profile" size="xl">
        {viewing && (
          <div>
            <div className="mb-5 flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-100 text-sky-700"><Users size={28} /></div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-800">{viewing.customer.name}</h3>
                <div className="mt-1 flex flex-wrap gap-3 text-sm text-slate-500">
                  <Badge variant="blue">{viewing.customer.type === 'retailer' ? 'Retailer' : viewing.customer.type}</Badge>
                  {viewing.customer.owner_name && <span>{viewing.customer.owner_name}</span>}
                  {viewing.customer.phone && <span className="flex items-center gap-1"><Phone size={13} />{viewing.customer.phone}</span>}
                  {viewing.customer.email && <span className="flex items-center gap-1"><Mail size={13} />{viewing.customer.email}</span>}
                  {viewing.customer.area && <span className="flex items-center gap-1"><MapPin size={13} />{viewing.customer.area}</span>}
                </div>
                {viewing.customer.address && <p className="mt-1 text-sm text-slate-500">{viewing.customer.address}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-400">
                  {Number(viewing.customer.balance) < 0 ? 'Store Credit Available' : 'Outstanding Balance'}
                </p>
                <p className={cn('text-lg font-bold', Number(viewing.customer.balance) < 0 ? 'text-emerald-600' : Number(viewing.customer.balance) > 0 ? 'text-rose-600' : 'text-slate-800')}>
                  {Number(viewing.customer.balance) < 0
                    ? `+${formatCurrency(Math.abs(viewing.customer.balance), symbol)}`
                    : formatCurrency(viewing.customer.balance, symbol)}
                </p>
                <p className="mt-1 text-xs text-slate-400">Credit Limit: {formatCurrency(viewing.customer.credit_limit || 0, symbol)}</p>
                <p className="mt-1 text-xs text-slate-400">Default Price: <span className="font-medium capitalize">{viewing.customer.default_price_type || 'retail'}</span></p>
              </div>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">Route</p><p className="font-medium">{viewing.customer.routes?.name || '—'}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">Sales Rep</p><p className="font-medium">{viewing.customer.sales_reps?.name || '—'}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">CNIC</p><p className="font-medium">{viewing.customer.cnic || '—'}</p></div>
              <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-400">NTN</p><p className="font-medium">{viewing.customer.ntn || '—'}</p></div>
            </div>
            <h4 className="mb-2 text-sm font-semibold text-slate-700">Purchase History & Payment Records</h4>
            {viewing.orders.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No purchases or opening invoices recorded</p> : (
              <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                {viewing.orders.map((o: any) => {
                  const pms = (viewing.payments || []).filter((p: any) => p.order_id === o.id);
                  const due = Math.max(0, Number(o.total || 0) - Number(o.paid_amount || 0));
                  return (
                    <div key={o.id} className="rounded-xl border border-slate-200 p-3 bg-white space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-800">{o.order_number}</span>
                            {o.order_number?.startsWith('OB-') && (
                              <span className="text-[10px] bg-sky-100 text-sky-800 font-bold px-1.5 py-0.5 rounded">
                                Opening Balance
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">{formatDateTime(o.created_at)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold">{formatCurrency(o.total, symbol)}</p>
                          <Badge variant={o.payment_status === 'paid' ? 'green' : Number(o.paid_amount || 0) > 0 ? 'amber' : 'red'}>
                            {o.payment_status === 'paid' ? 'Paid' : `Due ${formatCurrency(due, symbol)}`}
                          </Badge>
                        </div>
                      </div>
                      {pms.length > 0 && (
                        <div className="border-t border-slate-100 pt-2 space-y-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Payment Installments ({pms.length})</p>
                          {pms.map((pm: any) => (
                            <div key={pm.id} className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg">
                              <div className="flex items-center gap-1.5">
                                <span className="capitalize font-medium text-slate-700">{pm.method}</span>
                                <span className="text-[11px] text-slate-400">· {formatDateTime(pm.created_at)}</span>
                                {pm.note && <span className="text-[11px] text-slate-400">({pm.note})</span>}
                              </div>
                              <span className="font-semibold text-emerald-600">+{formatCurrency(pm.amount, symbol)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function CustomerForm({
  open,
  onClose,
  onSave,
  editing,
  routes,
  reps,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (d: any) => void;
  editing: any;
  routes: RouteType[];
  reps: SalesRep[];
}) {
  const { symbol } = useSettings();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    type: 'retailer',
    owner_name: '',
    cnic: '',
    ntn: '',
    area: '',
    route_id: '',
    sales_rep_id: '',
    credit_limit: 0,
    opening_balance: 0,
    default_price_type: 'retail',
    allow_manual_override: false,
    custom_price: 0,
  });

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        phone: editing.phone || '',
        email: editing.email || '',
        address: editing.address || '',
        type: editing.type || 'retailer',
        owner_name: editing.owner_name || '',
        cnic: editing.cnic || '',
        ntn: editing.ntn || '',
        area: editing.area || '',
        route_id: editing.route_id || '',
        sales_rep_id: editing.sales_rep_id || '',
        credit_limit: editing.credit_limit || 0,
        opening_balance: editing.opening_balance || 0,
        default_price_type: editing.default_price_type || 'retail',
        allow_manual_override: editing.allow_manual_override || false,
        custom_price: editing.custom_price || 0,
      });
    } else {
      setForm({
        name: '',
        phone: '',
        email: '',
        address: '',
        type: 'retailer',
        owner_name: '',
        cnic: '',
        ntn: '',
        area: '',
        route_id: '',
        sales_rep_id: '',
        credit_limit: 0,
        opening_balance: 0,
        default_price_type: 'retail',
        allow_manual_override: false,
        custom_price: 0,
      });
    }
  }, [editing, open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Customer' : 'Add Customer'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={!form.name.trim()}>Save Customer</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Business / Customer Name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
              placeholder="e.g. Al-Madina Super Store"
            />
          </Field>
          <Field label="Owner / Proprietor Name">
            <Input
              value={form.owner_name}
              onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
              placeholder="e.g. Muhammad Bilal"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone / Mobile">
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="0300-1234567"
            />
          </Field>
          <Field label="CNIC">
            <Input
              value={form.cnic}
              onChange={(e) => setForm({ ...form, cnic: e.target.value })}
              placeholder="XXXXX-XXXXXXX-X"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Area / Colony">
            <Input
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
              placeholder="e.g. Housing Colony"
            />
          </Field>
          <Field label="NTN (optional)">
            <Input
              value={form.ntn}
              onChange={(e) => setForm({ ...form, ntn: e.target.value })}
              placeholder="Leave blank if not registered"
            />
          </Field>
        </div>

        <Field label="Complete Address">
          <Textarea
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            rows={2}
            placeholder="Shop / market location details"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Customer Type">
            <Select
              value={form.type}
              onChange={(e) => {
                const val = e.target.value;
                const typeToPrice: Record<string, string> = {
                  retailer: 'retail',
                  wholesaler: 'wholesale',
                  dealer: 'dealer',
                };
                setForm({
                  ...form,
                  type: val,
                  default_price_type: typeToPrice[val] || form.default_price_type,
                });
              }}
            >
              <option value="retailer">Retailer</option>
              <option value="wholesaler">Wholesaler</option>
              <option value="dealer">Dealer</option>
            </Select>
          </Field>
          <Field label="Credit Limit">
            <Input
              type="number"
              value={form.credit_limit || ''}
              onChange={(e) => setForm({ ...form, credit_limit: Number(e.target.value) })}
              placeholder="0 (no limit check)"
            />
          </Field>
        </div>

        {/* Previous Pending Balance (Opening Due) with clear explanation */}
        {!editing ? (
          <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-sky-900">
                Previous Pending Balance (Opening Due)
              </span>
              {Number(form.opening_balance || 0) > 0 && (
                <span className="text-xs font-bold text-sky-700 bg-sky-100 px-2.5 py-0.5 rounded-full">
                  Initial Pending Invoice: {formatCurrency(Number(form.opening_balance || 0), symbol)}
                </span>
              )}
            </div>
            <p className="text-xs text-sky-700">
              If this customer already owes previous pending payments, enter the amount here. An initial invoice will automatically appear in <strong>Pending Payments</strong> so you can collect payments against it.
            </p>
            <Input
              type="number"
              value={form.opening_balance || ''}
              onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })}
              placeholder="e.g. 15000 (leave 0 if customer has no previous balance)"
              className="bg-white"
            />
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 flex justify-between items-center">
            <span>Current Outstanding Balance: <strong>{formatCurrency(editing.balance || 0, symbol)}</strong></span>
            <span>Recorded Opening Balance: <strong>{formatCurrency(editing.opening_balance || 0, symbol)}</strong></span>
          </div>
        )}

        <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
          <p className="mb-1 text-sm font-semibold text-amber-800">Pricing Tier Configuration</p>
          <p className="mb-2 text-xs text-amber-700">
            Sets default price tier before a customer has specific purchase history.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Default Price Tier">
              <Select value={form.default_price_type} onChange={(e) => setForm({ ...form, default_price_type: e.target.value })}>
                <option value="retail">Retail Price</option>
                <option value="wholesale">Wholesale Price</option>
                <option value="dealer">Dealer Price</option>
                <option value="custom">Custom Price</option>
              </Select>
            </Field>
            <Field label="Custom Fixed Price">
              <Input
                type="number"
                value={form.custom_price || ''}
                onChange={(e) => setForm({ ...form, custom_price: Number(e.target.value) })}
                placeholder="0 = use tier rate"
              />
            </Field>
          </div>
          <Field label="Allow Manual Price Override in POS" className="mt-2.5">
            <Select value={String(form.allow_manual_override)} onChange={(e) => setForm({ ...form, allow_manual_override: e.target.value === 'true' })}>
              <option value="false">No — strictly locked to tier price</option>
              <option value="true">Yes — salesperson can modify prices at POS</option>
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

interface ParsedCustomerRow {
  name: string;
  owner_name: string;
  phone: string;
  cnic: string;
  ntn: string;
  area: string;
  address: string;
  type: string;
  routeName: string;
  salesRepName: string;
  credit_limit: number;
  opening_balance: number;
  default_price_type: string;
  allow_manual_override: boolean;
  custom_price: number;
  isValid: boolean;
  error?: string;
}

function CustomerCsvImportModal({
  open,
  onClose,
  onSuccess,
  routes,
  reps,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  routes: RouteType[];
  reps: SalesRep[];
}) {
  const { symbol } = useSettings();
  const { notify } = useToast();
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedCustomerRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatusText, setImportStatusText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFileName('');
      setParsedRows([]);
      setImporting(false);
      setImportProgress(0);
      setImportStatusText('');
    }
  }, [open]);

  const handleDownloadSample = () => {
    const csvStr = generateCsv(CUSTOMER_CSV_HEADERS, CUSTOMER_CSV_SAMPLE_ROWS);
    downloadCsv('customers_import_template.csv', csvStr);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;

      const rawRows = parseCsv(content);
      if (rawRows.length < 2) {
        notify('CSV must have a header row and at least 1 customer record', 'error');
        return;
      }

      // First row is headers
      const headers = rawRows[0].map((h) => h.toLowerCase().trim());
      const findIdx = (...names: string[]) =>
        headers.findIndex((h) => names.some((n) => h.includes(n)));

      const nameIdx = findIdx('customer / business name', 'business name', 'customer name', 'shop name', 'customer', 'business', 'shop', 'name', 'title');
      const ownerIdx = findIdx('owner name', 'owner', 'proprietor', 'contact person');
      const phoneIdx = findIdx('phone', 'mobile', 'cell', 'contact', 'whatsapp');
      const cnicIdx = findIdx('cnic', 'id card', 'nic', 'national id');
      const ntnIdx = findIdx('ntn', 'tax id', 'strn');
      const areaIdx = findIdx('area', 'location', 'zone', 'town', 'colony', 'city');
      const addressIdx = findIdx('address', 'full address', 'street');
      const typeIdx = findIdx('customer type', 'type', 'tier');
      const routeIdx = findIdx('route', 'route name', 'delivery route');
      const repIdx = findIdx('sales rep', 'sales representative', 'salesperson', 'rep');
      const creditLimitIdx = findIdx('credit limit', 'limit', 'max credit');
      const openingBalIdx = findIdx('opening balance', 'pending payment', 'pending balance', 'pending amount', 'previous balance', 'opening', 'balance', 'due');
      const priceTypeIdx = findIdx('default price type', 'price type', 'price tier', 'pricing tier');
      const overrideIdx = findIdx('allow manual price override', 'manual price override', 'manual override', 'allow override', 'override');
      const customPriceIdx = findIdx('custom price', 'custom rate');

      const dataRows = rawRows.slice(1);
      const rows: ParsedCustomerRow[] = dataRows.map((cols) => {
        const name = (nameIdx >= 0 ? cols[nameIdx] : cols[0])?.trim() || '';
        const owner_name = (ownerIdx >= 0 ? cols[ownerIdx] : '')?.trim() || '';
        const phone = (phoneIdx >= 0 ? cols[phoneIdx] : '')?.trim() || '';
        const cnic = (cnicIdx >= 0 ? cols[cnicIdx] : '')?.trim() || '';
        const ntn = (ntnIdx >= 0 ? cols[ntnIdx] : '')?.trim() || '';
        const area = (areaIdx >= 0 ? cols[areaIdx] : '')?.trim() || '';
        const address = (addressIdx >= 0 ? cols[addressIdx] : '')?.trim() || '';

        let type = (typeIdx >= 0 ? cols[typeIdx] : '')?.trim().toLowerCase() || 'retailer';
        if (type.includes('whole')) type = 'wholesaler';
        else if (type.includes('deal')) type = 'dealer';
        else type = 'retailer';

        const routeName = (routeIdx >= 0 ? cols[routeIdx] : '')?.trim() || '';
        const salesRepName = (repIdx >= 0 ? cols[repIdx] : '')?.trim() || '';

        const credit_limit = Math.max(0, Number((creditLimitIdx >= 0 ? cols[creditLimitIdx] : '0').replace(/[^0-9.]/g, '')) || 0);
        const opening_balance = Math.max(0, Number((openingBalIdx >= 0 ? cols[openingBalIdx] : '0').replace(/[^0-9.]/g, '')) || 0);

        let default_price_type = (priceTypeIdx >= 0 ? cols[priceTypeIdx] : '')?.trim().toLowerCase() || 'retail';
        if (!['retail', 'wholesale', 'dealer', 'promotional', 'custom'].includes(default_price_type)) {
          default_price_type = 'retail';
        }

        const rawOverride = (overrideIdx >= 0 ? cols[overrideIdx] : '')?.trim().toLowerCase() || '';
        const allow_manual_override = ['yes', 'true', '1', 'y'].includes(rawOverride);

        const custom_price = Math.max(0, Number((customPriceIdx >= 0 ? cols[customPriceIdx] : '0').replace(/[^0-9.]/g, '')) || 0);

        const isValid = Boolean(name);
        const error = !name ? 'Missing business/customer name' : undefined;

        return {
          name,
          owner_name,
          phone,
          cnic,
          ntn,
          area,
          address,
          type,
          routeName,
          salesRepName,
          credit_limit,
          opening_balance,
          default_price_type,
          allow_manual_override,
          custom_price,
          isValid,
          error,
        };
      });

      setParsedRows(rows);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleImport = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      notify('No valid customers to import', 'error');
      return;
    }

    setImporting(true);
    setImportProgress(0);

    try {
      const routeMap = new Map(routes.map((r) => [r.name.toLowerCase().trim(), r.id]));
      const repMap = new Map(reps.map((s) => [s.name.toLowerCase().trim(), s.id]));

      let importedCount = 0;
      let invoicesCreated = 0;

      for (let i = 0; i < validRows.length; i++) {
        const item = validRows[i];
        setImportStatusText(`Importing ${item.name} (${i + 1} of ${validRows.length})...`);

        // Resolve or create route
        let routeId: string | null = null;
        if (item.routeName) {
          const key = item.routeName.toLowerCase().trim();
          if (routeMap.has(key)) {
            routeId = routeMap.get(key)!;
          } else {
            try {
              const newRoute = await api.post<any>('/api/data/routes', { name: item.routeName });
              if (newRoute?.id) {
                const rid = String(newRoute.id);
                routeId = rid;
                routeMap.set(key, rid);
              }
            } catch {
              // ignore route creation error
            }
          }
        }

        // Resolve or create sales rep
        let salesRepId: string | null = null;
        if (item.salesRepName) {
          const key = item.salesRepName.toLowerCase().trim();
          if (repMap.has(key)) {
            salesRepId = repMap.get(key)!;
          } else {
            try {
              const newRep = await api.post<any>('/api/data/sales_reps', { name: item.salesRepName, phone: '' });
              if (newRep?.id) {
                const repId = String(newRep.id);
                salesRepId = repId;
                repMap.set(key, repId);
              }
            } catch {
              // ignore sales rep creation error
            }
          }
        }

        const openingDue = item.opening_balance;

        const customerPayload = {
          name: item.name,
          owner_name: item.owner_name || null,
          phone: item.phone || null,
          cnic: item.cnic || null,
          ntn: item.ntn || null,
          area: item.area || null,
          address: item.address || null,
          type: item.type,
          route_id: routeId,
          sales_rep_id: salesRepId,
          credit_limit: item.credit_limit,
          opening_balance: openingDue,
          balance: openingDue,
          default_price_type: item.default_price_type,
          allow_manual_override: item.allow_manual_override ? 1 : 0,
          custom_price: item.custom_price,
        };

        const createdCust = await api.post<any>('/api/data/customers', customerPayload);

        // If customer has opening pending balance, generate initial pending invoice automatically
        if (openingDue > 0 && createdCust?.id) {
          const orderNum = generateDocNumber('OB');
          const invNum = generateDocNumber('INV');
          const order = await api.post<any>('/api/data/orders', {
            order_number: orderNum,
            invoice_number: invNum,
            customer_id: createdCust.id,
            subtotal: openingDue,
            discount: 0,
            tax: 0,
            total: openingDue,
            paid_amount: 0,
            status: 'completed',
            payment_status: 'unpaid',
            note: 'Initial Opening Balance / Previous Pending Due',
            sales_rep_id: salesRepId,
            route_id: routeId,
          });
          await api.post('/api/data/order_items', {
            order_id: order.id,
            product_id: null,
            product_name: 'Opening Balance / Previous Pending Due',
            quantity: 1,
            unit_price: openingDue,
            discount: 0,
            tax: 0,
            total: openingDue,
            free_items: 0,
            unit: 'balance',
            cost_price: 0,
            total_cost: 0,
          });
          invoicesCreated++;
        }

        importedCount++;
        setImportProgress(Math.round(((i + 1) / validRows.length) * 100));
      }

      notify(
        `Successfully imported ${importedCount} customer(s)! ${invoicesCreated > 0 ? `(${invoicesCreated} initial pending invoices created)` : ''}`,
        'success'
      );
      onSuccess();
    } catch (err: any) {
      notify(err?.message || 'Failed during customer import', 'error');
    } finally {
      setImporting(false);
    }
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;
  const invalidCount = parsedRows.length - validCount;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import Customers from CSV / Excel"
      size="xl"
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="text-xs text-slate-500">
            {parsedRows.length > 0 ? (
              <span>
                <strong>{validCount}</strong> of <strong>{parsedRows.length}</strong> customers ready to import
                {invalidCount > 0 && <span className="text-rose-600 font-semibold ml-2">({invalidCount} errors)</span>}
              </span>
            ) : (
              <span>Select a CSV file to preview before importing</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={importing}>Cancel</Button>
            <Button
              onClick={handleImport}
              disabled={validCount === 0 || importing}
              icon={importing ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
            >
              {importing ? 'Importing...' : `Import ${validCount} Customer(s)`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Template download & file selection banner */}
        <div className="flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-bold text-sky-900 flex items-center gap-2">
              <FileSpreadsheet size={18} /> Bulk Customer Onboarding
            </h4>
            <p className="mt-0.5 text-xs text-sky-700">
              Download the template with all customer columns (Routes, Areas, Price Tiers & Opening Pending Balances).
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={<Download size={15} />}
            onClick={handleDownloadSample}
            className="shrink-0 bg-white"
          >
            Download Sample CSV
          </Button>
        </div>

        {/* Upload Box */}
        <div
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all',
            fileName
              ? 'border-emerald-300 bg-emerald-50/30'
              : 'border-slate-300 bg-slate-50/50 hover:border-sky-400 hover:bg-sky-50/20'
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-600 mb-2">
            <Upload size={22} />
          </div>
          {fileName ? (
            <div>
              <p className="text-sm font-semibold text-emerald-800">{fileName}</p>
              <p className="text-xs text-emerald-600">Click to choose a different file</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-slate-700">Click to select customer CSV file</p>
              <p className="text-xs text-slate-400">Supports standard UTF-8 and Excel exported CSV files</p>
            </div>
          )}
        </div>

        {/* Import Progress Bar */}
        {importing && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 space-y-1.5">
            <div className="flex justify-between text-xs font-semibold text-sky-900">
              <span>{importStatusText || 'Importing customers...'}</span>
              <span>{importProgress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-sky-200">
              <div
                className="h-full bg-sky-600 transition-all duration-200"
                style={{ width: `${importProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Preview Table */}
        {parsedRows.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Preview ({parsedRows.length} rows found)
              </span>
              <span className="text-xs text-slate-400">
                Opening balances automatically generate pending invoices in Pending Payments
              </span>
            </div>

            <div className="max-h-64 overflow-x-auto overflow-y-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="p-2.5">Business Name</th>
                    <th className="p-2.5">Owner</th>
                    <th className="p-2.5">Phone</th>
                    <th className="p-2.5">Area</th>
                    <th className="p-2.5">Route</th>
                    <th className="p-2.5">Type</th>
                    <th className="p-2.5 text-right">Opening Balance (Due)</th>
                    <th className="p-2.5 text-right">Credit Limit</th>
                    <th className="p-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedRows.map((r, idx) => (
                    <tr key={idx} className={cn('hover:bg-slate-50', !r.isValid && 'bg-rose-50/50')}>
                      <td className="p-2.5 font-medium text-slate-800">
                        {r.name || <span className="text-rose-500 font-bold">Missing Name</span>}
                      </td>
                      <td className="p-2.5 text-slate-600">{r.owner_name || '—'}</td>
                      <td className="p-2.5 text-slate-600 font-mono text-[11px]">{r.phone || '—'}</td>
                      <td className="p-2.5 text-slate-600">{r.area || '—'}</td>
                      <td className="p-2.5 text-slate-600">{r.routeName || '—'}</td>
                      <td className="p-2.5 text-slate-600 capitalize">{r.type}</td>
                      <td className="p-2.5 text-right font-medium">
                        {r.opening_balance > 0 ? (
                          <span className="text-rose-600 font-bold">
                            {formatCurrency(r.opening_balance, symbol)}
                          </span>
                        ) : (
                          <span className="text-slate-400">Rs 0</span>
                        )}
                      </td>
                      <td className="p-2.5 text-right text-slate-600">
                        {r.credit_limit > 0 ? formatCurrency(r.credit_limit, symbol) : '—'}
                      </td>
                      <td className="p-2.5 text-center">
                        {r.isValid ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 text-[11px]">
                            <CheckCircle2 size={13} /> Ready
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-rose-600 text-[11px]" title={r.error}>
                            <AlertCircle size={13} /> {r.error}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
