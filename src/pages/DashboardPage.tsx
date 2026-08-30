import React from 'react';
import { 
  ShoppingBag, 
  CheckCircle2, 
  XCircle, 
  IndianRupee, 
  Clock, 
  ChefHat, 
  BellRing, 
  Truck, 
  Bike, 
  Activity,
  ArrowRight,
  TrendingUp,
  Flame
} from 'lucide-react';
import { useManagerStore } from '../store/managerStore';
import { Link } from 'react-router-dom';

export const DashboardPage: React.FC = () => {
  const { 
    activeBranchName, 
    liveOrders, 
    riders, 
    getDashboardStats 
  } = useManagerStore();

  const stats = getDashboardStats();

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-[#141b16] via-[#18221b] to-[#141b16] border border-[#26332a] shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-[#c6a052]/15 text-[#c6a052] border border-[#c6a052]/30">
                {activeBranchName}
              </span>
              <span className="text-xs text-[#a4c29c] flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
                Live Operational Telemetry
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">Shift Operations Dashboard</h1>
            <p className="text-xs text-[#a4c29c] mt-0.5">
              Real-time summary of today's running orders, kitchen workload, and active delivery partners.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/live-orders"
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#57854d] hover:bg-[#426939] shadow-lg shadow-green-950/40 transition-all flex items-center gap-2"
            >
              <Flame className="w-4 h-4 text-[#c6a052]" />
              <span>Live Orders ({liveOrders.length})</span>
            </Link>
          </div>
        </div>
      </div>

      {/* TODAY'S SUMMARY KPI CARDS */}
      <div>
        <h2 className="text-xs font-bold tracking-wider uppercase text-[#7ba372] mb-3 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-[#c6a052]" /> Today's Cumulative Metrics
        </h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Today's Total Orders */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#141b16] border border-[#26332a] shadow-md">
            <div className="flex items-center justify-between text-xs text-[#a4c29c] mb-2">
              <span className="font-semibold">Today's Orders</span>
              <div className="p-2 rounded-xl bg-[#57854d]/20 text-[#57854d]">
                <ShoppingBag className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
              {stats.todayOrdersCount}
            </div>
            <span className="text-[11px] text-[#7ba372] mt-1 block">Total orders initiated</span>
          </div>

          {/* Card 2: Completed Orders */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#141b16] border border-[#26332a] shadow-md">
            <div className="flex items-center justify-between text-xs text-[#a4c29c] mb-2">
              <span className="font-semibold">Completed</span>
              <div className="p-2 rounded-xl bg-[#10b981]/20 text-[#10b981]">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#10b981] font-mono">
              {stats.todayCompletedCount}
            </div>
            <span className="text-[11px] text-[#7ba372] mt-1 block">Successfully delivered</span>
          </div>

          {/* Card 3: Cancelled / Rejected */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#141b16] border border-[#26332a] shadow-md">
            <div className="flex items-center justify-between text-xs text-[#a4c29c] mb-2">
              <span className="font-semibold">Cancelled</span>
              <div className="p-2 rounded-xl bg-red-500/20 text-red-400">
                <XCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-red-400 font-mono">
              {stats.todayCancelledCount}
            </div>
            <span className="text-[11px] text-[#7ba372] mt-1 block">Cancelled or rejected</span>
          </div>

          {/* Card 4: Today's Revenue */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#141b16] border border-[#26332a] shadow-md">
            <div className="flex items-center justify-between text-xs text-[#a4c29c] mb-2">
              <span className="font-semibold">Today's Revenue</span>
              <div className="p-2 rounded-xl bg-[#c6a052]/20 text-[#c6a052]">
                <IndianRupee className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#c6a052] font-mono">
              ₹{stats.todayRevenue.toFixed(0)}
            </div>
            <span className="text-[11px] text-[#7ba372] mt-1 block">Delivered order value</span>
          </div>
        </div>
      </div>

      {/* LIVE ORDER WORKFLOW STATUS PILLARS */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold tracking-wider uppercase text-[#7ba372] flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-400" /> Live Kitchen & Order Pipeline
          </h2>
          <Link to="/live-orders" className="text-xs font-bold text-[#c6a052] hover:underline flex items-center gap-1">
            View Live Orders <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Pending Acceptance */}
          <div className="p-4 rounded-2xl bg-[#141b16] border border-[#26332a] hover:border-amber-500/40 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Pending</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-3xl font-black text-white font-mono">{stats.pendingCount}</div>
            <p className="text-[11px] text-[#a4c29c] mt-1">Awaiting kitchen confirmation</p>
          </div>

          {/* Preparing / In Kitchen */}
          <div className="p-4 rounded-2xl bg-[#141b16] border border-[#26332a] hover:border-[#57854d]/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#57854d] uppercase tracking-wider">Preparing</span>
              <ChefHat className="w-4 h-4 text-[#57854d]" />
            </div>
            <div className="text-3xl font-black text-white font-mono">{stats.preparingCount}</div>
            <p className="text-[11px] text-[#a4c29c] mt-1">Cooking on pizza line</p>
          </div>

          {/* Ready for Pickup / Dispatch */}
          <div className="p-4 rounded-2xl bg-[#141b16] border border-[#26332a] hover:border-[#c6a052]/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#c6a052] uppercase tracking-wider">Ready</span>
              <BellRing className="w-4 h-4 text-[#c6a052]" />
            </div>
            <div className="text-3xl font-black text-white font-mono">{stats.readyCount}</div>
            <p className="text-[11px] text-[#a4c29c] mt-1">Packed at dispatch counter</p>
          </div>

          {/* Out for Delivery */}
          <div className="p-4 rounded-2xl bg-[#141b16] border border-[#26332a] hover:border-[#10b981]/50 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#10b981] uppercase tracking-wider">Out for Delivery</span>
              <Truck className="w-4 h-4 text-[#10b981]" />
            </div>
            <div className="text-3xl font-black text-white font-mono">{stats.outForDeliveryCount}</div>
            <p className="text-[11px] text-[#a4c29c] mt-1">En route with delivery rider</p>
          </div>
        </div>
      </div>

      {/* SPLIT SECTION: DELIVERY FLEET & ACTIVE CHANNELS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Delivery Fleet Status */}
        <div className="p-6 rounded-2xl bg-[#141b16] border border-[#26332a] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#26332a]">
            <div className="flex items-center gap-2">
              <Bike className="w-5 h-5 text-[#c6a052]" />
              <h2 className="text-sm font-bold text-white">Delivery Fleet Telemetry</h2>
            </div>
            <Link to="/delivery" className="text-xs font-bold text-[#c6a052] hover:underline">
              Live Map & Riders
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3.5 rounded-xl bg-[#0d120f] border border-[#26332a]">
              <span className="text-[11px] text-[#a4c29c] block font-semibold">Online Riders</span>
              <span className="text-xl font-bold text-[#10b981] font-mono">{stats.onlineRidersCount}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#0d120f] border border-[#26332a]">
              <span className="text-[11px] text-[#a4c29c] block font-semibold">Available</span>
              <span className="text-xl font-bold text-[#c6a052] font-mono">{stats.availableRidersCount}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-[#0d120f] border border-[#26332a]">
              <span className="text-[11px] text-[#a4c29c] block font-semibold">Active Trips</span>
              <span className="text-xl font-bold text-white font-mono">{stats.activeDeliveriesCount}</span>
            </div>
          </div>

          {/* Quick Rider Roster preview */}
          <div className="space-y-2 pt-1">
            <span className="text-xs font-semibold text-[#a4c29c] block">Live Rider Roster:</span>
            {riders.length > 0 ? (
              riders.slice(0, 3).map((r) => (
                <div key={r.id} className="p-3 rounded-xl bg-[#0d120f] border border-[#26332a] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2.5 h-2.5 rounded-full ${r.isOnline ? 'bg-[#10b981]' : 'bg-slate-600'}`} />
                    <div>
                      <strong className="text-white block font-semibold">{r.name}</strong>
                      <span className="text-[10px] text-[#7ba372]">{r.phone || 'Active'}</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                    r.status === 'available' 
                      ? 'bg-[#10b981]/15 text-[#10b981]' 
                      : r.status === 'busy' 
                      ? 'bg-amber-500/15 text-amber-400' 
                      : 'bg-[#141b16] text-slate-500'
                  }`}>
                    {r.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-[#7ba372] italic p-3 rounded-xl bg-[#0d120f] border border-[#26332a]/50">
                No active delivery riders currently assigned to {activeBranchName}.
              </p>
            )}
          </div>
        </div>

        {/* Active Fulfillment Breakdown */}
        <div className="p-6 rounded-2xl bg-[#141b16] border border-[#26332a] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#26332a]">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#c6a052]" />
              <h2 className="text-sm font-bold text-white">Live Channel Volume</h2>
            </div>
            <span className="text-xs text-[#7ba372] font-mono">{liveOrders.length} Running</span>
          </div>

          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-xl bg-[#0d120f] border border-[#26332a] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Truck className="w-4 h-4 text-[#10b981]" />
                <div>
                  <span className="text-white font-bold block">Delivery Orders</span>
                  <span className="text-[10px] text-[#a4c29c]">Doorstep delivery</span>
                </div>
              </div>
              <span className="text-base font-black text-white font-mono">{stats.deliveryOrdersCount}</span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0d120f] border border-[#26332a] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-4 h-4 text-[#c6a052]" />
                <div>
                  <span className="text-white font-bold block">Takeaway Orders</span>
                  <span className="text-[10px] text-[#a4c29c]">Self counter collection</span>
                </div>
              </div>
              <span className="text-base font-black text-white font-mono">{stats.takeawayOrdersCount}</span>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0d120f] border border-[#26332a] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <ChefHat className="w-4 h-4 text-[#57854d]" />
                <div>
                  <span className="text-white font-bold block">Dine-In Table Orders</span>
                  <span className="text-[10px] text-[#a4c29c]">Table QR code orders</span>
                </div>
              </div>
              <span className="text-base font-black text-white font-mono">{stats.dineInOrdersCount}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
