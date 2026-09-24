import { type ReactNode, useState } from 'react';
import {
  LayoutDashboard, ShoppingCart, Package, Truck, Receipt, Wallet,
  Settings as SettingsIcon, Menu, X, Store, ChevronDown,
  Building2, ClipboardList, Banknote, Users,
  RotateCcw, FileBarChart, Boxes, Layers, Sprout, LogOut, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettings } from '@/context/SettingsContext';
import { useAuth, roleCanAccess } from '@/context/AuthContext';

export interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
  badge?: number;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard', path: '/', icon: <LayoutDashboard size={19} /> },
    ],
  },
  {
    label: 'Master Data',
    items: [
      { label: 'Companies', path: '/companies', icon: <Building2 size={19} /> },
      { label: 'Brands', path: '/brands', icon: <Layers size={19} /> },
      { label: 'Categories', path: '/categories', icon: <Boxes size={19} /> },
      { label: 'Products', path: '/products', icon: <Package size={19} /> },
    ],
  },
  {
    label: 'Suppliers & Purchasing',
    items: [
      { label: 'Suppliers', path: '/suppliers', icon: <Truck size={19} /> },
      { label: 'Purchase Orders', path: '/purchases', icon: <ClipboardList size={19} /> },
      { label: 'Purchase Returns', path: '/purchase-returns', icon: <RotateCcw size={19} /> },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { label: 'Stock Management', path: '/stock', icon: <Package size={19} /> },
    ],
  },
  {
    label: 'Sales & Distribution',
    items: [
      { label: 'POS / New Order', path: '/pos', icon: <ShoppingCart size={19} /> },
      { label: 'Sales Orders', path: '/orders', icon: <Receipt size={19} /> },
      { label: 'Customers', path: '/customers', icon: <Store size={19} /> },
      { label: 'Sales Returns', path: '/sales-returns', icon: <RotateCcw size={19} /> },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Finance & Cash', path: '/finance', icon: <Banknote size={19} /> },
      { label: 'Pending Payments', path: '/pending-payments', icon: <Wallet size={19} /> },
      { label: 'Expenses', path: '/expenses', icon: <Receipt size={19} /> },
    ],
  },
  {
    label: 'Insights & Config',
    items: [
      { label: 'Reports', path: '/reports', icon: <FileBarChart size={19} /> },
      { label: 'Audit Logs', path: '/audit-logs', icon: <ShieldCheck size={19} /> },
      { label: 'Settings', path: '/settings', icon: <SettingsIcon size={19} /> },
    ],
  },
];

export function AppShell({
  route,
  navigate,
  children,
}: {
  route: string;
  navigate: (path: string) => void;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { settings, logoSrc } = useSettings();
  const { user, logout } = useAuth();

  const isActive = (path: string) => (path === '/' ? route === '/' : route.startsWith(path));
  const isPosMode = route === '/pos' || route.startsWith('/pos/');
  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => roleCanAccess(user?.role, item.path)),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar — hidden on POS for full-width billing */}
      {!isPosMode && (
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 transform border-r border-slate-200 bg-white transition-transform duration-200 lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-100 px-5">
          {logoSrc ? (
            <img src={logoSrc} alt="Logo" className="h-9 w-9 rounded-xl object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-md shadow-emerald-700/30">
              <Sprout size={20} />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-800">
              {settings?.store_name || 'FMCG'}
            </p>
            <p className="truncate text-xs text-slate-400">Distribution System</p>
          </div>
        </div>

        <nav className="flex h-[calc(100vh-4rem)] flex-col overflow-y-auto px-3 py-4">
          {visibleSections.map((section) => (
            <div key={section.label} className="mb-4">
              <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <button
                      key={item.path}
                      onClick={() => {
                        navigate(item.path);
                        setMobileOpen(false);
                      }}
                      className={cn(
                        'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                        active
                          ? 'bg-amber-50 text-amber-700'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                      )}
                    >
                      <span className={cn('transition', active ? 'text-amber-600' : 'text-slate-400 group-hover:text-slate-600')}>
                        {item.icon}
                      </span>
                      {item.label}
                      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-500" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>
      )}

      {/* Mobile overlay */}
      {!isPosMode && mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/80 px-4 backdrop-blur-md lg:px-6">
          {isPosMode ? (
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {logoSrc ? (
                <img src={logoSrc} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-sm shadow-emerald-700/20">
                  <Sprout size={16} />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-800">{settings?.store_name || 'POS'}</p>
                <p className="truncate text-xs text-slate-400">Point of Sale</p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="ml-1 inline-flex shrink-0 items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-100"
              >
                <LayoutDashboard size={16} />
                Dashboard
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
              >
                {mobileOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
              <div className="hidden flex-1 lg:block" />
            </>
          )}
          <div className="relative flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200 hover:bg-slate-100"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Users size={15} />
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-xs font-semibold text-slate-700">{user?.name || 'User'}</p>
                <p className="text-[10px] capitalize text-slate-400">{user?.role || 'staff'}</p>
              </div>
              <ChevronDown size={14} className="text-slate-400" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    onClick={async () => {
                      setMenuOpen(false);
                      await logout();
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50"
                  >
                    <LogOut size={16} /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className={cn('flex-1 overflow-y-auto p-4 lg:p-6', isPosMode && 'p-3 lg:p-4 xl:overflow-hidden')}>
          <div className={cn('animate-fadeIn', isPosMode ? 'mx-auto w-full max-w-none h-full' : 'mx-auto max-w-7xl')}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
