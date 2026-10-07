import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppLayout } from './components/layout/AppLayout';
import { useManagerStore } from './store/managerStore';

import { Suspense, lazy } from 'react';

// Core Critical Pages (Eagerly loaded for fast startup)
import { DashboardPage } from './pages/DashboardPage';
import { LiveOrdersPage } from './pages/LiveOrdersPage';
import { LoginPage } from './pages/LoginPage';
import { AccessDeniedPage } from './pages/AccessDeniedPage';

// Auxiliary Pages (Lazy loaded for optimal bundle size and responsive startup)
const OrderHistoryPage = lazy(() => import('./pages/OrderHistoryPage').then(m => ({ default: m.OrderHistoryPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then(m => ({ default: m.NotificationsPage })));
const EmailPage = lazy(() => import('./pages/EmailPage').then(m => ({ default: m.EmailPage })));
const DeliveryManagementPage = lazy(() => import('./pages/DeliveryManagementPage').then(m => ({ default: m.DeliveryManagementPage })));
const InventoryManager = lazy(() => import('./pages/InventoryManager').then(m => ({ default: m.InventoryManager })));
const MenuManagementPage = lazy(() => import('./pages/MenuManagementPage').then(m => ({ default: m.MenuManagementPage })));

const PageLoader = () => (
  <div className="flex h-64 w-full items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
  </div>
);

export function App() {
  const { initAuth, isAuthChecking, restrictedReason } = useManagerStore();

  useEffect(() => {
    const unsub = initAuth();
    return () => unsub();
  }, [initAuth]);

  if (isAuthChecking) {
    return (
      <div className="h-screen w-screen bg-[#070b08] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-[#57854d] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-[#a4c29c] font-medium">Verifying Restaurant Authorization...</p>
        </div>
      </div>
    );
  }

  if (restrictedReason) {
    return (
      <HashRouter>
        <AccessDeniedPage />
      </HashRouter>
    );
  }

  return (
    <HashRouter>
      <Toaster 
        position="top-right" 
        toastOptions={{
          style: {
            background: '#141b16',
            color: '#e8eee9',
            border: '1px solid #26332a',
            fontSize: '12px',
            borderRadius: '12px'
          },
          success: {
            iconTheme: {
              primary: '#57854d',
              secondary: '#ffffff',
            },
          },
        }} 
      />

      <Routes>
        {/* Public Login Route */}
        <Route path="/login" element={<LoginPage />} />

        {/* Authenticated & Authorized Restaurant Manager Shell */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/live-orders" element={<LiveOrdersPage />} />
          <Route path="/order-history" element={<Suspense fallback={<PageLoader />}><OrderHistoryPage /></Suspense>} />
          <Route path="/notifications" element={<Suspense fallback={<PageLoader />}><NotificationsPage /></Suspense>} />
          <Route path="/email" element={<Suspense fallback={<PageLoader />}><EmailPage /></Suspense>} />
          <Route path="/delivery" element={<Suspense fallback={<PageLoader />}><DeliveryManagementPage /></Suspense>} />
          <Route path="/inventory" element={<Suspense fallback={<PageLoader />}><InventoryManager /></Suspense>} />
          <Route path="/menu" element={<Suspense fallback={<PageLoader />}><MenuManagementPage /></Suspense>} />

          {/* Clean legacy fallback redirects */}
          <Route path="/overview" element={<Navigate to="/dashboard" replace />} />
          <Route path="/orders" element={<Navigate to="/live-orders" replace />} />
          <Route path="/riders" element={<Navigate to="/delivery" replace />} />
        </Route>

        {/* Wildcard Fallback */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </HashRouter>
  );
}

export default App;
