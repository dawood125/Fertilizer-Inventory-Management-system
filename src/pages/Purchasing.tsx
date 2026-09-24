import { useEffect, useState, useCallback, useRef } from 'react';
import { api, resolveImageUrl } from '@/lib/api';
import type { PurchaseOrder, Supplier, Product, Company, Brand } from '@/lib/types';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/Button';
import { Field, Input, Select, Textarea, SearchableSelect } from '@/components/Form';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal, ConfirmModal } from '@/components/Modal';
import { Pagination } from '@/components/Pagination';
import { PrintPreview } from '@/components/PrintPreview';
import { PrintDocument, PrintTd, PrintTh } from '@/components/PrintDocument';
import { formatCurrency, formatDateTime, generateDocNumber, cn } from '@/lib/utils';
import { sanitizePdfName } from '@/lib/printPdf';
import { receiveStockBatch } from '@/lib/fifo';
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  Truck,
  Search,
  Package,
  CheckCircle2,
  X,
  Printer,
  DollarSign,
  Receipt,
  Calendar,
  History,
  FileText,
  Wallet,
  RotateCcw,
  Minus,
  PackagePlus,
  Upload,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import { parseCsv, generateCsv, downloadCsv, PO_ITEMS_CSV_HEADERS, PO_ITEMS_CSV_SAMPLE_ROWS } from '@/lib/csv';
import { DateTimeFilter, type DateFilterValue, isWithinDateRange } from '@/components/DateTimeFilter';

// ===== PURCHASE ORDERS =====
export function PurchaseOrders() {
  const { symbol, settings, logoSrc } = useSettings();
  const { notify } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [viewOrder, setViewOrder] = useState<any>(null);
  const [printPreview, setPrintPreview] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({ preset: 'all' });
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const receivingRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, suppliers] = await Promise.all([
        api.get<PurchaseOrder[]>('/api/data/purchase_orders'),
        api.get<Supplier[]>('/api/data/suppliers'),
      ]);
      const supplierMap = new Map((suppliers || []).map((s) => [s.id, s]));
      setOrders(
        (data || [])
          .map((o) => ({
            ...o,
            suppliers: o.supplier_id
              ? { name: supplierMap.get(o.supplier_id)?.name, phone: supplierMap.get(o.supplier_id)?.phone }
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

  const openView = async (po: PurchaseOrder) => {
    try {
      const items = await api.get<any[]>('/api/data/purchase_items');
      setViewOrder({ ...po, items: (items || []).filter((i) => i.purchase_id === po.id) });
      setPrintPreview(false);
    } catch {
      setViewOrder({ ...po, items: [] });
    }
  };

  const receivePO = async (po: any) => {
    if (!po?.id || receivingRef.current.has(po.id)) return;
    receivingRef.current.add(po.id);
    setReceivingId(po.id);
    try {
      let items = po.items || [];
      if (!items.length) {
        const all = await api.get<any[]>('/api/data/purchase_items');
        items = (all || []).filter((i) => i.purchase_id === po.id);
      }
      if (!items.length) {
        notify('No line items found for this purchase order', 'error');
        return;
      }
      for (const item of items) {
        if (item.product_id) {
          const prod = await api.get<any>(`/api/data/products/${item.product_id}`);
          if (prod) {
            const currentStock = Math.max(0, Number(prod.stock_quantity || 0));
            const receivedQty = Math.max(0, Number(item.quantity || 0)); // total pieces
            const receivedRate = Number(item.unit_cost || 0); // buy rate per piece

            // 1. Create a true FIFO inventory batch layer with real chemical batch ID
            await receiveStockBatch(
              item.product_id,
              po.po_number,
              receivedQty,
              receivedRate,
              po.id,
              item.batch_number || undefined
            );

            // 2. Update product stock (in pieces), buy rate, and packing ratio if updated
            const productUpdates: any = {
              stock_quantity: currentStock + receivedQty,
              purchase_price: receivedRate, // Last Purchase Rate per piece
              cost_price: receivedRate,     // Latest buy rate fallback
            };
            if (Number(item.pieces_per_carton) > 0) {
              productUpdates.carton_to_box = Number(item.pieces_per_carton);
            }
            if (Number(item.retail_price) > 0) {
              productUpdates.retail_price = Number(item.retail_price);
            }
            if (Number(item.wholesale_price) > 0) {
              productUpdates.wholesale_price = Number(item.wholesale_price);
            }
            if (Number(item.dealer_price) > 0) {
              productUpdates.dealer_price = Number(item.dealer_price);
            }
            await api.put(`/api/data/products/${item.product_id}`, productUpdates);

            // 3. Record stock movement
            await api.post('/api/data/stock_movements', {
              product_id: item.product_id,
              type: 'in',
              quantity: receivedQty,
              reference_type: 'purchase',
              reference_id: po.id,
              note: `PO ${po.po_number}${item.batch_number ? ` (Batch: ${item.batch_number})` : ''} — ${receivedQty} pieces received @ Rs ${receivedRate}/pc`,
            });
          }
        }
      }
      // Increase supplier payable balance on receive (goods received = liability)
      if (po.supplier_id) {
        const sup = await api.get<any>(`/api/data/suppliers/${po.supplier_id}`);
        if (sup) {
          const due = Math.max(0, Number(po.total) - Number(po.paid_amount || 0));
          await api.put(`/api/data/suppliers/${po.supplier_id}`, {
            balance: Number(sup.balance || 0) + due,
          });
        }
      }
      await api.put(`/api/data/purchase_orders/${po.id}`, {
        status: 'received',
        received_date: new Date().toISOString().slice(0, 10),
      });
      notify('Products received: Stock, Batch ID & Selling Rates updated!', 'success');
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to receive PO', 'error');
    } finally {
      if (po?.id) receivingRef.current.delete(po.id);
      setReceivingId(null);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [search, dateFilter]);

  if (loading) return <div><PageHeader title="Purchase Orders" /><Spinner /></div>;

  const q = search.toLowerCase().trim();
  const filteredOrders = orders.filter((o) => {
    const matchSearch = !q
      || o.po_number?.toLowerCase().includes(q)
      || o.suppliers?.name?.toLowerCase().includes(q);
    const matchDate = isWithinDateRange(o.created_at, dateFilter);
    return matchSearch && matchDate;
  });

  const paginatedOrders = filteredOrders.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div>
      <PageHeader title="Purchase Orders" subtitle={`${orders.length} purchase orders`} actions={<Button icon={<Plus size={18} />} onClick={() => setShowForm(true)}>Create Purchase</Button>} />

      <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PO # or supplier..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </div>
        <DateTimeFilter value={dateFilter} onChange={setDateFilter} />
      </div>

      <div className="mb-2 flex items-center justify-between text-xs text-slate-500 px-1">
        <span>Showing <strong className="text-slate-700">{filteredOrders.length}</strong> of <strong className="text-slate-700">{orders.length}</strong> purchases</span>
        {filteredOrders.length > 0 && (
          <span>Total: <strong className="text-indigo-600 font-semibold">{formatCurrency(filteredOrders.reduce((s, o) => s + Number(o.total || 0), 0), symbol)}</strong></span>
        )}
      </div>

      <Card>
        {filteredOrders.length === 0 ? (
          <EmptyState icon={<Truck size={32} />} title="No purchase orders" description="Create a purchase order to restock" action={<Button icon={<Plus size={18} />} onClick={() => setShowForm(true)}>Create Purchase</Button>} />
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead><tr><th>PO #</th><th>Supplier</th><th>Date</th><th>Total</th><th>Status</th><th>Payment</th><th className="text-right">Actions</th></tr></thead>
                <tbody>
                  {paginatedOrders.map((o) => (
                    <tr key={o.id}>
                      <td className="font-medium text-slate-800">{o.po_number}</td>
                      <td>{o.suppliers?.name || '—'}</td>
                      <td className="text-slate-500">{formatDateTime(o.created_at)}</td>
                      <td className="font-semibold">{formatCurrency(o.total, symbol)}</td>
                      <td><Badge variant={o.status === 'received' ? 'green' : o.status === 'pending' ? 'amber' : 'gray'}>{o.status}</Badge></td>
                      <td><Badge variant={o.payment_status === 'paid' ? 'green' : 'red'}>{o.payment_status}</Badge></td>
                      <td>
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openView(o)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><Eye size={16} /></button>
                          {o.status === 'pending' && (
                            <Button
                              size="sm"
                              variant="success"
                              icon={receivingId === o.id ? <Spinner size="sm" /> : <CheckCircle2 size={14} />}
                              onClick={() => receivePO(o)}
                              disabled={receivingId === o.id}
                            >
                              {receivingId === o.id ? 'Receiving...' : 'Receive'}
                            </Button>
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
              totalItems={filteredOrders.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[10, 25, 50, 100]}
              itemLabel="purchases"
              className="border-t border-slate-100 rounded-t-none"
            />
          </div>
        )}
      </Card>

      <CreatePOModal open={showForm} onClose={() => setShowForm(false)} onCreated={load} />
      <Modal
        open={!!viewOrder && !printPreview}
        onClose={() => setViewOrder(null)}
        title={viewOrder ? `PO ${viewOrder.po_number}` : ''}
        size="lg"
        footer={
          <>
            <Button variant="outline" icon={<Printer size={16} />} onClick={() => setPrintPreview(true)}>Print Preview</Button>
            <Button onClick={() => setViewOrder(null)}>Close</Button>
          </>
        }
      >
        {viewOrder && (
          <div>
            <div className="mb-4 grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-xs text-slate-400">Supplier</p><p className="font-medium">{viewOrder.suppliers?.name || '—'}</p></div>
              <div><p className="text-xs text-slate-400">Date</p><p className="font-medium">{formatDateTime(viewOrder.created_at)}</p></div>
            </div>
            <table className="data-table">
              <thead><tr><th>Product</th><th>Batch #</th><th>Cartons</th><th>Pcs/Ctn</th><th>Total Pcs</th><th>Cost / Pc</th><th>Selling Rates</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {viewOrder.items?.map((it: any) => (
                  <tr key={it.id}>
                    <td className="font-medium text-slate-800">{it.product_name}</td>
                    <td>
                      {it.batch_number ? (
                        <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                          {it.batch_number}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td>{it.cartons || (it.pieces_per_carton ? (it.quantity / it.pieces_per_carton).toFixed(1) : '—')}</td>
                    <td>{it.pieces_per_carton || '—'}</td>
                    <td className="font-semibold">{it.quantity}</td>
                    <td>{formatCurrency(it.unit_cost, symbol)}</td>
                    <td className="text-xs text-slate-600">
                      {it.retail_price || it.wholesale_price || it.dealer_price ? (
                        <span>
                          Ret: {formatCurrency(it.retail_price, symbol)} | WS: {formatCurrency(it.wholesale_price, symbol)} | Dlr: {formatCurrency(it.dealer_price, symbol)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="text-right font-medium">{formatCurrency(it.total, symbol)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(viewOrder.subtotal, symbol)}</span></div>
              {Number(viewOrder.tax) > 0 && <div className="flex justify-between text-slate-500"><span>Tax</span><span>{formatCurrency(viewOrder.tax, symbol)}</span></div>}
              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-bold text-slate-800"><span>Total</span><span>{formatCurrency(viewOrder.total, symbol)}</span></div>
              <div className="flex justify-between text-slate-500"><span>Paid</span><span>{formatCurrency(viewOrder.paid_amount, symbol)}</span></div>
            </div>
            {viewOrder.status === 'pending' && (
              <Button
                className="mt-4 w-full"
                variant="success"
                icon={receivingId === viewOrder.id ? <Spinner size="sm" /> : <CheckCircle2 size={18} />}
                onClick={async () => {
                  await receivePO(viewOrder);
                  setViewOrder(null);
                }}
                disabled={receivingId === viewOrder.id}
              >
                {receivingId === viewOrder.id ? 'Receiving & Updating Stock...' : 'Mark as Received & Update Stock'}
              </Button>
            )}
          </div>
        )}
      </Modal>

      {viewOrder && (
        <PrintPreview
          open={printPreview}
          onClose={() => setPrintPreview(false)}
          title={`Print Preview — PO ${viewOrder.po_number}`}
          size="lg"
          fileName={`po_${sanitizePdfName(viewOrder.po_number)}.pdf`}
        >
          <PrintDocument
            storeName={settings?.store_name || 'Purchase Order'}
            subtitle="Purchase Order"
            logoSrc={logoSrc}
            fields={[
              { label: 'Business', value: settings?.store_name || '—' },
              { label: 'Address', value: settings?.address || '—', span: 2 },
              { label: 'Phone', value: settings?.phone || '—' },
              { label: 'Business NTN', value: settings?.ntn?.trim() || '—' },
              { label: 'PO #', value: viewOrder.po_number },
            ]}
          >
            <div className="mb-4 grid grid-cols-2 gap-4 text-xs">
              <div><p className="text-slate-400">Supplier</p><p className="font-medium">{viewOrder.suppliers?.name || '—'}</p></div>
              <div><p className="text-slate-400">Date</p><p className="font-medium">{formatDateTime(viewOrder.created_at)}</p></div>
            </div>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-rose-900 text-white">
                  <PrintTh>Product</PrintTh>
                  <PrintTh>Batch #</PrintTh>
                  <PrintTh align="right">Qty (Pcs)</PrintTh>
                  <PrintTh align="right">Cost / Pc</PrintTh>
                  <PrintTh align="right">Total</PrintTh>
                </tr>
              </thead>
              <tbody>
                {viewOrder.items?.map((it: any) => (
                  <tr key={it.id}>
                    <PrintTd>{it.product_name}</PrintTd>
                    <PrintTd>{it.batch_number || '—'}</PrintTd>
                    <PrintTd align="right">{it.quantity}</PrintTd>
                    <PrintTd align="right">{formatCurrency(it.unit_cost, symbol)}</PrintTd>
                    <PrintTd align="right" className="font-medium">{formatCurrency(it.total, symbol)}</PrintTd>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 space-y-1 text-xs">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(viewOrder.subtotal, symbol)}</span></div>
              {Number(viewOrder.tax) > 0 && <div className="flex justify-between text-slate-500"><span>Tax</span><span>{formatCurrency(viewOrder.tax, symbol)}</span></div>}
              <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-bold"><span>Total</span><span>{formatCurrency(viewOrder.total, symbol)}</span></div>
            </div>
          </PrintDocument>
        </PrintPreview>
      )}
    </div>
  );
}

function CreatePOModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { symbol } = useSettings();
  const { notify } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [note, setNote] = useState('');
  interface POLine {
    product: Product;
    cartons: number;
    pieces_per_carton: number;
    quantity: number; // total pieces = cartons * pieces_per_carton
    cost: number; // buy cost per piece
    batch_number: string; // chemical manufacturer Batch ID
    retail_price: number;
    wholesale_price: number;
    dealer_price: number;
  }

  const [lines, setLines] = useState<POLine[]>([]);
  const [savingPO, setSavingPO] = useState(false);
  const savingPORef = useRef(false);
  const [productQuery, setProductQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      Promise.all([
        api.get<Supplier[]>('/api/data/suppliers'),
        api.get<Product[]>('/api/data/products?limit=10000'),
        api.get<Brand[]>('/api/data/brands'),
      ]).then(([s, p, b]) => {
        setSuppliers((s || []).sort((a, b) => a.name.localeCompare(b.name)));
        setProducts((p || []).sort((a, b) => a.name.localeCompare(b.name)));
        setBrands(b || []);
      }).catch(() => {
        setSuppliers([]);
        setProducts([]);
        setBrands([]);
      });
      setSupplierId('');
      setNote('');
      setLines([]);
      setProductQuery('');
      setShowDropdown(false);
      setShowCsvModal(false);
    }
  }, [open]);

  const handleAddItemsFromCsv = (items: { product: Product; quantity: number; cost: number }[]) => {
    setLines((prev) => {
      const updated = [...prev];
      for (const item of items) {
        const ppc = Number(item.product.carton_to_box) > 0 ? Number(item.product.carton_to_box) : 1;
        const ctns = Math.max(1, Number(item.quantity) || 1);
        const existingIdx = updated.findIndex((l) => l.product.id === item.product.id);
        if (existingIdx >= 0) {
          const newCtns = (Number(updated[existingIdx].cartons) || 1) + ctns;
          updated[existingIdx] = {
            ...updated[existingIdx],
            cartons: newCtns,
            quantity: newCtns * (Number(updated[existingIdx].pieces_per_carton) || ppc),
            cost: item.cost || updated[existingIdx].cost,
          };
        } else {
          updated.push({
            product: item.product,
            cartons: ctns,
            pieces_per_carton: ppc,
            quantity: ctns * ppc,
            cost: item.cost || item.product.purchase_price || 0,
            batch_number: '',
            retail_price: item.product.retail_price || 0,
            wholesale_price: item.product.wholesale_price || 0,
            dealer_price: item.product.dealer_price || 0,
          });
        }
      }
      return updated;
    });
    notify(`Added ${items.length} product(s) from CSV to purchase order`, 'success');
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddProduct = (p: Product) => {
    const pcsPerCtn = Number(p.carton_to_box) > 0 ? Number(p.carton_to_box) : 1;
    const existingIndex = lines.findIndex((l) => l.product.id === p.id);
    if (existingIndex >= 0) {
      setLines((prev) => prev.map((l, i) => {
        if (i !== existingIndex) return l;
        const newCtns = (Number(l.cartons) || 1) + 1;
        const ppc = Number(l.pieces_per_carton) || pcsPerCtn;
        return {
          ...l,
          cartons: newCtns,
          quantity: newCtns * ppc,
        };
      }));
      notify(`Added another carton of ${p.name}`, 'info');
    } else {
      setLines((prev) => [
        ...prev,
        {
          product: p,
          cartons: 1,
          pieces_per_carton: pcsPerCtn,
          quantity: pcsPerCtn, // 1 carton * pcsPerCtn pieces
          cost: p.purchase_price || 0,
          batch_number: '',
          retail_price: p.retail_price || 0,
          wholesale_price: p.wholesale_price || 0,
          dealer_price: p.dealer_price || 0,
        },
      ]);
    }
    setProductQuery('');
    setShowDropdown(false);
    searchInputRef.current?.focus();
  };

  const updateLine = (idx: number, field: keyof POLine, value: any) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      if (field === 'cartons' || field === 'pieces_per_carton') {
        const ctns = field === 'cartons' ? Math.max(1, Number(value) || 1) : (Number(l.cartons) || 1);
        const ppc = field === 'pieces_per_carton' ? Math.max(1, Number(value) || 1) : (Number(l.pieces_per_carton) || 1);
        updated.quantity = ctns * ppc;
      }
      return updated;
    }));
  };

  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const totalCartons = lines.reduce((s, l) => s + Number(l.cartons || 1), 0);
  const totalPieces = lines.reduce((s, l) => s + Number(l.quantity || 0), 0);
  const subtotal = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.cost || 0), 0);
  const total = subtotal;

  const selectedSupplier = suppliers.find((s) => s.id === supplierId);
  const brandMap = new Map((brands || []).map((b) => [b.id, b]));

  const getProductImage = (p: Product) => {
    if (p.image_url) {
      return resolveImageUrl(p.image_url) || p.image_url;
    }
    if (p.brand_id && brandMap.get(p.brand_id)?.logo_url) {
      const logo = brandMap.get(p.brand_id)!.logo_url;
      return resolveImageUrl(logo) || logo;
    }
    return null;
  };

  const filteredProducts = products.filter((p) => {
    if (!productQuery.trim()) return true;
    const q = productQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.barcode && p.barcode.toLowerCase().includes(q))
    );
  }).slice(0, 15);

  const save = async () => {
    if (savingPORef.current) return;
    if (lines.length === 0) { notify('Add at least one product to the purchase order', 'error'); return; }
    savingPORef.current = true;
    setSavingPO(true);
    try {
      const poNumber = generateDocNumber('PO');
      const po = await api.post<any>('/api/data/purchase_orders', {
        po_number: poNumber, supplier_id: supplierId || null, subtotal, tax: 0, total, paid_amount: 0, status: 'pending', payment_status: 'unpaid', note,
      });
      for (const l of lines) {
        await api.post('/api/data/purchase_items', {
          purchase_id: po.id,
          product_id: l.product.id,
          product_name: l.product.name,
          quantity: l.quantity, // total pieces
          unit_cost: l.cost, // buy rate per piece
          total: l.quantity * l.cost,
          retail_price: l.retail_price || 0,
          wholesale_price: l.wholesale_price || 0,
          dealer_price: l.dealer_price || 0,
          batch_number: l.batch_number?.trim() || null,
          cartons: l.cartons || 1,
          pieces_per_carton: l.pieces_per_carton || 1,
        });
      }
      notify('Purchase order created successfully', 'success');
      onClose(); onCreated();
    } catch {
      notify('Failed to create PO', 'error');
    } finally {
      savingPORef.current = false;
      setSavingPO(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Purchase Order"
      size="2xl"
      bodyClassName="min-h-[460px]"
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="text-xs text-slate-500">
            {lines.length > 0 ? (
              <span>
                <strong className="text-slate-800">{lines.length}</strong> products (
                <strong className="text-slate-800">{totalCartons}</strong> cartons /{' '}
                <strong className="text-slate-800">{totalPieces}</strong> pieces)
              </span>
            ) : (
              <span>No products added</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={save} disabled={lines.length === 0 || savingPO}>
              {savingPO ? 'Creating PO...' : `Create PO — ${formatCurrency(total, symbol)}`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Top: Supplier Selection & Info */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Supplier">
              <SearchableSelect
                value={supplierId}
                onChange={setSupplierId}
                options={suppliers.map((s) => ({
                  value: s.id,
                  label: `${s.name}${s.phone ? ` (${s.phone})` : ''}`,
                  searchText: `${s.name} ${s.phone || ''} ${s.contact_person || ''}`,
                }))}
                placeholder="Select or search supplier..."
              />
            </Field>
            <Field label="Order Note / Reference">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Invoice # / Delivery Challan #"
              />
            </Field>
          </div>
          {selectedSupplier && (
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-1 border-t border-slate-200/60">
              {selectedSupplier.phone && (
                <span>📞 Phone: <strong className="text-slate-700">{selectedSupplier.phone}</strong></span>
              )}
              {selectedSupplier.contact_person && (
                <span>👤 Contact: <strong className="text-slate-700">{selectedSupplier.contact_person}</strong></span>
              )}
              <span>
                💰 Current Payable Balance:{' '}
                <strong className={Number(selectedSupplier.balance) > 0 ? 'text-rose-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                  {formatCurrency(selectedSupplier.balance || 0, symbol)}
                </strong>
              </span>
            </div>
          )}
        </div>

        {/* Product Quick Search Bar */}
        <div className="space-y-1.5" ref={searchContainerRef}>
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Add Products to Purchase Order
            </label>
            <button
              type="button"
              onClick={() => setShowCsvModal(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition"
            >
              <Upload size={13} className="text-sky-600" />
              Import Items from CSV
            </button>
          </div>
          <div className="relative">
            <div className="relative flex items-center">
              <Search size={18} className="absolute left-3.5 text-slate-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={productQuery}
                onChange={(e) => {
                  setProductQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Type product name, brand, SKU or barcode to add... (Press Enter to add first match)"
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm shadow-sm transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (filteredProducts.length > 0) {
                      handleAddProduct(filteredProducts[0]);
                    }
                  }
                  if (e.key === 'Escape') {
                    setShowDropdown(false);
                  }
                }}
              />
              {productQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setProductQuery('');
                    setShowDropdown(false);
                  }}
                  className="absolute right-3 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Product Suggestions Floating Panel */}
            {showDropdown && (
              <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl ring-1 ring-slate-900/10 animate-[modalIn_0.15s_ease-out]">
                {filteredProducts.length === 0 ? (
                  <div className="py-6 text-center text-sm text-slate-400">
                    No products found matching "{productQuery}"
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredProducts.map((p) => {
                      const isAdded = lines.some((l) => l.product.id === p.id);
                      return (
                        <div
                          key={p.id}
                          onClick={() => handleAddProduct(p)}
                          className={cn(
                            'group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition',
                            isAdded ? 'bg-sky-50/50 hover:bg-sky-50' : 'hover:bg-slate-50'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            {(() => {
                              const img = getProductImage(p);
                              return img ? (
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white overflow-hidden ring-1 ring-slate-200">
                                  <img
                                    src={img}
                                    alt={p.name}
                                    className="h-full w-full object-cover"
                                    onError={(e) => {
                                      (e.currentTarget as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                </div>
                              ) : (
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-sky-600 transition">
                                  <Package size={22} />
                                </div>
                              );
                            })()}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm text-slate-800 group-hover:text-sky-700">{p.name}</span>
                                {isAdded && (
                                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
                                    In PO
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-700">
                                  Stock: {p.stock_quantity} pcs
                                </span>
                                <span>•</span>
                                <span>Last Buy: <strong className="text-slate-800">{formatCurrency(p.purchase_price, symbol)}/pc</strong></span>
                              </div>
                            </div>
                          </div>
                          <div className="pl-3">
                            <span className={cn(
                              'inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition',
                              isAdded ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 group-hover:bg-sky-600 group-hover:text-white'
                            )}>
                              <Plus size={13} /> {isAdded ? 'Add More' : 'Add'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Order Items Table or Empty State */}
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3">
              <PackagePlus size={28} />
            </div>
            <h4 className="text-sm font-semibold text-slate-800">No Products in Purchase Order</h4>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Type product name or brand above to add products to this order.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="max-h-80 overflow-y-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="px-3 py-3 text-left">Product</th>
                    <th className="px-3 py-3 text-left w-36">Batch #</th>
                    <th className="px-2 py-3 text-center w-28">Cartons</th>
                    <th className="px-2 py-3 text-center w-20">Pcs/Ctn</th>
                    <th className="px-2 py-3 text-center w-20">Total Pcs</th>
                    <th className="px-3 py-3 text-left w-32">Buy Rate / Pc</th>
                    <th className="px-3 py-3 text-left w-[330px]">New Selling Rates / Pc</th>
                    <th className="px-3 py-3 text-right w-28">Line Total</th>
                    <th className="px-2 py-3 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l, i) => (
                    <tr key={i} className="hover:bg-slate-50/60 transition">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          {(() => {
                            const img = getProductImage(l.product);
                            return img ? (
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white overflow-hidden ring-1 ring-slate-200">
                                <img
                                  src={img}
                                  alt={l.product.name}
                                  className="h-full w-full object-cover"
                                  onError={(e) => {
                                    (e.currentTarget as HTMLElement).style.display = 'none';
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                                <Package size={18} />
                              </div>
                            );
                          })()}
                          <div>
                            <div className="font-semibold text-slate-800 text-sm leading-tight">{l.product.name}</div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              Stock: {l.product.stock_quantity} pcs
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Batch # Input */}
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          value={l.batch_number || ''}
                          onChange={(e) => updateLine(i, 'batch_number', e.target.value)}
                          placeholder="e.g. RF23RFA3700"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-semibold text-slate-800 focus:border-sky-500 focus:outline-none shadow-sm"
                        />
                      </td>

                      {/* Cartons Quantity */}
                      <td className="px-2 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => updateLine(i, 'cartons', Math.max(1, (Number(l.cartons) || 1) - 1))}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 active:scale-95"
                          >
                            <Minus size={12} />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={l.cartons === 0 ? '' : l.cartons}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => updateLine(i, 'cartons', e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
                            onBlur={() => updateLine(i, 'cartons', Math.max(1, Number(l.cartons) || 1))}
                            className="w-14 rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-center font-bold text-slate-800 text-sm focus:border-sky-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-sm"
                          />
                          <button
                            type="button"
                            onClick={() => updateLine(i, 'cartons', (Number(l.cartons) || 0) + 1)}
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 active:scale-95"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                      </td>

                      {/* Pcs/Ctn */}
                      <td className="px-2 py-3">
                        <input
                          type="number"
                          min="1"
                          value={l.pieces_per_carton === 0 ? '' : l.pieces_per_carton}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => updateLine(i, 'pieces_per_carton', e.target.value === '' ? '' : Math.max(1, Number(e.target.value)))}
                          onBlur={() => updateLine(i, 'pieces_per_carton', Math.max(1, Number(l.pieces_per_carton) || 1))}
                          className="w-16 mx-auto block rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-center font-bold text-slate-700 text-xs focus:border-sky-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-sm"
                        />
                      </td>

                      {/* Total Pcs Display */}
                      <td className="px-2 py-3 text-center">
                        <span className="inline-block rounded-md bg-slate-100 px-2 py-1 font-bold text-xs text-slate-800">
                          {l.quantity} pcs
                        </span>
                      </td>

                      {/* Buy Rate / Pc */}
                      <td className="px-3 py-3">
                        <div>
                          <div className="relative flex items-center">
                            <span className="absolute left-2 text-xs text-slate-400 font-medium">Rs</span>
                            <input
                              type="number"
                              min="0"
                              value={l.cost === 0 ? '' : l.cost}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => updateLine(i, 'cost', e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                              onBlur={() => updateLine(i, 'cost', Math.max(0, Number(l.cost) || 0))}
                              placeholder="0"
                              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-2 font-semibold text-slate-800 text-sm focus:border-sky-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-sm"
                            />
                          </div>
                          <div className="mt-1 text-[11px] text-slate-400">
                            Last: {formatCurrency(l.product.purchase_price, symbol)}
                          </div>
                        </div>
                      </td>

                      {/* Selling Rates / Pc */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="flex-1 min-w-[85px]">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-purple-700 bg-purple-50 border border-purple-200/80 px-1 py-0.5 rounded text-center mb-1">
                              Retail
                            </span>
                            <div className="relative flex items-center">
                              <span className="absolute left-1.5 text-[11px] text-slate-400 font-medium">Rs</span>
                              <input
                                type="number"
                                min="0"
                                value={l.retail_price === 0 ? '' : l.retail_price || ''}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateLine(i, 'retail_price', e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                                onBlur={() => updateLine(i, 'retail_price', Math.max(0, Number(l.retail_price) || 0))}
                                className="w-full rounded-lg border border-slate-200 bg-white py-1 pl-5 pr-1 text-xs font-semibold text-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-sm"
                                placeholder="Retail"
                              />
                            </div>
                          </div>
                          <div className="flex-1 min-w-[85px]">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1 py-0.5 rounded text-center mb-1">
                              Wholesale
                            </span>
                            <div className="relative flex items-center">
                              <span className="absolute left-1.5 text-[11px] text-slate-400 font-medium">Rs</span>
                              <input
                                type="number"
                                min="0"
                                value={l.wholesale_price === 0 ? '' : l.wholesale_price || ''}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateLine(i, 'wholesale_price', e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                                onBlur={() => updateLine(i, 'wholesale_price', Math.max(0, Number(l.wholesale_price) || 0))}
                                className="w-full rounded-lg border border-slate-200 bg-white py-1 pl-5 pr-1 text-xs font-semibold text-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-sm"
                                placeholder="Wholesale"
                              />
                            </div>
                          </div>
                          <div className="flex-1 min-w-[85px]">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200/80 px-1 py-0.5 rounded text-center mb-1">
                              Dealer
                            </span>
                            <div className="relative flex items-center">
                              <span className="absolute left-1.5 text-[11px] text-slate-400 font-medium">Rs</span>
                              <input
                                type="number"
                                min="0"
                                value={l.dealer_price === 0 ? '' : l.dealer_price || ''}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => updateLine(i, 'dealer_price', e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                                onBlur={() => updateLine(i, 'dealer_price', Math.max(0, Number(l.dealer_price) || 0))}
                                className="w-full rounded-lg border border-slate-200 bg-white py-1 pl-5 pr-1 text-xs font-semibold text-slate-800 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-sm"
                                placeholder="Dealer"
                              />
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Line Total */}
                      <td className="px-3 py-3 text-right font-bold text-slate-900 text-sm">
                        {formatCurrency(l.quantity * l.cost, symbol)}
                      </td>

                      <td className="px-2 py-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          className="rounded-lg p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          title="Remove product"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Summary strip inside table container */}
            <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/80 px-4 py-3">
              <div className="text-xs text-slate-500">
                Total Products: <strong className="text-slate-800">{lines.length}</strong> | Total Cartons:{' '}
                <strong className="text-slate-800">{totalCartons}</strong> | Total Pieces:{' '}
                <strong className="text-slate-800">{totalPieces}</strong>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-slate-500 font-medium">Order Total:</span>
                <span className="text-lg font-extrabold text-emerald-700">{formatCurrency(total, symbol)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Import PO Items from CSV Modal */}
      <ImportPoItemsModal
        open={showCsvModal}
        onClose={() => setShowCsvModal(false)}
        onAddItems={handleAddItemsFromCsv}
        products={products}
        symbol={symbol}
      />
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*                         IMPORT PO ITEMS CSV MODAL                          */
/* -------------------------------------------------------------------------- */

interface ParsedPoItemRow {
  queryName: string;
  matchedProduct: Product | null;
  quantity: number;
  cost: number;
  skuOrBarcode: string;
  status: 'matched' | 'not_found';
}

function ImportPoItemsModal({
  open,
  onClose,
  onAddItems,
  products,
  symbol,
}: {
  open: boolean;
  onClose: () => void;
  onAddItems: (items: { product: Product; quantity: number; cost: number }[]) => void;
  products: Product[];
  symbol: string;
}) {
  const { notify } = useToast();
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedPoItemRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFileName('');
      setParsedRows([]);
    }
  }, [open]);

  const handleDownloadSample = () => {
    const csvStr = generateCsv(PO_ITEMS_CSV_HEADERS, PO_ITEMS_CSV_SAMPLE_ROWS);
    downloadCsv('sample_po_items_template.csv', csvStr);
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
        notify('CSV must have a header row and at least 1 item row', 'error');
        return;
      }

      const headers = rawRows[0].map((h) => h.toLowerCase().trim());
      const findIdx = (...names: string[]) =>
        headers.findIndex((h) => names.some((n) => h.includes(n)));

      const nameIdx = findIdx('product name', 'product', 'name', 'item');
      const qtyIdx = findIdx('quantity', 'qty', 'carton');
      const costIdx = findIdx('buy rate', 'purchase rate', 'cost', 'rate', 'price');
      const idIdx = findIdx('sku', 'barcode', 'code');

      const dataRows = rawRows.slice(1);
      const rows: ParsedPoItemRow[] = dataRows.map((cols) => {
        const queryName = (nameIdx >= 0 ? cols[nameIdx] : cols[0])?.trim() || '';
        const skuOrBarcode = (idIdx >= 0 ? cols[idIdx] : '')?.trim() || '';
        const quantity = Math.max(1, Number((qtyIdx >= 0 ? cols[qtyIdx] : '1').replace(/[^0-9.]/g, '')) || 1);
        const rawCost = Number((costIdx >= 0 ? cols[costIdx] : '0').replace(/[^0-9.]/g, '')) || 0;

        // Match product in catalog
        let matched: Product | null = null;
        if (skuOrBarcode) {
          const idClean = skuOrBarcode.toLowerCase();
          matched =
            products.find(
              (p) =>
                (p.sku && p.sku.toLowerCase() === idClean) ||
                (p.barcode && p.barcode.toLowerCase() === idClean)
            ) || null;
        }

        if (!matched && queryName) {
          const nameClean = queryName.toLowerCase();
          matched = products.find((p) => p.name.toLowerCase() === nameClean) || null;
          if (!matched) {
            matched = products.find((p) => p.name.toLowerCase().includes(nameClean)) || null;
          }
        }

        const cost = rawCost > 0 ? rawCost : matched?.purchase_price || 0;

        return {
          queryName,
          matchedProduct: matched,
          quantity,
          cost,
          skuOrBarcode,
          status: matched ? 'matched' : 'not_found',
        };
      });

      setParsedRows(rows);
    };
    reader.readAsText(file, 'utf-8');
  };

  const matchedRows = parsedRows.filter((r) => r.status === 'matched' && r.matchedProduct);
  const totalCost = matchedRows.reduce((s, r) => s + r.quantity * r.cost, 0);

  const handleConfirm = () => {
    if (matchedRows.length === 0) {
      notify('No matched products to add', 'error');
      return;
    }
    const itemsToAdd = matchedRows.map((r) => ({
      product: r.matchedProduct!,
      quantity: r.quantity,
      cost: r.cost,
    }));
    onAddItems(itemsToAdd);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import PO Line Items from CSV / Excel"
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="text-xs text-slate-500">
            {parsedRows.length > 0 ? (
              <span>
                <strong>{matchedRows.length}</strong> matched product(s) ready to add
                {parsedRows.length - matchedRows.length > 0 && ` (${parsedRows.length - matchedRows.length} not found)`}
              </span>
            ) : (
              <span>Upload CSV to import items</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={matchedRows.length === 0}
              icon={<CheckCircle2 size={16} />}
            >
              Add {matchedRows.length} Items ({formatCurrency(totalCost, symbol)})
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Download Sample Banner */}
        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5 max-w-sm">
            <div className="flex items-center gap-1.5 font-semibold text-slate-800 text-xs">
              <FileSpreadsheet size={16} className="text-sky-600" />
              PO Items CSV Template
            </div>
            <p className="text-[11px] text-slate-600">
              Columns: Product Name, Quantity, Buy Rate, SKU / Barcode (optional).
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={<Download size={13} />}
            onClick={handleDownloadSample}
            className="bg-white hover:bg-sky-50 text-sky-700 border-sky-300 shadow-sm text-xs py-1"
          >
            Download Sample CSV
          </Button>
        </div>

        {/* Upload dropzone */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl border-2 border-dashed border-slate-300 hover:border-sky-500 bg-slate-50/50 hover:bg-sky-50/30 p-5 text-center cursor-pointer transition"
          >
            <Upload size={28} className="mx-auto text-slate-400 mb-1.5" />
            <p className="text-xs font-semibold text-slate-700">
              {fileName ? fileName : 'Click to select or drop CSV file'}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">Quickly import multi-line invoices from suppliers</p>
          </div>
        </div>

        {/* Preview Table */}
        {parsedRows.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Matched Items Preview ({parsedRows.length})
            </h4>

            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm max-h-60 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="py-2 px-3">CSV Item</th>
                    <th className="py-2 px-3">Matched Catalog Product</th>
                    <th className="py-2 px-3 text-center">Cartons</th>
                    <th className="py-2 px-3 text-right">Buy Rate</th>
                    <th className="py-2 px-3 text-right">Line Total</th>
                    <th className="py-2 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {parsedRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={cn('transition-colors', row.status === 'not_found' ? 'bg-rose-50/40' : 'hover:bg-slate-50/60')}
                    >
                      <td className="py-2 px-3 font-medium text-slate-700">{row.queryName || row.skuOrBarcode || '—'}</td>
                      <td className="py-2 px-3">
                        {row.matchedProduct ? (
                          <span className="font-semibold text-slate-800">{row.matchedProduct.name}</span>
                        ) : (
                          <span className="text-rose-500 italic">Not found in catalog</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-slate-800">{row.quantity}</td>
                      <td className="py-2 px-3 text-right font-medium text-slate-700">
                        {formatCurrency(row.cost, symbol)}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">
                        {formatCurrency(row.quantity * row.cost, symbol)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {row.status === 'matched' ? (
                          <Badge variant="green">Matched</Badge>
                        ) : (
                          <Badge variant="red">Not Found</Badge>
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

// ===== SUPPLIERS =====
export function Suppliers() {
  const { symbol, settings, logoSrc } = useSettings();
  const { notify } = useToast();
  const [items, setItems] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [payTarget, setPayTarget] = useState<Supplier | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'payments' | 'purchases' | 'returns'>('all');
  const [printSlip, setPrintSlip] = useState<{ supplier: Supplier; payment: any } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, acc] = await Promise.all([
        api.get<Supplier[]>('/api/data/suppliers'),
        api.get<any[]>('/api/data/payment_accounts'),
      ]);
      setItems((data || []).sort((a, b) => a.name.localeCompare(b.name)));
      setAccounts(acc || []);
    } catch {
      setItems([]);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((s) => {
    const q = search.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.phone?.toLowerCase().includes(q);
  });

  const openView = async (s: Supplier) => {
    try {
      const [pos, payments, returns] = await Promise.all([
        api.get<any[]>('/api/data/purchase_orders'),
        api.get<any[]>('/api/data/supplier_payments').catch(() => []),
        api.get<any[]>('/api/data/purchase_returns').catch(() => []),
      ]);

      const supPurchases = (pos || [])
        .filter((p) => p.supplier_id === s.id)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

      const supPayments = (payments || [])
        .filter((pm) => pm.supplier_id === s.id)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

      const supReturns = (returns || [])
        .filter((r) => r.supplier_id === s.id)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

      // Combined chronological ledger stream
      const allEvents: any[] = [
        ...supPurchases.map((p) => ({
          id: `po-${p.id}`,
          date: p.created_at,
          type: 'purchase_order',
          ref: p.po_number,
          amount: Number(p.total || 0),
          status: p.status,
          payment_status: p.payment_status,
          note: `PO created (${p.status})`,
        })),
        ...supPayments.map((pm) => ({
          id: `sp-${pm.id}`,
          date: pm.created_at,
          type: 'payment',
          ref: pm.payment_number || 'Payment',
          amount: Number(pm.amount || 0),
          method: pm.method,
          note: pm.note || `Paid via ${pm.method}`,
          rawPayment: pm,
        })),
        ...supReturns.map((r) => ({
          id: `pr-${r.id}`,
          date: r.created_at,
          type: 'return',
          ref: r.return_number,
          amount: Number(r.total_amount || 0),
          status: r.status,
          resolution: r.resolution,
          note: `${r.product_name || 'Product'} (${r.quantity} qty) - ${r.reason}`,
        })),
      ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

      setViewing({
        supplier: s,
        purchases: supPurchases,
        payments: supPayments,
        returns: supReturns,
        ledger: allEvents,
      });
      setActiveTab('all');
    } catch {
      setViewing({ supplier: s, purchases: [], payments: [], returns: [], ledger: [] });
    }
  };

  const save = async (data: Partial<Supplier>) => {
    try {
      const payload = { ...data };
      if (!editing && (payload as any).balance == null) {
        (payload as any).balance = (payload as any).opening_balance || 0;
      }
      if (editing) {
        await api.put(`/api/data/suppliers/${editing.id}`, payload);
        notify('Supplier updated', 'success');
      } else {
        await api.post('/api/data/suppliers', payload);
        notify('Supplier added', 'success');
      }
      setShowForm(false);
      setEditing(null);
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to save', 'error');
    }
  };

  const remove = async (s: Supplier) => {
    try {
      await api.delete(`/api/data/suppliers/${s.id}`);
      notify('Supplier deleted', 'success');
      load();
    } catch (e: any) {
      notify(e.message || 'Failed to delete', 'error');
    }
  };

  if (loading) return <div><PageHeader title="Suppliers" /><Spinner /></div>;

  return (
    <div>
      <PageHeader
        title="Suppliers"
        subtitle={`${items.length} registered suppliers`}
        actions={
          <Button icon={<Plus size={18} />} onClick={() => { setEditing(null); setShowForm(true); }}>
            Add Supplier
          </Button>
        }
      />
      <div className="mb-4 relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search suppliers by name or phone..."
          className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
        />
      </div>
      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Truck size={32} />}
            title="No suppliers found"
            action={<Button icon={<Plus size={18} />} onClick={() => setShowForm(true)}>Add Supplier</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Outstanding Payable</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td className="font-semibold text-slate-800">{s.name}</td>
                    <td>{s.phone || '—'}</td>
                    <td>{s.email || '—'}</td>
                    <td>
                      {Number(s.balance) > 0 ? (
                        <Badge variant="red">{formatCurrency(s.balance, symbol)} (Payable)</Badge>
                      ) : Number(s.balance) < 0 ? (
                        <Badge variant="green">Advance Credit: {formatCurrency(Math.abs(s.balance), symbol)}</Badge>
                      ) : (
                        <Badge variant="green">Clear</Badge>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end items-center gap-1">
                        {Number(s.balance) > 0 && (
                          <Button
                            size="sm"
                            variant="success"
                            icon={<DollarSign size={14} />}
                            onClick={() => setPayTarget(s)}
                          >
                            Pay
                          </Button>
                        )}
                        <button
                          onClick={() => openView(s)}
                          title="View Date & Time History"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          onClick={() => { setEditing(s); setShowForm(true); }}
                          title="Edit Supplier"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(s)}
                          title="Delete Supplier"
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <SupplierForm open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} onSave={save} editing={editing} />
      <ConfirmModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => deleteTarget && remove(deleteTarget)} title="Delete Supplier" message={`Delete ${deleteTarget?.name}?`} confirmLabel="Delete" danger />

      {/* Pay Supplier Modal */}
      <PaySupplierModal
        supplier={payTarget}
        accounts={accounts}
        open={!!payTarget}
        onClose={() => setPayTarget(null)}
        onPaid={() => {
          load();
          if (viewing && payTarget && viewing.supplier?.id === payTarget.id) {
            openView(payTarget);
          }
        }}
        symbol={symbol}
      />

      {/* Comprehensive Supplier Profile & Date/Time History Modal */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Supplier Profile & Date/Time Ledger" size="xl">
        {viewing && (
          <div className="space-y-4">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{viewing.supplier.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Phone: {viewing.supplier.phone || '—'} | Email: {viewing.supplier.email || '—'} {viewing.supplier.contact_person ? `| Contact: ${viewing.supplier.contact_person}` : ''}
                </p>
                {viewing.supplier.address && <p className="text-xs text-slate-500 mt-0.5">Address: {viewing.supplier.address}</p>}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-xs text-slate-500 font-medium">Outstanding Balance</p>
                  <p className={cn('text-xl font-bold', Number(viewing.supplier.balance) > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                    {formatCurrency(viewing.supplier.balance, symbol)}
                  </p>
                </div>
                {Number(viewing.supplier.balance) > 0 && (
                  <Button variant="success" icon={<DollarSign size={16} />} onClick={() => setPayTarget(viewing.supplier)}>
                    Pay Supplier
                  </Button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 text-xs font-semibold">
              <button
                onClick={() => setActiveTab('all')}
                className={cn(
                  'px-4 py-2.5 border-b-2 transition -mb-px flex items-center gap-1.5',
                  activeTab === 'all' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                )}
              >
                <History size={15} /> All Activity Ledger ({viewing.ledger?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('payments')}
                className={cn(
                  'px-4 py-2.5 border-b-2 transition -mb-px flex items-center gap-1.5',
                  activeTab === 'payments' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                )}
              >
                <DollarSign size={15} /> Payments Made ({viewing.payments?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('purchases')}
                className={cn(
                  'px-4 py-2.5 border-b-2 transition -mb-px flex items-center gap-1.5',
                  activeTab === 'purchases' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                )}
              >
                <Truck size={15} /> Purchase Orders ({viewing.purchases?.length || 0})
              </button>
              <button
                onClick={() => setActiveTab('returns')}
                className={cn(
                  'px-4 py-2.5 border-b-2 transition -mb-px flex items-center gap-1.5',
                  activeTab === 'returns' ? 'border-sky-600 text-sky-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                )}
              >
                <RotateCcw size={15} /> Returns ({viewing.returns?.length || 0})
              </button>
            </div>

            {/* Tab 1: All Activity Chronological Ledger */}
            {activeTab === 'all' && (
              <div>
                {viewing.ledger.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No activity recorded for this supplier yet.</p>
                ) : (
                  <div className="overflow-x-auto max-h-96 rounded-xl border border-slate-200">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date & Time</th>
                          <th>Activity</th>
                          <th>Ref #</th>
                          <th>Details / Note</th>
                          <th className="text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewing.ledger.map((ev: any) => {
                          const isPayment = ev.type === 'payment';
                          const isPO = ev.type === 'purchase_order';
                          const isReturn = ev.type === 'return';
                          return (
                            <tr key={ev.id}>
                              <td className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(ev.date)}</td>
                              <td>
                                <Badge variant={isPayment ? 'green' : isPO ? 'blue' : 'amber'}>
                                  {isPayment ? 'Payment Made' : isPO ? 'Purchase Order' : 'Purchase Return'}
                                </Badge>
                              </td>
                              <td className="font-medium text-slate-800">{ev.ref}</td>
                              <td className="text-slate-600 text-xs">{ev.note}</td>
                              <td
                                className={cn(
                                  'text-right font-bold whitespace-nowrap',
                                  isPayment ? 'text-emerald-600' : isReturn ? 'text-blue-600' : 'text-slate-800'
                                )}
                              >
                                {isPayment ? '− ' : isReturn ? 'Credit ' : '+ '}
                                {formatCurrency(ev.amount, symbol)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Payments Made */}
            {activeTab === 'payments' && (
              <div>
                {viewing.payments.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No payments recorded to this supplier yet.</p>
                ) : (
                  <div className="overflow-x-auto max-h-96 rounded-xl border border-slate-200">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date & Time</th>
                          <th>Payment #</th>
                          <th>Method</th>
                          <th>Note</th>
                          <th className="text-right">Amount Paid</th>
                          <th className="text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewing.payments.map((pm: any) => (
                          <tr key={pm.id}>
                            <td className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(pm.created_at)}</td>
                            <td className="font-medium text-slate-800">{pm.payment_number || 'SP-Payment'}</td>
                            <td>
                              <Badge variant="blue">{pm.method?.toUpperCase() || 'CASH'}</Badge>
                            </td>
                            <td className="text-xs text-slate-600">{pm.note || '—'}</td>
                            <td className="text-right font-bold text-emerald-600">
                              {formatCurrency(pm.amount, symbol)}
                            </td>
                            <td className="text-right">
                              <button
                                onClick={() => setPrintSlip({ supplier: viewing.supplier, payment: pm })}
                                title="Print Payment Voucher"
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                              >
                                <Printer size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Purchase Orders */}
            {activeTab === 'purchases' && (
              <div>
                {viewing.purchases.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No purchases found for this supplier.</p>
                ) : (
                  <div className="overflow-x-auto max-h-96 rounded-xl border border-slate-200">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date & Time</th>
                          <th>PO #</th>
                          <th>Total Amount</th>
                          <th>Paid</th>
                          <th>Status</th>
                          <th>Payment Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewing.purchases.map((p: any) => (
                          <tr key={p.id}>
                            <td className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(p.created_at)}</td>
                            <td className="font-medium text-slate-800">{p.po_number}</td>
                            <td className="font-semibold text-slate-800">{formatCurrency(p.total, symbol)}</td>
                            <td className="text-slate-600">{formatCurrency(p.paid_amount || 0, symbol)}</td>
                            <td>
                              <Badge variant={p.status === 'received' ? 'green' : 'amber'}>{p.status}</Badge>
                            </td>
                            <td>
                              <Badge variant={p.payment_status === 'paid' ? 'green' : 'red'}>
                                {p.payment_status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Purchase Returns */}
            {activeTab === 'returns' && (
              <div>
                {viewing.returns.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">No returns found for this supplier.</p>
                ) : (
                  <div className="overflow-x-auto max-h-96 rounded-xl border border-slate-200">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date & Time</th>
                          <th>Return #</th>
                          <th>Product</th>
                          <th>Qty</th>
                          <th>Total Amount</th>
                          <th>Resolution</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewing.returns.map((r: any) => (
                          <tr key={r.id}>
                            <td className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                            <td className="font-medium text-slate-800">{r.return_number}</td>
                            <td>{r.product_name}</td>
                            <td>{r.quantity}</td>
                            <td className="font-semibold text-slate-800">{formatCurrency(r.total_amount, symbol)}</td>
                            <td>
                              <Badge variant={r.resolution === 'cash' ? 'green' : 'blue'}>
                                {r.resolution === 'cash' ? 'Cash Refund' : 'Credit Note'}
                              </Badge>
                            </td>
                            <td>
                              <Badge variant={r.status === 'approved' ? 'green' : 'amber'}>{r.status}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Printable Payment Voucher Slip */}
      {printSlip && (
        <PrintPreview
          open={!!printSlip}
          onClose={() => setPrintSlip(null)}
          title={`Supplier Payment Voucher — ${printSlip.payment.payment_number || 'SP'}`}
          size="md"
          fileName={`payment_voucher_${sanitizePdfName(printSlip.supplier.name)}_${sanitizePdfName(printSlip.payment.payment_number || 'SP')}.pdf`}
        >
          <PrintDocument
            storeName={settings?.store_name || 'Supplier Payment Voucher'}
            subtitle="SUPPLIER PAYMENT VOUCHER"
            logoSrc={logoSrc}
            fields={[
              { label: 'Business', value: settings?.store_name || '—' },
              { label: 'Address', value: settings?.address || '—', span: 2 },
              { label: 'Phone', value: settings?.phone || '—' },
              { label: 'Business NTN', value: settings?.ntn?.trim() || '—' },
              { label: 'Voucher #', value: printSlip.payment.payment_number || 'SP' },
            ]}
          >
            <div className="mb-4 grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-slate-400 font-medium">Supplier Details</p>
                <p className="font-bold text-slate-900 text-sm">{printSlip.supplier.name}</p>
                <p className="text-slate-600">{printSlip.supplier.phone || '—'}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-400 font-medium">Date & Time</p>
                <p className="font-bold text-slate-900">{formatDateTime(printSlip.payment.created_at)}</p>
                <p className="text-slate-600">Method: {printSlip.payment.method?.toUpperCase() || 'CASH'}</p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-300 p-4 bg-slate-50 my-4 text-center">
              <p className="text-xs text-slate-500 uppercase font-semibold">Payment Amount Released</p>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {formatCurrency(printSlip.payment.amount, symbol)}
              </p>
              {printSlip.payment.note && (
                <p className="text-xs text-slate-600 mt-1 font-medium">"{printSlip.payment.note}"</p>
              )}
            </div>

            <div className="mt-8 grid grid-cols-2 gap-8 text-center text-xs pt-8 border-t border-dashed border-slate-300">
              <div>
                <div className="border-b border-slate-400 pb-1 mb-1 font-medium text-slate-800">
                  {printSlip.supplier.name}
                </div>
                <p className="text-slate-500">Supplier Receiver Signature</p>
              </div>
              <div>
                <div className="border-b border-slate-400 pb-1 mb-1 font-medium text-slate-800">
                  Authorized Cashier / Manager
                </div>
                <p className="text-slate-500">Authorized Signature & Stamp</p>
              </div>
            </div>
          </PrintDocument>
        </PrintPreview>
      )}
    </div>
  );
}

function PaySupplierModal({
  supplier,
  accounts,
  open,
  onClose,
  onPaid,
  symbol,
}: {
  supplier: Supplier | null;
  accounts: any[];
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
  symbol: string;
}) {
  const [amount, setAmount] = useState<number | ''>('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { notify } = useToast();

  useEffect(() => {
    if (supplier) {
      setAmount(supplier.balance > 0 ? supplier.balance : '');
      setMethod('cash');
      setNote(`Payment to ${supplier.name}`);
    }
  }, [supplier]);

  if (!supplier) return null;

  const handlePay = async () => {
    const payAmt = Number(amount);
    if (payAmt <= 0) return;
    setSubmitting(true);
    try {
      // 1. Deduct from payment account
      const acc = accounts.find((a) => a.type === method) || accounts.find((a) => a.type === 'cash');
      if (acc) {
        await api.put(`/api/data/payment_accounts/${acc.id}`, {
          balance: Number(acc.balance || 0) - payAmt,
        });
      }

      const spNumber = generateDocNumber('SP');
      // 2. Post to supplier_payments
      await api.post('/api/data/supplier_payments', {
        supplier_id: supplier.id,
        payment_number: spNumber,
        amount: payAmt,
        method,
        account_type: acc?.type || method,
        note: note.trim() || `Payment to ${supplier.name}`,
      });

      // 3. Post to transactions
      await api.post('/api/data/transactions', {
        type: 'supplier_payment',
        account_type: acc?.type || method,
        amount: payAmt,
        reference_type: 'supplier',
        reference_id: supplier.id,
        party_type: 'supplier',
        party_id: supplier.id,
        note: note.trim() || `Payment to ${supplier.name} (${spNumber})`,
        date: new Date().toISOString().slice(0, 10),
      });

      // 4. Deduct from supplier balance
      await api.put(`/api/data/suppliers/${supplier.id}`, {
        balance: Number(supplier.balance || 0) - payAmt,
      });

      // 5. Update unpaid/partial POs for this supplier if any
      const pos = await api.get<any[]>('/api/data/purchase_orders');
      const supplierPOs = (pos || [])
        .filter((p) => p.supplier_id === supplier.id && p.payment_status !== 'paid')
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

      let remainingToApply = payAmt;
      for (const po of supplierPOs) {
        if (remainingToApply <= 0) break;
        const due = Math.max(0, Number(po.total) - Number(po.paid_amount || 0));
        const applying = Math.min(due, remainingToApply);
        const newPaid = Number(po.paid_amount || 0) + applying;
        const newStatus = newPaid >= Number(po.total) ? 'paid' : 'partial';
        await api.put(`/api/data/purchase_orders/${po.id}`, {
          paid_amount: newPaid,
          payment_status: newStatus,
        });
        remainingToApply -= applying;
      }

      notify(`Payment of ${formatCurrency(payAmt, symbol)} recorded with date & time`, 'success');
      onPaid();
      onClose();
    } catch (e: any) {
      notify(e.message || 'Payment failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Pay Supplier — ${supplier.name}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="success"
            onClick={handlePay}
            disabled={!amount || Number(amount) <= 0 || submitting}
          >
            {submitting ? 'Recording...' : `Confirm Payment — ${formatCurrency(Number(amount || 0), symbol)}`}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-xl bg-slate-50 p-3 border border-slate-200 text-xs flex justify-between">
          <span className="text-slate-500">Current Outstanding Balance:</span>
          <span className="font-bold text-slate-800 text-sm">{formatCurrency(supplier.balance, symbol)}</span>
        </div>
        <Field label={`Payment Amount (${symbol})`} required>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
            autoFocus
            placeholder="0"
          />
        </Field>
        <Field label="Paid From Account">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.type}>
                {a.name || a.type} ({formatCurrency(a.balance, symbol)})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note / Reference">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Check #, invoice # or cash reference"
          />
        </Field>
      </div>
    </Modal>
  );
}

function SupplierForm({ open, onClose, onSave, editing }: { open: boolean; onClose: () => void; onSave: (d: any) => void; editing: any }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', company_id: '', contact_person: '', opening_balance: 0 });
  const [companies, setCompanies] = useState<Company[]>([]);
  useEffect(() => {
    api.get<Company[]>('/api/data/companies')
      .then((data) => setCompanies((data || []).sort((a, b) => a.name.localeCompare(b.name))))
      .catch(() => setCompanies([]));
    if (editing) setForm({ name: editing.name, phone: editing.phone || '', email: editing.email || '', address: editing.address || '', company_id: editing.company_id || '', contact_person: editing.contact_person || '', opening_balance: editing.opening_balance || 0 });
    else setForm({ name: '', phone: '', email: '', address: '', company_id: '', contact_person: '', opening_balance: 0 });
  }, [editing, open]);
  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Supplier' : 'Add Supplier'} size="md" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onSave({ ...form, company_id: form.company_id || null })} disabled={!form.name}>Save</Button></>}>
      <div className="space-y-3">
        <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus /></Field>
        <Field label="Company"><Select value={form.company_id} onChange={(e) => setForm({ ...form, company_id: e.target.value })}><option value="">No company</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact Person"><Input value={form.contact_person} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} /></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
        </div>
        <Field label="Email"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Address"><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} rows={2} /></Field>
        <Field label="Opening Balance"><Input type="number" value={form.opening_balance || ''} onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })} /></Field>
      </div>
    </Modal>
  );
}
