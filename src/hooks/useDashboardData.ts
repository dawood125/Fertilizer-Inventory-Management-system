import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { todayISO, monthStartISO } from '@/lib/utils';

export interface DashboardStats {
  todaySales: number;
  monthlySales: number;
  todayProfit: number;
  monthlyProfit: number;
  monthlyGrossProfit: number;
  monthlyExpenses: number;
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

const emptyStats: DashboardStats = {
  todaySales: 0,
  monthlySales: 0,
  todayProfit: 0,
  monthlyProfit: 0,
  monthlyGrossProfit: 0,
  monthlyExpenses: 0,
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

export function useDashboardData() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [salesData, setSalesData] = useState<SalesDataPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [categorySales, setCategorySales] = useState<CategorySales[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const today = todayISO();
    const monthStart = monthStartISO();

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

      const ordersList = orders || [];
      const itemsList = orderItems || [];
      const productsList = products || [];
      const expensesList = expenses || [];
      const returnsList = salesReturns || [];
      const productMap = new Map(productsList.map((p: any) => [p.id, p]));
      const categoryMap = new Map((categories || []).map((c: any) => [c.id, c]));

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

      // Pure trade orders (exclude customer opening balance debt entries)
      const tradeOrders = ordersList.filter((o: any) => !isOpeningBalanceOrder(o) && o.status !== 'cancelled');
      const tradeItems = itemsList.filter((it: any) => !isOpeningBalanceItem(it));

      const ordersToday = tradeOrders.filter((o: any) => o.created_at?.startsWith(today));
      const ordersMonth = tradeOrders.filter((o: any) => o.created_at >= monthStart);

      const returnsToday = returnsList.filter((r: any) => r.created_at?.startsWith(today));
      const returnsMonth = returnsList.filter((r: any) => (r.created_at || '') >= monthStart);

      const grossTodaySales = ordersToday.reduce((s: number, o: any) => s + Number(o.total), 0);
      const grossMonthlySales = ordersMonth.reduce((s: number, o: any) => s + Number(o.total), 0);
      const returnsTodayTotal = returnsToday.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
      const returnsMonthTotal = returnsMonth.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);

      // True Net Sales (Gross - Returns), exactly matching Reports Net Sales turnover
      const todaySales = Math.max(0, grossTodaySales - returnsTodayTotal);
      const monthlySales = Math.max(0, grossMonthlySales - returnsMonthTotal);

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

      const orderIdsToday = new Set(ordersToday.map((o: any) => o.id));
      const orderIdsMonth = new Set(ordersMonth.map((o: any) => o.id));
      const itemsToday = tradeItems.filter(
        (it: any) => it.created_at?.startsWith(today) || orderIdsToday.has(it.order_id)
      );
      const itemsMonth = tradeItems.filter(
        (it: any) => (it.created_at || '') >= monthStart || orderIdsMonth.has(it.order_id)
      );

      const todayGrossProfit = Math.max(0, calcProfit(itemsToday) - calcReturnProfit(returnsToday));
      const monthlyGrossProfit = Math.max(0, calcProfit(itemsMonth) - calcReturnProfit(returnsMonth));

      const todayExpenses = expensesList
        .filter((e: any) => e.date === today)
        .reduce((s: number, e: any) => s + Number(e.amount), 0);
      const monthlyExpenses = expensesList
        .filter((e: any) => e.date >= monthStart)
        .reduce((s: number, e: any) => s + Number(e.amount), 0);

      const todayProfit = todayGrossProfit - todayExpenses;
      const monthlyProfit = monthlyGrossProfit - monthlyExpenses;

      // Pending payments tracks ALL unpaid customer orders including opening balances
      const pendingPayments = (orders || [])
        .filter((o: any) => o.payment_status !== 'paid' && o.status !== 'cancelled')
        .reduce((s: number, o: any) => s + (Number(o.total) - Number(o.paid_amount || 0)), 0);

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
        monthlyExpenses,
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

      const days: SalesDataPoint[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayOrders = tradeOrders.filter((o: any) => o.created_at?.startsWith(dateStr));
        const dayExpenses = expensesList.filter((e: any) => e.date === dateStr);
        days.push({
          date: dateStr,
          sales: dayOrders.reduce((s: number, o: any) => s + Number(o.total), 0),
          profit: 0,
          expenses: dayExpenses.reduce((s: number, e: any) => s + Number(e.amount), 0),
        });
      }
      setSalesData(days);

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const topItemsData = tradeItems.filter((it: any) => (it.created_at || '') >= thirtyDaysAgo);
      const topMap = new Map<string, { quantity: number; revenue: number }>();
      topItemsData.forEach((it: any) => {
        const name = it.product_name || 'Unknown';
        const existing = topMap.get(name) || { quantity: 0, revenue: 0 };
        topMap.set(name, {
          quantity: existing.quantity + Number(it.quantity),
          revenue: existing.revenue + Number(it.total),
        });
      });
      setTopProducts(
        Array.from(topMap.entries())
          .map(([product_name, v]) => ({ product_name, ...v }))
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 5)
      );

      const catMap = new Map<string, { revenue: number; color: string }>();
      itemsMonth.forEach((it: any) => {
        const prod = productMap.get(it.product_id);
        const cat = prod?.category_id ? categoryMap.get(prod.category_id) : null;
        if (!cat) return;
        const existing = catMap.get(cat.name) || { revenue: 0, color: cat.color || '#0ea5e9' };
        catMap.set(cat.name, {
          revenue: existing.revenue + Number(it.total),
          color: cat.color || '#0ea5e9',
        });
      });
      setCategorySales(
        Array.from(catMap.entries()).map(([category_name, v]) => ({ category_name, ...v }))
      );

      setRecentActivity({
        orders: [...tradeOrders]
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .slice(0, 5),
        purchases: [...(purchaseOrders || [])]
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .slice(0, 5),
        expenses: [...expensesList]
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .slice(0, 5),
        transactions: [...(transactions || [])]
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .slice(0, 5),
        stockAlerts: [...lowStock, ...outOfStock].slice(0, 5),
      });
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
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  return { stats, salesData, topProducts, categorySales, recentActivity, loading, refetch: fetchAll };
}
