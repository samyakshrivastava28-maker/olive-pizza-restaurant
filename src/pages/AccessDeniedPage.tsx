import React from 'react';
import { ShieldAlert, LogOut } from 'lucide-react';
import { useManagerStore } from '../store/managerStore';
import { useNavigate } from 'react-router-dom';

export const AccessDeniedPage: React.FC = () => {
  const { user, logout } = useManagerStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#0d120f] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#141b16] border border-[#26332a] rounded-3xl p-8 shadow-2xl text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 mx-auto flex items-center justify-center">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-extrabold text-white">Access Denied</h1>
          <p className="text-xs text-[#a4c29c] leading-relaxed">
            Your account (<strong className="text-white">{user?.email || 'Customer'}</strong>) does not have active Restaurant Manager permissions for this branch.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#0d120f] border border-[#26332a] text-xs text-[#7ba372] text-left space-y-1">
          <p className="font-semibold text-white">Why am I seeing this?</p>
          <p>• Normal customer accounts are blocked from accessing the Restaurant Manager application.</p>
          <p>• If you are a restaurant manager, ask the restaurant Owner to provision your account in the Owner Console.</p>
        </div>

        <button
          onClick={handleLogout}
          className="w-full py-3 rounded-xl bg-[#1b241e] hover:bg-[#222d26] text-white border border-[#26332a] font-bold text-xs flex items-center justify-center gap-2 transition-all"
        >
          <LogOut className="w-4 h-4 text-red-400" />
          <span>Sign Out / Switch Account</span>
        </button>
      </div>
    </div>
  );
};
