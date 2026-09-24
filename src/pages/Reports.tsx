import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import type { Settings } from '@/lib/types';
import { useSettings } from '@/context/SettingsContext';
import { Card, Spinner, PageHeader, Badge } from '@/components/ui';
import { Button } from '@/components/Button';
import { SearchableSelect } from '@/components/Form';
import { BarChart } from '@/components/Charts';
import { formatCurrency, formatDate, todayISO, monthStartISO, cn } from '@/lib/utils';
import { PrintPreview } from '@/components/PrintPreview';
import { PrintDocument, PrintTd, PrintTh } from '@/components/PrintDocument';
import { SalesLedgerDocument, type SalesLedgerData, type SalesLedgerEntry } from '@/components/SalesLedgerDocument';
import {
  BarChart3,
  TrendingUp,
  Package,
  Truck,
  Receipt,
  Users,
  Wallet,
  Download,
  Printer,
  DollarSign,
  PieChart,
  Tag,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Search,
  BookOpen,
  Clock,
  RotateCcw,
} from 'lucide-react';

import {
  DateTimeFilter,
  type DateFilterValue,
  isWithinDateRange,
  getDateFilterBounds,
} from '@/components/DateTimeFilter';
import { Pagination } from '@/components/Pagination';

type ReportType =
  | 'profit'
  | 'ledger'
  | 'sales'
  | 'inventory'
  | 'purchase'
  | 'expense'
  | 'customer'
  | 'supplier'
  | 'payment';

export function Reports() {
  const { symbol, settings, logoSrc } = useSettings();
  const [activeReport, setActiveReport] = useState<ReportType>('profit');
  const [loading, setLoading] = useState(true);
  const [rawPayload, setRawPayload] = useState<any>(null);
  const [dateFilter, setDateFilter] = useState<DateFilterValue>({ preset: 'this_month' });
  const [printPreview, setPrintPreview] = useState(false);

  // Profit sub-view: 'pnl' (Statement of Net Profit) or 'products' (Product Profit Breakdown)
  const [profitView, setProfitView] = useState<'pnl' | 'products'>('pnl');
  const [productProfitSearch, setProductProfitSearch] = useState<string>('');
  const [profitBasis, setProfitBasis] = useState<'invoiced' | 'cash'>('invoiced');
  const [profitProductsPage, setProfitProductsPage] = useState(1);
  const [profitProductsPageSize, setProfitProductsPageSize] = useState(25);

  // Inventory sub-view: 'categories' | 'brands' | 'products'
  const [inventoryView, setInventoryView] = useState<'categories' | 'brands' | 'products'>('categories');
  const [inventoryBrandFilter, setInventoryBrandFilter] = useState<string>('');
  const [inventoryCategoryFilter, setInventoryCategoryFilter] = useState<string>('');
  const [inventorySearch, setInventorySearch] = useState<string>('');
  const [inventoryProductsPage, setInventoryProductsPage] = useState(1);
  const [inventoryProductsPageSize, setInventoryProductsPageSize] = useState(25);

  // Pagination states for other reports:
  const [salesPage, setSalesPage] = useState(1);
  const [salesPageSize, setSalesPageSize] = useState(25);

  const [purchasesPage, setPurchasesPage] = useState(1);
  const [purchasesPageSize, setPurchasesPageSize] = useState(25);

  const [expensesPage, setExpensesPage] = useState(1);
  const [expensesPageSize, setExpensesPageSize] = useState(25);

  const [customersPage, setCustomersPage] = useState(1);
  const [customersPageSize, setCustomersPageSize] = useState(25);

  const [suppliersPage, setSuppliersPage] = useState(1);
  const [suppliersPageSize, setSuppliersPageSize] = useState(25);

  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(25);

  // Customer Sales Ledger State
  const [selectedLedgerCustomerId, setSelectedLedgerCustomerId] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        ordersRaw,
        orderItemsRaw,
        productsRaw,
        purchasesRaw,
        expensesRaw,
        customersRaw,
        suppliersRaw,
        transactionsRaw,
        accountsRaw,
        categoriesRaw,
        expenseCatsRaw,
        brandsRaw,
        salesReturnsRaw,
        orderPaymentsRaw,
      ] = await Promise.all([
        api.get<any[]>('/api/data/orders?limit=10000'),
        api.get<any[]>('/api/data/order_items?limit=50000'),
        api.get<any[]>('/api/data/products?limit=10000'),
        api.get<any[]>('/api/data/purchase_orders?limit=10000'),
        api.get<any[]>('/api/data/expenses?limit=10000'),
        api.get<any[]>('/api/data/customers?limit=10000'),
        api.get<any[]>('/api/data/suppliers?limit=10000'),
        api.get<any[]>('/api/data/transactions?limit=50000'),
        api.get<any[]>('/api/data/payment_accounts'),
        api.get<any[]>('/api/data/categories'),
        api.get<any[]>('/api/data/expense_categories'),
        api.get<any[]>('/api/data/brands').catch(() => []),
        api.get<any[]>('/api/data/sales_returns?limit=10000').catch(() => []),
        api.get<any[]>('/api/data/order_payments?limit=50000').catch(() => []),
      ]);

      const categoryMap = new Map((categoriesRaw || []).map((c) => [c.id, c]));
      const expenseCatMap = new Map((expenseCatsRaw || []).map((c) => [c.id, c]));
      const productMap = new Map((productsRaw || []).map((p) => [p.id, p]));
      const supplierMap = new Map((suppliersRaw || []).map((s) => [s.id, s]));
      const brandMap = new Map((brandsRaw || []).map((b) => [b.id, b]));

      setRawPayload({
        ordersRaw,
        orderItemsRaw,
        productsRaw,
        purchasesRaw,
        expensesRaw,
        customersRaw,
        suppliersRaw,
        transactionsRaw,
        accountsRaw,
        brandsRaw,
        salesReturnsRaw,
        orderPaymentsRaw,
        categoryMap,
        expenseCatMap,
        productMap,
        supplierMap,
        brandMap,
      });

      // Default selected customer for ledger if none selected
      if (!selectedLedgerCustomerId && (customersRaw || []).length > 0) {
        setSelectedLedgerCustomerId(customersRaw[0].id);
      }
    } catch {
      setRawPayload(null);
    } finally {
      setLoading(false);
    }
  }, [selectedLedgerCustomerId]);

  useEffect(() => {
    load();
  }, [load]);

  const data = useMemo(() => {
    if (!rawPayload) {
      return {
        orders: [],
        orderItems: [],
        products: [],
        purchases: [],
        expenses: [],
        customers: [],
        suppliers: [],
        transactions: [],
        accounts: [],
        brands: [],
        brandData: [],
        salesReturns: [],
        orderPayments: [],
        grossSales: 0,
        totalSalesReturns: 0,
        netSales: 0,
        totalRevenue: 0,
        totalCost: 0,
        grossProfit: 0,
        grossMargin: '0',
        totalExpenses: 0,
        netProfit: 0,
        netMargin: '0',
        salesByDay: {},
        profitByProduct: {},
        salesByCat: {},
        expByCat: {},
        topCustomers: {},
        txByAccount: {},
        selectedLedgerData: null as SalesLedgerData | null,
      };
    }

    const {
      ordersRaw,
      orderItemsRaw,
      productsRaw,
      purchasesRaw,
      expensesRaw,
      customersRaw,
      suppliersRaw,
      transactionsRaw,
      accountsRaw,
      brandsRaw,
      salesReturnsRaw,
      orderPaymentsRaw,
      categoryMap,
      expenseCatMap,
      productMap,
      supplierMap,
      brandMap,
    } = rawPayload;

    // Helper to identify customer opening balance debt records
    const isOpeningBalanceOrder = (o: any) =>
      Boolean(
        o && (
          o.order_number?.startsWith('OB-') ||
          o.note?.includes('Opening Balance') ||
          o.note?.includes('Previous Pending Due')
        )
      );

    const isOpeningBalanceItem = (it: any) =>
      Boolean(
        it && (
          it.unit === 'balance' ||
          it.product_name?.includes('Opening Balance') ||
          it.product_name?.includes('Previous Pending Due') ||
          (it.product_id == null && Number(it.cost_price || 0) === 0 && String(it.product_name || '').toLowerCase().includes('balance'))
        )
      );

    // Filter valid (non-cancelled) orders within period
    const allOrders = ordersRaw || [];
    const validPeriodOrders = allOrders
      .filter((o: any) => o.status !== 'cancelled' && isWithinDateRange(o.created_at, dateFilter))
      .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));

    // Pure product trade orders (excludes customer opening balance debt records)
    const tradeOrders = validPeriodOrders.filter((o: any) => !isOpeningBalanceOrder(o));
    const tradeOrderIds = new Set(tradeOrders.map((o: any) => o.id));

    // Order items corresponding to valid period trade orders (excludes opening balance items)
    const orderItemsList = (orderItemsRaw || [])
      .filter((it: any) => tradeOrderIds.has(it.order_id) && !isOpeningBalanceItem(it))
      .map((it: any) => {
        const prod = productMap.get(it.product_id);
        const cat = prod?.category_id ? categoryMap.get(prod.category_id) : null;
        const brand = prod?.brand_id ? brandMap.get(prod.brand_id) : null;
        return {
          ...it,
          products: prod
            ? {
              ...prod,
              cost_price: prod.cost_price,
              purchase_price: prod.purchase_price,
              retail_price: prod.retail_price || prod.price,
              category_id: prod.category_id,
              brand_id: prod.brand_id,
              carton_to_box: Number(prod.carton_to_box || 0),
              categories: cat ? { name: cat.name } : null,
              brands: brand ? { name: brand.name, logo_url: brand.logo_url } : null,
            }
            : null,
        };
      });

    const productsList = (productsRaw || []).map((p: any) => {
      const brand = p.brand_id ? brandMap.get(p.brand_id) : null;
      return {
        ...p,
        categories: p.category_id ? { name: categoryMap.get(p.category_id)?.name } : null,
        brands: brand ? { name: brand.name, logo_url: brand.logo_url } : null,
      };
    });

    const purchasesList = (purchasesRaw || [])
      .filter((p: any) => isWithinDateRange(p.created_at, dateFilter))
      .map((p: any) => ({
        ...p,
        suppliers: p.supplier_id ? { name: supplierMap.get(p.supplier_id)?.name } : null,
      }))
      .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));

    const expensesList = (expensesRaw || [])
      .filter((e: any) => isWithinDateRange(e.date || e.created_at, dateFilter))
      .map((e: any) => ({
        ...e,
        expense_categories: e.category_id ? { name: expenseCatMap.get(e.category_id)?.name } : null,
      }))
      .sort((a: any, b: any) => String(b.date || b.created_at).localeCompare(String(a.date || a.created_at)));

    const transactionsList = (transactionsRaw || [])
      .filter((t: any) => isWithinDateRange(t.date || t.created_at, dateFilter))
      .sort((a: any, b: any) => String(b.date || b.created_at).localeCompare(String(a.date || a.created_at)));

    // Sales Returns within date range
    const salesReturnsList = (salesReturnsRaw || []).filter((r: any) =>
      isWithinDateRange(r.created_at, dateFilter)
    );
    const totalSalesReturns = salesReturnsList.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);

    // Sales Calculations:
    // Original gross sales before returns:
    const orderItemsGrossSales = orderItemsList.reduce((s: number, it: any) => s + Number(it.total || 0), 0);
    const grossSales = orderItemsGrossSales > 0
      ? orderItemsGrossSales
      : tradeOrders.reduce((s: number, o: any) => s + Number(o.subtotal || o.total || 0), 0);
    const netSales = Math.max(0, grossSales - totalSalesReturns);

    const salesByDay: Record<string, number> = {};
    tradeOrders.forEach((o: any) => {
      const d = o.created_at?.split('T')[0];
      salesByDay[d] = (salesByDay[d] || 0) + Number(o.total);
    });

    // Profit by Product with precise Carton/Box unit conversion
    const profitByProduct: Record<
      string,
      { revenue: number; cost: number; profit: number; qtyCartons: number; rawQty: number; unit: string }
    > = {};

    orderItemsList.forEach((it: any) => {
      const prod = it.products;
      const cartonPacking = Number(prod?.carton_to_box || 0);
      const isBox = String(it.unit || '').toLowerCase() === 'box' && cartonPacking > 0;
      const rawQty = Number(it.quantity || 0);
      const cartons = isBox ? rawQty / cartonPacking : rawQty;

      const unitCartonCost = it.cost_price != null && Number(it.cost_price) > 0
        ? Number(it.cost_price)
        : Number(prod?.purchase_price || prod?.cost_price || 0);
      const cost = it.total_cost != null && Number(it.total_cost) > 0
        ? Number(it.total_cost)
        : unitCartonCost * cartons;
      const revenue = Number(it.total || 0);
      const key = it.product_name || prod?.name || 'Unknown Product';

      const ex = profitByProduct[key] || {
        revenue: 0,
        cost: 0,
        profit: 0,
        qtyCartons: 0,
        rawQty: 0,
        unit: it.unit || 'carton',
      };
      profitByProduct[key] = {
        revenue: ex.revenue + revenue,
        cost: ex.cost + cost,
        profit: ex.profit + (revenue - cost),
        qtyCartons: ex.qtyCartons + cartons,
        rawQty: ex.rawQty + rawQty,
        unit: ex.unit,
      };
    });

    // Deduct Sales Returns from product profit & inventory cost
    salesReturnsList.forEach((r: any) => {
      const prod = productMap.get(r.product_id);
      const key = r.product_name || prod?.name || 'Unknown Product';
      const cartonPacking = Number(prod?.carton_to_box || 0);
      const isBox = String(r.unit || '').toLowerCase() === 'box' && cartonPacking > 0;
      const rawQty = Number(r.quantity || 0);
      const returnCartons = isBox ? rawQty / cartonPacking : rawQty;

      // Find the cost basis for this returned item from order items or product buy rate
      const matchingOrderItem = (orderItemsRaw || []).find(
        (it: any) => it.order_id === r.order_id && it.product_id === r.product_id
      );
      const unitCartonCost = Number(prod?.purchase_price || matchingOrderItem?.cost_price || prod?.cost_price || 0);

      const returnCost = unitCartonCost * returnCartons;
      const returnRevenue = Number(r.total_amount || 0);

      if (profitByProduct[key]) {
        const ex = profitByProduct[key];
        profitByProduct[key] = {
          revenue: Math.max(0, ex.revenue - returnRevenue),
          cost: Math.max(0, ex.cost - returnCost),
          profit: ex.profit - (returnRevenue - returnCost),
          qtyCartons: Math.max(0, ex.qtyCartons - returnCartons),
          rawQty: Math.max(0, ex.rawQty - rawQty),
          unit: ex.unit,
        };
      }
    });

    const totalRevenue = netSales;
    const totalCost = Object.values(profitByProduct).reduce((s, v) => s + v.cost, 0);
    const grossProfit = totalRevenue - totalCost;
    const grossMargin = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : '0';

    const totalExpenses = expensesList.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);
    const netProfit = grossProfit - totalExpenses;
    const netMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0';

    // Cash-Realized Profit Metrics (from payments collected in period)
    const allOBOrderIds = new Set(
      (allOrders || []).filter((o: any) => isOpeningBalanceOrder(o)).map((o: any) => o.id)
    );
    const periodOrderPayments = (orderPaymentsRaw || []).filter((p: any) =>
      isWithinDateRange(p.created_at, dateFilter) && !allOBOrderIds.has(p.order_id)
    );
    const cashCollectedInPeriod = periodOrderPayments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const collectionRatio = totalRevenue > 0 ? Math.min(1, Math.max(0, cashCollectedInPeriod / totalRevenue)) : 1;
    const cashRealizedGrossProfit = Math.round(grossProfit * collectionRatio);
    const cashRealizedNetProfit = cashRealizedGrossProfit - totalExpenses;
    const unrealizedMarketProfit = Math.max(0, grossProfit - cashRealizedGrossProfit);
    const cashRealizedCost = Math.round(totalCost * collectionRatio);

    const salesByCat: Record<string, number> = {};
    orderItemsList.forEach((it: any) => {
      const cat = it.products?.categories?.name || 'Uncategorized';
      salesByCat[cat] = (salesByCat[cat] || 0) + Number(it.total);
    });

    const expByCat: Record<string, number> = {};
    expensesList.forEach((e: any) => {
      const cat = e.expense_categories?.name || 'General Expense';
      expByCat[cat] = (expByCat[cat] || 0) + Number(e.amount);
    });

    // Brand Data Inventory Aggregates
    const brandSummaryMap: Record<
      string,
      {
        id: string;
        name: string;
        logo_url?: string;
        productCount: number;
        totalStock: number;
        stockCostValue: number;
        stockRetailValue: number;
        expectedProfit: number;
        lowStockCount: number;
        outOfStockCount: number;
      }
    > = {};

    (brandsRaw || []).forEach((b: any) => {
      brandSummaryMap[b.name] = {
        id: b.id,
        name: b.name,
        logo_url: b.logo_url,
        productCount: 0,
        totalStock: 0,
        stockCostValue: 0,
        stockRetailValue: 0,
        expectedProfit: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
      };
    });

    productsList.forEach((p: any) => {
      const bName = p.brands?.name || 'Unbranded / Other';
      const bId = p.brand_id || '__none__';
      const bLogo = p.brands?.logo_url;
      if (!brandSummaryMap[bName]) {
        brandSummaryMap[bName] = {
          id: bId,
          name: bName,
          logo_url: bLogo,
          productCount: 0,
          totalStock: 0,
          stockCostValue: 0,
          stockRetailValue: 0,
          expectedProfit: 0,
          lowStockCount: 0,
          outOfStockCount: 0,
        };
      }
      const b = brandSummaryMap[bName];
      b.productCount += 1;
      const stock = Number(p.stock_quantity || 0);
      const cost = Number(p.purchase_price || p.cost_price || 0);
      const retail = Number(p.retail_price || p.price || 0);
      b.totalStock += stock;
      b.stockCostValue += stock * cost;
      b.stockRetailValue += stock * retail;
      b.expectedProfit += stock * retail - stock * cost;
      if (stock <= 0) b.outOfStockCount += 1;
      else if (stock <= Number(p.min_stock_level || 0)) b.lowStockCount += 1;
    });

    const brandData = Object.values(brandSummaryMap).sort((a, b) => b.stockCostValue - a.stockCostValue);

    // Category Data Inventory Aggregates
    const categorySummaryMap: Record<
      string,
      {
        id: string;
        name: string;
        productCount: number;
        totalStock: number;
        stockCostValue: number;
        stockRetailValue: number;
        expectedProfit: number;
        lowStockCount: number;
        outOfStockCount: number;
      }
    > = {};

    productsList.forEach((p: any) => {
      const cName = p.categories?.name || 'Uncategorized';
      const cId = p.category_id || '__none__';
      if (!categorySummaryMap[cName]) {
        categorySummaryMap[cName] = {
          id: cId,
          name: cName,
          productCount: 0,
          totalStock: 0,
          stockCostValue: 0,
          stockRetailValue: 0,
          expectedProfit: 0,
          lowStockCount: 0,
          outOfStockCount: 0,
        };
      }
      const cat = categorySummaryMap[cName];
      cat.productCount += 1;
      const stock = Number(p.stock_quantity || 0);
      const cost = Number(p.purchase_price || p.cost_price || 0);
      const retail = Number(p.retail_price || p.price || 0);
      cat.totalStock += stock;
      cat.stockCostValue += stock * cost;
      cat.stockRetailValue += stock * retail;
      cat.expectedProfit += stock * retail - stock * cost;
      if (stock <= 0) cat.outOfStockCount += 1;
      else if (stock <= Number(p.min_stock_level || 0)) cat.lowStockCount += 1;
    });

    const categoryData = Object.values(categorySummaryMap).sort((a, b) => b.stockCostValue - a.stockCostValue);

    const topCustomers: Record<string, number> = {};
    tradeOrders.forEach((o: any) => {
      if (o.customer_id) {
        const c = (customersRaw || []).find((x: any) => x.id === o.customer_id);
        if (c) topCustomers[c.name] = (topCustomers[c.name] || 0) + Number(o.total);
      }
    });

    const txByAccount: Record<string, { in: number; out: number }> = {};
    transactionsList.forEach((t: any) => {
      const acc = t.account_type || t.from_account || '—';
      const ex = txByAccount[acc] || { in: 0, out: 0 };
      if (t.type === 'cash_in' || t.type === 'deposit' || (t.type === 'transfer' && t.to_account === acc))
        txByAccount[acc] = { ...ex, in: ex.in + Number(t.amount) };
      else if (
        t.type === 'cash_out' ||
        t.type === 'withdraw' ||
        t.type === 'expense' ||
        t.type === 'supplier_payment' ||
        (t.type === 'transfer' && t.from_account === acc)
      )
        txByAccount[acc] = { ...ex, out: ex.out + Number(t.amount) };
    });

    // -------------------------------------------------------------------------
    // Sales Ledger Computation for Selected Customer (ERP Style)
    // -------------------------------------------------------------------------
    let selectedLedgerData: SalesLedgerData | null = null;
    const selectedCust = (customersRaw || []).find((c: any) => c.id === selectedLedgerCustomerId);

    if (selectedCust) {
      const { startMs, endMs } = getDateFilterBounds(dateFilter);

      // Customer orders (all time, non-cancelled)
      const custOrders = (ordersRaw || []).filter(
        (o: any) => o.customer_id === selectedCust.id && o.status !== 'cancelled'
      );
      const custOrderIds = new Set(custOrders.map((o: any) => o.id));

      // Customer payments from order_payments + transactions
      const directPayments = (orderPaymentsRaw || []).filter((pm: any) => custOrderIds.has(pm.order_id));

      // Build a set of order IDs that already have direct payment records
      // so we can exclude duplicate transaction entries for the same orders
      const orderIdsWithPayments = new Set(directPayments.map((pm: any) => pm.order_id));

      const custTransactions = (transactionsRaw || []).filter(
        (t: any) =>
          t.party_type === 'customer' &&
          t.party_id === selectedCust.id &&
          // Exclude sale_payment transactions that reference an order which already
          // has a direct order_payment record — these are duplicates of the same money
          !(
            t.reference_type === 'order' &&
            orderIdsWithPayments.has(t.reference_id) &&
            (t.type === 'sale_payment' || t.type === 'cash_in')
          )
      );

      // Customer sales returns
      const custReturns = (salesReturnsRaw || []).filter((r: any) => r.customer_id === selectedCust.id);

      // 1. Calculate Prior Balance (Opening Balance for the period)
      // Customer opening balance is the true prior baseline balance from before the software
      const custOpeningBal = Number(selectedCust.opening_balance || 0);
      const obOrderTotal = custOrders
        .filter((o: any) => isOpeningBalanceOrder(o))
        .reduce((s: number, o: any) => s + Number(o.total || 0), 0);
      let priorBalance = Math.max(custOpeningBal, obOrderTotal);

      // Prior trade orders before startMs (excludes OB orders to avoid double-counting)
      custOrders.forEach((o: any) => {
        if (isOpeningBalanceOrder(o)) return;
        const t = new Date(o.created_at).getTime();
        if (t < startMs) priorBalance += Number(o.total || 0);
      });

      directPayments.forEach((pm: any) => {
        const t = new Date(pm.created_at).getTime();
        if (t < startMs) priorBalance -= Number(pm.amount || 0);
      });

      custTransactions.forEach((tx: any) => {
        const t = new Date(tx.date || tx.created_at).getTime();
        if (t < startMs) {
          if (tx.type === 'cash_in' || tx.type === 'deposit' || tx.type === 'sale_payment') {
            priorBalance -= Number(tx.amount || 0);
          } else {
            priorBalance += Number(tx.amount || 0);
          }
        }
      });

      custReturns.forEach((r: any) => {
        const t = new Date(r.created_at).getTime();
        if (t < startMs) priorBalance -= Number(r.total_amount || 0);
      });

      // 2. Collate period entries
      const rawEntries: Array<{
        id: string;
        date: string;
        docDate: string;
        type: 'invoice' | 'payment' | 'return' | 'adjustment';
        docNo: string;
        description: string;
        debit: number;
        credit: number;
        status: 'Open' | 'Paid' | 'Partial' | 'Applied' | '—';
        timestamp: number;
      }> = [];

      custOrders.forEach((o: any) => {
        if (isOpeningBalanceOrder(o)) return; // Exclude opening balance from period invoices (it's already in priorBalance)
        const t = new Date(o.created_at).getTime();
        if (t >= startMs && t <= endMs) {
          const docNo = o.invoice_number || o.order_number || `ORD-${o.id.slice(0, 6)}`;
          const paid = Number(o.paid_amount || 0);
          const total = Number(o.total || 0);
          const status = o.payment_status === 'paid' ? 'Paid' : paid > 0 ? 'Partial' : 'Open';

          rawEntries.push({
            id: `ord-${o.id}`,
            date: o.created_at,
            docDate: o.created_at,
            type: 'invoice',
            docNo,
            description: `Sales Order #${o.order_number}${o.customer_note ? ` — ${o.customer_note}` : ''}`,
            debit: total,
            credit: 0,
            status,
            timestamp: t,
          });
        }
      });

      directPayments.forEach((pm: any) => {
        const t = new Date(pm.created_at).getTime();
        if (t >= startMs && t <= endMs) {
          rawEntries.push({
            id: `pm-${pm.id}`,
            date: pm.created_at,
            docDate: pm.created_at,
            type: 'payment',
            docNo: pm.receipt_number || `REC-${pm.id.slice(0, 6)}`,
            description: `Payment Received via ${pm.method || 'Cash'}${pm.note ? ` (${pm.note})` : ''}`,
            debit: 0,
            credit: Number(pm.amount || 0),
            status: 'Applied',
            timestamp: t,
          });
        }
      });

      custTransactions.forEach((tx: any) => {
        const t = new Date(tx.date || tx.created_at).getTime();
        if (t >= startMs && t <= endMs) {
          const isCredit = tx.type === 'cash_in' || tx.type === 'deposit' || tx.type === 'sale_payment';
          rawEntries.push({
            id: `tx-${tx.id}`,
            date: tx.date || tx.created_at,
            docDate: tx.date || tx.created_at,
            type: isCredit ? 'payment' : 'adjustment',
            docNo: tx.reference_number || `TX-${tx.id.slice(0, 6)}`,
            description: tx.note || `${tx.type.replace('_', ' ').toUpperCase()}`,
            debit: isCredit ? 0 : Number(tx.amount || 0),
            credit: isCredit ? Number(tx.amount || 0) : 0,
            status: 'Applied',
            timestamp: t,
          });
        }
      });

      custReturns.forEach((r: any) => {
        const t = new Date(r.created_at).getTime();
        if (t >= startMs && t <= endMs) {
          rawEntries.push({
            id: `ret-${r.id}`,
            date: r.created_at,
            docDate: r.created_at,
            type: 'return',
            docNo: r.return_number || `RET-${r.id.slice(0, 6)}`,
            description: `Sales Return — ${r.reason || 'Returned goods'}`,
            debit: 0,
            credit: Number(r.total_amount || 0),
            status: 'Applied',
            timestamp: t,
          });
        }
      });

      // Sort entries chronologically ascending
      rawEntries.sort((a, b) => a.timestamp - b.timestamp);

      // Compute running balances
      let running = priorBalance;
      const ledgerEntries: SalesLedgerEntry[] = rawEntries.map((e) => {
        running = running + e.debit - e.credit;
        return {
          id: e.id,
          date: e.date,
          docDate: e.docDate,
          type: e.type,
          docNo: e.docNo,
          description: e.description,
          debit: e.debit,
          credit: e.credit,
          balance: running,
          status: e.status,
        };
      });

      const totalDebit = rawEntries.reduce((s, e) => s + e.debit, 0);
      const totalCredit = rawEntries.reduce((s, e) => s + e.credit, 0);
      const closingBalance = running;

      // 3. Receivables Aging Analysis
      const nowMs = Date.now();
      let agingCurrent = 0; // 0-30 days
      let aging30to60 = 0; // 31-60 days
      let aging60to90 = 0; // 61-90 days
      let agingOver90 = 0; // >90 days

      // Calculate aging from outstanding invoices
      custOrders.forEach((o: any) => {
        const unpaid = Math.max(0, Number(o.total || 0) - Number(o.paid_amount || 0));
        if (unpaid > 0) {
          const invDate = new Date(o.created_at).getTime();
          const ageDays = Math.floor((nowMs - invDate) / (1000 * 60 * 60 * 24));
          if (ageDays <= 30) agingCurrent += unpaid;
          else if (ageDays <= 60) aging30to60 += unpaid;
          else if (ageDays <= 90) aging60to90 += unpaid;
          else agingOver90 += unpaid;
        }
      });

      // If customer has remaining balance from opening balance or unlinked adjustments, allocate to aging
      const invoiceUnpaidSum = agingCurrent + aging30to60 + aging60to90 + agingOver90;
      if (closingBalance > invoiceUnpaidSum) {
        agingOver90 += closingBalance - invoiceUnpaidSum;
      }

      let dateRangeStr = 'All Time';
      if (dateFilter.preset === 'today') dateRangeStr = `Today (${formatDate(todayISO())})`;
      else if (dateFilter.preset === 'yesterday') dateRangeStr = 'Yesterday';
      else if (dateFilter.preset === 'this_week') dateRangeStr = 'This Week';
      else if (dateFilter.preset === 'this_month') dateRangeStr = 'This Month';
      else if (dateFilter.preset === 'last_month') dateRangeStr = 'Last Month';
      else if (dateFilter.startDate && dateFilter.endDate) {
        dateRangeStr = `${formatDate(dateFilter.startDate)} to ${formatDate(dateFilter.endDate)}`;
      }

      selectedLedgerData = {
        customer: selectedCust,
        dateRangeStr,
        generatedOnStr: new Date().toLocaleString(),
        priorBalance,
        entries: ledgerEntries,
        totalDebit,
        totalCredit,
        closingBalance,
        aging: {
          current: agingCurrent,
          days30to60: aging30to60,
          days60to90: aging60to90,
          over90: agingOver90,
        },
      };
    }

    return {
      orders: tradeOrders,
      orderItems: orderItemsList,
      products: productsList,
      purchases: purchasesList,
      expenses: expensesList,
      customers: customersRaw || [],
      suppliers: suppliersRaw || [],
      transactions: transactionsList,
      accounts: accountsRaw || [],
      brands: brandsRaw || [],
      brandData,
      categoryData,
      cashCollectedInPeriod,
      collectionRatio,
      cashRealizedGrossProfit,
      cashRealizedNetProfit,
      unrealizedMarketProfit,
      cashRealizedCost,
      salesReturns: salesReturnsList,
      orderPayments: orderPaymentsRaw || [],
      grossSales,
      totalSalesReturns,
      netSales,
      totalRevenue,
      totalCost,
      grossProfit,
      grossMargin,
      totalExpenses,
      netProfit,
      netMargin,
      salesByDay,
      profitByProduct,
      salesByCat,
      expByCat,
      topCustomers,
      txByAccount,
      selectedLedgerData,
    };
  }, [rawPayload, dateFilter, selectedLedgerCustomerId]);

  const reports: { key: ReportType; label: string; icon: any }[] = [
    { key: 'profit', label: 'Net Profit & P&L', icon: <BarChart3 size={16} /> },
    { key: 'ledger', label: 'Customer Sales Ledger', icon: <BookOpen size={16} /> },
    { key: 'sales', label: 'Sales & Revenue', icon: <TrendingUp size={16} /> },
    { key: 'inventory', label: 'Inventory & Brands', icon: <Package size={16} /> },
    { key: 'purchase', label: 'Purchases', icon: <Truck size={16} /> },
    { key: 'expense', label: 'Expenses', icon: <Receipt size={16} /> },
    { key: 'customer', label: 'Customer Balances', icon: <Users size={16} /> },
    { key: 'supplier', label: 'Supplier Balances', icon: <Truck size={16} /> },
    { key: 'payment', label: 'Finance & Cash', icon: <Wallet size={16} /> },
  ];

  const exportCSV = () => {
    let csv = '';
    if (activeReport === 'ledger') {
      if (!data.selectedLedgerData) return;
      const ld = data.selectedLedgerData;
      csv = `Customer Sales Ledger — ${ld.customer.name}\n`;
      csv += `Date Range,${ld.dateRangeStr}\n`;
      csv += `Starting Balance,${ld.priorBalance}\n`;
      csv += `Closing Balance,${ld.closingBalance}\n\n`;
      csv += 'Date,Doc Date,Type,Doc #,Description,Debit,Credit,Balance,Status\n';
      csv += `${ld.dateRangeStr.split(' to ')[0] || '—'},—,Opening,—,Starting Balance,—,—,${ld.priorBalance},—\n`;
      ld.entries.forEach((e) => {
        csv += `"${formatDate(e.date)}","${formatDate(e.docDate)}","${e.type}","${e.docNo}","${e.description.replace(/"/g, '""')}",${e.debit},${e.credit},${e.balance},"${e.status}"\n`;
      });
      csv += `\nTotal Invoiced (Debits),${ld.totalDebit}\n`;
      csv += `Total Payments & Returns (Credits),${ld.totalCredit}\n`;
      csv += `Net Outstanding Balance,${ld.closingBalance}\n`;
    } else if (activeReport === 'sales') {
      csv = 'Order #,Date,Customer,Total,Status,Payment\n';
      data.orders.forEach(
        (o: any) =>
          (csv += `${o.order_number},${formatDate(o.created_at)},"${o.customer_id || 'Walk-in'}",${o.total},${o.status},${o.payment_status}\n`)
      );
    } else if (activeReport === 'profit') {
      csv = 'Profit & Loss Statement (Selected Period)\n';
      csv += `Net Sales Revenue,${data.netSales || 0}\n`;
      csv += `Cost of Goods Sold (COGS),${data.totalCost || 0}\n`;
      csv += `Gross Profit,${data.grossProfit || 0}\n`;
      csv += `Gross Margin,${data.grossMargin || 0}%\n`;
      csv += `Operating Expenses,${data.totalExpenses || 0}\n`;
      csv += `Net Profit,${data.netProfit || 0}\n`;
      csv += `Net Margin,${data.netMargin || 0}%\n\n`;
      csv += 'Product,Cartons Sold,Revenue,Cost,Profit,Margin %\n';
      Object.entries(data.profitByProduct || {}).forEach(
        ([k, v]: any) =>
          (csv += `"${k}",${(v.qtyCartons || 0).toFixed(2)},${v.revenue},${v.cost},${v.profit},${v.revenue > 0 ? ((v.profit / v.revenue) * 100).toFixed(1) : 0}%\n`)
      );
    } else if (activeReport === 'inventory') {
      if (inventoryView === 'categories') {
        csv = 'Category,Product Count,Total Stock,Cost Valuation,Retail Valuation,Expected Profit\n';
        (data.categoryData || []).forEach(
          (c: any) =>
            (csv += `"${c.name}",${c.productCount},${c.totalStock},${c.stockCostValue},${c.stockRetailValue},${c.expectedProfit}\n`)
        );
      } else if (inventoryView === 'brands') {
        csv = 'Brand,Product Count,Total Stock,Cost Valuation,Retail Valuation,Expected Profit\n';
        (data.brandData || []).forEach(
          (b: any) =>
            (csv += `"${b.name}",${b.productCount},${b.totalStock},${b.stockCostValue},${b.stockRetailValue},${b.expectedProfit}\n`)
        );
      } else {
        csv = 'Product,Brand,Category,Stock (pcs),Buy Rate,Stock Value (Cost),Retail Rate,Retail Value\n';
        (data.products || []).forEach(
          (p: any) => {
            const cost = p.purchase_price || p.cost_price || 0;
            const surr = p.retail_price || p.price || 0;
            csv += `"${p.name}","${p.brands?.name || '—'}","${p.categories?.name || '—'}",${p.stock_quantity},${cost},${p.stock_quantity * cost},${surr},${p.stock_quantity * surr}\n`;
          }
        );
      }
    } else if (activeReport === 'expense') {
      csv = 'Date,Category,Note,Amount\n';
      (data.expenses || []).forEach(
        (e: any) =>
          (csv += `${formatDate(e.date || e.created_at)},"${e.expense_categories?.name || '—'}","${e.note || ''}",${e.amount}\n`)
      );
    } else if (activeReport === 'customer') {
      csv = 'Customer,Phone,Area,Balance\n';
      (data.customers || []).forEach(
        (c: any) =>
          (csv += `"${c.name}","${c.phone || ''}","${c.area || ''}",${c.balance}\n`)
      );
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeReport}_report.csv`;
    a.click();
  };

  useEffect(() => {
    setProfitProductsPage(1);
    setInventoryProductsPage(1);
    setSalesPage(1);
    setPurchasesPage(1);
    setExpensesPage(1);
    setCustomersPage(1);
    setSuppliersPage(1);
    setLedgerPage(1);
  }, [dateFilter, activeReport, inventoryBrandFilter, inventoryCategoryFilter, inventorySearch, productProfitSearch]);

  const filteredInventoryProducts = useMemo(() => {
    return (data.products || []).filter((p: any) => {
      const matchBrand =
        !inventoryBrandFilter ||
        (inventoryBrandFilter === '__none__' ? !p.brand_id : p.brand_id === inventoryBrandFilter);
      const matchCat =
        !inventoryCategoryFilter ||
        (inventoryCategoryFilter === '__none__'
          ? !p.category_id
          : (p.category_id === inventoryCategoryFilter || p.categories?.name === inventoryCategoryFilter));
      const q = inventorySearch.toLowerCase().trim();
      const matchSearch =
        !q ||
        p.name?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q) ||
        p.brands?.name?.toLowerCase().includes(q) ||
        p.categories?.name?.toLowerCase().includes(q);
      return matchBrand && matchCat && matchSearch;
    });
  }, [data.products, inventoryBrandFilter, inventoryCategoryFilter, inventorySearch]);

  const paginatedInventoryProducts = useMemo(() => {
    const start = (inventoryProductsPage - 1) * inventoryProductsPageSize;
    return filteredInventoryProducts.slice(start, start + inventoryProductsPageSize);
  }, [filteredInventoryProducts, inventoryProductsPage, inventoryProductsPageSize]);

  const filteredProfitProducts = useMemo(() => {
    const q = productProfitSearch.toLowerCase().trim();
    return Object.entries(data.profitByProduct || {})
      .filter(([k]) => !q || k.toLowerCase().includes(q))
      .sort((a: any, b: any) => b[1].profit - a[1].profit);
  }, [data.profitByProduct, productProfitSearch]);

  const paginatedProfitProducts = useMemo(() => {
    const start = (profitProductsPage - 1) * profitProductsPageSize;
    return filteredProfitProducts.slice(start, start + profitProductsPageSize);
  }, [filteredProfitProducts, profitProductsPage, profitProductsPageSize]);

  const paginatedOrders = useMemo(() => {
    const start = (salesPage - 1) * salesPageSize;
    return (data.orders || []).slice(start, start + salesPageSize);
  }, [data.orders, salesPage, salesPageSize]);

  const paginatedPurchases = useMemo(() => {
    const start = (purchasesPage - 1) * purchasesPageSize;
    return (data.purchases || []).slice(start, start + purchasesPageSize);
  }, [data.purchases, purchasesPage, purchasesPageSize]);

  const paginatedExpenses = useMemo(() => {
    const start = (expensesPage - 1) * expensesPageSize;
    return (data.expenses || []).slice(start, start + expensesPageSize);
  }, [data.expenses, expensesPage, expensesPageSize]);

  const paginatedCustomers = useMemo(() => {
    const start = (customersPage - 1) * customersPageSize;
    return (data.customers || []).slice(start, start + customersPageSize);
  }, [data.customers, customersPage, customersPageSize]);

  const paginatedSuppliers = useMemo(() => {
    const start = (suppliersPage - 1) * suppliersPageSize;
    return (data.suppliers || []).slice(start, start + suppliersPageSize);
  }, [data.suppliers, suppliersPage, suppliersPageSize]);

  const paginatedLedgerEntries = useMemo(() => {
    const entries = data.selectedLedgerData?.entries || [];
    const start = (ledgerPage - 1) * ledgerPageSize;
    return entries.slice(start, start + ledgerPageSize);
  }, [data.selectedLedgerData?.entries, ledgerPage, ledgerPageSize]);

  const selectedCustomer = useMemo(() => {
    return (data.customers || []).find((c: any) => c.id === selectedLedgerCustomerId);
  }, [data.customers, selectedLedgerCustomerId]);

  if (loading)
    return (
      <div>
        <PageHeader title="Reports" />
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      </div>
    );

  return (
    <div>
      <PageHeader
        title="Reports & Analytics"
        subtitle="Business performance, Net Profit statement, and Customer Sales Ledger for selected period"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DateTimeFilter value={dateFilter} onChange={setDateFilter} label="Period" compact />
            <Button variant="outline" icon={<Printer size={16} />} onClick={() => setPrintPreview(true)}>
              Print / Save PDF
            </Button>
            <Button variant="outline" icon={<Download size={16} />} onClick={exportCSV}>
              Export CSV
            </Button>
          </div>
        }
      />

      {/* Clean Navigation Tabs */}
      <div className="mb-6 no-print">
        <div className="flex flex-wrap gap-1 bg-slate-100/80 rounded-2xl p-1.5">
          {reports.map((r) => (
            <button
              key={r.key}
              onClick={() => setActiveReport(r.key)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-medium transition-all duration-200',
                activeReport === r.key
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/60'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              )}
            >
              {r.icon} {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="print-document space-y-5">
        {/* ================================================================= */}
        {/* 1. NET PROFIT & P&L STATEMENT (EXECUTIVE FINANCIAL VIEW)           */}
        {/* ================================================================= */}
        {activeReport === 'profit' && (
          <div className="space-y-4">
            {/* Profit Accounting Basis Switcher: Invoiced (Total Bills) vs Cash-Realized (Collected Cash) */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-2xs">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Profit Basis:</span>
                <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => setProfitBasis('invoiced')}
                    className={cn(
                      'px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all',
                      profitBasis === 'invoiced'
                        ? 'bg-white text-slate-900 shadow-xs font-bold'
                        : 'text-slate-500 hover:text-slate-800'
                    )}
                  >
                    Invoiced Profit (All Bills)
                  </button>
                  <button
                    type="button"
                    onClick={() => setProfitBasis('cash')}
                    className={cn(
                      'px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all',
                      profitBasis === 'cash'
                        ? 'bg-emerald-600 text-white shadow-xs font-bold'
                        : 'text-slate-500 hover:text-slate-800'
                    )}
                  >
                    Cash-Realized Profit (Real Cash in Hand)
                  </button>
                </div>
              </div>

              <div className="text-xs text-slate-500">
                {profitBasis === 'invoiced' ? (
                  <span>Showing markup earned across <strong>all invoices</strong> made in this period.</span>
                ) : (
                  <span className="text-emerald-700 font-semibold">Showing profit physically collected from <strong>cash received</strong> in this period.</span>
                )}
              </div>
            </div>

            {/* 5 Dynamic KPI Cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {profitBasis === 'invoiced' ? (
                <>
                  <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100/50 p-5 ring-1 ring-blue-200/50">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600/70">Net Sales</p>
                    <p className="mt-2 text-2xl font-black text-blue-900">
                      {formatCurrency(data.netSales || 0, symbol)}
                    </p>
                    {Number(data.totalSalesReturns || 0) > 0 && (
                      <p className="text-[10px] text-blue-500 mt-1">Returns: -{formatCurrency(data.totalSalesReturns, symbol)}</p>
                    )}
                  </div>

                  <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-rose-100/50 p-5 ring-1 ring-rose-200/50">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-600/70">COGS (FIFO)</p>
                    <p className="mt-2 text-2xl font-black text-rose-800">
                      {formatCurrency(data.totalCost || 0, symbol)}
                    </p>
                    <p className="text-[10px] text-rose-500 mt-1">Product cost basis</p>
                  </div>

                  <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-sky-100/50 p-5 ring-1 ring-sky-200/50">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-600/70">Gross Profit</p>
                    <p className="mt-2 text-2xl font-black text-sky-800">
                      {formatCurrency(data.grossProfit || 0, symbol)}
                    </p>
                    <p className="text-[10px] text-sky-600 mt-1 font-semibold">{data.grossMargin || 0}% margin</p>
                  </div>

                  <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/50 p-5 ring-1 ring-amber-200/50">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600/70">Expenses</p>
                    <p className="mt-2 text-2xl font-black text-amber-800">
                      {formatCurrency(data.totalExpenses || 0, symbol)}
                    </p>
                    <p className="text-[10px] text-amber-500 mt-1">Overheads &amp; bills</p>
                  </div>

                  <div className={cn(
                    'rounded-2xl p-5 ring-1 col-span-2 sm:col-span-1',
                    (data.netProfit || 0) >= 0
                      ? 'bg-gradient-to-br from-emerald-50 to-emerald-100/60 ring-emerald-300/50'
                      : 'bg-gradient-to-br from-rose-50 to-rose-100/60 ring-rose-300/50'
                  )}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700/70">Net Profit</p>
                    <p
                      className={cn(
                        'mt-2 text-2xl font-black',
                        (data.netProfit || 0) >= 0 ? 'text-emerald-800' : 'text-rose-700'
                      )}
                    >
                      {formatCurrency(data.netProfit || 0, symbol)}
                    </p>
                    <p className={cn(
                      'text-[10px] mt-1 font-bold',
                      (data.netProfit || 0) >= 0 ? 'text-emerald-600' : 'text-rose-500'
                    )}>
                      {data.netMargin || 0}% net margin
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-5 ring-1 ring-emerald-200/50">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700/70">Cash Received</p>
                    <p className="mt-2 text-2xl font-black text-emerald-900">
                      {formatCurrency(data.cashCollectedInPeriod || 0, symbol)}
                    </p>
                    <p className="text-[10px] text-emerald-600 mt-1 font-medium">
                      {Math.round((data.collectionRatio || 0) * 100)}% of invoiced sales collected
                    </p>
                  </div>

                  <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/50 p-5 ring-1 ring-slate-200/50">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600/70">Realized Cost Basis</p>
                    <p className="mt-2 text-2xl font-black text-slate-800">
                      {formatCurrency(data.cashRealizedCost || 0, symbol)}
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1">Cost covered by collected cash</p>
                  </div>

                  <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-sky-100/50 p-5 ring-1 ring-sky-200/50">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-600/70">Cash-Realized Gross</p>
                    <p className="mt-2 text-2xl font-black text-sky-800">
                      {formatCurrency(data.cashRealizedGrossProfit || 0, symbol)}
                    </p>
                    <p className="text-[10px] text-sky-600 mt-1 font-semibold">{data.grossMargin || 0}% gross margin</p>
                  </div>

                  <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/50 p-5 ring-1 ring-amber-200/50">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-600/70">Expenses</p>
                    <p className="mt-2 text-2xl font-black text-amber-800">
                      {formatCurrency(data.totalExpenses || 0, symbol)}
                    </p>
                    <p className="text-[10px] text-amber-500 mt-1">Overheads &amp; bills</p>
                  </div>

                  <div className={cn(
                    'rounded-2xl p-5 ring-1 col-span-2 sm:col-span-1',
                    (data.cashRealizedNetProfit || 0) >= 0
                      ? 'bg-gradient-to-br from-emerald-50 to-emerald-100/60 ring-emerald-300/50'
                      : 'bg-gradient-to-br from-rose-50 to-rose-100/60 ring-rose-300/50'
                  )}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700/70">Cash Realized Net Profit</p>
                    <p
                      className={cn(
                        'mt-2 text-2xl font-black',
                        (data.cashRealizedNetProfit || 0) >= 0 ? 'text-emerald-800' : 'text-rose-700'
                      )}
                    >
                      {formatCurrency(data.cashRealizedNetProfit || 0, symbol)}
                    </p>
                    <p className="text-[10px] text-emerald-600 mt-1 font-bold">
                      Physical cash gain in hand
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* In Cash-Realized mode, show Market Debt Profit Alert Card */}
            {profitBasis === 'cash' && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
                    <Clock size={18} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-amber-900">
                      Unrealized Market Debt Profit: {formatCurrency(data.unrealizedMarketProfit || 0, symbol)}
                    </h4>
                    <p className="text-xs text-amber-700 mt-0.5 max-w-3xl">
                      You have earned this profit on delivered goods, but the customer has not paid yet. When customer pending bills are paid in <strong>Pending Payments</strong>, this profit automatically transfers into your <strong>Cash Realized Net Profit</strong>.
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 bg-white/80 border border-amber-200/80 rounded-xl px-3.5 py-2">
                  <span className="text-[11px] font-semibold text-amber-800 block">Total Customer Credit Due</span>
                  <span className="text-base font-black text-rose-600">
                    {formatCurrency((data.customers || []).reduce((s: number, c: any) => s + Math.max(0, Number(c.balance || 0)), 0), symbol)}
                  </span>
                </div>
              </div>
            )}

            {/* Sub-view Switcher: P&L Net Profit Statement vs Product Profit */}
            <div className="flex border-b border-slate-200 gap-4 text-sm font-semibold">
              <button
                onClick={() => setProfitView('pnl')}
                className={cn(
                  'pb-2.5 border-b-2 transition flex items-center gap-2',
                  profitView === 'pnl'
                    ? 'border-sky-600 text-sky-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                )}
              >
                <PieChart size={16} />
                Statement of Net Profit (P&L)
              </button>
              <button
                onClick={() => setProfitView('products')}
                className={cn(
                  'pb-2.5 border-b-2 transition flex items-center gap-2',
                  profitView === 'products'
                    ? 'border-sky-600 text-sky-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                )}
              >
                <Layers size={16} />
                Product-Wise Profit Breakdown ({Object.keys(data.profitByProduct || {}).length})
              </button>
            </div>

            {/* View 1: Net Profit Statement (P&L) */}
            {profitView === 'pnl' && (
              <div className="space-y-4">
                <Card title="Income & Net Profit Statement (P&L) — Month to Date">
                  <div className="p-4 divide-y divide-slate-200 text-sm">
                    {/* 1. Gross Revenue */}
                    <div className="py-3 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-slate-800 text-base">1. Invoiced Gross Sales</span>
                        <p className="text-xs text-slate-400">Total gross value of orders placed in period</p>
                      </div>
                      <span className="font-bold text-slate-900 text-base">
                        {formatCurrency(data.grossSales || 0, symbol)}
                      </span>
                    </div>

                    {/* Sales Returns Deduction */}
                    {Number(data.totalSalesReturns || 0) > 0 && (
                      <div className="py-2.5 flex justify-between items-center pl-4 border-l-2 border-amber-300">
                        <div>
                          <span className="font-medium text-amber-800">Less: Sales Returns / Credit Notes</span>
                          <p className="text-[11px] text-slate-400">Goods returned by customers</p>
                        </div>
                        <span className="font-semibold text-amber-700">
                          - {formatCurrency(data.totalSalesReturns || 0, symbol)}
                        </span>
                      </div>
                    )}

                    {/* Net Sales */}
                    <div className="py-2.5 flex justify-between items-center bg-slate-50/80 px-3 rounded-lg font-semibold">
                      <span className="text-slate-700">= Net Sales Turnover</span>
                      <span className="text-slate-900 font-bold">{formatCurrency(data.netSales || 0, symbol)}</span>
                    </div>

                    {/* 2. COGS */}
                    <div className="py-3 flex justify-between items-center">
                      <div>
                        <span className="font-medium text-slate-700">Less: Cost of Goods Sold (COGS)</span>
                        <p className="text-xs text-slate-400">Product acquisition cost (carton & box conversions)</p>
                      </div>
                      <span className="font-semibold text-rose-600">
                        - {formatCurrency(data.totalCost || 0, symbol)}
                      </span>
                    </div>

                    {/* 3. Gross Profit */}
                    <div className="py-3.5 flex justify-between items-center bg-slate-100 px-3 rounded-lg font-bold">
                      <div>
                        <span className="text-slate-900">= Gross Operating Profit</span>
                        <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded bg-sky-100 text-sky-700">
                          {data.grossMargin || 0}% Gross Margin
                        </span>
                      </div>
                      <span className="text-sky-700 text-lg">
                        {formatCurrency(data.grossProfit || 0, symbol)}
                      </span>
                    </div>

                    {/* 4. Operating Expenses */}
                    <div className="py-3">
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <span className="font-medium text-slate-700">Less: Operating Expenses</span>
                          <p className="text-xs text-slate-400">Overheads, shop bills, refreshments, and staff costs</p>
                        </div>
                        <span className="font-semibold text-rose-600">
                          - {formatCurrency(data.totalExpenses || 0, symbol)}
                        </span>
                      </div>

                      {/* Category-wise breakdown */}
                      <div className="pl-4 space-y-1.5 border-l-2 border-slate-200 mt-2">
                        {Object.entries(data.expByCat || {}).map(([cat, amt]: any) => (
                          <div key={cat} className="flex justify-between text-xs text-slate-600">
                            <span>• {cat}</span>
                            <span className="font-medium">{formatCurrency(amt, symbol)}</span>
                          </div>
                        ))}
                        {Object.keys(data.expByCat || {}).length === 0 && (
                          <p className="text-xs text-slate-400 italic">No expense entries recorded in this period.</p>
                        )}
                      </div>
                    </div>

                    {/* 5. Net Profit (Bottom Line) */}
                    <div
                      className={cn(
                        'py-4 flex justify-between items-center px-4 rounded-xl border mt-2',
                        (data.netProfit || 0) >= 0
                          ? 'bg-emerald-50 border-emerald-300'
                          : 'bg-rose-50 border-rose-300'
                      )}
                    >
                      <div>
                        <span
                          className={cn(
                            'text-lg font-extrabold flex items-center gap-2',
                            (data.netProfit || 0) >= 0 ? 'text-emerald-800' : 'text-rose-800'
                          )}
                        >
                          {(data.netProfit || 0) >= 0 ? (
                            <ArrowUpRight size={22} className="text-emerald-600" />
                          ) : (
                            <ArrowDownRight size={22} className="text-rose-600" />
                          )}
                          = Net Profit (Bottom Line)
                        </span>
                        <span className="text-xs text-slate-500 block ml-7">
                          {(data.netProfit || 0) >= 0
                            ? 'Net business earnings after deducting all product costs and operating expenses'
                            : 'Operating deficit for the selected period'}
                        </span>
                      </div>
                      <div className="text-right">
                        <span
                          className={cn(
                            'text-2xl font-black block',
                            (data.netProfit || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                          )}
                        >
                          {formatCurrency(data.netProfit || 0, symbol)}
                        </span>
                        <Badge
                          variant={(data.netProfit || 0) >= 0 ? 'green' : 'red'}
                          className="mt-1 font-bold"
                        >
                          Net Margin: {data.netMargin || 0}%
                        </Badge>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* View 2: Product-wise Profit Breakdown */}
            {profitView === 'products' && (
              <Card
                title="Product-Wise Profit Breakdown"
                actions={
                  <div className="relative w-64">
                    <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={productProfitSearch}
                      onChange={(e) => setProductProfitSearch(e.target.value)}
                      placeholder="Filter product..."
                      className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-2.5 text-xs focus:border-sky-500 focus:outline-none"
                    />
                  </div>
                }
              >
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="text-right">Cartons Sold</th>
                        <th className="text-right">Revenue</th>
                        <th className="text-right">Cost (COGS)</th>
                        <th className="text-right">Gross Profit</th>
                        <th className="text-right">Margin %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedProfitProducts.map(([k, v]: any) => (
                        <tr key={k}>
                          <td className="font-medium text-slate-800">{k}</td>
                          <td className="text-right text-slate-600 font-mono text-xs">
                            {Number(v.qtyCartons || 0).toFixed(2)} ctn
                          </td>
                          <td className="text-right font-medium">{formatCurrency(v.revenue, symbol)}</td>
                          <td className="text-right text-rose-600">{formatCurrency(v.cost, symbol)}</td>
                          <td className="text-right font-bold text-emerald-600">
                            {formatCurrency(v.profit, symbol)}
                          </td>
                          <td className="text-right font-semibold text-slate-700">
                            {v.revenue > 0 ? ((v.profit / v.revenue) * 100).toFixed(1) : 0}%
                          </td>
                        </tr>
                      ))}
                      {filteredProfitProducts.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            No product sales recorded for this period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {filteredProfitProducts.length > profitProductsPageSize && (
                  <div className="pt-4 border-t border-slate-100">
                    <Pagination
                      currentPage={profitProductsPage}
                      totalItems={filteredProfitProducts.length}
                      pageSize={profitProductsPageSize}
                      onPageChange={setProfitProductsPage}
                      onPageSizeChange={setProfitProductsPageSize}
                      pageSizeOptions={[15, 25, 50, 100]}
                      itemLabel="products"
                    />
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* 2. CUSTOMER SALES LEDGER (ERP STYLE AR STATEMENT)                 */}
        {/* ================================================================= */}
        {activeReport === 'ledger' && (
          <div className="space-y-5">
            {/* Customer Selection */}
            <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/60">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="flex-1 max-w-md">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Select Customer
                  </label>
                  <SearchableSelect
                    value={selectedLedgerCustomerId}
                    onChange={(val) => setSelectedLedgerCustomerId(val)}
                    options={(data.customers || []).map((c: any) => ({
                      value: c.id,
                      label: `${c.name}${c.area ? ` (${c.area})` : ''}${c.phone ? ` • ${c.phone}` : ''}`,
                    }))}
                    placeholder="Search customer by name, area, or phone..."
                  />
                </div>

                {selectedCustomer && (
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <div className="bg-slate-50 rounded-lg px-3 py-1.5">
                      <span className="text-slate-400 text-[10px] block">Area</span>
                      <span className="font-semibold text-slate-700">{selectedCustomer.area || '—'}</span>
                    </div>
                    <div className="bg-slate-50 rounded-lg px-3 py-1.5">
                      <span className="text-slate-400 text-[10px] block">Phone</span>
                      <span className="font-semibold text-slate-700">{selectedCustomer.phone || '—'}</span>
                    </div>
                    <div className={cn(
                      'rounded-lg px-3 py-1.5',
                      Number(selectedCustomer.balance || 0) > 0 ? 'bg-rose-50' : 'bg-emerald-50'
                    )}>
                      <span className="text-slate-400 text-[10px] block">Balance</span>
                      <span
                        className={cn(
                          'font-black text-sm',
                          Number(selectedCustomer.balance || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'
                        )}
                      >
                        {formatCurrency(Number(selectedCustomer.balance || 0), symbol)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!data.selectedLedgerData ? (
              <Card className="py-12 text-center">
                <BookOpen size={48} className="mx-auto text-slate-300 mb-3" />
                <h3 className="text-base font-semibold text-slate-700">Select a Customer to View Ledger</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Choose a customer from the dropdown above to view their complete ERP sales ledger, running balance,
                  and receivables aging.
                </p>
              </Card>
            ) : (
              <>
                {/* 4 Summary Cards */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/50 p-4 ring-1 ring-slate-200/60">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Opening Balance</p>
                    <p className="mt-1.5 text-xl font-black text-slate-800">
                      {formatCurrency(data.selectedLedgerData.priorBalance, symbol)}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Brought forward</p>
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-rose-100/40 p-4 ring-1 ring-rose-200/50">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-500">
                      Invoiced (Debits)
                    </p>
                    <p className="mt-1.5 text-xl font-black text-rose-700">
                      +{formatCurrency(data.selectedLedgerData.totalDebit, symbol)}
                    </p>
                    <p className="text-[10px] text-rose-400 mt-0.5">Sales in period</p>
                  </div>
                  <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/40 p-4 ring-1 ring-emerald-200/50">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500">
                      Payments (Credits)
                    </p>
                    <p className="mt-1.5 text-xl font-black text-emerald-700">
                      -{formatCurrency(data.selectedLedgerData.totalCredit, symbol)}
                    </p>
                    <p className="text-[10px] text-emerald-400 mt-0.5">Receipts &amp; returns</p>
                  </div>
                  <div className={cn(
                    'rounded-2xl p-4 ring-1',
                    data.selectedLedgerData.closingBalance > 0
                      ? 'bg-gradient-to-br from-rose-50 to-rose-100/40 ring-rose-300/50'
                      : 'bg-gradient-to-br from-emerald-50 to-emerald-100/40 ring-emerald-300/50'
                  )}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">Closing Balance</p>
                    <p
                      className={cn(
                        'mt-1.5 text-xl font-black',
                        data.selectedLedgerData.closingBalance > 0 ? 'text-rose-700' : 'text-emerald-700'
                      )}
                    >
                      {formatCurrency(data.selectedLedgerData.closingBalance, symbol)}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Net receivable</p>
                  </div>
                </div>

                {/* Aging Overview */}
                <div className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/60">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                      <Clock size={14} className="text-slate-400" /> Receivables Aging
                    </h4>
                    <span className="text-[10px] text-slate-400">Based on invoice dates</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3 text-center">
                    <div className="rounded-xl bg-slate-50 p-3">
                      <span className="block text-[10px] font-medium text-slate-500">0–30 Days</span>
                      <span className="mt-1 block text-base font-bold text-slate-800">
                        {formatCurrency(data.selectedLedgerData.aging.current, symbol)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-amber-50/60 p-3">
                      <span className="block text-[10px] font-medium text-amber-600">31–60 Days</span>
                      <span className="mt-1 block text-base font-bold text-amber-700">
                        {formatCurrency(data.selectedLedgerData.aging.days30to60, symbol)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-orange-50/60 p-3">
                      <span className="block text-[10px] font-medium text-orange-600">61–90 Days</span>
                      <span className="mt-1 block text-base font-bold text-orange-700">
                        {formatCurrency(data.selectedLedgerData.aging.days60to90, symbol)}
                      </span>
                    </div>
                    <div className="rounded-xl bg-rose-50/60 p-3">
                      <span className="block text-[10px] font-medium text-rose-600">90+ Days</span>
                      <span className="mt-1 block text-base font-bold text-rose-700">
                        {formatCurrency(data.selectedLedgerData.aging.over90, symbol)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Detailed Running Ledger Table */}
                <Card title={`Ledger Entries — ${selectedCustomer.name}`}>
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Doc Date</th>
                          <th>Type</th>
                          <th>Doc #</th>
                          <th>Description / Reference</th>
                          <th className="text-right text-rose-700">Debit ({symbol})</th>
                          <th className="text-right text-emerald-700">Credit ({symbol})</th>
                          <th className="text-right">Balance ({symbol})</th>
                          <th className="text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Opening Balance Row */}
                        <tr className="bg-slate-50 font-semibold text-slate-800">
                          <td>—</td>
                          <td>—</td>
                          <td>
                            <Badge variant="gray">Opening</Badge>
                          </td>
                          <td className="font-mono text-xs">—</td>
                          <td className="italic text-slate-600">Balance Brought Forward</td>
                          <td className="text-right text-slate-400">—</td>
                          <td className="text-right text-slate-400">—</td>
                          <td className="text-right font-bold text-slate-900">
                            {formatCurrency(data.selectedLedgerData.priorBalance, symbol)}
                          </td>
                          <td className="text-center text-slate-400">—</td>
                        </tr>

                        {data.selectedLedgerData.entries.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="py-8 text-center text-slate-400 text-xs italic">
                              No sales transactions, payments, or returns recorded for this period.
                            </td>
                          </tr>
                        ) : (
                          paginatedLedgerEntries.map((e) => (
                            <tr key={e.id} className="hover:bg-slate-50/80">
                              <td className="text-slate-600 whitespace-nowrap">{formatDate(e.date)}</td>
                              <td className="text-slate-500 whitespace-nowrap">{formatDate(e.docDate)}</td>
                              <td>
                                <Badge
                                  variant={
                                    e.type === 'invoice'
                                      ? 'red'
                                      : e.type === 'payment'
                                        ? 'green'
                                        : e.type === 'return'
                                          ? 'amber'
                                          : 'gray'
                                  }
                                >
                                  {e.type === 'invoice'
                                    ? 'Invoice'
                                    : e.type === 'payment'
                                      ? 'Receipt'
                                      : e.type === 'return'
                                        ? 'Return Memo'
                                        : e.type}
                                </Badge>
                              </td>
                              <td className="font-mono font-medium text-slate-800">{e.docNo}</td>
                              <td className="text-slate-600 max-w-xs truncate">{e.description}</td>
                              <td className="text-right font-medium text-rose-700">
                                {e.debit > 0 ? formatCurrency(e.debit, symbol) : '—'}
                              </td>
                              <td className="text-right font-medium text-emerald-700">
                                {e.credit > 0 ? formatCurrency(e.credit, symbol) : '—'}
                              </td>
                              <td className="text-right font-bold text-slate-900">
                                {formatCurrency(e.balance, symbol)}
                              </td>
                              <td className="text-center">
                                <Badge
                                  variant={
                                    e.status === 'Paid'
                                      ? 'green'
                                      : e.status === 'Applied'
                                        ? 'blue'
                                        : e.status === 'Partial'
                                          ? 'amber'
                                          : e.status === 'Open'
                                            ? 'red'
                                            : 'gray'
                                  }
                                >
                                  {e.status}
                                </Badge>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      <tfoot className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                        <tr>
                          <td colSpan={5} className="text-right uppercase tracking-wider text-xs">
                            Period Activity Totals & Closing Balance:
                          </td>
                          <td className="text-right text-rose-700">
                            {formatCurrency(data.selectedLedgerData.totalDebit, symbol)}
                          </td>
                          <td className="text-right text-emerald-700">
                            {formatCurrency(data.selectedLedgerData.totalCredit, symbol)}
                          </td>
                          <td className="text-right text-base font-black">
                            {formatCurrency(data.selectedLedgerData.closingBalance, symbol)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {data.selectedLedgerData.entries.length > ledgerPageSize && (
                    <div className="pt-4 border-t border-slate-100">
                      <Pagination
                        currentPage={ledgerPage}
                        totalItems={data.selectedLedgerData.entries.length}
                        pageSize={ledgerPageSize}
                        onPageChange={setLedgerPage}
                        onPageSizeChange={setLedgerPageSize}
                        pageSizeOptions={[15, 25, 50, 100]}
                        itemLabel="entries"
                      />
                    </div>
                  )}
                </Card>
              </>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* 3. SALES REPORT TAB                                               */}
        {/* ================================================================= */}
        {activeReport === 'sales' && (
          <div className="space-y-5">
            {/* Clean KPI Cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100/50 p-5 ring-1 ring-blue-200/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600/70">Total Net Sales</p>
                <p className="mt-2 text-2xl font-black text-blue-900">
                  {formatCurrency(data.netSales || 0, symbol)}
                </p>
                <p className="text-[10px] text-blue-500 mt-1">Invoiced product revenue</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-5 ring-1 ring-emerald-200/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600/70">Net Profit</p>
                <p className={cn(
                  'mt-2 text-2xl font-black',
                  (data.netProfit || 0) >= 0 ? 'text-emerald-900' : 'text-rose-900'
                )}>
                  {formatCurrency(data.netProfit || 0, symbol)}
                </p>
                <p className="text-[10px] text-emerald-600 mt-1">Net Margin: {data.netMargin || 0}%</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/50 p-5 ring-1 ring-slate-200/60">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Orders Placed</p>
                <p className="mt-2 text-2xl font-black text-slate-800">{data.orders.length}</p>
                <p className="text-[10px] text-slate-400 mt-1">In selected period</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-sky-50 to-sky-100/50 p-5 ring-1 ring-sky-200/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-sky-600/70">Avg Order Value</p>
                <p className="mt-2 text-2xl font-black text-sky-900">
                  {formatCurrency(
                    data.orders.length ? (data.netSales || 0) / data.orders.length : 0,
                    symbol
                  )}
                </p>
                <p className="text-[10px] text-sky-500 mt-1">Per sales ticket</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/50 p-5 ring-1 ring-amber-200/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700/70">Pending Due</p>
                <p className="mt-2 text-2xl font-black text-amber-800">
                  {data.orders.filter((o: any) => o.payment_status !== 'paid').length}
                </p>
                <p className="text-[10px] text-amber-600 mt-1">Unpaid / partial orders</p>
              </div>
            </div>

            <Card title="Sales by Category">
              <div className="p-5">
                {Object.keys(data.salesByCat).length > 0 ? (
                  <BarChart
                    data={Object.entries(data.salesByCat).map(([k, v]) => ({ label: k, value: v as number }))}
                    formatValue={(v) => formatCurrency(v, symbol)}
                  />
                ) : (
                  <p className="py-8 text-center text-sm text-slate-400 italic">No category sales recorded in this period</p>
                )}
              </div>
            </Card>

            <Card title="Recent Orders">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Order #</th>
                      <th>Invoice #</th>
                      <th>Date</th>
                      <th className="text-right">Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400 text-xs italic">
                          No sales orders found for this period.
                        </td>
                      </tr>
                    ) : (
                      paginatedOrders.map((o: any) => (
                        <tr key={o.id} className="hover:bg-slate-50/80">
                          <td className="font-semibold text-slate-800">{o.order_number}</td>
                          <td className="font-mono text-xs text-slate-500">{o.invoice_number || '—'}</td>
                          <td className="text-slate-500">{formatDate(o.created_at)}</td>
                          <td className="font-bold text-right text-slate-900">{formatCurrency(o.total, symbol)}</td>
                          <td>
                            <Badge variant={o.payment_status === 'paid' ? 'green' : 'amber'}>
                              {o.payment_status}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {data.orders.length > 0 && (
                    <tfoot className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                      <tr>
                        <td colSpan={3} className="uppercase tracking-wider text-xs">Total Orders: {data.orders.length}</td>
                        <td className="text-right font-black text-slate-900">
                          {formatCurrency(data.orders.reduce((s: number, o: any) => s + Number(o.total || 0), 0), symbol)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {data.orders.length > salesPageSize && (
                <div className="pt-4 border-t border-slate-100">
                  <Pagination
                    currentPage={salesPage}
                    totalItems={data.orders.length}
                    pageSize={salesPageSize}
                    onPageChange={setSalesPage}
                    onPageSizeChange={setSalesPageSize}
                    pageSizeOptions={[15, 25, 50, 100]}
                    itemLabel="orders"
                  />
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ================================================================= */}
        {/* 4. INVENTORY & BRAND DATA REPORT                                  */}
        {/* ================================================================= */}
        {activeReport === 'inventory' && (
          <div className="space-y-5">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100/50 p-5 ring-1 ring-blue-200/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600/70">Stock Valuation (Cost)</p>
                <p className="mt-2 text-2xl font-black text-blue-900">
                  {formatCurrency(
                    (data.brandData || []).reduce((s: number, b: any) => s + b.stockCostValue, 0),
                    symbol
                  )}
                </p>
                <p className="text-[10px] text-blue-500 mt-1">Asset value at purchase cost</p>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-5 ring-1 ring-emerald-200/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600/70">Retail Sales Value</p>
                <p className="mt-2 text-2xl font-black text-emerald-900">
                  {formatCurrency(
                    (data.brandData || []).reduce((s: number, b: any) => s + b.stockRetailValue, 0),
                    symbol
                  )}
                </p>
                <p className="text-[10px] text-emerald-600 mt-1">Expected turnover at retail rate</p>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100/50 p-5 ring-1 ring-purple-200/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-600/70">Expected Stock Profit</p>
                <p className="mt-2 text-2xl font-black text-purple-900">
                  {formatCurrency(
                    (data.brandData || []).reduce((s: number, b: any) => s + b.expectedProfit, 0),
                    symbol
                  )}
                </p>
                <p className="text-[10px] text-purple-600 mt-1">Estimated gross gain on stock</p>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/50 p-5 ring-1 ring-amber-200/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700/70">Categories &amp; Brands</p>
                <p className="mt-2 text-2xl font-black text-amber-800">
                  {data.categoryData?.length || 0} <span className="text-sm font-semibold text-amber-600">cats</span> / {data.brandData?.length || 0} <span className="text-sm font-semibold text-amber-600">brands</span>
                </p>
                <p className="text-[10px] text-amber-600 mt-1">
                  {(data.products || []).length} total SKU products
                </p>
              </div>
            </div>

            {/* 3-Way Sub-view Switcher */}
            <div className="flex border-b border-slate-200 gap-4 text-sm font-semibold">
              <button
                onClick={() => setInventoryView('categories')}
                className={cn(
                  'pb-2.5 border-b-2 transition flex items-center gap-2',
                  inventoryView === 'categories'
                    ? 'border-sky-600 text-sky-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                )}
              >
                <Layers size={16} />
                Category-Wise Stock ({data.categoryData?.length || 0})
              </button>
              <button
                onClick={() => setInventoryView('brands')}
                className={cn(
                  'pb-2.5 border-b-2 transition flex items-center gap-2',
                  inventoryView === 'brands'
                    ? 'border-sky-600 text-sky-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                )}
              >
                <Tag size={16} />
                Brand-Wise Inventory ({data.brandData?.length || 0})
              </button>
              <button
                onClick={() => setInventoryView('products')}
                className={cn(
                  'pb-2.5 border-b-2 transition flex items-center gap-2',
                  inventoryView === 'products'
                    ? 'border-sky-600 text-sky-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                )}
              >
                <Package size={16} />
                All Products Stock List ({(data.products || []).length})
              </button>
            </div>

            {/* View 1: Category-Wise Summary */}
            {inventoryView === 'categories' && (
              <Card title="Category-Wise Inventory Valuation & Stock Summary">
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th className="text-center">Products</th>
                        <th className="text-right">Total Stock</th>
                        <th className="text-right">Stock Valuation (Cost)</th>
                        <th className="text-right">Retail Valuation</th>
                        <th className="text-right">Expected Profit</th>
                        <th className="text-center">Stock Health</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.categoryData || []).map((c: any) => (
                        <tr key={c.name} className="hover:bg-slate-50/80">
                          <td className="font-semibold text-slate-800">
                            <div className="flex items-center gap-2">
                              <Layers size={16} className="text-sky-600 shrink-0" />
                              <span>{c.name}</span>
                            </div>
                          </td>
                          <td className="text-center text-slate-600">{c.productCount} SKUs</td>
                          <td className="text-right font-medium">{c.totalStock} ctn</td>
                          <td className="text-right font-semibold text-slate-800">
                            {formatCurrency(c.stockCostValue, symbol)}
                          </td>
                          <td className="text-right font-medium text-emerald-700">
                            {formatCurrency(c.stockRetailValue, symbol)}
                          </td>
                          <td className="text-right font-bold text-purple-700">
                            {formatCurrency(c.expectedProfit, symbol)}
                          </td>
                          <td className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              {c.outOfStockCount > 0 && (
                                <Badge variant="red" className="text-[10px]">
                                  {c.outOfStockCount} Out
                                </Badge>
                              )}
                              {c.lowStockCount > 0 && (
                                <Badge variant="amber" className="text-[10px]">
                                  {c.lowStockCount} Low
                                </Badge>
                              )}
                              {c.outOfStockCount === 0 && c.lowStockCount === 0 && (
                                <Badge variant="green" className="text-[10px]">
                                  Healthy
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                      <tr>
                        <td>Total (All Categories)</td>
                        <td className="text-center">{(data.categoryData || []).reduce((s: number, c: any) => s + c.productCount, 0)} SKUs</td>
                        <td className="text-right">{(data.categoryData || []).reduce((s: number, c: any) => s + c.totalStock, 0)} ctn</td>
                        <td className="text-right font-black">
                          {formatCurrency((data.categoryData || []).reduce((s: number, c: any) => s + c.stockCostValue, 0), symbol)}
                        </td>
                        <td className="text-right text-emerald-700">
                          {formatCurrency((data.categoryData || []).reduce((s: number, c: any) => s + c.stockRetailValue, 0), symbol)}
                        </td>
                        <td className="text-right text-purple-700">
                          {formatCurrency((data.categoryData || []).reduce((s: number, c: any) => s + c.expectedProfit, 0), symbol)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            )}

            {/* View 2: Brand-Wise Summary */}
            {inventoryView === 'brands' && (
              <Card title="Brand-Wise Inventory Valuation & Stock Summary">
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Brand</th>
                        <th className="text-center">Products</th>
                        <th className="text-right">Total Stock</th>
                        <th className="text-right">Stock Valuation (Cost)</th>
                        <th className="text-right">Retail Valuation</th>
                        <th className="text-right">Expected Profit</th>
                        <th className="text-center">Stock Health</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.brandData || []).map((b: any) => (
                        <tr key={b.name} className="hover:bg-slate-50/80">
                          <td className="font-semibold text-slate-800">
                            <div className="flex items-center gap-2.5">
                              {b.logo_url ? (
                                <img
                                  src={b.logo_url}
                                  alt={b.name}
                                  className="w-7 h-7 object-contain rounded border border-slate-200 p-0.5 bg-white shrink-0"
                                />
                              ) : (
                                <div className="w-7 h-7 rounded bg-slate-100 flex items-center justify-center text-slate-400 font-bold text-xs shrink-0">
                                  {b.name.slice(0, 1).toUpperCase()}
                                </div>
                              )}
                              <span>{b.name}</span>
                            </div>
                          </td>
                          <td className="text-center text-slate-600">{b.productCount} SKUs</td>
                          <td className="text-right font-medium">{b.totalStock} ctn</td>
                          <td className="text-right font-semibold text-slate-800">
                            {formatCurrency(b.stockCostValue, symbol)}
                          </td>
                          <td className="text-right font-medium text-emerald-700">
                            {formatCurrency(b.stockRetailValue, symbol)}
                          </td>
                          <td className="text-right font-bold text-purple-700">
                            {formatCurrency(b.expectedProfit, symbol)}
                          </td>
                          <td className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              {b.outOfStockCount > 0 && (
                                <Badge variant="red" className="text-[10px]">
                                  {b.outOfStockCount} Out
                                </Badge>
                              )}
                              {b.lowStockCount > 0 && (
                                <Badge variant="amber" className="text-[10px]">
                                  {b.lowStockCount} Low
                                </Badge>
                              )}
                              {b.outOfStockCount === 0 && b.lowStockCount === 0 && (
                                <Badge variant="green" className="text-[10px]">
                                  Healthy
                                </Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                      <tr>
                        <td>Total (All Brands)</td>
                        <td className="text-center">{(data.brandData || []).reduce((s: number, b: any) => s + b.productCount, 0)} SKUs</td>
                        <td className="text-right">{(data.brandData || []).reduce((s: number, b: any) => s + b.totalStock, 0)} ctn</td>
                        <td className="text-right font-black">
                          {formatCurrency((data.brandData || []).reduce((s: number, b: any) => s + b.stockCostValue, 0), symbol)}
                        </td>
                        <td className="text-right text-emerald-700">
                          {formatCurrency((data.brandData || []).reduce((s: number, b: any) => s + b.stockRetailValue, 0), symbol)}
                        </td>
                        <td className="text-right text-purple-700">
                          {formatCurrency((data.brandData || []).reduce((s: number, b: any) => s + b.expectedProfit, 0), symbol)}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            )}

            {/* View 3: All Products Stock List (Searchable, Category + Brand Filters, Paginated) */}
            {inventoryView === 'products' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      value={inventorySearch}
                      onChange={(e) => setInventorySearch(e.target.value)}
                      placeholder="Search product stock by name, SKU, barcode..."
                      className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
                    />
                  </div>
                  <select
                    value={inventoryCategoryFilter}
                    onChange={(e) => setInventoryCategoryFilter(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white py-2 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 text-slate-700"
                  >
                    <option value="">All Categories</option>
                    {(data.categoryData || []).map((c: any) => (
                      <option key={c.name} value={c.id !== '__none__' ? c.id : '__none__'}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={inventoryBrandFilter}
                    onChange={(e) => setInventoryBrandFilter(e.target.value)}
                    className="rounded-xl border border-slate-300 bg-white py-2 px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/20 text-slate-700"
                  >
                    <option value="">All Brands</option>
                    {(data.brands || []).map((b: any) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <Card>
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Product Name</th>
                          <th>Brand</th>
                          <th>Category</th>
                          <th className="text-right">Stock</th>
                          <th className="text-right">Buy Rate</th>
                          <th className="text-right">Stock Cost Value</th>
                          <th className="text-right">Retail Rate</th>
                          <th className="text-right">Retail Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedInventoryProducts.map((p: any) => {
                          const cost = p.purchase_price || p.cost_price || 0;
                          const surr = p.retail_price || p.price || 0;
                          return (
                            <tr key={p.id} className="hover:bg-slate-50/80">
                              <td className="font-semibold text-slate-800">{p.name}</td>
                              <td className="text-slate-600">{p.brands?.name || '—'}</td>
                              <td className="text-slate-600">{p.categories?.name || '—'}</td>
                              <td className="text-right font-medium">
                                <Badge variant={p.stock_quantity <= 0 ? 'red' : p.stock_quantity <= p.min_stock_level ? 'amber' : 'green'}>
                                  {p.stock_quantity} ctn
                                </Badge>
                              </td>
                              <td className="text-right font-medium text-slate-700">{formatCurrency(cost, symbol)}</td>
                              <td className="text-right font-bold text-slate-900">
                                {formatCurrency(p.stock_quantity * cost, symbol)}
                              </td>
                              <td className="text-right font-medium text-emerald-700">{formatCurrency(surr, symbol)}</td>
                              <td className="text-right font-bold text-emerald-800">
                                {formatCurrency(p.stock_quantity * surr, symbol)}
                              </td>
                            </tr>
                          );
                        })}
                        {filteredInventoryProducts.length === 0 && (
                          <tr>
                            <td colSpan={8} className="py-8 text-center text-slate-400 text-xs italic">
                              No products matching the selected filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {filteredInventoryProducts.length > 0 && (
                        <tfoot className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                          <tr>
                            <td colSpan={3} className="uppercase tracking-wider text-xs">
                              Filtered Total ({filteredInventoryProducts.length} items):
                            </td>
                            <td className="text-right">
                              {filteredInventoryProducts.reduce((s: number, p: any) => s + Number(p.stock_quantity || 0), 0)} ctn
                            </td>
                            <td />
                            <td className="text-right font-black">
                              {formatCurrency(
                                filteredInventoryProducts.reduce(
                                  (s: number, p: any) => s + Number(p.stock_quantity || 0) * (p.purchase_price || p.cost_price || 0),
                                  0
                                ),
                                symbol
                              )}
                            </td>
                            <td />
                            <td className="text-right font-black text-emerald-800">
                              {formatCurrency(
                                filteredInventoryProducts.reduce(
                                  (s: number, p: any) => s + Number(p.stock_quantity || 0) * (p.retail_price || p.price || 0),
                                  0
                                ),
                                symbol
                              )}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>

                  {filteredInventoryProducts.length > inventoryProductsPageSize && (
                    <div className="pt-4 border-t border-slate-100">
                      <Pagination
                        currentPage={inventoryProductsPage}
                        totalItems={filteredInventoryProducts.length}
                        pageSize={inventoryProductsPageSize}
                        onPageChange={setInventoryProductsPage}
                        onPageSizeChange={setInventoryProductsPageSize}
                        pageSizeOptions={[25, 50, 100, 200]}
                        itemLabel="products"
                      />
                    </div>
                  )}
                </Card>
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* 5. PURCHASES REPORT                                               */}
        {/* ================================================================= */}
        {activeReport === 'purchase' && (
          <div className="space-y-5">
            {/* Modern KPI Cards for Purchases */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-indigo-100/50 p-5 ring-1 ring-indigo-200/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600/70">Total Purchases</p>
                <p className="mt-2 text-2xl font-black text-indigo-900">
                  {formatCurrency(
                    data.purchases.reduce((s: number, p: any) => s + Number(p.total || 0), 0),
                    symbol
                  )}
                </p>
                <p className="text-[10px] text-indigo-500 mt-1">{data.purchases.length} Purchase orders</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-5 ring-1 ring-emerald-200/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600/70">Total Paid</p>
                <p className="mt-2 text-2xl font-black text-emerald-900">
                  {formatCurrency(
                    data.purchases.reduce((s: number, p: any) => s + Number(p.paid_amount || 0), 0),
                    symbol
                  )}
                </p>
                <p className="text-[10px] text-emerald-600 mt-1">Settled payments</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-rose-100/50 p-5 ring-1 ring-rose-200/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-600/70">Outstanding Payable</p>
                <p className="mt-2 text-2xl font-black text-rose-900">
                  {formatCurrency(
                    data.purchases.reduce((s: number, p: any) => s + Math.max(0, Number(p.total || 0) - Number(p.paid_amount || 0)), 0),
                    symbol
                  )}
                </p>
                <p className="text-[10px] text-rose-500 mt-1">Due to suppliers</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/50 p-5 ring-1 ring-slate-200/60">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Received Goods</p>
                <p className="mt-2 text-2xl font-black text-slate-800">
                  {data.purchases.filter((p: any) => p.status === 'received').length} / {data.purchases.length}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">Orders delivered</p>
              </div>
            </div>

            <Card title="Purchase Orders">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>PO #</th>
                      <th>Supplier</th>
                      <th>Date</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Paid</th>
                      <th>Status</th>
                      <th>Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.purchases.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 text-xs italic">
                          No purchase orders found for this period.
                        </td>
                      </tr>
                    ) : (
                      paginatedPurchases.map((p: any) => (
                        <tr key={p.id} className="hover:bg-slate-50/80">
                          <td className="font-semibold text-slate-800">{p.po_number}</td>
                          <td className="font-medium text-slate-700">{p.suppliers?.name || '—'}</td>
                          <td className="text-slate-500">{formatDate(p.created_at)}</td>
                          <td className="font-bold text-right text-slate-900">{formatCurrency(p.total, symbol)}</td>
                          <td className="font-medium text-right text-emerald-700">{formatCurrency(p.paid_amount || 0, symbol)}</td>
                          <td>
                            <Badge variant={p.status === 'received' ? 'green' : 'amber'}>{p.status}</Badge>
                          </td>
                          <td>
                            <Badge variant={p.payment_status === 'paid' ? 'green' : 'amber'}>{p.payment_status}</Badge>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {data.purchases.length > 0 && (
                    <tfoot className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                      <tr>
                        <td colSpan={3} className="uppercase tracking-wider text-xs">Total Purchases ({data.purchases.length}):</td>
                        <td className="text-right font-black">
                          {formatCurrency(data.purchases.reduce((s: number, p: any) => s + Number(p.total || 0), 0), symbol)}
                        </td>
                        <td className="text-right text-emerald-700 font-bold">
                          {formatCurrency(data.purchases.reduce((s: number, p: any) => s + Number(p.paid_amount || 0), 0), symbol)}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {data.purchases.length > purchasesPageSize && (
                <div className="pt-4 border-t border-slate-100">
                  <Pagination
                    currentPage={purchasesPage}
                    totalItems={data.purchases.length}
                    pageSize={purchasesPageSize}
                    onPageChange={setPurchasesPage}
                    onPageSizeChange={setPurchasesPageSize}
                    pageSizeOptions={[15, 25, 50, 100]}
                    itemLabel="purchases"
                  />
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ================================================================= */}
        {/* 6. EXPENSES REPORT                                                */}
        {/* ================================================================= */}
        {activeReport === 'expense' && (
          <div className="space-y-5">
            {/* Modern KPI Cards for Expenses */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-rose-100/50 p-5 ring-1 ring-rose-200/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-600/70">Total Expenses</p>
                <p className="mt-2 text-2xl font-black text-rose-900">
                  {formatCurrency(data.totalExpenses || 0, symbol)}
                </p>
                <p className="text-[10px] text-rose-500 mt-1">In selected period</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/50 p-5 ring-1 ring-slate-200/60">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Expense Entries</p>
                <p className="mt-2 text-2xl font-black text-slate-800">{data.expenses.length}</p>
                <p className="text-[10px] text-slate-400 mt-1">Recorded expense vouchers</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/50 p-5 ring-1 ring-amber-200/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700/70">Categories</p>
                <p className="mt-2 text-2xl font-black text-amber-800">
                  {Object.keys(data.expByCat || {}).length}
                </p>
                <p className="text-[10px] text-amber-600 mt-1">Expense heads tracked</p>
              </div>
            </div>

            <Card title="Business Expenses">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Category</th>
                      <th>Note</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.expenses.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400 text-xs italic">
                          No expense entries recorded in this period.
                        </td>
                      </tr>
                    ) : (
                      paginatedExpenses.map((e: any) => (
                        <tr key={e.id} className="hover:bg-slate-50/80">
                          <td className="text-slate-500">{formatDate(e.date || e.created_at)}</td>
                          <td className="font-semibold text-slate-800">{e.expense_categories?.name || 'General'}</td>
                          <td className="text-slate-600">{e.note || '—'}</td>
                          <td className="text-right font-black text-rose-600">{formatCurrency(e.amount, symbol)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {data.expenses.length > 0 && (
                    <tfoot className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                      <tr>
                        <td colSpan={3} className="uppercase tracking-wider text-xs">Total Expenses:</td>
                        <td className="text-right font-black text-rose-600">{formatCurrency(data.totalExpenses || 0, symbol)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {data.expenses.length > expensesPageSize && (
                <div className="pt-4 border-t border-slate-100">
                  <Pagination
                    currentPage={expensesPage}
                    totalItems={data.expenses.length}
                    pageSize={expensesPageSize}
                    onPageChange={setExpensesPage}
                    onPageSizeChange={setExpensesPageSize}
                    pageSizeOptions={[15, 25, 50, 100]}
                    itemLabel="expenses"
                  />
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ================================================================= */}
        {/* 7. CUSTOMER BALANCES REPORT                                       */}
        {/* ================================================================= */}
        {activeReport === 'customer' && (
          <div className="space-y-5">
            {/* Modern KPI Cards for Customer Balances */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-rose-100/50 p-5 ring-1 ring-rose-200/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-600/70">Total Customer Receivables</p>
                <p className="mt-2 text-2xl font-black text-rose-900">
                  {formatCurrency(
                    (data.customers || []).reduce((s: number, c: any) => s + Math.max(0, Number(c.balance || 0)), 0),
                    symbol
                  )}
                </p>
                <p className="text-[10px] text-rose-500 mt-1">Pending payments due from customers</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/50 p-5 ring-1 ring-slate-200/60">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Customers</p>
                <p className="mt-2 text-2xl font-black text-slate-800">{(data.customers || []).length}</p>
                <p className="text-[10px] text-slate-400 mt-1">Registered customer accounts</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-amber-100/50 p-5 ring-1 ring-amber-200/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700/70">Customers with Balance</p>
                <p className="mt-2 text-2xl font-black text-amber-800">
                  {(data.customers || []).filter((c: any) => Number(c.balance || 0) > 0).length}
                </p>
                <p className="text-[10px] text-amber-600 mt-1">Accounts with pending balance</p>
              </div>
            </div>

            <Card title="Customer Account Balances">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer Name</th>
                      <th>Area</th>
                      <th>Phone</th>
                      <th className="text-right">Current Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.customers || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400 text-xs italic">
                          No customers found.
                        </td>
                      </tr>
                    ) : (
                      paginatedCustomers.map((c: any) => (
                        <tr key={c.id} className="hover:bg-slate-50/80">
                          <td className="font-semibold text-slate-800">{c.name}</td>
                          <td className="text-slate-600">{c.area || '—'}</td>
                          <td className="text-slate-600">{c.phone || '—'}</td>
                          <td
                            className={cn(
                              'text-right font-bold',
                              Number(c.balance || 0) > 0 ? 'text-rose-600' : 'text-emerald-600'
                            )}
                          >
                            {formatCurrency(c.balance, symbol)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {(data.customers || []).length > 0 && (
                    <tfoot className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                      <tr>
                        <td colSpan={3} className="uppercase tracking-wider text-xs">Total Receivables:</td>
                        <td className="text-right font-black text-rose-600">
                          {formatCurrency((data.customers || []).reduce((s: number, c: any) => s + Math.max(0, Number(c.balance || 0)), 0), symbol)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {(data.customers || []).length > customersPageSize && (
                <div className="pt-4 border-t border-slate-100">
                  <Pagination
                    currentPage={customersPage}
                    totalItems={(data.customers || []).length}
                    pageSize={customersPageSize}
                    onPageChange={setCustomersPage}
                    onPageSizeChange={setCustomersPageSize}
                    pageSizeOptions={[15, 25, 50, 100]}
                    itemLabel="customers"
                  />
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ================================================================= */}
        {/* 8. SUPPLIER BALANCES REPORT                                       */}
        {/* ================================================================= */}
        {activeReport === 'supplier' && (
          <div className="space-y-5">
            {/* Modern KPI Cards for Supplier Balances */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-gradient-to-br from-rose-50 to-rose-100/50 p-5 ring-1 ring-rose-200/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-600/70">Total Supplier Payables</p>
                <p className="mt-2 text-2xl font-black text-rose-900">
                  {formatCurrency(
                    (data.suppliers || []).reduce((s: number, s_item: any) => s + Math.max(0, Number(s_item.balance || 0)), 0),
                    symbol
                  )}
                </p>
                <p className="text-[10px] text-rose-500 mt-1">Pending payments to suppliers</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/50 p-5 ring-1 ring-slate-200/60">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Active Suppliers</p>
                <p className="mt-2 text-2xl font-black text-slate-800">{(data.suppliers || []).length}</p>
                <p className="text-[10px] text-slate-400 mt-1">Registered vendor accounts</p>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 p-5 ring-1 ring-emerald-200/50">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600/70">Suppliers with Balance</p>
                <p className="mt-2 text-2xl font-black text-emerald-900">
                  {(data.suppliers || []).filter((s_item: any) => Number(s_item.balance || 0) > 0).length}
                </p>
                <p className="text-[10px] text-emerald-600 mt-1">Vendors currently owed</p>
              </div>
            </div>

            <Card title="Supplier Accounts & Balances">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Supplier Name</th>
                      <th>Phone</th>
                      <th>Contact Person</th>
                      <th className="text-right">Payable Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.suppliers || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400 text-xs italic">
                          No suppliers found.
                        </td>
                      </tr>
                    ) : (
                      paginatedSuppliers.map((s: any) => (
                        <tr key={s.id} className="hover:bg-slate-50/80">
                          <td className="font-semibold text-slate-800">{s.name}</td>
                          <td className="text-slate-600">{s.phone || '—'}</td>
                          <td className="text-slate-600">{s.contact_person || '—'}</td>
                          <td className="text-right font-bold text-rose-600">
                            {formatCurrency(s.balance, symbol)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {(data.suppliers || []).length > 0 && (
                    <tfoot className="bg-slate-50 font-bold text-slate-900 border-t border-slate-200">
                      <tr>
                        <td colSpan={3} className="uppercase tracking-wider text-xs">Total Payables:</td>
                        <td className="text-right font-black text-rose-600">
                          {formatCurrency((data.suppliers || []).reduce((s: number, s_item: any) => s + Math.max(0, Number(s_item.balance || 0)), 0), symbol)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {(data.suppliers || []).length > suppliersPageSize && (
                <div className="pt-4 border-t border-slate-100">
                  <Pagination
                    currentPage={suppliersPage}
                    totalItems={(data.suppliers || []).length}
                    pageSize={suppliersPageSize}
                    onPageChange={setSuppliersPage}
                    onPageSizeChange={setSuppliersPageSize}
                    pageSizeOptions={[15, 25, 50, 100]}
                    itemLabel="suppliers"
                  />
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ================================================================= */}
        {/* 9. FINANCE & CASH ACCOUNTS                                        */}
        {/* ================================================================= */}
        {activeReport === 'payment' && (
          <div className="space-y-5">
            {/* Account Balances Grid */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {(data.accounts || []).map((a: any) => (
                <div key={a.id} className="rounded-2xl bg-white p-5 ring-1 ring-slate-200/60 shadow-sm">
                  <p className="text-[11px] uppercase font-semibold text-slate-500 tracking-wider">{a.name}</p>
                  <p className="mt-2 text-2xl font-black text-slate-900">{formatCurrency(a.balance, symbol)}</p>
                  <span className="inline-block mt-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                    Type: {a.type || 'account'}
                  </span>
                </div>
              ))}
            </div>

            <Card title="Transactions by Account">
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th className="text-right">Money In</th>
                      <th className="text-right">Money Out</th>
                      <th className="text-right">Net Movement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(data.txByAccount || {}).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400 text-xs italic">
                          No transactions recorded for this period.
                        </td>
                      </tr>
                    ) : (
                      Object.entries(data.txByAccount || {}).map(([acc, v]: any) => (
                        <tr key={acc} className="hover:bg-slate-50/80">
                          <td className="font-semibold text-slate-800 capitalize">{acc}</td>
                          <td className="text-emerald-600 font-bold text-right">{formatCurrency(v.in, symbol)}</td>
                          <td className="text-rose-600 font-bold text-right">{formatCurrency(v.out, symbol)}</td>
                          <td className={cn('font-black text-right', v.in - v.out >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                            {formatCurrency(v.in - v.out, symbol)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </div>

      <PrintPreview
        open={printPreview}
        onClose={() => setPrintPreview(false)}
        title={`Print Preview — ${reports.find((r) => r.key === activeReport)?.label || 'Report'}`}
        size="xl"
        fileName={`${activeReport}_report.pdf`}
      >
        <ReportPrintDocument
          report={activeReport}
          data={data}
          symbol={symbol}
          settings={settings}
          logoSrc={logoSrc}
          dateFilter={dateFilter}
        />
      </PrintPreview>
    </div>
  );
}

function ReportPrintDocument({
  report,
  data,
  symbol,
  settings,
  logoSrc,
  dateFilter,
}: {
  report: ReportType;
  data: any;
  symbol: string;
  settings: Settings | null;
  logoSrc?: string | null;
  dateFilter?: DateFilterValue;
}) {
  // If printing Customer Sales Ledger, render the dedicated ERP SalesLedgerDocument
  if (report === 'ledger') {
    if (data.selectedLedgerData) {
      return (
        <SalesLedgerDocument
          storeName={settings?.store_name || 'Inventory Manager'}
          logoSrc={logoSrc}
          symbol={symbol}
          data={data.selectedLedgerData}
        />
      );
    }
    return (
      <div className="p-8 text-center text-slate-500">
        <p>No customer selected for Sales Ledger print.</p>
      </div>
    );
  }

  let range = `${formatDate(monthStartISO())} – ${formatDate(todayISO())}`;
  if (dateFilter?.preset === 'all') range = 'All Time';
  else if (dateFilter?.preset === 'today') range = `Today (${formatDate(todayISO())})`;
  else if (dateFilter?.preset === 'yesterday') range = 'Yesterday';
  else if (dateFilter?.preset === 'this_week') range = 'This Week';
  else if (dateFilter?.preset === 'this_month') range = 'This Month';
  else if (dateFilter?.preset === 'last_month') range = 'Last Month';
  else if (dateFilter?.startDate && dateFilter?.endDate) {
    range = `${formatDate(dateFilter.startDate)} – ${formatDate(dateFilter.endDate)}`;
  }

  const labels: Record<ReportType, string> = {
    profit: 'Net Profit & Loss (P&L) Statement',
    ledger: 'Customer Sales Ledger Detail Report',
    sales: 'Sales & Revenue Report',
    inventory: 'Inventory Valuation & Brand Data Report',
    purchase: 'Purchase Report',
    expense: 'Expense Report',
    customer: 'Customer Report',
    supplier: 'Supplier Report',
    payment: 'Payment & Finance Report',
  };

  const salesTotal = data.netSales || 0;
  const grossProfit = data.grossProfit || 0;
  const revenue = data.totalRevenue || 0;
  const cost = data.totalCost || 0;
  const expTotal = data.totalExpenses || 0;
  const netProfit = data.netProfit || 0;

  return (
    <PrintDocument
      storeName={settings?.store_name || 'Inventory Manager'}
      subtitle={labels[report]}
      logoSrc={logoSrc}
      fields={[
        { label: 'Business', value: settings?.store_name || '—' },
        { label: 'Address', value: settings?.address || '—', span: 2 },
        { label: 'Phone', value: settings?.phone || '—' },
        { label: 'Business NTN', value: settings?.ntn?.trim() || '—' },
        { label: 'Period', value: range },
      ]}
    >
      {/* 1. SALES PRINT */}
      {report === 'sales' && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500">Net Sales:</span>
              <span className="font-bold text-slate-800 ml-1.5">{formatCurrency(salesTotal, symbol)}</span>
            </div>
            <div>
              <span className="text-slate-500">Net Profit:</span>
              <span className="font-bold text-emerald-700 ml-1.5">{formatCurrency(netProfit, symbol)}</span>
            </div>
            <div>
              <span className="text-slate-500">Total Orders:</span>
              <span className="font-bold text-slate-800 ml-1.5">{(data.orders || []).length}</span>
            </div>
          </div>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <PrintTh className="w-8">Sr</PrintTh>
                <PrintTh>Order #</PrintTh>
                <PrintTh>Invoice #</PrintTh>
                <PrintTh>Date</PrintTh>
                <PrintTh align="right">Total</PrintTh>
                <PrintTh>Payment</PrintTh>
              </tr>
            </thead>
            <tbody>
              {(data.orders || []).map((o: any, i: number) => (
                <tr key={o.id}>
                  <PrintTd>{i + 1}</PrintTd>
                  <PrintTd className="font-medium">{o.order_number}</PrintTd>
                  <PrintTd>{o.invoice_number || '—'}</PrintTd>
                  <PrintTd>{formatDate(o.created_at)}</PrintTd>
                  <PrintTd align="right">{formatCurrency(o.total, symbol)}</PrintTd>
                  <PrintTd className="capitalize">{o.payment_status}</PrintTd>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* 2. PROFIT PRINT (Statement of Net Profit P&L) */}
      {report === 'profit' && (
        <>
          <div className="mb-4 rounded border border-slate-300 p-3 bg-slate-50 text-xs">
            <h3 className="font-bold uppercase text-slate-800 mb-2">Statement of Net Profit (P&L)</h3>
            <table className="w-full border-collapse">
              <tbody>
                <tr className="border-b border-slate-200">
                  <td className="py-1 font-semibold text-slate-700">1. Invoiced Gross Sales</td>
                  <td className="py-1 text-right font-bold text-slate-900">
                    {formatCurrency(data.grossSales || 0, symbol)}
                  </td>
                </tr>
                {Number(data.totalSalesReturns || 0) > 0 && (
                  <tr className="border-b border-slate-200">
                    <td className="py-1 text-slate-600 pl-3">Less: Sales Returns</td>
                    <td className="py-1 text-right font-semibold text-amber-700">
                      - {formatCurrency(data.totalSalesReturns, symbol)}
                    </td>
                  </tr>
                )}
                <tr className="border-b border-slate-200 bg-slate-100 font-semibold">
                  <td className="py-1 pl-2">= Net Sales Turnover</td>
                  <td className="py-1 text-right font-bold text-slate-900">{formatCurrency(revenue, symbol)}</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="py-1 text-slate-600 pl-3">Less: Cost of Goods Sold (COGS)</td>
                  <td className="py-1 text-right font-semibold text-rose-700">- {formatCurrency(cost, symbol)}</td>
                </tr>
                <tr className="border-b border-slate-300 bg-slate-100 font-bold">
                  <td className="py-1.5 pl-1">= Gross Profit (Margin: {data.grossMargin || 0}%)</td>
                  <td className="py-1.5 text-right text-sky-800">{formatCurrency(grossProfit, symbol)}</td>
                </tr>
                <tr className="border-b border-slate-200">
                  <td className="py-1 text-slate-600 pl-3">Less: Operating Expenses</td>
                  <td className="py-1 text-right font-semibold text-rose-700">- {formatCurrency(expTotal, symbol)}</td>
                </tr>
                {Object.entries(data.expByCat || {}).map(([cat, amt]: any) => (
                  <tr key={cat} className="text-[11px] text-slate-500">
                    <td className="py-0.5 pl-6">• {cat}</td>
                    <td className="py-0.5 text-right">{formatCurrency(amt, symbol)}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-400 bg-emerald-50 font-bold text-sm">
                  <td className="py-2 pl-1 text-emerald-900">= Net Profit (Margin: {data.netMargin || 0}%)</td>
                  <td className="py-2 text-right text-emerald-800">{formatCurrency(netProfit, symbol)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4 className="text-xs font-bold uppercase text-slate-700 mb-1.5">Product-Wise Profit Breakdown</h4>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <PrintTh>Product</PrintTh>
                <PrintTh align="right">Cartons</PrintTh>
                <PrintTh align="right">Revenue</PrintTh>
                <PrintTh align="right">Cost</PrintTh>
                <PrintTh align="right">Profit</PrintTh>
                <PrintTh align="right">Margin %</PrintTh>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.profitByProduct || {})
                .sort((a: any, b: any) => b[1].profit - a[1].profit)
                .slice(0, 35)
                .map(([k, v]: any) => (
                  <tr key={k}>
                    <PrintTd className="font-medium">{k}</PrintTd>
                    <PrintTd align="right">{Number(v.qtyCartons || 0).toFixed(2)}</PrintTd>
                    <PrintTd align="right">{formatCurrency(v.revenue, symbol)}</PrintTd>
                    <PrintTd align="right">{formatCurrency(v.cost, symbol)}</PrintTd>
                    <PrintTd align="right" className="font-bold text-emerald-700">
                      {formatCurrency(v.profit, symbol)}
                    </PrintTd>
                    <PrintTd align="right">
                      {v.revenue > 0 ? ((v.profit / v.revenue) * 100).toFixed(1) : 0}%
                    </PrintTd>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}

      {/* 3. INVENTORY PRINT */}
      {report === 'inventory' && (
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-bold uppercase text-slate-700 mb-1.5">Category-Wise Valuation Summary</h4>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <PrintTh>Category</PrintTh>
                  <PrintTh className="text-center">SKUs</PrintTh>
                  <PrintTh align="right">Total Stock</PrintTh>
                  <PrintTh align="right">Cost Valuation</PrintTh>
                  <PrintTh align="right">Retail Valuation</PrintTh>
                  <PrintTh align="right">Expected Profit</PrintTh>
                </tr>
              </thead>
              <tbody>
                {(data.categoryData || []).map((c: any) => (
                  <tr key={c.name}>
                    <PrintTd className="font-medium">{c.name}</PrintTd>
                    <PrintTd className="text-center">{c.productCount}</PrintTd>
                    <PrintTd align="right">{c.totalStock}</PrintTd>
                    <PrintTd align="right">{formatCurrency(c.stockCostValue, symbol)}</PrintTd>
                    <PrintTd align="right">{formatCurrency(c.stockRetailValue, symbol)}</PrintTd>
                    <PrintTd align="right" className="font-bold text-purple-700">
                      {formatCurrency(c.expectedProfit, symbol)}
                    </PrintTd>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase text-slate-700 mb-1.5">Brand-Wise Valuation Summary</h4>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <PrintTh>Brand</PrintTh>
                  <PrintTh className="text-center">SKUs</PrintTh>
                  <PrintTh align="right">Total Stock</PrintTh>
                  <PrintTh align="right">Cost Valuation</PrintTh>
                  <PrintTh align="right">Retail Valuation</PrintTh>
                  <PrintTh align="right">Expected Profit</PrintTh>
                </tr>
              </thead>
              <tbody>
                {(data.brandData || []).map((b: any) => (
                  <tr key={b.name}>
                    <PrintTd className="font-medium">{b.name}</PrintTd>
                    <PrintTd className="text-center">{b.productCount}</PrintTd>
                    <PrintTd align="right">{b.totalStock}</PrintTd>
                    <PrintTd align="right">{formatCurrency(b.stockCostValue, symbol)}</PrintTd>
                    <PrintTd align="right">{formatCurrency(b.stockRetailValue, symbol)}</PrintTd>
                    <PrintTd align="right" className="font-bold text-purple-700">
                      {formatCurrency(b.expectedProfit, symbol)}
                    </PrintTd>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. PURCHASE PRINT */}
      {report === 'purchase' && (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <PrintTh>PO #</PrintTh>
              <PrintTh>Supplier</PrintTh>
              <PrintTh>Date</PrintTh>
              <PrintTh align="right">Total</PrintTh>
              <PrintTh>Status</PrintTh>
              <PrintTh>Payment</PrintTh>
            </tr>
          </thead>
          <tbody>
            {(data.purchases || []).map((p: any) => (
              <tr key={p.id}>
                <PrintTd className="font-medium">{p.po_number}</PrintTd>
                <PrintTd>{p.suppliers?.name || '—'}</PrintTd>
                <PrintTd>{formatDate(p.created_at)}</PrintTd>
                <PrintTd align="right">{formatCurrency(p.total, symbol)}</PrintTd>
                <PrintTd className="capitalize">{p.status}</PrintTd>
                <PrintTd className="capitalize">{p.payment_status}</PrintTd>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 5. EXPENSE PRINT */}
      {report === 'expense' && (
        <>
          <p className="mb-2 text-xs text-slate-600">
            Total expenses <strong>{formatCurrency(expTotal, symbol)}</strong>
          </p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <PrintTh>Date</PrintTh>
                <PrintTh>Category</PrintTh>
                <PrintTh>Note</PrintTh>
                <PrintTh align="right">Amount</PrintTh>
              </tr>
            </thead>
            <tbody>
              {(data.expenses || []).map((e: any) => (
                <tr key={e.id}>
                  <PrintTd>{formatDate(e.date || e.created_at)}</PrintTd>
                  <PrintTd>{e.expense_categories?.name || '—'}</PrintTd>
                  <PrintTd>{e.note || '—'}</PrintTd>
                  <PrintTd align="right">{formatCurrency(e.amount, symbol)}</PrintTd>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* 6. CUSTOMER PRINT */}
      {report === 'customer' && (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <PrintTh>Customer</PrintTh>
              <PrintTh>Area</PrintTh>
              <PrintTh>Phone</PrintTh>
              <PrintTh align="right">Balance</PrintTh>
            </tr>
          </thead>
          <tbody>
            {(data.customers || []).map((c: any) => (
              <tr key={c.id}>
                <PrintTd className="font-medium">{c.name}</PrintTd>
                <PrintTd>{c.area || '—'}</PrintTd>
                <PrintTd>{c.phone || '—'}</PrintTd>
                <PrintTd align="right">{formatCurrency(c.balance, symbol)}</PrintTd>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 7. SUPPLIER PRINT */}
      {report === 'supplier' && (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <PrintTh>Supplier</PrintTh>
              <PrintTh>Phone</PrintTh>
              <PrintTh align="right">Balance</PrintTh>
            </tr>
          </thead>
          <tbody>
            {(data.suppliers || []).map((s: any) => (
              <tr key={s.id}>
                <PrintTd className="font-medium">{s.name}</PrintTd>
                <PrintTd>{s.phone || '—'}</PrintTd>
                <PrintTd align="right">{formatCurrency(s.balance, symbol)}</PrintTd>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* 8. PAYMENT PRINT */}
      {report === 'payment' && (
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <PrintTh>Account</PrintTh>
              <PrintTh align="right">Balance</PrintTh>
            </tr>
          </thead>
          <tbody>
            {(data.accounts || []).map((a: any) => (
              <tr key={a.id}>
                <PrintTd className="font-medium">{a.name}</PrintTd>
                <PrintTd align="right">{formatCurrency(a.balance, symbol)}</PrintTd>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PrintDocument>
  );
}
