import { useDashboardData } from '@/hooks/useDashboardData';
import { useSettings } from '@/context/SettingsContext';
import { StatCard, BarChart, DonutChart } from '@/components/Charts';
import { Card, Spinner, PageHeader, Badge } from '@/components/ui';
import { Button } from '@/components/Button';
import { formatCurrency, formatDateTime, formatDate } from '@/lib/utils';
import { Link } from '@/lib/router';
import {
  TrendingUp, TrendingDown, DollarSign, Wallet, Landmark, Smartphone, ShoppingBag,
  Users, Package, AlertTriangle, PackageX, Receipt, Plus, BarChart3,
  Truck, ArrowUpRight, ArrowDownRight, Clock,
} from 'lucide-react';

export function Dashboard({ navigate }: { navigate: (path: string) => void }) {
  const { stats, salesData, topProducts, categorySales, recentActivity, loading } = useDashboardData();
  const { symbol } = useSettings();

  if (loading || !stats) {
    return (
      <div>
        <PageHeader title="Dashboard" subtitle="Overview of your store performance" />
        <Spinner />
      </div>
    );
  }

  const fmt = (v: number) => formatCurrency(v, symbol);
  const chartData = salesData.map((d) => ({
    label: new Date(d.date).toLocaleDateString('en', { weekday: 'short' }),
    value: d.sales,
  }));

  const quickActions = [
    { label: 'Create Purchase', path: '/purchases', icon: <Truck size={18} />, color: 'bg-sky-600 hover:bg-sky-700' },
    { label: 'New Order', path: '/pos', icon: <ShoppingBag size={18} />, color: 'bg-emerald-600 hover:bg-emerald-700' },
    { label: 'Add Product', path: '/products', icon: <Plus size={18} />, color: 'bg-violet-600 hover:bg-violet-700' },
    { label: 'Add Customer', path: '/customers', icon: <Users size={18} />, color: 'bg-amber-600 hover:bg-amber-700' },
    { label: 'Add Supplier', path: '/suppliers', icon: <Truck size={18} />, color: 'bg-rose-600 hover:bg-rose-700' },
    { label: 'Record Expense', path: '/expenses', icon: <Receipt size={18} />, color: 'bg-slate-700 hover:bg-slate-800' },
    { label: 'Receive Payment', path: '/pending-payments', icon: <Wallet size={18} />, color: 'bg-emerald-700 hover:bg-emerald-800' },
    { label: 'View Reports', path: '/reports', icon: <BarChart3 size={18} />, color: 'bg-amber-700 hover:bg-amber-800' },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of your store performance" />

      {/* Top stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Today's Sales" value={fmt(stats.todaySales)} icon={<DollarSign size={20} />} color="sky" onClick={() => navigate('/reports')} />
        <StatCard label="Monthly Sales" value={fmt(stats.monthlySales)} icon={<TrendingUp size={20} />} color="emerald" onClick={() => navigate('/reports')} />
        <StatCard label="Monthly Expenses" value={fmt(stats.monthlyExpenses)} icon={<Receipt size={20} />} color="rose" onClick={() => navigate('/expenses')} />
        <StatCard 
          label={stats.todayProfit < 0 ? "Today's Net Loss" : "Today's Net Profit"} 
          value={fmt(Math.abs(stats.todayProfit))} 
          icon={<DollarSign size={20} />} 
          color={stats.todayProfit < 0 ? "rose" : "violet"} 
          onClick={() => navigate('/reports')} 
        />
        <StatCard 
          label={stats.monthlyProfit < 0 ? "Monthly Net Loss" : "Monthly Net Profit"} 
          value={fmt(Math.abs(stats.monthlyProfit))} 
          icon={stats.monthlyProfit < 0 ? <TrendingDown size={20} /> : <TrendingUp size={20} />} 
          color={stats.monthlyProfit < 0 ? "rose" : "emerald"} 
          onClick={() => navigate('/reports')} 
        />
      </div>

      {stats.monthlyProfit < 0 && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-rose-100 p-1 text-rose-600">
              <AlertTriangle size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-rose-800">Operating at a Loss</h3>
              <p className="mt-1 text-sm text-rose-700">
                The business is currently running at a net loss this month. Total expenses (<strong>{fmt(stats.monthlyExpenses)}</strong>) exceed the gross profit from sales (<strong>{fmt(stats.monthlyGrossProfit)}</strong>).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Balances */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Pending Payments" value={fmt(stats.pendingPayments)} icon={<Clock size={20} />} color="amber" onClick={() => navigate('/pending-payments')} />
        <StatCard label="Cash in Hand" value={fmt(stats.cashInHand)} icon={<Wallet size={20} />} color="emerald" onClick={() => navigate('/finance')} />
        <StatCard label="Bank Balance" value={fmt(stats.bankBalance)} icon={<Landmark size={20} />} color="sky" onClick={() => navigate('/finance')} />
        <StatCard label="JazzCash" value={fmt(stats.jazzcashBalance)} icon={<Smartphone size={20} />} color="rose" onClick={() => navigate('/finance')} />
        <StatCard label="EasyPaisa" value={fmt(stats.easypaisaBalance)} icon={<Smartphone size={20} />} color="violet" onClick={() => navigate('/finance')} />
      </div>

      {/* Inventory stats */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total Orders" value={String(stats.totalOrders)} icon={<ShoppingBag size={20} />} color="slate" onClick={() => navigate('/orders')} />
        <StatCard label="Total Customers" value={String(stats.totalCustomers)} icon={<Users size={20} />} color="sky" onClick={() => navigate('/customers')} />
        <StatCard label="Total Products" value={String(stats.totalProducts)} icon={<Package size={20} />} color="violet" onClick={() => navigate('/products')} />
        <StatCard label="Low Stock" value={String(stats.lowStockCount)} icon={<AlertTriangle size={20} />} color="amber" onClick={() => navigate('/stock')} />
        <StatCard label="Out of Stock" value={String(stats.outOfStockCount)} icon={<PackageX size={20} />} color="rose" onClick={() => navigate('/stock')} />
      </div>

      {/* Quick actions */}
      <div className="mt-6">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Quick Actions</h3>
        <div className="flex flex-wrap gap-2.5">
          {quickActions.map((a) => (
            <button
              key={a.label}
              onClick={() => navigate(a.path)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-sm transition ${a.color}`}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* Charts row */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Sales — Last 7 Days" className="lg:col-span-2">
          <div className="p-5">
            {chartData.some((d) => d.value > 0) ? (
              <BarChart data={chartData} formatValue={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))} />
            ) : (
              <p className="py-12 text-center text-sm text-slate-400">No sales data yet</p>
            )}
          </div>
        </Card>
        <Card title="Sales by Category">
          <div className="p-5">
            {categorySales.length > 0 ? (
              <DonutChart
                data={categorySales.map((c) => ({ label: c.category_name, value: c.revenue, color: c.color }))}
                formatValue={(v) => fmt(v)}
              />
            ) : (
              <p className="py-12 text-center text-sm text-slate-400">No category data</p>
            )}
          </div>
        </Card>
      </div>

      {/* Top products + Recent activity */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Top Selling Products" subtitle="Last 30 days">
          <div className="p-5">
            {topProducts.length > 0 ? (
              <div className="space-y-3">
                {topProducts.map((p, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-600">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-700">{p.product_name}</p>
                      <p className="text-xs text-slate-400">{p.quantity} sold</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-700">{fmt(p.revenue)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-400">No sales yet</p>
            )}
          </div>
        </Card>

        <Card title="Recent Activity">
          <div className="divide-y divide-slate-100">
            {recentActivity?.orders.length === 0 && recentActivity?.expenses.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">No recent activity</p>
            ) : (
              <>
                {recentActivity?.orders.slice(0, 3).map((o: any) => (
                  <Link key={o.id} to="/orders" className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-100 text-sky-600">
                      <ShoppingBag size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700">Order {o.order_number}</p>
                      <p className="text-xs text-slate-400">{formatDateTime(o.created_at)}</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-700">{fmt(o.total)}</span>
                  </Link>
                ))}
                {recentActivity?.purchases.slice(0, 2).map((p: any) => (
                  <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                      <Truck size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700">Purchase {p.po_number}</p>
                      <p className="text-xs text-slate-400">{formatDateTime(p.created_at)}</p>
                    </div>
                    <Badge variant={p.status === 'received' ? 'green' : 'amber'}>{p.status}</Badge>
                  </div>
                ))}
                {recentActivity?.expenses.slice(0, 2).map((e: any) => (
                  <div key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                      <Receipt size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700">{e.note || 'Expense'}</p>
                      <p className="text-xs text-slate-400">{formatDate(e.date)}</p>
                    </div>
                    <span className="text-sm font-semibold text-rose-600">- {fmt(e.amount)}</span>
                  </div>
                ))}
                {recentActivity?.transactions.slice(0, 2).map((t: any) => (
                  <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                      {t.type === 'cash_in' || t.type === 'deposit' ? <ArrowDownRight size={15} /> : <ArrowUpRight size={15} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700 capitalize">{t.type.replace('_', ' ')} — {t.account_type}</p>
                      <p className="text-xs text-slate-400">{formatDateTime(t.created_at)}</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-700">{fmt(t.amount)}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Stock alerts */}
      {recentActivity && recentActivity.stockAlerts.length > 0 && (
        <Card title="Stock Alerts" className="mt-4">
          <div className="divide-y divide-slate-100">
            {recentActivity.stockAlerts.map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${p.stock_quantity <= 0 ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                  {p.stock_quantity <= 0 ? <PackageX size={15} /> : <AlertTriangle size={15} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-700">{p.name}</p>
                  <p className="text-xs text-slate-400">Min: {p.min_stock_level} {p.unit || 'pcs'}</p>
                </div>
                <Badge variant={p.stock_quantity <= 0 ? 'red' : 'amber'}>
                  {p.stock_quantity <= 0 ? 'Out of stock' : `${p.stock_quantity} left`}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
