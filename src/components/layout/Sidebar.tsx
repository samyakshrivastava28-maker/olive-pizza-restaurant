import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  Boxes,
  LayoutDashboard, 
  Flame, 
  History, 
  Bell, 
  Mail, 
  Bike, 
  Pizza, 
  LogOut,
  X,
  ShieldCheck
} from 'lucide-react';
import { useManagerStore } from '../../store/managerStore';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { logout, managerProfile, liveOrders, riders } = useManagerStore();

  const navItems = [
    { 
      label: 'Dashboard', 
      path: '/dashboard', 
      icon: LayoutDashboard 
    },
    { 
      label: 'Live Orders', 
      path: '/live-orders', 
      icon: Flame, 
      badge: (liveOrders || []).length > 0 ? (liveOrders || []).length : undefined,
      badgeColor: 'bg-amber-500 text-black'
    },
    { 
      label: 'Order History', 
      path: '/order-history', 
      icon: History 
    },
    { 
      label: 'Menu & Customizations', 
      path: '/menu', 
      icon: Pizza 
    },
    { 
      label: 'Kitchen Inventory', 
      path: '/inventory', 
      icon: Boxes 
    },
    { 
      label: 'Notifications', 
      path: '/notifications', 
      icon: Bell 
    },
    { 
      label: 'Email', 
      path: '/email', 
      icon: Mail 
    },
    { 
      label: 'Delivery Management', 
      path: '/delivery', 
      icon: Bike,
      badge: (riders || []).filter(r => r?.isOnline).length > 0 ? `${(riders || []).filter(r => r?.isOnline).length} ON` : undefined,
      badgeColor: 'bg-[#10b981]/20 text-[#10b981]'
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          onClick={onClose} 
          className="fixed inset-0 bg-black/70 backdrop-blur-xs z-40 lg:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#0d120f] border-r border-[#26332a] flex flex-col justify-between transition-transform duration-200 lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Brand Header */}
        <div>
          <div className="p-5 border-b border-[#26332a] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#57854d] to-[#2c4327] border border-[#7ba372]/40 flex items-center justify-center shadow-lg">
                <Pizza className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-extrabold text-white tracking-tight leading-none">OLIVE PIZZA</h1>
                <span className="text-[10px] font-bold text-[#c6a052] tracking-wider uppercase block mt-1">
                  RESTAURANT MANAGER
                </span>
              </div>
            </div>

            <button 
              onClick={onClose} 
              className="lg:hidden p-1.5 rounded-lg text-[#7ba372] hover:text-white hover:bg-[#141b16]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Items */}
          <nav className="p-3 space-y-1.5 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-[#57854d] text-white shadow-lg shadow-green-950/40'
                      : 'text-[#a4c29c] hover:text-white hover:bg-[#141b16]'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </div>

                {item.badge !== undefined && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold ${item.badgeColor}`}>
                    {item.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Footer / Account */}
        <div className="p-4 border-t border-[#26332a] space-y-3">
          <div className="flex items-center gap-2.5 p-2 rounded-xl bg-[#141b16] border border-[#26332a]/60 text-xs">
            <div className="w-8 h-8 rounded-lg bg-[#57854d]/20 border border-[#57854d]/40 flex items-center justify-center text-[#c6a052] font-bold shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <strong className="text-white block font-bold truncate">
                {managerProfile?.name || 'Restaurant Manager'}
              </strong>
              <span className="text-[10px] text-[#7ba372] block truncate">
                {managerProfile?.email || 'manager@olivepizza.in'}
              </span>
            </div>
          </div>

          <button
            onClick={() => logout()}
            className="w-full py-2 rounded-xl text-xs font-bold text-red-400 hover:text-white hover:bg-red-500/20 border border-red-500/20 flex items-center justify-center gap-2 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>
    </>
  );
};
