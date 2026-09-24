import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { Route as RouteType } from '@/lib/types';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/Button';
import { Field, Input, Textarea } from '@/components/Form';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal, ConfirmModal } from '@/components/Modal';
import { Plus, Pencil, Trash2, MapPin, Truck } from 'lucide-react';

export function RoutesPage() {
  const { notify } = useToast();
  const [items, setItems] = useState<RouteType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RouteType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RouteType | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<RouteType[]>('/api/data/routes');
      setItems((data || []).sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (data: Partial<RouteType>) => {
    try {
      if (editing) {
        await api.put(`/api/data/routes/${editing.id}`, data);
        notify('Route updated', 'success');
      } else {
        await api.post('/api/data/routes', data);
        notify('Route added', 'success');
      }
      setShowForm(false); setEditing(null); load();
    } catch (e: any) {
      notify(e.message || 'Failed to save route', 'error');
    }
  };

  const remove = async (r: RouteType) => {
    try {
      await api.delete(`/api/data/routes/${r.id}`);
      notify('Route deleted', 'success');
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to delete route', 'error');
    }
  };

  if (loading) return <div><PageHeader title="Routes" /><Spinner /></div>;

  return (
    <div>
      <PageHeader title="Route Management" subtitle={`${items.length} delivery routes`} actions={<Button icon={<Plus size={18} />} onClick={() => { setEditing(null); setShowForm(true); }}>Add Route</Button>} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.length === 0 ? (
          <Card className="sm:col-span-2 lg:col-span-3"><EmptyState icon={<MapPin size={32} />} title="No routes" action={<Button icon={<Plus size={18} />} onClick={() => setShowForm(true)}>Add Route</Button>} /></Card>
        ) : items.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700"><MapPin size={18} /></div>
                <div>
                  <p className="font-semibold text-slate-800">{r.name}</p>
                  <p className="text-sm text-slate-500">{r.area || 'No area'}</p>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditing(r); setShowForm(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Pencil size={15} /></button>
                <button onClick={() => setDeleteTarget(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {r.driver_name && <Badge variant="blue"><Truck size={11} className="mr-1" />{r.driver_name}</Badge>}
              {r.vehicle && <Badge variant="gray">{r.vehicle}</Badge>}
            </div>
          </Card>
        ))}
      </div>
      <RouteForm open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} onSave={save} editing={editing} />
      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && remove(deleteTarget)} title="Delete Route" message={`Delete ${deleteTarget?.name}?`} confirmLabel="Delete" danger />
    </div>
  );
}

function RouteForm({ open, onClose, onSave, editing }: { open: boolean; onClose: () => void; onSave: (d: Partial<RouteType>) => void; editing: RouteType | null }) {
  const [form, setForm] = useState({ name: '', area: '', driver_name: '', vehicle: '', description: '' });
  useEffect(() => {
    if (editing) setForm({ name: editing.name, area: editing.area || '', driver_name: editing.driver_name || '', vehicle: editing.vehicle || '', description: editing.description || '' });
    else setForm({ name: '', area: '', driver_name: '', vehicle: '', description: '' });
  }, [editing, open]);
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Route' : 'Add Route'} size="md" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(form)} disabled={!form.name}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Route Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
        <Field label="Area"><Input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Driver Name"><Input value={form.driver_name} onChange={(e) => setForm({ ...form, driver_name: e.target.value })} /></Field>
          <Field label="Vehicle"><Input value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} /></Field>
        </div>
        <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></Field>
      </div>
    </Modal>
  );
}
