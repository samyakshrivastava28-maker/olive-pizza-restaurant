import React, { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useManagerStore } from '../../store/managerStore';
import { AccessDeniedPage } from '../../pages/AccessDeniedPage';
import { Pizza } from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { user, isAuthChecking, isAuthorized } = useManagerStore();
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
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
      />

      <div className="lg:pl-64 flex flex-col flex-1 min-w-0">
        <Header onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
