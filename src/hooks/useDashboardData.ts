import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { todayISO, monthStartISO } from '@/lib/utils';

export type DashboardTimeframe = 'last_30_days' | 'this_month' | 'last_month' | 'all';

export interface DashboardStats {
  todaySales: number;
  monthlySales: number;
  todayProfit: number;
  monthlyProfit: number;
  monthlyGrossProfit: number;
  monthlyExpenses: number;
  periodSales: number;
  periodExpenses: number;
  periodProfit: number;
  periodGrossProfit: number;
  periodLabel: string;
  periodOrdersCount: number;
  lastMonthSales: number;
  lastMonthExpenses: number;
  lastMonthProfit: number;
  lastMonthLabel: string;
  allTimeSales: number;
  allTimeExpenses: number;
  pendingPayments: number;
  cashInHand: number;
  bankBalance: number;
  jazzcashBalance: number;
  easypaisaBalance: number;
  totalOrders: number;
  totalCustomers: number;
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
}

export interface SalesDataPoint {
  date: string;
  sales: number;
  profit: number;
  expenses: number;
}

export interface TopProduct {
  product_name: string;
  quantity: number;
  revenue: number;
}

export interface CategorySales {
  category_name: string;
  revenue: number;
  color: string;
}

export interface RecentActivity {
  orders: any[];
  purchases: any[];
  expenses: any[];
  transactions: any[];
  stockAlerts: any[];
}

export interface OverdueCustomer {
  customerId: string;
  customerName: string;
  phone: string;
  area: string;
  orderNumber: string;
  dueDate: string;
  unpaidAmount: number;
  daysOverdue: number;
}

const emptyStats: DashboardStats = {
  todaySales: 0,
  monthlySales: 0,
  todayProfit: 0,
  monthlyProfit: 0,
  monthlyGrossProfit: 0,
  monthlyExpenses: 0,
  periodSales: 0,
  periodExpenses: 0,
  periodProfit: 0,
  periodGrossProfit: 0,
  periodLabel: 'This Month',
  periodOrdersCount: 0,
  lastMonthSales: 0,
  lastMonthExpenses: 0,
  lastMonthProfit: 0,
  lastMonthLabel: 'Last Month',
  allTimeSales: 0,
  allTimeExpenses: 0,
  pendingPayments: 0,
  cashInHand: 0,
  bankBalance: 0,
  jazzcashBalance: 0,
  easypaisaBalance: 0,
  totalOrders: 0,
  totalCustomers: 0,
  totalProducts: 0,
  lowStockCount: 0,
  outOfStockCount: 0,
};

function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function useDashboardData() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [salesData, setSalesData] = useState<SalesDataPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [categorySales, setCategorySales] = useState<CategorySales[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity | null>(null);
  const [overdueCustomers, setOverdueCustomers] = useState<OverdueCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<DashboardTimeframe>('this_month');

  const userSelectedRef = useRef<boolean>(false);
  const rawDataRef = useRef<any>(null);

  const computeData = useCallback((raw: any, activeTf: DashboardTimeframe) => {
    const {
      ordersList,
      itemsList,
      productsList,
      expensesList,
      returnsList,
      customers,
      accounts,
      purchaseOrders,
      transactions,
      categories,
    } = raw;

    const today = todayISO();
    const monthStart = monthStartISO();

    const now = new Date();
    const thirtyDaysAgoDate = new Date(Date.now() - 30 * 86400000);
    const thirtyDaysAgoStr = toLocalYMD(thirtyDaysAgoDate);

    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    const lastMonthStartStr = toLocalYMD(firstDayLastMonth);
    const lastMonthEndStr = toLocalYMD(lastDayLastMonth);
    const lastMonthName = firstDayLastMonth.toLocaleString('en', { month: 'short' });
    const thisMonthName = now.toLocaleString('en', { month: 'short' });

    const productMap = new Map<string, any>(productsList.map((p: any) => [p.id, p]));
    const categoryMap = new Map<string, any>((categories || []).map((c: any) => [c.id, c]));

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

    // Pure trade orders (exclude opening balance orders)
    const tradeOrders = ordersList.filter((o: any) => !isOpeningBalanceOrder(o) && o.status !== 'cancelled');
    const tradeItems = itemsList.filter((it: any) => !isOpeningBalanceItem(it));

    // Map order_id -> created_at so items have dates
    const orderDateMap = new Map(ordersList.map((o: any) => [o.id, String(o.created_at || '')]));
    const getItemDate = (it: any) => String(it.created_at || orderDateMap.get(it.order_id) || '');

    // Orders by period
    const ordersToday = tradeOrders.filter((o: any) => String(o.created_at || '').startsWith(today));
    const ordersThisMonth = tradeOrders.filter((o: any) => String(o.created_at || '').slice(0, 10) >= monthStart);
    const orders30Days = tradeOrders.filter((o: any) => String(o.created_at || '').slice(0, 10) >= thirtyDaysAgoStr);
    const ordersLastMonth = tradeOrders.filter((o: any) => {
      const d = String(o.created_at || '').slice(0, 10);
      return d >= lastMonthStartStr && d <= lastMonthEndStr;
    });
    const ordersAll = tradeOrders;

    // Active orders and period label
    let activeOrders = ordersThisMonth;
    let activePeriodLabel = `This Month (${thisMonthName})`;

    switch (activeTf) {
      case 'this_month':
        activeOrders = ordersThisMonth;
        activePeriodLabel = `This Month (${thisMonthName})`;
        break;
      case 'last_30_days':
        activeOrders = orders30Days;
        activePeriodLabel = 'Last 30 Days';
        break;
      case 'last_month':
        activeOrders = ordersLastMonth;
        activePeriodLabel = `Last Month (${lastMonthName})`;
        break;
      case 'all':
        activeOrders = ordersAll;
        activePeriodLabel = 'All Time';
        break;
    }

    const activeOrderIds = new Set(activeOrders.map((o: any) => o.id));
    const activeItems = tradeItems.filter((it: any) => activeOrderIds.has(it.order_id));

    // Returns by period
    const returnsToday = returnsList.filter((r: any) => String(r.created_at || '').startsWith(today));
    const returnsThisMonth = returnsList.filter((r: any) => String(r.created_at || '').slice(0, 10) >= monthStart);
    const returns30Days = returnsList.filter((r: any) => String(r.created_at || '').slice(0, 10) >= thirtyDaysAgoStr);
    const returnsLastMonth = returnsList.filter((r: any) => {
      const d = String(r.created_at || '').slice(0, 10);
      return d >= lastMonthStartStr && d <= lastMonthEndStr;
    });
    const returnsAll = returnsList;

    let activeReturns = returnsThisMonth;
    if (activeTf === 'this_month') activeReturns = returnsThisMonth;
    else if (activeTf === 'last_30_days') activeReturns = returns30Days;
    else if (activeTf === 'last_month') activeReturns = returnsLastMonth;
    else if (activeTf === 'all') activeReturns = returnsAll;

    // Sales by period (Net = Gross - Returns)
    const grossTodaySales = ordersToday.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const returnsTodayTotal = returnsToday.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
    const todaySales = Math.max(0, grossTodaySales - returnsTodayTotal);

    const grossMonthlySales = ordersThisMonth.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const returnsMonthlyTotal = returnsThisMonth.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
    const monthlySales = Math.max(0, grossMonthlySales - returnsMonthlyTotal);

    const grossLastMonthSales = ordersLastMonth.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const returnsLastMonthTotal = returnsLastMonth.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
    const lastMonthSales = Math.max(0, grossLastMonthSales - returnsLastMonthTotal);

    const grossPeriodSales = activeOrders.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const returnsPeriodTotal = activeReturns.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
    const periodSales = Math.max(0, grossPeriodSales - returnsPeriodTotal);

    const grossAllTimeSales = ordersAll.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    const returnsAllTimeTotal = returnsAll.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
    const allTimeSales = Math.max(0, grossAllTimeSales - returnsAllTimeTotal);

    // Profit calculation helpers
    const calcProfit = (items: any[]) =>
      items.reduce((s: number, it: any) => {
        if (isOpeningBalanceItem(it)) return s;
        const prod = productMap.get(it.product_id);
        const cartonPacking = Number(prod?.carton_to_box || 0);
        const isBox = String(it.unit || '').toLowerCase() === 'box' && cartonPacking > 0;
        const rawQty = Number(it.quantity || 0);
        const cartons = isBox ? rawQty / cartonPacking : rawQty;

        const unitCost = it.cost_price != null && Number(it.cost_price) > 0
          ? Number(it.cost_price)
          : Number(prod?.purchase_price || prod?.cost_price || 0);
        const cost = it.total_cost != null && Number(it.total_cost) > 0
          ? Number(it.total_cost)
          : unitCost * cartons;
        const revenue = Number(it.total || 0);
        return s + (revenue - cost);
      }, 0);

    const calcReturnProfit = (returns: any[]) =>
      returns.reduce((s: number, r: any) => {
        const prod = productMap.get(r.product_id);
        const cartonPacking = Number(prod?.carton_to_box || 0);
        const isBox = String(r.unit || '').toLowerCase() === 'box' && cartonPacking > 0;
        const rawQty = Number(r.quantity || 0);
        const cartons = isBox ? rawQty / cartonPacking : rawQty;
        const unitCost = Number(prod?.purchase_price || prod?.cost_price || 0);
        const cost = unitCost * cartons;
        const revenue = Number(r.total_amount || 0);
        return s + (revenue - cost);
      }, 0);

    // Expenses by period
    const filterExpenses = (predicate: (dStr: string) => boolean) =>
      expensesList
        .filter((e: any) => predicate(String(e.date || e.created_at || '').slice(0, 10)))
        .reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

    const todayExpenses = filterExpenses((d) => d === today);
    const thisMonthExpenses = filterExpenses((d) => d >= monthStart);
    const last30DaysExpenses = filterExpenses((d) => d >= thirtyDaysAgoStr);
    const lastMonthExpenses = filterExpenses((d) => d >= lastMonthStartStr && d <= lastMonthEndStr);
    const allTimeExpenses = expensesList.reduce((s: number, e: any) => s + Number(e.amount || 0), 0);

    let activeExpenses = thisMonthExpenses;
    if (activeTf === 'this_month') activeExpenses = thisMonthExpenses;
    else if (activeTf === 'last_30_days') activeExpenses = last30DaysExpenses;
    else if (activeTf === 'last_month') activeExpenses = lastMonthExpenses;
    else if (activeTf === 'all') activeExpenses = allTimeExpenses;

    // Gross and Net Profit
    const orderIdsToday = new Set(ordersToday.map((o: any) => o.id));
    const itemsToday = tradeItems.filter((it: any) => orderIdsToday.has(it.order_id));
    const todayGrossProfit = Math.max(0, calcProfit(itemsToday) - calcReturnProfit(returnsToday));
    const todayProfit = todayGrossProfit - todayExpenses;

    const orderIdsThisMonth = new Set(ordersThisMonth.map((o: any) => o.id));
    const itemsThisMonth = tradeItems.filter((it: any) => orderIdsThisMonth.has(it.order_id));
    const monthlyGrossProfit = Math.max(0, calcProfit(itemsThisMonth) - calcReturnProfit(returnsThisMonth));
    const monthlyProfit = monthlyGrossProfit - thisMonthExpenses;

    const periodGrossProfit = Math.max(0, calcProfit(activeItems) - calcReturnProfit(activeReturns));
    const periodProfit = periodGrossProfit - activeExpenses;

    // Pending payments tracks ALL unpaid customer orders including opening balances
    const pendingPayments = (ordersList || [])
      .filter((o: any) => o.payment_status !== 'paid' && o.status !== 'cancelled')
      .reduce((s: number, o: any) => s + (Number(o.total || 0) - Number(o.paid_amount || 0)), 0);

    const getBal = (type: string) => (accounts || []).find((a: any) => a.type === type)?.balance || 0;
    const lowStock = productsList.filter(
      (p: any) => p.stock_quantity > 0 && p.stock_quantity <= p.min_stock_level
    );
    const outOfStock = productsList.filter((p: any) => p.stock_quantity <= 0);

    setStats({
      todaySales,
      monthlySales,
      todayProfit,
      monthlyProfit,
      monthlyGrossProfit,
      monthlyExpenses: thisMonthExpenses,
      periodSales,
      periodExpenses: activeExpenses,
      periodProfit,
      periodGrossProfit,
      periodLabel: activePeriodLabel,
      periodOrdersCount: activeOrders.length,
      lastMonthSales,
      lastMonthExpenses,
      lastMonthProfit: 0,
      lastMonthLabel: lastMonthName,
      allTimeSales,
      allTimeExpenses,
      pendingPayments,
      cashInHand: getBal('cash'),
      bankBalance: getBal('bank'),
      jazzcashBalance: getBal('jazzcash'),
      easypaisaBalance: getBal('easypaisa'),
      totalOrders: tradeOrders.length,
      totalCustomers: (customers || []).length,
      totalProducts: productsList.length,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
    });

    // 7-day Sales Bar Chart
    const days: SalesDataPoint[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = toLocalYMD(d);
      const dayOrders = tradeOrders.filter((o: any) => String(o.created_at || '').startsWith(dateStr));
      const dayExpenses = expensesList.filter((e: any) => String(e.date || e.created_at || '').slice(0, 10) === dateStr);
      days.push({
        date: dateStr,
        sales: dayOrders.reduce((s: number, o: any) => s + Number(o.total || 0), 0),
        profit: 0,
        expenses: dayExpenses.reduce((s: number, e: any) => s + Number(e.amount || 0), 0),
      });
    }
    setSalesData(days);

    // Top Products for active period (falling back to 30 days or all)
    const items30Days = tradeItems.filter((it: any) => getItemDate(it).slice(0, 10) >= thirtyDaysAgoStr);
    const itemsForTop = activeItems.length > 0 ? activeItems : (items30Days.length > 0 ? items30Days : tradeItems);
    const topMap = new Map<string, { quantity: number; revenue: number }>();
    itemsForTop.forEach((it: any) => {
      const name = it.product_name || 'Unknown';
      const existing = topMap.get(name) || { quantity: 0, revenue: 0 };
      topMap.set(name, {
        quantity: existing.quantity + Number(it.quantity || 0),
        revenue: existing.revenue + Number(it.total || 0),
      });
    });
    setTopProducts(
      Array.from(topMap.entries())
        .map(([product_name, v]) => ({ product_name, ...v }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5)
    );

    // Category Sales for active period
    const itemsForCat = activeItems.length > 0 ? activeItems : (items30Days.length > 0 ? items30Days : tradeItems);
    const catMap = new Map<string, { revenue: number; color: string }>();
    const DEFAULT_COLORS = ['#0284c7', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#64748b'];

    itemsForCat.forEach((it: any) => {
      const prod = productMap.get(it.product_id);
      const cat = prod?.category_id ? categoryMap.get(prod.category_id) : null;
      const catName = cat?.name || (prod ? 'Uncategorized' : 'General Sales');
      const color = cat?.color || DEFAULT_COLORS[catMap.size % DEFAULT_COLORS.length];
      const existing = catMap.get(catName) || { revenue: 0, color };
      catMap.set(catName, {
        revenue: existing.revenue + Number(it.total || 0),
        color: existing.color,
      });
    });
    setCategorySales(
      Array.from(catMap.entries())
        .map(([category_name, v]) => ({ category_name, ...v }))
        .filter((c) => c.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue)
    );

    // Recent Activity
    setRecentActivity({
      orders: [...tradeOrders]
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, 5),
      purchases: [...(purchaseOrders || [])]
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, 5),
      expenses: [...expensesList]
        .sort((a, b) => String(b.created_at || b.date).localeCompare(String(a.created_at || a.date)))
        .slice(0, 5),
      transactions: [...(transactions || [])]
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .slice(0, 5),
      stockAlerts: [...lowStock, ...outOfStock].slice(0, 5),
    });

    // Overdue Credit Invoices (Bug #24)
    const todayStr = toLocalYMD(new Date());
    const overdueList: OverdueCustomer[] = [];
    const custMap = new Map<string, any>((customers || []).map((c: any) => [c.id, c]));

    tradeOrders.forEach((o: any) => {
      const unpaid = Number(o.total || 0) - Number(o.paid_amount || 0);
      if (o.due_date && o.payment_status !== 'paid' && unpaid > 0 && o.due_date < todayStr) {
        const cust = o.customer_id ? custMap.get(o.customer_id) : null;
        const daysOverdue = Math.max(1, Math.floor((Date.now() - new Date(o.due_date).getTime()) / 86400000));
        overdueList.push({
          customerId: o.customer_id || '',
          customerName: cust?.name || o.customer_name || 'Walk-in Customer',
          phone: cust?.phone || o.customer_phone || '',
          area: cust?.area || o.customer_area || '',
          orderNumber: o.order_number,
          dueDate: o.due_date,
          unpaidAmount: unpaid,
          daysOverdue,
        });
      }
    });
    setOverdueCustomers(overdueList.sort((a, b) => b.daysOverdue - a.daysOverdue));
  }, []);

  const changeTimeframe = useCallback((tf: DashboardTimeframe) => {
    userSelectedRef.current = true;
    setTimeframe(tf);
    if (rawDataRef.current) {
      computeData(rawDataRef.current, tf);
    }
  }, [computeData]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [
        orders,
        orderItems,
        customers,
        products,
        accounts,
        expenses,
        purchaseOrders,
        transactions,
        categories,
        salesReturns,
      ] = await Promise.all([
        api.get<any[]>('/api/data/orders'),
        api.get<any[]>('/api/data/order_items'),
        api.get<any[]>('/api/data/customers'),
        api.get<any[]>('/api/data/products?limit=10000'),
        api.get<any[]>('/api/data/payment_accounts'),
        api.get<any[]>('/api/data/expenses'),
        api.get<any[]>('/api/data/purchase_orders'),
        api.get<any[]>('/api/data/transactions'),
        api.get<any[]>('/api/data/categories'),
        api.get<any[]>('/api/data/sales_returns'),
      ]);

      const raw = {
        ordersList: orders || [],
        itemsList: orderItems || [],
        productsList: products || [],
        expensesList: expenses || [],
        returnsList: salesReturns || [],
        customers: customers || [],
        accounts: accounts || [],
        purchaseOrders: purchaseOrders || [],
        transactions: transactions || [],
        categories: categories || [],
      };
      rawDataRef.current = raw;

      // Smart initial timeframe selection: Default to this_month
      let effectiveTf = timeframe;
      if (!userSelectedRef.current) {
        effectiveTf = 'this_month';
        setTimeframe(effectiveTf);
      }

      computeData(raw, effectiveTf);
    } catch {
      setStats(emptyStats);
      setSalesData([]);
      setTopProducts([]);
      setCategorySales([]);
      setRecentActivity({
        orders: [],
        purchases: [],
        expenses: [],
        transactions: [],
        stockAlerts: [],
      });
      setOverdueCustomers([]);
    } finally {
      setLoading(false);
    }
  }, [computeData, timeframe]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return {
    stats,
    salesData,
    topProducts,
    categorySales,
    recentActivity,
    overdueCustomers,
    loading,
    refetch: fetchAll,
    timeframe,
    setTimeframe: changeTimeframe,
  };
}
