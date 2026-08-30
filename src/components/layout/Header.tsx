import React from 'react';
import { 
  Menu, 
  MapPin, 
  ChevronDown, 
  Radio, 
  LogOut,
  User,
  ArrowLeft,
  ShieldCheck
} from 'lucide-react';
import { useManagerStore } from '../../store/managerStore';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  const { 
    activeBranchId, 
    activeBranchName,
    setActiveBranch, 
    managerProfile, 
    userRole,
    logout 
  } = useManagerStore();

  const branches = [
    { id: 'main_branch', name: 'Olive Pizza — Rajnandgaon (Main)' },
    { id: 'durg_branch', name: 'Olive Pizza — Durg (Branch 2)' },
    { id: 'bhilai_branch', name: 'Olive Pizza — Bhilai (Branch 3)' },
    { id: 'raipur_branch', name: 'Olive Pizza — Raipur (Branch 4)' },
  ];

  const isGlobalOwner = userRole === 'owner' || 
    managerProfile?.email === 'olivepizzarjn@gmail.com' || 
    managerProfile?.email === 'webhub2811@gmail.com';

  return (
    <header className="sticky top-0 z-30 bg-[#0d120f]/90 backdrop-blur-md border-b border-[#26332a] px-4 sm:px-6 py-3.5 flex items-center justify-between">
      {/* Left: Mobile Toggle & Branch Scope */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-xl text-[#a4c29c] hover:text-white bg-[#141b16] border border-[#26332a]"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Global Owner Switcher vs Fixed Branch Badge */}
        {isGlobalOwner ? (
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#141b16] border border-[#57854d]/50 text-xs">
                <ShieldCheck className="w-3.5 h-3.5 text-[#c6a052] shrink-0" />
                <span className="text-[11px] font-bold text-[#c6a052] hidden sm:inline">Current Restaurant:</span>
                <select
                  value={activeBranchId}
                  onChange={(e) => {
                    const b = branches.find(br => br.id === e.target.value);
                    setActiveBranch(e.target.value, b?.name);
                  }}
                  className="bg-transparent text-white font-bold focus:outline-none cursor-pointer pr-1"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id} className="bg-[#141b16] text-white">
                      {b.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-[#7ba372] pointer-events-none" />
              </div>
            </div>

            <a
              href="http://localhost:5174/franchises"
              className="hidden md:flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#1b241e] hover:bg-[#26332a] border border-[#26332a] text-[11px] text-[#a4c29c] hover:text-white font-bold transition-colors"
            >
              <ArrowLeft className="w-3 h-3" />
              <span>Back to Owner</span>
            </a>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#141b16] border border-[#26332a] text-xs">
            <MapPin className="w-3.5 h-3.5 text-[#7ba372] shrink-0" />
            <span className="text-white font-bold">{activeBranchName || 'Assigned Branch'}</span>
          </div>
        )}
      </div>

      {/* Right: Live Sync Pulse & Profile */}
      <div className="flex items-center gap-3">
        {/* Real-time sync badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#10b981]/10 border border-[#10b981]/20 text-[11px] text-[#10b981] font-semibold">
          <Radio className="w-3.5 h-3.5 animate-pulse" />
          <span>Realtime Stream Active</span>
        </div>

        {/* User badge */}
        <div className="flex items-center gap-2 pl-2 border-l border-[#26332a]">
          <div className="w-8 h-8 rounded-full bg-[#57854d]/20 border border-[#57854d]/40 text-[#c6a052] flex items-center justify-center font-bold text-xs">
            <User className="w-4 h-4" />
          </div>

          <div className="hidden md:block text-left text-xs">
            <strong className="text-white block font-bold leading-tight">
              {managerProfile?.name || 'Manager'}
            </strong>
            <span className="text-[10px] text-[#7ba372] block leading-none capitalize">
              {isGlobalOwner ? 'Global Owner' : (managerProfile?.role?.replace(/_/g, ' ') || 'Restaurant Manager')}
            </span>
          </div>

          <button
            onClick={() => logout()}
            title="Sign Out"
            className="p-2 rounded-xl text-[#7ba372] hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-colors ml-1"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
