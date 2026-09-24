import { useEffect, useState, useCallback, useRef } from 'react';
import { api, resolveImageUrl } from '@/lib/api';
import type { Category, Brand, Product, StockMovement } from '@/lib/types';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/Button';
import { Field, Input, Select } from '@/components/Form';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal, ConfirmModal } from '@/components/Modal';
import { Pagination } from '@/components/Pagination';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import { Plus, Pencil, Trash2, Tag, Layers, ArrowDown, ArrowUp, Sliders, AlertTriangle, Search, Upload, X, Image as ImageIcon } from 'lucide-react';

// ===== CATEGORIES =====
export function Categories() {
  const { notify } = useToast();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', description: '', color: '#0ea5e9' });
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Category[]>('/api/data/categories');
      setItems((data || []).sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      if (editing) {
        await api.put(`/api/data/categories/${editing.id}`, form);
        notify('Category updated', 'success');
      } else {
        await api.post('/api/data/categories', form);
        notify('Category added', 'success');
      }
      setShowForm(false); setEditing(null); load();
    } catch (e: any) {
      notify(e.message || 'Failed to save', 'error');
    }
  };

  const remove = async (c: Category) => {
    try {
      await api.delete(`/api/data/categories/${c.id}`);
      notify('Category deleted', 'success');
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to delete', 'error');
    }
  };

  if (loading) return <div><PageHeader title="Categories" /><Spinner /></div>;

  const q = search.toLowerCase().trim();
  const filtered = items.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.description || '').toLowerCase().includes(q));

  return (
    <div>
      <PageHeader title="Categories" subtitle={`${items.length} categories`} actions={<Button icon={<Plus size={18} />} onClick={() => { setEditing(null); setForm({ name: '', description: '', color: '#0ea5e9' }); setShowForm(true); }}>Add Category</Button>} />
      <div className="mb-4 relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search categories..."
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
        />
      </div>
      {filtered.length === 0 ? (
        <Card><EmptyState icon={<Tag size={32} />} title="No categories" action={<Button icon={<Plus size={18} />} onClick={() => setShowForm(true)}>Add Category</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="h-10 w-10 rounded-xl" style={{ backgroundColor: c.color || '#0ea5e9' }} />
                  <div>
                    <p className="font-semibold text-slate-800">{c.name}</p>
                    <p className="text-sm text-slate-500">{c.description || 'No description'}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(c); setForm({ name: c.name, description: c.description || '', color: c.color || '#0ea5e9' }); setShowForm(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Pencil size={15} /></button>
                  <button onClick={() => setDeleteTarget(c)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15} /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? 'Edit Category' : 'Add Category'} size="sm" footer={<><Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button><Button onClick={save} disabled={!form.name}>Save</Button></>}>
        <div className="space-y-3">
          <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
          <Field label="Description"><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Color"><input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-full rounded-lg border border-slate-300" /></Field>
        </div>
      </Modal>
      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && remove(deleteTarget)} title="Delete Category" message={`Delete ${deleteTarget?.name}?`} confirmLabel="Delete" danger />
    </div>
  );
}

// ===== BRANDS =====
export function Brands() {
  const { notify } = useToast();
  const [items, setItems] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null);
  const [form, setForm] = useState({ name: '', description: '', logo_url: '' });
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Brand[]>('/api/data/brands');
      setItems((data || []).sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const res = await api.uploadFile(file);
      setForm((prev) => ({ ...prev, logo_url: res.url }));
      notify('Brand logo uploaded', 'success');
    } catch (e: any) {
      notify(e.message || 'Logo upload failed', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const save = async () => {
    try {
      if (editing) {
        await api.put(`/api/data/brands/${editing.id}`, form);
        notify('Brand updated', 'success');
      } else {
        await api.post('/api/data/brands', form);
        notify('Brand added', 'success');
      }
      setShowForm(false); setEditing(null); load();
    } catch (e: any) {
      notify(e.message || 'Failed to save', 'error');
    }
  };

  const remove = async (b: Brand) => {
    try {
      await api.delete(`/api/data/brands/${b.id}`);
      notify('Brand deleted', 'success');
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to delete', 'error');
    }
  };

  if (loading) return <div><PageHeader title="Brands" /><Spinner /></div>;

  const q = search.toLowerCase().trim();
  const filtered = items.filter((b) => !q || b.name.toLowerCase().includes(q) || (b.description || '').toLowerCase().includes(q));

  return (
    <div>
      <PageHeader
        title="Brands"
        subtitle={`${items.length} brands`}
        actions={
          <Button
            icon={<Plus size={18} />}
            onClick={() => {
              setEditing(null);
              setForm({ name: '', description: '', logo_url: '' });
              setShowForm(true);
            }}
          >
            Add Brand
          </Button>
        }
      />
      <div className="mb-4 relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search brands..."
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
        />
      </div>
      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Layers size={32} />}
            title="No brands"
            action={
              <Button
                icon={<Plus size={18} />}
                onClick={() => {
                  setEditing(null);
                  setForm({ name: '', description: '', logo_url: '' });
                  setShowForm(true);
                }}
              >
                Add Brand
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((b) => (
            <Card key={b.id} className="p-4 transition hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {b.logo_url ? (
                    <img
                      src={resolveImageUrl(b.logo_url) || b.logo_url}
                      alt={b.name}
                      className="h-11 w-11 shrink-0 rounded-xl object-contain bg-slate-50 p-1 ring-1 ring-slate-200"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                      <Layers size={18} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-800 truncate">{b.name}</p>
                    <p className="text-sm text-slate-500 truncate">{b.description || 'No description'}</p>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0 ml-2">
                  <button
                    onClick={() => {
                      setEditing(b);
                      setForm({ name: b.name, description: b.description || '', logo_url: b.logo_url || '' });
                      setShowForm(true);
                    }}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                    title="Edit Brand"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(b)}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                    title="Delete Brand"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null); }}
        title={editing ? 'Edit Brand' : 'Add Brand'}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.name || uploading}>
              {uploading ? 'Uploading...' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Brand Name" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Lu Prince, Peek Freans, Rio"
              autoFocus
            />
          </Field>

          <Field label="Description">
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Optional brand description"
            />
          </Field>

          <Field label="Brand Logo (from computer)">
            <div className="flex items-center gap-3">
              {form.logo_url ? (
                <div className="relative group shrink-0">
                  <img
                    src={resolveImageUrl(form.logo_url) || form.logo_url}
                    alt="Brand Logo"
                    className="h-14 w-14 rounded-xl object-contain bg-slate-50 p-1 ring-1 ring-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, logo_url: '' }))}
                    className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm hover:bg-rose-600 transition"
                    title="Remove logo"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400">
                  <ImageIcon size={22} className="text-slate-300" />
                </div>
              )}
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadLogo(file);
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  icon={<Upload size={15} />}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? 'Uploading...' : form.logo_url ? 'Change Logo' : 'Upload Logo'}
                </Button>
                <p className="mt-1 text-xs text-slate-400">Upload PNG, JPG or WebP from PC</p>
              </div>
            </div>
          </Field>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && remove(deleteTarget)}
        title="Delete Brand"
        message={`Delete brand "${deleteTarget?.name}"?`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}

// ===== STOCK MANAGEMENT =====
export function StockManagement() {
  const { symbol } = useSettings();
  const { notify } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'adjust' | 'history' | 'valuation'>('adjust');
  const [adjustModal, setAdjustModal] = useState<Product | null>(null);
  const [adjustForm, setAdjustForm] = useState({ type: 'in', quantity: 0, note: '' });
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, m] = await Promise.all([
        api.get<Product[]>('/api/data/products?limit=10000'),
        api.get<StockMovement[]>('/api/data/stock_movements'),
      ]);
      const productList = (p || []).sort((a, b) => a.name.localeCompare(b.name));
      const productMap = new Map(productList.map((x) => [x.id, x]));
      setProducts(productList);
      setMovements(
        (m || [])
          .map((mov) => ({
            ...mov,
            products: productMap.get(mov.product_id) ? { name: productMap.get(mov.product_id)!.name } : null,
          }))
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .slice(0, 50)
      );
    } catch {
      setProducts([]);
      setMovements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, tab]);

  const doAdjust = async () => {
    if (!adjustModal || adjustForm.quantity <= 0) return;
    try {
      const qty = adjustForm.type === 'in' ? adjustForm.quantity : -adjustForm.quantity;
      const newQty = adjustModal.stock_quantity + qty;
      if (newQty < 0) { notify('Insufficient stock', 'error'); return; }
      await api.put(`/api/data/products/${adjustModal.id}`, { stock_quantity: newQty });
      await api.post('/api/data/stock_movements', {
        product_id: adjustModal.id, type: adjustForm.type, quantity: qty, note: adjustForm.note,
      });
      notify('Stock adjusted', 'success');
      setAdjustModal(null); setAdjustForm({ type: 'in', quantity: 0, note: '' }); load();
    } catch (e: any) {
      notify(e.message || 'Failed to adjust stock', 'error');
    }
  };

  if (loading) return <div><PageHeader title="Stock Management" /><Spinner /></div>;

  const q = search.toLowerCase().trim();
  const filteredProducts = products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q));
  const filteredMovements = movements.filter((m) =>
    !q
    || m.products?.name?.toLowerCase().includes(q)
    || m.note?.toLowerCase().includes(q)
    || m.type?.toLowerCase().includes(q)
  );

  const totalValue = filteredProducts.reduce((s, p) => s + p.stock_quantity * (p.cost_price || p.purchase_price || 0), 0);
  const lowStock = filteredProducts.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= p.min_stock_level);
  const outStock = filteredProducts.filter((p) => p.stock_quantity <= 0);

  return (
    <div>
      <PageHeader title="Stock Management" subtitle="Track and adjust inventory levels" />

      <div className="mb-4 relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products..."
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
        />
      </div>

      <div className="mb-4 flex gap-2">
        {[
          { key: 'adjust', label: 'Stock Adjustment', icon: <Sliders size={16} /> },
          { key: 'history', label: 'Stock History', icon: <ArrowDown size={16} /> },
          { key: 'valuation', label: 'Stock Valuation', icon: <Layers size={16} /> },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as any)} className={cn('inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition', tab === t.key ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50')}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'adjust' && (
        <Card>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Product</th><th>Current Stock</th><th>Min Level</th><th>Status</th><th className="text-right">Action</th></tr></thead>
              <tbody>
                {filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium text-slate-800">{p.name}</td>
                    <td>{p.stock_quantity} cartons</td>
                    <td>{p.min_stock_level} cartons</td>
                    <td>{p.stock_quantity <= 0 ? <Badge variant="red">Out</Badge> : p.stock_quantity <= p.min_stock_level ? <Badge variant="amber">Low</Badge> : <Badge variant="green">OK</Badge>}</td>
                    <td className="text-right">
                      <Button size="sm" variant="outline" onClick={() => { setAdjustModal(p); setAdjustForm({ type: 'in', quantity: 0, note: '' }); }}>Adjust</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalItems={filteredProducts.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[25, 50, 100, 200]}
            itemLabel="products"
            className="border-t border-slate-100 rounded-t-none"
          />
        </Card>
      )}

      {tab === 'history' && (
        <Card>
          {filteredMovements.length === 0 ? <EmptyState icon={<ArrowDown size={28} />} title="No stock movements yet" /> : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>Product</th><th>Type</th><th>Quantity</th><th>Note</th><th>Date</th></tr></thead>
                <tbody>
                  {filteredMovements.map((m) => (
                    <tr key={m.id}>
                      <td className="font-medium">{m.products?.name || '—'}</td>
                      <td><Badge variant={m.type === 'in' || m.type === 'sale' ? 'blue' : m.type === 'out' || m.quantity < 0 ? 'amber' : 'gray'}>{m.type}</Badge></td>
                      <td className={cn('font-medium', Number(m.quantity) < 0 ? 'text-rose-600' : 'text-emerald-600')}>{Number(m.quantity) > 0 ? '+' : ''}{m.quantity}</td>
                      <td className="text-slate-500">{m.note || '—'}</td>
                      <td className="text-slate-500">{formatDateTime(m.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'valuation' && (
        <div>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-5"><p className="text-xs uppercase text-slate-400">Total Stock Value</p><p className="mt-1 text-2xl font-bold text-slate-800">{formatCurrency(totalValue, symbol)}</p></Card>
            <Card className="p-5"><p className="text-xs uppercase text-slate-400">Low Stock Items</p><p className="mt-1 text-2xl font-bold text-amber-600">{lowStock.length}</p></Card>
            <Card className="p-5"><p className="text-xs uppercase text-slate-400">Out of Stock</p><p className="mt-1 text-2xl font-bold text-rose-600">{outStock.length}</p></Card>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>Product</th><th>Stock</th><th>Buy Rate</th><th>Stock Value</th></tr></thead>
                <tbody>
                  {filteredProducts.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium text-slate-800">{p.name}</td>
                      <td>{p.stock_quantity} {p.unit || 'ctn'}</td>
                      <td className="font-semibold text-slate-800">{formatCurrency(p.purchase_price, symbol)}</td>
                      <td className="font-semibold text-slate-900">{formatCurrency(p.stock_quantity * (p.purchase_price || p.cost_price || 0), symbol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={currentPage}
              totalItems={filteredProducts.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[25, 50, 100, 200]}
              itemLabel="products"
              className="border-t border-slate-100 rounded-t-none"
            />
          </Card>
        </div>
      )}

      <Modal open={!!adjustModal} onClose={() => setAdjustModal(null)} title="Stock Adjustment" size="sm" footer={<><Button variant="outline" onClick={() => setAdjustModal(null)}>Cancel</Button><Button onClick={doAdjust} disabled={adjustForm.quantity <= 0}>Apply</Button></>}>
        {adjustModal && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-sm text-slate-500">Product</p><p className="font-semibold text-slate-800">{adjustModal.name}</p><p className="text-sm text-slate-500">Current: {adjustModal.stock_quantity} cartons</p></div>
            <Field label="Type">
              <Select value={adjustForm.type} onChange={(e) => setAdjustForm({ ...adjustForm, type: e.target.value })}>
                <option value="in">Stock In (+)</option>
                <option value="out">Stock Out (−)</option>
                <option value="damaged">Damaged (−)</option>
                <option value="expired">Expired (−)</option>
                <option value="adjustment">Adjustment</option>
              </Select>
            </Field>
            <Field label="Quantity"><Input type="number" value={adjustForm.quantity || ''} onChange={(e) => setAdjustForm({ ...adjustForm, quantity: Number(e.target.value) })} autoFocus /></Field>
            <Field label="Note"><Input value={adjustForm.note} onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })} placeholder="Reason for adjustment" /></Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ===== BARCODES =====
export function Barcodes() {
  const { notify } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [labelType, setLabelType] = useState<'barcode' | 'qr'>('barcode');

  const load = useCallback(async () => {
    try {
      const data = await api.get<Product[]>('/api/data/products?limit=10000');
      setProducts((data || []).sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) => setSelected((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);

  const printLabels = () => {
    if (selected.length === 0) { notify('Select products first', 'error'); return; }
    const items = products.filter((p) => selected.includes(p.id));
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head><title>Barcode Labels</title><style>
      body { font-family: monospace; padding: 20px; }
      .label { display: inline-block; width: 200px; height: 100px; border: 1px solid #ccc; margin: 5px; padding: 10px; text-align: center; vertical-align: top; }
      .name { font-size: 11px; font-weight: bold; margin-bottom: 5px; }
      .code { font-size: 24px; letter-spacing: 2px; }
      .price { font-size: 14px; font-weight: bold; margin-top: 5px; }
      .barcode-lines { height: 30px; background: repeating-linear-gradient(90deg, #000 0, #000 2px, #fff 2px, #fff 4px); margin: 5px 0; }
    </style></head><body>`);
    items.forEach((p) => {
      win.document.write(`<div class="label"><div class="name">${p.name}</div><div class="barcode-lines"></div><div class="code">${p.barcode || p.sku || '—'}</div><div class="price">Rs ${p.retail_price}</div></div>`);
    });
    win.document.write('</body></html>');
    win.document.close();
    win.print();
    notify('Labels sent to print', 'success');
  };

  if (loading) return <div><PageHeader title="Barcode Labels" /><Spinner /></div>;

  return (
    <div>
      <PageHeader
        title="Barcode Labels"
        subtitle="Generate and print barcode/QR labels for products"
        actions={<Button onClick={printLabels}>Print Selected ({selected.length})</Button>}
      />

      <div className="mb-4 flex gap-2">
        <button onClick={() => setLabelType('barcode')} className={cn('rounded-lg px-3 py-2 text-sm font-medium', labelType === 'barcode' ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200')}>Barcode</button>
        <button onClick={() => setLabelType('qr')} className={cn('rounded-lg px-3 py-2 text-sm font-medium', labelType === 'qr' ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200')}>QR Code</button>
        <Button variant="outline" size="sm" onClick={() => setSelected(products.map((p) => p.id))}>Select All</Button>
        <Button variant="outline" size="sm" onClick={() => setSelected([])}>Clear</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((p) => (
          <button
            key={p.id}
            onClick={() => toggle(p.id)}
            className={cn('rounded-xl bg-white p-4 text-left shadow-sm ring-1 transition', selected.includes(p.id) ? 'ring-2 ring-sky-500' : 'ring-slate-200 hover:shadow-md')}
          >
            <div className="mb-2 flex items-center justify-between">
              <input type="checkbox" checked={selected.includes(p.id)} readOnly className="h-4 w-4 rounded accent-sky-600" />
              <span className="text-xs text-slate-400">{labelType === 'barcode' ? 'Barcode' : 'QR'}</span>
            </div>
            <p className="mb-2 truncate text-sm font-medium text-slate-700">{p.name}</p>
            <div className="mb-2 h-12 rounded bg-slate-100 flex items-center justify-center">
              {labelType === 'barcode' ? (
                <div className="h-8 w-full bg-[repeating-linear-gradient(90deg,#000_0,#000_2px,#fff_2px,#fff_4px)]" />
              ) : (
                <div className="grid grid-cols-5 gap-px"><div className="h-1 w-1 bg-slate-800" /><div className="h-1 w-1 bg-white" /><div className="h-1 w-1 bg-slate-800" /><div className="h-1 w-1 bg-white" /><div className="h-1 w-1 bg-slate-800" /><div className="h-1 w-1 bg-white" /><div className="h-1 w-1 bg-slate-800" /><div className="h-1 w-1 bg-slate-800" /><div className="h-1 w-1 bg-white" /><div className="h-1 w-1 bg-slate-800" /></div>
              )}
            </div>
            <p className="text-center text-xs font-mono text-slate-600">{p.barcode || p.sku || '—'}</p>
            <p className="text-center text-sm font-bold text-slate-800">Rs {p.retail_price}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
