import React from 'react';
import { ShieldAlert, LogOut, Clock, XCircle, RefreshCw } from 'lucide-react';
import { useManagerStore } from '../store/managerStore';
import { useNavigate } from 'react-router-dom';

export const AccessDeniedPage: React.FC = () => {
  const { user, restrictedEmail, restrictedReason, authStatus, clearRestricted, logout, initAuth } = useManagerStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    clearRestricted();
    await logout();
    navigate('/login');
  };

  const accountEmail = restrictedEmail || user?.email || 'Account';
  const isPending = authStatus === 'PENDING_OWNER_APPROVAL';
  const isRejected = authStatus === 'ACCOUNT_REJECTED';

  return (
    <div className="min-h-screen bg-[#070b08] text-[#e8eee9] flex items-center justify-center p-4 font-sans relative overflow-hidden">
      <div className={`absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl pointer-events-none ${
        isPending ? 'bg-amber-500/10' : 'bg-red-950/20'
      }`} />

      <div className={`w-full max-w-md bg-[#0e1410] border rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 text-center space-y-6 ${
        isPending ? 'border-amber-500/40' : 'border-red-900/40'
      }`}>
        <div className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-lg ${
          isPending
            ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-amber-950/30'
            : 'bg-red-500/10 border border-red-500/30 text-red-400 shadow-red-950/30'
        }`}>
          {isPending ? <Clock className="w-8 h-8" /> : isRejected ? <XCircle className="w-8 h-8" /> : <ShieldAlert className="w-8 h-8" />}
        </div>

        <div className="space-y-2">
          <span className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase border ${
            isPending
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}>
            {isPending ? 'Pending Owner Approval' : isRejected ? 'Request Rejected' : 'Access Restricted'}
          </span>
          <h1 className="text-xl font-black text-white">
            {isPending ? 'Waiting for Owner Approval' : 'Olive Pizza Restaurant Manager'}
          </h1>
          <p className="text-sm text-slate-300 font-medium">
            {restrictedReason || (isPending ? 'Your account is waiting for Owner verification.' : 'This account is not authorized to use this Olive Pizza application.')}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-[#090d0a] border border-[#1b261e] text-xs text-slate-400 font-mono break-all">
          Attempted Account: <strong className="text-white">{accountEmail}</strong>
        </div>

        <div className="p-4 rounded-2xl bg-[#090d0a] border border-[#1b261e] text-xs text-[#a4c29c] text-left space-y-2">
          <p className="font-semibold text-white">Notice to Staff & Partners:</p>
          <ul className="space-y-1.5 text-[11px] text-[#86a77d] list-disc list-inside">
            {isPending ? (
              <>
                <li>Your request has been recorded and submitted to the Owner Console.</li>
                <li>Once the Store Owner reviews and verifies your account, you will have immediate operational access.</li>
                <li>You can click "Check Approval Status" at any time to verify if your account has been approved.</li>
              </>
            ) : (
              <>
                <li>Operational systems are strictly reserved for Owner-authorized managers and kitchen crew.</li>
                <li>Customer accounts cannot access store operational telemetry or kitchen dispatch.</li>
                <li>If you are an authorized manager, please contact the Store Owner to provision your account in the Owner Console.</li>
              </>
            )}
          </ul>
        </div>

        <div className="space-y-2 pt-2">
          <button
            onClick={() => {
              clearRestricted();
              initAuth();
            }}
            className="w-full py-3 px-4 rounded-xl bg-[#57854d] hover:bg-[#689f5c] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#57854d]/20 active:scale-[0.99]"
          >
            <RefreshCw className="w-4 h-4" />
            <span>{isPending ? 'Check Approval Status' : 'Retry Authorization Handshake'}</span>
          </button>

          <button
            onClick={handleLogout}
            className="w-full py-3 px-4 rounded-xl bg-[#141d16] hover:bg-[#1a261d] text-[#e8eee9] border border-[#253629] font-semibold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
          >
            <LogOut className="w-4 h-4 text-red-400" />
            <span>Sign In with Different Account</span>
          </button>
        </div>
      </div>
    </div>
  );
};
