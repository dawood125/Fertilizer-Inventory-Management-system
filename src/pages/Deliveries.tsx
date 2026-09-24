import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { Delivery, Route as RouteType } from '@/lib/types';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/Button';
import { Field, Input, Select, Textarea } from '@/components/Form';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { formatDate, generateDocNumber } from '@/lib/utils';
import { Plus, Eye, Truck, Printer } from 'lucide-react';
import { triggerSilentPrint } from '@/lib/printPdf';

const statusVariant: Record<string, 'green' | 'amber' | 'red' | 'gray' | 'blue'> = {
  delivered: 'green',
  pending: 'amber',
  in_transit: 'blue',
  cancelled: 'red',
  partial: 'gray',
};

export function Deliveries() {
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [routes, setRoutes] = useState<RouteType[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, r, o, customers] = await Promise.all([
        api.get<Delivery[]>('/api/data/deliveries'),
        api.get<RouteType[]>('/api/data/routes'),
        api.get<any[]>('/api/data/orders'),
        api.get<any[]>('/api/data/customers'),
      ]);
      const routeList = (r || []).sort((a, b) => a.name.localeCompare(b.name));
      const customerMap = new Map((customers || []).map((c) => [c.id, c]));
      const routeMap = new Map(routeList.map((x) => [x.id, x]));
      const orderList = (o || [])
        .map((ord) => ({
          ...ord,
          customers: ord.customer_id ? { name: customerMap.get(ord.customer_id)?.name } : null,
        }))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, 50);
      const orderMap = new Map(orderList.map((x) => [x.id, x]));
      setRoutes(routeList);
      setOrders(orderList);
      setItems(
        (d || [])
          .map((del) => {
            const ord = del.order_id ? orderMap.get(del.order_id) : null;
            return {
              ...del,
              routes: del.route_id ? { name: routeMap.get(del.route_id)?.name || '' } : null,
              orders: ord
                ? { order_number: ord.order_number, customers: ord.customers }
                : null,
            };
          })
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .slice(0, 100)
      );
    } catch {
      setItems([]);
      setRoutes([]);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openView = async (d: Delivery) => {
    try {
      const allItems = await api.get<any[]>('/api/data/delivery_items');
      setViewing({ ...d, items: (allItems || []).filter((i) => i.delivery_id === d.id) });
    } catch {
      setViewing({ ...d, items: [] });
    }
  };

  const create = async (data: any) => {
    try {
      const challan = generateDocNumber('CHN');
      const delivery = await api.post<any>('/api/data/deliveries', {
        challan_number: challan,
        order_id: data.order_id || null,
        route_id: data.route_id || null,
        vehicle: data.vehicle,
        driver_name: data.driver_name,
        dispatch_date: data.dispatch_date,
        status: 'pending',
        note: data.note,
      });

      if (data.order_id) {
        const allOrderItems = await api.get<any[]>('/api/data/order_items');
        const orderItems = (allOrderItems || []).filter((it) => it.order_id === data.order_id);
        for (const it of orderItems) {
          await api.post('/api/data/delivery_items', {
            delivery_id: delivery.id,
            product_id: it.product_id,
            product_name: it.product_name,
            ordered_quantity: it.quantity,
            delivered_quantity: 0,
            pending_quantity: it.quantity,
          });
        }
      }
      notify('Delivery challan created', 'success');
      setShowForm(false); load();
    } catch {
      notify('Failed to create delivery', 'error');
    }
  };

  const markDelivered = async (d: any) => {
    try {
      let items = d.items || [];
      if (!items.length) {
        const allItems = await api.get<any[]>('/api/data/delivery_items');
        items = (allItems || []).filter((i) => i.delivery_id === d.id);
      }
      for (const it of items) {
        await api.put(`/api/data/delivery_items/${it.id}`, {
          delivered_quantity: Number(it.ordered_quantity),
          pending_quantity: 0,
        });
      }
      await api.put(`/api/data/deliveries/${d.id}`, {
        status: 'delivered',
        delivered_date: new Date().toISOString().slice(0, 10),
      });
      notify('Delivery marked as delivered', 'success');
      setViewing(null); load();
    } catch (e: any) {
      notify(e.message || 'Failed to update', 'error');
    }
  };

  if (loading) return <div><PageHeader title="Deliveries" /><Spinner /></div>;

  return (
    <div>
      <PageHeader title="Delivery Management" subtitle={`${items.length} delivery challans`} actions={<Button icon={<Plus size={18} />} onClick={() => setShowForm(true)}>Create Challan</Button>} />
      <Card>
        {items.length === 0 ? <EmptyState icon={<Truck size={32} />} title="No deliveries" action={<Button icon={<Plus size={18} />} onClick={() => setShowForm(true)}>Create Challan</Button>} /> : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Challan #</th><th>Order</th><th>Customer</th><th>Route</th><th>Vehicle</th><th>Dispatch Date</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {items.map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium text-slate-800">{d.challan_number}</td>
                    <td>{d.orders?.order_number || '—'}</td>
                    <td>{d.orders?.customers?.name || '—'}</td>
                    <td>{d.routes?.name || '—'}</td>
                    <td>{d.vehicle || '—'}</td>
                    <td className="text-slate-500">{formatDate(d.dispatch_date)}</td>
                    <td><Badge variant={statusVariant[d.status] || 'gray'}>{d.status}</Badge></td>
                    <td>
                      <div className="flex justify-end gap-1">
                        <button onClick={() => openView(d)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Eye size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <DeliveryForm open={showForm} onClose={() => setShowForm(false)} onCreate={create} routes={routes} orders={orders} />
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing ? `Challan ${viewing.challan_number}` : ''} size="lg" footer={<>{viewing?.status === 'pending' && <Button variant="success" onClick={() => markDelivered(viewing)}>Mark Delivered</Button>}<Button variant="outline" icon={<Printer size={16} />} onClick={() => void triggerSilentPrint()}>Print</Button><Button onClick={() => setViewing(null)}>Close</Button></>}>
        {viewing && (
          <div className="print-document">
            <div className="mb-4 hidden print:block">
              <h2 className="text-lg font-bold">Delivery Challan — {viewing.challan_number}</h2>
              <p className="text-sm text-slate-600">Dispatch: {formatDate(viewing.dispatch_date)}</p>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-xs text-slate-400">Vehicle</p><p className="font-medium">{viewing.vehicle || '—'}</p></div>
              <div><p className="text-xs text-slate-400">Driver</p><p className="font-medium">{viewing.driver_name || '—'}</p></div>
            </div>
            <table className="data-table">
              <thead><tr><th>Product</th><th>Ordered</th><th>Delivered</th><th>Pending</th></tr></thead>
              <tbody>
                {(viewing.items || []).map((it: any) => (
                  <tr key={it.id}><td className="font-medium">{it.product_name}</td><td>{it.ordered_quantity}</td><td>{it.delivered_quantity}</td><td className="text-rose-600">{it.pending_quantity}</td></tr>
                ))}
                {(!viewing.items || viewing.items.length === 0) && <tr><td colSpan={4} className="py-6 text-center text-slate-400">No items</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}

function DeliveryForm({ open, onClose, onCreate, routes, orders }: { open: boolean; onClose: () => void; onCreate: (d: any) => void; routes: RouteType[]; orders: any[] }) {
  const [form, setForm] = useState({ order_id: '', route_id: '', vehicle: '', driver_name: '', dispatch_date: new Date().toISOString().slice(0, 10), note: '' });
  useEffect(() => { if (open) setForm({ order_id: '', route_id: '', vehicle: '', driver_name: '', dispatch_date: new Date().toISOString().slice(0, 10), note: '' }); }, [open]);
  return (
    <Modal open={open} onClose={onClose} title="Create Delivery Challan" size="md" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onCreate(form)} disabled={!form.vehicle && !form.order_id}>Create</Button></>}>
      <div className="space-y-3">
        <Field label="Sales Order"><Select value={form.order_id} onChange={(e) => setForm({ ...form, order_id: e.target.value })}><option value="">Select order...</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.order_number} — {o.customers?.name || 'Walk-in'}</option>)}</Select></Field>
        <Field label="Route"><Select value={form.route_id} onChange={(e) => setForm({ ...form, route_id: e.target.value })}><option value="">No route</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Vehicle"><Input value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} placeholder="Plate number" /></Field>
          <Field label="Driver"><Input value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} /></Field>
        </div>
        <Field label="Dispatch Date"><Input type="date" value={form.dispatch_date} onChange={(e) => setForm({ ...form, dispatch_date: e.target.value })} /></Field>
        <Field label="Note"><Textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} /></Field>
      </div>
    </Modal>
  );
}
