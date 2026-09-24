import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { SalesRep, Route as RouteType } from '@/lib/types';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/Button';
import { Field, Input, Select } from '@/components/Form';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal, ConfirmModal } from '@/components/Modal';
import { formatCurrency } from '@/lib/utils';
import { Plus, Pencil, Trash2, UserCog, Phone, Search } from 'lucide-react';

export function SalesReps() {
  const { symbol } = useSettings();
  const { notify } = useToast();
  const [items, setItems] = useState<(SalesRep & { routes?: { name: string } | null })[]>([]);
  const [routes, setRoutes] = useState<RouteType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SalesRep | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SalesRep | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, reps] = await Promise.all([
        api.get<RouteType[]>('/api/data/routes'),
        api.get<SalesRep[]>('/api/data/sales_reps'),
      ]);
      const routeList = (r || []).sort((a, b) => a.name.localeCompare(b.name));
      const routeMap = new Map(routeList.map((x) => [x.id, x]));
      setRoutes(routeList);
      setItems(
        (reps || [])
          .map((s) => ({ ...s, routes: s.route_id ? { name: routeMap.get(s.route_id)?.name || '' } : null }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } catch {
      setRoutes([]);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((s) => {
    const q = search.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.phone?.toLowerCase().includes(q);
  });

  const save = async (data: Partial<SalesRep>) => {
    try {
      if (editing) {
        await api.put(`/api/data/sales_reps/${editing.id}`, data);
        notify('Sales rep updated', 'success');
      } else {
        await api.post('/api/data/sales_reps', data);
        notify('Sales rep added', 'success');
      }
      setShowForm(false); setEditing(null); load();
    } catch (e: any) {
      notify(e.message || 'Failed to save', 'error');
    }
  };

  const remove = async (s: SalesRep) => {
    try {
      await api.delete(`/api/data/sales_reps/${s.id}`);
      notify('Sales rep deleted', 'success');
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to delete', 'error');
    }
  };

  if (loading) return <div><PageHeader title="Sales Representatives" /><Spinner /></div>;

  return (
    <div>
      <PageHeader title="Sales Representatives" subtitle={`${items.length} sales reps`} actions={<Button icon={<Plus size={18} />} onClick={() => { setEditing(null); setShowForm(true); }}>Add Rep</Button>} />
      <div className="mb-4 relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search sales reps..." className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 ? (
          <Card className="sm:col-span-2 lg:col-span-3"><EmptyState icon={<UserCog size={32} />} title="No sales reps" action={<Button icon={<Plus size={18} />} onClick={() => setShowForm(true)}>Add Rep</Button>} /></Card>
        ) : filtered.map((s) => (
          <Card key={s.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700"><UserCog size={18} /></div>
                <div>
                  <p className="font-semibold text-slate-800">{s.name}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    {s.phone && <span className="flex items-center gap-1"><Phone size={11} />{s.phone}</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditing(s); setShowForm(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Pencil size={15} /></button>
                <button onClick={() => setDeleteTarget(s)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="blue">{s.routes?.name || 'No route'}</Badge>
              <Badge variant="green">{s.commission_rate}% commission</Badge>
              <Badge variant={s.status === 'active' ? 'green' : 'gray'}>{s.status}</Badge>
            </div>
            <div className="mt-2 text-xs text-slate-500">Monthly Target: {formatCurrency(s.target_monthly, symbol)}</div>
          </Card>
        ))}
      </div>
      <RepForm open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} onSave={save} editing={editing} routes={routes} />
      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && remove(deleteTarget)} title="Delete Sales Rep" message={`Delete ${deleteTarget?.name}?`} confirmLabel="Delete" danger />
    </div>
  );
}

function RepForm({ open, onClose, onSave, editing, routes }: { open: boolean; onClose: () => void; onSave: (d: Partial<SalesRep>) => void; editing: SalesRep | null; routes: RouteType[] }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', route_id: '', commission_rate: 2, target_monthly: 0, status: 'active' });
  useEffect(() => {
    if (editing) setForm({ name: editing.name, phone: editing.phone || '', email: editing.email || '', route_id: editing.route_id || '', commission_rate: editing.commission_rate, target_monthly: editing.target_monthly, status: editing.status });
    else setForm({ name: '', phone: '', email: '', route_id: '', commission_rate: 2, target_monthly: 0, status: 'active' });
  }, [editing, open]);
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Sales Rep' : 'Add Sales Rep'} size="md" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onSave({ ...form, route_id: form.route_id || null })} disabled={!form.name}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        </div>
        <Field label="Assigned Route"><Select value={form.route_id} onChange={(e) => setForm({ ...form, route_id: e.target.value })}><option value="">No route</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Commission Rate (%)"><Input type="number" value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: Number(e.target.value) })} /></Field>
          <Field label="Monthly Target"><Input type="number" value={form.target_monthly || ''} onChange={(e) => setForm({ ...form, target_monthly: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Status"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
      </div>
    </Modal>
  );
}
