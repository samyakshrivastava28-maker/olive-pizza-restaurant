import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useManagerStore } from '../../store/managerStore';
import { AccessDeniedPage } from '../../pages/AccessDeniedPage';
import { Pizza, AlertTriangle, RefreshCw } from 'lucide-react';

import PushNotificationManager from '../../services/PushNotificationManager';
import { PersistentActiveOrderSheet } from '../orders/PersistentActiveOrderSheet';

export const AppLayout: React.FC = () => {
  const { user, isAuthChecking, isAuthorized, isDatabaseUnavailable, restrictedReason } = useManagerStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#0d120f] flex flex-col items-center justify-center space-y-4 p-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#57854d]/20 border border-[#57854d]/40 flex items-center justify-center text-[#c6a052] animate-bounce">
          <Pizza className="w-7 h-7" />
        </div>
        <h3 className="text-sm font-bold text-white tracking-wide">Olive Pizza Restaurant Manager</h3>
        <p className="text-xs text-[#a4c29c]">
          Loading kitchen operations and live telemetry...
        </p>
      </div>
    );
  }

  if (isDatabaseUnavailable) {
    return (
      <div className="min-h-screen bg-[#070b08] flex flex-col items-center justify-center p-6 text-white text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-400 animate-pulse">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold mb-2">Authoritative Database Temporarily Unavailable (HTTP 503)</h2>
        <p className="text-sm text-[#a4c29c] max-w-md mb-6 leading-relaxed">
          Your authenticated manager session is securely retained. The platform is waiting for the database service to resume.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4" />
          Retry Connection
        </button>
      </div>
    );
  }

  if (restrictedReason) {
    return <AccessDeniedPage />;
  }

  // Not logged in -> Render login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Logged in but not authorized -> Access Denied
  if (!isAuthorized) {
    return <AccessDeniedPage />;
  }

  return (
    <div className="min-h-screen bg-[#090d0b] text-[#e8eee9] flex flex-col font-sans">
      <PushNotificationManager />
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />

      <div className="lg:pl-64 flex flex-col flex-1 min-w-0">
        <Header onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto pb-24">
          <Outlet />
        </main>
      </div>

      <PersistentActiveOrderSheet />
    </div>
  );
};
