import { useEffect, useState, useCallback, useRef } from 'react';
import { api, getApiBase } from '@/lib/api';
import type { Settings as SettingsType, AppUser, TaxRate } from '@/lib/types';
import { useToast } from '@/components/Toast';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/Button';
import { Field, Input, Select, Textarea } from '@/components/Form';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal, ConfirmModal } from '@/components/Modal';
import { Store, Users, Percent, FileText, Database, Plus, Pencil, Trash2, Download, Upload, Save, AlertTriangle, ShieldAlert, CheckCircle2, ArrowRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'business' | 'users' | 'taxes' | 'invoice' | 'backup';

export function Settings() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<Tab>('business');
  const tabs = [
    { key: 'business' as Tab, label: 'Business', icon: <Store size={16} /> },
    ...(isAdmin ? [{ key: 'users' as Tab, label: 'Users', icon: <Users size={16} /> }] : []),
    { key: 'taxes' as Tab, label: 'Taxes', icon: <Percent size={16} /> },
    { key: 'invoice' as Tab, label: 'Invoice', icon: <FileText size={16} /> },
    ...(isAdmin ? [{ key: 'backup' as Tab, label: 'Backup', icon: <Database size={16} /> }] : []),
  ];

  return (
    <div>
      <PageHeader title="Settings" subtitle="Configure your store, users, taxes, and more" />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={cn('inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition', tab === t.key ? 'bg-sky-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50')}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {tab === 'business' && <BusinessSettings />}
      {tab === 'users' && isAdmin && <UserSettings />}
      {tab === 'taxes' && <TaxSettings />}
      {tab === 'invoice' && <InvoiceSettings />}
      {tab === 'backup' && isAdmin && <BackupSettings />}
    </div>
  );
}

function BusinessSettings() {
  const { refresh, logoSrc } = useSettings();
  const { isManager } = useAuth();
  const { notify } = useToast();
  const [form, setForm] = useState<Partial<SettingsType>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<SettingsType>('/api/settings')
      .then((data) => { setForm(data || {}); })
      .catch(() => { setForm({}); })
      .finally(() => setLoading(false));
  }, []);

  const previewSrc = form.logo_url
    ? (form.logo_url.startsWith('http') || form.logo_url.startsWith('data:')
      ? form.logo_url
      : `${getApiBase()}${form.logo_url}`)
    : logoSrc;

  const save = async () => {
    try {
      const { id, created_at, updated_at, ...updates } = form as any;
      await api.put('/api/settings', updates);
      refresh();
      notify('Settings saved', 'success');
    } catch (e: any) {
      notify(e.message || 'Failed to save', 'error');
    }
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const res = await api.uploadLogo(file);
      setForm((prev) => ({ ...prev, logo_url: res.logo_url || prev.logo_url }));
      refresh();
      notify('Logo uploaded and saved locally', 'success');
    } catch (e: any) {
      notify(e.message || 'Logo upload failed', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (loading) return <Spinner />;

  return (
    <Card className="p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Store Name"><Input value={form.store_name || ''} onChange={(e) => setForm({ ...form, store_name: e.target.value })} /></Field>
        <Field label="Logo (offline local file)">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              {previewSrc ? (
                <img src={previewSrc} alt="Logo" className="h-12 w-12 rounded-xl object-cover ring-1 ring-slate-200" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-xs text-slate-400">No logo</div>
              )}
              {isManager && (
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadLogo(file);
                    }}
                  />
                  <Button type="button" size="sm" variant="outline" icon={<Upload size={16} />} onClick={() => fileRef.current?.click()} disabled={uploading}>
                    {uploading ? 'Uploading...' : 'Upload Logo'}
                  </Button>
                </>
              )}
            </div>
            <p className="text-xs text-slate-400">Logo is stored on this PC for offline use.</p>
          </div>
        </Field>
        <Field label="Phone"><Input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="Email"><Input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Business NTN"><Input value={form.ntn || ''} onChange={(e) => setForm({ ...form, ntn: e.target.value })} placeholder="Optional" /></Field>
        <Field label="Address" className="sm:col-span-2"><Textarea value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></Field>
        <Field label="Currency"><Input value={form.currency || ''} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></Field>
        <Field label="Currency Symbol"><Input value={form.currency_symbol || ''} onChange={(e) => setForm({ ...form, currency_symbol: e.target.value })} /></Field>
        <Field label="Time Zone"><Input value={form.timezone || ''} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></Field>
        <Field label="Receipt Footer"><Input value={form.receipt_footer || ''} onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })} /></Field>
      </div>
      <div className="mt-5"><Button icon={<Save size={18} />} onClick={save}>Save Changes</Button></div>
    </Card>
  );
}

function UserSettings() {
  const { notify } = useToast();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<AppUser[]>('/api/auth/users');
      setUsers((data || []).sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (data: Partial<AppUser> & { password?: string }) => {
    try {
      if (editing) {
        const { password, ...rest } = data;
        const payload: any = { ...rest };
        if (password) payload.password = password;
        await api.put(`/api/auth/users/${editing.id}`, payload);
        notify('User updated', 'success');
      } else {
        await api.post('/api/auth/users', data);
        notify('User added', 'success');
      }
      setShowForm(false); setEditing(null); load();
    } catch (e: any) {
      notify(e.message || 'Failed to save user', 'error');
    }
  };

  const remove = async (u: AppUser) => {
    try {
      await api.delete(`/api/auth/users/${u.id}`);
      notify('User deleted', 'success');
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to delete', 'error');
    }
  };

  if (loading) return <Spinner />;

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-800">Staff Users</h3>
        <Button size="sm" icon={<Plus size={16} />} onClick={() => { setEditing(null); setShowForm(true); }}>Add User</Button>
      </div>
      {users.length === 0 ? <EmptyState icon={<Users size={28} />} title="No users" /> : (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Phone</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}</td><td>{u.email || '—'}</td><td><Badge variant={u.role === 'admin' ? 'blue' : 'gray'}>{u.role}</Badge></td><td>{u.phone || '—'}</td><td><Badge variant={u.active ? 'green' : 'red'}>{u.active ? 'Active' : 'Inactive'}</Badge></td>
                  <td><div className="flex justify-end gap-1"><button onClick={() => { setEditing(u); setShowForm(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Pencil size={16} /></button><button onClick={() => setDeleteTarget(u)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <UserForm open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} onSave={save} editing={editing} />
      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && remove(deleteTarget)} title="Delete User" message={`Delete ${deleteTarget?.name}?`} confirmLabel="Delete" danger />
    </Card>
  );
}

function UserForm({ open, onClose, onSave, editing }: { open: boolean; onClose: () => void; onSave: (d: Partial<AppUser> & { password?: string }) => void; editing: AppUser | null }) {
  const [form, setForm] = useState({ name: '', email: '', role: 'staff', phone: '', active: true, password: '' });
  useEffect(() => {
    if (editing) setForm({ name: editing.name, email: editing.email || '', role: editing.role, phone: editing.phone || '', active: editing.active, password: '' });
    else setForm({ name: '', email: '', role: 'staff', phone: '', active: true, password: '' });
  }, [editing, open]);
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit User' : 'Add User'} size="md" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(form)} disabled={!form.name || (!editing && !form.password)}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label={editing ? 'Password (leave blank to keep)' : 'Password'} required={!editing}>
          <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editing ? '••••••••' : 'Required'} />
        </Field>
        <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label="Role"><Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option value="admin">Admin</option><option value="manager">Manager</option><option value="staff">Staff</option></Select></Field>
        <Field label="Status"><Select value={String(form.active)} onChange={(e) => setForm({ ...form, active: e.target.value === 'true' })}><option value="true">Active</option><option value="false">Inactive</option></Select></Field>
      </div>
    </Modal>
  );
}

function TaxSettings() {
  const { notify } = useToast();
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const [form, setForm] = useState({ name: '', percentage: 0, inclusive: false });

  const load = useCallback(async () => {
    try {
      const data = await api.get<TaxRate[]>('/api/data/tax_rates');
      setRates((data || []).sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      setRates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    try {
      if (editing) { await api.put(`/api/data/tax_rates/${editing.id}`, form); notify('Tax rate updated', 'success'); }
      else { await api.post('/api/data/tax_rates', form); notify('Tax rate added', 'success'); }
      setShowForm(false); setEditing(null); load();
    } catch (e: any) {
      notify(e.message || 'Failed to save', 'error');
    }
  };

  const remove = async (t: TaxRate) => {
    try {
      await api.delete(`/api/data/tax_rates/${t.id}`);
      notify('Tax rate deleted', 'success');
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to delete', 'error');
    }
  };

  if (loading) return <Spinner />;

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h3 className="text-base font-semibold text-slate-800">Tax Rates</h3>
        <Button size="sm" icon={<Plus size={16} />} onClick={() => { setEditing(null); setForm({ name: '', percentage: 0, inclusive: false }); setShowForm(true); }}>Add Tax Rate</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Percentage</th><th>Type</th><th className="text-right">Actions</th></tr></thead>
          <tbody>
            {rates.map((t) => (
              <tr key={t.id}><td className="font-medium">{t.name}</td><td>{t.percentage}%</td><td><Badge variant={t.inclusive ? 'blue' : 'gray'}>{t.inclusive ? 'Inclusive' : 'Exclusive'}</Badge></td><td><div className="flex justify-end gap-1"><button onClick={() => { setEditing(t); setForm({ name: t.name, percentage: t.percentage, inclusive: t.inclusive }); setShowForm(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Pencil size={16} /></button><button onClick={() => remove(t)} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={16} /></button></div></td></tr>
            ))}
            {rates.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-slate-400">No tax rates</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? 'Edit Tax Rate' : 'Add Tax Rate'} size="sm" footer={<><Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button><Button onClick={save} disabled={!form.name}>Save</Button></>}>
        <div className="space-y-3">
          <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
          <Field label="Percentage"><Input type="number" value={form.percentage || ''} onChange={(e) => setForm({ ...form, percentage: Number(e.target.value) })} /></Field>
          <Field label="Type"><Select value={String(form.inclusive)} onChange={(e) => setForm({ ...form, inclusive: e.target.value === 'true' })}><option value="false">Exclusive (added to price)</option><option value="true">Inclusive (included in price)</option></Select></Field>
        </div>
      </Modal>
    </Card>
  );
}

function InvoiceSettings() {
  const { settings, refresh } = useSettings();
  const { notify } = useToast();
  const [form, setForm] = useState<Partial<SettingsType>>({});

  useEffect(() => {
    if (settings) setForm({ ...settings });
  }, [settings]);

  const save = async () => {
    try {
      await api.put('/api/settings', {
        invoice_prefix: form.invoice_prefix,
        receipt_size: form.receipt_size || 'A5',
        terms_conditions: form.terms_conditions,
        barcode_on_invoice: form.barcode_on_invoice,
      });
      refresh(); notify('Invoice settings saved', 'success');
    } catch (e: any) {
      notify(e.message || 'Failed to save', 'error');
    }
  };

  if (!settings) return <Spinner />;

  return (
    <Card className="p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Invoice Prefix"><Input value={form.invoice_prefix || ''} onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })} /></Field>
        <Field label="Receipt / Paper Size">
          <Select value={form.receipt_size || 'A5'} onChange={(e) => setForm({ ...form, receipt_size: e.target.value })}>
            <option value="A5">A5 — Half Page (148.5mm × 210mm)</option>
            <option value="A4">A4 — Full Page (210mm × 297mm)</option>
          </Select>
        </Field>
        <Field label="Terms & Conditions" className="sm:col-span-2"><Textarea value={form.terms_conditions || ''} onChange={(e) => setForm({ ...form, terms_conditions: e.target.value })} rows={4} /></Field>
        <Field label="Barcode on Invoice"><Select value={String(form.barcode_on_invoice)} onChange={(e) => setForm({ ...form, barcode_on_invoice: e.target.value === 'true' })}><option value="true">Show barcode</option><option value="false">Hide barcode</option></Select></Field>
      </div>
      <div className="mt-5"><Button icon={<Save size={18} />} onClick={save}>Save Changes</Button></div>
    </Card>
  );
}

function BackupSettings() {
  const { notify } = useToast();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  // Danger Zone / Reset Database state
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [downloadedBackup, setDownloadedBackup] = useState(false);
  const [resetMode, setResetMode] = useState<'transactional_only' | 'factory_reset'>('transactional_only');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [resetting, setResetting] = useState(false);

  const exportData = async () => {
    setExporting(true);
    try {
      const tables = [
        'categories', 'brands', 'companies', 'products', 'customers', 'suppliers', 'routes', 'sales_reps',
        'orders', 'order_items', 'order_payments', 'purchase_orders', 'purchase_items',
        'expenses', 'expense_categories', 'transactions', 'payment_accounts', 'tax_rates', 'stock_movements',
        'product_batches', 'sales_returns', 'purchase_returns', 'deliveries', 'delivery_items', 'held_orders',
        'customer_product_prices',
      ];
      const backup: any = { _meta: { version: 2, exported_at: new Date().toISOString(), preserve_ids: true } };
      for (const t of tables) {
        try {
          backup[t] = await api.get(`/api/data/${t}?limit=50000`) || [];
        } catch {
          backup[t] = [];
        }
      }
      try {
        backup.settings = [await api.get('/api/settings')].filter(Boolean);
      } catch {
        backup.settings = [];
      }
      // Users exported without passwords — restore logins via AppData DB copy
      try {
        backup.app_users = await api.get('/api/auth/users') || [];
      } catch {
        backup.app_users = [];
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `inventory_backup_${new Date().toISOString().split('T')[0]}.json`; a.click();
      notify('Backup exported (IDs preserved)', 'success');
    } catch (e: any) {
      notify(e.message || 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  };

  const importData = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      let imported = 0;
      let errors = 0;

      // Parent tables first so FKs resolve when upserting
      const order = [
        'categories', 'brands', 'companies', 'products', 'customers', 'suppliers', 'routes', 'sales_reps',
        'payment_accounts', 'tax_rates', 'expense_categories',
        'orders', 'order_items', 'order_payments',
        'purchase_orders', 'purchase_items',
        'expenses', 'transactions', 'stock_movements', 'product_batches',
        'sales_returns', 'purchase_returns', 'deliveries', 'delivery_items', 'held_orders',
        'customer_product_prices',
        'settings',
      ];

      for (const table of order) {
        const rows = backup[table];
        if (!Array.isArray(rows) || rows.length === 0) continue;
        if (table === 'settings') {
          for (const row of rows as any[]) {
            const { id, created_at, updated_at, ...rest } = row;
            try {
              await api.put('/api/settings', rest);
              imported += 1;
            } catch {
              errors += 1;
            }
          }
          continue;
        }
        for (const row of rows as any[]) {
          try {
            // Preserve id for FK integrity
            await api.post(`/api/data/${table}?restore=1`, row);
            imported += 1;
          } catch {
            errors += 1;
          }
        }
      }

      notify(
        `Import finished: ${imported} records upserted${errors ? `, ${errors} skipped` : ''}. Users/passwords are not restored — copy inventory.db for full login restore.`,
        errors ? 'info' : 'success'
      );
    } catch {
      notify('Invalid backup file', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleExecuteReset = async () => {
    if (confirmPhrase !== 'RESET ALL DATA') return;
    setResetting(true);
    try {
      const res = await api.post('/api/settings/reset-database', {
        mode: resetMode,
        confirmation: confirmPhrase,
      });
      notify(res?.message || 'System data reset successfully!', 'success');
      setShowResetModal(false);
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (e: any) {
      notify(e.message || 'Failed to reset database', 'error');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border border-amber-200 bg-amber-50/60 p-5">
        <h3 className="text-sm font-semibold text-amber-900">Recommended full backup (offline)</h3>
        <p className="mt-1 text-sm text-amber-800">
          With the app closed, copy the folder{' '}
          <code className="rounded bg-white/80 px-1 text-xs">%AppData%\Roaming\inventory-manager\</code>{' '}
          (includes <strong>inventory.db</strong> + <strong>uploads</strong> logo). This is the safest way to move
          data to another PC or after installing a new EXE.
        </p>
      </Card>

      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-sky-600"><Download size={24} /></div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-800">Export JSON Backup</h3>
            <p className="mt-1 text-sm text-slate-500">
              Download business data with record IDs kept (products, orders, customers, etc.). Use for in-app restore.
              User passwords are not included — use the AppData folder copy for full login restore.
            </p>
            <Button className="mt-3" icon={<Download size={18} />} onClick={exportData} disabled={exporting || importing}>
              {exporting ? 'Exporting...' : 'Export Backup'}
            </Button>
          </div>
        </div>
      </Card>
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600"><Upload size={24} /></div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-800">Import JSON Backup</h3>
            <p className="mt-1 text-sm text-slate-500">
              Restore/upsert records from an exported JSON file (IDs preserved so orders stay linked). Does not recreate
              user passwords.
            </p>
            <input
              type="file"
              accept=".json"
              disabled={importing || exporting}
              className="mt-3 block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-sky-700 hover:file:bg-sky-100"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                await importData(file);
              }}
            />
            {importing && <p className="mt-2 text-sm text-sky-600">Importing… please wait</p>}
          </div>
        </div>
      </Card>

      {/* Danger Zone: Reset Database / Wipe Test Data */}
      <Card className="border-2 border-red-300 bg-red-50/40 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600">
            <AlertTriangle size={24} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-red-900">Danger Zone: Reset Database / Wipe Test Data</h3>
              <Badge variant="red">Admin Only</Badge>
            </div>
            <p className="mt-1 text-sm text-red-800">
              Clear test transactions to start your store fresh, or perform a complete factory wipe.
              For data safety, the system requires downloading a mandatory safety backup before resetting.
            </p>
            <Button
              variant="danger"
              className="mt-4"
              icon={<Trash2 size={16} />}
              onClick={() => {
                setShowResetModal(true);
                setResetStep(1);
                setDownloadedBackup(false);
                setConfirmPhrase('');
              }}
            >
              Reset Database...
            </Button>
          </div>
        </div>
      </Card>

      {/* Reset Database Modal */}
      <Modal
        open={showResetModal}
        onClose={() => {
          if (!resetting) {
            setShowResetModal(false);
            setResetStep(1);
            setDownloadedBackup(false);
            setConfirmPhrase('');
          }
        }}
        title="Reset System Data (Danger Zone)"
        size="lg"
        footer={
          resetStep === 1 ? (
            <div className="flex w-full items-center justify-between">
              <Button
                variant="outline"
                onClick={() => setShowResetModal(false)}
                disabled={exporting}
              >
                Cancel
              </Button>
              <Button
                icon={<ArrowRight size={16} />}
                onClick={() => setResetStep(2)}
                disabled={!downloadedBackup || exporting}
              >
                Proceed to Step 2
              </Button>
            </div>
          ) : (
            <div className="flex w-full items-center justify-between">
              <Button
                variant="outline"
                icon={<ArrowLeft size={16} />}
                onClick={() => setResetStep(1)}
                disabled={resetting}
              >
                Back to Step 1
              </Button>
              <Button
                variant="danger"
                icon={<Trash2 size={16} />}
                onClick={handleExecuteReset}
                disabled={confirmPhrase !== 'RESET ALL DATA' || resetting}
              >
                {resetting ? 'Resetting System Data...' : 'Permanently Reset Data'}
              </Button>
            </div>
          )
        }
      >
        <div className="space-y-4">
          {resetStep === 1 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
                <div className="flex items-center gap-2 font-semibold">
                  <ShieldAlert size={18} className="text-amber-700" />
                  <span>Step 1: Download Mandatory Safety Backup</span>
                </div>
                <p className="mt-1 text-xs text-amber-800">
                  Resetting the database permanently alters or deletes records. To prevent accidental data loss, you must download a full JSON backup of the existing database before continuing.
                </p>
              </div>

              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                <Download size={36} className="text-slate-400 mb-2" />
                <h4 className="text-sm font-semibold text-slate-800">Download Safety Backup</h4>
                <p className="mt-1 max-w-md text-xs text-slate-500">
                  Click the button below to download your complete database snapshot. You can re-import this JSON file at any time from Settings &gt; Backup.
                </p>
                <Button
                  className="mt-4"
                  icon={<Download size={16} />}
                  onClick={async () => {
                    await exportData();
                    setDownloadedBackup(true);
                  }}
                  disabled={exporting}
                >
                  {exporting
                    ? 'Exporting Backup...'
                    : downloadedBackup
                    ? 'Download Backup Again (.json)'
                    : 'Download Full Safety Backup (.json)'}
                </Button>
              </div>

              {downloadedBackup && (
                <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm font-medium text-emerald-800">
                  <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                  <span>Safety backup saved to your Downloads. You can now click "Proceed to Step 2".</span>
                </div>
              )}
            </div>
          )}

          {resetStep === 2 && (
            <div className="space-y-5">
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle size={18} className="text-red-700" />
                  <span>Step 2: Choose Reset Mode & Confirm Destruction</span>
                </div>
                <p className="mt-1 text-xs text-red-800">
                  This action is permanent and cannot be undone. Please select the appropriate wipe mode below carefully.
                </p>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">Select Reset Mode</label>
                
                {/* Option A: Transactional Reset */}
                <div
                  onClick={() => setResetMode('transactional_only')}
                  className={cn(
                    'cursor-pointer rounded-xl border p-4 transition',
                    resetMode === 'transactional_only'
                      ? 'border-sky-500 bg-sky-50/60 ring-2 ring-sky-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="reset_mode"
                        checked={resetMode === 'transactional_only'}
                        onChange={() => setResetMode('transactional_only')}
                        className="h-4 w-4 text-sky-600"
                      />
                      <span className="font-semibold text-slate-800">Reset Test & Transactional Records</span>
                    </div>
                    <Badge variant="blue">Recommended</Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-600 pl-6">
                    Wipes all test sales orders, returns, purchase orders, purchase returns, expenses, drawer transactions, and resets all product stocks and customer/supplier balances to 0.
                  </p>
                  <p className="mt-1 text-xs font-medium text-emerald-700 pl-6">
                    ✓ Preserves: Products catalogue, categories, brands, customers, suppliers, payment accounts, and store settings.
                  </p>
                </div>

                {/* Option B: Factory Reset */}
                <div
                  onClick={() => setResetMode('factory_reset')}
                  className={cn(
                    'cursor-pointer rounded-xl border p-4 transition',
                    resetMode === 'factory_reset'
                      ? 'border-red-500 bg-red-50/60 ring-2 ring-red-500/20'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="reset_mode"
                        checked={resetMode === 'factory_reset'}
                        onChange={() => setResetMode('factory_reset')}
                        className="h-4 w-4 text-red-600"
                      />
                      <span className="font-semibold text-slate-800">Complete Factory Reset</span>
                    </div>
                    <Badge variant="red">Total Wipe</Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-600 pl-6">
                    Permanently deletes ALL products, categories, brands, customers, suppliers, orders, expenses, and history. Completely resets to initial blank state.
                  </p>
                  <p className="mt-1 text-xs font-medium text-red-700 pl-6">
                    ⚠ Warning: Only your current admin login account is kept. Everything else is wiped.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <label className="block text-xs font-semibold text-slate-700">
                  To confirm, type <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-red-700 font-bold">RESET ALL DATA</span> in the box below:
                </label>
                <Input
                  value={confirmPhrase}
                  onChange={(e) => setConfirmPhrase(e.target.value)}
                  placeholder="RESET ALL DATA"
                  className="font-mono text-sm"
                  autoFocus
                />
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
