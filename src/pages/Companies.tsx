import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import type { Company } from '@/lib/types';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/Button';
import { Field, Input, Textarea } from '@/components/Form';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal, ConfirmModal } from '@/components/Modal';
import { Plus, Pencil, Trash2, Eye, Building2, Search, Phone, Mail } from 'lucide-react';

export function Companies() {
  const { notify } = useToast();
  const [items, setItems] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Company | null>(null);
  const [viewing, setViewing] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Company[]>('/api/data/companies');
      setItems((data || []).sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((c) => {
    const q = search.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.contact_person?.toLowerCase().includes(q);
  });

  const openView = async (c: Company) => {
    try {
      const [allProducts, allSuppliers] = await Promise.all([
        api.get<any[]>('/api/data/products?limit=10000'),
        api.get<any[]>('/api/data/suppliers'),
      ]);
      const products = (allProducts || []).filter((p) => p.company_id === c.id).map((p) => ({
        name: p.name, stock_quantity: p.stock_quantity, purchase_price: p.purchase_price, id: p.id,
      }));
      const suppliers = (allSuppliers || []).filter((s) => s.company_id === c.id).map((s) => ({
        name: s.name, balance: s.balance, id: s.id,
      }));
      setViewing({ company: c, products, suppliers });
    } catch {
      setViewing({ company: c, products: [], suppliers: [] });
    }
  };

  const save = async (data: Partial<Company>) => {
    try {
      if (editing) {
        await api.put(`/api/data/companies/${editing.id}`, data);
        notify('Company updated', 'success');
      } else {
        await api.post('/api/data/companies', data);
        notify('Company added', 'success');
      }
      setShowForm(false); setEditing(null); load();
    } catch (e: any) {
      notify(e.message || 'Failed to save company', 'error');
    }
  };

  const remove = async (c: Company) => {
    try {
      await api.delete(`/api/data/companies/${c.id}`);
      notify('Company deleted', 'success');
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to delete company', 'error');
    }
  };

  if (loading) return <div><PageHeader title="Companies" /><Spinner /></div>;

  return (
    <div>
      <PageHeader title="Companies" subtitle={`${items.length} FMCG manufacturers`} actions={<Button icon={<Plus size={18} />} onClick={() => { setEditing(null); setShowForm(true); }}>Add Company</Button>} />
      <div className="mb-4 relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search companies..." className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20" />
      </div>
      {filtered.length === 0 ? (
        <Card><EmptyState icon={<Building2 size={32} />} title="No companies" action={<Button icon={<Plus size={18} />} onClick={() => setShowForm(true)}>Add Company</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Building2 size={18} /></div>
                  <div>
                    <p className="font-semibold text-slate-800">{c.name}</p>
                    <p className="text-sm text-slate-500">{c.contact_person || 'No contact'}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openView(c)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Eye size={15} /></button>
                  <button onClick={() => { setEditing(c); setShowForm(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Pencil size={15} /></button>
                  <button onClick={() => setDeleteTarget(c)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <CompanyForm open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} onSave={save} editing={editing} />
      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && remove(deleteTarget)} title="Delete Company" message={`Delete ${deleteTarget?.name}?`} confirmLabel="Delete" danger />
      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Company Profile" size="lg">
        {viewing && (
          <div>
            <div className="mb-5 flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><Building2 size={28} /></div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-slate-800">{viewing.company.name}</h3>
                <div className="mt-1 flex flex-wrap gap-3 text-sm text-slate-500">
                  {viewing.company.phone && <span className="flex items-center gap-1"><Phone size={13} />{viewing.company.phone}</span>}
                  {viewing.company.email && <span className="flex items-center gap-1"><Mail size={13} />{viewing.company.email}</span>}
                </div>
                {viewing.company.address && <p className="mt-1 text-sm text-slate-500">{viewing.company.address}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-700">Products ({viewing.products.length})</h4>
                <div className="space-y-1.5">
                  {viewing.products.length === 0 ? <p className="text-sm text-slate-400">No products</p> :
                    viewing.products.map((p: any) => <div key={p.id || p.name} className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-medium">{p.name}</span> — {p.stock_quantity} in stock</div>)}
                </div>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-700">Suppliers ({viewing.suppliers.length})</h4>
                <div className="space-y-1.5">
                  {viewing.suppliers.length === 0 ? <p className="text-sm text-slate-400">No suppliers</p> :
                    viewing.suppliers.map((s: any) => <div key={s.id || s.name} className="rounded-lg bg-slate-50 px-3 py-2 text-sm"><span className="font-medium">{s.name}</span> {Number(s.balance) > 0 && <Badge variant="red">{s.balance}</Badge>}</div>)}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function CompanyForm({ open, onClose, onSave, editing }: { open: boolean; onClose: () => void; onSave: (d: Partial<Company>) => void; editing: Company | null }) {
  const [form, setForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '', description: '' });
  useEffect(() => {
    if (editing) setForm({ name: editing.name, contact_person: editing.contact_person || '', phone: editing.phone || '', email: editing.email || '', address: editing.address || '', description: editing.description || '' });
    else setForm({ name: '', contact_person: '', phone: '', email: '', address: '', description: '' });
  }, [editing, open]);
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Company' : 'Add Company'} size="md" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(form)} disabled={!form.name}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Company Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
        <Field label="Contact Person"><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        </div>
        <Field label="Address"><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></Field>
        <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></Field>
      </div>
    </Modal>
  );
}
