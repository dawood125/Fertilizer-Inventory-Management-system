import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { ProductBatch, Product } from '@/lib/types';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/Button';
import { Field, Input, Select } from '@/components/Form';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal, ConfirmModal } from '@/components/Modal';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Plus, Pencil, Trash2, Package, AlertTriangle, Calendar } from 'lucide-react';

function getExpiryStatus(expiry: string | null): { label: string; variant: 'green' | 'amber' | 'red' } {
  if (!expiry) return { label: 'No expiry', variant: 'gray' as any };
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: 'Expired', variant: 'red' };
  if (days <= 30) return { label: `Expiring in ${days}d`, variant: 'amber' };
  return { label: `${days}d left`, variant: 'green' };
}

export function Batches() {
  const { symbol } = useSettings();
  const { notify } = useToast();
  const [items, setItems] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProductBatch | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductBatch | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, p] = await Promise.all([
        api.get<ProductBatch[]>('/api/data/product_batches'),
        api.get<Product[]>('/api/data/products?limit=10000'),
      ]);
      const productList = (p || []).sort((a, b) => a.name.localeCompare(b.name));
      const productMap = new Map(productList.map((x) => [x.id, x]));
      setProducts(productList);
      setItems(
        (b || [])
          .map((batch) => ({
            ...batch,
            products: productMap.get(batch.product_id)
              ? { name: productMap.get(batch.product_id)!.name, sku: productMap.get(batch.product_id)!.sku }
              : null,
          }))
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      );
    } catch {
      setItems([]);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (data: any) => {
    try {
      if (editing) {
        await api.put(`/api/data/product_batches/${editing.id}`, data);
        notify('Batch updated', 'success');
      } else {
        await api.post('/api/data/product_batches', data);
        notify('Batch added', 'success');
      }
      setShowForm(false); setEditing(null); load();
    } catch (e: any) {
      notify(e.message || 'Failed to save', 'error');
    }
  };

  const remove = async (b: ProductBatch) => {
    try {
      await api.delete(`/api/data/product_batches/${b.id}`);
      notify('Batch deleted', 'success');
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to delete', 'error');
    }
  };

  if (loading) return <div><PageHeader title="Batch & Expiry" /><Spinner /></div>;

  const expired = items.filter((b) => b.expiry_date && new Date(b.expiry_date) < new Date());
  const nearExpiry = items.filter((b) => {
    if (!b.expiry_date) return false;
    const days = Math.ceil((new Date(b.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 30;
  });

  return (
    <div>
      <PageHeader title="Batch & Expiry Management" subtitle={`${items.length} batches`} actions={<Button icon={<Plus size={18} />} onClick={() => { setEditing(null); setShowForm(true); }}>Add Batch</Button>} />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600"><AlertTriangle size={20} /></div><div><p className="text-xs uppercase text-slate-400">Expired</p><p className="text-2xl font-bold text-rose-600">{expired.length}</p></div></div></Card>
        <Card className="p-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600"><Calendar size={20} /></div><div><p className="text-xs uppercase text-slate-400">Near Expiry (30d)</p><p className="text-2xl font-bold text-amber-600">{nearExpiry.length}</p></div></div></Card>
        <Card className="p-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600"><Package size={20} /></div><div><p className="text-xs uppercase text-slate-400">Active Batches</p><p className="text-2xl font-bold text-emerald-600">{items.filter((b) => b.status === 'active').length}</p></div></div></Card>
      </div>

      <Card>
        {items.length === 0 ? <EmptyState icon={<Package size={32} />} title="No batches" action={<Button icon={<Plus size={18} />} onClick={() => setShowForm(true)}>Add Batch</Button>} /> : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Batch #</th><th>Product</th><th>Mfg Date</th><th>Expiry Date</th><th>Qty</th><th>Cost</th><th>Expiry Status</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {items.map((b) => {
                  const exp = getExpiryStatus(b.expiry_date);
                  return (
                    <tr key={b.id}>
                      <td className="font-medium text-slate-800">{b.batch_number}</td>
                      <td>{b.products?.name || '—'}</td>
                      <td className="text-slate-500">{b.manufacturing_date ? formatDate(b.manufacturing_date) : '—'}</td>
                      <td className="text-slate-500">{b.expiry_date ? formatDate(b.expiry_date) : '—'}</td>
                      <td>{b.quantity}</td>
                      <td>{formatCurrency(b.batch_cost, symbol)}</td>
                      <td><Badge variant={exp.variant}>{exp.label}</Badge></td>
                      <td><Badge variant={b.status === 'active' ? 'green' : 'gray'}>{b.status}</Badge></td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <button onClick={() => { setEditing(b); setShowForm(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Pencil size={16} /></button>
                          <button onClick={() => setDeleteTarget(b)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button>
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
      <BatchForm open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} onSave={save} editing={editing} products={products} />
      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && remove(deleteTarget)} title="Delete Batch" message={`Delete batch ${deleteTarget?.batch_number}?`} confirmLabel="Delete" danger />
    </div>
  );
}

function BatchForm({ open, onClose, onSave, editing, products }: { open: boolean; onClose: () => void; onSave: (d: any) => void; editing: ProductBatch | null; products: Product[] }) {
  const [form, setForm] = useState({ product_id: '', batch_number: '', manufacturing_date: '', expiry_date: '', quantity: 0, batch_cost: 0, status: 'active' });
  useEffect(() => {
    if (editing) setForm({ product_id: editing.product_id, batch_number: editing.batch_number, manufacturing_date: editing.manufacturing_date || '', expiry_date: editing.expiry_date || '', quantity: editing.quantity, batch_cost: editing.batch_cost, status: editing.status });
    else setForm({ product_id: '', batch_number: '', manufacturing_date: '', expiry_date: '', quantity: 0, batch_cost: 0, status: 'active' });
  }, [editing, open]);
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Batch' : 'Add Batch'} size="md" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onSave({ ...form, product_id: form.product_id || null })} disabled={!form.batch_number || !form.product_id}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Product" required><Select value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}><option value="">Select product...</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
        <Field label="Batch Number" required><Input value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Manufacturing Date"><Input type="date" value={form.manufacturing_date} onChange={(e) => setForm({ ...form, manufacturing_date: e.target.value })} /></Field>
          <Field label="Expiry Date"><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantity"><Input type="number" value={form.quantity || ''} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></Field>
          <Field label="Batch Cost"><Input type="number" value={form.batch_cost || ''} onChange={(e) => setForm({ ...form, batch_cost: Number(e.target.value) })} /></Field>
        </div>
        <Field label="Status"><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="active">Active</option><option value="expired">Expired</option><option value="damaged">Damaged</option></Select></Field>
      </div>
    </Modal>
  );
}
