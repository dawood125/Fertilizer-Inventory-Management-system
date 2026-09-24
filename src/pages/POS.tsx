import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { api, resolveImageUrl } from '@/lib/api';
import type { Product, Customer, CustomerProductPrice, Brand, Route as RouteType, SalesRep } from '@/lib/types';
import { useSettings } from '@/context/SettingsContext';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/components/Toast';
import { logAuditAction } from '@/lib/audit';
import { Button } from '@/components/Button';
import { Field, Input, Select, SearchableSelect, Textarea } from '@/components/Form';
import { Card, Badge, Spinner, PageHeader, EmptyState } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { PrintPreview } from '@/components/PrintPreview';
import { SalesInvoiceDocument } from '@/components/SalesInvoiceDocument';
import { formatCurrency, formatDate, generateDocNumber, cn } from '@/lib/utils';
import { computeBillTotals, lineBill } from '@/lib/billing';
import { sanitizePdfName } from '@/lib/printPdf';
import { allocateFifoCost } from '@/lib/fifo';
import {
  priceForUnit,
  stockInUnit,
  toCartons,
  toCartonRate,
  toPieces,
  toPieceRate,
  piecesPerCarton,
  type PriceType,
  type SaleUnit,
} from '@/lib/units';
import {
  Search, Plus, Minus, Trash2, ShoppingCart, UserPlus,
  Pause, Play, X, Printer, CheckCircle2, FileText, MessageCircle,
  Layers, Tag, ChevronLeft, ChevronRight,
} from 'lucide-react';

type PaymentMethod = 'cash' | 'bank' | 'jazzcash' | 'easypaisa' | 'cheque' | 'credit';
type PaymentType = 'full' | 'partial' | 'credit' | 'advance';

const PAYMENT_METHODS: { value: PaymentMethod; label: string; account: string | null }[] = [
  { value: 'cash', label: 'Cash', account: 'cash' },
  { value: 'bank', label: 'Bank', account: 'bank' },
  { value: 'jazzcash', label: 'JazzCash', account: 'jazzcash' },
  { value: 'easypaisa', label: 'EasyPaisa', account: 'easypaisa' },
  { value: 'cheque', label: 'Cheque', account: 'bank' },
  { value: 'credit', label: 'Credit (Pay Later)', account: null },
];

const PAYMENT_TYPES: { value: PaymentType; label: string }[] = [
  { value: 'full', label: 'Full Payment' },
  { value: 'partial', label: 'Partial Payment' },
  { value: 'credit', label: 'Credit Sale' },
  { value: 'advance', label: 'Advance Payment' },
];

interface CartItem {
  product: Product;
  quantity: number;
  unit: SaleUnit;
  unitPrice: number;
  discount: number;
  freeItems: number;
}

const PAGE_SIZE = 40;

function getPaginationRange(current: number, total: number): (number | string)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 3) return [1, 2, 3, 4, '...', total];
  if (current >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total];
  return [1, '...', current - 1, current, current + 1, '...', total];
}

export function POS({ navigate: _navigate }: { navigate: (path: string) => void }) {
  const { symbol, settings, logoSrc } = useSettings();
  const { user } = useAuth();
  const { notify } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerPrices, setCustomerPrices] = useState<Record<string, CustomerProductPrice>>({});
  const [priceType, setPriceType] = useState<PriceType>('retail');
  const [discount, setDiscount] = useState(0);
  const [taxRate, setTaxRate] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentType, setPaymentType] = useState<PaymentType>('full');
  const [paidAmount, setPaidAmount] = useState(0);
  const [heldOrders, setHeldOrders] = useState<any[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [pdfAction, setPdfAction] = useState<'save' | 'whatsapp' | null>(null);
  const pdfActionRef = useRef<'save' | 'whatsapp' | null>(null);
  pdfActionRef.current = pdfAction;
  const [showAddCustomer, setShowAddCustomer] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const handlePdfSaved = useCallback((result: 'saved' | 'cancelled' | 'printed' | 'error') => {
    const action = pdfActionRef.current;
    const receipt = lastReceipt;
    
    if (result === 'saved') {
      if (action === 'whatsapp' && receipt) {
        // Special success message for WhatsApp flow
        notify('PDF saved! Please drag and drop it into the WhatsApp chat.', 'success');
        const msg = `Invoice ${receipt.invoiceNumber}\n${receipt.customer?.name || 'Walk-in'}\nTotal: ${formatCurrency(receipt.total, symbol)}\nPaid: ${formatCurrency(receipt.paidAmount, symbol)}\nRemaining: ${formatCurrency(receipt.remaining, symbol)}`;
        if (receipt.customer?.phone) {
          const phone = String(receipt.customer.phone).replace(/[^\d]/g, '');
          window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
        } else {
          window.open(`https://web.whatsapp.com/`, '_blank');
        }
      } else {
        notify('PDF saved successfully', 'success');
      }
    } else if (result === 'printed') {
      notify('Choose Microsoft Print to PDF in the print dialog', 'info');
    } else if (result === 'error') {
      notify('Could not save PDF', 'error');
    }
    setPdfAction(null);
  }, [lastReceipt, notify, symbol]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === selectedCustomerId),
    [customers, selectedCustomerId]
  );

  const allowManualOverride = Boolean(selectedCustomer?.allow_manual_override);

  const resolveUnitPrice = useCallback(
    (product: Product, unit: SaleUnit, pt: PriceType = priceType) => {
      const saved = customerPrices[product.id]?.unit_price;
      return priceForUnit(product, pt, unit, selectedCustomer?.custom_price || 0, saved);
    },
    [customerPrices, priceType, selectedCustomer?.custom_price]
  );

  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);

  const brandMap = useMemo(() => new Map(brands.map((b) => [b.id, b])), [brands]);

  const loadData = useCallback(async () => {
    try {
      const [p, c, held, cats, bList] = await Promise.all([
        api.get<Product[]>('/api/data/products?limit=10000'),
        api.get<Customer[]>('/api/data/customers'),
        api.get<any[]>('/api/data/held_orders').catch(() => []),
        api.get<any[]>('/api/data/categories').catch(() => []),
        api.get<Brand[]>('/api/data/brands').catch(() => []),
      ]);
      setProducts((p || []).filter((x) => x.status === 'active').sort((a, b) => a.name.localeCompare(b.name)));
      setCustomers((c || []).sort((a, b) => a.name.localeCompare(b.name)));
      setCategories((cats || []).sort((a, b) => a.name.localeCompare(b.name)));
      setBrands(bList || []);
      setHeldOrders(
        (held || []).map((h) => {
          let payload = h.payload;
          if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch { payload = {}; }
          }
          return { ...h, ...payload, id: h.id };
        })
      );
    } catch {
      setProducts([]);
      setCustomers([]);
      setHeldOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Load remembered per-product prices for selected customer
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedCustomerId) {
        setCustomerPrices({});
        return;
      }
      try {
        const rows = await api.get<CustomerProductPrice[]>(
          `/api/data/customer_product_prices?customer_id=${encodeURIComponent(selectedCustomerId)}&limit=50000`
        );
        if (cancelled) return;
        const map: Record<string, CustomerProductPrice> = {};
        for (const r of rows || []) map[r.product_id] = r;
        setCustomerPrices(map);
      } catch {
        if (!cancelled) setCustomerPrices({});
      }
    })();
    return () => { cancelled = true; };
  }, [selectedCustomerId]);

  // Apply customer default price type + remembered prices when customer/prices change
  useEffect(() => {
    if (selectedCustomer) {
      let pt: PriceType = 'retail';
      if (selectedCustomer.default_price_type && selectedCustomer.default_price_type !== 'retail') {
        pt = selectedCustomer.default_price_type as PriceType;
      } else if (selectedCustomer.type === 'dealer') {
        pt = 'dealer';
      } else if (selectedCustomer.type === 'wholesaler') {
        pt = 'wholesale';
      } else if (selectedCustomer.default_price_type) {
        pt = selectedCustomer.default_price_type as PriceType;
      }
      setPriceType(pt);
      setCart((prev) => prev.map((c) => ({
        ...c,
        unitPrice: priceForUnit(
          c.product,
          pt,
          c.unit,
          selectedCustomer.custom_price || 0,
          customerPrices[c.product.id]?.unit_price
        ),
      })));
    } else {
      setPriceType('retail');
      setCart((prev) => prev.map((c) => ({
        ...c,
        unitPrice: priceForUnit(c.product, 'retail', c.unit, 0, null),
      })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: reprice on customer/price map change
  }, [selectedCustomerId, selectedCustomer?.id, customerPrices]);

  const changePriceType = (newType: PriceType) => {
    if (newType === 'custom' && !allowManualOverride) {
      notify('Custom price is not permitted for this customer. Enable "Allow Manual Price Override" in customer profile to use custom rates.', 'error');
      return;
    }
    setPriceType(newType);
    setCart((prev) => prev.map((c) => ({
      ...c,
      unitPrice: priceForUnit(
        c.product,
        newType,
        c.unit,
        selectedCustomer?.custom_price || 0,
        customerPrices[c.product.id]?.unit_price
      ),
    })));
  };

  const filtered = products.filter((p) => {
    if (selectedCategory && p.category_id !== selectedCategory) return false;
    if (selectedBrand && p.brand_id !== selectedBrand) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    const brandName = brandMap.get(p.brand_id || '')?.name.toLowerCase() || '';
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q) ||
      brandName.includes(q)
    );
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedCategory, selectedBrand]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const customerOptions = useMemo(
    () => customers.map((c) => {
      const parts = [c.name, c.area, c.phone].filter(Boolean);
      const label = parts.join(' · ');
      return {
        value: c.id,
        label,
        searchText: `${c.name} ${c.area || ''} ${c.phone || ''} ${c.owner_name || ''} ${c.ntn || ''}`,
      };
    }),
    [customers]
  );

  /** Click product → add to cart immediately (or +1 if already there). Default unit is piece. */
  const addProductToCart = (product: Product) => {
    if (product.stock_quantity <= 0) {
      notify(`${product.name} is out of stock`, 'error');
      return;
    }
    const unit: SaleUnit = 'piece';
    const unitPrice = resolveUnitPrice(product, unit);

    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) {
        const newQty = existing.quantity + 1;
        const needed = toPieces(product, existing.unit, newQty)
          + toPieces(product, existing.unit, existing.freeItems || 0);
        if (needed > product.stock_quantity) {
          notify('Not enough stock', 'error');
          return prev;
        }
        return prev.map((c) =>
          c.product.id === product.id ? { ...c, quantity: newQty } : c
        );
      }
      const needed = toPieces(product, unit, 1);
      if (needed > product.stock_quantity) {
        notify('Not enough stock', 'error');
        return prev;
      }
      return [
        ...prev,
        { product, quantity: 1, unit, unitPrice, discount: 0, freeItems: 0 },
      ];
    });
  };

  const updateQty = (id: string, delta: number) => {
    setCart((prev) => prev.map((c) => {
      if (c.product.id !== id) return c;
      const newQty = c.quantity + delta;
      if (newQty <= 0) return c;
      const needed = toPieces(c.product, c.unit, newQty) + toPieces(c.product, c.unit, c.freeItems || 0);
      if (needed > c.product.stock_quantity) { notify('Not enough stock', 'error'); return c; }
      return { ...c, quantity: newQty };
    }));
  };

  const setQty = (id: string, rawVal: string | number) => {
    setCart((prev) => prev.map((c) => {
      if (c.product.id !== id) return c;
      const maxQty = stockInUnit(c.product, c.unit);
      if (rawVal === '' || rawVal === 0 || rawVal === '0') {
        return { ...c, quantity: 0 };
      }
      const num = Number(rawVal);
      if (isNaN(num)) return c;
      return { ...c, quantity: Math.min(Math.max(num, 0), maxQty) };
    }));
  };

  const handleQtyBlur = (id: string) => {
    setCart((prev) => prev.map((c) => {
      if (c.product.id !== id) return c;
      const maxQty = stockInUnit(c.product, c.unit);
      const safeQty = Math.min(Math.max(Number(c.quantity) || 1, 1), maxQty);
      return { ...c, quantity: safeQty };
    }));
  };

  const setUnit = (id: string, unit: SaleUnit) => {
    setCart((prev) => prev.map((c) => {
      if (c.product.id !== id) return c;
      const maxQty = stockInUnit(c.product, unit);
      return {
        ...c,
        unit,
        quantity: Math.min(c.quantity, Math.max(1, maxQty)),
        unitPrice: resolveUnitPrice(c.product, unit),
      };
    }));
  };

  const setPrice = (id: string, price: number) => {
    if (!allowManualOverride) {
      notify('Manual price override not allowed for this customer', 'error');
      return;
    }
    const item = cart.find((c) => c.product.id === id);
    if (item) {
      const buyRatePiece = Number(item.product.purchase_price || item.product.cost_price || 0);
      const minBuyRate = item.unit === 'carton' ? buyRatePiece * piecesPerCarton(item.product) : buyRatePiece;
      if (price < minBuyRate) {
        notify(`Custom price cannot be lower than purchase rate of ${formatCurrency(minBuyRate, symbol)}`, 'error');
        return;
      }
    }
    setCart((prev) => prev.map((c) => c.product.id === id ? { ...c, unitPrice: price } : c));
  };

  const setLineDiscount = (id: string, disc: number) => {
    setCart((prev) => prev.map((c) => c.product.id === id ? { ...c, discount: disc } : c));
  };

  const setFreeItems = (id: string, free: number) => {
    setCart((prev) => prev.map((c) => c.product.id === id ? { ...c, freeItems: free } : c));
  };

  const removeFromCart = (id: string) => setCart((prev) => prev.filter((c) => c.product.id !== id));

  const bill = useMemo(
    () => computeBillTotals({
      lines: cart,
      orderDiscount: discount,
      taxRate,
      paymentType,
      paidAmount,
    }),
    [cart, discount, taxRate, paymentType, paidAmount]
  );

  const {
    subtotalGross,
    lineDiscountTotal,
    subtotalNet,
    orderDiscount,
    taxAmount,
    total,
    effectivePaid,
    remaining,
    paymentStatus,
  } = bill;

  const customerOutstanding = selectedCustomer ? Number(selectedCustomer.balance) : 0;
  const newOutstanding = customerOutstanding + remaining;
  const creditUsed = paymentType === 'credit' ? total : remaining;
  const creditExceeded = selectedCustomer ? creditUsed > selectedCustomer.credit_limit : false;

  const holdOrder = async () => {
    if (cart.length === 0) return;
    try {
      const heldCustomer = selectedCustomer ? { id: selectedCustomer.id, name: selectedCustomer.name, type: selectedCustomer.type, area: selectedCustomer.area, phone: selectedCustomer.phone, balance: selectedCustomer.balance, ntn: selectedCustomer.ntn, credit_limit: selectedCustomer.credit_limit, default_price_type: selectedCustomer.default_price_type } : null;
      const payload = JSON.stringify({ cart, selectedCustomerId, heldCustomer, discount, taxRate, priceType, paymentMethod, paymentType, paidAmount });
      const row = await api.post<any>('/api/data/held_orders', { payload });
      let parsed: any = {};
      try { parsed = JSON.parse(row.payload); } catch { parsed = { cart, selectedCustomerId, heldCustomer, discount, taxRate, priceType, paymentMethod, paymentType, paidAmount }; }
      setHeldOrders((prev) => [...prev, { ...row, ...parsed, id: row.id }]);
      setCart([]); setSelectedCustomerId(''); setDiscount(0); setTaxRate(0); setPaidAmount(0);
      setPaymentMethod('cash'); setPaymentType('full');
      notify('Order held. Resume anytime.', 'info');
    } catch (e: any) {
      notify(e.message || 'Failed to hold order', 'error');
    }
  };

  const resumeOrder = async (held: any) => {
    setCart(held.cart || []);
    setSelectedCustomerId(held.selectedCustomerId || '');
    setDiscount(held.discount || 0);
    setTaxRate(held.taxRate || 0);
    setPriceType(held.priceType || 'retail');
    setPaymentMethod(held.paymentMethod || 'cash');
    setPaymentType(held.paymentType || 'full');
    setPaidAmount(held.paidAmount || 0);
    setHeldOrders((prev) => prev.filter((h) => h.id !== held.id));
    setShowHeld(false);
    try {
      await api.delete(`/api/data/held_orders/${held.id}`);
    } catch {
      // local resume still works
    }
  };

  const upsertCustomerPrices = async () => {
    if (!selectedCustomerId) return;
    for (const c of cart) {
      const pieceRate = toPieceRate(c.product, c.unit, c.unitPrice);
      const existing = customerPrices[c.product.id];
      try {
        if (existing?.id) {
          await api.put(`/api/data/customer_product_prices/${existing.id}`, {
            unit_price: pieceRate,
            customer_id: selectedCustomerId,
            product_id: c.product.id,
          });
        } else {
          await api.post('/api/data/customer_product_prices', {
            customer_id: selectedCustomerId,
            product_id: c.product.id,
            unit_price: pieceRate,
          });
        }
      } catch {
        // non-fatal — order already saved
      }
    }
  };

  const completeOrder = async () => {
    if (cart.length === 0) { notify('Cart is empty', 'error'); return; }
    if (paymentType === 'credit' && creditExceeded) {
      notify(`Credit limit exceeded! Limit: ${formatCurrency(selectedCustomer!.credit_limit, symbol)}`, 'error');
      return;
    }

    const orderNumber = generateDocNumber('ORD');
    const invoiceNumber = generateDocNumber('INV');

    try {
      const order = await api.post<any>('/api/data/orders', {
        order_number: orderNumber,
        invoice_number: invoiceNumber,
        customer_id: selectedCustomerId || null,
        subtotal: subtotalNet,
        discount: orderDiscount + lineDiscountTotal,
        tax: taxAmount,
        total,
        paid_amount: effectivePaid,
        status: 'completed',
        payment_status: paymentStatus,
        sales_rep_id: selectedCustomer?.sales_rep_id || null,
        route_id: selectedCustomer?.route_id || null,
      });

      const receiptItems: (CartItem & { batch_number?: string | null })[] = [];
      for (const c of cart) {
        const totalPiecesSold = toPieces(c.product, c.unit, c.quantity)
          + toPieces(c.product, c.unit, c.freeItems || 0);
        const fallbackCost = Number(c.product.purchase_price || c.product.cost_price || 0);
        const fifo = await allocateFifoCost(c.product.id, totalPiecesSold, fallbackCost);
        const assignedBatch = fifo.batchAllocations.map((b) => b.batchNumber).filter(Boolean).join(', ') || null;

        receiptItems.push({
          ...c,
          batch_number: assignedBatch,
        });

        await api.post('/api/data/order_items', {
          order_id: order.id,
          product_id: c.product.id,
          product_name: c.product.name,
          quantity: c.quantity,
          unit_price: c.unitPrice,
          discount: c.discount || 0,
          total: lineBill(c).net,
          free_items: c.freeItems || 0,
          unit: c.unit,
          cost_price: fifo.unitCost,
          total_cost: fifo.totalCost,
          batch_number: assignedBatch,
        });
      }

      if (paymentType !== 'credit' && effectivePaid > 0) {
        const account = PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.account;
        await api.post('/api/data/order_payments', {
          order_id: order.id,
          method: paymentMethod,
          account_type: account,
          amount: effectivePaid,
        });
        if (account) {
          const accounts = await api.get<any[]>('/api/data/payment_accounts');
          const acc = (accounts || []).find((a) => a.type === account);
          if (acc) {
            await api.put(`/api/data/payment_accounts/${acc.id}`, { balance: acc.balance + effectivePaid });
            await api.post('/api/data/transactions', {
              type: 'sale_payment', account_type: account, amount: effectivePaid,
              reference_type: 'order', reference_id: order.id,
              party_type: 'customer', party_id: selectedCustomerId || null,
              note: `Order ${orderNumber}`,
              date: new Date().toISOString().slice(0, 10),
            });
          }
        }
      }

      for (const c of cart) {
        const totalPiecesSold = toPieces(c.product, c.unit, c.quantity)
          + toPieces(c.product, c.unit, c.freeItems || 0);
        const newQty = Number(c.product.stock_quantity) - totalPiecesSold;
        await api.put(`/api/data/products/${c.product.id}`, { stock_quantity: newQty });
        await api.post('/api/data/stock_movements', {
          product_id: c.product.id,
          type: 'sale',
          quantity: -totalPiecesSold,
          reference_type: 'order',
          reference_id: order.id,
          note: `Sale Order #${orderNumber} — ${totalPiecesSold} pcs sold`,
        });
      }

      await upsertCustomerPrices();

      const previousBalance = selectedCustomer ? Number(selectedCustomer.balance) : 0;
      if (remaining > 0 && selectedCustomerId) {
        const cust = customers.find((c) => c.id === selectedCustomerId);
        if (cust) {
          await api.put(`/api/data/customers/${selectedCustomerId}`, { balance: cust.balance + remaining });
        }
      }

      // Record detailed Cashier Audit Log
      const custName = selectedCustomer?.name || 'Walk-in Customer';
      const itemCount = cart.reduce((s, c) => s + Number(c.quantity || 0), 0);
      logAuditAction({
        action: 'POS_SALE',
        entity_type: 'orders',
        entity_id: order.id,
        user_name: user?.name || 'Cashier',
        details: `Cashier ${user?.name || 'Staff'} completed Sale Order #${orderNumber} (${itemCount} item(s), Total: ${formatCurrency(total, symbol)}) for ${custName} [Paid: ${formatCurrency(effectivePaid, symbol)}, Method: ${paymentMethod}]`,
      });

      setLastReceipt({
        orderNumber, invoiceNumber, total, paidAmount: effectivePaid, change: effectivePaid - total,
        items: receiptItems, customer: selectedCustomer, paymentMethod, paymentType, paymentStatus, remaining,
        discount: orderDiscount + lineDiscountTotal, subtotal: subtotalNet, tax: taxAmount,
        previousBalance,
        currentBalance: previousBalance + remaining,
      });
      setShowPrintPreview(false);
      setCart([]); setSelectedCustomerId(''); setDiscount(0); setTaxRate(0); setPaidAmount(0);
      notify('Order completed successfully', 'success');
      loadData();
    } catch {
      notify('Failed to create order', 'error');
    }
  };

  const addCustomer = async (formData: Record<string, any>) => {
    try {
      const openingDue = Math.max(0, Number(formData.opening_balance || 0));
      const payload = {
        ...formData,
        opening_balance: openingDue,
        balance: openingDue,
        route_id: formData.route_id || null,
        sales_rep_id: formData.sales_rep_id || null,
      };
      const data = await api.post<Customer>('/api/data/customers', payload);
      // Auto-create opening balance invoice if needed (same logic as Customers page)
      if (openingDue > 0 && data?.id) {
        const orderNum = generateDocNumber('OB');
        const invNum = generateDocNumber('INV');
        const order = await api.post<any>('/api/data/orders', {
          order_number: orderNum,
          invoice_number: invNum,
          customer_id: data.id,
          subtotal: openingDue,
          discount: 0,
          tax: 0,
          total: openingDue,
          paid_amount: 0,
          status: 'completed',
          payment_status: 'unpaid',
          note: 'Initial Opening Balance / Previous Pending Due',
          sales_rep_id: formData.sales_rep_id || null,
          route_id: formData.route_id || null,
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
      setCustomers((prev) => [...prev, data]);
      setSelectedCustomerId(data.id);
    } catch (e: any) {
      notify(e.message || 'Failed to add customer', 'error');
    }
    setShowAddCustomer(false);
  };

  if (loading) return <div><PageHeader title="POS / New Order" /><Spinner /></div>;

  return (
    <div className="flex flex-col xl:h-[calc(100vh-5rem)] xl:overflow-hidden">
      <div className="shrink-0 mb-2">
        <PageHeader
          title="POS / New Order"
          subtitle="Click a product to add — prices remember per customer"
          actions={
            <>
              <Button variant="outline" icon={<Pause size={16} />} onClick={holdOrder} disabled={cart.length === 0}>Hold</Button>
              <Button variant="outline" icon={<Play size={16} />} onClick={() => setShowHeld(true)}>Held ({heldOrders.length})</Button>
            </>
          }
        />
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 gap-3 xl:grid-cols-12 xl:overflow-hidden">
        {/* LEFT COLUMN: PRODUCTS CATALOG & PAGINATION */}
        <div className="xl:col-span-7 2xl:col-span-8 flex flex-col min-w-0 xl:h-full xl:overflow-hidden">
          {/* Fixed Search & Filters */}
          <div className="shrink-0 mb-2.5 space-y-2">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                placeholder="Search by name, SKU, or scan barcode..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 shadow-xs"
                autoFocus
              />
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 shrink-0 flex items-center gap-1 mr-1">
                <Layers size={12} /> Category:
              </span>
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className={cn(
                  'whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition',
                  !selectedCategory
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                )}
              >
                All Categories
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCategory(selectedCategory === c.id ? null : c.id)}
                  className={cn(
                    'whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition',
                    selectedCategory === c.id
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {/* Brand Filter */}
            {brands.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 hide-scrollbar">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 shrink-0 flex items-center gap-1 mr-1">
                  <Tag size={12} /> Brand:
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedBrand(null)}
                  className={cn(
                    'whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition',
                    !selectedBrand
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                  )}
                >
                  All Brands
                </button>
                {brands.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBrand(selectedBrand === b.id ? null : b.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition',
                      selectedBrand === b.id
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
                    )}
                  >
                    {b.logo_url && (
                      <img
                        src={resolveImageUrl(b.logo_url) || b.logo_url}
                        alt=""
                        className="h-3.5 w-3.5 rounded object-contain"
                      />
                    )}
                    {b.name}
                  </button>
                ))}
                {(selectedCategory || selectedBrand) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory(null);
                      setSelectedBrand(null);
                    }}
                    className="ml-auto text-xs text-rose-500 hover:text-rose-600 font-medium whitespace-nowrap px-2 py-0.5"
                  >
                    Clear Filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Middle: Scrollable Products Grid */}
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <EmptyState icon={<ShoppingCart size={32} />} title="No products found" description="Try a different search term or category" />
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 pb-2">
                {paginatedProducts.map((p) => {
                  const displayPrice = resolveUnitPrice(p, 'piece');
                  const hasCustomerPrice = Boolean(customerPrices[p.id]);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProductToCart(p)}
                      className={cn(
                        'group flex flex-col rounded-xl bg-white p-2.5 text-left shadow-xs ring-1 ring-slate-200/70 transition hover:shadow-md hover:ring-sky-300',
                        p.stock_quantity <= 0 && 'opacity-50'
                      )}
                    >
                      <div className="relative mb-2 flex h-20 items-center justify-center rounded-lg bg-slate-50 text-slate-300 overflow-hidden">
                        {p.image_url ? (
                          <img
                            src={resolveImageUrl(p.image_url) || p.image_url}
                            alt={p.name}
                            className="h-full w-full object-cover"
                          />
                        ) : brandMap.get(p.brand_id || '')?.logo_url ? (
                          <img
                            src={resolveImageUrl(brandMap.get(p.brand_id || '')!.logo_url!) || brandMap.get(p.brand_id || '')!.logo_url!}
                            alt={p.name}
                            className="h-full w-full object-contain p-2"
                          />
                        ) : (
                          <ShoppingCart size={28} />
                        )}
                        <span className="absolute top-1 right-1 bg-sky-600 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                          + Cart
                        </span>
                      </div>
                      <p className="line-clamp-2 text-xs font-semibold text-slate-700 leading-tight">{p.name}</p>
                      <div className="mt-1.5 flex items-center justify-between gap-1">
                        <span className="text-xs font-bold text-sky-700">
                          {formatCurrency(displayPrice, symbol)}<span className="text-[10px] font-normal text-slate-500">/pc</span>
                          {hasCustomerPrice && <span className="ml-1 text-[9px] font-medium text-amber-600">cust</span>}
                        </span>
                        <Badge variant={p.stock_quantity <= 0 ? 'red' : p.stock_quantity <= p.min_stock_level ? 'amber' : 'green'} className="text-[10px] px-1.5 py-0">
                          {p.stock_quantity} pcs
                        </Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom Fixed Pagination Bar */}
          <div className="shrink-0 pt-2 mt-auto border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-xl shadow-xs">
            <div className="font-medium text-slate-500">
              {filtered.length === 0 ? (
                '0 products'
              ) : (
                <>
                  Showing <span className="font-bold text-slate-800">{(currentPage - 1) * PAGE_SIZE + 1}</span>–
                  <span className="font-bold text-slate-800">{Math.min(currentPage * PAGE_SIZE, filtered.length)}</span> of{' '}
                  <span className="font-bold text-slate-800">{filtered.length}</span> products
                </>
              )}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition font-medium"
                >
                  <ChevronLeft size={14} className="mr-0.5" /> Prev
                </button>

                <div className="flex items-center gap-1">
                  {getPaginationRange(currentPage, totalPages).map((p, idx) => {
                    if (p === '...') {
                      return (
                        <span key={`ellipsis-${idx}`} className="px-1 text-slate-400">
                          …
                        </span>
                      );
                    }
                    const pageNum = Number(p);
                    const isActive = pageNum === currentPage;
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={cn(
                          'h-7 min-w-[28px] rounded-lg px-2 text-xs font-semibold transition',
                          isActive
                            ? 'bg-sky-600 text-white shadow-sm'
                            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        )}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition font-medium"
                >
                  Next <ChevronRight size={14} className="ml-0.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: CART & CHECKOUT (SCROLLABLE PANEL) */}
        <div className="xl:col-span-5 2xl:col-span-4 xl:h-full xl:overflow-y-auto pr-1 pb-6">
          <Card className="p-3.5 space-y-3 border border-slate-200 shadow-sm">
            {/* Header: Title, Clear */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
                <ShoppingCart size={17} className="text-sky-600" /> Cart <Badge variant="blue">{cart.length}</Badge>
              </h3>
              {cart.length > 0 && (
                <button type="button" onClick={() => setCart([])} className="text-xs font-semibold text-rose-500 hover:text-rose-600 transition">
                  Clear all
                </button>
              )}
            </div>

            {/* Customer Search & Info */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <SearchableSelect
                  className="flex-1"
                  value={selectedCustomerId}
                  onChange={setSelectedCustomerId}
                  options={customerOptions}
                  placeholder="Walk-in customer — search name / area..."
                />
                <Button variant="outline" size="icon" onClick={() => setShowAddCustomer(true)} title="Add Customer">
                  <UserPlus size={16} />
                </Button>
              </div>

              {selectedCustomer && (
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-2 text-xs border border-slate-200">
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-slate-400">Type</p>
                    <p className="font-bold text-slate-700 capitalize">{selectedCustomer.type === 'retailer' ? 'Retailer' : selectedCustomer.type}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-slate-400">Outstanding</p>
                    <p className={cn('font-bold', Number(selectedCustomer.balance) > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                      {formatCurrency(selectedCustomer.balance, symbol)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-slate-400">Area</p>
                    <p className="font-medium text-slate-600 truncate">{selectedCustomer.area || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-slate-400">NTN</p>
                    <p className="font-medium text-slate-600">{selectedCustomer.ntn || '—'}</p>
                  </div>
                </div>
              )}

              <Field label="Price Type (fallback when no saved customer price)" className="mb-0">
                <Select value={priceType} onChange={(e) => changePriceType(e.target.value as PriceType)} className="text-xs py-1">
                  <option value="retail">Retail Price</option>
                  <option value="wholesale">Wholesale Price</option>
                  <option value="dealer">Dealer Price</option>
                  {allowManualOverride && <option value="custom">Custom Price</option>}
                </Select>
              </Field>
            </div>

            {/* Cart Items Table (Scrollable like earlier with sticky header) */}
            <div className="max-h-[min(20rem,calc(100vh-22rem))] min-h-[110px] overflow-y-auto overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-2xs">
              {cart.length === 0 ? (
                <div className="py-6">
                  <EmptyState icon={<ShoppingCart size={28} />} title="Cart is empty" description="Click any product to add to cart" />
                </div>
              ) : (
                <table className="w-full min-w-[480px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600 shadow-xs">
                    <tr>
                      <th className="px-2 py-2">Product</th>
                      <th className="px-1 py-2 text-center">Qty</th>
                      <th className="px-1 py-2">Unit</th>
                      <th className="px-1 py-2 text-right">Rate</th>
                      <th className="px-1 py-2 text-right">Disc</th>
                      <th className="px-2 py-2 text-right">Total</th>
                      <th className="px-1 py-2" />
                    </tr>
                  </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cart.map((c) => (
                        <tr key={c.product.id} className="bg-white align-middle hover:bg-slate-50/60 transition">
                          <td className="px-2 py-2">
                            <p className="font-medium text-slate-800 line-clamp-2">{c.product.name}</p>
                            <p className="text-[10px] text-slate-400">Avail {stockInUnit(c.product, c.unit)} {c.unit === 'carton' ? 'ctn' : 'pcs'}</p>
                          </td>
                          <td className="px-1 py-2">
                            <div className="flex items-center justify-center rounded border border-slate-200 bg-white">
                              <button type="button" onClick={() => updateQty(c.product.id, -1)} className="p-1 text-slate-500 hover:bg-slate-100"><Minus size={11} /></button>
                              <input
                                type="number"
                                min="1"
                                value={c.quantity === 0 ? '' : c.quantity}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => setQty(c.product.id, e.target.value)}
                                onBlur={() => handleQtyBlur(c.product.id)}
                                className="w-8 border-0 bg-transparent p-0 text-center text-xs font-semibold focus:outline-none"
                              />
                              <button type="button" onClick={() => updateQty(c.product.id, 1)} className="p-1 text-slate-500 hover:bg-slate-100"><Plus size={11} /></button>
                            </div>
                          </td>
                          <td className="px-1 py-2">
                            <Select value={c.unit} onChange={(e) => setUnit(c.product.id, e.target.value as SaleUnit)} className="w-[4.25rem] py-0.5 text-[11px]">
                              <option value="piece">Pc</option>
                              <option value="carton">Ctn</option>
                            </Select>
                          </td>
                          <td className="px-1 py-2">
                            <input
                              type="number"
                              value={c.unitPrice}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => setPrice(c.product.id, Number(e.target.value))}
                              disabled={!allowManualOverride}
                              className={cn('w-14 rounded border border-slate-200 px-1 py-0.5 text-right text-xs focus:border-sky-500 focus:outline-none', !allowManualOverride && 'bg-slate-50 text-slate-400')}
                            />
                          </td>
                          <td className="px-1 py-2">
                            <input type="number" value={c.discount || ''} onFocus={(e) => e.target.select()} onChange={(e) => setLineDiscount(c.product.id, Number(e.target.value))} placeholder="0" className="w-11 rounded border border-slate-200 px-1 py-0.5 text-right text-xs focus:border-sky-500 focus:outline-none" />
                          </td>
                          <td className="px-2 py-2 text-right font-bold text-slate-800 whitespace-nowrap">{formatCurrency(lineBill(c).net, symbol)}</td>
                          <td className="px-1 py-2">
                            <button type="button" onClick={() => removeFromCart(c.product.id)} className="text-slate-400 hover:text-rose-500 p-0.5"><Trash2 size={13} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              )}
            </div>

            {/* Totals, Payment & Save & Complete */}
            {cart.length > 0 && (
              <div className="border-t border-slate-100 pt-3 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Order Discount" className="mb-0">
                    <Input type="number" value={discount || ''} onChange={(e) => setDiscount(Number(e.target.value))} placeholder="0" className="py-1 text-xs" />
                  </Field>
                  <Field label="Tax %" className="mb-0">
                    <Input type="number" value={taxRate || ''} onChange={(e) => setTaxRate(Number(e.target.value))} placeholder="0" className="py-1 text-xs" />
                  </Field>
                </div>

                <div className="space-y-1.5 rounded-xl bg-slate-50 p-2.5 text-xs">
                  <div className="flex justify-between text-slate-500"><span>Gross</span><span>{formatCurrency(subtotalGross, symbol)}</span></div>
                  {lineDiscountTotal > 0 && <div className="flex justify-between text-rose-500"><span>Line Schemes</span><span>- {formatCurrency(lineDiscountTotal, symbol)}</span></div>}
                  <div className="flex justify-between text-slate-500"><span>Sub Total</span><span>{formatCurrency(subtotalNet, symbol)}</span></div>
                  {orderDiscount > 0 && <div className="flex justify-between text-rose-500"><span>Order Discount</span><span>- {formatCurrency(orderDiscount, symbol)}</span></div>}
                  {taxAmount > 0 && <div className="flex justify-between text-slate-500"><span>Tax ({taxRate}%)</span><span>{formatCurrency(taxAmount, symbol)}</span></div>}
                  <div className="flex justify-between border-t border-slate-200 pt-1 text-sm font-bold text-slate-800"><span>Net Total</span><span>{formatCurrency(total, symbol)}</span></div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Field label="Payment Method" className="mb-0">
                    <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className="py-1 text-xs">
                      {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </Select>
                  </Field>
                  <Field label="Payment Type" className="mb-0">
                    <Select value={paymentType} onChange={(e) => setPaymentType(e.target.value as PaymentType)} className="py-1 text-xs">
                      {PAYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </Select>
                  </Field>
                </div>

                {paymentType === 'partial' && (
                  <Field label="Amount Paid" className="mb-0">
                    <Input type="number" value={paidAmount || ''} onChange={(e) => setPaidAmount(Number(e.target.value))} placeholder={String(total)} className="py-1 text-xs" />
                  </Field>
                )}

                {paymentType === 'advance' && (
                  <Field label="Advance Amount" className="mb-0">
                    <Input type="number" value={paidAmount || ''} onChange={(e) => setPaidAmount(Number(e.target.value))} placeholder="0" className="py-1 text-xs" />
                  </Field>
                )}

                <div className="space-y-1 rounded-lg bg-amber-50 p-2.5 text-xs ring-1 ring-amber-200">
                  <div className="flex justify-between"><span className="text-slate-500">Invoice Total</span><span className="font-semibold">{formatCurrency(total, symbol)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Amount Paid</span><span className="font-semibold text-emerald-600">{formatCurrency(effectivePaid, symbol)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Remaining</span><span className="font-semibold text-rose-600">{formatCurrency(remaining, symbol)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Outstanding Balance</span><span className="font-semibold">{formatCurrency(newOutstanding, symbol)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Payment Status</span><Badge variant={paymentStatus === 'paid' ? 'green' : paymentStatus === 'partial' ? 'amber' : 'red'} className="text-[10px] py-0">{paymentStatus === 'paid' ? 'Paid' : paymentStatus === 'partial' ? 'Partially Paid' : 'Unpaid'}</Badge></div>
                  {creditExceeded && <p className="mt-0.5 font-bold text-rose-600">Credit limit exceeded!</p>}
                </div>

                <Button className="w-full shadow-md mt-1" size="lg" icon={<CheckCircle2 size={18} />} onClick={completeOrder}>
                  Save & Complete — {formatCurrency(total, symbol)}
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>

      <AddCustomerModal open={showAddCustomer} onClose={() => setShowAddCustomer(false)} onAdd={addCustomer} />

      <Modal open={showHeld} onClose={() => setShowHeld(false)} title="Held Orders" size="md">
        {heldOrders.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No held orders</p> : (
          <div className="space-y-2">
            {heldOrders.map((h) => {
              const custName = h.heldCustomer?.name || (h.selectedCustomerId ? 'Customer' : 'Walk-in');
              const custArea = h.heldCustomer?.area || '';
              const custType = h.heldCustomer?.type || '';
              const heldTotal = (h.cart || []).reduce((s: number, c: CartItem) => s + lineBill(c).net, 0);
              return (
                <div key={h.id} className="rounded-xl border border-slate-200 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-800 truncate">{custName}{custArea ? ` · ${custArea}` : ''}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {custType && <span className="text-[10px] font-medium uppercase tracking-wide text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded capitalize">{custType === 'retailer' ? 'Retailer' : custType}</span>}
                        <span className="text-xs text-slate-500">{(h.cart || []).length} items</span>
                        <span className="text-xs font-medium text-slate-700">{formatCurrency(heldTotal, symbol)}</span>
                        {h.priceType && h.priceType !== 'retail' && <span className="text-[10px] text-amber-600 capitalize">{h.priceType}</span>}
                      </div>
                      {h.heldCustomer?.phone && <p className="text-[10px] text-slate-400 mt-0.5">{h.heldCustomer.phone}</p>}
                    </div>
                    <div className="flex gap-2 ml-2">
                      <Button size="sm" icon={<Play size={14} />} onClick={() => resumeOrder(h)}>Resume</Button>
                      <Button size="sm" variant="danger" icon={<X size={14} />} onClick={() => setHeldOrders((prev) => prev.filter((x) => x.id !== h.id))} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>

      <Modal
        open={!!lastReceipt && !showPrintPreview}
        onClose={() => setLastReceipt(null)}
        title="Order Completed"
        size="md"
        footer={
          <>
            <Button variant="outline" icon={<Printer size={16} />} onClick={() => { setPdfAction(null); setShowPrintPreview(true); }}>Print Preview</Button>
            <Button variant="outline" icon={<FileText size={16} />} onClick={() => {
              if (!lastReceipt) return;
              setPdfAction('save');
              setShowPrintPreview(true);
            }}>Share PDF</Button>
            <Button variant="success" icon={<MessageCircle size={16} />} onClick={() => {
              if (!lastReceipt) return;
              if (!lastReceipt.customer?.phone) notify('No phone number — save the PDF and attach it in WhatsApp', 'error');
              setPdfAction('whatsapp');
              setShowPrintPreview(true);
            }}>WhatsApp</Button>
            <Button onClick={() => { setLastReceipt(null); setShowPrintPreview(false); setPdfAction(null); }}>New Order</Button>
          </>
        }
      >
        {lastReceipt && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle2 size={32} /></div>
            <p className="text-lg font-bold text-slate-800">{lastReceipt.invoiceNumber}</p>
            <p className="text-sm text-slate-500">{lastReceipt.customer?.name || 'Walk-in customer'}</p>
            <div className="mt-4 space-y-1 text-left text-sm">
              {lastReceipt.items.map((c: CartItem) => (
                <div key={c.product.id} className="flex justify-between text-slate-600">
                  <span>{c.product.name} × {c.quantity} {c.unit}</span>
                  <span>{formatCurrency(lineBill(c).net, symbol)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-800"><span>Total</span><span>{formatCurrency(lastReceipt.total, symbol)}</span></div>
              <div className="flex justify-between text-slate-500"><span>Paid ({lastReceipt.paymentMethod})</span><span>{formatCurrency(lastReceipt.paidAmount, symbol)}</span></div>
              <div className="flex justify-between text-rose-600 font-semibold"><span>Remaining</span><span>{formatCurrency(lastReceipt.remaining, symbol)}</span></div>
            </div>
          </div>
        )}
      </Modal>

      {lastReceipt && (
        <PrintPreview
          open={showPrintPreview}
          onClose={() => { setShowPrintPreview(false); setPdfAction(null); }}
          title={`Print Preview — ${lastReceipt.invoiceNumber}`}
          size="xl"
          fileName={`invoice_${sanitizePdfName(lastReceipt.invoiceNumber)}.pdf`}
          saveOnOpen={pdfAction === 'save' || pdfAction === 'whatsapp'}
          onSaved={handlePdfSaved}
          halfPage={settings?.receipt_size !== 'A4'}
        >
          <SalesInvoiceDocument
            storeName={settings?.store_name || 'Sales Invoice'}
            phone={settings?.phone}
            address={settings?.address}
            email={settings?.email}
            ntn={settings?.ntn}
            logoSrc={logoSrc}
            invoiceNumber={lastReceipt.invoiceNumber}
            orderNumber={lastReceipt.orderNumber}
            customerName={lastReceipt.customer?.name}
            customerPhone={lastReceipt.customer?.phone}
            customerArea={lastReceipt.customer?.area}
            customerAddress={lastReceipt.customer?.address}
            customerNtn={lastReceipt.customer?.ntn}
            items={lastReceipt.items.map((c: any) => ({
              product: c.product,
              quantity: c.quantity,
              unit: c.unit,
              unitPrice: c.unitPrice,
              discount: c.discount,
              freeItems: c.freeItems,
              batch_number: c.batch_number || null,
            }))}
            subtotal={lastReceipt.subtotal}
            discount={lastReceipt.discount}
            tax={lastReceipt.tax}
            total={lastReceipt.total}
            paidAmount={lastReceipt.paidAmount}
            remaining={lastReceipt.remaining}
            paymentMethod={lastReceipt.paymentMethod}
            previousBalance={lastReceipt.previousBalance}
            currentBalance={lastReceipt.currentBalance}
            symbol={symbol}
            paperSize={settings?.receipt_size === 'A4' ? 'A4' : 'A5'}
          />
        </PrintPreview>
      )}
    </div>
  );
}

function AddCustomerModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (data: Record<string, any>) => void }) {
  const { symbol } = useSettings();
  const [routes, setRoutes] = useState<RouteType[]>([]);
  const [reps, setReps] = useState<SalesRep[]>([]);
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
    if (!open) return;
    setForm({
      name: '', phone: '', email: '', address: '', type: 'retailer',
      owner_name: '', cnic: '', ntn: '', area: '', route_id: '', sales_rep_id: '',
      credit_limit: 0, opening_balance: 0, default_price_type: 'retail',
      allow_manual_override: false, custom_price: 0,
    });
    (async () => {
      try {
        const [r, s] = await Promise.all([
          api.get<RouteType[]>('/api/data/routes'),
          api.get<SalesRep[]>('/api/data/sales_reps'),
        ]);
        setRoutes((r || []).sort((a, b) => a.name.localeCompare(b.name)));
        setReps((s || []).sort((a, b) => a.name.localeCompare(b.name)));
      } catch {
        setRoutes([]);
        setReps([]);
      }
    })();
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onAdd(form);
  };

  return (
    <Modal open={open} onClose={onClose} title="Add New Customer" size="lg">
      <form onSubmit={handleSubmit} className="space-y-3.5">
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

        {/* Previous Pending Balance (Opening Due) */}
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
            If this customer already owes previous pending payments, enter the amount here.
          </p>
          <Input
            type="number"
            value={form.opening_balance || ''}
            onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })}
            placeholder="e.g. 15000 (leave 0 if no previous balance)"
            className="bg-white"
          />
        </div>

        {/* Pricing Tier Configuration */}
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

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!form.name.trim()}>Save Customer</Button>
        </div>
      </form>
    </Modal>
  );
}
