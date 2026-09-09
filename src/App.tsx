import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppLayout } from './components/layout/AppLayout';
import { useManagerStore } from './store/managerStore';

// Canonical 6 Restaurant Manager Pages
import { DashboardPage } from './pages/DashboardPage';
import { LiveOrdersPage } from './pages/LiveOrdersPage';
import { OrderHistoryPage } from './pages/OrderHistoryPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { EmailPage } from './pages/EmailPage';
import { DeliveryManagementPage } from './pages/DeliveryManagementPage';
import { LoginPage } from './pages/LoginPage';
import { InventoryManager } from './pages/InventoryManager';
import { MenuManagementPage } from './pages/MenuManagementPage';

import PushNotificationManager from './services/PushNotificationManager';
import { AccessDeniedPage } from './pages/AccessDeniedPage';

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
      <PushNotificationManager />
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
          <Route path="/order-history" element={<OrderHistoryPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/email" element={<EmailPage />} />
          <Route path="/delivery" element={<DeliveryManagementPage />} />
          <Route path="/inventory" element={<InventoryManager />} />
          <Route path="/menu" element={<MenuManagementPage />} />

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
