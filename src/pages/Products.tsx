import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { api, resolveImageUrl } from '@/lib/api';
import type { Product, Category, Brand, Company } from '@/lib/types';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/Button';
import { Field, Input, Select, Textarea } from '@/components/Form';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal, ConfirmModal } from '@/components/Modal';
import { Pagination } from '@/components/Pagination';
import { formatCurrency, cn } from '@/lib/utils';
import { cartonRateFromPiece, piecesPerCarton } from '@/lib/units';
import { receiveStockBatch } from '@/lib/fifo';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Package,
  AlertTriangle,
  PackageX,
  Tag,
  Building2,
  Layers,
  RefreshCw,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  X,
  Info,
} from 'lucide-react';
import { parseCsv, generateCsv, downloadCsv, PRODUCT_CSV_HEADERS, PRODUCT_CSV_SAMPLE_ROWS } from '@/lib/csv';

// Helper: SKU Generation
function generateSKU(prefix: string = 'PRD'): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase() || 'PRD';
  const randomNum = Math.floor(100000 + Math.random() * 900000);
  return `${cleanPrefix}-${randomNum}`;
}

export function Products() {
  const { symbol } = useSettings();
  const { notify } = useToast();

  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);

  const [search, setSearch] = useState('');
  const [stockFilter, setStockFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(48);
  const [showForm, setShowForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, cRes, bRes, coRes] = await Promise.all([
        api.get<Product[]>('/api/data/products?limit=10000'),
        api.get<Category[]>('/api/data/categories'),
        api.get<Brand[]>('/api/data/brands'),
        api.get<Company[]>('/api/data/companies'),
      ]);

      setProducts((pRes || []).sort((a, b) => a.name.localeCompare(b.name)));
      setCategories((cRes || []).sort((a, b) => a.name.localeCompare(b.name)));
      setBrands((bRes || []).sort((a, b) => a.name.localeCompare(b.name)));
      setCompanies((coRes || []).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error: any) {
      setProducts([]);
      setCategories([]);
      setBrands([]);
      setCompanies([]);
      notify(error.message || 'Failed to load catalog data', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, stockFilter]);

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const brandMap = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);
  const companyMap = useMemo(() => new Map(companies.map((co) => [co.id, co])), [companies]);

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    return products.filter((p) => {
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q);
      const matchStock =
        stockFilter === 'all' ||
        (stockFilter === 'low' && p.stock_quantity > 0 && p.stock_quantity <= p.min_stock_level) ||
        (stockFilter === 'out' && p.stock_quantity <= 0) ||
        (stockFilter === 'ok' && p.stock_quantity > p.min_stock_level);

      return matchSearch && matchStock;
    });
  }, [products, search, stockFilter]);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredProducts.slice(start, start + pageSize);
  }, [filteredProducts, currentPage, pageSize]);

  const handleSave = async (data: Partial<Product>) => {
    try {
      const payload: any = { ...data };
      if (!payload.cost_price && payload.purchase_price) {
        payload.cost_price = payload.purchase_price;
      }
      if (!payload.purchase_price && payload.cost_price) {
        payload.purchase_price = payload.cost_price;
      }
      if (editing) {
        await api.put(`/api/data/products/${editing.id}`, payload);
        notify('Product updated successfully', 'success');
      } else {
        const created = await api.post<Product>('/api/data/products', payload);
        if (created?.id && Number(payload.stock_quantity || 0) > 0) {
          try {
            await receiveStockBatch(
              created.id,
              'INITIAL-STOCK',
              Number(payload.stock_quantity),
              Number(payload.purchase_price || 0)
            );
          } catch {
            // Non-critical batch creation error
          }
        }
        notify('Product added successfully', 'success');
      }
      setShowForm(false);
      setEditing(null);
      loadData();
    } catch (error: any) {
      notify(error.message || 'Failed to save product', 'error');
    }
  };

  const handleDelete = async (p: Product) => {
    try {
      await api.delete(`/api/data/products/${p.id}`);
      notify('Product deleted', 'success');
      setDeleteTarget(null);
      loadData();
    } catch (error: any) {
      notify(error.message || 'Failed to delete product', 'error');
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader title="Products" />
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle={`${products.length} products in catalog`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              icon={<Upload size={16} />}
              onClick={() => setShowImportModal(true)}
            >
              Import CSV
            </Button>
            <Button
              icon={<Plus size={18} />}
              onClick={() => {
                setEditing(null);
                setShowForm(true);
              }}
            >
              Add Product
            </Button>
          </div>
        }
      />

      {/* Controls Header */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or SKU..."
            className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
          />
        </div>
        <select
          value={stockFilter}
          onChange={(e) => setStockFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
        >
          <option value="all">All Stock</option>
          <option value="ok">In Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>
      </div>

      {/* Grid Content */}
      {filteredProducts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Package size={32} />}
            title="No products found"
            description="Try adjusting your filters or add a new product"
            action={
              <Button
                icon={<Plus size={18} />}
                onClick={() => {
                  setEditing(null);
                  setShowForm(true);
                }}
              >
                Add Product
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {paginatedProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                currencySymbol={symbol}
                category={categoryMap.get(product.category_id ?? '')}
                brand={brandMap.get(product.brand_id ?? '')}
                company={companyMap.get(product.company_id ?? '')}
                onEdit={(p) => {
                  setEditing(p);
                  setShowForm(true);
                }}
                onDelete={(p) => setDeleteTarget(p)}
              />
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalItems={filteredProducts.length}
            pageSize={pageSize}
            onPageChange={(p) => {
              setCurrentPage(p);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[24, 48, 96, 192]}
            itemLabel="products"
            className="mt-6"
          />
        </>
      )}

      {/* Product Form Modal */}
      <ProductForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditing(null);
        }}
        onSave={handleSave}
        editing={editing}
        categories={categories}
        brands={brands}
        companies={companies}
      />

      {/* Confirmation Modal */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        title="Delete Product"
        message={`Delete ${deleteTarget?.name}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />

      {/* CSV Import Modal */}
      <ImportProductsModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          setShowImportModal(false);
          loadData();
        }}
        categories={categories}
        brands={brands}
        companies={companies}
        existingProducts={products}
        symbol={symbol}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              PRODUCT CARD ITEM                             */
/* -------------------------------------------------------------------------- */

interface ProductCardProps {
  product: Product;
  currencySymbol: string;
  category?: Category;
  brand?: Brand;
  company?: Company;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
}

function ProductCard({ product, currencySymbol, category, brand, company, onEdit, onDelete }: ProductCardProps) {
  const isOut = product.stock_quantity <= 0;
  const isLow = product.stock_quantity > 0 && product.stock_quantity <= product.min_stock_level;
  const hasConversions = product.carton_to_box > 0 || product.box_to_pack > 0 || product.pack_to_piece > 0;

  return (
    <Card className="flex flex-col justify-between overflow-hidden transition-all hover:shadow-md">
      <div className="space-y-3 p-4">
        {/* Header: Image, Title, Actions */}
        <div className="flex items-start gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 overflow-hidden">
            {product.image_url ? (
              <img src={resolveImageUrl(product.image_url) || product.image_url} alt={product.name} className="h-full w-full rounded-lg object-cover" />
            ) : brand?.logo_url ? (
              <img src={resolveImageUrl(brand.logo_url) || brand.logo_url} alt={product.name} className="h-full w-full rounded-lg object-contain p-1" />
            ) : (
              <Package size={24} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-1">
              <h3 className="truncate text-base font-semibold text-slate-800" title={product.name}>
                {product.name}
              </h3>
              <div className="flex shrink-0 gap-1">
                <button
                  onClick={() => onEdit(product)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  aria-label="Edit product"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => onDelete(product)}
                  className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label="Delete product"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            {/* Badges */}
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
              {isOut ? (
                <Badge variant="red">
                  <PackageX size={11} className="mr-1 inline" /> Out
                </Badge>
              ) : isLow ? (
                <Badge variant="amber">
                  <AlertTriangle size={11} className="mr-1 inline" /> Low
                </Badge>
              ) : (
                <Badge variant="green">Active</Badge>
              )}
              {category && (
                <Badge variant="blue">
                  <Layers size={10} className="mr-1 inline" />
                  {category.name}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {product.description && <p className="line-clamp-2 text-xs text-slate-500">{product.description}</p>}

        {/* Identifiers (SKU, Brand, Company) */}
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-2 text-xs">
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-slate-400">SKU</span>
            <span className="font-mono font-medium text-slate-700">{product.sku || '—'}</span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-slate-400">Brand</span>
            <span className="flex items-center font-medium text-slate-700 truncate">
              {brand ? (
                <>
                  {brand.logo_url ? (
                    <img
                      src={resolveImageUrl(brand.logo_url) || brand.logo_url}
                      alt={brand.name}
                      className="mr-1 h-3.5 w-3.5 rounded object-contain shrink-0"
                    />
                  ) : (
                    <Tag size={10} className="mr-1 text-slate-400 shrink-0" />
                  )}
                  <span className="truncate">{brand.name}</span>
                </>
              ) : (
                '—'
              )}
            </span>
          </div>
          <div>
            <span className="block text-[10px] uppercase tracking-wider text-slate-400">Company</span>
            <span className="flex items-center font-medium text-slate-700">
              {company ? (
                <>
                  <Building2 size={10} className="mr-1 text-slate-400" />
                  {company.name}
                </>
              ) : (
                '—'
              )}
            </span>
          </div>
        </div>

        {/* Pricing Matrix */}
        <div className="space-y-1.5 border-t border-slate-100 pt-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>Prices / Piece</span>
            <span className="text-emerald-600">Retail: {formatCurrency(product.retail_price, currencySymbol)}</span>
          </div>
          <div className="grid grid-cols-4 gap-1 rounded border border-slate-100 p-1.5 text-[11px] text-slate-600">
            <div>
              <span className="block text-[9px] font-medium text-slate-400">Buy Rate</span>
              <span className="font-semibold text-slate-800">{formatCurrency(product.purchase_price, currencySymbol)}</span>
            </div>
            <div>
              <span className="block text-[9px] text-slate-400">Dealer</span>
              <span>{product.dealer_price ? formatCurrency(product.dealer_price, currencySymbol) : '—'}</span>
            </div>
            <div>
              <span className="block text-[9px] text-slate-400">Wholesale</span>
              <span>{product.wholesale_price ? formatCurrency(product.wholesale_price, currencySymbol) : '—'}</span>
            </div>
            <div>
              <span className="block text-[9px] text-slate-400">Retail</span>
              <span>{product.retail_price ? formatCurrency(product.retail_price, currencySymbol) : '—'}</span>
            </div>
          </div>
          {product.carton_to_box > 0 && (
            <p className="text-[10px] text-slate-400">
              Carton rate (Retail): {formatCurrency(cartonRateFromPiece(product.retail_price, product.carton_to_box), currencySymbol)} ({product.carton_to_box} pcs/ctn)
            </p>
          )}
        </div>

        {/* Unit Conversions */}
        {hasConversions && (
          <div className="border-t border-slate-100 pt-2 text-xs">
            <span className="block text-[10px] font-medium text-slate-400">Packing</span>
            <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-slate-600">
              {product.carton_to_box > 0 && <span>1 Carton = {product.carton_to_box} Pieces</span>}
            </div>
          </div>
        )}
      </div>

      {/* Footer: Stock Summary */}
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2 text-xs">
        <span className="text-slate-500">
          Min Stock: <strong className="text-slate-700">{product.min_stock_level} pcs</strong>
        </span>
        <div>
          <span className="mr-1 text-slate-500">Stock:</span>
          <span className={cn('font-bold', isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-emerald-600')}>
            {product.stock_quantity} pcs{product.carton_to_box > 1 ? ` (${(product.stock_quantity / product.carton_to_box).toFixed(1)} ctn)` : ''}
          </span>
        </div>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/*                            PRODUCT FORM MODAL                              */
/* -------------------------------------------------------------------------- */

interface ProductFormProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<Product>) => void;
  editing: Product | null;
  categories: Category[];
  brands: Brand[];
  companies: Company[];
}

const initialFormState = {
  name: '',
  sku: '',
  image_url: '',
  category_id: '',
  brand_id: '',
  company_id: '',
  purchase_price: 0,
  cost_price: 0,
  retail_price: 0,
  wholesale_price: 0,
  dealer_price: 0,
  special_price: 0,
  promotional_price: 0,
  min_selling_price: 0,
  stock_quantity: 0,
  min_stock_level: 0,
  unit: 'piece',
  status: 'active',
  carton_to_box: 1,
  box_to_pack: 0,
  pack_to_piece: 0,
  description: '',
};

function ProductForm({ open, onClose, onSave, editing, categories, brands, companies }: ProductFormProps) {
  const { isAdmin, hasPermission } = useAuth();
  const canEditPrices = isAdmin || hasPermission('edit_prices');
  const [form, setForm] = useState(initialFormState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { notify } = useToast();

  const handleUploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const res = await api.uploadFile(file);
      updateField('image_url', res.url);
      notify('Product photo uploaded', 'success');
    } catch (e: any) {
      notify(e.message || 'Photo upload failed', 'error');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        sku: editing.sku || '',
        image_url: editing.image_url || '',
        category_id: editing.category_id || '',
        brand_id: editing.brand_id || '',
        company_id: editing.company_id || '',
        purchase_price: editing.purchase_price || 0,
        cost_price: editing.cost_price || 0,
        retail_price: editing.retail_price || 0,
        wholesale_price: editing.wholesale_price || 0,
        dealer_price: editing.dealer_price || 0,
        special_price: editing.special_price || 0,
        promotional_price: editing.promotional_price || 0,
        min_selling_price: editing.min_selling_price || 0,
        stock_quantity: editing.stock_quantity || 0,
        min_stock_level: editing.min_stock_level || 0,
        unit: editing.unit || 'piece',
        status: editing.status || 'active',
        carton_to_box: editing.carton_to_box || 1,
        box_to_pack: editing.box_to_pack || 0,
        pack_to_piece: editing.pack_to_piece || 0,
        description: editing.description || '',
      });
    } else if (open) {
      setForm({
        ...initialFormState,
        sku: generateSKU('PRD'),
        unit: 'piece',
        carton_to_box: 1,
      });
    }
  }, [editing, open]);

  const updateField = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleRegenerateSKU = () => {
    let prefix = 'PRD';
    if (form.category_id) {
      const selectedCategory = categories.find((c) => c.id === form.category_id);
      if (selectedCategory) prefix = selectedCategory.name;
    } else if (form.name) {
      prefix = form.name;
    }
    updateField('sku', generateSKU(prefix));
  };

  const handleSubmit = () => {
    const payload = {
      ...form,
      unit: form.unit || 'piece',
      category_id: form.category_id || null,
      brand_id: form.brand_id || null,
      company_id: form.company_id || null,
    };
    if (!canEditPrices) {
      payload.purchase_price = editing ? editing.purchase_price : 0;
      payload.cost_price = editing ? editing.cost_price : 0;
      payload.retail_price = editing ? (editing.retail_price || 0) : 0;
      payload.wholesale_price = editing ? (editing.wholesale_price || 0) : 0;
      payload.dealer_price = editing ? (editing.dealer_price || 0) : 0;
    }
    onSave(payload);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit Product' : 'Add Product'}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!form.name.trim() || uploading}>
            {uploading ? 'Uploading...' : 'Save Product'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Name & Image */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 items-start">
          <Field label="Product Name" required>
            <Input
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              placeholder="Product name"
              autoFocus
            />
          </Field>

          <Field label="Product Photo (from computer)">
            <div className="flex items-center gap-3">
              {form.image_url ? (
                <div className="relative group shrink-0">
                  <img
                    src={resolveImageUrl(form.image_url) || form.image_url}
                    alt="Product preview"
                    className="h-14 w-14 rounded-xl object-cover ring-1 ring-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => updateField('image_url', '')}
                    className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm hover:bg-rose-600 transition"
                    title="Remove photo"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400">
                  <Package size={22} className="text-slate-300" />
                </div>
              )}
              <div className="flex-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadPhoto(file);
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
                  {uploading ? 'Uploading...' : form.image_url ? 'Change Photo' : 'Upload Photo'}
                </Button>
                <p className="mt-1 text-xs text-slate-400">PNG, JPG, or WebP from PC</p>
              </div>
            </div>
          </Field>
        </div>

        {/* SKU & Unit */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="SKU">
            <div className="flex gap-2">
              <Input
                value={form.sku}
                onChange={(e) => updateField('sku', e.target.value)}
                placeholder="SKU code"
                className="font-mono uppercase"
              />
              <button
                type="button"
                onClick={handleRegenerateSKU}
                title="Regenerate SKU"
                className="flex items-center justify-center rounded-lg border border-slate-300 bg-slate-50 px-3 text-slate-600 transition-colors hover:bg-slate-100"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </Field>
          <Field label="Unit">
            <Input
              value={form.unit}
              onChange={(e) => updateField('unit', e.target.value)}
              placeholder="pcs, kg, box"
            />
          </Field>
        </div>

        {/* Company, Category & Brand */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Company">
            <Select value={form.company_id} onChange={(e) => updateField('company_id', e.target.value)}>
              <option value="">No company</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category">
            <Select value={form.category_id} onChange={(e) => updateField('category_id', e.target.value)}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Brand">
            <Select value={form.brand_id} onChange={(e) => updateField('brand_id', e.target.value)}>
              <option value="">No brand</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Description">
          <Textarea
            value={form.description}
            onChange={(e) => updateField('description', e.target.value)}
            rows={2}
          />
        </Field>

        {/* Pricing — all rates are per piece */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-700">Pricing & Cost (per piece)</p>
            {!canEditPrices && (
              <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                Price Locked: Admin Only
              </span>
            )}
          </div>
          {!canEditPrices && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 border border-amber-200">
              <AlertTriangle size={15} className="shrink-0 text-amber-600" />
              <span>Price Editing Locked: Only Admin has permission to modify product purchase and selling prices.</span>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Purchase Price (Buy Rate / Piece)">
              <Input
                type="number"
                value={form.purchase_price || ''}
                disabled={!canEditPrices}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  updateField('purchase_price', val);
                  updateField('cost_price', val);
                }}
                placeholder="Buy rate per piece"
              />
            </Field>
            <Field label="Dealer Rate / Piece">
              <Input
                type="number"
                value={form.dealer_price || ''}
                disabled={!canEditPrices}
                onChange={(e) => updateField('dealer_price', Number(e.target.value))}
                placeholder="Dealer"
              />
            </Field>
            <Field label="Wholesale Rate / Piece">
              <Input
                type="number"
                value={form.wholesale_price || ''}
                disabled={!canEditPrices}
                onChange={(e) => updateField('wholesale_price', Number(e.target.value))}
                placeholder="Wholesale"
              />
            </Field>
            <Field label="Retail Rate / Piece">
              <Input
                type="number"
                value={form.retail_price || ''}
                disabled={!canEditPrices}
                onChange={(e) => updateField('retail_price', Number(e.target.value))}
                placeholder="Retail"
              />
            </Field>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500">
            * <strong>Purchase Price</strong> is the buy cost per piece. It automatically updates when Purchase Orders are received.
          </p>
          {Number(form.carton_to_box) > 0 && Number(form.retail_price) > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Derived carton rate (Retail):{' '}
              <span className="font-semibold text-slate-700">
                {formatCurrency(cartonRateFromPiece(Number(form.retail_price), Number(form.carton_to_box)), 'Rs')}
              </span>
              {' '}· wholesale carton:{' '}
              <span className="font-semibold text-slate-700">
                {formatCurrency(cartonRateFromPiece(Number(form.wholesale_price), Number(form.carton_to_box)), 'Rs')}
              </span>
              {' '}· dealer carton:{' '}
              <span className="font-semibold text-slate-700">
                {formatCurrency(cartonRateFromPiece(Number(form.dealer_price), Number(form.carton_to_box)), 'Rs')}
              </span>
            </p>
          )}
        </div>

        {/* Unit Conversions */}
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Packaging & Stock Conversion</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Pieces per Carton">
              <Input
                type="number"
                value={form.carton_to_box || ''}
                onChange={(e) => updateField('carton_to_box', Number(e.target.value))}
                placeholder="e.g. 20"
              />
            </Field>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Used to convert carton purchases into piece-level stock: 1 carton = {form.carton_to_box || 1} pieces.</p>
        </div>

        {/* Inventory */}
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Inventory</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Stock (pieces)">
              <Input
                type="number"
                value={form.stock_quantity || ''}
                onChange={(e) => updateField('stock_quantity', Number(e.target.value))}
              />
            </Field>
            <Field label="Min Stock Alert (pieces)">
              <Input
                type="number"
                value={form.min_stock_level || ''}
                onChange={(e) => updateField('min_stock_level', Number(e.target.value))}
              />
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={(e) => updateField('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </Field>
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*                         IMPORT PRODUCTS CSV MODAL                          */
/* -------------------------------------------------------------------------- */

interface ParsedProductRow {
  name: string;
  brandName: string;
  categoryName: string;
  companyName: string;
  purchasePrice: number;
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  dealerPrice: number;
  cartonToBox: number;
  stockQuantity: number;
  minStockLevel: number;
  unit: string;
  sku: string;
  barcode: string;
  description: string;
  isValid: boolean;
  error?: string;
}

function ImportProductsModal({
  open,
  onClose,
  onSuccess,
  categories,
  brands,
  companies,
  existingProducts = [],
  symbol,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categories: Category[];
  brands: Brand[];
  companies: Company[];
  existingProducts?: Product[];
  symbol: string;
}) {
  const { notify } = useToast();
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedProductRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFileName('');
      setParsedRows([]);
      setImporting(false);
      setImportProgress(0);
    }
  }, [open]);

  const handleDownloadSample = () => {
    const csvStr = generateCsv(PRODUCT_CSV_HEADERS, PRODUCT_CSV_SAMPLE_ROWS);
    downloadCsv('biscuit_products_template.csv', csvStr);
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
        notify('CSV must have a header row and at least 1 product row', 'error');
        return;
      }

      // First row is headers
      const headers = rawRows[0].map((h) => h.toLowerCase().trim());
      const findIdx = (...names: string[]) =>
        headers.findIndex((h) => names.some((n) => h.includes(n)));

      const nameIdx = findIdx('product name', 'product', 'item name', 'name', 'title');
      const brandIdx = findIdx('brand');
      const catIdx = findIdx('category');
      const companyIdx = findIdx('company');
      const purIdx = findIdx('purchase price', 'purchase rate', 'buy rate', 'buy price', 'purchase');
      const costIdx = findIdx('cost price', 'avg cost', 'average cost', 'cost');
      const retIdx = findIdx('surrounding rate', 'surrounding price', 'surrounding', 'retail price', 'retail rate', 'retail', 'sale price');
      const whoIdx = findIdx('wholesale price', 'wholesale rate', 'wholesale');
      const dealerIdx = findIdx('dealer price', 'dealer rate', 'dealer');
      const boxesIdx = findIdx('boxes per carton', 'boxes / carton', 'boxes/carton', 'box per carton', 'carton to box', 'carton_to_box', 'boxes', 'box', 'packing');
      const stockIdx = findIdx('stock quantity', 'initial stock', 'stock', 'qty', 'quantity');
      const minStockIdx = findIdx('min stock level', 'min stock', 'minimum stock', 'reorder level');
      const unitIdx = findIdx('unit', 'uom');
      const skuIdx = findIdx('sku', 'code', 'item code');
      const barIdx = findIdx('barcode', 'upc', 'ean');
      const descIdx = findIdx('description', 'desc', 'details', 'notes');

      const dataRows = rawRows.slice(1);
      const seenNamesInCsv = new Set<string>();
      const existingNameMap = new Set(existingProducts.map((p) => p.name.toLowerCase().trim()));

      const rows: ParsedProductRow[] = dataRows.map((cols) => {
        let name = (nameIdx >= 0 ? cols[nameIdx] : cols[0])?.trim() || '';
        // Clean up common encoding artifacts like \uFFFD (e.g. from Éclairs)
        name = name.replace(/\uFFFD/g, 'E');

        const brandName = (brandIdx >= 0 ? cols[brandIdx] : '')?.trim() || '';
        const categoryName = (catIdx >= 0 ? cols[catIdx] : '')?.trim() || '';
        const companyName = (companyIdx >= 0 ? cols[companyIdx] : '')?.trim() || '';
        const purchasePrice = Math.max(0, Number((purIdx >= 0 ? cols[purIdx] : '0').replace(/[^0-9.]/g, '')) || 0);
        const costPrice = Math.max(0, Number((costIdx >= 0 ? cols[costIdx] : '0').replace(/[^0-9.]/g, '')) || 0);
        const retailPrice = Math.max(0, Number((retIdx >= 0 ? cols[retIdx] : '0').replace(/[^0-9.]/g, '')) || 0);
        const wholesalePrice = Math.max(0, Number((whoIdx >= 0 ? cols[whoIdx] : '0').replace(/[^0-9.]/g, '')) || 0);
        const dealerPrice = Math.max(0, Number((dealerIdx >= 0 ? cols[dealerIdx] : '0').replace(/[^0-9.]/g, '')) || 0);
        const cartonToBox = Math.max(0, Number((boxesIdx >= 0 ? cols[boxesIdx] : '0').replace(/[^0-9.]/g, '')) || 0);
        const stockQuantity = Math.max(0, Number((stockIdx >= 0 ? cols[stockIdx] : '0').replace(/[^0-9.]/g, '')) || 0);
        const minStockLevel = Math.max(0, Number((minStockIdx >= 0 ? cols[minStockIdx] : '0').replace(/[^0-9.]/g, '')) || 0);
        const unit = (unitIdx >= 0 ? cols[unitIdx] : '')?.trim() || 'carton';
        let sku = (skuIdx >= 0 ? cols[skuIdx] : '')?.trim() || '';
        if (!sku) {
          sku = generateSKU(brandName || categoryName || 'PRD');
        }
        const barcode = (barIdx >= 0 ? cols[barIdx] : '')?.trim() || '';
        const description = (descIdx >= 0 ? cols[descIdx] : '')?.trim() || '';

        const lowerName = name.toLowerCase().trim();
        let isValid = Boolean(name);
        let error: string | undefined = !name ? 'Missing product name' : undefined;

        if (name) {
          if (seenNamesInCsv.has(lowerName)) {
            isValid = false;
            error = 'Duplicate in CSV (skipped)';
          } else if (existingNameMap.has(lowerName)) {
            isValid = false;
            error = 'Already in inventory (skipped)';
          } else {
            seenNamesInCsv.add(lowerName);
          }
        }

        return {
          name,
          brandName,
          categoryName,
          companyName,
          purchasePrice,
          costPrice,
          retailPrice,
          wholesalePrice,
          dealerPrice,
          cartonToBox,
          stockQuantity,
          minStockLevel,
          unit,
          sku,
          barcode,
          description,
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
      notify('No valid products to import', 'error');
      return;
    }

    setImporting(true);
    setImportProgress(0);

    try {
      // Maps for brand, category & company lookup/creation
      const brandCache = new Map(brands.map((b) => [b.name.toLowerCase().trim(), b.id]));
      const catCache = new Map(categories.map((c) => [c.name.toLowerCase().trim(), c.id]));
      const companyCache = new Map(companies.map((co) => [co.name.toLowerCase().trim(), co.id]));

      let importedCount = 0;
      const failedRows: { name: string; reason: string }[] = [];

      for (let i = 0; i < validRows.length; i++) {
        const item = validRows[i];

        try {
          // Resolve or create Brand
          let brandId: string | null = null;
          if (item.brandName) {
            const key = item.brandName.toLowerCase().trim();
            if (brandCache.has(key)) {
              brandId = brandCache.get(key)!;
            } else {
              try {
                const newBrand = await api.post<Brand>('/api/data/brands', {
                  name: item.brandName,
                  description: 'Imported via CSV',
                });
                if (newBrand?.id) {
                  brandCache.set(key, newBrand.id);
                  brandId = newBrand.id;
                }
              } catch {
                // ignore brand creation error, proceed without brand
              }
            }
          }

          // Resolve or create Category
          let categoryId: string | null = null;
          if (item.categoryName) {
            const key = item.categoryName.toLowerCase().trim();
            if (catCache.has(key)) {
              categoryId = catCache.get(key)!;
            } else {
              try {
                const newCat = await api.post<Category>('/api/data/categories', {
                  name: item.categoryName,
                  description: 'Imported via CSV',
                });
                if (newCat?.id) {
                  catCache.set(key, newCat.id);
                  categoryId = newCat.id;
                }
              } catch {
                // ignore category creation error, proceed without category
              }
            }
          }

          // Resolve or create Company
          let companyId: string | null = null;
          if (item.companyName) {
            const key = item.companyName.toLowerCase().trim();
            if (companyCache.has(key)) {
              companyId = companyCache.get(key)!;
            } else {
              try {
                const newCo = await api.post<Company>('/api/data/companies', {
                  name: item.companyName,
                  description: 'Imported via CSV',
                });
                if (newCo?.id) {
                  companyCache.set(key, newCo.id);
                  companyId = newCo.id;
                }
              } catch {
                // ignore company creation error
              }
            }
          }

          // Create Product with all details including carton_to_box (Boxes per Carton)
          const newProd = await api.post<Product>('/api/data/products', {
            name: item.name,
            brand_id: brandId,
            category_id: categoryId,
            company_id: companyId,
            purchase_price: item.purchasePrice,
            cost_price: item.costPrice || item.purchasePrice,
            retail_price: item.retailPrice,
            wholesale_price: item.wholesalePrice || item.retailPrice,
            dealer_price: item.dealerPrice || item.wholesalePrice || item.retailPrice,
            special_price: item.wholesalePrice || item.retailPrice,
            promotional_price: 0,
            min_selling_price: item.purchasePrice,
            stock_quantity: item.stockQuantity,
            min_stock_level: item.minStockLevel > 0 ? item.minStockLevel : 5,
            unit: item.unit || 'carton',
            sku: item.sku,
            barcode: item.barcode || null,
            status: 'active',
            carton_to_box: item.cartonToBox || 0,
            box_to_pack: 0,
            pack_to_piece: 0,
            description: item.description || null,
            image_url: null,
          });

          // Record initial stock movement if quantity > 0
          if (newProd?.id && item.stockQuantity > 0) {
            try {
              await api.post('/api/data/stock_movements', {
                product_id: newProd.id,
                type: 'in',
                quantity: item.stockQuantity,
                reference_type: 'csv_import',
                reference_id: newProd.id,
                note: 'Initial stock imported from CSV',
              });
              await receiveStockBatch(
                newProd.id,
                'CSV-IMPORT',
                item.stockQuantity,
                item.purchasePrice || item.costPrice || 0
              );
            } catch {
              // Non-critical, continue
            }
          }

          importedCount++;
        } catch (itemErr: any) {
          failedRows.push({ name: item.name, reason: itemErr?.message || 'Server error' });
        }

        setImportProgress(Math.round(((i + 1) / validRows.length) * 100));
      }

      const skippedCount = parsedRows.length - validRows.length;
      let summary = `Imported ${importedCount} products successfully!`;
      if (skippedCount > 0) summary += ` (${skippedCount} duplicates/invalid skipped)`;
      if (failedRows.length > 0) summary += ` (${failedRows.length} failed)`;

      notify(summary, failedRows.length > 0 ? 'info' : 'success');
      onSuccess();
    } catch (err: any) {
      notify(err?.message || 'Failed during product import', 'error');
    } finally {
      setImporting(false);
    }
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import Products from CSV / Excel"
      size="xl"
      footer={
        <div className="flex w-full items-center justify-between">
          <div className="text-xs text-slate-500">
            {parsedRows.length > 0 ? (
              <span>
                <strong>{validCount}</strong> of <strong>{parsedRows.length}</strong> products ready to import
              </span>
            ) : (
              <span>Upload a CSV file to preview products</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={importing}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={validCount === 0 || importing}
              icon={importing ? <Spinner size="sm" /> : <CheckCircle2 size={16} />}
            >
              {importing ? `Importing (${importProgress}%)...` : `Import ${validCount} Products`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Step 1: Template Download Banner */}
        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1 max-w-lg">
            <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
              <FileSpreadsheet size={18} className="text-sky-600" />
              Download Standard Product CSV Template
            </div>
            <p className="text-xs text-slate-600">
              Use our ready-to-use template with columns for Product Name, Brand, Category, Company, Purchase Price, Surrounding & Wholesale Rates, Boxes per Carton, Stock, SKU, and Barcode.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            icon={<Download size={14} />}
            onClick={handleDownloadSample}
            className="bg-white hover:bg-sky-50 text-sky-700 border-sky-300 shadow-sm"
          >
            Download Sample CSV
          </Button>
        </div>

        {/* Step 2: Upload Dropzone */}
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
            className="rounded-xl border-2 border-dashed border-slate-300 hover:border-sky-500 bg-slate-50/50 hover:bg-sky-50/30 p-6 text-center cursor-pointer transition"
          >
            <Upload size={32} className="mx-auto text-slate-400 mb-2" />
            <p className="text-sm font-semibold text-slate-700">
              {fileName ? fileName : 'Click to select or drag & drop CSV file here'}
            </p>
            <p className="text-xs text-slate-400 mt-1">Supports standard CSV files (.csv) saved from Excel or Google Sheets</p>
          </div>
        </div>

        {/* Step 3: Preview Table */}
        {parsedRows.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Parsed Products Preview ({parsedRows.length})
              </h4>
              <span className="text-xs text-slate-500">
                Brands & Categories that don't exist yet will be created automatically.
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-3">#</th>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Brand</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-right">Buy Rate</th>
                    <th className="py-2.5 px-3 text-right">Surrounding Rate</th>
                    <th className="py-2.5 px-3 text-right">Wholesale</th>
                    <th className="py-2.5 px-3 text-center">Boxes/Ctn</th>
                    <th className="py-2.5 px-3 text-center">Initial Stock</th>
                    <th className="py-2.5 px-3">SKU</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {parsedRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={cn('transition-colors', !row.isValid ? 'bg-rose-50/50' : 'hover:bg-slate-50/60')}
                    >
                      <td className="py-2 px-3 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">{row.name || '—'}</td>
                      <td className="py-2 px-3 text-slate-600">
                        {row.brandName ? (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[11px]">
                            {row.brandName}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {row.categoryName ? (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[11px]">
                            {row.categoryName}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-slate-700">
                        {formatCurrency(row.purchasePrice, symbol)}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900">
                        {formatCurrency(row.retailPrice, symbol)}
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-emerald-700">
                        {formatCurrency(row.wholesalePrice, symbol)}
                      </td>
                      <td className="py-2 px-3 text-center font-semibold text-slate-700">
                        {row.cartonToBox > 0 ? (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 text-[11px] font-bold">
                            {row.cartonToBox}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-semibold text-slate-800">
                        {row.stockQuantity} {row.unit}
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-slate-500">{row.sku}</td>
                      <td className="py-2 px-3 text-center">
                        {row.isValid ? (
                          <Badge variant="green">Ready</Badge>
                        ) : (
                          <Badge variant="red">{row.error || 'Invalid'}</Badge>
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