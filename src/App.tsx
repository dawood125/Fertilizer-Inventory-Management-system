import { useHashRoute } from '@/lib/router';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { SettingsProvider } from '@/context/SettingsContext';
import { ToastProvider } from '@/components/Toast';
import { AppShell } from '@/components/AppShell';
import { LoginPage } from '@/pages/Login';
import { Dashboard } from '@/pages/Dashboard';
import { POS } from '@/pages/POS';
import { Orders } from '@/pages/Orders';
import { Customers } from '@/pages/Customers';
import { Products } from '@/pages/Products';
import { Categories, Brands, StockManagement } from '@/pages/Inventory';
import { PurchaseOrders, Suppliers } from '@/pages/Purchasing';
import { Expenses } from '@/pages/Expenses';
import { PendingPayments } from '@/pages/Payments';
import { Reports } from '@/pages/Reports';
import { Settings } from '@/pages/Settings';
import { Companies } from '@/pages/Companies';
import { SalesReturns } from '@/pages/SalesReturns';
import { PurchaseReturns } from '@/pages/PurchaseReturns';
import { Finance } from '@/pages/Finance';
import { AuditLogs } from '@/pages/AuditLogs';
import { Spinner } from '@/components/ui';

function Router() {
  const [route, navigate] = useHashRoute();
  const { user, loading, canAccess } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Spinner />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (!canAccess(route)) {
    return (
      <AppShell route={route} navigate={navigate}>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          You do not have permission to view this page.
          <button className="ml-3 font-semibold underline" onClick={() => navigate('/')}>
            Go to Dashboard
          </button>
        </div>
      </AppShell>
    );
  }

  const render = () => {
    switch (route) {
      case '/': return <Dashboard navigate={navigate} />;
      case '/pos': return <POS navigate={navigate} />;
      case '/orders': return <Orders />;
      case '/customers': return <Customers />;
      case '/products': return <Products />;
      case '/companies': return <Companies />;
      case '/categories': return <Categories />;
      case '/brands': return <Brands />;
      case '/stock': return <StockManagement />;
      case '/purchases': return <PurchaseOrders />;
      case '/purchase-returns': return <PurchaseReturns />;
      case '/suppliers': return <Suppliers />;
      case '/expenses': return <Expenses />;
      case '/pending-payments': return <PendingPayments />;
      case '/finance': return <Finance />;
      case '/sales-returns': return <SalesReturns />;
      case '/audit-logs': return <AuditLogs />;
      case '/reports': return <Reports />;
      case '/settings': return <Settings />;
      default: return <Dashboard navigate={navigate} />;
    }
  };

  return (
    <AppShell route={route} navigate={navigate}>
      {render()}
    </AppShell>
  );
}

function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <ToastProvider>
          <Router />
        </ToastProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}

export default App;
